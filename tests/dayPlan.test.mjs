import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clockMinutes, partOf, slotOf, bookingsOn, anchoredIds, dayItems, groupItems,
  canSwap, isGenericTitle, swapDayFields, legMinutes,
} from '../src/lib/dayPlan.js';

test('a clock time, read', () => {
  assert.equal(clockMinutes('10:30'), 630);
  assert.equal(clockMinutes('9:05'), 545);
  assert.equal(clockMinutes('10.30'), 630);
  assert.equal(clockMinutes('7:30 PM'), 1170);
  assert.equal(clockMinutes('בוקר'), null);
  assert.equal(clockMinutes('25:00'), null);
  assert.equal(clockMinutes(''), null);
});

test('the part of the day of a time', () => {
  assert.equal(partOf(300), 'בוקר');
  assert.equal(partOf(719), 'בוקר');
  assert.equal(partOf(720), 'צהריים');
  assert.equal(partOf(1020), 'ערב');
  assert.equal(partOf(1260), 'לילה');
  assert.equal(partOf(60), 'לילה');
  assert.equal(partOf(null), null);
});

test('a saved time label: a part, a clock, free text or none', () => {
  assert.deepEqual(slotOf('ערב'), { label: 'ערב', part: 'ערב', minutes: null, custom: false });
  assert.deepEqual(slotOf('9:30'), { label: '09:30', part: 'בוקר', minutes: 570, custom: false });
  assert.deepEqual(slotOf('אחרי הסיור'), { label: 'אחרי הסיור', part: null, minutes: null, custom: true });
  assert.deepEqual(slotOf(''), { label: '', part: null, minutes: null, custom: false });
});

test('bookings on a date leave out the cancelled ones', () => {
  const bs = [
    { id: 'a', date: '2026-11-05' },
    { id: 'b', date: '2026-11-05', status: 'cancelled' },
    { id: 'c', date: '2026-11-06' },
  ];
  assert.deepEqual(bookingsOn(bs, '2026-11-05').map(b => b.id), ['a']);
  assert.deepEqual(bookingsOn(bs, null), []);
});

test('an activity is fixed to the date its place is booked on', () => {
  const acts = [{ id: 'x', placeId: 'p1' }, { id: 'y', placeId: 'p2' }, { id: 'z' }];
  const bs = [{ id: 'b', placeId: 'p1', date: '2026-11-05' }, { id: 'c', placeId: 'p2', date: '2026-11-06' }];
  assert.deepEqual([...anchoredIds(acts, '2026-11-05', bs)], ['x']);
  assert.deepEqual([...anchoredIds(acts, '2026-11-07', bs)], []);
});

test('a day in time order: parts, then clock times inside a part', () => {
  const acts = [
    { id: 'dinner', title: 'ערב', timeLabel: '19:30' },
    { id: 'coffee', title: 'קפה', timeLabel: 'בוקר' },
    { id: 'museum', title: 'מוזיאון', timeLabel: '10:00' },
    { id: 'free', title: 'בלי שעה', timeLabel: '' },
    { id: 'early', title: 'מוקדם', timeLabel: '08:00' },
    { id: 'club', title: 'מועדון', timeLabel: '01:00' },
    { id: 'bar', title: 'בר', timeLabel: '23:00' },
  ];
  const ids = dayItems({ acts }).map(it => it.act.id);
  assert.deepEqual(ids, ['coffee', 'early', 'museum', 'dinner', 'bar', 'club', 'free']);
});

