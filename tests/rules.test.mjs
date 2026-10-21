// Security-rules tests: who may read and change trips and profiles.
// Run against the Firebase emulators with the repo's firestore.rules:
//   npm run test:data
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, updateDoc, deleteDoc, deleteField, arrayRemove, arrayUnion,
  onSnapshot, writeBatch,
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
const adder = await client('adder@example.com');

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

test('a delete in 24 hours: only the owner sets or cancels deleteAt', async () => {
  const tripId = await createTrip();
  const at = Date.now() + 24 * 3600 * 1000;
  await assert.rejects(updateDoc(trip(editor, tripId), { deleteAt: at }), denied);
  await assert.rejects(updateDoc(trip(viewer, tripId), { deleteAt: at }), denied);
  await updateDoc(trip(owner, tripId), { deleteAt: at });
  // Pending, the trip is still a trip: an editor edits it, but cannot
  // move or cancel the delete.
  await updateDoc(trip(editor, tripId), { name: 'Still editable' });
  await assert.rejects(updateDoc(trip(editor, tripId), { deleteAt: deleteField() }), denied);
  await assert.rejects(updateDoc(trip(editor, tripId), { deleteAt: at + 1000 }), denied);
  // Leaving is not a way to touch it either.
  await assert.rejects(updateDoc(trip(viewer, tripId), {
    [`members.${viewer.uid}`]: deleteField(), memberIds: arrayRemove(viewer.uid), deleteAt: deleteField(),
  }), denied);
  await updateDoc(trip(owner, tripId), { deleteAt: deleteField() });
  assert.equal((await getDoc(trip(owner, tripId))).data().deleteAt, undefined);
});

test("the delete code's hash: the user's alone, not even readable by others", async () => {
  const code = (who, uid = who.uid) => doc(who.db, 'users', uid, 'private', 'deleteCode');
  await setDoc(code(owner), { hash: 'abc', updatedAt: 1 });
  assert.equal((await getDoc(code(owner))).data().hash, 'abc');
  await assert.rejects(getDoc(code(stranger, owner.uid)), denied);
  await assert.rejects(setDoc(code(stranger, owner.uid), { hash: 'x' }), denied);
  await assert.rejects(deleteDoc(code(stranger, owner.uid)), denied);
});

