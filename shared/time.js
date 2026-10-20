import { DateTime } from 'luxon';
export const REPORT_TIMEZONE = 'America/New_York';
export const TIMEZONE_LABEL = 'US Eastern';
export function todayInZone(now = new Date()) {
  return DateTime.fromJSDate(now, { zone: REPORT_TIMEZONE }).toISODate();
}
export function timezoneAbbreviation(now = new Date()) {
  return DateTime.fromJSDate(now, { zone: REPORT_TIMEZONE }).offsetNameShort;
}
export function formatTimestamp(value) {
  return DateTime.fromISO(value, { zone: REPORT_TIMEZONE }).toFormat('dd LLL yyyy, hh:mm a ZZZZ');
}
// Convert only the presentation. Stored report dates, slots and amounts are never rewritten.
export function presentReport(report) {
  const source = report.config.timezone || 'Asia/Karachi';
  if (source === REPORT_TIMEZONE) return report;
  const date = DateTime.fromISO(report.report_date, { zone: source });
  const at = (time, dayOffset = 0) =>
    DateTime.fromISO(`${date.plus({ days: dayOffset }).toISODate()}T${time}`, { zone: source });
  const displayDate = at(report.config.slots[0].start).setZone(REPORT_TIMEZONE).toISODate();
  const slots = report.config.slots.map((s) => {
    const start = at(s.start, s.dayOffset),
      end = at(s.end, (s.dayOffset || 0) + (s.end <= s.start ? 1 : 0));
    const displayed = start.setZone(REPORT_TIMEZONE);
    return {
      ...s,
      start: displayed.toFormat('HH:mm'),
      end: end.setZone(REPORT_TIMEZONE).toFormat('HH:mm'),
      dayOffset: Math.round(
        DateTime.fromISO(displayed.toISODate()).diff(DateTime.fromISO(displayDate), 'days').days,
      ),
    };
  });
  return {
    ...report,
    report_date: displayDate,
    original_report_date: report.report_date,
    original_timezone: source,
    config: { ...report.config, timezone: REPORT_TIMEZONE, slots },
  };
}
