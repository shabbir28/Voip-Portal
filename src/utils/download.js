import { summarize } from '../../shared/reporting.js';
const escapeCell = (value) =>
  `"${String(value ?? '')
    .replace(/^[\s]*[=+\-@]/, "'$&")
    .replaceAll('"', '""')}"`;
export function reportsCsv(reports) {
  const rows = [
    [
      'Report date (US Eastern)',
      'Report',
      'Campaign',
      'Dialer',
      'Interval start',
      'Interval end',
      'Day offset',
      'Amount USD',
      'Status',
    ],
  ];
  for (const report of reports) {
    const entries = new Map(report.entries.map((e) => [`${e.dialer_id}:${e.slot}`, e.amount]));
    for (const d of report.config.dialers)
      for (const [slot, interval] of report.config.slots.entries()) {
        const amount = entries.get(`${d.id}:${slot}`);
        rows.push([
          report.report_date,
          report.name,
          d.campaign,
          d.name,
          interval.start,
          interval.end,
          interval.dayOffset,
          amount ?? '',
          amount === undefined ? 'Not reported' : 'Recorded',
        ]);
      }
  }
  return '\uFEFF' + rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}
export function sheetCsv(report) {
  const s = summarize(report.config, report.entries);
  const entries = new Map(report.entries.map((e) => [`${e.dialer_id}:${e.slot}`, e.amount]));
  const rows = [
    [
      'Date (US Eastern)',
      'Campaign',
      'Dialer',
      ...report.config.slots.map((i) => `${i.start}–${i.end}${i.dayOffset ? ' (+1 day)' : ''}`),
      'Total USD',
    ],
  ];
  for (const d of s.dialers)
    rows.push([
      report.report_date,
      d.campaign,
      d.name,
      ...report.config.slots.map((_, i) => entries.get(`${d.id}:${i}`) ?? ''),
      d.total,
    ]);
  rows.push(['', '', 'Interval totals', ...s.intervals.map((i) => i.total), s.total]);
  rows.push(['', '', 'Running totals', ...s.intervals.map((i) => i.cumulative), s.total]);
  return '\uFEFF' + rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}
export function downloadReports(reports, name, single = false) {
  const url = URL.createObjectURL(
    new Blob([single ? sheetCsv(reports[0]) : reportsCsv(reports)], {
      type: 'text/csv;charset=utf-8',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
