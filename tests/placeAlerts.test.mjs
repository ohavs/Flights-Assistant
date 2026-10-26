// Alerts for places with a date: the presets, the default, the notifications.
//   node --test tests/placeAlerts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { alertPresets, defaultAlert, placeAlerts, formatAlert, toLocal } from '../src/lib/placeAlerts.js';

const now = new Date(2026, 10, 1, 12, 0);   // 1.11.2026 12:00

test('a date and a time: an hour and three before, the morning, the evening before', () => {
  const p = alertPresets({ startDate: '2026-11-13', startTime: '19:00' }, now);
  assert.deepEqual(p.map(x => [x.key, x.at]), [
    ['h1', '2026-11-13T18:00'], ['h3', '2026-11-13T16:00'], ['morning', '2026-11-13T08:00'], ['eve', '2026-11-12T20:00'],
  ]);
  assert.equal(defaultAlert({ startDate: '2026-11-13', startTime: '19:00' }, now), '2026-11-13T18:00');
});

test('an early time: no "morning" at or after the hour before', () => {
  const p = alertPresets({ startDate: '2026-11-13', startTime: '08:30' }, now);
  assert.deepEqual(p.map(x => x.key), ['h1', 'h3', 'eve']);
});

test('a date with no time: the morning of the day and the evening before', () => {
  const p = alertPresets({ startDate: '2026-11-13' }, now);
  assert.deepEqual(p.map(x => [x.key, x.at]), [['morning', '2026-11-13T08:00'], ['eve', '2026-11-12T20:00']]);
});

test('presets already past are left out; the default falls back to the day at 08:00', () => {
  const late = new Date(2026, 10, 13, 9, 0);
  assert.deepEqual(alertPresets({ startDate: '2026-11-13' }, late), []);
  assert.equal(defaultAlert({ startDate: '2026-11-13' }, late), '2026-11-13T08:00');
  assert.deepEqual(alertPresets({}, now), []);
  assert.equal(defaultAlert(null, now), null);
});

test('the notifications: only those ahead, soonest first, opening the planning tab', () => {
  const store = {
    't/a': { tripId: 't', placeId: 'a', at: '2026-11-13T18:00', title: 'שוק חג המולד', when: 'ו׳ 13.11 · 19:00', tripName: 'וינה' },
    't/b': { tripId: 't', placeId: 'b', at: '2026-11-02T09:00', title: 'מוזיאון' },
    't/c': { tripId: 't', placeId: 'c', at: '2026-10-30T09:00', title: 'עבר' },
  };
  const out = placeAlerts(store, now);
  assert.deepEqual(out.map(a => a.title), ['מוזיאון', 'שוק חג המולד']);
  assert.equal(out[1].body, 'ו׳ 13.11 · 19:00 · וינה');
  assert.deepEqual(out[1].extra, { kind: 'place', tripId: 't', tab: 'planning', placeId: 'a' });
  assert.notEqual(out[0].id, out[1].id);
});

test('formatAlert and toLocal', () => {
  assert.equal(formatAlert('2026-11-13T18:05'), 'ו׳ 13.11 · 18:05');
  assert.equal(formatAlert('nope'), '');
  assert.equal(toLocal(new Date(2026, 0, 2, 3, 4)), '2026-01-02T03:04');
});
