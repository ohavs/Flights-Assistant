// Alerts near places set on this phone (src/lib/nearPlaces.js): kept in
// localStorage, since they are this phone's own, and handed to Android as
// geofences (NearPlacesPlugin.java), which watches them with the app
// closed and needs no internet. Every change re-syncs and tells the
// screens ('nearplaces' on window).
//
// The e2e test stands in for Android with window.__e2eNear:
// { status: { location, background }, fences: [] }.
import { registerPlugin } from '@capacitor/core';
import { isNative } from '../platform';
import { nearFences, tidyNear } from '../nearPlaces';

const NearPlaces = registerPlugin('NearPlaces');
const KEY = 'notify.near';
export const EVENT = 'nearplaces';
const keyOf = (tripId, placeId) => `${tripId}/${placeId}`;
const fake = () => (typeof window !== 'undefined' && window.__e2eNear) || null;
export const nearSupported = () => isNative || !!fake();

export function readNear() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

function write(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* no window */ }
}

// { location: 'granted' | 'approximate' | 'denied' | 'prompt',
//   background: 'granted' | 'denied' | 'prompt' }, or null off Android.
export async function nearStatus() {
  const f = fake();
  if (f) return { ...f.status };
  if (!isNative) return null;
  try { return await NearPlaces.status(); } catch { return null; }
}

// Asks for the location ("while using the app"), then for "all the time":
// Android asks for them apart, and the second opens the phone's settings.
export async function askNearLocation() {
  const f = fake();
  if (f) { f.asked = [...(f.asked || []), 'location']; if (f.grant) f.status.location = 'granted'; return { ...f.status }; }
  if (!isNative) return null;
  try { return await NearPlaces.askLocation(); } catch { return null; }
}
export async function askNearBackground() {
  const f = fake();
  if (f) { f.asked = [...(f.asked || []), 'background']; if (f.grant) f.status.background = 'granted'; return { ...f.status }; }
  if (!isNative) return null;
  try { return await NearPlaces.askBackground(); } catch { return null; }
}
export async function openNearSettings() {
  if (!isNative) return;
  try { await NearPlaces.openSettings(); } catch { /* an app from before 8.100.0 */ }
}

// Hands Android what to watch now (none while "קרבה למקומות" is off in the
// settings). → { location, background, registered, error? } or null.
export async function syncNear() {
  let on = true;
  try { on = (await import('./notify')).notifyPrefs().near !== false; } catch { /* default on */ }
  const fences = on ? nearFences(readNear()) : [];
  const f = fake();
  if (f) { f.fences = fences; return { ...f.status, registered: fences.length }; }
  if (!isNative) return null;
  try { return await NearPlaces.setFences({ fences }); } catch { return null; }
}

export const getNear = (tripId, placeId) => readNear()[keyOf(tripId, placeId)] || null;

export function setNear(entry) {
  const store = readNear();
  store[keyOf(entry.tripId, entry.placeId)] = entry;
  write(store);
  return syncNear();
}

export function removeNear(tripId, placeId) {
  const store = readNear();
  delete store[keyOf(tripId, placeId)];
  write(store);
  return syncNear();
}

// A trip's places as they are now (src/lib/nearPlaces.js, tidyNear).
export function tidyNearOf(tripId, plans, spotOf, lastDay) {
  const next = tidyNear(readNear(), tripId, plans, spotOf, lastDay);
  if (next) { write(next); syncNear(); }
}
