import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekOf, hasHours, weekdayOf, dayText, weekLines, weekText, openOnDay, openAt, partOpen,
  hoursWhyNot, hoursEndsLate, hoursNote, fromGoogle, tidyHours,
} from '../src/lib/openHours.js';
import { offDay, fitWhyNot, clockChecked, timeWhy, partWhy, fitsDay, placeNote, stayingIds } from '../src/lib/placeFit.js';

// A museum: Sun–Thu 09:00–17:00, Fri 09:00–13:00, closed on Saturday.
const week = (r) => Object.fromEntries([0, 1, 2, 3, 4].map(d => [String(d), r]));
const museum = { ...week([{ from: '09:00', to: '17:00' }]), 5: [{ from: '09:00', to: '13:00' }], 6: [] };
// A restaurant with a break, and a bar past midnight on Friday only.
const resto = { ...week([{ from: '12:00', to: '15:00' }, { from: '19:00', to: '23:00' }]), 5: [], 6: [] };
const bar = { 5: [{ from: '20:00', to: '02:00' }] };
const always = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [String(d), [{ from: '00:00', to: '00:00' }]]));

// 2026-12-13 is a Sunday.
const SUN = '2026-12-13', FRI = '2026-12-18', SAT = '2026-12-19';

test('no hours: nothing is checked', () => {
  assert.equal(weekOf(null), null);
  assert.equal(weekOf({}), null);
  assert.equal(weekOf({ 0: [], 1: [] }), null);
  assert.equal(hasHours({ 0: [{ from: 'x', to: '10:00' }] }), false);
  assert.equal(openOnDay(null, SAT), true);
  assert.equal(hoursWhyNot(undefined, SAT, '10:00'), '');
  assert.equal(hoursNote(null, SAT, '10:00'), null);
});

test('weekdays', () => {
  assert.equal(weekdayOf(SUN), 0);
  assert.equal(weekdayOf(FRI), 5);
  assert.equal(weekdayOf(SAT), 6);
  assert.equal(weekdayOf(''), null);
});

test('texts', () => {
  assert.equal(dayText(museum, 0), '09:00–17:00');
  assert.equal(dayText(museum, 6), 'סגור');
  assert.equal(dayText(resto, 1), '12:00–15:00, 19:00–23:00');
  assert.equal(dayText(always, 3), '24 שעות');
  assert.deepEqual(weekLines(museum), [
    { from: 0, to: 4, days: 'א׳–ה׳', text: '09:00–17:00' }, { from: 5, to: 5, days: 'ו׳', text: '09:00–13:00' },
    { from: 6, to: 6, days: 'ש׳', text: 'סגור' },
  ]);
  assert.equal(weekText(resto), 'א׳–ה׳ 12:00–15:00, 19:00–23:00 · ו׳, ש׳ סגור');
});

test('a closed day is out, whatever the time', () => {
  assert.equal(openOnDay(museum, SAT), false);
  assert.equal(openOnDay(museum, FRI), true);
  assert.equal(openOnDay(museum, null), true);
  assert.equal(hoursWhyNot(museum, SAT, ''), 'סגור ביום שבת');
  assert.equal(hoursWhyNot(museum, SAT, 'בוקר'), 'סגור ביום שבת');
  assert.equal(hoursWhyNot(museum, SUN, ''), '');
});

test('clock times and parts of the day', () => {
  assert.equal(openAt(museum, SUN, 9 * 60), true);
  assert.equal(openAt(museum, SUN, 17 * 60), false);
  assert.equal(openAt(museum, FRI, 14 * 60), false);
  assert.equal(hoursWhyNot(museum, FRI, '14:00'), 'פתוח רק 09:00–13:00');
  assert.equal(hoursWhyNot(museum, SUN, '10:00–12:00'), '');
  assert.equal(partOpen(museum, SUN, 'ערב'), false);
  assert.equal(partOpen(museum, SUN, 'צהריים'), true);
  assert.equal(hoursWhyNot(museum, SUN, 'ערב'), 'פתוח רק 09:00–17:00');
  assert.equal(hoursWhyNot(museum, SUN, 'בוקר–ערב'), 'פתוח רק 09:00–17:00');
  // A break: 16:00 is out, 20:00 is in.
  assert.equal(openAt(resto, SUN, 16 * 60), false);
  assert.equal(openAt(resto, SUN, 20 * 60), true);
  assert.equal(partOpen(resto, SUN, 'בוקר'), false);
  // Free text is never checked.
  assert.equal(hoursWhyNot(museum, SUN, 'אחרי הסיור'), '');
});

test('past midnight: 01:00 on Friday is Saturday night of the Friday hours', () => {
  assert.equal(openAt(bar, FRI, 60), true);
  assert.equal(openAt(bar, FRI, 23 * 60), true);
  assert.equal(openAt(bar, FRI, 3 * 60), false);
  assert.equal(hoursWhyNot(bar, FRI, 'לילה'), '');
  assert.equal(hoursWhyNot(bar, SAT, 'לילה'), 'סגור ביום שבת');
  assert.equal(openAt(always, SAT, 200), true);
});

