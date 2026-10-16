// The planning categories' look (icon, colour) lives in one document,
// trips/{id}/settings/categories, one field per category. Each change
// writes that one category and nothing else. Writing the whole map from
// what this phone last saw would erase a category someone else added or
// changed in the meantime, or while this phone was offline.
import { doc, setDoc, deleteField } from 'firebase/firestore';

const ref = (db, tripId) => doc(db, 'trips', tripId, 'settings', 'categories');

// `patch` is merged into the category: { color } leaves its icon alone,
// and { iconKey } its colour.
export const saveCategory = (db, tripId, cat, patch) =>
  setDoc(ref(db, tripId), { [cat]: patch }, { merge: true });

// A new category carries one field of its own, `added`. Merging an empty
// map would replace a category of that name someone else has already
// styled with an empty one.
export const addCategory = (db, tripId, cat) =>
  saveCategory(db, tripId, cat, { added: Date.now() });

export const removeCategory = (db, tripId, cat) =>
  setDoc(ref(db, tripId), { [cat]: deleteField() }, { merge: true });
