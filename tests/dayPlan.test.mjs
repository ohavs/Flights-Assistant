import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clockMinutes, partOf, slotOf, bookingsOn, anchoredIds, dayItems, groupItems,
  canSwap, isGenericTitle, swapDayFields, legMinutes, personalItems, missingDates, placeDays, partsLabel, nextDate, orderFor, blockDrop,
  rangeLabel, rangeLength, overlaps, sortItems,
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
  assert.deepEqual(slotOf('ערב'), { label: 'ערב', part: 'ערב', parts: ['ערב'], minutes: null, end: null, custom: false });
  assert.deepEqual(slotOf('9:30'), { label: '09:30', part: 'בוקר', parts: ['בוקר'], minutes: 570, end: null, custom: false });
  assert.deepEqual(slotOf('אחרי הסיור'), { label: 'אחרי הסיור', part: null, parts: [], minutes: null, end: null, custom: true });
  assert.deepEqual(slotOf(''), { label: '', part: null, parts: [], minutes: null, end: null, custom: false });
});

test('a range of clock times (8.94.0)', () => {
  assert.deepEqual(slotOf('10:00–12:00'), { label: '10:00–12:00', part: 'בוקר', parts: ['בוקר'], minutes: 600, end: 720, custom: false });
  // Typed or saved with another dash, with spaces, 12-hour.
  assert.equal(slotOf('9:30 - 11:00').label, '09:30–11:00');
  assert.equal(slotOf('7:30 PM—9:00 PM').end, 1260);
  // Past midnight: in the part of its start.
  assert.deepEqual([slotOf('22:00–01:00').part, slotOf('22:00–01:00').end], ['לילה', 60]);
  // The same time twice is no range; a broken one is text.
  assert.equal(slotOf('10:00–10:00').custom, true);
  assert.equal(slotOf('10:00–25:00').custom, true);
  // Parts of the day are still parts.
  assert.deepEqual(slotOf('בוקר–ערב').parts, ['בוקר', 'צהריים', 'ערב']);
  assert.equal(rangeLabel(600, 720), '10:00–12:00');
  assert.equal(rangeLabel(600), '10:00');
  assert.equal(rangeLabel(600, 600), '10:00');
  assert.equal(rangeLength(600, 720), 120);
  assert.equal(rangeLength(1320, 60), 180);
});

test('a range sorts by its start', () => {
  const items = [
    { key: 'b', slot: slotOf('11:00'), seq: 0 },
    { key: 'a', slot: slotOf('10:00–12:00'), seq: 1 },
    { key: 'c', slot: slotOf('בוקר'), seq: 2 },
  ];
  assert.deepEqual(sortItems(items).map(it => it.key), ['c', 'a', 'b']);
});

test('what starts before a range above it ends', () => {
  const it = (key, label, kind = 'activity') => ({ key, kind, slot: slotOf(label) });
  const items = [
    it('museum', '10:00–12:00'), it('coffee', '11:30'), it('lunch', '12:00'), it('part', 'צהריים'),
    it('show', '20:00–23:30'), it('bar', '23:00'), it('club', '00:30'), it('blk', '', 'block'),
  ];
  const got = overlaps(items);
  assert.deepEqual([...got.keys()], ['coffee', 'bar']);
  assert.equal(got.get('coffee').key, 'museum');
  // Past midnight; a long range covers the ones after it.
  const night = overlaps([it('party', '22:00–02:00'), it('late', '01:00'), it('next', '01:30–03:00'), it('after', '02:30')]);
  assert.deepEqual([...night.keys()], ['late', 'next', 'after']);
  assert.equal(night.get('after').key, 'next');
  // Times with no range never meet.
  assert.equal(overlaps([it('a', '10:00'), it('b', '10:00')]).size, 0);
});

