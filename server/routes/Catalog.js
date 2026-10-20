import { z } from 'zod';
import { text, id } from '../validation/schemas.js';
export function registerCatalog(app, db) {
  app.get('/api/catalog', async (req, res) => {
    const [campaigns, dialers] = await Promise.all([
      db.query('SELECT * FROM voip.campaigns WHERE ($1 OR deleted_at IS NULL) ORDER BY id', [
        req.query.includeDeleted === 'true',
      ]),
      db.query(
        'SELECT d.* FROM voip.dialers d JOIN voip.campaigns c ON c.id=d.campaign_id WHERE ($1 OR (d.deleted_at IS NULL AND c.deleted_at IS NULL)) ORDER BY d.id',
        [req.query.includeDeleted === 'true'],
      ),
    ]);
    res.json({ campaigns: campaigns.rows, dialers: dialers.rows });
  });
  app.post('/api/campaigns', async (req, res) => {
    const data = z
      .object({
        name: text,
        color: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .default('#7557de'),
      })
      .parse(req.body);
    res
      .status(201)
      .json(
        (
          await db.query('INSERT INTO voip.campaigns(name,color) VALUES($1,$2) RETURNING *', [
            data.name,
            data.color,
          ])
        ).rows[0],
      );
  });
  app.post('/api/dialers', async (req, res) => {
    const data = z.object({ name: text, campaign_id: id }).parse(req.body);
    if (
      !(
        await db.query('SELECT id FROM voip.campaigns WHERE id=$1 AND deleted_at IS NULL', [
          data.campaign_id,
        ])
      ).rowCount
    )
      return res.status(400).json({ error: 'Choose an active campaign.' });
    res
      .status(201)
      .json(
        (
          await db.query('INSERT INTO voip.dialers(name,campaign_id) VALUES($1,$2) RETURNING *', [
            data.name,
            data.campaign_id,
          ])
        ).rows[0],
      );
  });
  app.patch('/api/campaigns/:id', async (req, res) => {
    const data = z
      .object({ name: text, color: z.string().regex(/^#[0-9a-f]{6}$/i) })
      .parse(req.body);
    const result = await db.query(
      'UPDATE voip.campaigns SET name=$1,color=$2 WHERE id=$3 AND deleted_at IS NULL RETURNING *',
      [data.name, data.color, id.parse(req.params.id)],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Active campaign not found.' });
    res.json(result.rows[0]);
  });
  app.patch('/api/dialers/:id', async (req, res) => {
    const data = z.object({ name: text, campaign_id: id }).parse(req.body);
    if (
      !(
        await db.query('SELECT id FROM voip.campaigns WHERE id=$1 AND deleted_at IS NULL', [
          data.campaign_id,
        ])
      ).rowCount
    )
      return res.status(400).json({ error: 'Choose an active campaign.' });
    const result = await db.query(
      'UPDATE voip.dialers SET name=$1,campaign_id=$2 WHERE id=$3 AND deleted_at IS NULL RETURNING *',
      [data.name, data.campaign_id, id.parse(req.params.id)],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Active dialer not found.' });
    res.json(result.rows[0]);
  });
  for (const entity of ['campaigns', 'dialers']) {
    app.delete(`/api/${entity}/:id`, async (req, res) => {
      const result = await db.query(
        `UPDATE voip.${entity} SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
        [id.parse(req.params.id)],
      );
      if (!result.rowCount)
        return res.status(404).json({ error: 'Item not found or already deleted.' });
      res.json({ ok: true });
    });
    app.post(`/api/${entity}/:id/restore`, async (req, res) => {
      const result = await db.query(
        `UPDATE voip.${entity} SET deleted_at=NULL WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id`,
        [id.parse(req.params.id)],
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Deleted item not found.' });
      res.json({ ok: true });
    });
  }
}
