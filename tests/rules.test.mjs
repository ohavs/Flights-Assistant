// Security-rules tests: who may read and change trips and profiles.
// Run against the Firebase emulators with the repo's firestore.rules:
//   npm run test:data
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, updateDoc, deleteDoc, deleteField, arrayRemove, arrayUnion,
  onSnapshot, writeBatch, collection, query, where, getDocs,
} from 'firebase/firestore';
import { updateActivities } from '../src/lib/dayActivities.js';

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
  for (const coll of ['planning', 'checklist', 'reminders', 'info', 'expenses', 'bookings', 'payments']) {
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

test('a place keeps where it is (coords with fp/src) whoever of the trip can save', async () => {
  const tripId = await createTripWithAdder();
  await setDoc(item(owner, tripId, 'planning', 'p'), { title: 'P', createdBy: owner.uid });
  const at = { lat: 47.5, lng: 19.04, fp: 'abc', src: 'title', name: 'X', addr: 'Y' };
  await updateDoc(item(adder, tripId, 'planning', 'p'), { coords: at });
  await updateDoc(item(adder, tripId, 'planning', 'p'), {
    'distances.hotel': { walk: { seconds: 60 }, toAt: '47.500000,19.040000', originFp: 'h' },
  });
  await assert.rejects(updateDoc(item(adder, tripId, 'planning', 'p'), { coords: at, address: 'Z' }), denied);
});

test('a leg between two stops: any member who can save writes it, in its shape', async () => {
  const tripId = await createTripWithAdder();
  const leg = { walk: { seconds: 600 }, transit: null, originKind: 'hotel', from: '1.0,2.0', to: 'Some St 5', fetchedAt: 1 };
  await setDoc(item(adder, tripId, 'legs', 'l1'), leg);
  await setDoc(item(adder, tripId, 'legs', 'l1'), { ...leg, fetchedAt: 2 });
  assert.equal((await getDoc(item(editor, tripId, 'legs', 'l1'))).data().to, 'Some St 5');
  await assert.rejects(setDoc(item(adder, tripId, 'legs', 'l2'), { ...leg, title: 'x' }), denied);
  await assert.rejects(setDoc(item(adder, tripId, 'legs', 'l3'), { ...leg, from: 5 }), denied);
  await setDoc(item(editor, tripId, 'legs', 'l4'), leg);
  const viewed = await createTrip();
  await setDoc(item(owner, viewed, 'legs', 'l1'), leg);
  assert.equal((await getDoc(item(viewer, viewed, 'legs', 'l1'))).data().from, '1.0,2.0');
  await assert.rejects(setDoc(item(viewer, viewed, 'legs', 'l2'), leg), denied);
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

test('a day: a contributor moves the times of many of their own at once (8.95.0)', async () => {
  const tripId = await createTripWithAdder();
  const acts = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, title: `S${i}`, order: i + 1, timeLabel: `1${i}:00`, createdBy: adder.uid }));
  const theirs = { id: 'o1', title: 'Theirs', order: 9, timeLabel: '18:00', createdBy: owner.uid };
  await setDoc(item(owner, tripId, 'days', 'd1'), { title: 'Day 1', activities: [...acts, theirs] });
  await updateActivities(adder.db, tripId, 'd1', [...acts, theirs], acts.map(a => ({ ...a, timeLabel: `1${a.id[1]}:30` })), true);
  const after = (await getDoc(item(owner, tripId, 'days', 'd1'))).data().activities;
  assert.deepEqual(after.filter(a => a.createdBy === adder.uid).map(a => a.timeLabel).sort(), ['10:30', '11:30', '12:30', '13:30', '14:30', '15:30']);
  assert.deepEqual(after.find(a => a.id === 'o1'), theirs);
});

test('a personal plan is its member\'s alone, whatever the role', async () => {
  const tripId = await createTrip();
  const mine = (who, uid = who.uid) => doc(who.db, 'trips', tripId, 'personal', uid, 'days', '2026-11-10');
  // A viewer plans for themselves too.
  await setDoc(mine(viewer), { activities: [{ id: 'p1', title: 'ריצה', createdBy: viewer.uid }] }, { merge: true });
  assert.equal((await getDoc(mine(viewer))).data().activities.length, 1);
  // No one else reads or writes it: not the owner, not an editor, not a stranger.
  await assert.rejects(getDoc(mine(owner, viewer.uid)), denied);
  await assert.rejects(getDoc(mine(editor, viewer.uid)), denied);
  await assert.rejects(setDoc(mine(owner, viewer.uid), { activities: [] }), denied);
  await assert.rejects(getDoc(mine(stranger, viewer.uid)), denied);
  // Not on the trip: not even a plan of one's own.
  await assert.rejects(setDoc(mine(stranger), { activities: [] }), denied);
});

