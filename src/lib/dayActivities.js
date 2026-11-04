// A day's plan is the array `activities` on trips/{id}/days/{dayId}.
//
// Writing that array whole, from what this phone last saw, erases what a
// trip partner added or changed meanwhile, or while this phone was offline.
// So each change touches only its own activities. arrayUnion adds and
// arrayRemove takes out the exact copies this phone saw. An edit or a move
// does both, in one batch. All of it works offline.
//
// arrayUnion always appends, so the order is kept on each activity as
// `order`, not by position. An activity saved without one (before this, or
// by an app that is not updated yet) counts right after the one before it
// in the array. It gets an `order` the first time its day is edited,
// reordered or has something removed. Two edits of one activity at the
// same time can leave two copies of it. Readers show the newer one
// (`updatedAt`), and the next change to it removes both.
//
// A day is named by its id (trips/{tripId}/days/{id}), or by
// { ref, upsert: true }: a document that may not exist yet and is made by
// its first activity (a personal day, trips/{tripId}/personal/{uid}/days).
import { doc, setDoc, updateDoc, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore';
import { hasOrder, rows, shownRows, dayActivities } from './dayOrder.js';

export { dayActivities };

const dayRef = (db, tripId, day) => (day && typeof day === 'object' ? day.ref : doc(db, 'trips', tripId, 'days', day));
const upserts = (day) => !!(day && typeof day === 'object' && day.upsert);

// One batch: take out the exact copies in `out`, then put in `put`.
function commit(db, tripId, dayId, out, put) {
  const ref = dayRef(db, tripId, dayId);
  const batch = writeBatch(db);
  if (out.length) batch.update(ref, { activities: arrayRemove(...out) });
  if (put.length) batch.update(ref, { activities: arrayUnion(...put) });
  return batch.commit();
}

// Everything that changes when the activities in `touched` (ids) are taken
// out: their copies, and the activities with no `order` yet, which would
// otherwise shift place. Those come back with their place written down.
// `onlyOwn` ("הוספה", which may change only its own activities, see
// firestore.rules): just the copies of `touched`, the others left as they are.
function settle(all, touched, onlyOwn = false) {
  if (onlyOwn) return { out: all.filter(r => touched.has(r.act?.id)).map(r => r.act), put: [] };
  const out = all.filter(r => touched.has(r.act?.id) || !hasOrder(r.act));
  const keep = shownRows(all).filter(r => !touched.has(r.act?.id) && !hasOrder(r.act));
  return { out: out.map(r => r.act), put: keep.map(r => ({ ...r.act, order: r.rank })) };
}

// Adds new activities at the end of the day.
export function addActivities(db, tripId, dayId, raw, acts) {
  if (!acts.length) return Promise.resolve();
  let top = Math.max(0, ...rows(raw).map(r => r.rank));
  const now = Date.now();
  const put = acts.map(a => ({ ...a, order: ++top, updatedAt: now }));
  const ref = dayRef(db, tripId, dayId);
  return upserts(dayId)
    ? setDoc(ref, { activities: arrayUnion(...put) }, { merge: true })
    : updateDoc(ref, { activities: arrayUnion(...put) });
}

// Replaces the activity with id `next.id` by `next`, in the same place.
export function updateActivity(db, tripId, dayId, raw, next, onlyOwn = false) {
  const all = rows(raw);
  const was = shownRows(all).find(r => r.act?.id === next.id);
  if (!was) return Promise.resolve();
  const { out, put } = settle(all, new Set([next.id]), onlyOwn);
  return commit(db, tripId, dayId, out, [...put, { ...next, order: was.rank, updatedAt: Date.now() }]);
}

export function removeActivity(db, tripId, dayId, raw, id, onlyOwn = false) {
  const { out, put } = settle(rows(raw), new Set([id]), onlyOwn);
  return commit(db, tripId, dayId, out, put);
}

// Swaps the places of two activities of the same day.
export function swapActivities(db, tripId, dayId, raw, id, otherId) {
  const all = rows(raw);
  const shown = shownRows(all);
  const a = shown.findIndex(r => r.act?.id === id);
  const b = shown.findIndex(r => r.act?.id === otherId);
  if (a < 0 || b < 0 || a === b) return Promise.resolve();
  const ra = shown[a].rank;
  const rb = shown[b].rank;
  // Two activities can share a place (added at once on two phones); then
  // the one moving goes just past the other.
  const aTo = ra === rb ? rb + (b > a ? 0.5 : -0.5) : rb;
  const { out, put } = settle(all, new Set([id, otherId]));
  return commit(db, tripId, dayId, out, [
    ...put, { ...shown[a].act, order: aTo }, { ...shown[b].act, order: ra },
  ]);
}

// Moves an activity to the end of another day: out of one array, into the
// other, in one batch. `from`/`to`: { id, rawActivities, target? }, where
// `target` names the document as above when it is not a shared day.
// `onlyOwn` as in `settle`.
export function moveActivityToDay(db, tripId, from, to, id, onlyOwn = false) {
  const all = rows(from.rawActivities);
  const was = shownRows(all).find(r => r.act?.id === id);
  if (!was || from.id === to.id) return Promise.resolve();
  const { out, put } = settle(all, new Set([id]), onlyOwn);
  const top = Math.max(0, ...rows(to.rawActivities).map(r => r.rank));
  const batch = writeBatch(db);
  const src = dayRef(db, tripId, from.target ?? from.id);
  if (out.length) batch.update(src, { activities: arrayRemove(...out) });
  if (put.length) batch.update(src, { activities: arrayUnion(...put) });
  const moved = { activities: arrayUnion({ ...was.act, order: top + 1, updatedAt: Date.now() }) };
  const dest = to.target ?? to.id;
  if (upserts(dest)) batch.set(dayRef(db, tripId, dest), moved, { merge: true });
  else batch.update(dayRef(db, tripId, dest), moved);
  return batch.commit();
}

// Swaps two days (src/lib/dayPlan.js, swapDayFields): each document takes
// the other's place, and the activities fixed to a date by a booking
// (`stayA` on a's date, `stayB` on b's, as ids) move over so they stay on it.
export function swapDays(db, tripId, a, b, fields, stayA = new Set(), stayB = new Set()) {
  const ra = dayRef(db, tripId, a.id);
  const rb = dayRef(db, tripId, b.id);
  const copies = (day, ids) => rows(day.rawActivities).filter(r => ids.has(r.act?.id)).map(r => r.act);
  const fromA = copies(a, stayA);
  const fromB = copies(b, stayB);
  const batch = writeBatch(db);
  batch.update(ra, fields.a);
  batch.update(rb, fields.b);
  if (fromA.length) batch.update(ra, { activities: arrayRemove(...fromA) });
  if (fromB.length) batch.update(rb, { activities: arrayRemove(...fromB) });
  if (fromA.length) batch.update(rb, { activities: arrayUnion(...fromA) });
  if (fromB.length) batch.update(ra, { activities: arrayUnion(...fromB) });
  return batch.commit();
}

// Clears a day (8.81.0): takes out its activities but those in `keep` (ids:
// what is fixed to the date, anchoredIds), in one batch. The day itself
// stays. Returns { removed, done }: the activities taken out, each with its
// place, for `putBack`; and the write.
export function clearActivities(db, tripId, dayId, raw, keep = new Set()) {
  const all = rows(raw);
  const gone = shownRows(all).filter(r => r.act?.id != null && !keep.has(r.act.id));
  if (!gone.length) return { removed: [], done: Promise.resolve() };
  const { out, put } = settle(all, new Set(gone.map(r => r.act.id)));
  return {
    removed: gone.map(r => ({ ...r.act, order: r.rank })),
    done: commit(db, tripId, dayId, out, put),
  };
}

// Puts back activities taken out by clearActivities, each in its place.
export function putBack(db, tripId, dayId, acts) {
  if (!acts.length) return Promise.resolve();
  return updateDoc(dayRef(db, tripId, dayId), { activities: arrayUnion(...acts) });
}

// Brings back days of the trip (8.81.0): `made` is [{ id, date, order,
// title }] (placeDays in dayPlan.js). Merged, so a day another phone
// brought back at the same moment, under the same id, keeps what it has.
// `trip`: fields of the trip document to write in the same batch.
export function restoreDays(db, tripId, made, trip = null) {
  const batch = writeBatch(db);
  made.forEach(({ id, date, order, title }) => batch.set(
    doc(db, 'trips', tripId, 'days', id),
    { title, date, order, activities: arrayUnion() },
    { merge: true },
  ));
  if (trip) batch.update(doc(db, 'trips', tripId), trip);
  return batch.commit();
}
