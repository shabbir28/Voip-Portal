import assert from 'node:assert/strict';
import request from 'supertest';
export async function verifyUserEditing(t, app, owner, mutate, db) {
  const admin = request.agent(app),
    login = (password = 'Testing-Admin-only-4829') =>
      admin
        .post('/api/login')
        .set('X-Voip-Request', '1')
        .send({ email: 'operations.admin@example.test', password });
  const users = (await owner.get('/api/users')).body,
    target = users.find((u) => u.email === 'operations.admin@example.test'),
    self = (await owner.get('/api/me')).body.user;
  const endpoint = `/api/users/${target.id}`,
    fields = { name: target.name, email: target.email, role: target.role };
  await t.test(
    'Admin cannot update, delete or restore users; self lockout is blocked',
    async () => {
      assert.equal((await login()).status, 200);
      for (const [method, url, data] of [
        ['patch', endpoint, { ...fields, version: 0 }],
        ['delete', endpoint, { version: 0 }],
        ['post', `${endpoint}/restore`, { version: 0 }],
      ])
        assert.equal((await admin[method](url).set('X-Voip-Request', '1').send(data)).status, 403);
      assert.equal((await mutate('delete', `/api/users/${self.id}`, { version: 0 })).status, 400);
      assert.equal(
        (
          await mutate('patch', `/api/users/${self.id}`, {
            version: 0,
            name: self.name,
            email: self.email,
            role: 'admin',
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    'user edits preserve passwords, reject stale saves and enforce unique emails',
    async () => {
      const r = await mutate('patch', endpoint, {
        ...fields,
        name: 'Updated Operations',
        version: 0,
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.version, 1);
      assert.ok(!('password_hash' in r.body));
      assert.equal((await admin.get('/api/me')).body.user.name, 'Updated Operations');
      assert.equal((await mutate('patch', endpoint, { ...fields, version: 0 })).status, 409);
      assert.equal(
        (await mutate('patch', endpoint, { ...fields, email: self.email, version: 1 })).status,
        409,
      );
      assert.equal((await login()).status, 200);
    },
  );
  await t.test(
    'password and role updates revoke existing sessions and take effect on next login',
    async () => {
      const r = await mutate('patch', endpoint, {
        ...fields,
        name: 'Updated Operations',
        role: 'super_admin',
        password: 'Changed-Admin-only-4829',
        version: 1,
      });
      assert.equal(r.status, 200);
      assert.equal((await admin.get('/api/me')).status, 401);
      assert.equal((await login()).status, 401);
      assert.equal((await login('Changed-Admin-only-4829')).body.user.role, 'super_admin');
      assert.equal((await admin.get('/api/users')).status, 200);
      assert.equal(
        (
          await mutate('patch', endpoint, {
            ...fields,
            name: 'Updated Operations',
            role: 'admin',
            version: 2,
          })
        ).status,
        200,
      );
      assert.equal((await admin.get('/api/users')).status, 401);
      assert.equal((await login('Changed-Admin-only-4829')).status, 200);
      assert.equal((await admin.get('/api/users')).status, 403);
    },
  );
  await t.test(
    'deleting and restoring a user preserves report history and revokes sign-in',
    async () => {
      const before = Number(
        (await db.query('SELECT count(*) FROM voip.sheets WHERE created_by=$1', [target.id]))
          .rows[0].count,
      );
      assert.ok(before > 0);
      assert.equal((await mutate('delete', endpoint, { version: 3 })).status, 200);
      assert.equal((await admin.get('/api/me')).status, 401);
      assert.equal((await login('Changed-Admin-only-4829')).status, 401);
      assert.ok(!(await owner.get('/api/users')).body.some((u) => u.id === target.id));
      assert.ok(
        (await owner.get('/api/users?includeDeleted=true')).body.find((u) => u.id === target.id)
          .deleted_at,
      );
      assert.equal(
        Number(
          (await db.query('SELECT count(*) FROM voip.sheets WHERE created_by=$1', [target.id]))
            .rows[0].count,
        ),
        before,
      );
      assert.equal((await mutate('post', `${endpoint}/restore`, { version: 3 })).status, 409);
      assert.equal((await mutate('post', `${endpoint}/restore`, { version: 4 })).status, 200);
      assert.equal(
        (await admin.get('/api/me')).status,
        401,
        'Restoration must not restore revoked sessions',
      );
      assert.equal((await login('Changed-Admin-only-4829')).status, 200);
      const audit = (await db.query('SELECT detail FROM voip.user_audit')).rows;
      assert.ok(!JSON.stringify(audit).includes('Changed-Admin-only-4829'));
    },
  );
}
