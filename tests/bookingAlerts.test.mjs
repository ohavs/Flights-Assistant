// Bookings: which are notified, on which day, at what time, and what it says.
//   node --test tests/bookingAlerts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingAlerts } from '../src/lib/bookingAlerts.js';

const trips = [{ id: 't1', name: 'רומא' }];
const now = new Date(2026, 10, 1, 12, 0);            // 1.11.2026 12:00 local
const local = (a) => [a.at.getDate(), a.at.getHours(), a.at.getMinutes()];

test('at 08:00 on the booking\'s day, by default', () => {
  const byTrip = { t1: [
    { id: 'a', title: 'Roscioli', date: '2026-11-03', time: '20:30', people: 4, bookedUnder: 'אוהב', confirmation: 'RX42', status: 'confirmed' },
  ] };
  const [a, ...rest] = bookingAlerts(trips, byTrip, undefined, undefined, now);
  assert.equal(rest.length, 0);
  assert.deepEqual(local(a), [3, 8, 0]);
  assert.equal(a.title, 'הזמנה להיום: Roscioli');
  assert.equal(a.body, 'ב־20:30 · 4 אנשים · על שם אוהב · אישור RX42 · רומא');
  assert.deepEqual(a.extra, { kind: 'booking', tripId: 't1', tab: 'bookings' });
});

test('the time and the day are the phone owner\'s choice', () => {
  const byTrip = { t1: [{ id: 'a', title: 'וותיקן', date: '2026-11-03', time: '14:00' }] };
  assert.deepEqual(local(bookingAlerts(trips, byTrip, '10:15', 'same', now)[0]), [3, 10, 15]);
  const [b] = bookingAlerts(trips, byTrip, '19:00', 'before', now);
  assert.deepEqual(local(b), [2, 19, 0]);
  assert.equal(b.title, 'הזמנה למחר: וותיקן');
});

test('a booking at or before the time is notified the day before', () => {
  const byTrip = { t1: [
    { id: 'a', title: 'סיור זריחה', date: '2026-11-03', time: '07:00' },
    { id: 'b', title: 'בדיוק בשמונה', date: '2026-11-03', time: '08:00' },
    { id: 'c', title: 'בלי שעה', date: '2026-11-03' },
  ] };
  const out = bookingAlerts(trips, byTrip, '08:00', 'same', now);
  assert.deepEqual(out.map(a => [a.body.split(' · ')[0], ...local(a)]), [
    ['ב־07:00', 2, 8, 0], ['ב־08:00', 2, 8, 0], ['רומא', 3, 8, 0],
  ]);
  assert.equal(out[0].title, 'הזמנה למחר: סיור זריחה');
});

test('not cancelled, not undated, not past; pending says so', () => {
  const byTrip = { t1: [
    { id: 'a', title: 'בוטלה', date: '2026-11-03', status: 'cancelled' },
    { id: 'b', title: 'בלי תאריך' },
    { id: 'c', title: 'הבוקר עבר', date: '2026-11-01', time: '20:00' },
    { id: 'd', title: 'ממתינה', date: '2026-11-04', status: 'pending', people: 1 },
    { id: 'e', date: '2026-11-04' },
  ] };
  const out = bookingAlerts(trips, byTrip, '08:00', 'same', now);
  assert.equal(out.length, 1);
  assert.equal(out[0].body, 'אדם אחד · ממתינה לאישור · רומא');
});

test('one stable id per booking, sorted by time', () => {
  const byTrip = { t1: [
    { id: 'late', title: 'ב', date: '2026-11-05' },
    { id: 'soon', title: 'א', date: '2026-11-02' },
  ] };
  const out = bookingAlerts(trips, byTrip, '08:00', 'same', now);
  assert.deepEqual(out.map(a => a.title), ['הזמנה להיום: א', 'הזמנה להיום: ב']);
  assert.equal(out[1].id, bookingAlerts(trips, byTrip, '09:00', 'before', now)[0].id);   // moved, same id
  assert.notEqual(out[0].id, out[1].id);
});
