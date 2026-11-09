// The home screen widget's snapshot: which trips, and what each carries.
//   node --test tests/widgetData.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { widgetTrips, widgetSnapshot } from '../src/lib/widgetData.js';
import { destinationCurrency, tripCurrencies } from '../src/lib/destinationCurrency.js';

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

test('the plan of each coming day, in time-of-day order, up to twenty items and a count', () => {
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
  // The flight stands on its date, at its time (as in the schedule).
  assert.deepEqual(t.days['2026-11-03'], { title: 'יום 1 · הגעה', name: 'הגעה', when: 'יום ג׳ 3.11', items: [{ time: '07:30', title: 'טיסה ל־CDG' }, { time: 'ערב', title: 'צ׳ק אין' }], more: 0 });
  const d2 = t.days['2026-11-04'];
  assert.deepEqual(d2.items.slice(0, 3), [{ time: 'בוקר', title: 'לובר' }, { time: 'צהריים', title: 'שאנז אליזה' }, { time: 'ערב', title: 'מסעדה' }]);
  assert.equal(d2.items.length, 9);
  assert.equal(d2.more, 0);
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
    { id: 'r1', text: 'מונית', createdAt: 1 }, { id: 'r2', text: 'כרטיסים', remindAt: '2026-11-02T09:00', createdAt: 2 },
    { id: 'r3', text: 'נעשה', completed: true, createdAt: 0 },
  ];
  const [t] = widgetSnapshot({ trips: [paris], checklistByTrip: { p: checklist }, remindersByTrip: { p: reminders }, now }).trips;
  assert.deepEqual(t.packed, { done: 2, total: 4 });
  assert.deepEqual(t.reminders, {
    open: 2, next: 'כרטיסים',
    items: [{ id: 'r2', text: 'כרטיסים', at: new Date(2026, 10, 2, 9, 0).getTime() }, { id: 'r1', text: 'מונית', at: null }],
  });
});

test('nothing ahead: an empty list, still a snapshot', () => {
  const s = widgetSnapshot({ trips: [past], now, palette: 'sand' });
  assert.equal(s.v, 1);
  assert.equal(s.palette, 'sand');
  assert.deepEqual(s.trips, []);
});

test('the expense widget: the destination\'s currencies, categories, places, and rates for them', () => {
  const expenses = [
    { currency: 'EUR', category: 'אוכל ושתייה', createdAt: '2026-11-03T10:00:00.000Z' },
    { currency: 'CHF', category: 'מוזיאונים', createdAt: '2026-11-04T09:00:00.000Z' },
    { currency: 'EUR', createdAt: '2026-11-02T09:00:00.000Z' },
  ];
  const plans = [
    { id: 'p1', title: 'מגדל אייפל', visited: true }, { id: 'p2', title: 'הלובר' }, { id: 'p3', title: 'אורסיי' }, { id: 'x' },
  ];
  const rates = { EUR: 1, ILS: 4.05, USD: 1.1, CHF: 0.96, JPY: 162 };
  const s = widgetSnapshot({ trips: [paris, rome], expensesByTrip: { p: expenses }, plansByTrip: { p: plans }, rates, now });
  const [p, r] = s.trips;
  // Paris (CDG): shekels and euros, then what the trip used.
  assert.deepEqual(p.spend.currencies.map(c => c.code), ['ILS', 'EUR', 'CHF']);
  assert.deepEqual(p.spend.currencies[0], { code: 'ILS', symbol: '₪' });
  assert.equal(p.spend.currency, 'EUR');
  assert.equal(p.spend.categories.at(-1), 'מוזיאונים');
  assert.ok(p.spend.categories.includes('כללי'));
  // Places not visited first, then by name; nameless ones left out.
  assert.deepEqual(p.spend.places.map(x => x.id), ['p3', 'p2', 'p1']);
  // Rome, no flight yet: known by its name.
  assert.equal(r.spend.currency, 'EUR');
  assert.deepEqual(r.spend.currencies.map(c => c.code), ['ILS', 'EUR']);
  // No destination known: the tab's defaults, in shekels.
  const [u] = widgetSnapshot({ trips: [{ ...rome, id: 'u', name: 'טיול' }], now }).trips;
  assert.equal(u.spend.currency, 'ILS');
  assert.deepEqual(u.spend.currencies.map(c => c.code), ['ILS', 'EUR', 'USD']);
  // The rates of every currency the widget can offer: its settings add any the app knows.
  assert.deepEqual(s.rates, { ILS: 4.05, EUR: 1, CHF: 0.96, USD: 1.1, JPY: 162 });
  assert.equal(widgetSnapshot({ trips: [paris], now }).rates, null);
  // Those currencies, with their signs and names.
  assert.ok(s.currencies.length > 30);
  assert.deepEqual(s.currencies.find(c => c.code === 'HUF'), { code: 'HUF', symbol: 'Ft', name: 'פורינט הונגרי' });
});

