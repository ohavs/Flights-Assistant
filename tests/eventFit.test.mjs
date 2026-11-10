import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventSpan, onDate, timeFits, partFits, whyNot, eventNote, stayingIds } from '../src/lib/eventFit.js';

const market = { startDate: '2026-12-10', endDate: '2026-12-24', startTime: '10:00', endTime: '20:00' };
const show = { startDate: '2026-12-12', startTime: '20:00' };
const party = { startDate: '2026-12-12', startTime: '22:00', endTime: '03:00' };
const fair = { startDate: '2026-12-10', endDate: '2026-12-12' };

test('no dates, nothing to hold to', () => {
  assert.equal(eventSpan(null), null);
  assert.equal(eventSpan({ startTime: '10:00' }), null);
  assert.equal(onDate(undefined, '2026-12-01'), true);
  assert.equal(whyNot({}, '2026-12-01', '08:00'), '');
  assert.equal(eventNote({}, '2026-12-01', 'בוקר'), null);
});

test('dates: inside the range, and a day with no date is not checked', () => {
  assert.equal(onDate(market, '2026-12-10'), true);
  assert.equal(onDate(market, '2026-12-24'), true);
  assert.equal(onDate(market, '2026-12-09'), false);
  assert.equal(onDate(market, '2026-12-25'), false);
  assert.equal(onDate(market, null), true);
  assert.equal(onDate(show, '2026-12-13'), false);
  assert.equal(whyNot(market, '2026-12-25', ''), 'רק ב־10.12–24.12');
  assert.equal(whyNot(show, '2026-12-11', ''), 'רק ב־12.12');
});

test('hours: a clock time inside them', () => {
  assert.equal(timeFits(market, 600), true);    // 10:00
  assert.equal(timeFits(market, 1199), true);   // 19:59
  assert.equal(timeFits(market, 1200), false);  // 20:00, closed
  assert.equal(timeFits(market, 540), false);   // 09:00
  assert.equal(whyNot(market, '2026-12-11', '21:00'), 'רק בשעות 10:00–20:00');
  assert.equal(whyNot(market, '2026-12-11', '12:30'), '');
});

test('hours past midnight', () => {
  assert.equal(timeFits(party, 1380), true);   // 23:00
  assert.equal(timeFits(party, 120), true);    // 02:00
  assert.equal(timeFits(party, 200), false);   // 03:20
  assert.equal(timeFits(party, 1200), false);  // 20:00
  assert.equal(partFits(party, 'לילה'), true);
  assert.equal(partFits(party, 'ערב'), false);  // 17:00–21:00 ends before 22:00
});

test('a start with no end holds only its date', () => {
  assert.equal(timeFits(show, 600), true);
  assert.equal(partFits(show, 'בוקר'), true);
  assert.equal(whyNot(show, '2026-12-12', 'בוקר'), '');
  assert.equal(whyNot(show, '2026-12-12', '08:00'), '');
});

test('parts of the day meet the hours or not', () => {
  const eve = { startDate: '2026-12-12', startTime: '18:00', endTime: '23:00' };
  assert.equal(partFits(eve, 'בוקר'), false);
  assert.equal(partFits(eve, 'צהריים'), false);
  assert.equal(partFits(eve, 'ערב'), true);
  assert.equal(partFits(eve, 'לילה'), true);
  assert.equal(whyNot(eve, '2026-12-12', 'בוקר–ערב'), 'רק בשעות 18:00–23:00');
  assert.equal(whyNot(eve, '2026-12-12', 'ערב'), '');
  assert.equal(whyNot(eve, '2026-12-12', 'משהו חופשי'), '');
});

test('the note: hours and dates, a warning near the edges', () => {
  assert.deepEqual(eventNote(market, '2026-12-11', '12:00'), { tone: 'info', text: '10:00–20:00 · עד 24.12', full: 'כל יום 10:00–20:00 · 10.12–24.12' });
  assert.equal(eventNote(market, '2026-12-24', '').text, '10:00–20:00 · יום אחרון');
  assert.equal(eventNote(market, '2026-12-11', '19:00').text, 'נסגר ב־20:00 · עד 24.12');
  assert.equal(eventNote(market, '2026-12-11', '19:00').tone, 'warn');
  assert.equal(eventNote(market, '2026-12-11', '18:59').tone, 'info');
  assert.equal(eventNote(market, '2026-12-11', '10:15').text, 'נפתח ב־10:00 · עד 24.12');
  assert.equal(eventNote(market, '2026-12-11', 'בוקר').text, 'נפתח ב־10:00 · עד 24.12');
  assert.equal(eventNote(market, '2026-12-11', 'ערב').text, 'נסגר ב־20:00 · עד 24.12');
  assert.equal(eventNote(market, '2026-12-11', 'צהריים').tone, 'info');
  assert.equal(eventNote(market, '2026-12-11', 'בוקר–ערב').text, 'רק 10:00–20:00 · עד 24.12');
  assert.equal(eventNote(market, '2026-12-11', '21:00').tone, 'bad');
  assert.equal(eventNote(market, '2026-12-11', '21:00').text, 'מחוץ לשעות 10:00–20:00');
  assert.equal(eventNote(market, '2026-12-30', '').text, 'רק ב־10.12–24.12');
  assert.equal(eventNote(market, null, '').text, '10:00–20:00 · 10.12–24.12');
});

test('the note of one day: starts and ends', () => {
  assert.equal(eventNote(party, '2026-12-12', '').text, '22:00–03:00');
  assert.equal(eventNote(party, '2026-12-12', '02:30').text, 'מסתיים ב־03:00');
  assert.equal(eventNote(party, '2026-12-12', '22:00').text, 'מתחיל ב־22:00');
  assert.equal(eventNote(show, '2026-12-12', '').text, 'מ־20:00');
  assert.equal(eventNote(show, '2026-12-12', '19:00').text, 'מתחיל ב־20:00');
  assert.equal(eventNote(show, '2026-12-12', '19:00').tone, 'warn');
  assert.equal(eventNote(show, '2026-12-12', '12:00').tone, 'info');
  assert.equal(eventNote(fair, '2026-12-11', '').text, 'עד 12.12');
  assert.equal(eventNote({ startDate: '2026-12-12' }, '2026-12-12', '').text, 'רק ביום הזה');
});

test('a day swap leaves what is not on the other date', () => {
  const places = new Map([['m', { event: market }], ['s', { event: show }], ['p', {}]]);
  const acts = [{ id: 1, placeId: 'm' }, { id: 2, placeId: 's' }, { id: 3, placeId: 'p' }, { id: 4 }];
  assert.deepEqual([...stayingIds(acts, places, '2026-12-11')], [2]);
  assert.deepEqual([...stayingIds(acts, places, '2026-12-30')], [1, 2]);
  assert.deepEqual([...stayingIds(acts, places, null)], []);
});
