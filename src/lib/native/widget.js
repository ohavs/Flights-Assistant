// The home screen widgets (Android app only; every export is a no-op on the
// web). TripWidgetPlugin.java keeps the snapshot (src/lib/widgetData.js)
// and redraws every widget; a tap on one comes back as an "open" event.
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
