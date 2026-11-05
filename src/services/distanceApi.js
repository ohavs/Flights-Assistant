// Google Maps Routes API (v2) + Places API (New) — both support browser CORS.
// Requires "Routes API" and "Places API (New)" enabled on the API key.
//
// A place's location is found once and saved on it (findPlaceLocation,
// src/lib/placeLocation.js): coordinates in a Maps link, a short link
// (maps.app.goo.gl) opened on the server (openMapsLink), the typed address, and only
// then a Places Text Search by its name inside the trip's destination.

// Browser tests run an emulator build with a fake key (`__e2eGmapsKey`, set
// before the app loads) and answer the Maps calls themselves.
import { placeUrls, typedAddress, hashText, MAPS_SHORT } from '../lib/placeLocation';
import { callFunction } from '../firebase';

const GMAPS_KEY   = import.meta.env.VITE_GOOGLE_MAPS_KEY
  || (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && globalThis.__e2eGmapsKey) || '';
const ROUTES_URL  = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const PLACES_URL  = 'https://places.googleapis.com/v1/places:searchText';
const NEARBY_URL  = 'https://places.googleapis.com/v1/places:searchNearby';
const SHORT_CACHE = 'gmaps_short_v1_';  // short-URL expansion results
// A route's end given as a Google place id (wayOf in placeLocation.js).
const PLACE_ID    = 'place_id:';
// How far from a place's pin its Google id may be found: by a name, and
// (none found by one) the place nearest it.
const NEAR_PIN_METERS = 150;
const NEAREST_METERS = 50;

// Until 8.88.0 a guess by a place's name was kept on each phone (and was
// read before the place's link). The place keeps its location now.
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && (k.startsWith('gmaps_place_v2_') || k.startsWith('gmaps_found_v1_'))) localStorage.removeItem(k);
  }
} catch { /* no storage */ }

export const hasGmapsKey = () => GMAPS_KEY.length > 0;

export const isOnlineNow = () =>
  (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

// ── Coordinate extraction from URLs ──────────────────────────────────────────
export function extractCoordsFromMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  // The place's own pin (!3d…!4d…) first: `@lat,lng` is where the map was
  // centred when the link was copied, which can be a street or two away.
  const m4 = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m4) return `${m4[1]},${m4[2]}`;
  const m2 = url.match(/[?&](?:q|query|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
  if (m2) return `${m2[1]},${m2[2]}`;
  const m3 = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m3) return `${m3[1]},${m3[2]}`;
  const m1 = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m1) return `${m1[1]},${m1[2]}`;
  return null;
}

