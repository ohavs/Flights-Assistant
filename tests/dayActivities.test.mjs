// A day's plan on two phones; phone A is offline while phone B changes the
// same day. Every change from A must land without erasing B's, and the
// day keeps its order (src/lib/dayActivities.js).   npm run test:data
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, updateDoc,
  disableNetwork, enableNetwork, waitForPendingWrites,
} from 'firebase/firestore';
import {
  dayActivities, addActivities, updateActivity, updateActivities, removeActivity, swapActivities,
  moveActivityToDay, swapDays, clearActivities, putBack, restoreDays,
} from '../src/lib/dayActivities.js';
import { swapDayFields, anchoredIds, placeDays } from '../src/lib/dayPlan.js';

const phone = async (name) => {
  const app = initializeApp({ projectId: 'demo-flights', apiKey: 'demo-key' }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const cred = GoogleAuthProvider.credential(JSON.stringify({ sub: 'days@example.com', email: 'days@example.com', email_verified: true }));
  const { user } = await signInWithCredential(auth, cred);
  return { app, db, uid: user.uid };
};
const A = await phone('days-a');
const B = await phone('days-b');
after(() => Promise.all([deleteApp(A.app), deleteApp(B.app)]));

const act = (id, title) => ({ id, title, timeLabel: '', placeId: null, address: '', description: '', category: 'אחר' });
const [breakfast, museum, lunch, beach] = [
  act('a-1', 'ארוחת בוקר'), act('a-2', 'מוזיאון'), act('a-3', 'צהריים'), act('a-4', 'חוף'),
];

// A day as saved before `order`: three activities, by position only.
const newDay = async (label, activities = [breakfast, museum, lunch]) => {
  const trip = `${label}-${Date.now()}`;
  await setDoc(doc(B.db, 'trips', trip), {
    name: label, destination: '', dates: '',
    members: { [B.uid]: 'owner' }, memberIds: [B.uid], createdAt: new Date().toISOString(),
  });
  await setDoc(doc(B.db, 'trips', trip, 'days', 'd1'), { title: 'יום 1', order: 1, activities });
  return trip;
};
const raw = async (db, trip) => (await getDoc(doc(db, 'trips', trip, 'days', 'd1'))).data().activities;
const titles = async (trip) => dayActivities(await raw(B.db, trip)).map(a => a.title);

const whileOffline = async (onA, onB) => {
  await disableNetwork(A.db);
  const queued = onA();
  await onB();
  await enableNetwork(A.db);
  await queued;
  await waitForPendingWrites(A.db);
};
// B, online, adds the beach the new way.
const bAddsBeach = async (trip) => addActivities(B.db, trip, 'd1', await raw(B.db, trip), [beach]);

test('the old whole-array write from a stale view erases the other phone\'s activity', async () => {
  const trip = await newDay('days-old');
  const seen = await raw(A.db, trip);
  await whileOffline(
    () => updateDoc(doc(A.db, 'trips', trip, 'days', 'd1'), { activities: seen.filter(a => a.id !== museum.id) }),
    () => bAddsBeach(trip),
  );
  assert.ok(!(await titles(trip)).includes('חוף'), 'the risk this file guards against no longer reproduces');
});

test('add: both phones\' activities stay', async () => {
  const trip = await newDay('days-add');
  const seen = await raw(A.db, trip);
  await whileOffline(() => addActivities(A.db, trip, 'd1', seen, [act('a-5', 'שקיעה')]), () => bAddsBeach(trip));
  const got = await titles(trip);
  assert.deepEqual(got.slice(0, 3), ['ארוחת בוקר', 'מוזיאון', 'צהריים']);
  assert.deepEqual([...got.slice(3)].sort(), ['חוף', 'שקיעה'].sort());
});

test('delete: removes only that activity', async () => {
  const trip = await newDay('days-del');
  const seen = await raw(A.db, trip);
  await whileOffline(() => removeActivity(A.db, trip, 'd1', seen, museum.id), () => bAddsBeach(trip));
  assert.deepEqual(await titles(trip), ['ארוחת בוקר', 'צהריים', 'חוף']);
});

test('edit: keeps the activity in its place and the other phone\'s change', async () => {
  const trip = await newDay('days-edit');
  const seen = await raw(A.db, trip);
  await whileOffline(
    () => updateActivity(A.db, trip, 'd1', seen, { ...museum, title: 'מוזיאון הלובר' }),
    () => bAddsBeach(trip),
  );
  assert.deepEqual(await titles(trip), ['ארוחת בוקר', 'מוזיאון הלובר', 'צהריים', 'חוף']);
});

test('a new time that moves what comes after: one write, each in its place, the other phone\'s change kept', async () => {
  const trip = await newDay('days-shift');
  const seen = await raw(A.db, trip);
  await whileOffline(
    () => updateActivities(A.db, trip, 'd1', seen, [
      { ...museum, timeLabel: '10:30' }, { ...lunch, timeLabel: '13:30' },
    ]),
    () => bAddsBeach(trip),
  );
  const acts = dayActivities(await raw(B.db, trip));
  assert.deepEqual(acts.map(a => [a.title, a.timeLabel]), [
    ['ארוחת בוקר', ''], ['מוזיאון', '10:30'], ['צהריים', '13:30'], ['חוף', ''],
  ]);
  assert.equal((await raw(B.db, trip)).length, 4);
});

test('move: swaps two activities and keeps the other phone\'s change', async () => {
  const trip = await newDay('days-move');
  const seen = await raw(A.db, trip);
  await whileOffline(() => swapActivities(A.db, trip, 'd1', seen, breakfast.id, museum.id), () => bAddsBeach(trip));
  assert.deepEqual(await titles(trip), ['מוזיאון', 'ארוחת בוקר', 'צהריים', 'חוף']);
  // Moving again from a fresh view, down past the last one.
  await swapActivities(A.db, trip, 'd1', await raw(A.db, trip), lunch.id, beach.id);
  assert.deepEqual(await titles(trip), ['מוזיאון', 'ארוחת בוקר', 'חוף', 'צהריים']);
});

// Two days with dates, read back as the planner holds them.
const dayDoc = async (db, trip, id) => {
  const data = (await getDoc(doc(db, 'trips', trip, 'days', id))).data();
  return { id, ...data, activities: dayActivities(data.activities), rawActivities: data.activities || [] };
};

test('move to another day: out of one, at the end of the other', async () => {
  const trip = await newDay('days-move-day');
  await setDoc(doc(B.db, 'trips', trip, 'days', 'd2'), { title: 'יום 2', order: 2, activities: [beach] });
  await moveActivityToDay(A.db, trip, await dayDoc(A.db, trip, 'd1'), await dayDoc(A.db, trip, 'd2'), museum.id);
  assert.deepEqual((await dayDoc(B.db, trip, 'd1')).activities.map(a => a.title), ['ארוחת בוקר', 'צהריים']);
  assert.deepEqual((await dayDoc(B.db, trip, 'd2')).activities.map(a => a.title), ['חוף', 'מוזיאון']);
});

test('swapping days: the activities trade places, a booked one stays on its date', async () => {
  const trip = await newDay('days-swap');
  const dinner = { ...act('a-6', 'מסעדה'), placeId: 'p-rest', timeLabel: 'ערב' };
  await setDoc(doc(B.db, 'trips', trip, 'days', 'd1'), { title: 'יום 1', order: 1, date: '2026-11-05', activities: [breakfast, dinner] });
  await setDoc(doc(B.db, 'trips', trip, 'days', 'd2'), { title: 'יום 2', order: 2, date: '2026-11-06', activities: [beach] });
  const bookings = [{ id: 'b1', placeId: 'p-rest', date: '2026-11-05' }];
  const a = await dayDoc(A.db, trip, 'd1');
  const b = await dayDoc(A.db, trip, 'd2');
  await swapDays(A.db, trip, a, b, swapDayFields(a, b, 1, 2),
    anchoredIds(a.activities, a.date, bookings), anchoredIds(b.activities, b.date, bookings));
  const d1 = await dayDoc(B.db, trip, 'd1');
  const d2 = await dayDoc(B.db, trip, 'd2');
  // d2 now stands on the 5th: the beach, and the booked dinner that stayed.
  assert.deepEqual([d2.date, d2.title, d2.order], ['2026-11-05', 'יום 1', 1]);
  assert.deepEqual(d2.activities.map(x => x.title).sort(), ['חוף', 'מסעדה'].sort());
  assert.deepEqual([d1.date, d1.title, d1.order], ['2026-11-06', 'יום 2', 2]);
  assert.deepEqual(d1.activities.map(x => x.title), ['ארוחת בוקר']);
});

test('both phones edit one activity at once: one copy is shown, the newer', async () => {
  const trip = await newDay('days-same');
  const seen = await raw(A.db, trip);
  await whileOffline(
    () => updateActivity(A.db, trip, 'd1', seen, { ...museum, title: 'מוזיאון (A)' }),
    async () => {
      await new Promise(r => setTimeout(r, 5));
      await updateActivity(B.db, trip, 'd1', await raw(B.db, trip), { ...museum, title: 'מוזיאון (B)' });
    },
  );
  const shown = dayActivities(await raw(B.db, trip));
  assert.equal(shown.filter(a => a.id === museum.id).length, 1);
  assert.equal(shown.find(a => a.id === museum.id).title, 'מוזיאון (B)');
  // The next change to it clears every copy.
  await removeActivity(B.db, trip, 'd1', await raw(B.db, trip), museum.id);
  assert.ok(!(await raw(B.db, trip)).some(a => a.id === museum.id));
});

test('reading: old days by position, and a day an old app edited in place', () => {
  assert.deepEqual(dayActivities([breakfast, museum, lunch]).map(a => a.id), ['a-1', 'a-2', 'a-3']);
  // An old app rebuilds an edited activity without `order`, in its place.
  const mixed = [{ ...breakfast, order: 1 }, { ...museum }, { ...lunch, order: 3 }];
  assert.deepEqual(dayActivities(mixed).map(a => a.id), ['a-1', 'a-2', 'a-3']);
  assert.deepEqual(dayActivities(undefined), []);
});

// 8.81.0: a day is never taken away. Clearing it takes out its activities
// but what is kept; the day and the kept ones stay, and undo puts the rest
// back in their places, next to what the other phone added meanwhile.
test('clearing a day: the day stays, what is fixed stays, undo puts it back', async () => {
  const trip = await newDay('days-clear', [breakfast, museum, lunch]);
  const { removed, done } = clearActivities(A.db, trip, 'd1', await raw(A.db, trip), new Set([museum.id]));
  await done;
  assert.deepEqual(await titles(trip), ['מוזיאון']);
  await bAddsBeach(trip);
  await putBack(A.db, trip, 'd1', removed);
  const back = await titles(trip);
  assert.deepEqual(back.slice(0, 2), ['ארוחת בוקר', 'מוזיאון']);
  assert.deepEqual([...back].sort(), ['ארוחת בוקר', 'חוף', 'מוזיאון', 'צהריים'].sort());
  // Nothing to clear: no write.
  const none = clearActivities(A.db, trip, 'd1', [], new Set());
  assert.deepEqual(none.removed, []);
  await none.done;
});

test('bringing a day back: in its place, and two phones at once make one day', async () => {
  const trip = await newDay('days-back');
  await updateDoc(doc(B.db, 'trips', trip, 'days', 'd1'), { date: '2026-11-25', order: 2, title: 'יום 2' });
  const days = [{ id: 'd1', date: '2026-11-25', order: 2 }];
  const made = placeDays(days, ['2026-11-24']).map(d => ({ ...d, id: `day-${d.date}` }));
  await whileOffline(
    () => restoreDays(A.db, trip, made, { plannerDaysFromFlight: { out: '2026-11-24', ret: '2026-11-25' } }),
    async () => {
      await restoreDays(B.db, trip, made);
      await addActivities(B.db, trip, 'day-2026-11-24', [], [beach]);
    },
  );
  const back = (await getDoc(doc(B.db, 'trips', trip, 'days', 'day-2026-11-24'))).data();
  assert.deepEqual([back.date, back.order, back.title], ['2026-11-24', 1, 'יום 1']);
  // A's late write did not erase what B added to it.
  assert.deepEqual(dayActivities(back.activities).map(a => a.title), ['חוף']);
  assert.equal((await getDoc(doc(B.db, 'trips', trip))).data().plannerDaysFromFlight.out, '2026-11-24');
  assert.equal(dayActivities((await getDoc(doc(B.db, 'trips', trip, 'days', 'd1'))).data().activities).length, 3);
});
