const cell = (value) =>
  `"${String(value ?? '')
    .replace(/^[\s]*[=+\-@]/, "'$&")
    .replaceAll('"', '""')}"`;

export function vendorNegativeCsv(reports) {
  const rows = [
    [
      'Date (US Eastern)',
      'Report Name',
      'Vendor',
      'Vendor Negative Amount (USD)',
    ],
  ];

  for (const report of reports) {
    const vendors = report.summary?.vendors || [];
    for (const v of vendors) {
      rows.push([
        report.report_date,
        report.name,
        v.name,
        v.amount || 0,
      ]);
    }
    rows.push([
      report.report_date,
      report.name,
      'Total Vendor Negative',
      report.summary?.total || 0,
    ]);
  }

  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

export function downloadVendorNegative(reports, name) {
  const url = URL.createObjectURL(
    new Blob([vendorNegativeCsv(reports)], { type: 'text/csv;charset=utf-8;' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
