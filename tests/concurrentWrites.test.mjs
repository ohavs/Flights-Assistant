// Two phones on one trip. Phone A is offline (abroad, no data) and makes a
// change; meanwhile phone B, online, makes another. When A reconnects, both
// changes must be on the server: A's queued write may not carry its stale
// view of the document over B's change.   npm run test:data
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc,
  disableNetwork, enableNetwork, waitForPendingWrites,
} from 'firebase/firestore';
import { addCategory, saveCategory, removeCategory } from '../src/lib/categorySettings.js';

const phone = async (name) => {
  const app = initializeApp({ projectId: 'demo-flights', apiKey: 'demo-key' }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const cred = GoogleAuthProvider.credential(JSON.stringify({ sub: 'pair@example.com', email: 'pair@example.com', email_verified: true }));
  const { user } = await signInWithCredential(auth, cred);
  return { app, db, uid: user.uid };
};
const A = await phone('phone-a');
const B = await phone('phone-b');
after(() => Promise.all([deleteApp(A.app), deleteApp(B.app)]));

const newTrip = async (label) => {
  const id = `${label}-${Date.now()}`;
  await setDoc(doc(B.db, 'trips', id), {
    name: label, destination: '', dates: '',
    members: { [B.uid]: 'owner' }, memberIds: [B.uid], createdAt: new Date().toISOString(),
  });
  return id;
};

// A goes offline, runs its change, B runs its change, A comes back.
const whileOffline = async (onA, onB) => {
  await disableNetwork(A.db);
  const queued = onA();                  // resolves only once the server has it
  await onB();
  await enableNetwork(A.db);
  await queued;
  await waitForPendingWrites(A.db);
};

const serverData = async (...path) => (await getDoc(doc(B.db, ...path))).data();

test('categories: a whole-map write from a stale view erases the other phone\'s category', async () => {
  const trip = await newTrip('cat-old');
  const seenByA = { 'מסעדות': { color: '#f00' } };
  await setDoc(doc(B.db, 'trips', trip, 'settings', 'categories'), seenByA);
  await whileOffline(
    () => setDoc(doc(A.db, 'trips', trip, 'settings', 'categories'), { ...seenByA, 'חופים': {} }),
    () => saveCategory(B.db, trip, 'מוזיאונים', { color: '#00f' }),
  );
  const data = await serverData('trips', trip, 'settings', 'categories');
  assert.equal(data['מוזיאונים'], undefined, 'the risk this file guards against no longer reproduces');
});

test('categories: adding, styling and removing one category leaves the others alone', async () => {
  const trip = await newTrip('cat-new');
  await setDoc(doc(B.db, 'trips', trip, 'settings', 'categories'), {
    'מסעדות': { color: '#f00', iconKey: 'utensils' },
    'קניות': { color: '#0f0' },
  });
  await whileOffline(
    async () => {
      await Promise.all([
        addCategory(A.db, trip, 'חופים'),
        saveCategory(A.db, trip, 'מסעדות', { iconKey: 'coffee' }),
        removeCategory(A.db, trip, 'קניות'),
      ]);
    },
    () => saveCategory(B.db, trip, 'מוזיאונים', { color: '#00f' }),
  );
  const data = await serverData('trips', trip, 'settings', 'categories');
  assert.deepEqual(data, {
    'מסעדות': { color: '#f00', iconKey: 'coffee' },
    'חופים': { added: data['חופים']?.added },
    'מוזיאונים': { color: '#00f' },
  });
});

test('categories: adding a name that already exists keeps its colour and icon', async () => {
  const trip = await newTrip('cat-again');
  await saveCategory(B.db, trip, 'מסעדות', { color: '#f00', iconKey: 'utensils' });
  await addCategory(A.db, trip, 'מסעדות');
  const data = await serverData('trips', trip, 'settings', 'categories');
  assert.equal(data['מסעדות'].color, '#f00');
  assert.equal(data['מסעדות'].iconKey, 'utensils');
});
