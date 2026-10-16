// A date with no time ('2026-11-03') is a day on the calendar, not an
// instant. new Date('2026-11-03') reads it as midnight UTC, and the local
// getters then give the day before anywhere west of Greenwich (and
// toISOString gives yesterday after midnight in Israel). These read and
// write such days in the phone's own time. Pure: tests/dates.test.mjs.

// '2026-11-03' → that day's local midnight; anything else → null.
export function localDay(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

// A Date → its local day, '2026-11-03'.
export function isoDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