test('a trip with no flight yet: its destination as typed; a currency the trip saved', () => {
  assert.equal(destinationCurrency({ destination: 'בודפשט' }), 'HUF');
  assert.equal(destinationCurrency({ destination: 'בודפשט, הונגריה' }), 'HUF');
  assert.equal(destinationCurrency({ name: 'סוף שבוע בפראג' }), 'CZK');
  assert.deepEqual(tripCurrencies({ destination: 'ניו יורק' }, ['ILS']), ['ILS', 'USD']);
  assert.equal(destinationCurrency({ destination: 'מקום לא מוכר' }), null);
  // Added in the expense form, kept on the trip, after its own.
  assert.deepEqual(tripCurrencies({ destination: 'בודפשט', expenseCurrencies: ['GBP', 'HUF', 'XYZ'] }, ['ILS']), ['ILS', 'EUR', 'HUF', 'GBP']);
  assert.deepEqual(tripCurrencies({ expenseCurrencies: ['GBP'] }, ['ILS', 'EUR', 'USD']), ['ILS', 'EUR', 'USD', 'GBP']);
});

test('the destination\'s currency: Budapest offers shekels, euros and forints, New York dollars', () => {
  const budapest = { ...rome, id: 'b', outboundFlightDetails: { date: '2026-12-10', arrAirport: { code: 'BUD' } } };
  const [b] = widgetSnapshot({ trips: [budapest], expensesByTrip: { b: [{ currency: 'EUR', createdAt: '2026-12-10' }] }, now }).trips;
  assert.deepEqual(b.spend.currencies.map(c => c.code), ['ILS', 'EUR', 'HUF']);
  assert.equal(b.spend.currency, 'HUF');
  assert.deepEqual(destinationCurrency(budapest), 'HUF');
  // A country the flight lookup saved wins over the table.
  assert.equal(destinationCurrency({ outboundFlightDetails: { arrAirport: { code: 'XXX', country: 'jp' } } }), 'JPY');
  const nyc = { outboundFlightDetails: { arrAirport: { code: 'JFK' } } };
  assert.deepEqual(tripCurrencies(nyc, ['ILS', 'EUR', 'USD']), ['ILS', 'USD']);
  // Somewhere the table does not know: the defaults.
  assert.deepEqual(tripCurrencies({ outboundFlightDetails: { arrAirport: { code: 'ZZZ' } } }, ['ILS', 'EUR', 'USD']), ['ILS', 'EUR', 'USD']);
  // A known country whose money the app does not list: euros or dollars only.
  assert.deepEqual(tripCurrencies({ outboundFlightDetails: { arrAirport: { code: 'TBS' } } }, ['ILS']), ['ILS', 'USD']);
});

test('a plan item keeps its place, for the expense widget to link to', () => {
  const days = [{ id: 'd1', order: 0, date: '2026-11-03', activities: [{ title: 'לובר', placeId: 'pl1' }, { title: 'גלידה' }] }];
  const [t] = widgetSnapshot({ trips: [paris], daysByTrip: { p: days }, now }).trips;
  assert.deepEqual(t.days['2026-11-03'].items, [{ time: '07:30', title: 'טיסה ל־CDG' }, { time: '', title: 'לובר', placeId: 'pl1' }, { time: '', title: 'גלידה' }]);
});

