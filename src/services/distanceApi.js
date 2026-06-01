// Google Maps Routes API (v2) — supports CORS from browsers.
// Replaces the deprecated Distance Matrix API.
// Requires "Routes API" enabled on the API key in Google Cloud Console.

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

export const hasGmapsKey = () => GMAPS_KEY.length > 0;

// ── URL helpers ──────────────────────────────────────────────────────────────
export function extractCoordsFromMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  // @lat,lng,zoom  (standard full Google Maps URL)
  const m1 = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m1) return `${m1[1]},${m1[2]}`;
  // ?q=lat,lng
  const m2 = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m2) return `${m2[1]},${m2[2]}`;
  // ?ll=lat,lng
  const m3 = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m3) return `${m3[1]},${m3[2]}`;
  // !3dlat!4dlng  (embedded in Google Maps data= parameter)
  const m4 = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m4) return `${m4[1]},${m4[2]}`;
  return null;
}

function extractPlaceNameFromMapsUrl(url) {
  if (!url) return null;
  // /maps/place/NAME  or  /maps/search/NAME
  const mPlace = url.match(/\/maps\/(?:place|search)\/([^/@?]+)/i);
  if (mPlace) {
    try {
      const name = decodeURIComponent(mPlace[1].replace(/\+/g, ' ')).trim();
      if (name.length > 2) return name;
    } catch { /* ignore */ }
  }
  // ?q=TEXT  (non-coordinate search query)
  const mq = url.match(/[?&]q=([^&]+)/);
  if (mq) {
    try {
      const decoded = decodeURIComponent(mq[1].replace(/\+/g, ' ')).trim();
      if (decoded.length > 2 && !/^-?\d+\.\d+,-?\d+\.\d+$/.test(decoded)) return decoded;
    } catch { /* ignore */ }
  }
  return null;
}

// Returns true for any recognised Google Maps URL (including short links)
function isMapsUrl(url) {
  return /google\.com\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url);
}

// Build a Routes API waypoint object from an address string or "lat,lng"
function toWaypoint(str) {
  const coords = str.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
  if (coords) {
    return { location: { latLng: { latitude: parseFloat(coords[1]), longitude: parseFloat(coords[2]) } } };
  }
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
  const body = {
    origin: toWaypoint(origin),
    destination: toWaypoint(destination),
    travelMode,
  };
  const res = await fetch(`${ROUTES_URL}?key=${GMAPS_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.warn(`[Routes API] ${travelMode} → HTTP ${res.status}:`, txt.slice(0, 400));
    return null;
  }
  const data = await res.json();
  const route = data?.routes?.[0];
  if (!route) return null;
  const secs = parseInt(String(route.duration || '0s').replace('s', '')) || 0;
  return {
    duration: fmtDuration(secs),
    distance: fmtDistance(route.distanceMeters || 0),
  };
}

// ── Origin / destination resolvers ───────────────────────────────────────────

// Try every extraction strategy on a URL; return coords or name if found.
function extractLocationFromUrl(url) {
  const c = extractCoordsFromMapsUrl(url);
  if (c) return c;
  const p = extractPlaceNameFromMapsUrl(url);
  if (p) return p;
  return null;
}

export function resolveOriginString(hotelDetails, customOrigin) {
  if (customOrigin?.mapsUrl) {
    const loc = extractLocationFromUrl(customOrigin.mapsUrl);
    if (loc) return loc;
  }
  if (hotelDetails?.address?.trim()) return hotelDetails.address.trim();
  if (hotelDetails?.link) {
    const loc = extractLocationFromUrl(hotelDetails.link);
    if (loc) return loc;
  }
  return null;
}

export function resolveDestinationString(plan) {
  const { address, links } = plan;
  // Note: plan.title is intentionally NOT used — Hebrew/ambiguous titles
  // cause wrong geocoding results. Only explicit addresses or URL-embedded
  // coordinates are reliable.

  // Plain text address field (user explicitly typed it, not a URL)
  if (address && !/^https?:\/\//i.test(address) && address.trim()) {
    return address.trim();
  }

  // Address field contains a URL — only use extracted coordinates (not place names)
  if (address && /^https?:\/\//i.test(address)) {
    const c = extractCoordsFromMapsUrl(address);
    if (c) return c;
  }

  // Links array — try coordinates from every URL (Maps or otherwise)
  if (Array.isArray(links)) {
    for (const link of links) {
      const c = extractCoordsFromMapsUrl(link?.url || '');
      if (c) return c;
    }
  }

  // Nothing usable found → caller will set noLocation: true
  return null;
}

// Try to follow a short Google Maps URL and extract coordinates.
// Short links (maps.app.goo.gl, goo.gl/maps) don't embed coordinates — we
// fetch them, follow the redirect, and extract coords from the final URL.
async function tryExpandShortMapsUrl(url) {
  if (!url || !/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) return null;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });
    // If CORS is allowed, res.url holds the final URL after redirect
    if (res.url && res.url !== url) {
      const c = extractCoordsFromMapsUrl(res.url);
      if (c) return c;
    }
    // Parse HTML for og:url meta tag (may contain full Maps URL with coords)
    const html = await res.text();
    const og = html.match(/property=["']og:url["'][^>]*content=["']([^"']+)["']/i)
              || html.match(/content=["']([^"']+)["'][^>]*property=["']og:url["']/i);
    if (og) {
      const c = extractCoordsFromMapsUrl(og[1]);
      if (c) return c;
    }
  } catch { /* CORS blocked or network error — fall through */ }
  return null;
}

// Async resolver: first tries synchronous extraction, then attempts short-URL expansion.
export async function resolveDestinationAsync(plan) {
  const sync = resolveDestinationString(plan);
  if (sync) return sync;

  const urls = [];
  if (plan.address && /^https?:\/\//i.test(plan.address)) urls.push(plan.address);
  if (Array.isArray(plan.links)) plan.links.forEach(l => l?.url && urls.push(l.url));

  for (const url of urls) {
    const c = await tryExpandShortMapsUrl(url);
    if (c) return c;
  }
  return null;
}

// ── Main fetch ───────────────────────────────────────────────────────────────
export async function fetchTravelTimes(origin, destination) {
  if (!GMAPS_KEY || !origin || !destination) return null;
  console.log('[Routes API] origin:', origin, '| destination:', destination);
  try {
    const [walk, transit] = await Promise.all([
      queryRoute(origin, destination, 'WALK'),
      queryRoute(origin, destination, 'TRANSIT'),
    ]);
    return { walk, transit };
  } catch {
    return null;
  }
}
