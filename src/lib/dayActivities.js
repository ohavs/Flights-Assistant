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
import { doc, updateDoc, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore';

const hasOrder = (a) => typeof a?.order === 'number';
const keyOf = (a, i) => a?.id ?? `#${i}`;

// Every copy in the array, each with the place it counts at (`rank`).
function rows(raw) {
  let prev = 0;
  return (Array.isArray(raw) ? raw : []).map((act, i) => {
    const rank = hasOrder(act) ? act.order : prev + 1;
    prev = rank;
    return { act, rank, i };
  });
}

// One row per activity (the newest copy), in the order shown.
function shownRows(all) {
  const best = new Map();
  for (const r of all) {
    const k = keyOf(r.act, r.i);
    const cur = best.get(k);
    if (!cur || (r.act.updatedAt || 0) >= (cur.act.updatedAt || 0)) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank || a.i - b.i);
}

// The day's activities as they are shown. Every reader goes through this.
export const dayActivities = (raw) => shownRows(rows(raw)).map(r => r.act);

const dayRef = (db, tripId, dayId) => doc(db, 'trips', tripId, 'days', dayId);

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
function settle(all, touched) {
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
  return updateDoc(dayRef(db, tripId, dayId), { activities: arrayUnion(...put) });
}

// Replaces the activity with id `next.id` by `next`, in the same place.
export function updateActivity(db, tripId, dayId, raw, next) {
  const all = rows(raw);
  const was = shownRows(all).find(r => r.act?.id === next.id);
  if (!was) return Promise.resolve();
  const { out, put } = settle(all, new Set([next.id]));
  return commit(db, tripId, dayId, out, [...put, { ...next, order: was.rank, updatedAt: Date.now() }]);
}

export function removeActivity(db, tripId, dayId, raw, id) {
  const { out, put } = settle(rows(raw), new Set([id]));
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
