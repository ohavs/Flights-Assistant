// Who sees a payment between two people ("בינינו", 8.80.0, the owner's
// ask): the two in it and whoever wrote it down; the trip's owner sees
// them all. The rules (firestore.rules) refuse anyone else's, and with it
// a listener on the whole collection, so a member asks for theirs: one
// query per field, merged by id. The same queries everywhere (the tab, the
// offline listeners, the backup), so Firestore shares the listeners.
import { collection, query, where } from 'firebase/firestore';

export const PAYMENT_PARTIES = ['from', 'to', 'createdBy'];

export function paymentQueries(db, tripId, uid, owner) {
  const coll = collection(db, 'trips', tripId, 'payments');
  if (owner) return [coll];
  if (!uid) return [];
  return PAYMENT_PARTIES.map(f => query(coll, where(f, '==', uid)));
}

// The docs of a few queries, each once.
export function mergeById(lists) {
  const byId = new Map();
  for (const list of lists) for (const d of list || []) byId.set(d.id, d);
  return [...byId.values()];
}
