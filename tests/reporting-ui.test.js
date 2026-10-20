import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatePresets } from '../src/utils/dateRanges.js';
import { withDraft, aggregateReports } from '../src/utils/reports.js';
import { reportsCsv, sheetCsv } from '../src/utils/download.js';
import { makeSlots, summarize } from '../shared/reporting.js';
test('date presets use Monday weeks and handle leap months and year boundaries', () => {
  const week = getDatePresets('2026-10-21').find((p) => p.label === 'This Week');
  assert.deepEqual(week, { label: 'This Week', from: '2026-10-19', to: '2026-10-25' });
  const last = getDatePresets('2024-03-10').at(-1);
  assert.equal(last.from, '2024-02-01');
  assert.equal(last.to, '2024-02-29');
  assert.equal(getDatePresets('2026-01-01')[1].from, '2025-12-31');
});
const report = {
  id: 1,
  name: 'Daily',
  report_date: '2026-10-20',
  config: {
    slots: makeSlots('18:30', '19:30'),
    dialers: [{ id: 1, name: 'Dialer', campaign: 'ACA', campaign_id: 1 }],
  },
  entries: [{ dialer_id: 1, slot: 0, amount: '10.10' }],
};
test('draft edits update row and interval totals without mutating saved data', () => {
  const entries = withDraft(report, { '1:0': '0.10', '1:1': '0.20' });
  const live = summarize(report.config, entries);
  assert.equal(live.total, 0.3);
  assert.equal(live.dialers[0].total, 0.3);
  assert.equal(report.entries[0].amount, '10.10');
  assert.equal(withDraft(report, { '1:0': '' }).length, 0);
  assert.equal(summarize(report.config, withDraft(report, { '1:1': '0' })).entered, 2);
});
test('range summary combines repeated dialers and all reports without double counting', () => {
  const s = aggregateReports([report, { ...report, id: 2, report_date: '2026-10-21' }]);
  assert.equal(s.total, 20.2);
  assert.equal(s.dialers.length, 1);
  assert.equal(s.dialers[0].completed, 2);
  assert.equal(s.expected, 4);
  assert.equal(s.days.length, 2);
});
test('downloads include recorded zero, missing amounts, dates and correct totals', () => {
  const data = {
    ...report,
    name: '=formula',
    entries: [...report.entries, { dialer_id: 1, slot: 1, amount: 0 }],
  };
  const csv = reportsCsv([data]);
  assert.ok(csv.includes("'=formula"));
  assert.ok(csv.includes('"2026-10-20"'));
  assert.ok(csv.includes('"0","Recorded"'));
  assert.ok(reportsCsv([report]).includes('"","Not reported"'));
  assert.ok(sheetCsv(data).includes('"Interval totals","10.1","0","10.1"'));
});
