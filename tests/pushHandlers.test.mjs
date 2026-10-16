// N5 on the Firestore emulator: what a partner's change sends, and to
// whom (functions/handlers.js). The emulator does not pass the writer's
// identity to triggers, so the tests call the handlers with it, as the
// triggers in functions/index.js do.
//   npm run test:data
import test from 'node:test';
import assert from 'node:assert/strict';
import { emulatorDb } from '../functions/testing.js';
import { makeHandlers } from '../functions/handlers.js';
import { DIGEST_MS } from '../functions/push.js';

const db = emulatorDb('demo-flights');
const sent = [];
let clock = Date.parse('2026-10-16T10:00:00Z');
const on = makeHandlers({ db, deliver: async (uids, msg, meta) => { sent.push({ uids: [...uids].sort(), ...msg, ...meta }); }, now: () => clock });

const tripId = `trip_push_${Date.now()}`;
const [noa, dani, roni] = ['u_noa', 'u_dani', 'u_roni'];
await Promise.all([
  db.doc(`users/${noa}`).set({ displayName: 'נועה' }),
  db.doc(`users/${dani}`).set({ displayName: 'דני' }),
  db.doc(`users/${roni}`).set({ email: 'roni@example.com' }),
]);
const trip = { name: 'בודפשט', members: { [noa]: 'owner', [dani]: 'editor' }, memberIds: [noa, dani] };
await db.doc(`trips/${tripId}`).set(trip);
const last = () => sent[sent.length - 1];

test('adding a member tells them, and tells the others', async () => {
  const after = { ...trip, members: { ...trip.members, [roni]: 'viewer' }, memberIds: [noa, dani, roni] };
  await db.doc(`trips/${tripId}`).set(after);
  await on.tripUpdated(noa, tripId, trip, after);
  const [added, joined] = sent.splice(0);
  assert.deepEqual([added.uids, added.title, added.body, added.tab], [[roni], 'צורפת לטיול', 'בודפשט · מאת נועה', 'flight']);
  assert.deepEqual([joined.uids, joined.title, joined.body], [[dani], 'בודפשט: הצטרפות לטיול', 'roni']);
});

test("a partner's expenses reach everyone else, counted in one notification", async () => {
  await on.expenseCreated(dani, tripId, { amount: 42, currency: 'EUR', description: 'קפה' });
  assert.deepEqual([last().uids, last().title, last().body, last().tab], [[noa, roni].sort(), 'בודפשט: הוצאה חדשה', 'דני · 42 € · קפה', 'expenses']);
  clock += 60_000;
  await on.expenseCreated(dani, tripId, { amount: 18, currency: 'ILS', description: 'מונית' });
  assert.deepEqual([last().title, last().body], ['בודפשט: 2 הוצאות חדשות', 'דני · 42 € · קפה, 18 ₪ · מונית']);
  assert.equal(last().tag, `${tripId}:expense:${dani}`);
  // Someone else's count is their own.
  await on.expenseCreated(noa, tripId, { amount: 5, currency: 'EUR', category: 'אוכל' });
  assert.deepEqual([last().uids, last().title], [[dani, roni].sort(), 'בודפשט: הוצאה חדשה']);
  // After a pause it starts over.
  clock += DIGEST_MS + 1;
  await on.expenseCreated(dani, tripId, { amount: 7, currency: 'EUR', description: 'גלידה' });
  assert.equal(last().title, 'בודפשט: הוצאה חדשה');
});

test('places and activities count together; a moved activity is not new', async () => {
  sent.length = 0;
  await on.placeCreated(roni, tripId, { title: 'הפרלמנט' });
  assert.deepEqual([last().title, last().body, last().tab], ['בודפשט: מקום חדש', 'roni · הפרלמנט', 'planning']);
  const day = { title: 'יום 2', activities: [{ id: 'a1', title: 'שייט', order: 1 }] };
  await on.dayUpdated(roni, tripId, day, { ...day, activities: [{ id: 'a1', title: 'שייט', order: 2 }] });
  assert.equal(sent.length, 1);
  await on.dayUpdated(roni, tripId, day, { ...day, activities: [...day.activities, { id: 'a2', title: 'מרחצאות' }] });
  assert.deepEqual([last().title, last().body], ['בודפשט: 2 חדשים בתכנון', 'roni · הפרלמנט, מרחצאות (יום 2)']);
});

test('a gate change is news; a refresh that changes nothing is not; no app user, no push', async () => {
  sent.length = 0;
  const out = { flightNumber: 'LY2371', gate: 'B10', status: 'בזמן' };
  const before = { ...trip, outboundFlightDetails: out };
  await on.tripUpdated(dani, tripId, before, { ...before, outboundFlightDetails: { ...out, lastRefreshed: 1 } });
  assert.equal(sent.length, 0);
  await on.tripUpdated(dani, tripId, before, { ...before, outboundFlightDetails: { ...out, gate: 'B12' } });
  assert.deepEqual([last().uids, last().title, last().body], [[noa], 'בודפשט: שינוי בטיסת הלוך', 'דני · שער B12']);
  await on.tripUpdated(null, tripId, before, { ...before, outboundFlightDetails: { ...out, gate: 'C1' } });
  await on.expenseCreated(null, tripId, { amount: 1, currency: 'EUR' });
  assert.equal(sent.length, 1);
});
