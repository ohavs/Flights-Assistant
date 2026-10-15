// A trip opened before the server has it: a plain listener on its
// sub-collection is refused for good; listen() tries again and gets the
// data once the trip is there.   npm run test:data
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import { listen } from '../src/lib/listen.js';

const app = initializeApp({ projectId: 'demo-flights', apiKey: 'demo-key' }, 'listen-test');
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
const { user } = await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: 'racer@example.com', email: 'racer@example.com', email_verified: true })));
const uid = user.uid;
after(() => deleteApp(app));

const newTrip = (id) => setDoc(doc(db, 'trips', id), {
  name: 'Race', destination: '', dates: '',
  members: { [uid]: 'owner' }, memberIds: [uid], createdAt: new Date().toISOString(),
});
const wait = (ms) => new Promise(r => setTimeout(r, ms));

test('a plain listener on a trip the server does not have yet is refused', async () => {
  const id = `race-plain-${Date.now()}`;
  const err = await new Promise((resolve) => {
    const off = onSnapshot(collection(db, 'trips', id, 'planning'), () => {}, (e) => { off(); resolve(e); });
  });
  assert.equal(err.code, 'permission-denied');
});

test('listen() tries again and gets the data once the trip exists', async () => {
  const id = `race-listen-${Date.now()}`;
  const seen = [];
  let failed = null;
  const off = listen(collection(db, 'trips', id, 'planning'),
    (snap) => seen.push(snap.docs.map(d => d.id)), (e) => { failed = e; }, { delay: 150 });
  await wait(250);                      // refused at least once by now
  await newTrip(id);
  await setDoc(doc(db, 'trips', id, 'planning', 'p1'), { title: 'Louvre' });
  for (let i = 0; i < 40 && !seen.some(ids => ids.includes('p1')); i++) await wait(100);
  off();
  assert.equal(failed, null);
  assert.ok(seen.some(ids => ids.includes('p1')), `never saw the place: ${JSON.stringify(seen)}`);
});
