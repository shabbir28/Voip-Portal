import { REPORT_TIMEZONE, presentReport } from '../../shared/time.js';
import { reportDateSql } from '../config/reportDate.js';
import { z } from 'zod';
import { text, id, time, date } from '../validation/schemas.js';
import { makeSlots, summarize } from '../../shared/reporting.js';
export function registerReports(app, db) {
  app.get('/api/sheets', async (req, res) => {
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
        query = `SELECT s.id,s.name,to_char(${reportDateSql},'YYYY-MM-DD') report_date,s.version,s.updated_at,s.created_by,u.name AS creator_name,
      COALESCE((SELECT SUM(e.amount) FROM voip.entries e WHERE e.sheet_id=s.id),0) total,
      jsonb_array_length(s.config->'dialers') dialer_count FROM voip.sheets s LEFT JOIN voip.users u ON s.created_by=u.id WHERE s.created_by=$1 ORDER BY s.report_date DESC,s.id DESC`;
        params = [targetUserId];
      } else {
        query = `SELECT s.id,s.name,to_char(${reportDateSql},'YYYY-MM-DD') report_date,s.version,s.updated_at,s.created_by,u.name AS creator_name,
      COALESCE((SELECT SUM(e.amount) FROM voip.entries e WHERE e.sheet_id=s.id),0) total,
      jsonb_array_length(s.config->'dialers') dialer_count FROM voip.sheets s LEFT JOIN voip.users u ON s.created_by=u.id ORDER BY s.report_date DESC,s.id DESC`;
        params = [];
      }
    } else {
      query = `SELECT s.id,s.name,to_char(${reportDateSql},'YYYY-MM-DD') report_date,s.version,s.updated_at,s.created_by,
      COALESCE((SELECT SUM(e.amount) FROM voip.entries e WHERE e.sheet_id=s.id),0) total,
      jsonb_array_length(s.config->'dialers') dialer_count FROM voip.sheets s WHERE s.created_by=$1 ORDER BY s.report_date DESC,s.id DESC`;
      params = [req.user.id];
    }
    res.json((await db.query(query, params)).rows);
  });
  app.post('/api/sheets', async (req, res) => {
    const data = z
      .object({
        name: text,
        report_date: date,
        start: time,
        end: time,
        dialer_ids: z.array(id).min(1).max(500),
      })
      .parse(req.body);
    const slots = makeSlots(data.start, data.end);
    if (slots.length > 48 || slots.length < 1)
      return res.status(400).json({ error: 'Invalid shift duration.' });
    const dialers = (
      await db.query(
        'SELECT d.*,c.name campaign,c.color FROM voip.dialers d JOIN voip.campaigns c ON c.id=d.campaign_id WHERE d.deleted_at IS NULL AND c.deleted_at IS NULL AND d.id=ANY($1::int[]) ORDER BY c.id,d.id',
        [data.dialer_ids],
      )
    ).rows;
    if (dialers.length !== new Set(data.dialer_ids).size)
      return res.status(400).json({ error: 'Some selected dialers no longer exist.' });
    const config = { slots, dialers, timezone: REPORT_TIMEZONE, currency: 'USD' };
    const sheet = (
      await db.query(
        'INSERT INTO voip.sheets(name,report_date,config,created_by) VALUES($1,$2,$3,$4) RETURNING id',
        [data.name, data.report_date, JSON.stringify(config), req.user.id],
      )
    ).rows[0];
    res.status(201).json(sheet);
  });
  app.get('/api/sheets/:id', async (req, res) => {
    const sheetId = id.parse(req.params.id);
    const allowOther =
      req.user.role === 'super_admin' &&
      (req.query.adminView === 'true' || req.query.all === 'true');
    const sheet = (
      await db.query(
        allowOther
          ? "SELECT s.*,to_char(s.report_date,'YYYY-MM-DD') report_date,u.name AS creator_name FROM voip.sheets s LEFT JOIN voip.users u ON s.created_by=u.id WHERE s.id=$1"
          : "SELECT s.*,to_char(s.report_date,'YYYY-MM-DD') report_date FROM voip.sheets s WHERE s.id=$1 AND s.created_by=$2",
        allowOther ? [sheetId] : [sheetId, req.user.id],
      )
    ).rows[0];
    if (!sheet) return res.status(404).json({ error: 'Report not found.' });
    const entries = (
      await db.query('SELECT dialer_id,slot,amount FROM voip.entries WHERE sheet_id=$1', [sheetId])
    ).rows;
    const activity =
      req.user.role === 'super_admin'
        ? (
            await db.query(
              'SELECT a.action,a.detail,a.created_at,u.name FROM voip.audit a JOIN voip.users u ON a.user_id=u.id WHERE a.sheet_id=$1 ORDER BY a.id DESC LIMIT 10',
              [sheetId],
            )
          ).rows
        : undefined;
    const displayed = presentReport(sheet);
    res.json({
      ...displayed,
      creator_name: sheet.creator_name,
      entries,
      activity,
      summary: summarize(displayed.config, entries),
    });
  });
  app.put('/api/sheets/:id/entries', async (req, res) => {
    const sheetId = id.parse(req.params.id);
    const data = z
      .object({
        version: z.number().int().nonnegative(),
        entries: z
          .array(
            z.object({
              dialer_id: id,
              slot: z.number().int().min(0).max(47),
              amount: z
                .number()
                .finite()
                .min(0)
                .max(9999999999.99)
                .refine(
                  (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.0001,
                  'Use at most 2 decimal places',
                )
                .nullable(),
            }),
          )
          .min(1)
          .max(10000),
      })
      .parse(req.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const sheet = (
        await client.query('SELECT * FROM voip.sheets WHERE id=$1 AND created_by=$2 FOR UPDATE', [
          sheetId,
          req.user.id,
        ])
      ).rows[0];
      if (!sheet) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Report not found.' });
      }
      if (sheet.version !== data.version) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error:
            'Someone updated this report. Reload it before saving to avoid overwriting their work.',
        });
      }
      const allowed = new Set(sheet.config.dialers.map((d) => d.id));
      const changes = [];
      for (const entry of data.entries) {
        if (!allowed.has(entry.dialer_id) || entry.slot >= sheet.config.slots.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Entry does not belong to this report.' });
        }
        const previous = (
          await client.query(
            'SELECT amount FROM voip.entries WHERE sheet_id=$1 AND dialer_id=$2 AND slot=$3',
            [sheetId, entry.dialer_id, entry.slot],
          )
        ).rows[0];
        changes.push({ ...entry, previous: previous ? Number(previous.amount) : null });
        if (entry.amount === null)
          await client.query(
            'DELETE FROM voip.entries WHERE sheet_id=$1 AND dialer_id=$2 AND slot=$3',
            [sheetId, entry.dialer_id, entry.slot],
          );
        else
          await client.query(
            'INSERT INTO voip.entries(sheet_id,dialer_id,slot,amount) VALUES($1,$2,$3,$4) ON CONFLICT(sheet_id,dialer_id,slot) DO UPDATE SET amount=EXCLUDED.amount',
            [sheetId, entry.dialer_id, entry.slot, entry.amount],
          );
      }
      await client.query('UPDATE voip.sheets SET version=version+1,updated_at=now() WHERE id=$1', [
        sheetId,
      ]);
      await client.query(
        'INSERT INTO voip.audit(sheet_id,user_id,action,detail) VALUES($1,$2,$3,$4)',
        [sheetId, req.user.id, 'Entries saved', JSON.stringify({ count: changes.length, changes })],
      );
      await client.query('COMMIT');
      res.json({ version: data.version + 1 });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
