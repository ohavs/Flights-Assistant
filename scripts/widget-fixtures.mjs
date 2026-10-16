// Snapshots for the widget screenshots (scripts/widget-shots.sh), made by
// the app's own widgetSnapshot() at fixed moments, in UTC like the CI
// emulator. Prints "name nowMs base64" per line.
//   TZ=UTC node scripts/widget-fixtures.mjs
import { widgetSnapshot } from '../src/lib/widgetData.js';

const trip = {
  id: 'paris', name: 'פריז עם הילדים',
  outboundFlightDetails: {
    date: '2026-11-03', scheduledDep: '07:30', scheduledArr: '10:45', flightNumber: 'LY 323', gate: 'B12', status: 'בזמן',
    depAirport: { code: 'TLV', timezone: 'UTC +00:00' }, arrAirport: { code: 'CDG', city: 'פריז', timezone: 'UTC +00:00' },
  },
  returnFlightDetails: {
    date: '2026-11-06', scheduledDep: '18:10', flightNumber: 'LY 326',
    depAirport: { code: 'CDG', timezone: 'UTC +00:00' }, arrAirport: { code: 'TLV' },
  },
};
// A second trip, later: a widget can be set to it (WidgetTrips).
const rome = {
  id: 'rome', name: 'רומא עם ההורים',
  outboundFlightDetails: { date: '2026-12-10', scheduledDep: '09:00', flightNumber: 'LY 383', depAirport: { code: 'TLV', timezone: 'UTC +00:00' }, arrAirport: { code: 'FCO', city: 'רומא', timezone: 'UTC +00:00' } },
  returnFlightDetails: { date: '2026-12-14' },
};
const days = [
  { id: 'd1', order: 0, date: '2026-11-03', title: 'הגעה', activities: [{ title: 'צ׳ק אין במלון', timeLabel: 'ערב' }] },
  { id: 'd2', order: 1, date: '2026-11-04', title: 'מוזיאונים', activities: [
    { title: 'מסעדה ליד הסיין', timeLabel: 'ערב' }, { title: 'הלובר', timeLabel: 'בוקר', placeId: 'pl-louvre' },
    { title: 'גני טווילרי', timeLabel: 'צהריים' }, { title: 'גלידה ברטיון' }, { title: 'מגדל אייפל בלילה', timeLabel: 'לילה' },
  ] },
];
const checklist = Array.from({ length: 22 }, (_, i) => ({ id: `c${i}`, completed: i < 12 }));
const reminders = [
  { id: 'r1', text: 'להזמין מונית לשדה', createdAt: 1, remindAt: '2026-10-29T18:00' },
  { id: 'r2', text: 'להדפיס כרטיסים', createdAt: 2 }, { id: 'r3', text: 'מטען נייד', createdAt: 3 },
  { id: 'r4', text: 'לקנות מתאם', createdAt: 4 }, { id: 'r5', text: 'להשאיר מפתח לשכנים', createdAt: 5 },
];
// The expense widget: the trip's last expense was in euros, in a category of its own.
const expenses = [{ amount: 12, currency: 'EUR', category: 'מוזיאונים', createdAt: '2026-11-03T12:00:00.000Z' }];
const rates = { EUR: 1, ILS: 4.05, USD: 1.1 };
// The planning tab's places: the expense sheet offers them after today's plan.
const plans = [
  { id: 'pl-louvre', title: 'הלובר' }, { id: 'pl-orsay', title: 'מוזיאון אורסיי' },
  { id: 'pl-eiffel', title: 'מגדל אייפל', visited: true },
];
const data = {
  daysByTrip: { paris: days }, checklistByTrip: { paris: checklist }, remindersByTrip: { paris: reminders },
  expensesByTrip: { paris: expenses }, plansByTrip: { paris: plans }, rates,
};

const at = (s) => new Date(s);
const cases = [
  ['flight', at('2026-10-29T10:00:00Z'), { palette: 'green' }],
  ['soon', at('2026-11-03T04:20:00Z'), { palette: 'ocean' }],
  // In the air: took off at 07:30, lands at 10:45.
  ['inair', at('2026-11-03T08:30:00Z'), { palette: 'green' }],
  ['plan', at('2026-11-04T09:00:00Z'), { palette: 'sand' }],
  ['plan-violet', at('2026-11-04T09:00:00Z'), { palette: 'violet' }],
  // The app set to dark, or to light, whatever the phone is.
  ['plan-app-dark', at('2026-11-04T09:00:00Z'), { palette: 'sand', theme: 'dark' }],
  ['plan-app-light', at('2026-11-04T09:00:00Z'), { palette: 'sand', theme: 'light' }],
  ['return', at('2026-11-06T09:00:00Z'), { palette: 'coral' }],
  ['ended', at('2027-01-05T09:00:00Z'), { palette: 'green' }],
];
for (const [name, now, opts] of cases) {
  const s = widgetSnapshot({ trips: [trip, rome], ...data, now, ...opts });
  console.log(`${name} ${now.getTime()} ${Buffer.from(JSON.stringify(s)).toString('base64')}`);
}
