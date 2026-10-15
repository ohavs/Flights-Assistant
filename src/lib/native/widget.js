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
// the trip widget by default); the phone shows its own dialog.
export async function pinWidget(kind = 'TripWidget') {
  if (!isNative) return false;
  try { return !!(await TripWidget.pin({ kind })).asked; } catch { return false; }
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

// The sign-in the expense widget saves with: { uid, refreshToken, apiKey,
// projectId }, or null when signed out. It stays on the phone, out of backups.
export async function saveWidgetAuth(signIn) {
  if (!isNative) return;
  try { await TripWidget.auth(signIn || {}); } catch { /* an app from before 8.45.0 */ }
}

// Expenses the widget could not send (offline, or before the app handed it
// the sign-in), written through the app's own Firestore: write(tripId, id,
// doc) resolves once the write is queued. Another account's wait for them.
// Returns how many were sent.
export async function sendWidgetExpenses(uid, write) {
  if (!isNative || !uid) return 0;
  let items;
  try { items = (await TripWidget.pending()).items || []; } catch { return 0; }
  const sent = [];
  for (const it of items) {
    if (!it?.id || !it.tripId || !it.doc || (it.uid && it.uid !== uid)) continue;
    try {
      await write(it.tripId, it.id, { ...it.doc, paidBy: it.doc.paidBy || uid });
      sent.push(it.id);
    } catch { /* stays queued; the next open tries again */ }
  }
  if (sent.length) { try { await TripWidget.done({ ids: sent }); } catch { /* sent twice is the same document */ } }
  return sent.length;
}
