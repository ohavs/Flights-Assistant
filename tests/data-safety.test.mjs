// Data-safety tests. Run against the Firebase emulators with the repo's
// firestore.rules:  npm run test:data
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { saveFlightAndHotelDetails, updateFlightDate } from '../src/data/trips.js';

const apps = [];
let appCount = 0;

// A signed-in client, as a separate app instance (like a separate device)
async function client(email) {
  const app = initializeApp({ projectId: 'demo-flights', apiKey: 'demo-key' }, `client-${appCount++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const cred = GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true }));
  const { user } = await signInWithCredential(auth, cred);
  return { db, uid: user.uid };
}

const flight = (flightNumber) => ({
  flightNumber,
  airline: 'אל על',
  depAirport: { code: 'TLV', city: 'תל אביב', name: 'Ben Gurion', lat: 32, lng: 34, timezone: 'UTC +03:00' },
  arrAirport: { code: 'PRG', city: 'פראג', name: 'Havel', lat: 50, lng: 14, timezone: 'UTC +02:00' },
  date: '2026-11-01'
});

async function createSharedTrip(owner, member) {
  const tripId = `trip_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await setDoc(doc(owner.db, 'trips', tripId), {
    name: 'Trip name',
    destination: 'Prague',
    dates: '',
    members: { [owner.uid]: 'owner', [member.uid]: 'member' },
    createdAt: '2026-01-01T00:00:00.000Z',
    outboundFlightDetails: flight('LY1'),
    returnFlightDetails: flight('LY2'),
    hotelDetails: { name: 'Hotel' }
  });
  return tripId;
}

const owner = await client('owner@example.com');
const member = await client('member@example.com');
const stranger = await client('stranger@example.com');

after(() => Promise.all(apps.map(app => deleteApp(app))));

test('saving the flight & hotel form keeps the rest of the trip', async () => {
  const tripId = await createSharedTrip(owner, member);

  await saveFlightAndHotelDetails(owner.db, tripId, {
    outboundFlightDetails: flight('LY9'),
    returnFlightDetails: flight('LY8'),
    hotelDetails: { name: 'New hotel' }
  });

  // Both members can still open the trip
  const asOwner = (await getDoc(doc(owner.db, 'trips', tripId))).data();
  const asMember = (await getDoc(doc(member.db, 'trips', tripId))).data();
  assert.deepEqual(asOwner, asMember);

  assert.equal(asOwner.name, 'Trip name');
  assert.equal(asOwner.destination, 'Prague');
  assert.equal(asOwner.createdAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(asOwner.members, { [owner.uid]: 'owner', [member.uid]: 'member' });
  assert.equal(asOwner.outboundFlightDetails.flightNumber, 'LY9');
  assert.equal(asOwner.returnFlightDetails.flightNumber, 'LY8');
  assert.equal(asOwner.hotelDetails.name, 'New hotel');
});

test('changing a flight date does not undo a concurrent change by another member', async () => {
  const tripId = await createSharedTrip(owner, member);

  // The owner renames the trip while the member's screen still shows the old data
  await updateDoc(doc(owner.db, 'trips', tripId), { name: 'Renamed' });
  await updateFlightDate(member.db, tripId, 'outbound', '2026-12-24');

  const trip = (await getDoc(doc(owner.db, 'trips', tripId))).data();
  assert.equal(trip.name, 'Renamed');
  assert.equal(trip.outboundFlightDetails.date, '2026-12-24');
  assert.deepEqual(trip.outboundFlightDetails, { ...flight('LY1'), date: '2026-12-24' });
  assert.equal(trip.returnFlightDetails.date, '2026-11-01');
});

test('changing the return flight date only touches the return flight', async () => {
  const tripId = await createSharedTrip(owner, member);
  await updateFlightDate(owner.db, tripId, 'return', '2026-11-09');

  const trip = (await getDoc(doc(owner.db, 'trips', tripId))).data();
  assert.equal(trip.returnFlightDetails.date, '2026-11-09');
  assert.equal(trip.outboundFlightDetails.date, '2026-11-01');
});

test('rules: a non-member cannot read or change a trip', async () => {
  const tripId = await createSharedTrip(owner, member);

  await assert.rejects(getDoc(doc(stranger.db, 'trips', tripId)), { code: 'permission-denied' });
  await assert.rejects(
    saveFlightAndHotelDetails(stranger.db, tripId, { outboundFlightDetails: {}, returnFlightDetails: {}, hotelDetails: {} }),
    { code: 'permission-denied' }
  );
});

test('rules: users cannot read or write another user profile', async () => {
  await setDoc(doc(owner.db, 'users', owner.uid), { email: 'owner@example.com', tripIds: [] }, { merge: true });

  await assert.rejects(getDoc(doc(stranger.db, 'users', owner.uid)), { code: 'permission-denied' });
  await assert.rejects(updateDoc(doc(stranger.db, 'users', owner.uid), { tripIds: [] }), { code: 'permission-denied' });
});

test.todo('sharing a trip with another user (blocked by firestore.rules — see CLAUDE.md "Known issues")');
