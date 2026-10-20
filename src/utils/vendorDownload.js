import { summarizeVendors, vendorSlots, vendorIntervalLabel } from '../../shared/vendors.js';
const cell = (value) =>
  `"${String(value ?? '')
    .replace(/^[\s]*[=+\-@]/, "'$&")
    .replaceAll('"', '""')}"`;
export function vendorCsv(reports) {
  const rows = [
    [
      'Date (US Eastern)',
      'Report (6 PM–4 AM US Eastern)',
      'Vendor',
      ...vendorSlots().map(vendorIntervalLabel),
      'Total USD',
    ],
  ];
  for (const report of reports) {
    const s = summarizeVendors(report),
      entries = new Map(report.entries.map((e) => [`${e.vendor_id}:${e.slot}`, e.amount]));
    for (const v of s.vendors)
      rows.push([
        report.report_date,
        report.name,
        v.name,
        ...report.config.slots.map((_, i) => entries.get(`${v.id}:${i}`) ?? ''),
        v.total,
      ]);
    rows.push([
      report.report_date,
      report.name,
      'Interval totals',
      ...s.intervals.map((i) => i.total),
      s.total,
    ]);
    rows.push([
      report.report_date,
      report.name,
      'Running totals',
      ...s.intervals.map((i) => i.cumulative),
      s.total,
    ]);
  }
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
export function downloadVendors(reports, name) {
  const url = URL.createObjectURL(
    new Blob([vendorCsv(reports)], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
