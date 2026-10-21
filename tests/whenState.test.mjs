import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whenState } from '../src/lib/whenState.js';

const at = (s) => { const [d, t = '00:00'] = s.split(' '); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(y, m - 1, dd, h, mi); };

test('no date, no state', () => {
  assert.equal(whenState(null), null);
  assert.equal(whenState({}), null);
  assert.equal(whenState({ startDate: 'bad' }), null);
});

test('a date with no time is the whole day', () => {
  const ev = { startDate: '2026-12-10' };
  assert.equal(whenState(ev, at('2026-12-09 23:59')), 'upcoming');
  assert.equal(whenState(ev, at('2026-12-10 00:00')), 'live');
  assert.equal(whenState(ev, at('2026-12-10 23:59')), 'live');
  assert.equal(whenState(ev, at('2026-12-11 00:00')), 'past');
});

test('a range with no time is the whole days', () => {
  const ev = { startDate: '2026-12-10', endDate: '2026-12-12' };
  assert.equal(whenState(ev, at('2026-12-09 12:00')), 'upcoming');
  assert.equal(whenState(ev, at('2026-12-11 03:00')), 'live');
  assert.equal(whenState(ev, at('2026-12-12 23:00')), 'live');
  assert.equal(whenState(ev, at('2026-12-13 00:00')), 'past');
});

test('a time with an end', () => {
  const ev = { startDate: '2026-12-10', startTime: '19:00', endTime: '21:30' };
  assert.equal(whenState(ev, at('2026-12-10 18:59')), 'upcoming');
  assert.equal(whenState(ev, at('2026-12-10 19:00')), 'live');
  assert.equal(whenState(ev, at('2026-12-10 21:29')), 'live');
  assert.equal(whenState(ev, at('2026-12-10 21:30')), 'past');
});

test('an end earlier than the start is past midnight', () => {
  const ev = { startDate: '2026-12-10', startTime: '22:00', endTime: '02:00' };
  assert.equal(whenState(ev, at('2026-12-11 01:00')), 'live');
  assert.equal(whenState(ev, at('2026-12-11 02:00')), 'past');
});

test('a time with no end is live for an hour', () => {
  const ev = { startDate: '2026-12-10', startTime: '10:00' };
  assert.equal(whenState(ev, at('2026-12-10 09:00')), 'upcoming');
  assert.equal(whenState(ev, at('2026-12-10 10:30')), 'live');
  assert.equal(whenState(ev, at('2026-12-10 11:00')), 'past');
});

test('a range with hours: every day in those hours', () => {
  const ev = { startDate: '2026-12-01', endDate: '2026-12-24', startTime: '11:00', endTime: '21:00' };
  assert.equal(whenState(ev, at('2026-11-30 12:00')), 'upcoming');
  assert.equal(whenState(ev, at('2026-12-01 10:00')), 'upcoming');
  assert.equal(whenState(ev, at('2026-12-05 12:00')), 'live');
  assert.equal(whenState(ev, at('2026-12-05 22:00')), 'upcoming');
  assert.equal(whenState(ev, at('2026-12-06 08:00')), 'upcoming');
  assert.equal(whenState(ev, at('2026-12-24 20:59')), 'live');
  assert.equal(whenState(ev, at('2026-12-24 21:00')), 'past');
});

test('a range with night hours: live past midnight, past after the last night', () => {
  const ev = { startDate: '2026-12-01', endDate: '2026-12-03', startTime: '20:00', endTime: '01:00' };
  assert.equal(whenState(ev, at('2026-12-02 00:30')), 'live');
  assert.equal(whenState(ev, at('2026-12-02 12:00')), 'upcoming');
  assert.equal(whenState(ev, at('2026-12-04 00:30')), 'live');
  assert.equal(whenState(ev, at('2026-12-04 01:00')), 'past');
});

test('an end date before the start is ignored', () => {
  const ev = { startDate: '2026-12-10', endDate: '2026-12-01' };
  assert.equal(whenState(ev, at('2026-12-10 12:00')), 'live');
  assert.equal(whenState(ev, at('2026-12-11 12:00')), 'past');
});
