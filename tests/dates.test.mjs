// Days without a time are calendar days in the phone's own time zone.
//   TZ=America/New_York node --test tests/dates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { localDay, isoDay } from '../src/lib/dates.js';

test('a day is read as that day here, whatever the time zone', () => {
  const d = localDay('2026-11-03');
  assert.equal(d.getFullYear(), 2026); assert.equal(d.getMonth(), 10); assert.equal(d.getDate(), 3);
  assert.equal(d.getDay(), 2);                         // Tuesday
  assert.equal(d.getHours(), 0);
});

test('a day goes back to the same text', () => {
  assert.equal(isoDay(localDay('2026-03-29')), '2026-03-29');
  assert.equal(isoDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('days step across a clock change without skipping', () => {
  const cur = localDay('2026-10-24');
  const out = [];
  for (let i = 0; i < 3; i++) { out.push(isoDay(cur)); cur.setDate(cur.getDate() + 1); }
  assert.deepEqual(out, ['2026-10-24', '2026-10-25', '2026-10-26']);
});

test('anything that is not a day is null', () => {
  for (const s of [null, '', '2026-11-03T09:00', '2026-02-30', 'soon']) assert.equal(localDay(s), null);
});