test('ends late, and notes', () => {
  assert.equal(hoursEndsLate(museum, SUN, '16:00–18:00'), 'נסגר ב־17:00');
  assert.equal(hoursEndsLate(museum, SUN, '10:00–12:00'), '');
  assert.equal(hoursEndsLate(always, SUN, '22:00–03:00'), '');
  assert.deepEqual(hoursNote(museum, SAT, '10:00'), { tone: 'bad', text: 'סגור ביום שבת', full: 'שעות פעילות ביום שבת: סגור' });
  assert.equal(hoursNote(museum, FRI, '14:00').text, 'מחוץ לשעות 09:00–13:00');
  assert.equal(hoursNote(museum, SUN, '16:30').text, 'נסגר ב־17:00');
  assert.equal(hoursNote(museum, SUN, '09:10').text, 'נפתח ב־09:00');
  assert.deepEqual(hoursNote(museum, SUN, '11:00'), { tone: 'info', text: '09:00–17:00', full: 'שעות פעילות ביום ראשון: 09:00–17:00' });
  assert.equal(hoursNote(museum, SUN, 'בוקר').text, 'נפתח ב־09:00');
  assert.equal(hoursNote(museum, SUN, 'צהריים').tone, 'info');
  assert.equal(hoursNote(museum, FRI, 'צהריים').text, 'נסגר ב־13:00');
  assert.equal(hoursNote(resto, SUN, 'ערב').text, 'נפתח ב־19:00');
  assert.equal(hoursNote(museum, null, '10:00').full, 'שעות פעילות: א׳–ה׳ 09:00–17:00 · ו׳ 09:00–13:00 · ש׳ סגור');
  assert.equal(hoursNote(always, SUN, '23:30').tone, 'info');
});

test('from Google', () => {
  const g = [
    { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } },
    { open: { day: 5, hour: 20, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
    { open: { day: 3, hour: 0, minute: 0 }, close: { day: 4, hour: 0, minute: 0 } },
  ];
  const oh = fromGoogle(g);
  assert.deepEqual(oh['1'], [{ from: '09:00', to: '17:30' }]);
  assert.deepEqual(oh['5'], [{ from: '20:00', to: '02:00' }]);
  assert.deepEqual(oh['3'], [{ from: '00:00', to: '00:00' }]);
  assert.deepEqual(oh['0'], []);
  assert.equal(dayText(oh, 3), '24 שעות');
  assert.deepEqual(fromGoogle([{ open: { day: 0, hour: 0, minute: 0 } }])['6'], [{ from: '00:00', to: '00:00' }]);
  assert.equal(fromGoogle([]), null);
  assert.equal(fromGoogle(undefined), null);
});

test('tidy: what is saved', () => {
  assert.equal(tidyHours({ 0: [] }), null);
  const t = tidyHours({ 2: [{ from: '9:00', to: '17:00' }, { from: 'x', to: '1' }] });
  assert.deepEqual(t['2'], [{ from: '09:00', to: '17:00' }]);
  assert.deepEqual(t['0'], []);
  assert.equal(Object.keys(t).length, 7);
});

test('a place: its dates and its opening hours together', () => {
  const p = { title: 'מוזיאון', openHours: museum };
  const ev = { title: 'שוק', event: { startDate: '2026-12-10', endDate: '2026-12-24', startTime: '10:00', endTime: '20:00' }, openHours: museum };
  assert.equal(offDay(p, SAT), 'סגור ביום שבת');
  assert.equal(offDay(p, SUN), '');
  assert.equal(offDay(ev, '2026-12-30'), 'רק ב־10.12–24.12');
  assert.equal(fitWhyNot(p, FRI, '15:00'), 'פתוח רק 09:00–13:00');
  assert.equal(fitWhyNot(ev, SUN, '09:30'), 'רק בשעות 10:00–20:00');
  assert.equal(clockChecked(p, SUN), true);
  assert.equal(clockChecked(p, null), false);
  assert.equal(clockChecked({}, SUN), false);
  assert.equal(timeWhy(p, SUN, 18 * 60), 'פתוח רק 09:00–17:00');
  assert.equal(timeWhy(p, SUN, 10 * 60), '');
  assert.equal(partWhy(p, SUN, 'ערב'), 'פתוח רק 09:00–17:00');
  assert.equal(partWhy(p, SAT, 'בוקר'), 'סגור ביום שבת');
  assert.equal(fitsDay(p, SAT), false);
  assert.equal(fitsDay(p, SUN), true);
  // The worse note leads; only the hours, nothing wrong: quiet.
  assert.equal(placeNote(p, SUN, '11:00').quiet, true);
  assert.equal(placeNote(p, SAT, '11:00').tone, 'bad');
  assert.equal(placeNote(ev, SUN, '16:30').text, 'נסגר ב־17:00');
  assert.equal(placeNote(ev, SUN, '11:00').quiet, undefined);
  assert.equal(placeNote({}, SUN, '11:00'), null);
  // A day swap: closed on the other day's weekday stays.
  const acts = [{ id: 'a', placeId: 'm' }, { id: 'b', placeId: 'x' }];
  const byId = new Map([['m', p], ['x', { openHours: always }]]);
  assert.deepEqual([...stayingIds(acts, byId, SAT)], ['a']);
  assert.deepEqual([...stayingIds(acts, byId, SUN)], []);
});
