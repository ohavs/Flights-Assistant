// N5: what a trip partner's change says, and to whom (functions/push.js).
//   node --test tests/push.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIGEST_MS, money, when, expenseLabel, membersOf, addedMembers, newActivities,
  travelChanges, digest, text,
} from '../functions/push.js';

const trip = { name: 'בודפשט', memberIds: ['a', 'b', 'c'], members: { a: 'owner', b: 'editor', c: 'viewer' } };

test('amounts, dates and an expense read as on the expenses tab', () => {
  assert.equal(money(42, 'EUR'), '42 €');
  assert.equal(money(1234.5, 'HUF'), '1,234.5 HUF');
  assert.equal(when('2026-11-03'), '3.11');
  assert.equal(when('2026-11-03T15:00'), '3.11 15:00');
  assert.equal(expenseLabel({ amount: 18, currency: 'ILS', description: 'מונית', category: 'תחבורה' }), '18 ₪ · מונית');
  assert.equal(expenseLabel({ amount: 9, currency: 'EUR', description: '', category: 'אוכל' }), '9 € · אוכל');
});

test('everyone in the trip but the one who made the change', () => {
  assert.deepEqual(membersOf(trip, ['b']).sort(), ['a', 'c']);
  assert.deepEqual(membersOf({ memberIds: ['a'], members: { a: 'owner', d: 'editor' } }, ['a']), ['d']);
});

test('who joined, and which activities are new (a move or an edit is not)', () => {
  assert.deepEqual(addedMembers({ members: { a: 'owner' } }, { members: { a: 'owner', b: 'editor' } }), ['b']);
  assert.deepEqual(addedMembers({ members: { a: 'owner', b: 'editor' } }, { members: { a: 'owner' } }), []);
  const before = { activities: [{ id: 'x', title: 'הלובר', order: 1 }] };
  const after = { activities: [{ id: 'x', title: 'הלובר', order: 2 }, { id: 'y', title: 'שייט' }, { id: 'y', title: 'שייט' }] };
  assert.deepEqual(newActivities(before, after).map(a => a.id), ['y']);
});

test('a flight or hotel change says what is new; a refresh stamp alone is nothing', () => {
  const out = { flightNumber: 'LY2371', gate: 'B10', status: 'בזמן', scheduledDep: '07:30', lastRefreshed: 1 };
  assert.deepEqual(travelChanges({ outboundFlightDetails: out }, { outboundFlightDetails: { ...out, lastRefreshed: 2 } }), []);
  assert.deepEqual(
    travelChanges({ outboundFlightDetails: out }, { outboundFlightDetails: { ...out, gate: 'B12', status: 'מעוכבת' } }),
    [{ which: 'outbound', parts: ['שער B12', 'מעוכבת'] }],
  );
  assert.deepEqual(
    travelChanges({ hotelDetails: { name: 'Aria' } }, { hotelDetails: { name: 'Aria', checkIn: '2026-11-03T15:00' } }),
    [{ which: 'hotel', parts: ['צ׳ק־אין 3.11 15:00'] }],
  );
  // A field cleared is not news; new airports alone are not either.
  assert.deepEqual(travelChanges({ returnFlightDetails: { gate: 'C3' } }, { returnFlightDetails: { gate: '' } }), []);
  assert.deepEqual(travelChanges({}, { outboundFlightDetails: { arrAirport: { code: 'BUD' } } }), []);
});

test('one person adding a lot is one notification that counts up', () => {
  const t0 = 1_000_000;
  let d = digest(null, 'קפה', t0);
  assert.deepEqual(d, { count: 1, items: ['קפה'], lastAt: t0 });
  d = digest(d, 'מונית', t0 + 60_000);
  d = digest(d, 'מוזיאון', t0 + 120_000);
  assert.equal(d.count, 3);
  assert.deepEqual(text('expense', { trip, actor: 'נועה', digest: d }),
    { title: 'בודפשט: 3 הוצאות חדשות', body: 'נועה · קפה, מונית, מוזיאון' });
  for (const x of ['a', 'b', 'c']) d = digest(d, x, t0 + 180_000);
  assert.equal(d.count, 6);
  assert.equal(d.items.length, 4);
  assert.match(text('plan', { trip, actor: 'נועה', digest: d }).body, /ועוד$/);
  // A pause starts over.
  assert.equal(digest(d, 'חדש', d.lastAt + DIGEST_MS + 1).count, 1);
});

test('the words of each kind', () => {
  const one = digest(null, '42 € · קפה', 0);
  assert.deepEqual(text('expense', { trip, actor: 'נועה', digest: one }), { title: 'בודפשט: הוצאה חדשה', body: 'נועה · 42 € · קפה' });
  assert.equal(text('plan', { trip, actor: 'נועה', digest: digest(null, 'הלובר', 0) }).title, 'בודפשט: מקום חדש');
  assert.equal(text('plan', { trip, actor: 'נועה', digest: digest(null, 'שייט (יום 2)', 0), activity: true }).title, 'בודפשט: פעילות חדשה');
  assert.deepEqual(text('travel', { trip, actor: 'נועה', which: 'return', parts: ['שער C3'] }),
    { title: 'בודפשט: שינוי בטיסת החזור', body: 'נועה · שער C3' });
  assert.deepEqual(text('added', { trip, actor: 'נועה' }), { title: 'צורפת לטיול', body: 'בודפשט · מאת נועה' });
  assert.deepEqual(text('joined', { trip, name: 'דני' }), { title: 'בודפשט: הצטרפות לטיול', body: 'דני' });
});
