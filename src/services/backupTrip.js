import { db } from '../firebase';
import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';

const SUBCOLS = ['planning', 'days', 'checklist', 'info', 'reminders', 'expenses', 'settings'];

export async function exportTripBackup(tripId, tripDoc) {
  const subcollections = {};
  for (const name of SUBCOLS) {
    try {
      const snap = await getDocs(collection(db, 'trips', tripId, name));
      subcollections[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {
      subcollections[name] = [];
    }
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    trip: { ...tripDoc },
    subcollections,
  };
}

export function downloadBackupFile(backup, tripName) {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().split('T')[0];
  const safe = (tripName || 'טיול').replace(/[^א-תa-zA-Z0-9 ]/g, '').trim();
  a.download = `גיבוי_${safe}_${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

  await setDoc(newTripRef, tripData);

  for (const name of SUBCOLS) {
    const items = backup.subcollections[name] || [];
    if (!items.length) continue;
    const batch = writeBatch(db);
    for (const { id, ...data } of items) {
      const ref = id
        ? doc(db, 'trips', newTripId, name, id)
        : doc(collection(db, 'trips', newTripId, name));
      batch.set(ref, data);
    }
    await batch.commit();
  }

  return newTripId;
}
