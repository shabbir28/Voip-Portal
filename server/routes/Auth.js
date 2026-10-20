import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { hash, text, email } from '../validation/schemas.js';
import { campaignDefaults } from '../config/defaults.js';
export function registerAuth(app, db) {
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again in 15 minutes.' },
  });
  app.get('/api/status', async (req, res) => {
    const result = await db.query('SELECT count(*) FROM voip.users');
    res.json({ needsSetup: Number(result.rows[0].count) === 0, database: 'connected' });
  });
  const startSession = async (req, res, user) => {
    const token = randomBytes(32).toString('hex');
    await db.query('DELETE FROM voip.sessions WHERE expires_at < now()');
    await db.query(
      "INSERT INTO voip.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now() + interval '12 hours')",
      [hash(token), user.id],
    );
    res.cookie('voip_session', token, {
      httpOnly: true,
      secure: req.secure || req.get('x-forwarded-proto') === 'https',
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({ user });
  };
  app.post('/api/setup', authLimiter, async (req, res) => {
    const data = z
      .object({ name: text, email, password: z.string().min(10).max(128) })
      .parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    const client = await db.connect();
    let user;
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE voip.users IN EXCLUSIVE MODE');
      if (Number((await client.query('SELECT count(*) FROM voip.users')).rows[0].count)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Workspace is already set up. Please sign in.' });
      }
      user = (
        await client.query(
          "INSERT INTO voip.users(name,email,password_hash,role) VALUES($1,$2,$3,'super_admin') RETURNING id,name,email,role",
          [data.name, data.email, passwordHash],
        )
      ).rows[0];
      for (const [name, color, dialers] of campaignDefaults) {
        const campaign = (
          await client.query(
            'INSERT INTO voip.campaigns(name,color) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',
            [name, color],
          )
        ).rows[0];
        for (const dialer of dialers)
          await client.query(
            'INSERT INTO voip.dialers(campaign_id,name) VALUES($1,$2) ON CONFLICT(name) DO NOTHING',
            [campaign.id, dialer],
          );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    await startSession(req, res, user);
  });
  app.post('/api/login', authLimiter, async (req, res) => {
    const data = z.object({ email, password: z.string().min(1).max(128) }).parse(req.body);
    const user = (
      await db.query('SELECT * FROM voip.users WHERE email=$1 AND deleted_at IS NULL', [data.email])
    ).rows[0];
    if (!user || !(await bcrypt.compare(data.password, user.password_hash)))
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    await startSession(req, res, { id: user.id, name: user.name, email: user.email, role: user.role });
  });
  app.use('/api', async (req, res, next) => {
    const token = req.cookies.voip_session;
    if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
    const user = (
      await db.query(
        'SELECT u.id,u.name,u.email,u.role FROM voip.sessions s JOIN voip.users u ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.deleted_at IS NULL',
        [hash(token)],
      )
    ).rows[0];
    if (!user) return res.status(401).json({ error: 'Your session expired. Please sign in.' });
    req.user = user;
    next();
  });
  app.get('/api/me', (req, res) => res.json({ user: req.user }));
  app.post('/api/logout', async (req, res) => {
    await db.query('DELETE FROM voip.sessions WHERE token_hash=$1', [
      hash(req.cookies.voip_session),
    ]);
    res.clearCookie('voip_session', { path: '/' });
    res.json({ ok: true });
  });
}
