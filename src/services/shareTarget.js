/* ── Web Share Target ────────────────────────────────────────────────────
   The installed PWA registers itself as a share target (see the manifest in
   vite.config.js), so "Share" in Google Maps lists this app. Android opens
   /share?title=…&text=…&url=… — this module turns that into a place we can
   drop straight into the add-place form, and keeps a light copy of the trip
   list around so the trip picker can render before Firestore answers.      */

const URL_RE = /https?:\/\/[^\s]+/i;
const TRIPS_CACHE_KEY = 'shareTargetTrips';
const PENDING_KEY = 'shareTargetPending';

// Google Maps hands us the place name and its link in whichever of the three
// fields it feels like using — usually name + link joined by a newline inside
// `text`. Pull them apart without assuming a particular shape.
export function parseSharedPlace({ title = '', text = '', url = '' } = {}) {
  const fromUrlParam = URL_RE.test(url || '') ? (url || '').match(URL_RE)[0] : '';
  const fromText = (text || '').match(URL_RE)?.[0] || '';
  const link = (fromUrlParam || fromText).replace(/[)\].,;]+$/, '');

  // Everything that isn't the link is a candidate for the name.
  const leftovers = (text || '')
    .replace(link, ' ')
    .split(/[\r\n]+/)
    .map(l => l.trim())
    .filter(l => l && !URL_RE.test(l));

  let name = (title || '').trim();
  if (!name || URL_RE.test(name)) name = leftovers[0] || '';
  // A full maps URL carries the place name in its /place/<name>/ segment —
  // worth using when the share carried nothing but a link.
  if (!name) name = nameFromMapsUrl(link);
  name = name.replace(/^[·•\-—\s"']+|[·•\-—\s"']+$/g, '').trim();

  // Anything else the share carried (Maps often adds the street address)
  // becomes the description, so nothing shared is thrown away.
  const note = leftovers.filter(l => l !== name).join(' · ');

  return { name, url: link, note };
}

function nameFromMapsUrl(url) {
  const m = (url || '').match(/\/maps\/place\/([^/@?]+)/i);
  if (!m) return '';
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim(); }
  catch { return m[1].replace(/\+/g, ' ').trim(); }
}

// True when this page load came from the share sheet.
export function isShareRoute(loc = window.location) {
  const path = (loc.pathname || '').replace(/\/+$/, '');
  return path === '/share' || new URLSearchParams(loc.search).get('screen') === 'share';
}

// The shared place currently being handled, or null. Parsed from the URL when
// we were opened from the share sheet, otherwise restored from sessionStorage
// — the app reloads itself whenever a new service worker takes over, and that
// reload must not swallow the place someone just shared. Returns a payload
// even when nothing parsed, so the picker can still open an empty form rather
// than silently dropping the user on the homepage.
export function readSharedPlace(loc = window.location) {
  if (isShareRoute(loc)) {
    const p = new URLSearchParams(loc.search);
    const place = parseSharedPlace({
      title: p.get('title') || '',
      text: p.get('text') || '',
      url: p.get('url') || '',
    });
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(place)); } catch { /* ignore */ }
    return place;
  }
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Drop the share params from the address bar so a refresh (or the back
// button) doesn't hand us the same place a second time.
export function clearShareUrl() {
  try { window.history.replaceState({}, '', '/'); } catch { /* non-blocking */ }
}

// The place has been placed in a trip (or the user backed out) — stop
// restoring it on the next load.
export function clearSharedPlace() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* non-blocking */ }
}

/* ── Trip list cache ──────────────────────────────────────────────────────
   Shown by the picker straight away, before auth resolves and before
   Firestore delivers the live list. Refreshed on every trips snapshot.     */

export function cacheTripsForShare(trips, uid) {
  try {
    const slim = (trips || []).map(t => ({
      id: t.id,
      name: t.name || '',
      destination: t.destination || '',
      // Remembered too, so the picker can grey out a trip you only view
      // before Firestore has answered with the live roles.
      canEdit: ['owner', 'editor', 'member'].includes(t.members?.[uid]),
    }));
    localStorage.setItem(TRIPS_CACHE_KEY, JSON.stringify(slim));
  } catch { /* storage full / disabled — the picker just waits for Firestore */ }
}

export function readCachedTrips() {
  try {
    const raw = localStorage.getItem(TRIPS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
