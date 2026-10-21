/* Where a place's date and time (`event`) stands right now (the owner's
   ask, 8.71.0): 'upcoming', 'live' or 'past'. The card shows it as a dot
   by the date. Pure: tests/whenState.test.mjs.

   - A date with no time: the whole day, or the whole days of a range.
   - A date with a time: from it to the end time (past midnight when the
     end is earlier), or for POINT_MINUTES when there is no end time.
   - A range with a time is open every day in those hours (8.70.1): live
     inside the hours, upcoming between them, past after the last day's. */

export const POINT_MINUTES = 60;

const at = (iso, hhmm = '00:00', addDays = 0) => {
  const [y, m, d] = iso.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d + addDays, h || 0, min || 0);
};
const isoOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function whenState(ev, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev?.startDate || '')) return null;
  const first = ev.startDate;
  const last = /^\d{4}-\d{2}-\d{2}$/.test(ev.endDate || '') && ev.endDate > first ? ev.endDate : first;
  const t0 = ev.startTime || '', t1 = ev.endTime || '';
  const span = (from, to) => (now < from ? 'upcoming' : now < to ? 'live' : 'past');
  if (!t0) return span(at(first), at(last, '00:00', 1));

  // One day's hours: [opens, closes).
  const hours = (iso) => {
    const from = at(iso, t0);
    if (!t1) return [from, new Date(from.getTime() + POINT_MINUTES * 60e3)];
    const to = at(iso, t1);
    return [from, to > from ? to : at(iso, t1, 1)];
  };
  if (last === first) return span(...hours(first));

  if (now < hours(first)[0]) return 'upcoming';
  if (now >= hours(last)[1]) return 'past';
  // Today's hours, or last night's that run past midnight.
  const today = isoOf(now), yesterday = isoOf(at(today, '00:00', -1));
  for (const iso of [today, yesterday]) {
    if (iso < first || iso > last) continue;
    const [from, to] = hours(iso);
    if (now >= from && now < to) return 'live';
  }
  return 'upcoming';
}