test('a day as the schedule shows it: bookings on their date, the hotel, and my own plan', () => {
  const trip = { ...paris, hotelDetails: { name: 'Hotel', checkIn: '2026-11-04T15:00' } };
  const days = [{ id: 'd2', order: 1, date: '2026-11-04', activities: [{ id: 'a1', title: 'מסעדה', placeId: 'pl9', timeLabel: 'ערב' }] }];
  const bookings = [
    { id: 'b1', title: 'מסעדה', placeId: 'pl9', date: '2026-11-04', time: '20:30' },
    { id: 'b2', title: 'סיור', date: '2026-11-04', time: '11:00' },
    { id: 'b3', title: 'בוטל', date: '2026-11-04', time: '12:00', status: 'cancelled' },
  ];
  const personal = [{ id: '2026-11-04', activities: [{ id: 'm1', title: 'ריצה', timeLabel: '07:00' }] }];
  const [t] = widgetSnapshot({ trips: [trip], daysByTrip: { p: days }, bookingsByTrip: { p: bookings }, personalByTrip: { p: personal }, now }).trips;
  assert.deepEqual(t.days['2026-11-04'].items, [
    { time: '07:00', title: 'ריצה' },
    { time: '11:00', title: 'סיור' },
    { time: '15:00', title: 'צ׳ק־אין במלון' },
    { time: '20:30', title: 'מסעדה', placeId: 'pl9' },   // the booking's time, one line
  ]);
});

test('free blocks are in the plan widget, in their places, one line each (8.92.0)', () => {
  const days = [{ id: 'd2', order: 1, date: '2026-11-04', activities: [
    { id: 'a1', title: 'לובר', timeLabel: 'בוקר' },
    { id: 'a2', title: 'מסעדה', timeLabel: 'ערב' },
    { id: 'k1', block: 'text', text: 'לקנות כרטיסים מראש\nבאתר הרשמי', after: 'act:a1' },
    { id: 'k2', block: 'check', text: 'לקחת', items: [{ id: 'i1', text: 'מים', done: true }, { id: 'i2', text: 'כובע' }], after: 'act:a2' },
    { id: 'k3', block: 'link', url: 'https://www.example.com/t', label: '', after: null },
    { id: 'k4', block: 'text', text: ' ', after: null },
  ] }];
  const [t] = widgetSnapshot({ trips: [paris], daysByTrip: { p: days }, now }).trips;
  const d = t.days['2026-11-04'];
  assert.deepEqual(d.planItems, [
    { time: '', title: '🔗 example.com', note: true },
    { time: 'בוקר', title: 'לובר' },
    { time: '', title: '📝 לקנות כרטיסים מראש', note: true },
    { time: 'ערב', title: 'מסעדה' },
    { time: '', title: '☑️ לקחת · 1/2', note: true },
  ]);
  // Not among the things to do (the trip and countdown widgets, the
  // expense sheet's places).
  assert.deepEqual(d.items, [{ time: 'בוקר', title: 'לובר' }, { time: 'ערב', title: 'מסעדה' }]);
  assert.equal(d.more, 0);
  // A day with no blocks has no second list.
  assert.equal('planItems' in t.days['2026-11-03'], false);
});

test('the app\'s theme: light or dark whatever the phone is, else the phone\'s', () => {
  assert.equal(widgetSnapshot({ trips: [paris], now }).theme, 'system');
  assert.equal(widgetSnapshot({ trips: [paris], theme: 'dark', now }).theme, 'dark');
  assert.equal(widgetSnapshot({ trips: [paris], theme: 'light', now }).theme, 'light');
  assert.equal(widgetSnapshot({ trips: [paris], theme: 'sepia', now }).theme, 'system');
});

test('a day named only "יום 3" has no name of its own; places say whether they were visited', () => {
  const days = [{ id: 'd1', order: 0, date: '2026-11-03', title: 'יום 1', activities: [
    { title: 'לובר', placeId: 'pl1' }, { title: 'אורסיי' }, { title: 'גלידה' },
  ] }];
  const plans = [{ id: 'pl1', title: 'לובר', visited: true }, { id: 'pl2', title: 'אורסיי' }];
  const [t] = widgetSnapshot({ trips: [paris], daysByTrip: { p: days }, plansByTrip: { p: plans }, now }).trips;
  const d1 = t.days['2026-11-03'];
  assert.equal(d1.title, 'יום 1');
  assert.equal(d1.name, '');
  // By id, by name as the planning tab matches it, or no place at all.
  assert.deepEqual(d1.items.slice(1), [
    { time: '', title: 'לובר', placeId: 'pl1', visited: true },
    { time: '', title: 'אורסיי', placeId: 'pl2' },
    { time: '', title: 'גלידה' },
  ]);
});

