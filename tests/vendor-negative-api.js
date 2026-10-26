import assert from 'node:assert/strict';

export async function verifyVendorNegativeApi(t, agent, mutate) {
  const vendors = (await agent.get('/api/vendors')).body;
  const vendorA = vendors[0];
  const vendorB = vendors[1];
  let reportId;

  await t.test('vendor negative reports create, validate and return initial summary', async () => {
    assert.ok(vendors.length >= 2);
    const r = await mutate('post', '/api/vendor-negative-reports', {
      name: 'Shift Negative Test',
      report_date: '2026-10-21',
      vendor_ids: [vendorA.id, vendorB.id],
    });
    assert.equal(r.status, 201);
    reportId = r.body.id;

    const report = (await agent.get(`/api/vendor-negative-reports/${reportId}`)).body;
    assert.equal(report.report_date, '2026-10-21');
    assert.equal(report.name, 'Shift Negative Test');
    assert.equal(report.summary.total, 0);
    assert.equal(report.summary.vendors.length, 2);
    assert.equal(report.summary.activeCount, 2);
    assert.equal(report.summary.negativeCount, 0);
    assert.equal(report.summary.topVendor, null);
  });

  const endpoint = `/api/vendor-negative-reports/${reportId}`;

  await t.test(
    'vendor negative entries persist amounts and notes, reject stale versions',
    async () => {
      const entries = [
        { vendor_id: vendorA.id, amount: 150.5, note: 'Overcharge adjustment' },
        { vendor_id: vendorB.id, amount: 80.0, note: 'Dispute' },
      ];

      // Save with version 0
      const res = await mutate('put', `${endpoint}/entries`, { version: 0, entries });
      assert.equal(res.status, 200);
      assert.equal(res.body.version, 1);

      // Stale version rejected
      const staleRes = await mutate('put', `${endpoint}/entries`, { version: 0, entries });
      assert.equal(staleRes.status, 409);

      // Verify fetched summary
      const report = (await agent.get(endpoint)).body;
      assert.equal(report.summary.total, 230.5);
      assert.equal(report.summary.negativeCount, 2);
      assert.equal(report.summary.topVendor.name, vendorA.name);
      assert.equal(report.summary.topVendor.amount, 150.5);
      assert.equal(report.summary.vendors[0].amount, 150.5);
      assert.equal(report.summary.vendors[0].note, 'Overcharge adjustment');
    },
  );

  await t.test('vendor negative report rows can be cleared, removed and restored', async () => {
    // Clear vendorB amount
    const clearRes = await mutate('patch', `${endpoint}/rows/${vendorB.id}`, {
      version: 1,
      action: 'clear',
    });
    assert.equal(clearRes.status, 200);

    let report = (await agent.get(endpoint)).body;
    assert.equal(report.summary.total, 150.5);
    assert.equal(report.summary.negativeCount, 1);

    // Remove vendorB row
    const removeRes = await mutate('patch', `${endpoint}/rows/${vendorB.id}`, {
      version: 2,
      action: 'remove',
    });
    assert.equal(removeRes.status, 200);

    report = (await agent.get(endpoint)).body;
    assert.equal(report.summary.vendors.length, 1);
    assert.equal(report.config.removedVendors.length, 1);

    // Restore vendorB row
    const restoreRes = await mutate('patch', `${endpoint}/rows/${vendorB.id}`, {
      version: 3,
      action: 'restore',
    });
    assert.equal(restoreRes.status, 200);

    report = (await agent.get(endpoint)).body;
    assert.equal(report.summary.vendors.length, 2);
    assert.equal(report.config.removedVendors.length, 0);
  });

  await t.test(
    'vendor negative reports date range query returns reports with summaries',
    async () => {
      const listRes = await agent.get('/api/vendor-negative-reports?from=2026-10-20&to=2026-10-22');
      assert.equal(listRes.status, 200);
      assert.ok(Array.isArray(listRes.body));
      assert.ok(listRes.body.some((r) => r.id === reportId));
      const item = listRes.body.find((r) => r.id === reportId);
      assert.equal(item.summary.total, 150.5);
    },
  );

  await t.test('fixed standing vendor negative sheet fetches and updates in place', async () => {
    const sheetRes = await agent.get('/api/vendor-negative/sheet');
    assert.equal(sheetRes.status, 200);
    assert.ok(sheetRes.body.id);
    assert.ok(sheetRes.body.summary);

    const initialVersion = sheetRes.body.version;
    const updateRes = await mutate('put', '/api/vendor-negative/sheet', {
      version: initialVersion,
      entries: [
        { vendor_id: vendorA.id, amount: 250, total_credit: 1250, note: 'Standing deduction' },
      ],
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.version, initialVersion + 1);

    const reFetch = await agent.get('/api/vendor-negative/sheet');
    assert.equal(reFetch.status, 200);
    const vendorRow = reFetch.body.summary.vendors.find((v) => v.id === vendorA.id);
    assert.equal(vendorRow.amount, 250);
    assert.equal(vendorRow.totalCredit, 1250);
    assert.equal(vendorRow.remainingCredit, 1000);
    assert.equal(vendorRow.lowCredit, true);

    const recharge = await mutate('put', '/api/vendor-negative/sheet', {
      version: reFetch.body.version,
      entries: [{ vendor_id: vendorA.id, amount: null, total_credit: 2000 }],
    });
    assert.equal(recharge.status, 200);
    assert.equal(
      recharge.body.summary.vendors.find((v) => v.id === vendorA.id).remainingCredit,
      2000,
    );
    const clearedAmount = await mutate('put', '/api/vendor-negative/sheet', {
      version: recharge.body.version,
      entries: [{ vendor_id: vendorA.id, amount: 0 }],
    });
    assert.equal(clearedAmount.status, 200);
    assert.equal(
      clearedAmount.body.summary.vendors.find((v) => v.id === vendorA.id).totalCredit,
      2000,
    );
    assert.equal(
      clearedAmount.body.summary.vendors.find((v) => v.id === vendorA.id).lowCredit,
      false,
    );
  });
}
