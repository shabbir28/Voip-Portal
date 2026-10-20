import assert from 'node:assert/strict';
import { migrate } from '../server/db.js';
export async function verifyVendorApi(t, agent, mutate, db) {
  const vendors = (await agent.get('/api/vendors')).body;
  const vendor = vendors[0],
    another = vendors[1];
  let reportId;
  await t.test('vendor reports use reference vendors and ten Eastern hourly columns', async () => {
    assert.equal(vendors.length, 7);
    assert.equal(vendor.name, 'Telcast_com');
    const r = await mutate('post', '/api/vendor-reports', {
      name: 'Vendor test',
      report_date: '2026-10-20',
      vendor_ids: [vendor.id, another.id],
    });
    assert.equal(r.status, 201);
    reportId = r.body.id;
    const report = (await agent.get(`/api/vendor-reports/${reportId}`)).body;
    assert.equal(report.config.slots.length, 10);
    assert.equal(report.config.slots[0].start, '18:00');
    assert.equal(report.config.slots[9].end, '04:00');
    assert.equal(report.config.slots[6].dayOffset, 1);
    assert.equal(report.config.timezone, 'America/New_York');
    assert.equal(report.report_date, '2026-10-20');
    assert.equal(report.summary.total, 0);
    assert.equal(
      (
        await mutate('post', '/api/vendor-reports', {
          name: 'Bad',
          report_date: '2026-02-30',
          vendor_ids: [vendor.id],
        })
      ).status,
      400,
    );
  });
  const endpoint = `/api/vendor-reports/${reportId}`;
  await t.test(
    'vendor entries persist exact totals, zero and blank; stale edits rejected',
    async () => {
      const values = [
        { vendor_id: vendor.id, slot: 0, amount: 10.1 },
        { vendor_id: vendor.id, slot: 1, amount: 0 },
        { vendor_id: another.id, slot: 0, amount: 20.2 },
      ];
      assert.equal(
        (await mutate('put', `${endpoint}/entries`, { version: 0, entries: values })).status,
        200,
      );
      assert.equal(
        (await mutate('put', `${endpoint}/entries`, { version: 0, entries: values })).status,
        409,
      );
      const report = (await agent.get(endpoint)).body;
      assert.equal(report.summary.total, 30.3);
      assert.equal(report.summary.entered, 3);
      assert.equal(report.summary.vendors[0].total, 10.1);
      assert.equal(report.summary.intervals[0].total, 30.3);
      assert.equal(report.activity[0].detail.count, 3);
      assert.equal(
        (
          await mutate('put', `${endpoint}/entries`, {
            version: 1,
            entries: [{ vendor_id: vendor.id, slot: 1, amount: null }],
          })
        ).status,
        200,
      );
      assert.equal((await agent.get(endpoint)).body.summary.entered, 2);
      for (const entries of [
        [{ vendor_id: 99999, slot: 0, amount: 1 }],
        [{ vendor_id: vendor.id, slot: 10, amount: 1 }],
        [{ vendor_id: vendor.id, slot: 1, amount: -1 }],
        [{ vendor_id: vendor.id, slot: 1, amount: 1.001 }],
        [values[0], values[0]],
      ])
        assert.equal(
          (await mutate('put', `${endpoint}/entries`, { version: 2, entries })).status,
          400,
        );
      assert.equal((await agent.get(endpoint)).body.version, 2);
    },
  );
  await t.test('vendor directory edits and soft deletion preserve historical reports', async () => {
    assert.equal(
      (await mutate('patch', `/api/vendors/${vendor.id}`, { name: 'Renamed provider' })).status,
      200,
    );
    assert.equal((await agent.get(endpoint)).body.config.vendors[0].name, 'Telcast_com');
    await migrate(db);
    assert.equal(
      (await agent.get('/api/vendors')).body.length,
      7,
      'Migration must not recreate renamed seed vendors',
    );
    assert.equal((await mutate('delete', `/api/vendors/${vendor.id}`, {})).status, 200);
    assert.equal((await agent.get('/api/vendors')).body.length, 6);
    assert.equal((await agent.get('/api/vendors?includeDeleted=true')).body.length, 7);
    assert.equal(
      (
        await mutate('post', '/api/vendor-reports', {
          name: 'Archived',
          report_date: '2026-10-20',
          vendor_ids: [vendor.id],
        })
      ).status,
      400,
    );
    assert.equal((await agent.get(endpoint)).body.summary.total, 30.3);
    assert.equal((await mutate('post', `/api/vendors/${vendor.id}/restore`, {})).status, 200);
  });
  await t.test(
    'vendor row removal, restoration, rename, clear and addition are versioned',
    async () => {
      const row = `${endpoint}/rows/${vendor.id}`;
      assert.equal((await mutate('patch', row, { version: 2, action: 'remove' })).status, 200);
      let r = (await agent.get(endpoint)).body;
      assert.equal(r.summary.total, 20.2);
      assert.equal(r.config.removedVendors[0].entries[0].amount, 10.1);
      assert.equal((await mutate('patch', row, { version: 3, action: 'add' })).status, 400);
      assert.equal((await mutate('patch', row, { version: 3, action: 'restore' })).status, 200);
      assert.equal((await agent.get(endpoint)).body.summary.total, 30.3);
      assert.equal(
        (await mutate('patch', row, { version: 4, action: 'rename', name: 'Report-only label' }))
          .status,
        200,
      );
      assert.equal(
        (await agent.get('/api/vendors')).body.find((v) => v.id === vendor.id).name,
        'Renamed provider',
      );
      assert.equal((await mutate('patch', row, { version: 5, action: 'clear' })).status, 200);
      r = (await agent.get(endpoint)).body;
      assert.equal(r.summary.total, 20.2);
      assert.equal(r.activity[0].detail.previous[0].amount, 10.1);
      const created = await mutate('post', '/api/vendors', { name: 'New provider' });
      assert.equal(created.status, 201);
      assert.equal(
        (
          await mutate('patch', `${endpoint}/rows/${created.body.id}`, {
            version: 6,
            action: 'add',
          })
        ).status,
        200,
      );
      assert.equal((await agent.get(endpoint)).body.config.vendors.length, 3);
      assert.equal(
        (
          await mutate('patch', `${endpoint}/rows/${created.body.id}`, {
            version: 7,
            action: 'add',
          })
        ).status,
        400,
      );
    },
  );
  await t.test('vendor date ranges include overnight shift by Eastern start date', async () => {
    let r = await agent.get('/api/vendor-reports?from=2026-10-20&to=2026-10-20');
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 1);
    assert.equal(r.body[0].summary.total, 20.2);
    assert.equal(
      (await agent.get('/api/vendor-reports?from=2026-10-21&to=2026-10-21')).body.length,
      0,
    );
    assert.equal(
      (await agent.get('/api/vendor-reports?from=2026-10-21&to=2026-10-20')).status,
      400,
    );
    assert.equal(
      (await agent.get('/api/vendor-reports?from=2020-01-01&to=2026-01-01')).status,
      400,
    );
  });
}
