import { presentReport } from '../../shared/time.js';
import { reportDateSql } from '../config/reportDate.js';
import { z } from 'zod';
import { date, id, text } from '../validation/schemas.js';
export function registerReportExtras(app, db) {
  app.get('/api/reports/range', async (req, res) => {
    const range = z
      .object({ from: date, to: date })
      .refine((r) => r.from <= r.to, 'Start must not be after end')
      .refine(
        (r) => (new Date(r.to) - new Date(r.from)) / 86400000 <= 365,
        'Maximum range is 366 days',
      )
      .parse(req.query);
    const client = await db.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const reports = (
        await client.query(
          `SELECT id,name,config,version,to_char(report_date,'YYYY-MM-DD') report_date FROM voip.sheets WHERE ${reportDateSql} BETWEEN $1::date AND $2::date AND created_by=$3 ORDER BY report_date,id`,
          [range.from, range.to, req.user.id],
        )
      ).rows;
      const entries = (
        await client.query(
          'SELECT sheet_id,dialer_id,slot,amount FROM voip.entries WHERE sheet_id=ANY($1::int[])',
          [reports.map((r) => r.id)],
        )
      ).rows;
      const grouped = new Map();
      for (const e of entries) {
        if (!grouped.has(e.sheet_id)) grouped.set(e.sheet_id, []);
        grouped.get(e.sheet_id).push(e);
      }
      await client.query('COMMIT');
      res.json(reports.map((r) => ({ ...presentReport(r), entries: grouped.get(r.id) || [] })));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
  app.post('/api/sheets/:id/dialers', async (req, res) => {
    const sheetId = id.parse(req.params.id);
    const data = z
      .object({
        version: z.number().int().nonnegative(),
        campaign_id: id,
        dialer_id: id.optional(),
        name: text.optional(),
      })
      .refine(
        (d) => Boolean(d.dialer_id) !== Boolean(d.name),
        'Select a dialer or enter a new name',
      )
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
      const reject = async (status, error) => {
        await client.query('ROLLBACK');
        res.status(status).json({ error });
      };
      if (!sheet) return await reject(404, 'Report not found.');
      if (sheet.version !== data.version)
        return await reject(409, 'Report changed. Reload before adding a row.');
      if (sheet.config.dialers.length >= 500)
        return await reject(400, 'A report can contain at most 500 dialers.');
      const campaign = (
        await client.query('SELECT * FROM voip.campaigns WHERE id=$1 AND deleted_at IS NULL', [
          data.campaign_id,
        ])
      ).rows[0];
      if (!campaign) return await reject(400, 'Campaign not found.');
      let dialer;
      if (data.dialer_id)
        dialer = (
          await client.query(
            'SELECT * FROM voip.dialers WHERE id=$1 AND campaign_id=$2 AND deleted_at IS NULL',
            [data.dialer_id, data.campaign_id],
          )
        ).rows[0];
      else
        dialer = (
          await client.query(
            'INSERT INTO voip.dialers(name,campaign_id) VALUES($1,$2) RETURNING *',
            [data.name, data.campaign_id],
          )
        ).rows[0];
      if (!dialer) return await reject(400, 'Dialer does not belong to this campaign.');
      if (sheet.config.dialers.some((d) => d.id === dialer.id))
        return await reject(409, 'This dialer is already in the report.');
      const existing = sheet.config.dialers.find((d) => d.campaign_id === campaign.id);
      const row = {
        ...dialer,
        campaign: existing?.campaign || campaign.name,
        color: existing?.color || campaign.color,
      };
      if (sheet.config.removedDialers?.some((d) => d.row.id === row.id))
        return await reject(409, 'This row was removed. Use Restore removed rows to recover it.');
      sheet.config.dialers.push(row);
      await client.query(
        'UPDATE voip.sheets SET config=$1,version=version+1,updated_at=now() WHERE id=$2',
        [JSON.stringify(sheet.config), sheetId],
      );
      await client.query(
        'INSERT INTO voip.audit(sheet_id,user_id,action,detail) VALUES($1,$2,$3,$4)',
        [
          sheetId,
          req.user.id,
          'Dialer added',
          JSON.stringify({ dialerName: dialer.name, campaign: row.campaign }),
        ],
      );
      await client.query('COMMIT');
      res.status(201).json({ dialer: row, version: sheet.version + 1 });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
