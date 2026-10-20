import { makeSlots, summarize } from './reporting.js';
export const DEFAULT_VENDORS = [
  'Telcast_com',
  'Telcast_main',
  'Dial_egde',
  'Dial_360',
  'Go_Connectivo',
  'Contactivity_main',
  'Contactivity_com',
];
export function vendorSlots() {
  const halfHours = makeSlots('18:00', '04:00');
  return halfHours
    .filter((_, i) => i % 2 === 0)
    .map((slot, i) => ({ ...slot, end: halfHours[i * 2 + 1].end }));
}
export function vendorIntervalLabel(slot) {
  const hour = (time) => Number(time.split(':')[0]) % 12 || 12;
  return `${hour(slot.start)} to ${hour(slot.end)}`;
}
export function summarizeVendors(report) {
  const summary = summarize(
    { dialers: report.config.vendors, slots: report.config.slots },
    report.entries.map((e) => ({ ...e, dialer_id: e.vendor_id })),
  );
  return { ...summary, vendors: summary.dialers };
}
export function aggregateVendors(reports) {
  const vendors = new Map();
  let cents = 0,
    entered = 0,
    expected = 0;
  for (const report of reports) {
    const summary = summarizeVendors(report);
    entered += summary.entered;
    expected += summary.expected;
    for (const row of summary.vendors) {
      const current = vendors.get(row.id) || { id: row.id, name: row.name, cents: 0, completed: 0 };
      current.cents += Math.round(row.total * 100);
      current.completed += row.completed;
      vendors.set(row.id, current);
      cents += Math.round(row.total * 100);
    }
  }
  return {
    total: cents / 100,
    entered,
    expected,
    reportCount: reports.length,
    vendors: [...vendors.values()].map((v) => ({ ...v, total: v.cents / 100 })),
  };
}
