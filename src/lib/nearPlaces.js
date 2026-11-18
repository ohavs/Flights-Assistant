// Alerts near a place (the owner's ask, 8.100.0): a switch on each place,
// and how near (the radius). Kept on the phone, like a place's alert
// (src/lib/native/nearPlaces.js), and watched by Android itself: geofences
// (NearPlaces.java) hold each place's spot, so nothing goes to the internet
// to know where the place is or to send the notification. Pure
// (tests/nearPlaces.test.mjs).
//
// An entry, by `${tripId}/${placeId}`:
//   { tripId, placeId, radius, title, lat, lng, hours, visited, lastDay }
// `hours`: the notification's line for each weekday (0 = Sunday), or null.
// `lastDay`: the trip's last day ('YYYY-MM-DD'); the alert ends after it.
import { dayText, hasHours } from './openHours.js';

export const NEAR_RADII = [150, 300, 500, 1000, 2000];
export const NEAR_DEFAULT = 300;
export const NEAR_MAX = 100;   // Android's limit of geofences for one app

export const radiusLabel = (m) => (m >= 1000 ? `${+(m / 1000).toFixed(1)} ק״מ` : `${m} מ׳`);

const isFin = (n) => typeof n === 'number' && Number.isFinite(n);

// The alert stops at the end of the day after the trip's last day.
export function nearUntil(lastDay) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lastDay || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3] + 2).getTime() : 0;
}

// The notification's line about the hours, for each day of the week.
export function nearHours(openHours) {
  if (!hasHours(openHours)) return null;
  return Array.from({ length: 7 }, (_, d) => {
    const t = dayText(openHours, d);
    return !t ? '' : t === 'סגור' ? 'סגור היום' : `פתוח היום ${t}`;
  });
}

// What an entry keeps of its place: `spot` is its saved location
// ({ lat, lng }) or null.
export function nearOf(plan, spot) {
  return {
    title: (plan?.title || '').trim(),
    lat: isFin(spot?.lat) ? spot.lat : null,
    lng: isFin(spot?.lng) ? spot.lng : null,
    hours: nearHours(plan?.openHours),
    visited: !!plan?.visited,
  };
}

// Why an entry is not watched now, or '' when it is.
export function nearWhyNot(entry, now = Date.now()) {
  if (!entry) return '';
  if (!isFin(entry.lat) || !isFin(entry.lng)) return 'nospot';
  if (entry.visited) return 'visited';
  const until = nearUntil(entry.lastDay);
  if (until && until <= now) return 'over';
  return '';
}

// The geofences for Android: every entry watched now, at most NEAR_MAX.
// The notification's text is written here; the hours line is picked by
// the phone on the day it comes.
export function nearFences(store, now = Date.now()) {
  return Object.entries(store || {})
    .filter(([, e]) => !nearWhyNot(e, now))
    .slice(0, NEAR_MAX)
    .map(([id, e]) => ({
      id,
      tripId: e.tripId,
      placeId: e.placeId,
      lat: e.lat,
      lng: e.lng,
      radius: NEAR_RADII.includes(e.radius) ? e.radius : NEAR_DEFAULT,
      until: nearUntil(e.lastDay),
      title: `אתם ליד ${e.title || 'מקום מהרשימה'}`,
      body: `פחות מ־${radiusLabel(NEAR_RADII.includes(e.radius) ? e.radius : NEAR_DEFAULT)} ממכם`,
      hours: e.hours || null,
    }));
}

// A trip's places as they are now: drop entries of places deleted, keep
// title, spot, hours and "visited" current. → the next store, or null when
// nothing changed.
export function tidyNear(store, tripId, plans, spotOf, lastDay) {
  const byId = new Map((plans || []).map(p => [p.id, p]));
  const next = { ...store };
  let changed = false;
  for (const [k, e] of Object.entries(store || {})) {
    if (e.tripId !== tripId) continue;
    const plan = byId.get(e.placeId);
    if (!plan) { delete next[k]; changed = true; continue; }
    const now = { ...e, ...nearOf(plan, spotOf(plan)), lastDay: lastDay || null };
    if (JSON.stringify(now) !== JSON.stringify(e)) { next[k] = now; changed = true; }
  }
  return changed ? next : null;
}
