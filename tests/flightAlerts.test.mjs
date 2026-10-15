// Flight reminders: the departure instant from a saved flight, and the two
// reminders counted back from it.   node --test tests/flightAlerts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClock, parseOffset, departureAt, flightAlerts, alertId } from '../src/lib/flightAlerts.js';

const flight = (over = {}) => ({
  flightNumber: 'LY381', date: '2026-11-03', scheduledDep: '07:30',
  depAirport: { timezone: 'UTC +02:00' }, ...over,
});

test('clock and offset parsing', () => {
  assert.deepEqual(parseClock('07:30'), [7, 30]);
  assert.deepEqual(parseClock('7:05 PM'), [19, 5]);
  assert.deepEqual(parseClock('12:10 am'), [0, 10]);
  assert.equal(parseClock(''), null);
  assert.equal(parseClock('25:00'), null);
  assert.equal(parseOffset('UTC +03:00'), 180);
  assert.equal(parseOffset('UTC -04:30'), -270);
  assert.equal(parseOffset(''), null);
});

test('departure is the local time at the departure airport', () => {
  // 07:30 at UTC+2 is 05:30 UTC.
  assert.equal(departureAt(flight()).toISOString(), '2026-11-03T05:30:00.000Z');
  // An updated departure wins over the schedule.
  assert.equal(departureAt(flight({ actualDep: '09:10 AM' })).toISOString(), '2026-11-03T07:10:00.000Z');
  // Unknown offset: Israel (UTC+3).
  assert.equal(departureAt(flight({ depAirport: {} })).toISOString(), '2026-11-03T04:30:00.000Z');
  // Not enough to go on.
  assert.equal(departureAt(flight({ date: '' })), null);
  assert.equal(departureAt(flight({ scheduledDep: '' })), null);
});

test('24 h and 3 h before each leg, only those still ahead', () => {
  const trip = { id: 't1', outboundFlightDetails: flight(), returnFlightDetails: flight({ flightNumber: 'LY382', date: '2026-11-10', scheduledDep: '18:00' }) };
  const all = flightAlerts([trip], new Date('2026-10-01T00:00:00Z'));
  assert.equal(all.length, 4);
  assert.equal(all[0].at.toISOString(), '2026-11-02T05:30:00.000Z');   // check-in, outbound
  assert.equal(all[1].at.toISOString(), '2026-11-03T02:30:00.000Z');   // leave, outbound
  assert.match(all[0].title, /צ'ק־אין לטיסת ההלוך LY381/);
  assert.match(all[1].body, /07:30/);
  assert.deepEqual(all[0].extra, { kind: 'flight', tripId: 't1', tab: 'flight' });
  // Between the two outbound reminders only the later ones remain.
  const later = flightAlerts([trip], new Date('2026-11-02T12:00:00Z'));
  assert.equal(later.length, 3);
  // A trip without flight details asks for nothing.
  assert.equal(flightAlerts([{ id: 'x' }]).length, 0);
});

test('ids are stable, distinct and fit Android (31-bit, non-zero)', () => {
  const a = alertId('t1', 'outbound', 'checkin');
  assert.equal(a, alertId('t1', 'outbound', 'checkin'));
  assert.notEqual(a, alertId('t1', 'outbound', 'leave'));
  assert.notEqual(a, alertId('t2', 'outbound', 'checkin'));
  assert.ok(a > 0 && a < 2 ** 31);
});