test('a viewer still adds nothing', async () => {
  const tripId = await createTrip();
  await assert.rejects(setDoc(item(viewer, tripId, 'planning', 'v'), { title: 'x', createdBy: viewer.uid }), denied);
  await setDoc(item(owner, tripId, 'checklist', 'c'), { text: 'C', completed: false });
  await assert.rejects(updateDoc(item(viewer, tripId, 'checklist', 'c'), { completed: true }), denied);
});

/* ── "בינינו": whose a payment is (8.80.0) ─────────────────────────── */

test('a payment: the two in it and whoever wrote it see it, and the owner all; no one else', async () => {
  const tripId = `trip_pay_${Date.now()}_${tripCount++}`;
  await setDoc(doc(owner.db, 'trips', tripId), {
    name: 'Trip',
    members: { [owner.uid]: 'owner', [editor.uid]: 'editor', [adder.uid]: 'contributor', [viewer.uid]: 'viewer' },
    memberIds: [owner.uid, editor.uid, adder.uid, viewer.uid],
  });
  const pay = (who, id) => item(who, tripId, 'payments', id);
  const payments = (who) => collection(who.db, 'trips', tripId, 'payments');
  const ids = async (q) => (await getDocs(q)).docs.map(d => d.id).sort();
  const p = (from, to, createdBy) => ({ kind: 'for', from, to, amount: 10, currency: 'ILS', note: null, settled: false, createdBy });
  await setDoc(pay(editor, 'p1'), p(editor.uid, adder.uid, editor.uid));
  await setDoc(pay(owner, 'p2'), p(owner.uid, 'name:רוני', owner.uid));
  // Written down by the editor, between two others: the editor sees it.
  await setDoc(pay(editor, 'p3'), p(owner.uid, adder.uid, editor.uid));

  // The owner: all of them, the whole collection at once.
  assert.deepEqual(await ids(payments(owner)), ['p1', 'p2', 'p3']);
  // Anyone else: not the whole collection, only theirs, field by field.
  for (const who of [editor, adder, viewer]) await assert.rejects(getDocs(payments(who)), denied);
  assert.deepEqual(await ids(query(payments(editor), where('createdBy', '==', editor.uid))), ['p1', 'p3']);
  assert.deepEqual(await ids(query(payments(editor), where('from', '==', editor.uid))), ['p1']);
  assert.deepEqual(await ids(query(payments(adder), where('to', '==', adder.uid))), ['p1', 'p3']);
  assert.deepEqual(await ids(query(payments(viewer), where('to', '==', viewer.uid))), []);
  // Not someone else's by another field, nor one by one.
  await assert.rejects(getDocs(query(payments(viewer), where('from', '==', editor.uid))), denied);
  await assert.rejects(getDoc(pay(viewer, 'p1')), denied);
  await assert.rejects(getDoc(pay(editor, 'p2')), denied);
  assert.equal((await getDoc(pay(adder, 'p1'))).exists(), true);

  // An editor changes only what they can see, and cannot write themselves
  // out of it, nor in.
  await updateDoc(pay(editor, 'p1'), { settled: true });
  await assert.rejects(updateDoc(pay(editor, 'p2'), { settled: true }), denied);
  await assert.rejects(deleteDoc(pay(editor, 'p2')), denied);
  await assert.rejects(updateDoc(pay(editor, 'p1'), { from: owner.uid, createdBy: owner.uid }), denied);
  await assert.rejects(updateDoc(pay(editor, 'p2'), { createdBy: editor.uid }), denied);
  // Not one in others' names only.
  await assert.rejects(setDoc(pay(editor, 'p4'), p(owner.uid, adder.uid, owner.uid)), denied);
  // The owner changes any.
  await updateDoc(pay(owner, 'p1'), { settled: false });
  await deleteDoc(pay(owner, 'p3'));

  // The rest of the trip reads as before, a missing doc too.
  assert.equal((await getDoc(item(viewer, tripId, 'settings', 'nothing'))).exists(), false);
  await setDoc(item(owner, tripId, 'expenses', 'e1'), { amount: 5, createdBy: owner.uid });
  assert.deepEqual(await ids(collection(viewer.db, 'trips', tripId, 'expenses')), ['e1']);
});
