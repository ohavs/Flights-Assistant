import { db, auth } from '../firebase';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import { readAll } from '../lib/readFresh';
import { paymentQueries, mergeById } from '../lib/paymentsQuery';
import { saveFile } from '../lib/saveFile';

const SUBCOLS = ['planning', 'days', 'checklist', 'info', 'bookings', 'reminders', 'expenses', 'payments', 'settings'];

// `fromPhone`: made offline, from the phone's copy (src/lib/readFresh.js).
export async function exportTripBackup(tripId, tripDoc) {
  const subcollections = {};
  const mark = {};
  const uid = auth.currentUser?.uid;
  for (const name of SUBCOLS) {
    try {
      // Payments between two people: only mine, unless I own the trip (8.80.0).
      const refs = name === 'payments'
        ? paymentQueries(db, tripId, uid, tripDoc?.members?.[uid] === 'owner')
        : [collection(db, 'trips', tripId, name)];
      const snaps = await Promise.all(refs.map(ref => readAll(ref, mark)));
      subcollections[name] = mergeById(snaps.map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    } catch {
      subcollections[name] = [];
      mark.fromPhone = true;
    }
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    trip: { ...tripDoc },
    subcollections,
    ...(mark.fromPhone ? { fromPhone: true } : {}),
  };
}

export async function saveBackupFile(backup, tripName) {
  const json = JSON.stringify(backup, null, 2);
  const date = new Date().toISOString().split('T')[0];
  const safe = (tripName || 'טיול').replace(/[^א-תa-zA-Z0-9 ]/g, '').trim();
  await saveFile(new Blob([json], { type: 'application/json' }), `גיבוי_${safe}_${date}.json`);
}

export async function importTripBackup(backup, userId) {
  if (!backup?.trip || !backup?.subcollections) throw new Error('קובץ גיבוי לא תקין');
  if (backup.version !== 1) throw new Error('גרסת קובץ לא נתמכת');

  const newTripRef = doc(collection(db, 'trips'));
  const newTripId = newTripRef.id;

  const tripData = {
    ...backup.trip,
    name: `${backup.trip.name || 'טיול'} (יובא)`,
    members: { ...backup.trip.members, [userId]: 'owner' },
    memberIds: [...new Set([...(backup.trip.memberIds || []), userId])],
    importedAt: new Date().toISOString(),
  };
  delete tripData.id;
  delete tripData.deleteAt;   // a copy of a trip on its way out starts fresh

  // Nothing waits for the server: offline it all queues on the phone, in
  // order (the trip first: the rules for its sub-collections read it).
  const fail = (err) => console.error('Import write failed:', err);
  setDoc(newTripRef, tripData).catch(fail);

  for (const name of SUBCOLS) {
    const items = backup.subcollections[name] || [];
    for (let i = 0; i < items.length; i += 450) {   // a batch holds 500 writes
      const batch = writeBatch(db);
      for (const { id, ...data } of items.slice(i, i + 450)) {
        const ref = id
          ? doc(db, 'trips', newTripId, name, id)
          : doc(collection(db, 'trips', newTripId, name));
        batch.set(ref, data);
      }
      batch.commit().catch(fail);
    }
  }

  return newTripId;
}