function extractCoordsFromHtml(html) {
  if (!html) return null;
  const patterns = [
    /property=["']og:url["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:url["']/i,
    /rel=["']canonical["'][^>]*href=["']([^"']+)["']/i,
    /href=["']([^"']+)["'][^>]*rel=["']canonical["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) { const c = extractCoordsFromMapsUrl(m[1]); if (c) return c; }
  }
  return null;
}

// ── Short-URL expansion ──────────────────────────────────────────────────────
// On the server first (8.89.0, functions/mapsLink.js): a short link can't
// be read from the browser, and the public CORS proxies below are often
// down, which left places shared as short links located by name for good.
// → { at, query } (an answer, maybe empty), or null when it failed.
async function openOnServer(url) {
  try {
    const r = await callFunction('openMapsLink', { url });
    return {
      at: parseLatLng(r?.at) ? r.at : null,
      query: typeof r?.query === 'string' ? r.query.trim() : '',
      url: typeof r?.url === 'string' ? r.url : '',
    };
  } catch { return null; }
}

// The place's name in a long Maps link (/maps/place/<name>/…), or ''.
function nameInUrl(url) {
  const m = typeof url === 'string' && url.match(/\/maps\/place\/([^/@?]+)/);
  if (!m || m[1].startsWith('data=')) return '';
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim(); } catch { return ''; }
}

// Resolve with the first task that yields a truthy value, without waiting for
// the slower ones. Promise.any rejects only once every task has failed, so a
// hung proxy can never hold up a proxy that already answered.
function firstSuccess(tasks) {
  return Promise.any(
    tasks.map(async (task) => {
      const value = await task();
      if (!value) throw new Error('empty');
      return value;
    })
  ).catch(() => null);
}

async function tryProxy(proxyUrl) {
  try {
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) {
      const data = await res.json();
      // allorigins.win: status.url = final URL after redirects
      const finalUrl = data?.status?.url || '';
      if (finalUrl) { const c = extractCoordsFromMapsUrl(finalUrl); if (c) return c; }
      return extractCoordsFromHtml(data?.contents || '');
    }
    return extractCoordsFromHtml(await res.text());
  } catch { return null; }
}

// A link shared from an iPhone leads to the place's name and address, not
// its coordinates: that text is Google's own, so finding it is the link's
// answer, not a guess by the name. `anchor`: the trip's destination.
// → { at, pid?, name? } (`name`: the place's name in the link, to find
// its id by), or null.
async function expandShortUrl(url, { anchor = null } = {}) {
  if (!url || !MAPS_SHORT.test(url)) return null;

  const cacheKey = SHORT_CACHE + url;
  const cached = readShortUrlCache(url);
  if (cached) return { at: cached };
  // Offline: the cache above is all we can offer — don't wait on timeouts.
  if (!isOnlineNow()) return null;

  const server = await openOnServer(url);
  let coords = server?.at || null;
  let found = null;
  if (!coords && server?.query && GMAPS_KEY) {
    found = await searchPlace(server.query, { anchor, restrict: false }).catch(() => null);
    coords = found?.at || null;
  }
  if (!server) {
    const enc = encodeURIComponent(url);
    // All proxies at once, first real answer wins.
    coords = await firstSuccess([
      () => tryProxy(`https://api.allorigins.win/get?url=${enc}`),
      () => tryProxy(`https://corsproxy.io/?url=${enc}`),
      () => tryProxy(`https://r.jina.ai/${url}`),
    ]);
  }
  if (!coords) return null;
  try { localStorage.setItem(cacheKey, coords); } catch { /* no storage */ }
  return { at: coords, pid: found?.pid || undefined, name: server?.query || nameInUrl(server?.url) || '' };
}

// ── Routes API helpers ────────────────────────────────────────────────────────
function toWaypoint(str) {
  if (str.startsWith(PLACE_ID)) return { placeId: str.slice(PLACE_ID.length) };
  const m = str.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
  if (m) return { location: { latLng: { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) } } };
  return { address: str };
}

function fmtDuration(secs) {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} דק'`;
  return `${Math.floor(m / 60)} שע' ${m % 60} דק'`;
}

function fmtDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} ק"מ`;
  return `${meters} מ'`;
}

