// What the triggers in index.js do, given who made the change. Kept apart
// from the triggers so tests/pushHandlers.test.mjs can run it against the
// Firestore emulator: the emulator does not pass the writer's identity to
// triggers, so the wiring in index.js is all the tests leave out.
//
// `deliver(uids, { title, body }, { tripId, kind, tag, tab })` sends.
import { digest, text, TAB, expenseLabel, membersOf, addedMembers, newActivities, travelChanges } from './push.js';

export function makeHandlers({ db, deliver, now = () => Date.now() }) {
  async function nameOf(uid) {
    const u = (await db.doc(`users/${uid}`).get()).data() || {};
    return String(u.displayName || '').trim() || String(u.email || '').split('@')[0];
  }

  // The running count of one person's additions of one kind, in one go.
  function bump(tripId, actor, kind, label) {
    const ref = db.doc(`pushDigests/${tripId}_${actor}_${kind}`);
    return db.runTransaction(async (tx) => {
      const next = digest((await tx.get(ref)).data(), label, now());
      tx.set(ref, next);
      return next;
    });
  }

  const meta = (tripId, kind, tag) => ({ tripId, kind, tag, tab: TAB[kind] || 'flight' });

  async function counted(actor, tripId, kind, label, extra = {}) {
    if (!actor || !label) return;
    const trip = (await db.doc(`trips/${tripId}`).get()).data();
    if (!trip) return;
    const to = membersOf(trip, [actor]);
    if (!to.length) return;
    const [d, name] = await Promise.all([bump(tripId, actor, kind, label), nameOf(actor)]);
    // One tag per person and kind: the newer count replaces the older one.
    await deliver(to, text(kind, { trip, actor: name, digest: d, ...extra }), meta(tripId, kind, `${tripId}:${kind}:${actor}`));
  }

  return {
    expenseCreated: (actor, tripId, data) => counted(actor, tripId, 'expense', expenseLabel(data)),

    placeCreated: (actor, tripId, data) => counted(actor, tripId, 'plan', String(data?.title || '').trim()),

    async dayUpdated(actor, tripId, before, after) {
      const day = String(after?.title || '').trim();
      for (const a of newActivities(before, after)) {
        const title = String(a.title || '').trim();
        if (title) await counted(actor, tripId, 'plan', day ? `${title} (${day})` : title, { activity: true });
      }
    },

    async tripUpdated(actor, tripId, before = {}, after = {}) {
      if (!actor) return;
      const added = addedMembers(before, after);
      const changes = travelChanges(before, after);
      if (!added.length && !changes.length) return;
      const by = await nameOf(actor);
      for (const uid of added) {
        await deliver([uid], text('added', { trip: after, actor: by }), meta(tripId, 'added', `${tripId}:added`));
        await deliver(membersOf(after, [actor, ...added]), text('joined', { trip: after, name: await nameOf(uid) }),
          meta(tripId, 'joined', `${tripId}:joined:${uid}`));
      }
      for (const c of changes) {
        await deliver(membersOf(after, [actor, ...added]), text('travel', { trip: after, actor: by, ...c }),
          meta(tripId, 'travel', `${tripId}:travel:${c.which}`));
      }
    },
  };
}
