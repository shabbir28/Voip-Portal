import assert from 'node:assert/strict';
import request from 'supertest';
import { todayInZone } from '../shared/time.js';
export async function verifyReportOwnership(t, app, owner, mutate) {
  const other = request.agent(app);
  const write = (method, url, body) => other[method](url).set('X-Voip-Request', '1').send(body);
  await mutate('post', '/api/users', {
    name: 'Isolated user',
    email: 'isolated@example.test',
    password: 'Isolation-test-4829',
    role: 'admin',
  });
  assert.equal(
    (
      await write('post', '/api/login', {
        email: 'isolated@example.test',
        password: 'Isolation-test-4829',
      })
    ).status,
    200,
  );
  const day = todayInZone(),
    query = '?from=' + day + '&to=' + day;
  const catalog = (await owner.get('/api/catalog')).body;
  const dialer = catalog.dialers[0],
    vendor = (await owner.get('/api/vendors')).body[0];
  await t.test('new account has no reports or exported KPI data from other users', async () => {
    for (const url of ['/api/sheets', '/api/reports/range' + query, '/api/vendor-reports' + query])
      assert.deepEqual((await other.get(url)).body, []);
  });
  for (const kind of ['dialer', 'vendor']) {
    await t.test(
      kind + ' reports enforce ownership for reads, every edit action and exports',
      async () => {
        const base = kind === 'dialer' ? '/api/sheets' : '/api/vendor-reports';
        const payload =
          kind === 'dialer'
            ? {
                name: 'Owner shift',
                report_date: day,
                start: '18:30',
                end: '04:30',
                dialer_ids: [dialer.id],
              }
            : { name: 'Owner vendor shift', report_date: day, vendor_ids: [vendor.id] };
        const made = await mutate('post', base, payload);
        assert.equal(made.status, 201);
        const own = await write('post', base, {
          ...payload,
          name: 'Independent shift',
          created_by: 1,
        });
        assert.equal(own.status, 201);
        const url = base + '/' + made.body.id,
          otherUrl = base + '/' + own.body.id;
        const entry =
          kind === 'dialer'
            ? { dialer_id: dialer.id, slot: 0, amount: 73 }
            : { vendor_id: vendor.id, slot: 0, amount: 73 };
        assert.equal(
          (await mutate('put', url + '/entries', { version: 0, entries: [entry] })).status,
          200,
        );
        assert.equal((await other.get(url)).status, 404);
        assert.equal((await owner.get(otherUrl)).status, 404);
        assert.equal(
          (
            await write('put', url + '/entries', {
              version: 1,
              entries: [{ ...entry, amount: 999 }],
            })
          ).status,
          404,
        );
        for (const action of [
          'rename',
          'clear',
          'remove',
          'restore',
          ...(kind === 'vendor' ? ['add'] : []),
        ]) {
          const suffix = kind === 'dialer' ? '/dialers/' + dialer.id : '/rows/' + vendor.id;
          assert.equal(
            (await write('patch', url + suffix, { version: 1, action, name: 'Blocked' })).status,
            404,
          );
        }
        if (kind === 'dialer')
          assert.equal(
            (
              await write('post', url + '/dialers', {
                version: 1,
                campaign_id: dialer.campaign_id,
                name: 'Blocked row',
              })
            ).status,
            404,
          );
        const blank = (await other.get(otherUrl)).body;
        assert.equal(blank.summary.total, 0);
        assert.equal(
          (
            await write('put', otherUrl + '/entries', {
              version: 0,
              entries: [{ ...entry, amount: 21 }],
            })
          ).status,
          200,
        );
        assert.equal((await owner.get(url)).body.summary.total, 73);
        assert.equal((await other.get(otherUrl)).body.summary.total, 21);
        const rangeUrl = kind === 'dialer' ? '/api/reports/range' + query : base + query;
        const range = (await other.get(rangeUrl)).body;
        assert.deepEqual(
          range.map((r) => r.id),
          [own.body.id],
        );
        assert.equal(Number(range[0].entries[0].amount), 21);
        if (kind === 'dialer')
          assert.deepEqual(
            (await other.get('/api/sheets')).body.map((r) => r.id),
            [own.body.id],
          );
      },
    );
  }
}