test('a flight carries its landing, local clocks, gate and status, for the widget to follow it in the air', () => {
  const night = {
    id: 'n', name: 'בודפשט',
    outboundFlightDetails: {
      date: '2026-11-03', scheduledDep: '10:30 PM', scheduledArr: '02:50 AM', flightNumber: 'W61784', gate: 'B12', status: 'בזמן',
      depAirport: { code: 'TLV', timezone: 'UTC +02:00' }, arrAirport: { code: 'BUD', city: 'בודפשט', timezone: 'UTC +01:00' },
    },
    returnFlightDetails: { date: '2026-11-06' },
  };
  const [f] = widgetSnapshot({ trips: [night], now }).trips[0].flights;
  assert.equal(f.at, Date.UTC(2026, 10, 3, 20, 30));
  // 02:50 in Budapest is the next morning: 01:50 UTC on the 4th.
  assert.equal(f.arriveAt, Date.UTC(2026, 10, 4, 1, 50));
  assert.deepEqual([f.dep, f.arr, f.gate, f.status, f.number, f.toCity], ['22:30', '02:50', 'B12', 'בזמן', 'W61784', 'בודפשט']);
  // Not known yet: no landing, and empty words.
  const [, back] = widgetSnapshot({ trips: [night], now }).trips[0].flights;
  assert.equal(back.arriveAt, null);
  assert.deepEqual([back.dep, back.arr, back.gate], ['', '', '']);
});

test('offline, the phone keeps the coming trips and those still without dates', async () => {
  const { offlineTrips } = await import('../src/lib/widgetData.js');
  const now = new Date(2026, 9, 16);
  const trip = (id, out, ret, extra = {}) => ({
    id, ...extra,
    outboundFlightDetails: { date: out || '' }, returnFlightDetails: { date: ret || '' },
  });
  const list = offlineTrips([
    trip('past', '2026-09-01', '2026-09-05'),
    trip('later', '2026-12-01', '2026-12-05'),
    trip('now', '2026-10-14', '2026-10-20'),
    trip('undated'),
    trip('going', '2026-11-01', '2026-11-03', { deleteAt: Date.now() }),
  ], now);
  assert.deepEqual(list.map(t => t.id), ['now', 'later', 'undated']);
});

test('the bookings widget: the trip\'s bookings ahead, the soonest first, undated last; never cancelled or past', () => {
  const now = new Date(2026, 10, 4, 9, 0);   // 4.11.2026, local
  const paris = { id: 'p', name: 'פריז', outboundFlightDetails: { date: '2026-11-03' }, returnFlightDetails: { date: '2026-11-08' } };
  const bookings = [
    { id: 'b1', title: 'ארוחה', date: '2026-11-05', time: '20:30', confirmation: 'XK42', status: 'confirmed' },
    { id: 'b2', title: 'סיור', date: '2026-11-04', time: '10:00', status: 'pending' },
    { id: 'b3', title: 'עבר', date: '2026-11-03', time: '10:00' },
    { id: 'b4', title: 'בוטל', date: '2026-11-06', status: 'cancelled' },
    { id: 'b5', title: 'מרחצאות' },
    { id: 'b6', title: '', date: '2026-11-07' },
  ];
  const [p] = widgetSnapshot({ trips: [paris], bookingsByTrip: { p: bookings }, now }).trips;
  assert.deepEqual(p.bookings.map(b => b.id), ['b2', 'b1', 'b5']);
  assert.deepEqual(p.bookings[1], { id: 'b1', title: 'ארוחה', date: '2026-11-05', time: '20:30', code: 'XK42', pending: false });
  assert.equal(p.bookings[0].pending, true);
  assert.equal(p.bookings[2].date, '');
});
