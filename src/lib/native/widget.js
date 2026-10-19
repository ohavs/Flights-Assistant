// The home screen widgets (Android app only; every export is a no-op on the
// web). TripWidgetPlugin.java keeps the snapshot (src/lib/widgetData.js)
// and redraws every widget; a tap on one comes back as an "open" event.
// The expense widget saves on its own (ExpenseStore.java) with the sign-in
// the app hands it, and what it could not send the app writes here.
import { registerPlugin } from '@capacitor/core';
import { isNative } from '../platform';

const TripWidget = registerPlugin('TripWidget');

// The snapshot as JSON, or null when signed out.
export async function saveWidget(snapshot) {
  if (!isNative) return;
  try { await TripWidget.save({ json: snapshot ? JSON.stringify(snapshot) : null }); }
  catch { /* an app from before 8.39.0 */ }
}

// { count, pinSupported }, or null on the web.
export async function widgetStatus() {
  if (!isNative) return null;
  try { return await TripWidget.status(); } catch { return null; }
}

// Asks the launcher to add a widget (kind: its class, e.g. 'PlanWidget';
// the trip widget by default) of tripId's trip, or of the next trip
// without one; the phone shows its own dialog.
export async function pinWidget(kind = 'TripWidget', tripId = '') {
  if (!isNative) return false;
  try { return !!(await TripWidget.pin({ kind, tripId: tripId || '' })).asked; } catch { return false; }
}

// A tap on the widget: handler({ tripId, tab }). Returns an unsubscribe.
export function onWidgetOpen(handler) {
  if (!isNative) return () => {};
  let sub;
  let gone = false;
  Promise.resolve(TripWidget.addListener('open', (e) => handler(e || {})))
    .then(s => { if (gone) s?.remove?.(); else sub = s; })
    .catch(() => {});
  return () => { gone = true; sub?.remove?.(); };
}

// The sign-in the expense and reminders widgets save with: { uid,
// refreshToken, apiKey, projectId, name, photo }, or null when signed out.
// It stays on the phone, out of backups.
export async function saveWidgetAuth(signIn) {
  if (!isNative) return;
  try { await TripWidget.auth(signIn || {}); } catch { /* an app from before 8.45.0 */ }
}

// What the widgets could not send (offline, or before the app handed them
// the sign-in), written through the app's own Firestore:
//   addExpense(tripId, id, doc): an expense from the home screen;
//   addReminder(tripId, id, doc): a reminder from the reminders widget;
//   setField(path, field, value): a tick in the plan or reminders list.
// Each resolves once the write is queued. Another account's wait for them.
// Returns how many were sent.
export async function sendWidgetWrites(uid, { addExpense, addReminder, setField }) {
  if (!isNative || !uid) return 0;
  let items;
  try { items = (await TripWidget.pending()).items || []; } catch { return 0; }
  const sent = [];
  for (const it of items) {
    if (!it?.id || (it.uid && it.uid !== uid)) continue;
    try {
      if (it.kind === 'patch') {
        // Only what the lists tick: a place visited, a reminder done.
        const ok = /^trips\/[^/]+\/(planning\/[^/]+|reminders\/[^/]+)$/.test(it.path || '')
          && ['visited', 'completed'].includes(it.field) && typeof it.value === 'boolean';
        if (!ok) continue;
        await setField(it.path, it.field, it.value);
      } else if (it.coll === 'reminders') {
        if (!it.tripId || typeof it.doc?.text !== 'string' || !it.doc.text.trim()) continue;
        await addReminder(it.tripId, it.id, { ...it.doc, addedByUid: it.doc.addedByUid || uid });
      } else {
        if (!it.tripId || !it.doc) continue;
        await addExpense(it.tripId, it.id, { ...it.doc, paidBy: it.doc.paidBy || uid });
      }
      sent.push(it.id);
    } catch { /* stays queued; the next open tries again */ }
  }
  if (sent.length) { try { await TripWidget.done({ ids: sent }); } catch { /* sent twice is the same write */ } }
  return sent.length;
}
