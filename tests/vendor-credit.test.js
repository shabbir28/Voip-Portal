import test from 'node:test';
import assert from 'node:assert/strict';
import { vendorCredit } from '../shared/vendorCredit.js';
import { negativeEntry, summarizeNegative } from '../server/routes/VendorNegative.js';
import { vendorNegativeCsv } from '../src/utils/vendorNegativeDownload.js';

test('credit threshold includes 1000, zero and overdrafts but excludes unconfigured credit', () => {
  assert.equal(vendorCredit(null, 5000).lowCredit, false);
  assert.equal(vendorCredit('', 0).remainingCredit, null);
  assert.equal(vendorCredit(2000, 999.99).lowCredit, false);
  assert.equal(vendorCredit(2000, 1000).lowCredit, true);
  assert.equal(vendorCredit(0, 0).lowCredit, true);
  assert.equal(vendorCredit(100, 150).remainingCredit, -50);
  assert.equal(vendorCredit(1000.3, 0.3).remainingCredit, 1000);
});

test('credit validation rejects negative, excessive precision and non-finite amounts', () => {
  for (const total_credit of [-1, 1.001, Infinity, 10000000000]) {
    assert.equal(
      negativeEntry.safeParse({ vendor_id: 1, amount: null, total_credit }).success,
      false,
    );
  }
  assert.equal(
    negativeEntry.parse({ vendor_id: 1, amount: null, total_credit: 0 }).total_credit,
    0,
  );
});

test('summary and CSV retain credit-only entries and remaining balances', () => {
  const report = summarizeNegative({
    config: { vendors: [{ id: 1, name: 'Vendor' }] },
    entries: [{ vendor_id: 1, amount: null, total_credit: 500 }],
  });
  assert.equal(report.summary.vendors[0].remainingCredit, 500);
  assert.equal(report.summary.vendors[0].lowCredit, true);
  assert.match(vendorNegativeCsv([report]), /"500","0","500"/);
});
