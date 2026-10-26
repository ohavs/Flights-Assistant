// The place alerts set on this phone (src/lib/placeAlerts.js), in
// localStorage: they are this phone's notifications, so they live with it,
// work offline, and need no write to the trip. Every change reschedules
// the 'place' kind and tells the screens ('placealarms' on window).
import { placeAlerts } from '../placeAlerts';

const KEY = 'notify.places';
export const EVENT = 'placealarms';
const keyOf = (tripId, placeId) => `${tripId}/${placeId}`;

export function readPlaceAlarms() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

function write(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* no window */ }
}

export const getPlaceAlarm = (tripId, placeId) => readPlaceAlarms()[keyOf(tripId, placeId)] || null;

// Reschedule; with `ask`, ask for the permission first (the user just set
// one). Returns the permission: 'granted' | 'denied' | 'prompt' | 'unsupported'.
export async function syncPlaceAlarms({ ask = false } = {}) {
  try {
    const n = await import('./notify');
    const alerts = placeAlerts(readPlaceAlarms());
    const perm = await n.notifyPermission({ ask: ask && alerts.length > 0 });
    await n.syncNotifications('place', alerts);
    return perm;
  } catch { return 'unsupported'; }
}

export function setPlaceAlarm(entry) {
  const store = readPlaceAlarms();
  store[keyOf(entry.tripId, entry.placeId)] = entry;
  write(store);
  return syncPlaceAlarms({ ask: true });
}

export function removePlaceAlarm(tripId, placeId) {
  const store = readPlaceAlarms();
  delete store[keyOf(tripId, placeId)];
  write(store);
  return syncPlaceAlarms();
}

// A trip's places as they are now: drop the alerts of places deleted or of
// times gone by, and keep each title current.
export function tidyPlaceAlarms(tripId, plans) {
  const store = readPlaceAlarms();
  const byId = new Map((plans || []).map(p => [p.id, p]));
  const now = Date.now();
  let changed = false;
  for (const [k, a] of Object.entries(store)) {
    if (a.tripId !== tripId) continue;
    const plan = byId.get(a.placeId);
    const at = new Date(a.at).getTime();
    if (!plan || !(at > now)) { delete store[k]; changed = true; continue; }
    if (plan.title && plan.title !== a.title) { store[k] = { ...a, title: plan.title }; changed = true; }
  }
  if (changed) { write(store); syncPlaceAlarms(); }
}
