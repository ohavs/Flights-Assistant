// The morning summary: which mornings, at what time, and what it says.
//   node --test tests/morningAlerts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { tripRange, isMorningTrip, firstActivity, morningAlerts } from '../src/lib/morningAlerts.js';

const trip = {
  id: 't1', name: 'פריז',
  outboundFlightDetails: { date: '2026-11-02', arrAirport: { lat: 49, lng: 2.5 } },
  returnFlightDetails: { date: '2026-11-05' },
};
const now = new Date(2026, 10, 1, 12, 0);            // 1.11.2026 12:00 local

test('the trip runs from the outbound flight to the return one', () => {
  assert.deepEqual(tripRange(trip), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  assert.deepEqual(tripRange({ outboundFlightDetails: { date: '2026-11-02' } }), ['2026-11-02']);
  assert.deepEqual(tripRange({}), []);
});

test('only trips with a day in the coming week', () => {
  assert.equal(isMorningTrip(trip, now), true);
  assert.equal(isMorningTrip(trip, new Date(2026, 9, 1)), false);      // a month before
  assert.equal(isMorningTrip(trip, new Date(2026, 10, 5, 20)), true);  // the last evening
  assert.equal(isMorningTrip(trip, new Date(2026, 10, 6, 9)), false);  // the day after
  assert.equal(isMorningTrip({ id: 'x' }, now), false);
});

test('the first activity is the earliest by time of day', () => {
  const acts = [{ title: 'א' }, { title: 'ב', timeLabel: 'ערב' }, { title: 'ג', timeLabel: '10:30' }, { title: 'ד', timeLabel: 'בוקר' }];
  assert.equal(firstActivity(acts).title, 'ד');
  assert.equal(firstActivity([{ title: 'א' }, { title: 'ג', timeLabel: '10:30' }]).title, 'ג');
  assert.equal(firstActivity([]), null);
});

test('every morning of the trip, at the chosen time, with plan and forecast', () => {
  const days = { t1: [
    { id: 'd2', order: 2, title: 'יום 2', date: '2026-11-03', activities: [
      { title: 'מוזיאון אורסיי', timeLabel: 'צהריים' }, { title: 'הלובר', timeLabel: 'בוקר' }, { title: 'שייט', timeLabel: 'ערב' },
    ] },
    { id: 'd1', order: 1, title: 'יום 1', date: '2026-11-02', activities: [{ title: 'צ\'ק־אין במלון' }] },
  ] };
  const weather = { t1: { daily: [
    { date: '2026-11-03', code: 61, min: 9, max: 14, rain: 70 },
    { date: '2026-11-02', code: 0, min: 8, max: 16, rain: 0 },
  ] } };
  const out = morningAlerts([trip], days, weather, '07:30', now);
  assert.deepEqual(out.map(a => [a.at.getDate(), a.at.getHours(), a.at.getMinutes()]),
    [[2, 7, 30], [3, 7, 30], [4, 7, 30], [5, 7, 30]]);
  assert.equal(out[0].title, 'יום 1 · פריז');
  assert.equal(out[0].body, 'פעילות אחת היום: צ\'ק־אין במלון. ☀️ בהיר, 8°–16°');
  assert.equal(out[1].body, '3 פעילויות היום. ראשונה: בוקר · הלובר. 🌦️ גשם קל, 9°–14°, 70% גשם');
  assert.equal(out[2].title, 'יום 3 · פריז');
  assert.equal(out[2].body, 'אין פעילויות בתוכנית להיום.');
  assert.deepEqual(out[0].extra, { kind: 'morning', tripId: 't1', tab: 'planning' });
  assert.notEqual(out[0].id, out[1].id);
  assert.equal(morningAlerts([trip], days, weather, '07:30', now)[0].id, out[0].id);   // stable
});

test('a morning that has passed or is more than a week away is skipped', () => {
  const out = morningAlerts([trip], {}, {}, '08:00', new Date(2026, 10, 3, 9, 0));
  assert.deepEqual(out.map(a => a.at.getDate()), [4, 5]);
  const long = { ...trip, returnFlightDetails: { date: '2026-11-30' } };
  assert.equal(morningAlerts([long], {}, {}, '08:00', now).length, 7);
});

test('days added by hand (no date) follow the trip\'s dates in order', () => {
  const days = { t1: [
    { id: 'b', order: 2, title: 'מונמארטר', activities: [{ title: 'סקרה־קר' }] },
    { id: 'a', order: 1, title: 'הגעה', activities: [] },
  ] };
  const out = morningAlerts([trip], days, {}, undefined, now);
  assert.equal(out[0].at.getHours(), 8);
  assert.equal(out[1].title, 'מונמארטר · פריז');
  assert.equal(out[1].body, 'פעילות אחת היום: סקרה־קר.');
});
