import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateVendors, vendorSlots } from '../shared/vendors.js';
import { vendorCsv } from '../src/utils/vendorDownload.js';
const report = {
  report_date: '2026-10-20',
  name: 'Provider report',
  config: {
    vendors: [
      { id: 1, name: '=unsafe' },
      { id: 2, name: 'Other' },
    ],
    slots: vendorSlots(),
  },
  entries: [
    { vendor_id: 1, slot: 0, amount: 0.1 },
    { vendor_id: 2, slot: 0, amount: 0.2 },
    { vendor_id: 1, slot: 1, amount: 0 },
  ],
};
test('vendor overview aggregates by vendor ID across reports without floating-point drift', () => {
  const s = aggregateVendors([report, report]);
  assert.equal(s.total, 0.6);
  assert.equal(s.vendors[0].total, 0.2);
  assert.equal(s.entered, 6);
  assert.equal(s.expected, 40);
});
test('vendor export includes all hourly columns, totals, blanks and formula-safe names', () => {
  const csv = vendorCsv([report]);
  assert.ok(csv.includes('Date (US Eastern)'));
  assert.ok(
    csv.includes(
      '"6 to 7","7 to 8","8 to 9","9 to 10","10 to 11","11 to 12","12 to 1","1 to 2","2 to 3","3 to 4"',
    ),
  );
  assert.ok(csv.includes("'=unsafe"));
  assert.ok(csv.includes('"0.1","0",""'));
  assert.ok(csv.includes('"Interval totals","0.3"'));
  assert.ok(csv.includes('"Running totals","0.3","0.3"'));
});
