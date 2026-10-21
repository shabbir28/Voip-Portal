import { z } from 'zod';
import { id, text, date } from '../validation/schemas.js';
import { REPORT_TIMEZONE } from '../../shared/time.js';
import { vendorSlots, summarizeVendors } from '../../shared/vendors.js';
const version = z.number().int().nonnegative();
const entry = z.object({
  vendor_id: id,
  slot: z.number().int().min(0).max(9),
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
});
const dateRange = z
  .object({ from: date, to: date })
  .refine(
    (r) => r.from <= r.to && (Date.parse(r.to) - Date.parse(r.from)) / 86400000 <= 366,
    'Choose a range of at most 366 days',
  );
const output = (report) => ({ ...report, summary: summarizeVendors(report) });
const selectReports =
  "SELECT id,name,to_char(report_date,'YYYY-MM-DD') AS report_date,config,entries,version,created_by,created_at,updated_at FROM voip.vendor_reports";
export function registerVendors(app, db) {
  app.get('/api/vendors', async (req, res) =>
    res.json(
      (
        await db.query('SELECT * FROM voip.vendors WHERE ($1 OR deleted_at IS NULL) ORDER BY id', [
          req.query.includeDeleted === 'true',
        ])
      ).rows,
    ),
  );
  app.post('/api/vendors', async (req, res) => {
    const data = z.object({ name: text }).parse(req.body);
    res
      .status(201)
      .json(
        (await db.query('INSERT INTO voip.vendors(name) VALUES($1) RETURNING *', [data.name]))
          .rows[0],
      );
  });
  app.patch('/api/vendors/:id', async (req, res) => {
    const data = z.object({ name: text }).parse(req.body);
    const result = await db.query(
      'UPDATE voip.vendors SET name=$1 WHERE id=$2 AND deleted_at IS NULL RETURNING *',
      [data.name, id.parse(req.params.id)],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Active vendor not found.' });
    res.json(result.rows[0]);
  });
  app.delete('/api/vendors/:id', async (req, res) => {
    const result = await db.query(
      'UPDATE voip.vendors SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id',
      [id.parse(req.params.id)],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Vendor not found.' });
    res.json({ ok: true });
  });
  app.post('/api/vendors/:id/restore', async (req, res) => {
    const result = await db.query(
      'UPDATE voip.vendors SET deleted_at=NULL WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id',
      [id.parse(req.params.id)],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Deleted vendor not found.' });
    res.json({ ok: true });
  });
  app.get('/api/vendor-reports', async (req, res) => {
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
        query = `SELECT vr.id,vr.name,to_char(vr.report_date,'YYYY-MM-DD') AS report_date,vr.config,vr.entries,vr.version,vr.created_by,u.name AS creator_name,vr.created_at,vr.updated_at FROM voip.vendor_reports vr LEFT JOIN voip.users u ON vr.created_by=u.id WHERE vr.report_date BETWEEN $1 AND $2 AND vr.created_by=$3 ORDER BY vr.report_date DESC,vr.id DESC`;
        params = [range.from, range.to, targetUserId];
      } else {
        query = `SELECT vr.id,vr.name,to_char(vr.report_date,'YYYY-MM-DD') AS report_date,vr.config,vr.entries,vr.version,vr.created_by,u.name AS creator_name,vr.created_at,vr.updated_at FROM voip.vendor_reports vr LEFT JOIN voip.users u ON vr.created_by=u.id WHERE vr.report_date BETWEEN $1 AND $2 ORDER BY vr.report_date DESC,vr.id DESC`;
        params = [range.from, range.to];
      }
    } else {
      query = `${selectReports} WHERE report_date BETWEEN $1 AND $2 AND created_by=$3 ORDER BY report_date DESC,id DESC`;
      params = [range.from, range.to, req.user.id];
    }
    res.json((await db.query(query, params)).rows.map(output));
  });
  app.get('/api/vendor-reports/all', async (req, res) => {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied. Super admin required.' });
    }
    const range = dateRange.parse(req.query);
    res.json(
      (
        await db.query(
          `SELECT vr.id,vr.name,to_char(vr.report_date,'YYYY-MM-DD') AS report_date,vr.config,vr.entries,vr.version,vr.created_by,u.name AS creator_name,vr.created_at,vr.updated_at FROM voip.vendor_reports vr LEFT JOIN voip.users u ON vr.created_by=u.id WHERE vr.report_date BETWEEN $1 AND $2 ORDER BY vr.report_date DESC,vr.id DESC`,
          [range.from, range.to],
        )
      ).rows.map(output),
    );
  });
  app.get('/api/vendor-reports/:id', async (req, res) => {
    const allowOther =
      req.user.role === 'super_admin' &&
      (req.query.adminView === 'true' || req.query.all === 'true');
    const report = (
      await db.query(
        allowOther
          ? `SELECT vr.id,vr.name,to_char(vr.report_date,'YYYY-MM-DD') AS report_date,vr.config,vr.entries,vr.version,vr.created_by,u.name AS creator_name,vr.created_at,vr.updated_at FROM voip.vendor_reports vr LEFT JOIN voip.users u ON vr.created_by=u.id WHERE vr.id=$1`
          : `${selectReports} WHERE id=$1 AND created_by=$2`,
        allowOther ? [id.parse(req.params.id)] : [id.parse(req.params.id), req.user.id],
      )
    ).rows[0];
    if (!report) return res.status(404).json({ error: 'Vendor report not found.' });
    const activity =
      req.user.role === 'super_admin'
        ? (
            await db.query(
              'SELECT a.*,u.name AS user_name FROM voip.vendor_audit a JOIN voip.users u ON u.id=a.user_id WHERE report_id=$1 ORDER BY a.id DESC LIMIT 30',
              [report.id],
            )
          ).rows
        : undefined;
    res.json({ ...output(report), activity, creator_name: report.creator_name });
  });
  app.post('/api/vendor-reports', async (req, res) => {
    const data = z
      .object({
        name: text,
        report_date: date,
        vendor_ids: z
          .array(id)
          .min(1)
          .max(100)
          .refine((ids) => new Set(ids).size === ids.length, 'Duplicate vendors'),
      })
      .parse(req.body);
    const vendors = (
      await db.query(
        'SELECT id,name FROM voip.vendors WHERE id=ANY($1::int[]) AND deleted_at IS NULL ORDER BY id',
        [data.vendor_ids],
      )
    ).rows;
    if (vendors.length !== data.vendor_ids.length)
      return res.status(400).json({ error: 'Choose active vendors.' });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const report = (
        await client.query(
          'INSERT INTO voip.vendor_reports(name,report_date,config,created_by) VALUES($1,$2,$3,$4) RETURNING id',
          [
            data.name,
            data.report_date,
            JSON.stringify({
              vendors,
              slots: vendorSlots(),
              timezone: REPORT_TIMEZONE,
              removedVendors: [],
            }),
            req.user.id,
          ],
        )
      ).rows[0];
      await client.query(
        'INSERT INTO voip.vendor_audit(report_id,user_id,action,detail) VALUES($1,$2,$3,$4)',
        [report.id, req.user.id, 'Vendor report created', JSON.stringify({ name: data.name })],
      );
      await client.query('COMMIT');
      res.status(201).json(report);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
  async function update(req, res, data, mutate) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const report = (
        await client.query(`${selectReports} WHERE id=$1 AND created_by=$2 FOR UPDATE`, [
          id.parse(req.params.id),
          req.user.id,
        ])
      ).rows[0];
      const reject = async (status, error) => {
        await client.query('ROLLBACK');
        return res.status(status).json({ error });
      };
      if (!report) return await reject(404, 'Vendor report not found.');
      if (report.version !== data.version)
        return await reject(
          409,
          'Report changed. Reload before saving; your unsaved values are still visible.',
        );
      const result = await mutate(report, client);
      if (result.error) return await reject(400, result.error);
      await client.query(
        'UPDATE voip.vendor_reports SET config=$1,entries=$2,version=version+1,updated_at=now() WHERE id=$3',
        [JSON.stringify(report.config), JSON.stringify(report.entries), report.id],
      );
      await client.query(
        'INSERT INTO voip.vendor_audit(report_id,user_id,action,detail) VALUES($1,$2,$3,$4)',
        [report.id, req.user.id, result.action, JSON.stringify(result.detail)],
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
  app.put('/api/vendor-reports/:id/entries', async (req, res) => {
    const data = z.object({ version, entries: z.array(entry).min(1).max(1000) }).parse(req.body);
    await update(req, res, data, async (report) => {
      const ids = new Set(report.config.vendors.map((v) => v.id));
      const keys = data.entries.map((e) => `${e.vendor_id}:${e.slot}`);
      if (new Set(keys).size !== keys.length || data.entries.some((e) => !ids.has(e.vendor_id)))
        return { error: 'Invalid or duplicate vendor entries.' };
      const values = new Map(report.entries.map((e) => [`${e.vendor_id}:${e.slot}`, e]));
      const changes = data.entries.map((e) => {
        const key = `${e.vendor_id}:${e.slot}`,
          previous = values.get(key)?.amount ?? null;
        if (e.amount === null) values.delete(key);
        else values.set(key, e);
        return { ...e, previous };
      });
      report.entries = [...values.values()];
      return { action: 'Vendor entries saved', detail: { changes, count: changes.length } };
    });
  });
  app.patch('/api/vendor-reports/:id/rows/:vendorId', async (req, res) => {
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
      let name = row?.name;
      if (['add', 'restore'].includes(data.action)) {
        if (row || report.config.vendors.length >= 100)
          return { error: 'Vendor already included or report has 100 vendors.' };
        if (data.action === 'add') {
          if (removed.some((v) => v.row.id === vendorId))
            return { error: 'Restore this vendor from removed rows.' };
          const vendor = (
            await client.query(
              'SELECT id,name FROM voip.vendors WHERE id=$1 AND deleted_at IS NULL',
              [vendorId],
            )
          ).rows[0];
          if (!vendor) return { error: 'Choose an active vendor.' };
          report.config.vendors.push(vendor);
          name = vendor.name;
        } else {
          const saved = removed.find((v) => v.row.id === vendorId);
          if (!saved) return { error: 'Removed row not found.' };
          report.config.vendors.push(saved.row);
          report.entries.push(...saved.entries);
          name = saved.row.name;
          report.config.removedVendors = removed.filter((v) => v.row.id !== vendorId);
        }
      } else {
        if (!row) return { error: 'Vendor row not found.' };
        if (data.action === 'rename') {
          if (report.config.vendors.some((v) => v.id !== vendorId && v.name === data.name))
            return { error: 'Row name already exists.' };
          row.name = data.name;
        } else {
          const entries = report.entries.filter((e) => e.vendor_id === vendorId);
          if (data.action === 'remove') {
            report.config.removedVendors = [...removed, { row, entries }];
            report.config.vendors = report.config.vendors.filter((v) => v.id !== vendorId);
          }
          report.entries = report.entries.filter((e) => e.vendor_id !== vendorId);
          return {
            action: data.action === 'remove' ? 'Vendor row removed' : 'Vendor row cleared',
            detail: { name, previous: entries },
          };
        }
      }
      return {
        action: `Vendor row ${data.action}`,
        detail: { name: data.name || name, previousName: name },
      };
    });
  });
}