test('a booked place keeps a range that starts at the booking', () => {
  const bookings = [{ id: 'b1', placeId: 'p', date: '2026-11-05', time: '19:30' }];
  const at = (label) => dayItems({ acts: [{ id: 'a', placeId: 'p', title: 'x', timeLabel: label }], date: '2026-11-05', bookings })[0].slot.label;
  assert.equal(at('19:30–21:30'), '19:30–21:30');
  assert.equal(at('19:00–21:00'), '19:30');
  assert.equal(at('ערב'), '19:30');
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

test('the personal plan over the shared one, in one order', () => {
  const mine = [{ id: 'm1', title: 'ריצה', timeLabel: '07:00' }, { id: 'm2', title: 'מסעדה', placeId: 'p1', timeLabel: 'ערב' }];
  const shared = [{ id: 's1', title: 'מוזיאון', timeLabel: '10:00' }, { id: 's2', title: 'מסעדה', placeId: 'p1', timeLabel: 'ערב' }];
  const bookings = [
    { id: 'b1', placeId: 'p1', date: '2026-11-10', time: '20:00' },
    { id: 'b2', date: '2026-11-10', time: '12:30', title: 'סיור' },
  ];
  const flights = { out: { date: '2026-11-10', scheduledDep: '06:00' } };
  const items = personalItems({ mine, shared, date: '2026-11-10', bookings, flights });
  assert.deepEqual(items.map(it => it.key), ['sh:fl:out', 'act:m1', 'sh:act:s1', 'sh:bk:b2', 'sh:act:s2', 'act:m2']);
  // Mine are not marked; the booking for my place is on my row, not twice.
  assert.equal(items.find(it => it.key === 'act:m2').booking.id, 'b1');
  assert.equal(items.find(it => it.key === 'act:m2').shared, undefined);
  assert.equal(items.find(it => it.key === 'sh:act:s2').booking, null);
  assert.ok(items.filter(it => it.key.startsWith('sh:')).every(it => it.shared));
});

// A day of the trip is never taken away (8.81.0); a date with none shows as
// missing, and comes back in its place.
test('the dates of the trip with no day: the flights, and gaps between days', () => {
  const day = (date, order) => ({ id: date, date, order });
  const days = [day('2026-11-25', 2), day('2026-11-26', 3), day('2026-11-28', 5)];
  assert.deepEqual(missingDates(days, '2026-11-24', '2026-11-28'), ['2026-11-24', '2026-11-27']);
  assert.deepEqual(missingDates(days, '2026-11-24T10:00', '2026-11-29'), ['2026-11-24', '2026-11-27', '2026-11-29']);
  // No flights: only the gaps.
  assert.deepEqual(missingDates(days, null, null), ['2026-11-27']);
  assert.deepEqual(missingDates([{ id: 'x', order: 1 }], null, null), []);
  assert.deepEqual(missingDates([], '2026-11-03', '2026-11-05'), ['2026-11-03', '2026-11-04', '2026-11-05']);
  // Across a month, and never a backwards range.
  assert.deepEqual(missingDates([], '2026-11-30', '2026-12-01'), ['2026-11-30', '2026-12-01']);
  assert.deepEqual(missingDates([], '2026-11-05', '2026-11-03'), []);
});

test('a day brought back goes in its place by date, its number as its title', () => {
  const days = [
    { id: 'b', date: '2026-11-25', order: 2, title: 'יום 2' },
    { id: 'c', date: '2026-11-26', order: 3, title: 'יום 3' },
    { id: 'x', order: 4, title: 'יום 4' },                 // no date, added after
    { id: 'e', date: '2026-11-28', order: 5, title: 'יום 5' },
  ];
  assert.deepEqual(placeDays(days, ['2026-11-24']), [{ date: '2026-11-24', order: 1, title: 'יום 1' }]);
  // Between two days: between their orders.
  assert.deepEqual(placeDays(days, ['2026-11-27']), [{ date: '2026-11-27', order: 4.5, title: 'יום 4' }]);
  // After the last: after it.
  assert.deepEqual(placeDays(days, ['2026-11-29']), [{ date: '2026-11-29', order: 6, title: 'יום 5' }]);
  // Several at once, each counting the ones before it.
  assert.deepEqual(placeDays([], ['2026-11-04', '2026-11-03']).map(d => [d.date, d.order, d.title]),
    [['2026-11-03', 1, 'יום 1'], ['2026-11-04', 2, 'יום 2']]);
  // Only days with no date: after them.
  assert.deepEqual(placeDays([{ id: 'x', order: 1 }], ['2026-11-03']), [{ date: '2026-11-03', order: 2, title: 'יום 2' }]);
});

// 8.82.0: an activity over several parts of the day, from morning to evening.
test('several parts of the day: one label, standing at the first', () => {
  assert.equal(partsLabel(['ערב', 'בוקר', 'צהריים']), 'בוקר–ערב');
  assert.equal(partsLabel(['בוקר', 'צהריים']), 'בוקר–צהריים');
  assert.equal(partsLabel(['ערב', 'בוקר']), 'בוקר, ערב');
  assert.equal(partsLabel(['ערב']), 'ערב');
  assert.equal(partsLabel([]), '');
  assert.deepEqual(slotOf('בוקר–ערב'), { label: 'בוקר–ערב', part: 'בוקר', parts: ['בוקר', 'צהריים', 'ערב'], minutes: null, end: null, custom: false });
  assert.deepEqual(slotOf('בוקר - צהריים').parts, ['בוקר', 'צהריים']);
  assert.deepEqual(slotOf('ערב, בוקר'), { label: 'בוקר, ערב', part: 'בוקר', parts: ['בוקר', 'ערב'], minutes: null, end: null, custom: false });
  // Text that only looks like it stays text.
  assert.equal(slotOf('ערב-בוקר').custom, true);
  assert.equal(slotOf('בוקר - מוזיאון').custom, true);
  // In the day: with the morning, after what starts earlier in it.
  const items = dayItems({ acts: [
    { id: 'eve', timeLabel: 'ערב' }, { id: 'all', timeLabel: 'בוקר–ערב' }, { id: 'early', timeLabel: '08:00' },
  ] });
  assert.deepEqual(items.map(it => it.act.id), ['all', 'early', 'eve']);
  assert.deepEqual(groupItems(items).map(g => g.label), ['בוקר', 'ערב']);
});

// "+" at the end of the strip (8.83.0): the day after the last one shown.
test('the next date: after the last day, and after the flight back', () => {
  const day = (date, order) => ({ id: date, date, order });
  const days = [day('2026-11-25', 2), day('2026-11-26', 3)];
  assert.equal(nextDate(days, null, null), '2026-11-27');
  assert.equal(nextDate(days, '2026-11-24', '2026-11-29'), '2026-11-30');
  assert.equal(nextDate(days, '2026-11-24', '2026-11-25'), '2026-11-27');
  assert.equal(nextDate([day('2026-11-30', 1)], null, null), '2026-12-01');
  assert.equal(nextDate([], '2026-12-30', '2026-12-31T22:00'), '2027-01-01');
  // A backwards range of flights doesn't count; no date at all: null.
  assert.equal(nextDate(days, '2026-12-05', '2026-12-03'), '2026-11-27');
  assert.equal(nextDate([{ id: 'x', order: 1 }], null, null), null);
});

test('a day given another date moves to its place by date', () => {
  const days = [
    { id: 'a', date: '2026-11-25', order: 1 },
    { id: 'b', date: '2026-11-26', order: 2 },
    { id: 'c', date: '2026-11-28', order: 3 },
  ];
  assert.equal(orderFor(days, 'a', '2026-11-27'), 2.5);
  assert.equal(orderFor(days, 'c', '2026-11-27'), 3);
  assert.equal(orderFor(days, 'a', '2026-11-29'), 4);
  assert.equal(orderFor(days, 'c', '2026-11-20'), 0);
});

// 8.87.0: free blocks sit after an item, in their own order, with no time.
test('a block sits after its item, in its section; one whose item went is last', () => {
  const a = (id, timeLabel, order) => ({ id, title: id, timeLabel, order });
  const b = (id, after, order, block = 'text') => ({ id, block, after, order, text: id });
  const acts = [
    a('x', 'בוקר', 1), b('n1', 'act:x', 2), a('y', '13:00', 3), b('n0', null, 4),
    b('n2', 'act:x', 5), b('lost', 'act:gone', 6), a('z', 'ערב', 7),
  ];
  const items = dayItems({ acts });
  assert.deepEqual(items.map(it => it.key), ['blk:n0', 'act:x', 'blk:n1', 'blk:n2', 'act:y', 'act:z', 'blk:lost']);
  const groups = groupItems(items);
  assert.deepEqual(groups.map(g => [g.label, g.items.map(it => it.key)]), [
    ['', ['blk:n0']],
    ['בוקר', ['act:x', 'blk:n1', 'blk:n2']],
    ['צהריים', ['act:y']],
    ['ערב', ['act:z', 'blk:lost']],
  ]);
  // A block is no stop and has no time.
  assert.equal(items.find(it => it.key === 'blk:n1').slot.label, '');
});

test('blocks in "שלי": mine after a shared item too, the shared ones marked', () => {
  const items = personalItems({
    mine: [{ id: 'm', block: 'check', after: 'act:s', order: 1, items: [] }],
    shared: [{ id: 's', title: 'S', timeLabel: 'בוקר', order: 1 }, { id: 'sb', block: 'text', after: 'act:s', order: 2 }],
  });
  assert.deepEqual(items.map(it => it.key), ['sh:act:s', 'blk:m', 'sh:blk:sb']);
  assert.equal(items[2].shared, true);
});

test('where a dropped block goes: after the item above, between its neighbours', () => {
  const a = (id, timeLabel, order) => ({ id, title: id, timeLabel, order });
  const b = (id, after, order) => ({ id, block: 'text', after, order });
  const items = dayItems({ acts: [a('x', 'בוקר', 1), b('n1', 'act:x', 2), b('n2', 'act:x', 3), a('y', 'ערב', 4), b('d', 'act:y', 5)] });
  // as shown: x n1 n2 y d. Dragging d:
  assert.deepEqual(blockDrop(items, 'blk:d', 0), { after: null, order: null });
  assert.deepEqual(blockDrop(items, 'blk:d', 1), { after: 'act:x', order: 1 });
  assert.deepEqual(blockDrop(items, 'blk:d', 2), { after: 'act:x', order: 2.5 });
  assert.deepEqual(blockDrop(items, 'blk:d', 3), { after: 'act:x', order: 4 });
  assert.deepEqual(blockDrop(items, 'blk:d', 4), { after: 'act:y', order: null });
  // The shared plan's item, without its "sh:".
  assert.equal(blockDrop([{ key: 'sh:act:s', kind: 'activity' }], 'blk:m', 1).after, 'act:s');
});
