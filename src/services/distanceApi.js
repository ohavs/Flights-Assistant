// Google Maps Routes API (v2) — supports CORS from browsers.
// Replaces the deprecated Distance Matrix API.
// Requires "Routes API" enabled on the API key in Google Cloud Console.

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

export const hasGmapsKey = () => GMAPS_KEY.length > 0;

// ── URL helpers ──────────────────────────────────────────────────────────────
export function extractCoordsFromMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const m1 = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m1) return `${m1[1]},${m1[2]}`;
  const m2 = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m2) return `${m2[1]},${m2[2]}`;
  const m3 = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m3) return `${m3[1]},${m3[2]}`;
  return null;
}

function extractPlaceNameFromMapsUrl(url) {
  if (!url) return null;
  const m = url.match(/google\.com\/maps\/place\/([^/@?]+)/i);
  if (!m) return null;
  try {
    const name = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
    return name.length > 2 ? name : null;
  } catch { return null; }
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
export function resolveOriginString(hotelDetails, customOrigin) {
  if (customOrigin?.mapsUrl) {
    const c = extractCoordsFromMapsUrl(customOrigin.mapsUrl);
    if (c) return c;
    const p = extractPlaceNameFromMapsUrl(customOrigin.mapsUrl);
    if (p) return p;
  }
  if (hotelDetails?.address?.trim()) return hotelDetails.address.trim();
  if (hotelDetails?.link) {
    const c = extractCoordsFromMapsUrl(hotelDetails.link);
    if (c) return c;
    const p = extractPlaceNameFromMapsUrl(hotelDetails.link);
    if (p) return p;
  }
  return null;
}

export function resolveDestinationString(plan) {
  const { address, links, title } = plan;
  if (address && !/^https?:\/\//i.test(address) && address.trim()) return address.trim();
  if (address && /^https?:\/\//i.test(address)) {
    const c = extractCoordsFromMapsUrl(address);
    if (c) return c;
    const p = extractPlaceNameFromMapsUrl(address);
    if (p) return p;
  }
  if (Array.isArray(links)) {
    for (const link of links) {
      const url = link?.url || '';
      if (/google\.com\/maps|maps\.google\./i.test(url)) {
        const c = extractCoordsFromMapsUrl(url);
        if (c) return c;
        const p = extractPlaceNameFromMapsUrl(url);
        if (p) return p;
      }
    }
  }
  if (title?.trim()) return title.trim();
  return null;
}

// ── Main fetch ───────────────────────────────────────────────────────────────
export async function fetchTravelTimes(origin, destination) {
  if (!GMAPS_KEY || !origin || !destination) return null;
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
