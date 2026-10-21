import { z } from 'zod';
import { id, text, date } from '../validation/schemas.js';

const version = z.number().int().nonnegative();
const negativeEntry = z.object({
  vendor_id: id,
  amount: z
    .number()
    .finite()
    .min(0)
    .max(9999999999.99)
    .refine(
      (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001,
      'Use at most two decimal places',
    )
    .nullable(),
  note: z.string().max(250).optional().default(''),
});

const dateRange = z
  .object({ from: date, to: date })
  .refine(
    (r) => r.from <= r.to && (Date.parse(r.to) - Date.parse(r.from)) / 86400000 <= 366,
    'Choose a range of at most 366 days',
  );

export function summarizeNegative(report) {
  const vendors = (report.config.vendors || []).map((v) => {
    const entry = (report.entries || []).find((e) => e.vendor_id === v.id);
    const amount = entry && entry.amount !== null && !Number.isNaN(Number(entry.amount)) ? Number(entry.amount) : 0;
    const note = entry?.note || '';
    return {
      id: v.id,
      name: v.name,
      amount,
      total: amount,
      note,
    };
  });
  const total = vendors.reduce((acc, v) => acc + v.amount, 0);
  const withDeductions = vendors.filter((v) => v.amount > 0);
  const topVendor = withDeductions.length
    ? [...withDeductions].sort((a, b) => b.amount - a.amount)[0]
    : null;

  return {
    ...report,
    summary: {
      total,
      vendors,
      activeCount: vendors.length,
      negativeCount: withDeductions.length,
      topVendor,
    },
  };
}

const selectReports =
  "SELECT id,name,to_char(report_date,'YYYY-MM-DD') AS report_date,config,entries,version,created_by,created_at,updated_at FROM voip.vendor_negative_reports";

export function registerVendorNegative(app, db) {
  // Standing / Fixed Vendor Negative sheet endpoints (permanent, not day-wise)
  app.get('/api/vendor-negative/sheet', async (req, res) => {
    let report = (
      await db.query(
        `SELECT vr.id,vr.name,to_char(vr.report_date,'YYYY-MM-DD') AS report_date,vr.config,vr.entries,vr.version,vr.created_by,u.name AS creator_name,vr.created_at,vr.updated_at 
         FROM voip.vendor_negative_reports vr 
         LEFT JOIN voip.users u ON vr.created_by=u.id 
         ORDER BY vr.id DESC LIMIT 1`
      )
    ).rows[0];

    const activeVendors = (
      await db.query('SELECT id,name FROM voip.vendors WHERE deleted_at IS NULL ORDER BY id')
    ).rows;

    if (!report) {
      const created = (
        await db.query(
          'INSERT INTO voip.vendor_negative_reports(name,report_date,config,entries,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [
            'Vendor negative adjustments',
            '2026-01-01',
            JSON.stringify({ vendors: activeVendors, removedVendors: [] }),
            JSON.stringify([]),
            req.user.id,
          ],
        )
      ).rows[0];

      report = (
        await db.query(
          `SELECT vr.id,vr.name,to_char(vr.report_date,'YYYY-MM-DD') AS report_date,vr.config,vr.entries,vr.version,vr.created_by,u.name AS creator_name,vr.created_at,vr.updated_at 
           FROM voip.vendor_negative_reports vr 
           LEFT JOIN voip.users u ON vr.created_by=u.id 
           WHERE vr.id=$1`,
          [created.id],
        )
      ).rows[0];
    } else {
      // Synchronize any newly added active vendors into config.vendors
      const config = report.config || { vendors: [], removedVendors: [] };
      const knownIds = new Set([
        ...(config.vendors || []).map((v) => v.id),
        ...(config.removedVendors || []).map((v) => v.row?.id || v.id),
      ]);
      const missingVendors = activeVendors.filter((v) => !knownIds.has(v.id));
      if (missingVendors.length > 0) {
        config.vendors = [...(config.vendors || []), ...missingVendors];
        await db.query(
          'UPDATE voip.vendor_negative_reports SET config=$1,updated_at=now() WHERE id=$2',
          [JSON.stringify(config), report.id],
        );
        report.config = config;
      }
    }

    res.json(summarizeNegative(report));
  });

  app.put('/api/vendor-negative/sheet', async (req, res) => {
    const data = z
      .object({
        version,
        entries: z.array(negativeEntry),
      })
      .parse(req.body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const report = (
        await client.query(
          'SELECT * FROM voip.vendor_negative_reports ORDER BY id DESC LIMIT 1 FOR UPDATE',
        )
      ).rows[0];

      if (!report) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Vendor negative sheet not found.' });
      }

      if (report.version !== data.version) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Report changed. Reload before saving; your unsaved values are still visible.',
        });
      }

      const values = new Map((report.entries || []).map((e) => [e.vendor_id, e]));
      for (const e of data.entries) {
        if (e.amount === null || (e.amount === 0 && !e.note)) {
          values.delete(e.vendor_id);
        } else {
          values.set(e.vendor_id, {
            vendor_id: e.vendor_id,
            amount: Math.round(Number(e.amount) * 100) / 100,
            note: e.note || '',
          });
        }
      }
      const updatedEntries = [...values.values()];

      await client.query(
        'UPDATE voip.vendor_negative_reports SET entries=$1,version=version+1,updated_at=now() WHERE id=$2',
        [JSON.stringify(updatedEntries), report.id],
      );
      await client.query('COMMIT');

      const updated = (
        await db.query(
          `SELECT vr.id,vr.name,to_char(vr.report_date,'YYYY-MM-DD') AS report_date,vr.config,vr.entries,vr.version,vr.created_by,u.name AS creator_name,vr.created_at,vr.updated_at 
           FROM voip.vendor_negative_reports vr 
           LEFT JOIN voip.users u ON vr.created_by=u.id 
           WHERE vr.id=$1`,
          [report.id],
        )
      ).rows[0];

      res.json(summarizeNegative(updated));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.get('/api/vendor-negative-reports', async (req, res) => {
    const range = dateRange.parse(req.query);
    const allowOther =
      req.user.role === 'super_admin' &&
      (req.query.adminView === 'true' || req.query.all === 'true');
    const targetUserId =
      req.query.userId && req.user.role === 'super_admin' && req.query.userId !== 'all'
        ? Number(req.query.userId)
        : null;

    let query, params;
    if (allowOther) {
      if (targetUserId) {
        query = `SELECT vr.id,vr.name,to_char(vr.report_date,'YYYY-MM-DD') AS report_date,vr.config,vr.entries,vr.version,vr.created_by,u.name AS creator_name,vr.created_at,vr.updated_at FROM voip.vendor_negative_reports vr LEFT JOIN voip.users u ON vr.created_by=u.id WHERE vr.report_date BETWEEN $1 AND $2 AND vr.created_by=$3 ORDER BY vr.report_date DESC,vr.id DESC`;
        params = [range.from, range.to, targetUserId];
      } else {
        query = `SELECT vr.id,vr.name,to_char(vr.report_date,'YYYY-MM-DD') AS report_date,vr.config,vr.entries,vr.version,vr.created_by,u.name AS creator_name,vr.created_at,vr.updated_at FROM voip.vendor_negative_reports vr LEFT JOIN voip.users u ON vr.created_by=u.id WHERE vr.report_date BETWEEN $1 AND $2 ORDER BY vr.report_date DESC,vr.id DESC`;
        params = [range.from, range.to];
      }
    } else {
      query = `${selectReports} WHERE report_date BETWEEN $1 AND $2 AND created_by=$3 ORDER BY report_date DESC,id DESC`;
      params = [range.from, range.to, req.user.id];
    }

    const rows = (await db.query(query, params)).rows;
    res.json(rows.map(summarizeNegative));
  });

  app.get('/api/vendor-negative-reports/:id', async (req, res) => {
    const allowOther =
      req.user.role === 'super_admin' &&
      (req.query.adminView === 'true' || req.query.all === 'true');
    const report = (
      await db.query(
        allowOther
          ? `SELECT vr.id,vr.name,to_char(vr.report_date,'YYYY-MM-DD') AS report_date,vr.config,vr.entries,vr.version,vr.created_by,u.name AS creator_name,vr.created_at,vr.updated_at FROM voip.vendor_negative_reports vr LEFT JOIN voip.users u ON vr.created_by=u.id WHERE vr.id=$1`
          : `${selectReports} WHERE id=$1 AND created_by=$2`,
        allowOther ? [id.parse(req.params.id)] : [id.parse(req.params.id), req.user.id],
      )
    ).rows[0];

    if (!report) return res.status(404).json({ error: 'Vendor negative report not found.' });
    res.json({ ...summarizeNegative(report), creator_name: report.creator_name });
  });

  app.post('/api/vendor-negative-reports', async (req, res) => {
    const data = z
      .object({
        name: text,
        report_date: date,
        vendor_ids: z.array(id).optional(),
      })
      .parse(req.body);

    let vendors;
    if (data.vendor_ids && data.vendor_ids.length > 0) {
      vendors = (
        await db.query(
          'SELECT id,name FROM voip.vendors WHERE id=ANY($1::int[]) AND deleted_at IS NULL ORDER BY id',
          [data.vendor_ids],
        )
      ).rows;
    } else {
      vendors = (
        await db.query('SELECT id,name FROM voip.vendors WHERE deleted_at IS NULL ORDER BY id')
      ).rows;
    }

    const report = (
      await db.query(
        'INSERT INTO voip.vendor_negative_reports(name,report_date,config,created_by) VALUES($1,$2,$3,$4) RETURNING id',
        [
          data.name,
          data.report_date,
          JSON.stringify({
            vendors,
            removedVendors: [],
          }),
          req.user.id,
        ],
      )
    ).rows[0];

    res.status(201).json(report);
  });

  async function update(req, res, data, mutate) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const allowOther = req.user.role === 'super_admin' || req.user.role === 'admin';
      const report = (
        await client.query(
          allowOther
            ? `SELECT * FROM voip.vendor_negative_reports WHERE id=$1 FOR UPDATE`
            : `SELECT * FROM voip.vendor_negative_reports WHERE id=$1 AND created_by=$2 FOR UPDATE`,
          allowOther ? [id.parse(req.params.id)] : [id.parse(req.params.id), req.user.id],
        )
      ).rows[0];

      const reject = async (status, error) => {
        await client.query('ROLLBACK');
        return res.status(status).json({ error });
      };

      if (!report) return await reject(404, 'Vendor negative report not found.');
      if (report.version !== data.version)
        return await reject(
          409,
          'Report changed. Reload before saving; your unsaved values are still visible.',
        );

      const result = await mutate(report, client);
      if (result.error) return await reject(400, result.error);

      await client.query(
        'UPDATE voip.vendor_negative_reports SET config=$1,entries=$2,version=version+1,updated_at=now() WHERE id=$3',
        [JSON.stringify(report.config), JSON.stringify(report.entries), report.id],
      );

      await client.query('COMMIT');
      res.json({ version: report.version + 1 });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  app.put('/api/vendor-negative-reports/:id/entries', async (req, res) => {
    const data = z
      .object({ version, entries: z.array(negativeEntry).min(1).max(1000) })
      .parse(req.body);

    await update(req, res, data, async (report) => {
      const ids = new Set(report.config.vendors.map((v) => v.id));
      if (data.entries.some((e) => !ids.has(e.vendor_id)))
        return { error: 'Invalid vendor entries.' };

      const values = new Map((report.entries || []).map((e) => [e.vendor_id, e]));
      for (const e of data.entries) {
        if (e.amount === null || (e.amount === 0 && !e.note)) {
          values.delete(e.vendor_id);
        } else {
          values.set(e.vendor_id, e);
        }
      }
      report.entries = [...values.values()];
      return { action: 'Vendor negative entries saved' };
    });
  });

  app.patch('/api/vendor-negative-reports/:id/rows/:vendorId', async (req, res) => {
    const vendorId = id.parse(req.params.vendorId);
    const data = z
      .object({
        version,
        action: z.enum(['add', 'rename', 'remove', 'restore', 'clear']),
        name: text.optional(),
      })
      .refine((d) => d.action !== 'rename' || d.name, 'Name is required')
      .parse(req.body);

    await update(req, res, data, async (report, client) => {
      const row = report.config.vendors.find((v) => v.id === vendorId);
      const removed = report.config.removedVendors || [];

      if (['add', 'restore'].includes(data.action)) {
        if (row || report.config.vendors.length >= 100)
          return { error: 'Row already active or limit reached.' };
        const restored = removed.find((v) => v.row.id === vendorId);
        let name = restored?.row.name;
        if (!name) {
          const v = (
            await client.query('SELECT name FROM voip.vendors WHERE id=$1 AND deleted_at IS NULL', [
              vendorId,
            ])
          ).rows[0];
          if (!v) return { error: 'Active vendor not found in directory.' };
          name = v.name;
        }
        report.config.vendors.push({ id: vendorId, name });
        report.config.vendors.sort((a, b) => a.id - b.id);
        report.config.removedVendors = removed.filter((v) => v.row.id !== vendorId);
        if (restored) report.entries.push(...restored.entries);
        return { action: 'Vendor row added' };
      }

      if (!row) return { error: 'Vendor row not found.' };

      if (data.action === 'rename') {
        row.name = data.name;
        return { action: 'Vendor row renamed' };
      }

      if (data.action === 'clear') {
        report.entries = report.entries.filter((e) => e.vendor_id !== vendorId);
        return { action: 'Vendor row cleared' };
      }

      if (data.action === 'remove') {
        if (report.config.vendors.length <= 1)
          return { error: 'Keep at least one vendor row.' };
        const saved = report.entries.filter((e) => e.vendor_id === vendorId);
        report.config.removedVendors = [
          ...removed.filter((v) => v.row.id !== vendorId),
          { row, entries: saved },
        ];
        report.config.vendors = report.config.vendors.filter((v) => v.id !== vendorId);
        report.entries = report.entries.filter((e) => e.vendor_id !== vendorId);
        return { action: 'Vendor row removed' };
      }

      return { error: 'Unsupported action.' };
    });
  });
}
