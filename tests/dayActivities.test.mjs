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
  dayActivities, addActivities, updateActivity, removeActivity, swapActivities,
} from '../src/lib/dayActivities.js';

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

test('move: swaps two activities and keeps the other phone\'s change', async () => {
  const trip = await newDay('days-move');
  const seen = await raw(A.db, trip);
  await whileOffline(() => swapActivities(A.db, trip, 'd1', seen, breakfast.id, museum.id), () => bAddsBeach(trip));
  assert.deepEqual(await titles(trip), ['מוזיאון', 'ארוחת בוקר', 'צהריים', 'חוף']);
  // Moving again from a fresh view, down past the last one.
  await swapActivities(A.db, trip, 'd1', await raw(A.db, trip), lunch.id, beach.id);
  assert.deepEqual(await titles(trip), ['מוזיאון', 'ארוחת בוקר', 'חוף', 'צהריים']);
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