async function queryRoute(origin, destination, travelMode) {
  let res;
  try {
    res = await fetch(`${ROUTES_URL}?key=${GMAPS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters' },
      body: JSON.stringify({ origin: toWaypoint(origin), destination: toWaypoint(destination), travelMode }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Connection failed (offline / blocked) — distinct from "no route found",
    // so the caller can keep cached data instead of marking it unresolvable.
    const err = new Error('network');
    err.network = true;
    throw err;
  }
  if (!res.ok) return null;
  const data = await res.json();
  const route = data?.routes?.[0];
  if (!route) return null;
  const secs = parseInt(String(route.duration || '0s').replace('s', '')) || 0;
  const meters = route.distanceMeters || 0;
  // Raw seconds/meters are persisted so sorting/grouping is exact and
  // independent of the formatted Hebrew string.
  return { duration: fmtDuration(secs), distance: fmtDistance(meters), seconds: secs, meters };
}

// Great-circle distance in metres between two "lat,lng" strings.
function metersBetween(aStr, bStr) {
  const a = parseLatLng(aStr);
  const b = parseLatLng(bStr);
  if (!a || !b) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// How far from the trip destination a title match may plausibly be. Generous
// enough for day-trips out of the city, tight enough to exclude another country.
const MAX_REGION_METERS = 150000; // 150 km

// ── Sanity guard ─────────────────────────────────────────────────────────────
// A "walk from your hotel" measured in days means the destination geocoded to
// the wrong place, not a real journey. Thresholds are deliberately loose so a
// genuine long day-trip still passes; only nonsense is rejected.
const MAX_SANE_SECONDS = 24 * 3600;   // 24 h
const MAX_SANE_METERS  = 500 * 1000;  // 500 km

function isSaneLeg(leg) {
  if (!leg) return true; // a missing leg is fine (e.g. no transit route)
  if (typeof leg.seconds === 'number' && leg.seconds > MAX_SANE_SECONDS) return false;
  if (typeof leg.meters === 'number'  && leg.meters  > MAX_SANE_METERS)  return false;
  return true;
}

// True when a stored/received travel-time value is believable.
export function isSaneTravel(value) {
  if (!value) return true;
  return isSaneLeg(value.walk) && isSaneLeg(value.transit);
}

// Parse a "lat,lng" string into numeric coordinates.
export function parseLatLng(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

// ── One location per place (8.88.0) ──────────────────────────────────────────
// Places (New) Text Search around the trip's destination. A name is only
// searched inside it (`restrict`: a namesake abroad is the wrong place);
// a typed address is biased to it, since the user meant that address.
// → { at: "lat,lng", name, addr } | null; throws { network } when the
// call could not be made, so a failure is not saved as "not found".
async function searchPlace(text, { anchor, restrict }) {
  const body = { textQuery: text };
  const a = parseLatLng(anchor);
  if (a && restrict) {
    const dLat = 1.0; // ~110 km
    const dLng = 1.0 / Math.max(0.2, Math.cos(a.lat * Math.PI / 180));
    body.locationRestriction = {
      rectangle: {
        low:  { latitude: Math.max(-90, a.lat - dLat), longitude: Math.max(-180, a.lng - dLng) },
        high: { latitude: Math.min(90, a.lat + dLat),  longitude: Math.min(180, a.lng + dLng) },
      },
    };
  } else if (a) {
    body.locationBias = { circle: { center: { latitude: a.lat, longitude: a.lng }, radius: 50000 } };
  }
  let res;
  try {
    res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GMAPS_KEY, 'X-Goog-FieldMask': 'places.id,places.location,places.displayName,places.formattedAddress' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    const err = new Error('network');
    err.network = true;
    throw err;
  }
  if (!res.ok) {
    // Over quota or a server error: not an answer about the place.
    if (res.status === 429 || res.status >= 500) { const err = new Error('busy'); err.network = true; throw err; }
    return null;
  }
  const data = await res.json().catch(() => null);
  const p = data?.places?.[0];
  const loc = p?.location;
  if (!loc || !Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) return null;
  const at = `${loc.latitude},${loc.longitude}`;
  if (a && restrict) {
    const away = metersBetween(anchor, at);
    if (away != null && away > MAX_REGION_METERS) return null;
  }
  return { at, name: p.displayName?.text || '', addr: p.formattedAddress || '', pid: p.id || '' };
}

// Google's id of the place at a pin: the first of `texts` (its name in a
// link, Google's name, the place's own) found within NEAR_PIN_METERS of
// it, else the place nearest it (NEAREST_METERS: any place that close is
// a better end than the road a point is taken to). '' when none is;
// throws { network } when a search could not be made.
const PID_CACHE = 'gmaps_pid_v1_';
async function placeIdNear(at, texts) {
  const c = parseLatLng(at);
  if (!c || !GMAPS_KEY) return '';
  // Once a phone for a pin and its names (the hotel's is asked for every
  // session otherwise).
  const cacheKey = PID_CACHE + hashText(`${at}|${texts.join('|')}`);
  try { const v = localStorage.getItem(cacheKey); if (v !== null) return v; } catch { /* no storage */ }
  const pid = await placeIdSearch(c, at, texts);
  try { localStorage.setItem(cacheKey, pid); } catch { /* no storage */ }
  return pid;
}

const placesCall = async (url, mask, body) => {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GMAPS_KEY, 'X-Goog-FieldMask': mask },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    const err = new Error('network');
    err.network = true;
    throw err;
  }
  if (!res.ok) {
    // Over quota or a server error: not an answer about the place.
    if (res.status === 429 || res.status >= 500) { const err = new Error('busy'); err.network = true; throw err; }
    return [];
  }
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.places) ? data.places : [];
};

async function placeIdSearch(c, at, texts) {
  const within = (meters) => (p) => p?.id && p.location
    && metersBetween(at, `${p.location.latitude},${p.location.longitude}`) <= meters;
  const dLat = NEAR_PIN_METERS / 111000;
  const dLng = dLat / Math.max(0.2, Math.cos(c.lat * Math.PI / 180));
  const tried = new Set();
  for (const raw of texts) {
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (!text || tried.has(text) || tried.size >= 3) continue;
    tried.add(text);
    const found = await placesCall(PLACES_URL, 'places.id,places.location', {
      textQuery: text,
      pageSize: 5,
      locationRestriction: { rectangle: {
        low: { latitude: c.lat - dLat, longitude: c.lng - dLng },
        high: { latitude: c.lat + dLat, longitude: c.lng + dLng },
      } },
    });
    const hit = found.find(within(NEAR_PIN_METERS));
    if (hit) return hit.id;
  }
  const nearest = await placesCall(NEARBY_URL, 'places.id,places.location', {
    locationRestriction: { circle: { center: { latitude: c.lat, longitude: c.lng }, radius: NEAREST_METERS } },
    maxResultCount: 1,
    rankPreference: 'DISTANCE',
  });
  return nearest.find(within(NEAREST_METERS))?.id || '';
}

// A located place's Google id (job 'pid', for places located before
// 8.90.0): searched by the names it is known by, at its pin.
// → '' when none is found; throws { network }.
export async function findPlaceId(plan, loc) {
  const at = `${loc.lat},${loc.lng}`;
  const urls = placeUrls(plan);
  const names = [loc.name, ...urls.map(nameInUrl)];
  // A short link: Google's own name for the place, behind it.
  const short = urls.find(u => MAPS_SHORT.test(u));
  let unopened = false;
  if (short && !names.some(Boolean)) {
    const server = await openOnServer(short);
    unopened = !server;
    names.push(server?.query, nameInUrl(server?.url));
  }
  names.push(plan?.title, typedAddress(plan));
  const pid = await placeIdNear(at, names);
  // Not found while the link didn't open: not an answer, asked again.
  if (!pid && unopened) { const err = new Error('network'); err.network = true; throw err; }
  return pid;
}

// Where a place is, in the order it is most surely right: coordinates in
// one of its links, a short link expanded, its typed address, and only then
// its name (a guess, flagged). The name never comes before a link: a short
// link that could not be expanded (the proxies are flaky) used to leave a
// guess by the name for good (8.88.0).
// `region`: { coords: "lat,lng" of the destination, text: "בודפשט, הונגריה" }.
// `linkOnly`: try the links alone (a guess by name, being tried again).
// → { loc: { lat, lng, src, name?, addr? } | null, offline }: `offline`
// when the answer could not be had now (no network, a call failed), so
// nothing is to be saved.
export async function findPlaceLocation(plan, region = {}, { linkOnly = false } = {}) {
  const urls = placeUrls(plan);
  const pt = (at, src, extra = {}) => {
    const c = parseLatLng(at);
    const loc = { lat: c?.lat, lng: c?.lng, src, ...extra };
    if (loc.pid === undefined) delete loc.pid;   // not looked for (offline)
    return c ? { loc, offline: false } : null;
  };
  // A pin from a link: the place's id too, looked for by its name there.
  // Not found now (offline, a failed call): looked for later (job 'pid').
  const pinned = async (at, names = []) => {
    let pid;
    if (GMAPS_KEY && isOnlineNow()) {
      pid = await placeIdNear(at, [...names, plan?.title]).catch(() => undefined);
    }
    return pt(at, 'link', { pid });
  };
  for (const url of urls) {
    const at = extractCoordsFromMapsUrl(url);
    if (parseLatLng(at)) return pinned(at, [nameInUrl(url)]);
  }
  const shorts = urls.filter(u => MAPS_SHORT.test(u));
  for (const url of shorts) {
    const at = readShortUrlCache(url);
    if (parseLatLng(at)) return pinned(at);
  }
  if (!GMAPS_KEY || !isOnlineNow()) return { loc: null, offline: true };
  let failed = false;
  if (shorts.length) {
    const open = await firstSuccess(shorts.map(url => () => expandShortUrl(url, { anchor: region.coords || null })));
    if (open && parseLatLng(open.at)) return open.pid ? pt(open.at, 'link', { pid: open.pid }) : pinned(open.at, [open.name]);
    failed = true;   // a link we could not open now: not an answer
  }
  if (linkOnly) return { loc: null, offline: failed };

  const anchor = region.coords || null;
  const address = typedAddress(plan);
  try {
    if (address) {
      const r = await searchPlace(address, { anchor, restrict: false });
      const hit = r && pt(r.at, 'address', { pid: r.pid });
      if (hit) return hit;
    }
    const title = (plan?.title || '').trim();
    if (title) {
      const qualifier = (region.text || '').trim();
      const r = await searchPlace(qualifier ? `${title}, ${qualifier}` : title, { anchor, restrict: true });
      const hit = r && pt(r.at, 'title', { name: r.name, addr: r.addr, pid: r.pid });
      if (hit) return hit;
    }
  } catch (err) {
    if (err?.network) return { loc: null, offline: true };
    throw err;
  }
  // Nothing found. With a link that failed to open, that may change.
  return { loc: null, offline: failed };
}

// ── Location resolvers ────────────────────────────────────────────────────────
// Sync read of a previously expanded short URL — lets us resolve a shared
// Maps link while offline, with no network call.
export function readShortUrlCache(url) {
  if (!url) return null;
  try { return localStorage.getItem(SHORT_CACHE + url); } catch { return null; }
}

export function resolveOriginString(hotelDetails, customOrigin, fallbackText) {
  if (customOrigin?.mapsUrl) {
    const c = extractCoordsFromMapsUrl(customOrigin.mapsUrl) || readShortUrlCache(customOrigin.mapsUrl);
    if (c) return c;
  }
  if (hotelDetails?.address?.trim()) return hotelDetails.address.trim();
  if (hotelDetails?.link) {
    const c = extractCoordsFromMapsUrl(hotelDetails.link) || readShortUrlCache(hotelDetails.link);
    if (c) return c;
  }
  // Last resort: use the trip destination (e.g. "בודפשט, הונגריה") so travel
  // times can still be computed from the city centre before a hotel is set.
  if (fallbackText?.trim()) return fallbackText.trim();
  return null;
}

// Best guess at the origin source before anything is fetched. Used only to
// label legacy cached results; fresh results carry their own recorded kind.
export function hasPreciseOrigin(hotelDetails, customOrigin) {
  if (customOrigin?.mapsUrl) return true;
  return !!(hotelDetails?.address?.trim() || hotelDetails?.link || hotelDetails?.name?.trim());
}

// Identity of everything the origin is derived from. When this changes the
// user edited the hotel/origin, so cached travel times must be recomputed.
// 'r2' (8.90.0): measured from the hotel itself, not the road nearest
// its pin, so every time from before is measured again.
export function originFingerprint(hotelDetails, customOrigin, fallbackText) {
  return [
    'r2',
    customOrigin?.mapsUrl || '',
    hotelDetails?.address || '',
    hotelDetails?.link || '',
    hotelDetails?.name || '',
    fallbackText || '',
  ].join('|');
}

// Ordered list of origin candidates, best first. The caller tries each until
// one produces a route, so a wrong address or an unresolvable link silently
// degrades to the next option instead of surfacing an error.
//
// Both hotel inputs are supported: a typed address AND a shared Maps link
// (including short maps.app.goo.gl links, expanded + cached on first use).
export async function buildOriginCandidates(hotelDetails, customOrigin, fallbackText, { online = true } = {}) {
  const out = [];
  const push = (value, kind) => {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v || out.some(c => c.value === v)) return;
    out.push({ value: v, kind });
  };

  // The place at a pin itself, when Google knows it by one of `names`
  // (8.90.0): a route to a point starts from the nearest road.
  const byId = async (at, names, kind) => {
    if (!online || !parseLatLng(at)) return;
    const pid = await placeIdNear(at, names).catch(() => '');
    if (pid) push(PLACE_ID + pid, kind);
  };

  // A Maps link: where it points ({ known, open }), and the place itself
  // first.
  const link = async (url, name, kind) => {
    const known = extractCoordsFromMapsUrl(url) || readShortUrlCache(url);
    const open = online && !known ? await expandShortUrl(url) : null;
    if (open?.pid) push(PLACE_ID + open.pid, kind);
    else await byId(known || open?.at, [nameInUrl(url), open?.name, name], kind);
    return { known, open: open?.at || null };
  };

  // 1. Explicitly chosen custom origin wins.
  if (customOrigin?.mapsUrl) {
    const { known, open } = await link(customOrigin.mapsUrl, customOrigin.name, 'custom');
    push(known, 'custom');
    push(open, 'custom');
  }

  // 2. Hotel — the hotel itself, exact coordinates (free + unambiguous),
  //    then the typed address, then network-resolved forms of the link.
  const hotel = hotelDetails?.link ? await link(hotelDetails.link, hotelDetails.name, 'hotel') : {};
  push(hotel.known, 'hotel');
  push(hotelDetails?.address, 'hotel');
  push(hotel.open, 'hotel');
  // Hotel name + city is a decent geocodable query when address/link fail.
  if (hotelDetails?.name?.trim()) {
    const city = (fallbackText || '').trim();
    push(city ? `${hotelDetails.name.trim()}, ${city}` : hotelDetails.name.trim(), 'hotel');
  }

  // 3. City centre, so something is always shown.
  push(fallbackText, 'city');
  return out;
}

// Coordinates of the trip destination ("בודפשט, הונגריה" → "47.49,19.04"),
// geocoded once and cached in localStorage. Used to scope title lookups.
export async function resolveRegionCoords(destinationText) {
  if (!destinationText?.trim()) return null;
  return await geocodeAddress(destinationText.trim());
}

// ── Geocode a plain text address → coords (cached) ───────────────────────────
const GEO_CACHE = 'gmaps_geo_v1_';
async function geocodeAddress(address) {
  if (!address?.trim() || !GMAPS_KEY) return null;
  const cacheKey = GEO_CACHE + address.trim();
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;
  if (!isOnlineNow()) return null;
  try {
    const res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GMAPS_KEY, 'X-Goog-FieldMask': 'places.location' },
      body: JSON.stringify({ textQuery: address.trim() }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const loc = data?.places?.[0]?.location;
    if (!loc) return null;
    const coords = `${loc.latitude},${loc.longitude}`;
    localStorage.setItem(cacheKey, coords);
    return coords;
  } catch { return null; }
}

// ── Main fetch ────────────────────────────────────────────────────────────────
// Returns { walk, transit } on success, { networkError: true } when the
// connection failed, or null when this origin/destination pair yielded no
// route at all (so the caller can try the next origin candidate).
export async function fetchTravelTimes(origin, destination) {
  if (!GMAPS_KEY || !origin || !destination) return null;
  if (!isOnlineNow()) return { networkError: true };
  try {
    const [walk, transit] = await Promise.all([
      queryRoute(origin, destination, 'WALK'),
      queryRoute(origin, destination, 'TRANSIT'),
    ]);
    if (!walk && !transit) return null;
    return { walk, transit };
  } catch (err) {
    if (err?.network) return { networkError: true };
    return null;
  }
}