test("a phone's push token: the user's alone; the server's push records are no one's", async () => {
  const device = (who, uid = who.uid) => doc(who.db, 'users', uid, 'devices', 'android-1');
  await setDoc(device(owner), { token: 't1', platform: 'android', updatedAt: '2026-10-16T12:00:00Z' });
  assert.equal((await getDoc(device(owner))).data().token, 't1');
  await assert.rejects(getDoc(device(editor, owner.uid)), denied);
  await assert.rejects(setDoc(device(stranger, owner.uid), { token: 'mine now' }), denied);
  await assert.rejects(deleteDoc(device(stranger, owner.uid)), denied);
  await deleteDoc(device(owner));
  for (const path of ['pushDigests/t_a_expense', 'pushOutbox/x']) {
    await assert.rejects(getDoc(doc(owner.db, path)), denied);
    await assert.rejects(setDoc(doc(owner.db, path), { count: 99 }), denied);
  }
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

/* ── "הוספה" (contributor, 8.70.0) ─────────────────────────────────── */

// A trip with a contributor besides the owner and the editor.
async function createTripWithAdder() {
  const tripId = `trip_adder_${Date.now()}_${tripCount++}`;
  await setDoc(doc(owner.db, 'trips', tripId), {
    name: 'Trip', members: { [owner.uid]: 'owner', [editor.uid]: 'editor', [adder.uid]: 'contributor' },
    memberIds: [owner.uid, editor.uid, adder.uid],
  });
  return tripId;
}
const item = (who, tripId, coll, id) => doc(who.db, 'trips', tripId, coll, id);

test('a contributor adds in every list, as themselves', async () => {
  const tripId = await createTripWithAdder();
  for (const coll of ['planning', 'checklist', 'reminders', 'info', 'expenses', 'bookings']) {
    await setDoc(item(adder, tripId, coll, 'mine'), { title: 'x', createdBy: adder.uid });
    // Not without saying so, and not in someone else's name.
    await assert.rejects(setDoc(item(adder, tripId, coll, 'anon'), { title: 'x' }), denied);
    await assert.rejects(setDoc(item(adder, tripId, coll, 'forged'), { title: 'x', createdBy: owner.uid }), denied);
  }
  // Not the trip's settings, nor a day, nor the trip itself.
  await assert.rejects(setDoc(item(adder, tripId, 'settings', 'categories'), { x: { color: '#000' }, createdBy: adder.uid }), denied);
  await assert.rejects(setDoc(item(adder, tripId, 'days', 'd1'), { title: 'Day', createdBy: adder.uid }), denied);
  await assert.rejects(updateDoc(trip(adder, tripId), { name: 'Mine' }), denied);
});

test('a contributor changes and deletes only what they added', async () => {
  const tripId = await createTripWithAdder();
  await setDoc(item(adder, tripId, 'planning', 'mine'), { title: 'Mine', createdBy: adder.uid });
  await setDoc(item(owner, tripId, 'planning', 'theirs'), { title: 'Theirs', createdBy: owner.uid });
  await setDoc(item(owner, tripId, 'planning', 'old'), { title: 'Old', addedBy: owner.uid });
  await updateDoc(item(adder, tripId, 'planning', 'mine'), { title: 'Mine, edited' });
  await assert.rejects(updateDoc(item(adder, tripId, 'planning', 'theirs'), { title: 'Hacked' }), denied);
  await assert.rejects(updateDoc(item(adder, tripId, 'planning', 'old'), { title: 'Hacked' }), denied);
  // Nor passes their own to someone else.
  await assert.rejects(updateDoc(item(adder, tripId, 'planning', 'mine'), { createdBy: owner.uid }), denied);
  await assert.rejects(deleteDoc(item(adder, tripId, 'planning', 'theirs')), denied);
  await deleteDoc(item(adder, tripId, 'planning', 'mine'));
  // A place added before createdBy, by them (addedBy), is theirs too.
  await setDoc(item(owner, tripId, 'planning', 'byAdder'), { title: 'x', addedBy: adder.uid });
  await updateDoc(item(adder, tripId, 'planning', 'byAdder'), { title: 'y' });
  // The editor still changes anything.
  await setDoc(item(adder, tripId, 'expenses', 'e1'), { amount: 5, createdBy: adder.uid });
  await updateDoc(item(editor, tripId, 'expenses', 'e1'), { amount: 6 });
  await deleteDoc(item(editor, tripId, 'expenses', 'e1'));
});

test('a contributor ticks anyone\'s item, and nothing else on it', async () => {
  const tripId = await createTripWithAdder();
  await setDoc(item(owner, tripId, 'planning', 'p'), { title: 'P', visited: false, createdBy: owner.uid });
  await setDoc(item(owner, tripId, 'checklist', 'c'), { text: 'C', completed: false, createdBy: owner.uid });
  await setDoc(item(owner, tripId, 'reminders', 'r'), { text: 'R', completed: false, createdBy: owner.uid, addedByUid: adder.uid });
  await updateDoc(item(adder, tripId, 'planning', 'p'), { visited: true });
  await updateDoc(item(adder, tripId, 'planning', 'p'), { 'distances.hotel': { walk: 1 }, coords: { lat: 1, lng: 2 } });
  await updateDoc(item(adder, tripId, 'checklist', 'c'), { completed: true });
  await updateDoc(item(adder, tripId, 'reminders', 'r'), { completed: true });
  await assert.rejects(updateDoc(item(adder, tripId, 'planning', 'p'), { visited: false, title: 'x' }), denied);
  await assert.rejects(updateDoc(item(adder, tripId, 'checklist', 'c'), { text: 'x' }), denied);
  // A reminder for them, written by someone else, is still not theirs to edit.
  await assert.rejects(updateDoc(item(adder, tripId, 'reminders', 'r'), { text: 'x' }), denied);
  await assert.rejects(deleteDoc(item(adder, tripId, 'reminders', 'r')), denied);
});

test('a day: a contributor adds activities, and changes only their own', async () => {
  const tripId = await createTripWithAdder();
  const theirs = { id: 'a1', title: 'Museum', order: 1, createdBy: owner.uid };
  await setDoc(item(owner, tripId, 'days', 'd1'), { title: 'Day 1', activities: [theirs] });
  const day = item(adder, tripId, 'days', 'd1');
  const mine = { id: 'a2', title: 'Coffee', order: 2, createdBy: adder.uid };
  await updateDoc(day, { activities: arrayUnion(mine) });
  // An edit of their own: out with the old copy, in with the new, in one batch.
  const edited = { ...mine, title: 'Coffee & cake' };
  const b = writeBatch(adder.db);
  b.update(day, { activities: arrayRemove(mine) });
  b.update(day, { activities: arrayUnion(edited) });
  await b.commit();
  await assert.rejects(updateDoc(day, { activities: arrayRemove(theirs) }), denied);
  await assert.rejects(updateDoc(day, { activities: arrayUnion({ id: 'a3', title: 'x' }) }), denied);
  await assert.rejects(updateDoc(day, { activities: arrayUnion({ id: 'a3', title: 'x', createdBy: owner.uid }) }), denied);
  await assert.rejects(updateDoc(day, { title: 'Renamed' }), denied);
  await assert.rejects(deleteDoc(day), denied);
  await updateDoc(day, { activities: arrayRemove(edited) });
  assert.deepEqual((await getDoc(item(owner, tripId, 'days', 'd1'))).data().activities, [theirs]);
});

test('a viewer still adds nothing', async () => {
  const tripId = await createTrip();
  await assert.rejects(setDoc(item(viewer, tripId, 'planning', 'v'), { title: 'x', createdBy: viewer.uid }), denied);
  await setDoc(item(owner, tripId, 'checklist', 'c'), { text: 'C', completed: false });
  await assert.rejects(updateDoc(item(viewer, tripId, 'checklist', 'c'), { completed: true }), denied);
});
