import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { text, email, date, id } from '../validation/schemas.js';
export function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'super_admin')
    return res.status(403).json({ error: 'Super Admin access is required.' });
  next();
}
export function registerUsers(app, db) {
  app.get('/api/users', requireSuperAdmin, async (req, res) => {
    res.json(
      (
        await db.query(
          'SELECT id,name,email,role,created_at,deleted_at,version FROM voip.users WHERE ($1 OR deleted_at IS NULL) ORDER BY id',
          [req.query.includeDeleted === 'true'],
        )
      ).rows,
    );
  });
  app.post('/api/users', requireSuperAdmin, async (req, res) => {
    const data = z
      .object({
        name: text,
        email,
        password: z.string().min(10).max(128),
        role: z.enum(['admin', 'super_admin']),
      })
      .parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE voip.users IN SHARE ROW EXCLUSIVE MODE');
      const actor = (
        await client.query('SELECT role,deleted_at FROM voip.users WHERE id=$1', [req.user.id])
      ).rows[0];
      if (!actor || actor.deleted_at || actor.role !== 'super_admin') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Super Admin access is required.' });
      }
      const user = (
        await client.query(
          'INSERT INTO voip.users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role,created_at,deleted_at,version',
          [data.name, data.email, passwordHash, data.role],
        )
      ).rows[0];
      await client.query('INSERT INTO voip.user_audit(user_id,action,detail) VALUES($1,$2,$3)', [
        req.user.id,
        'User created',
        JSON.stringify({ name: user.name, email: user.email, role: user.role }),
      ]);
      await client.query('COMMIT');
      res.status(201).json(user);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
  const versionSchema = z.object({ version: z.number().int().nonnegative() });
  async function changeUser(req, res, action, data) {
    const userId = id.parse(req.params.id);
    const passwordHash = data.password ? await bcrypt.hash(data.password, 12) : null;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE voip.users IN SHARE ROW EXCLUSIVE MODE');
      const reject = async (status, error) => {
        await client.query('ROLLBACK');
        return res.status(status).json({ error });
      };
      const actor = (
        await client.query('SELECT role,deleted_at FROM voip.users WHERE id=$1', [req.user.id])
      ).rows[0];
      if (!actor || actor.deleted_at || actor.role !== 'super_admin')
        return await reject(403, 'Super Admin access is required.');
      const target = (
        await client.query(
          'SELECT id,name,email,role,deleted_at,version FROM voip.users WHERE id=$1',
          [userId],
        )
      ).rows[0];
      if (!target) return await reject(404, 'User not found.');
      if (target.version !== data.version)
        return await reject(
          409,
          'This user was changed. Reload the user list before trying again.',
        );
      if (action === 'restore' ? !target.deleted_at : !!target.deleted_at)
        return await reject(
          400,
          action === 'restore' ? 'User is already active.' : 'Restore the user before editing.',
        );
      if (
        userId === req.user.id &&
        (action === 'delete' || (action === 'update' && data.role !== 'super_admin'))
      )
        return await reject(
          400,
          'You cannot delete your own account or remove your own Super Admin access.',
        );
      let result;
      if (action === 'update')
        result = await client.query(
          'UPDATE voip.users SET name=$1,email=$2,role=$3,password_hash=COALESCE($4,password_hash),version=version+1 WHERE id=$5 RETURNING id,name,email,role,created_at,deleted_at,version',
          [data.name, data.email, data.role, passwordHash, userId],
        );
      else
        result = await client.query(
          `UPDATE voip.users SET deleted_at=${action === 'delete' ? 'now()' : 'NULL'},version=version+1 WHERE id=$1 RETURNING id,name,email,role,created_at,deleted_at,version`,
          [userId],
        );
      const revoke =
        action === 'delete' ||
        passwordHash ||
        (action === 'update' && (target.role !== data.role || target.email !== data.email));
      if (revoke) await client.query('DELETE FROM voip.sessions WHERE user_id=$1', [userId]);
      const user = result.rows[0];
      await client.query('INSERT INTO voip.user_audit(user_id,action,detail) VALUES($1,$2,$3)', [
        req.user.id,
        action === 'delete'
          ? 'User deleted'
          : action === 'restore'
            ? 'User restored'
            : 'User updated',
        JSON.stringify({
          targetId: userId,
          name: user.name,
          email: user.email,
          role: user.role,
          previous: { name: target.name, email: target.email, role: target.role },
          passwordChanged: !!passwordHash,
        }),
      ]);
      await client.query('COMMIT');
      res.json({ ...user, reauthenticate: !!revoke && userId === req.user.id });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  app.patch('/api/users/:id', requireSuperAdmin, async (req, res) => {
    const data = versionSchema
      .extend({
        name: text,
        email,
        role: z.enum(['admin', 'super_admin']),
        password: z.string().min(10).max(128).optional(),
      })
      .parse(req.body);
    await changeUser(req, res, 'update', data);
  });
  app.delete('/api/users/:id', requireSuperAdmin, async (req, res) => {
    await changeUser(req, res, 'delete', versionSchema.parse(req.body));
  });
  app.post('/api/users/:id/restore', requireSuperAdmin, async (req, res) => {
    await changeUser(req, res, 'restore', versionSchema.parse(req.body));
  });
  app.get('/api/activity', requireSuperAdmin, async (req, res) => {
    const range = z
      .object({ from: date, to: date })
      .refine(
        (r) => r.from <= r.to && (Date.parse(r.to) - Date.parse(r.from)) / 86400000 <= 366,
        'Choose a range of at most 366 days',
      )
      .parse(req.query);
    const result = await db.query(
      `SELECT a.*,u.name AS actor FROM (
      SELECT 'dialer-'||a.id AS id,a.user_id,a.action,a.detail,a.created_at,s.name AS report,'Dialer report' AS module FROM voip.audit a JOIN voip.sheets s ON s.id=a.sheet_id
      UNION ALL SELECT 'vendor-'||a.id,a.user_id,a.action,a.detail,a.created_at,r.name,'Vendor report' FROM voip.vendor_audit a JOIN voip.vendor_reports r ON r.id=a.report_id
      UNION ALL SELECT 'user-'||id,user_id,action,detail,created_at,NULL,'Users' FROM voip.user_audit
    ) a JOIN voip.users u ON u.id=a.user_id
    WHERE (a.created_at AT TIME ZONE 'America/New_York')::date BETWEEN $1::date AND $2::date
    ORDER BY a.created_at DESC,a.id DESC LIMIT 200`,
      [range.from, range.to],
    );
    res.json(result.rows);
  });
}
