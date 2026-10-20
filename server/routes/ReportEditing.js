import { z } from 'zod';
import { id, text } from '../validation/schemas.js';
export function registerReportEditing(app, db) {
  app.patch('/api/sheets/:id/dialers/:dialerId', async (req, res) => {
    const sheetId = id.parse(req.params.id),
      dialerId = id.parse(req.params.dialerId);
    const data = z
      .object({
        version: z.number().int().nonnegative(),
        action: z.enum(['rename', 'clear', 'remove', 'restore']),
        name: text.optional(),
      })
      .refine((d) => d.action !== 'rename' || Boolean(d.name), 'A name is required')
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
        return res.status(status).json({ error });
      };
      if (!sheet) return await reject(404, 'Report not found.');
      if (sheet.version !== data.version)
        return await reject(409, 'Report changed. Reload before editing this row.');
      const row = sheet.config.dialers.find((d) => d.id === dialerId);
      let detail, action;
      if (data.action === 'restore') {
        const removed = sheet.config.removedDialers?.find((d) => d.row.id === dialerId);
        if (!removed || row) return await reject(400, 'Removed row not available.');
        if (sheet.config.dialers.length >= 500)
          return await reject(400, 'Report dialer limit reached.');
        sheet.config.dialers.push(removed.row);
        for (const e of removed.entries)
          await client.query(
            'INSERT INTO voip.entries(sheet_id,dialer_id,slot,amount) VALUES($1,$2,$3,$4)',
            [sheetId, dialerId, e.slot, e.amount],
          );
        sheet.config.removedDialers = sheet.config.removedDialers.filter(
          (d) => d.row.id !== dialerId,
        );
        action = 'Dialer restored';
        detail = { dialerName: removed.row.name };
      } else {
        if (!row) return await reject(404, 'Dialer row not found.');
        detail = { dialerName: row.name };
        if (data.action === 'rename') {
          if (sheet.config.dialers.some((d) => d.id !== dialerId && d.name === data.name))
            return await reject(409, 'A row with that name already exists.');
          detail.previousName = row.name;
          row.name = data.name;
          detail.dialerName = data.name;
          action = 'Dialer renamed';
        } else {
          const entries = (
            await client.query(
              'SELECT dialer_id,slot,amount FROM voip.entries WHERE sheet_id=$1 AND dialer_id=$2',
              [sheetId, dialerId],
            )
          ).rows;
          detail.changes = entries.map((e) => ({ ...e, previous: Number(e.amount), amount: null }));
          detail.count = entries.length;
          await client.query('DELETE FROM voip.entries WHERE sheet_id=$1 AND dialer_id=$2', [
            sheetId,
            dialerId,
          ]);
          if (data.action === 'remove') {
            sheet.config.removedDialers = [
              ...(sheet.config.removedDialers || []).filter((d) => d.row.id !== dialerId),
              { row, entries },
            ];
            sheet.config.dialers = sheet.config.dialers.filter((d) => d.id !== dialerId);
            action = 'Dialer removed';
          } else action = 'Row entries cleared';
        }
      }
      await client.query(
        'UPDATE voip.sheets SET config=$1,version=version+1,updated_at=now() WHERE id=$2',
        [JSON.stringify(sheet.config), sheetId],
      );
      await client.query(
        'INSERT INTO voip.audit(sheet_id,user_id,action,detail) VALUES($1,$2,$3,$4)',
        [sheetId, req.user.id, action, JSON.stringify(detail)],
      );
      await client.query('COMMIT');
      res.json({ version: sheet.version + 1 });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
