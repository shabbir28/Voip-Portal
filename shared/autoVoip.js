import { DateTime } from 'luxon';

export const AUTO_VOIP_TIMEZONE = 'Asia/Karachi';
export const AUTO_VOIP_SHIFT_START = '17:00';
export const AUTO_VOIP_SHIFT_END = '07:00';
export const INTERVAL_MS = 30 * 60 * 1000;
export const SAMPLE_DELAY_MS = 20_000;
export const MAX_SAMPLE_DELAY_MS = 120_000;

export function autoVoipShift(date) {
  const start = DateTime.fromISO(`${date}T${AUTO_VOIP_SHIFT_START}`, { zone: AUTO_VOIP_TIMEZONE });
  const endDate = start.plus({ days: 1 }).toISODate();
  const end = DateTime.fromISO(`${endDate}T${AUTO_VOIP_SHIFT_END}`, { zone: AUTO_VOIP_TIMEZONE });
  return { start, end };
}

// After midnight the remaining readings still belong to the previous evening's report.
export function autoVoipShiftDate(at = Date.now()) {
  const local = DateTime.fromMillis(at, { zone: AUTO_VOIP_TIMEZONE });
  const date = local.toFormat('HH:mm') < AUTO_VOIP_SHIFT_START ? local.minus({ days: 1 }) : local;
  return date.toISODate();
}

export function nextAutoVoipBoundary(boundary) {
  const { start, end } = autoVoipShift(autoVoipShiftDate(boundary));
  return boundary <= +end ? boundary : +start.plus({ days: 1 });
}
