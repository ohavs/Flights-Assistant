// A day of the export, as the schedule shows it (8.92.0).
//   node --test tests/exportDay.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { exportDay, bookingLine, blockText } from '../src/lib/exportDay.js';

const day = {
  date: '2026-11-20',
  activities: [
    { id: 'a1', title: 'הקולוסיאום', timeLabel: '10:00', placeId: 'p1', category: 'אטרקציות' },
    { id: 'a2', title: 'פיצה', timeLabel: 'ערב', optional: true },
    { id: 'b1', block: 'text', text: 'לקנות כרטיסים מראש', after: 'act:a1' },
    { id: 'b2', block: 'check', text: 'לקחת', items: [{ id: 'i1', text: 'מים', done: true }, { id: 'i2', text: ' ' }], after: null },
    { id: 'b3', block: 'link', url: 'https://example.com/t', label: '', after: 'act:a2' },
    { id: 'b4', block: 'text', text: '  ', after: null },
  ],
};
const bookings = [
  { id: 'k1', title: 'הקולוסיאום', placeId: 'p1', date: '2026-11-20', time: '09:30', confirmation: 'COL7', address: 'Piazza del Colosseo' },
  { id: 'k2', title: 'מסעדה', date: '2026-11-20', time: '20:30', people: 4, status: 'pending' },
  { id: 'k3', title: 'בוטלה', date: '2026-11-20', time: '12:00', status: 'cancelled' },
];
const flights = { ret: { date: '2026-11-20', depTime: '23:00', arrAirport: { city: 'תל אביב' } } };

test('the day in the schedule\'s order: blocks in place, bookings, the flight; not a cancelled booking or an empty block', () => {
  const e = exportDay(day, { bookings, flights });
  assert.deepEqual(e.map(x => x.kind === 'block' ? `block:${x.block}` : `${x.kind}:${x.title}`), [
    'block:check',
    'activity:הקולוסיאום',
    'block:text',
    'activity:פיצה',
    'block:link',
    'booking:מסעדה',
    'fixed:טיסה לתל אביב',
  ]);
  const colo = e.find(x => x.title === 'הקולוסיאום');
  assert.equal(colo.time, '09:30');                    // the booking's time, as in the schedule
  assert.equal(colo.booking.confirmation, 'COL7');
  assert.equal(colo.address, 'Piazza del Colosseo');
  assert.equal(e.find(x => x.title === 'פיצה').optional, true);
  assert.deepEqual(e[0].items, [{ text: 'מים', done: true }]);
  assert.equal(e.find(x => x.block === 'link').label, 'example.com');
});

test('no date: the activities and blocks only', () => {
  const e = exportDay({ ...day, date: undefined }, { bookings, flights });
  assert.equal(e.filter(x => x.kind === 'booking' || x.kind === 'fixed').length, 0);
  assert.equal(e.length, 5);
});

test('a booking and a block in one line', () => {
  assert.equal(bookingLine(bookings[1], 'מסעדה'), 'הזמנה (מסעדה) · ממתינה לאישור · 4 אנשים');
  assert.equal(bookingLine(bookings[0]), 'הזמנה · אישור COL7');
  assert.equal(blockText({ block: 'check', text: 'לקחת', items: [{ text: 'מים', done: true }, { text: 'כובע', done: false }] }), 'לקחת: ✓ מים  ○ כובע');
  assert.equal(blockText({ block: 'link', url: 'https://x.com', label: 'x.com' }), 'x.com (https://x.com)');
  assert.equal(blockText({ block: 'text', text: 'שלום' }), 'שלום');
});
