import assert from 'node:assert/strict';
import request from 'supertest';
import { todayInZone } from '../shared/time.js';
import { migrate } from '../server/db.js';
export async function verifyRoles(t, app, superAgent, mutate, db) {
  const admin = request.agent(app),
    day = todayInZone();
  const write = (method, url, body) => admin[method](url).set('X-Voip-Request', '1').send(body);
  await t.test(
    'Super Admin creates role-based users without returning password hashes',
    async () => {
      assert.equal((await superAgent.get('/api/me')).body.user.role, 'super_admin');
      const r = await mutate('post', '/api/users', {
        name: 'Operations Admin',
        email: 'operations.admin@example.test',
        password: 'Testing-Admin-only-4829',
        role: 'admin',
      });
      assert.equal(r.status, 201);
      assert.equal(r.body.role, 'admin');
      assert.ok(!Object.hasOwn(r.body, 'password_hash'));
      assert.equal(
        (
          await mutate('post', '/api/users', {
            name: 'Duplicate',
            email: 'operations.admin@example.test',
            password: 'Testing-Admin-only-4829',
            role: 'admin',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await mutate('post', '/api/users', {
            name: 'Bad role',
            email: 'bad@example.test',
            password: 'Testing-Admin-only-4829',
            role: 'owner',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await mutate('post', '/api/users', {
            name: 'Second Super',
            email: 'second.super@example.test',
            password: 'Testing-Super-only-4829',
            role: 'super_admin',
          })
        ).status,
        201,
      );
      await migrate(db);
      assert.equal(
        (await db.query("SELECT role FROM voip.users WHERE email='operations.admin@example.test'"))
          .rows[0].role,
        'admin',
      );
      const users = (await superAgent.get('/api/users')).body;
      assert.equal(users.length, 3);
      assert.ok(users.every((u) => !('password_hash' in u)));
    },
  );
  await t.test('Admin cannot create users, escalate role or read activity', async () => {
    const login = await write('post', '/api/login', {
      email: 'operations.admin@example.test',
      password: 'Testing-Admin-only-4829',
      role: 'super_admin',
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, 'admin');
    assert.equal((await admin.get('/api/users')).status, 403);
    assert.equal(
      (
        await write('post', '/api/users', {
          name: 'Escalation',
          email: 'blocked@example.test',
          password: 'Testing-blocked-only',
          role: 'super_admin',
        })
      ).status,
      403,
    );
    assert.equal(
      (await admin.get(`/api/activity?from=${day}&to=${day}&role=super_admin`)).status,
      403,
    );
  });
  await t.test(
    'Admin can operate dialer and vendor reports but embedded audit data is withheld',
    async () => {
      const catalog = (await admin.get('/api/catalog')).body;
      const created = await write('post', '/api/sheets', {
        name: 'Admin shift',
        report_date: day,
        start: '18:30',
        end: '04:30',
        dialer_ids: [catalog.dialers[0].id],
      });
      assert.equal(created.status, 201);
      let endpoint = `/api/sheets/${created.body.id}`;
      assert.equal(
        (
          await write('put', `${endpoint}/entries`, {
            version: 0,
            entries: [{ dialer_id: catalog.dialers[0].id, slot: 0, amount: 12.5 }],
          })
        ).status,
        200,
      );
      let report = (await admin.get(endpoint)).body;
      assert.equal(report.summary.total, 12.5);
      assert.ok(!('activity' in report));
      assert.equal(report.config.timezone, 'America/New_York');
      assert.equal((await superAgent.get(endpoint)).status, 404);
      const vendors = (await admin.get('/api/vendors')).body;
      const vr = await write('post', '/api/vendor-reports', {
        name: 'Admin vendor shift',
        report_date: day,
        vendor_ids: [vendors[0].id],
      });
      assert.equal(vr.status, 201);
      endpoint = `/api/vendor-reports/${vr.body.id}`;
      assert.equal(
        (
          await write('put', `${endpoint}/entries`, {
            version: 0,
            entries: [{ vendor_id: vendors[0].id, slot: 0, amount: 42.75 }],
          })
        ).status,
        200,
      );
      report = (await admin.get(endpoint)).body;
      assert.equal(report.summary.total, 42.75);
      assert.ok(!('activity' in report));
      assert.equal((await superAgent.get(endpoint)).status, 404);
      assert.equal((await admin.get(`/api/reports/range?from=${day}&to=${day}`)).status, 200);
    },
  );
  await t.test(
    'Super Admin workspace activity includes users, dialers and vendors in Eastern dates',
    async () => {
      const r = await superAgent.get(`/api/activity?from=${day}&to=${day}`);
      assert.equal(r.status, 200);
      assert.ok(r.body.some((e) => e.module === 'Users'));
      assert.ok(r.body.some((e) => e.module === 'Vendor report'));
      assert.ok(r.body.some((e) => e.module === 'Dialer report'));
      assert.ok(!JSON.stringify(r.body).includes('Testing-Admin-only-4829'));
      assert.equal(
        (await superAgent.get('/api/activity?from=2026-02-30&to=2026-03-01')).status,
        400,
      );
    },
  );
}
