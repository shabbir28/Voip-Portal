import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSlots, summarize } from '../server/model.js';
test('night shift has 20 half-hour slots and rolls over midnight', () => {
  const slots = makeSlots();
  assert.equal(slots.length, 20);
  assert.deepEqual(slots[11], { start: '00:00', end: '00:30', dayOffset: 1 });
  assert.equal(slots.at(-1).end, '04:30');
});
test('totals preserve cents, zero counts as recorded, blank does not', () => {
  const config = { slots: makeSlots('18:30', '19:30'), dialers: [{ id: 1 }, { id: 2 }] };
  const summary = summarize(config, [
    { dialer_id: 1, slot: 0, amount: '0.10' },
    { dialer_id: 2, slot: 0, amount: '0.20' },
    { dialer_id: 1, slot: 1, amount: '0' },
  ]);
  assert.equal(summary.total, 0.3);
  assert.equal(summary.entered, 3);
  assert.equal(summary.expected, 4);
  assert.equal(summary.intervals[1].cumulative, 0.3);
  assert.equal(summary.dialers[0].completed, 2);
});
