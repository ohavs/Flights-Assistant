// Security-rules tests: who may read and change trips and profiles.
// Run against the Firebase emulators with the repo's firestore.rules:
//   npm run test:data
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, updateDoc, deleteDoc, deleteField, arrayRemove, onSnapshot,
} from 'firebase/firestore';

const apps = [];

// A signed-in client, as a separate app instance (like a separate device)
async function client(email) {
  const app = initializeApp({ projectId: 'demo-flights', apiKey: 'demo-key' }, `client-${apps.length}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const cred = GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true }));
  const { user } = await signInWithCredential(auth, cred);
  return { db, uid: user.uid };
}

const owner = await client('owner@example.com');
const editor = await client('editor@example.com');
const viewer = await client('viewer@example.com');
const stranger = await client('stranger@example.com');

after(() => Promise.all(apps.map(app => deleteApp(app))));

const denied = { code: 'permission-denied' };
let tripCount = 0;

// A trip shaped like the app creates it, with an editor and a viewer
async function createTrip() {
  const tripId = `trip_test_${Date.now()}_${tripCount++}`;
  await setDoc(doc(owner.db, 'trips', tripId), {
    name: 'Trip', destination: 'Rome', dates: '',
    members: { [owner.uid]: 'owner', [editor.uid]: 'editor', [viewer.uid]: 'viewer' },
    memberIds: [owner.uid, editor.uid, viewer.uid],
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  return tripId;
}
const trip = (who, tripId) => doc(who.db, 'trips', tripId);
const place = (who, tripId, id = 'plan-1') => doc(who.db, 'trips', tripId, 'planning', id);

test('creating a trip requires listing yourself as owner in members and memberIds', async () => {
  await assert.rejects(
    setDoc(doc(stranger.db, 'trips', 'trip_no_owner'), { name: 'x', members: { [stranger.uid]: 'editor' }, memberIds: [stranger.uid] }),
    denied
  );
  await assert.rejects(
    setDoc(doc(stranger.db, 'trips', 'trip_no_ids'), { name: 'x', members: { [stranger.uid]: 'owner' }, memberIds: [] }),
    denied
  );
});

test('a non-member can neither read nor change a trip or its contents', async () => {
  const tripId = await createTrip();
  await setDoc(place(owner, tripId), { title: 'Place' });
  await assert.rejects(getDoc(trip(stranger, tripId)), denied);
  await assert.rejects(updateDoc(trip(stranger, tripId), { name: 'Hacked' }), denied);
  await assert.rejects(getDoc(place(stranger, tripId)), denied);
  await assert.rejects(setDoc(place(stranger, tripId, 'plan-2'), { title: 'x' }), denied);
});

test('a viewer can read but not change anything', async () => {
  const tripId = await createTrip();
  await setDoc(place(owner, tripId), { title: 'Place' });
  assert.equal((await getDoc(trip(viewer, tripId))).data().name, 'Trip');
  assert.equal((await getDoc(place(viewer, tripId))).data().title, 'Place');
  await assert.rejects(updateDoc(trip(viewer, tripId), { name: 'Changed' }), denied);
  await assert.rejects(updateDoc(place(viewer, tripId), { title: 'Changed' }), denied);
});

test('an editor can change content but not membership', async () => {
  const tripId = await createTrip();
  await updateDoc(trip(editor, tripId), { name: 'Edited', 'hotelDetails.name': 'Hotel' });
  await setDoc(place(editor, tripId), { title: 'Place' });
  await assert.rejects(updateDoc(trip(editor, tripId), { [`members.${stranger.uid}`]: 'editor' }), denied);
  await assert.rejects(updateDoc(trip(editor, tripId), { [`members.${viewer.uid}`]: 'editor' }), denied);
  await assert.rejects(deleteDoc(trip(editor, tripId)), denied);
  assert.equal((await getDoc(trip(owner, tripId))).data().name, 'Edited');
});

test('the owner can change roles and delete the trip', async () => {
  const tripId = await createTrip();
  await updateDoc(trip(owner, tripId), { [`members.${viewer.uid}`]: 'editor' });
  assert.equal((await getDoc(trip(owner, tripId))).data().members[viewer.uid], 'editor');
  await deleteDoc(trip(owner, tripId));
});

test('any member can leave the trip, and then loses access', async () => {
  const tripId = await createTrip();
  await updateDoc(trip(viewer, tripId), {
    [`members.${viewer.uid}`]: deleteField(),
    memberIds: arrayRemove(viewer.uid),
  });
  await assert.rejects(getDoc(trip(viewer, tripId)), denied);
  assert.deepEqual((await getDoc(trip(owner, tripId))).data().memberIds, [owner.uid, editor.uid]);
});

test('profiles: readable by signed-in users, writable only by their owner', async () => {
  await setDoc(doc(owner.db, 'users', owner.uid), { email: 'owner@example.com', tripIds: [] }, { merge: true });
  assert.equal((await getDoc(doc(stranger.db, 'users', owner.uid))).data().email, 'owner@example.com');
  await assert.rejects(updateDoc(doc(stranger.db, 'users', owner.uid), { tripIds: ['x'] }), denied);
});

test('reading a trip that does not exist yet, or any more, returns "does not exist"', async () => {
  assert.equal((await getDoc(doc(owner.db, 'trips', 'trip_never_created'))).exists(), false);
  // Harmless for outsiders too: a missing document has nothing to reveal
  assert.equal((await getDoc(doc(stranger.db, 'trips', 'trip_never_created'))).exists(), false);

  const tripId = await createTrip();
  await deleteDoc(trip(owner, tripId));
  assert.equal((await getDoc(trip(owner, tripId))).exists(), false);
  assert.equal((await getDoc(trip(editor, tripId))).exists(), false);
});

test('a trip opened before the server has it arrives once it is created (no permission error)', async () => {
  // The same user on a second device creates the trip after this listener started
  const ownerOtherDevice = await client('owner@example.com');
  const tripId = `trip_race_${Date.now()}`;
  const seen = [];
  await new Promise((resolve, reject) => {
    const unsub = onSnapshot(trip(owner, tripId), (snap) => {
      seen.push(snap.exists());
      if (snap.exists()) { unsub(); resolve(); }
    }, reject);
    setTimeout(() => setDoc(trip(ownerOtherDevice, tripId), {
      name: 'Trip', members: { [owner.uid]: 'owner' }, memberIds: [owner.uid],
    }).catch(reject), 300);
  });
  assert.deepEqual(seen, [false, true]);
});
