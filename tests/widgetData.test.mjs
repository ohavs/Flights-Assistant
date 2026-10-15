// The home screen widget's snapshot: which trips, and what each carries.
//   node --test tests/widgetData.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { widgetTrips, widgetSnapshot } from '../src/lib/widgetData.js';

const now = new Date(2026, 10, 1, 12, 0);            // 1.11.2026 12:00 local
const paris = {
  id: 'p', name: 'פריז',
  outboundFlightDetails: {
    date: '2026-11-03', scheduledDep: '07:30', flightNumber: 'LY 323',
    depAirport: { code: 'TLV', timezone: 'UTC +02:00' }, arrAirport: { code: 'CDG' },
  },
  returnFlightDetails: { date: '2026-11-06', depAirport: { code: 'CDG' }, arrAirport: { code: 'TLV' } },
};
const rome = { id: 'r', name: 'רומא', outboundFlightDetails: { date: '2026-12-10' }, returnFlightDetails: { date: '2026-12-12' } };
const past = { id: 'x', name: 'עבר', outboundFlightDetails: { date: '2026-10-01' }, returnFlightDetails: { date: '2026-10-05' } };
const leaving = { ...rome, id: 'd', deleteAt: Date.now() };
const undated = { id: 'u', name: 'בלי תאריך' };

test('current and coming trips only, soonest first', () => {
  assert.deepEqual(widgetTrips([rome, past, paris, leaving, undated], now).map(t => t.id), ['p', 'r']);
  // On the last day of a trip it is still the one shown.
  assert.deepEqual(widgetTrips([paris], new Date(2026, 10, 6, 22)).map(t => t.id), ['p']);
  assert.deepEqual(widgetTrips([paris], new Date(2026, 10, 7, 9)), []);
});

test('flights: the instant, a title, the route and when', () => {
  const [t] = widgetSnapshot({ trips: [paris], now }).trips;
  assert.equal(t.start, '2026-11-03');
  assert.equal(t.end, '2026-11-06');
  const [out, back] = t.flights;
  assert.equal(out.at, Date.UTC(2026, 10, 3, 5, 30));            // 07:30 at UTC+2
  assert.equal(out.title, 'טיסת הלוך · LY 323');
  assert.equal(out.route, 'TLV → CDG');
  assert.equal(out.when, 'יום ג׳ 3.11 · 07:30');
  assert.equal(back.at, null);                                    // no time yet
  assert.equal(back.when, 'יום ו׳ 6.11');
  assert.equal(back.title, 'טיסת חזור');
});

test('the plan of each coming day, in time-of-day order, three lines and a count', () => {
  const days = [
    { id: 'd1', order: 0, date: '2026-11-03', title: 'הגעה', activities: [{ title: 'צ׳ק אין', timeLabel: 'ערב' }] },
    { id: 'd2', order: 1, date: '2026-11-04', activities: [
      { title: 'מסעדה', timeLabel: 'ערב' }, { title: 'לובר', timeLabel: 'בוקר' }, { title: 'שאנז אליזה', timeLabel: 'צהריים' },
      { title: 'גלידה' }, { title: '' },
    ] },
  ];
  const [t] = widgetSnapshot({ trips: [paris], daysByTrip: { p: days }, now }).trips;
  assert.deepEqual(Object.keys(t.days), ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  assert.deepEqual(t.days['2026-11-03'], { title: 'יום 1 · הגעה', lines: ['ערב · צ׳ק אין'], more: 0 });
  assert.deepEqual(t.days['2026-11-04'], { title: 'יום 2', lines: ['בוקר · לובר', 'צהריים · שאנז אליזה', 'ערב · מסעדה'], more: 1 });
  assert.deepEqual(t.days['2026-11-05'], { title: 'יום 3', lines: [], more: 0 });
  // Days already gone are left out.
  const [later] = widgetSnapshot({ trips: [paris], daysByTrip: { p: days }, now: new Date(2026, 10, 5, 8) }).trips;
  assert.deepEqual(Object.keys(later.days), ['2026-11-05', '2026-11-06']);
});

test('packing: how much of the list is packed; open reminders, the soonest first', () => {
  const checklist = [
    { completed: true, assignedTo: ['me'] }, { completed: false, assignedTo: 'me' },
    { completed: true }, { completed: false, assignedTo: ['other'] },
  ];
  const reminders = [
    { text: 'מונית', createdAt: 1 }, { text: 'כרטיסים', remindAt: '2026-11-02T09:00', createdAt: 2 },
    { text: 'נעשה', completed: true, createdAt: 0 },
  ];
  const [t] = widgetSnapshot({ trips: [paris], checklistByTrip: { p: checklist }, remindersByTrip: { p: reminders }, now }).trips;
  assert.deepEqual(t.packed, { done: 2, total: 4 });
  assert.deepEqual(t.reminders, { open: 2, next: 'כרטיסים' });
});

test('nothing ahead: an empty list, still a snapshot', () => {
  const s = widgetSnapshot({ trips: [past], now, palette: 'sand' });
  assert.equal(s.v, 1);
  assert.equal(s.palette, 'sand');
  assert.deepEqual(s.trips, []);
});
