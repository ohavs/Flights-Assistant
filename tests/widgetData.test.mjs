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
  assert.deepEqual([out.from, out.to], ['TLV', 'CDG']);
  assert.equal(out.when, 'יום ג׳ 3.11 · 07:30');
  assert.equal(back.at, null);                                    // no time yet
  assert.equal(back.when, 'יום ו׳ 6.11');
  assert.equal(back.title, 'טיסת חזור');
});

test('the plan of each coming day, in time-of-day order, eight items and a count', () => {
  const days = [
    { id: 'd1', order: 0, date: '2026-11-03', title: 'הגעה', activities: [{ title: 'צ׳ק אין', timeLabel: 'ערב' }] },
    { id: 'd2', order: 1, date: '2026-11-04', activities: [
      { title: 'מסעדה', timeLabel: 'ערב' }, { title: 'לובר', timeLabel: 'בוקר' }, { title: 'שאנז אליזה', timeLabel: 'צהריים' },
      { title: 'גלידה' }, { title: '' },
      ...['א', 'ב', 'ג', 'ד', 'ה'].map(title => ({ title, timeLabel: 'לילה' })),
    ] },
  ];
  const [t] = widgetSnapshot({ trips: [paris], daysByTrip: { p: days }, now }).trips;
  assert.deepEqual(Object.keys(t.days), ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  assert.deepEqual(t.days['2026-11-03'], { title: 'יום 1 · הגעה', name: 'הגעה', when: 'יום ג׳ 3.11', items: [{ time: 'ערב', title: 'צ׳ק אין' }], more: 0 });
  const d2 = t.days['2026-11-04'];
  assert.deepEqual(d2.items.slice(0, 3), [{ time: 'בוקר', title: 'לובר' }, { time: 'צהריים', title: 'שאנז אליזה' }, { time: 'ערב', title: 'מסעדה' }]);
  assert.equal(d2.items.length, 8);
  assert.equal(d2.more, 1);
  assert.deepEqual(t.days['2026-11-05'], { title: 'יום 3', name: '', when: 'יום ה׳ 5.11', items: [], more: 0 });
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
  assert.deepEqual(t.reminders, {
    open: 2, next: 'כרטיסים',
    items: [{ text: 'כרטיסים', at: new Date(2026, 10, 2, 9, 0).getTime() }, { text: 'מונית', at: null }],
  });
});

test('nothing ahead: an empty list, still a snapshot', () => {
  const s = widgetSnapshot({ trips: [past], now, palette: 'sand' });
  assert.equal(s.v, 1);
  assert.equal(s.palette, 'sand');
  assert.deepEqual(s.trips, []);
});

test('the expense widget: currencies, categories, the latest currency, and rates for them', () => {
  const expenses = [
    { currency: 'EUR', category: 'אוכל ושתייה', createdAt: '2026-11-03T10:00:00.000Z' },
    { currency: 'CHF', category: 'מוזיאונים', createdAt: '2026-11-04T09:00:00.000Z' },
    { currency: 'EUR', createdAt: '2026-11-02T09:00:00.000Z' },
  ];
  const rates = { EUR: 1, ILS: 4.05, USD: 1.1, CHF: 0.96, JPY: 162 };
  const s = widgetSnapshot({ trips: [paris, rome], expensesByTrip: { p: expenses }, rates, now });
  const [p, r] = s.trips;
  assert.equal(p.spend.currency, 'CHF');
  assert.deepEqual(p.spend.currencies.map(c => c.code), ['ILS', 'EUR', 'USD', 'CHF']);
  assert.deepEqual(p.spend.currencies[0], { code: 'ILS', symbol: '₪' });
  assert.equal(p.spend.categories.at(-1), 'מוזיאונים');
  assert.ok(p.spend.categories.includes('כללי'));
  // A trip with no expenses yet: the tab's defaults, in shekels.
  assert.equal(r.spend.currency, 'ILS');
  assert.deepEqual(r.spend.currencies.map(c => c.code), ['ILS', 'EUR', 'USD']);
  // Only the rates the widget can use.
  assert.deepEqual(s.rates, { ILS: 4.05, EUR: 1, USD: 1.1, CHF: 0.96 });
  assert.equal(widgetSnapshot({ trips: [paris], now }).rates, null);
});

test('a plan item keeps its place, for the expense widget to link to', () => {
  const days = [{ id: 'd1', order: 0, date: '2026-11-03', activities: [{ title: 'לובר', placeId: 'pl1' }, { title: 'גלידה' }] }];
  const [t] = widgetSnapshot({ trips: [paris], daysByTrip: { p: days }, now }).trips;
  assert.deepEqual(t.days['2026-11-03'].items, [{ time: '', title: 'לובר', placeId: 'pl1' }, { time: '', title: 'גלידה' }]);
});

test('the app\'s theme: light or dark whatever the phone is, else the phone\'s', () => {
  assert.equal(widgetSnapshot({ trips: [paris], now }).theme, 'system');
  assert.equal(widgetSnapshot({ trips: [paris], theme: 'dark', now }).theme, 'dark');
  assert.equal(widgetSnapshot({ trips: [paris], theme: 'light', now }).theme, 'light');
  assert.equal(widgetSnapshot({ trips: [paris], theme: 'sepia', now }).theme, 'system');
});
