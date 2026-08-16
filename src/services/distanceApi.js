// Google Maps Routes API (v2) + Places API (New) — both support browser CORS.
// Requires "Routes API" and "Places API (New)" enabled on the API key.
//
// Destination resolution order:
// 1. Text address in plan.address field
// 2. Coordinates embedded in a full Maps URL (@lat,lng / !3dlat!4dlng)
// 3. Follow the short URL (maps.app.goo.gl) via CORS proxy → extract coords
// 4. Places Text Search by title + location context (last resort)

const GMAPS_KEY   = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
const ROUTES_URL  = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const PLACES_URL  = 'https://places.googleapis.com/v1/places:searchText';
const SHORT_CACHE = 'gmaps_short_v1_';  // short-URL expansion results
const PLACE_CACHE = 'gmaps_place_v2_';  // Places-search results

export const hasGmapsKey = () => GMAPS_KEY.length > 0;

export const isOnlineNow = () =>
  (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

// ── Coordinate extraction from URLs ──────────────────────────────────────────
export function extractCoordsFromMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const m1 = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m1) return `${m1[1]},${m1[2]}`;
  const m2 = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m2) return `${m2[1]},${m2[2]}`;
  const m3 = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m3) return `${m3[1]},${m3[2]}`;
  const m4 = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m4) return `${m4[1]},${m4[2]}`;
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

// ── Short-URL expansion via CORS proxies ──────────────────────────────────────
async function tryProxy(proxyUrl) {
  try {
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
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

async function expandShortUrl(url) {
  if (!url || !/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) return null;

  const cacheKey = SHORT_CACHE + url;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;
  // Offline: the cache above is all we can offer — don't wait on timeouts.
  if (!isOnlineNow()) return null;

  const enc = encodeURIComponent(url);
  // Try both proxies in parallel; use whichever succeeds first
  const results = await Promise.allSettled([
    tryProxy(`https://api.allorigins.win/get?url=${enc}`),
    tryProxy(`https://corsproxy.io/?url=${enc}`),
  ]);
  const coords = results.find(r => r.status === 'fulfilled' && r.value)?.value ?? null;
  if (coords) localStorage.setItem(cacheKey, coords);
  return coords;
}

// ── Routes API helpers ────────────────────────────────────────────────────────
function toWaypoint(str) {
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

// Parse a "lat,lng" string into numeric coordinates.
export function parseLatLng(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

// ── Places API: geocode by title when all else fails ─────────────────────────
async function findPlaceCoords(planId, title, origin) {
  if (!title?.trim() || !GMAPS_KEY) return null;
  const cacheKey = PLACE_CACHE + planId;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;
  if (!isOnlineNow()) return null;

  try {
    const body = {};
    const coordMatch = origin?.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
    if (coordMatch) {
      body.locationBias = {
        circle: { center: { latitude: parseFloat(coordMatch[1]), longitude: parseFloat(coordMatch[2]) }, radius: 50000 },
      };
      body.textQuery = title.trim();
    } else if (origin) {
      const parts = origin.split(',').map(s => s.trim()).filter(Boolean);
      const hint = parts[parts.length - 1];
      body.textQuery = hint ? `${title.trim()}, ${hint}` : title.trim();
    } else {
      body.textQuery = title.trim();
    }

    const res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GMAPS_KEY, 'X-Goog-FieldMask': 'places.location' },
      body: JSON.stringify(body),
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
export function originFingerprint(hotelDetails, customOrigin, fallbackText) {
  return [
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

  // 1. Explicitly chosen custom origin wins.
  if (customOrigin?.mapsUrl) {
    push(extractCoordsFromMapsUrl(customOrigin.mapsUrl), 'custom');
    push(readShortUrlCache(customOrigin.mapsUrl), 'custom');
    if (online) push(await expandShortUrl(customOrigin.mapsUrl), 'custom');
  }

  // 2. Hotel — exact coordinates first (free + unambiguous), then the typed
  //    address, then network-resolved forms of the link.
  if (hotelDetails?.link) {
    push(extractCoordsFromMapsUrl(hotelDetails.link), 'hotel');
    push(readShortUrlCache(hotelDetails.link), 'hotel');
  }
  push(hotelDetails?.address, 'hotel');
  if (online && hotelDetails?.link) {
    push(await expandShortUrl(hotelDetails.link), 'hotel');
  }
  // Hotel name + city is a decent geocodable query when address/link fail.
  if (hotelDetails?.name?.trim()) {
    const city = (fallbackText || '').trim();
    push(city ? `${hotelDetails.name.trim()}, ${city}` : hotelDetails.name.trim(), 'hotel');
  }

  // 3. City centre, so something is always shown.
  push(fallbackText, 'city');
  return out;
}

// Sync fast-path: text address or embedded coords in URL
function resolveDestinationSync(plan) {
  const { address, links } = plan;
  if (address && !/^https?:\/\//i.test(address) && address.trim()) return address.trim();
  if (address && /^https?:\/\//i.test(address)) {
    const c = extractCoordsFromMapsUrl(address); if (c) return c;
  }
  if (Array.isArray(links)) {
    for (const link of links) {
      const c = extractCoordsFromMapsUrl(link?.url || ''); if (c) return c;
    }
  }
  return null;
}

// Async resolver with fast cache checks + parallel fallback
export async function resolveDestinationAsync(plan, origin) {
  // 1. Instant: text address or embedded coords
  const sync = resolveDestinationSync(plan);
  if (sync) return sync;

  // 2. Instant: check both caches before any network call
  const urls = [];
  if (plan.address && /^https?:\/\//i.test(plan.address)) urls.push(plan.address);
  if (Array.isArray(plan.links)) plan.links.forEach(l => l?.url && urls.push(l.url));

  for (const url of urls) {
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) {
      const hit = localStorage.getItem(SHORT_CACHE + url);
      if (hit) return hit;
    }
  }
  const placeHit = localStorage.getItem(PLACE_CACHE + plan.id);
  if (placeHit) return placeHit;

  // 3. Nothing cached — run proxy expansion AND Places Search in parallel,
  //    take whichever succeeds first.
  const proxyRace = (async () => {
    for (const url of urls) {
      const c = await expandShortUrl(url);
      if (c) return c;
    }
    return null;
  })();
  const placesRace = findPlaceCoords(plan.id, plan.title, origin);

  try {
    return await Promise.any([
      proxyRace.then(c => { if (!c) throw new Error(); return c; }),
      placesRace.then(c => { if (!c) throw new Error(); return c; }),
    ]);
  } catch {
    return null;
  }
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

// Resolve a plan to numeric {lat,lng} for proximity clustering.
// Uses every cheap source first (embedded coords, cached expansions/places),
// and only geocodes a plain address as a last resort.
export async function resolvePlanCoords(plan, origin) {
  const direct = parseLatLng(resolveDestinationSync(plan));
  if (direct) return direct;
  const resolved = await resolveDestinationAsync(plan, origin);
  const c = parseLatLng(resolved);
  if (c) return c;
  if (resolved) {
    const geo = parseLatLng(await geocodeAddress(resolved));
    if (geo) return geo;
  }
  return null;
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
