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
      'Total Credit (USD)',
      'Vendor Negative Amount (USD)',
      'Remaining Credit (USD)',
    ],
  ];

  for (const report of reports) {
    const vendors = report.summary?.vendors || [];
    for (const v of vendors) {
      rows.push([
        report.report_date,
        report.name,
        v.name,
        v.totalCredit,
        v.amount || 0,
        v.remainingCredit,
      ]);
    }
    rows.push([
      report.report_date,
      report.name,
      'Total Vendor Negative',
      vendors.reduce((n, v) => n + (v.totalCredit ?? 0), 0),
      report.summary?.total || 0,
      vendors.reduce((n, v) => n + (v.remainingCredit ?? 0), 0),
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
