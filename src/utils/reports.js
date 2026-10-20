import { summarize } from '../../shared/reporting.js';
export function withDraft(sheet, draft) {
  if (!sheet) return [];
  const entries = new Map(sheet.entries.map((e) => [`${e.dialer_id}:${e.slot}`, e]));
  for (const [key, value] of Object.entries(draft)) {
    const [dialer_id, slot] = key.split(':').map(Number);
    if (value === '') entries.delete(key);
    else if (Number.isFinite(Number(value)) && Number(value) >= 0)
      entries.set(key, { dialer_id, slot, amount: Number(value) });
  }
  return [...entries.values()];
}
export function aggregateReports(reports) {
  const dialers = new Map(),
    days = new Map();
  let cents = 0,
    entered = 0,
    expected = 0;
  for (const report of reports) {
    const summary = summarize(report.config, report.entries);
    cents += Math.round(summary.total * 100);
    entered += summary.entered;
    expected += summary.expected;
    const day = days.get(report.report_date) || { date: report.report_date, cents: 0, reports: 0 };
    day.cents += Math.round(summary.total * 100);
    day.reports++;
    days.set(report.report_date, day);
    for (const d of summary.dialers) {
      const existing = dialers.get(d.id) || { ...d, cents: 0, completed: 0, expected: 0 };
      existing.cents += Math.round(d.total * 100);
      existing.completed += d.completed;
      existing.expected += report.config.slots.length;
      dialers.set(d.id, existing);
    }
  }
  return {
    total: cents / 100,
    entered,
    expected,
    reportCount: reports.length,
    dialers: [...dialers.values()].map((d) => ({ ...d, total: d.cents / 100 })),
    days: [...days.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, total: d.cents / 100 })),
  };
}