test('a booking shows on its date, merged with its place when planned', () => {
  const acts = [{ id: 'a1', placeId: 'p1', title: 'מסעדה', timeLabel: 'ערב' }];
  const bookings = [
    { id: 'b1', placeId: 'p1', date: '2026-11-05', time: '20:00' },
    { id: 'b2', date: '2026-11-05', time: '11:00', title: 'סיור' },
    { id: 'b3', date: '2026-11-06', time: '09:00' },
  ];
  const items = dayItems({ acts, date: '2026-11-05', bookings });
  assert.deepEqual(items.map(it => it.key), ['bk:b2', 'act:a1']);
  assert.equal(items[1].booking.id, 'b1');
  assert.equal(items[1].slot.label, '20:00');   // the booking's time wins
  assert.deepEqual(dayItems({ acts, date: '2026-11-07', bookings }).map(it => it.key), ['act:a1']);
});

test('flights and the hotel on their dates', () => {
  const flights = {
    out: { date: '2026-11-05', scheduledDep: '07:30 AM', flightNumber: 'LY1' },
    ret: { date: '2026-11-09', scheduledDep: '18:00' },
  };
  const hotel = { checkIn: '2026-11-05T15:00', checkOut: '2026-11-09T11:00' };
  const first = dayItems({ acts: [{ id: 'a', timeLabel: 'ערב' }], date: '2026-11-05', flights, hotel });
  assert.deepEqual(first.map(it => it.key), ['fl:out', 'ht:in', 'act:a']);
  assert.equal(first[0].slot.label, '07:30');
  const last = dayItems({ date: '2026-11-09', flights, hotel });
  assert.deepEqual(last.map(it => it.key), ['ht:out', 'fl:ret']);
  assert.deepEqual(dayItems({ date: null, flights, hotel }), []);
});

test('sections by part of the day; none when nothing has a time', () => {
  const plain = dayItems({ acts: [{ id: 'a' }, { id: 'b' }] });
  assert.deepEqual(groupItems(plain).map(g => g.label), ['']);
  const timed = dayItems({ acts: [{ id: 'a', timeLabel: 'בוקר' }, { id: 'b' }, { id: 'c', timeLabel: '20:00' }] });
  assert.deepEqual(groupItems(timed).map(g => [g.label, g.items.length]), [['בוקר', 1], ['ערב', 1], ['בלי שעה', 1]]);
  assert.deepEqual(groupItems([]), []);
});

test('only two activities with the same time trade places', () => {
  const items = dayItems({ acts: [{ id: 'a' }, { id: 'b' }, { id: 'c', timeLabel: '10:00' }] });
  const [a, b, c] = ['a', 'b', 'c'].map(id => items.find(it => it.act.id === id));
  assert.equal(canSwap(a, b), true);
  assert.equal(canSwap(b, c), false);
  assert.equal(canSwap(a, undefined), false);
});

test('swapping days: the date stays, a number title stays, a name travels', () => {
  assert.equal(isGenericTitle('יום 3'), true);
  assert.equal(isGenericTitle('דיסנילנד'), false);
  const a = { id: 'a', order: 1, date: '2026-11-05', title: 'יום 1' };
  const b = { id: 'b', order: 3, date: '2026-11-07', title: 'יום 3' };
  assert.deepEqual(swapDayFields(a, b, 1, 3), {
    a: { order: 3, date: '2026-11-07', title: 'יום 3' },
    b: { order: 1, date: '2026-11-05', title: 'יום 1' },
  });
  const named = { ...b, title: 'דיסנילנד' };
  assert.deepEqual(swapDayFields(a, named, 1, 3), {
    a: { order: 3, date: '2026-11-07', title: 'יום 3' },
    b: { order: 1, date: '2026-11-05', title: 'דיסנילנד' },
  });
  // Two days with the same order still end up apart.
  const s = swapDayFields({ ...a, order: 2 }, { ...b, order: 2 }, 1, 2);
  assert.notEqual(s.a.order, s.b.order);
});

test('minutes of a leg', () => {
  assert.equal(legMinutes({ seconds: 750 }), 13);
  assert.equal(legMinutes({ duration: "1 שע' 5 דק'" }), 65);
  assert.equal(legMinutes({ duration: "12 דק'" }), 12);
  assert.equal(legMinutes(null), null);
});
