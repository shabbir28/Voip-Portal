export const DEFAULT_SHIFT_START = '18:30';
export const DEFAULT_SHIFT_LAST_SLOT = '05:00';
export const DEFAULT_SHIFT_END = '05:30';

export function addMinutesToTime(timeStr, mins = 30) {
  const total =
    (Number(timeStr.slice(0, 2)) * 60 + Number(timeStr.slice(3)) + mins + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export const HALF_HOUR_TIMES = Array.from({ length: 48 }, (_, i) => {
  const m = i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});

export function makeSlots(start = DEFAULT_SHIFT_START, end = DEFAULT_SHIFT_END) {
  const minutes = (x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  const from = minutes(start);
  let to = minutes(end);
  if (to <= from) to += 1440;
  const label = (m) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return Array.from({ length: (to - from) / 30 }, (_, i) => ({
    start: label(from + i * 30),
    end: label(from + (i + 1) * 30),
    dayOffset: Math.floor((from + i * 30) / 1440),
  }));
}
export function summarize(config, entries) {
  const amounts = new Map(
    entries.map((e) => [`${e.dialer_id}:${e.slot}`, Math.round(Number(e.amount) * 100)]),
  );
  const dialers = config.dialers.map((d) => ({
    ...d,
    total: config.slots.reduce((n, _, i) => n + (amounts.get(`${d.id}:${i}`) || 0), 0) / 100,
    completed: config.slots.filter((_, i) => amounts.has(`${d.id}:${i}`)).length,
  }));
  let cumulative = 0;
  const intervals = config.slots.map((s, i) => {
    const cents = dialers.reduce((n, d) => n + (amounts.get(`${d.id}:${i}`) || 0), 0);
    cumulative += cents;
    return { ...s, slot: i, total: cents / 100, cumulative: cumulative / 100 };
  });
  return {
    total: cumulative / 100,
    dialers,
    intervals,
    entered: amounts.size,
    expected: dialers.length * config.slots.length,
  };
}
