// Items on members' personal checklists ("global") are copied into every
// trip they are in. ChecklistTab copies an item only when the trip has
// never had it and never deleted it, and only from a view the server has
// confirmed: a cached view can miss an item that is already there, ticked.
// The copy merges text and category and leaves `completed` out, so even
// a copy made from a stale view can never untick an item.
import { doc, writeBatch } from 'firebase/firestore';

export function missingGlobalItems(globalItems, tripItems, deletedIds) {
  const have = new Set(tripItems.map(i => i.id));
  const deleted = new Set(deletedIds);
  return globalItems.filter(g => !have.has(g.id) && !deleted.has(g.id));
}

export function copyGlobalItems(db, tripId, items) {
  const batch = writeBatch(db);
  items.forEach(item => batch.set(doc(db, 'trips', tripId, 'checklist', item.id),
    { text: item.text, category: item.category }, { merge: true }));
  return batch.commit();
}
