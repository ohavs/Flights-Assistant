// Reminders with a time: who is notified, and when.
//   node --test tests/reminderAlerts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocal, reminderAlerts } from '../src/lib/reminderAlerts.js';

const trips = [{ id: 't1', name: 'בודפשט' }];
const now = new Date(2026, 10, 1, 12, 0);            // 1.11.2026 12:00 local

test('a local date-time is read in the phone\'s own time', () => {
  const d = parseLocal('2026-11-03T09:05');
  assert.equal(d.getFullYear(), 2026); assert.equal(d.getMonth(), 10); assert.equal(d.getDate(), 3);
  assert.equal(d.getHours(), 9); assert.equal(d.getMinutes(), 5);
  assert.equal(parseLocal(''), null);
  assert.equal(parseLocal('2026-11-03'), null);
});

test('only the owner\'s open, timed, future reminders', () => {
  const byTrip = { t1: [
    { id: 'a', text: 'לקנות ציפס', remindAt: '2026-11-02T09:00', addedByUid: 'me' },
    { id: 'b', text: 'של מישהו אחר', remindAt: '2026-11-02T09:00', addedByUid: 'friend' },
    { id: 'c', text: 'בלי בעלים', remindAt: '2026-11-02T10:00' },
    { id: 'd', text: 'בוצע', remindAt: '2026-11-02T09:00', addedByUid: 'me', completed: true },
    { id: 'e', text: 'עבר', remindAt: '2026-11-01T08:00', addedByUid: 'me' },
    { id: 'f', text: 'בלי שעה', addedByUid: 'me' },
  ] };
  const out = reminderAlerts(trips, byTrip, 'me', now);
  assert.deepEqual(out.map(a => a.body), ['לקנות ציפס', 'בלי בעלים']);
  assert.equal(out[0].title, 'תזכורת · בודפשט');
  assert.deepEqual(out[0].extra, { kind: 'reminder', tripId: 't1', tab: 'checklist' });
  assert.notEqual(out[0].id, out[1].id);
});
