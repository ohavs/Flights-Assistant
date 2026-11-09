// A reminder's quick times and how its time reads (8.92.0).
//   node --test tests/reminderWhen.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { whenPresets, shortWhen, whenPast, localIso } from '../src/lib/reminderWhen.js';

test('quick times in the afternoon: in an hour, tonight, tomorrow morning and evening', () => {
  const p = whenPresets(new Date(2026, 10, 9, 14, 7));
  assert.deepEqual(p.map(x => [x.key, x.at]), [
    ['hour', '2026-11-09T15:10'],
    ['tonight', '2026-11-09T20:00'],
    ['morning', '2026-11-10T09:00'],
    ['evening', '2026-11-10T20:00'],
  ]);
});

test('late: no "tonight", the morning after instead; an hour rolls over midnight and the month', () => {
  const p = whenPresets(new Date(2026, 10, 30, 23, 58));
  assert.deepEqual(p.map(x => [x.key, x.at]), [
    ['hour', '2026-12-01T01:00'],
    ['morning', '2026-12-01T09:00'],
    ['evening', '2026-12-01T20:00'],
    ['after', '2026-12-02T09:00'],
  ]);
});

test('a time reads as today, tomorrow, or a weekday and date', () => {
  const now = new Date(2026, 10, 9, 10, 0);   // Monday 9.11.2026
  assert.equal(shortWhen('2026-11-09T18:30', now), 'היום · 18:30');
  assert.equal(shortWhen('2026-11-10T09:00', now), 'מחר · 09:00');
  assert.equal(shortWhen('2026-11-12T08:00', now), 'ה׳ 12.11 · 08:00');
  assert.equal(shortWhen('2027-01-03T08:00', now), 'א׳ 3.1.27 · 08:00');
  assert.equal(shortWhen('', now), '');
});

test('past or not', () => {
  const now = new Date(2026, 10, 9, 10, 0);
  assert.equal(whenPast('2026-11-09T09:59', now), true);
  assert.equal(whenPast('2026-11-09T10:01', now), false);
  assert.equal(whenPast('', now), false);
  assert.equal(localIso(now), '2026-11-09T10:00');
});
