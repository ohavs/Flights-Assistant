// Alerts near a place: what Android is asked to watch.
//   node --test tests/nearPlaces.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearFences, nearOf, nearHours, nearUntil, nearWhyNot, radiusLabel, tidyNear, NEAR_MAX } from '../src/lib/nearPlaces.js';

const nine = [{ from: '09:00', to: '17:00' }];
const museum = { id: 'm', title: ' מוזיאון ', openHours: { 0: nine, 1: nine, 2: nine, 3: nine, 4: nine, 5: [{ from: '09:00', to: '13:00' }], 6: [] } };
const spot = { lat: 48.2, lng: 16.37 };

test('radius labels', () => {
  assert.equal(radiusLabel(300), '300 מ׳');
  assert.equal(radiusLabel(1000), '1 ק״מ');
  assert.equal(radiusLabel(1500), '1.5 ק״מ');
});

test('an entry keeps the title, the spot and a line of hours a day', () => {
  const e = nearOf(museum, spot);
  assert.equal(e.title, 'מוזיאון');
  assert.equal(e.lat, 48.2);
  assert.equal(e.hours[0], 'פתוח היום 09:00–17:00');
  assert.equal(e.hours[5], 'פתוח היום 09:00–13:00');
  assert.equal(e.hours[6], 'סגור היום');
  assert.equal(nearOf({ title: 'x' }, null).lat, null);
  assert.equal(nearHours(null), null);
});

test('the alert ends after the day after the trip', () => {
  const until = nearUntil('2026-12-16');
  assert.equal(new Date(until).getDate(), 18);
  assert.equal(new Date(until).getHours(), 0);
  assert.equal(nearUntil(null), 0);
  const e = { lat: 1, lng: 2, lastDay: '2026-12-16' };
  assert.equal(nearWhyNot(e, new Date(2026, 11, 17, 23).getTime()), '');
  assert.equal(nearWhyNot(e, new Date(2026, 11, 18, 0, 1).getTime()), 'over');
  assert.equal(nearWhyNot({ lat: null, lng: 2 }), 'nospot');
  assert.equal(nearWhyNot({ lat: 1, lng: 2, visited: true }), 'visited');
});

test('fences: only places with a spot, not visited, the trip not over', () => {
  const now = new Date(2026, 11, 13).getTime();
  const store = {
    't/m': { tripId: 't', placeId: 'm', radius: 500, ...nearOf(museum, spot), lastDay: '2026-12-16' },
    't/x': { tripId: 't', placeId: 'x', radius: 300, ...nearOf({ title: 'אין מיקום' }, null) },
    't/v': { tripId: 't', placeId: 'v', radius: 300, ...nearOf({ title: 'ביקרנו', visited: true }, spot) },
    'old/o': { tripId: 'old', placeId: 'o', radius: 300, ...nearOf({ title: 'ישן' }, spot), lastDay: '2026-01-01' },
    't/r': { tripId: 't', placeId: 'r', radius: 777, ...nearOf({ title: 'מסעדה' }, spot) },
  };
  const f = nearFences(store, now);
  assert.deepEqual(f.map(x => x.id), ['t/m', 't/r']);
  assert.equal(f[0].title, 'אתם ליד מוזיאון');
  assert.equal(f[0].body, 'פחות מ־500 מ׳ ממכם');
  assert.equal(f[0].radius, 500);
  assert.equal(f[0].until, nearUntil('2026-12-16'));
  assert.equal(f[0].hours.length, 7);
  // A radius that is not one of the choices: the default.
  assert.equal(f[1].radius, 300);
  assert.equal(f[1].until, 0);
  assert.equal(f[1].hours, null);
});

test('at most what Android watches for one app', () => {
  const store = Object.fromEntries(Array.from({ length: 130 }, (_, i) =>
    [`t/${i}`, { tripId: 't', placeId: String(i), radius: 300, ...nearOf({ title: String(i) }, spot) }]));
  assert.equal(nearFences(store).length, NEAR_MAX);
});

test('tidy: places deleted go, the rest follow their place; other trips untouched', () => {
  const store = {
    't/m': { tripId: 't', placeId: 'm', radius: 300, ...nearOf({ title: 'ישן' }, null), lastDay: null },
    't/gone': { tripId: 't', placeId: 'gone', radius: 300, ...nearOf({ title: 'נמחק' }, spot), lastDay: null },
    'u/m': { tripId: 'u', placeId: 'm', radius: 300, ...nearOf({ title: 'טיול אחר' }, spot), lastDay: null },
  };
  const next = tidyNear(store, 't', [{ ...museum, visited: true }], () => spot, '2026-12-16');
  assert.deepEqual(Object.keys(next).sort(), ['t/m', 'u/m']);
  assert.equal(next['t/m'].title, 'מוזיאון');
  assert.equal(next['t/m'].lat, 48.2);
  assert.equal(next['t/m'].visited, true);
  assert.equal(next['t/m'].radius, 300);
  assert.equal(next['t/m'].lastDay, '2026-12-16');
  assert.equal(next['u/m'], store['u/m']);
  // Nothing changed: null.
  assert.equal(tidyNear(next, 't', [{ ...museum, visited: true }], () => spot, '2026-12-16'), null);
});
