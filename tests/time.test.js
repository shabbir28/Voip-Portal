import test from 'node:test';
import assert from 'node:assert/strict';
import {
  todayInZone,
  timezoneAbbreviation,
  presentReport,
  formatTimestamp,
} from '../shared/time.js';
import { makeSlots } from '../shared/reporting.js';
test('US Eastern dates use the local day and automatic daylight saving', () => {
  assert.equal(todayInZone(new Date('2026-10-21T02:00:00Z')), '2026-10-20');
  assert.equal(timezoneAbbreviation(new Date('2026-07-01T12:00:00Z')), 'EDT');
  assert.equal(timezoneAbbreviation(new Date('2026-01-01T12:00:00Z')), 'EST');
  assert.ok(formatTimestamp('2026-07-01T12:00:00Z').includes('08:00 AM EDT'));
});
test('legacy Pakistan reports convert display slots and dates without rewriting source data', () => {
  const r = {
    report_date: '2026-10-20',
    config: { timezone: 'Asia/Karachi', slots: makeSlots('18:30', '04:30') },
  };
  const shown = presentReport(r);
  assert.equal(shown.config.slots[0].start, '09:30');
  assert.equal(shown.config.slots.at(-1).end, '19:30');
  assert.equal(shown.config.slots.at(-1).dayOffset, 0);
  assert.equal(r.config.slots[0].start, '18:30');
  assert.equal(
    presentReport({
      report_date: '2026-10-20',
      config: { timezone: 'Asia/Karachi', slots: makeSlots('02:00', '03:00') },
    }).report_date,
    '2026-10-19',
  );
});
