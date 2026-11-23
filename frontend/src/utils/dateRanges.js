import { today } from './format.js';
const iso = (date) => date.toISOString().slice(0, 10);
const shift = (value, days) => {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
};
export function getDatePresets(reference = today()) {
  const d = new Date(`${reference}T12:00:00Z`),
    year = d.getUTCFullYear(),
    month = d.getUTCMonth();
  const monday = shift(reference, -((d.getUTCDay() + 6) % 7));
  return [
    { label: 'Today', from: reference, to: reference },
    { label: 'Yesterday', from: shift(reference, -1), to: shift(reference, -1) },
    { label: 'This Week', from: monday, to: shift(monday, 6) },
    { label: 'Last Week', from: shift(monday, -7), to: shift(monday, -1) },
    {
      label: 'This Month',
      from: iso(new Date(Date.UTC(year, month, 1))),
      to: iso(new Date(Date.UTC(year, month + 1, 0))),
    },
    {
      label: 'Last Month',
      from: iso(new Date(Date.UTC(year, month - 1, 1))),
      to: iso(new Date(Date.UTC(year, month, 0))),
    },
  ];
}
