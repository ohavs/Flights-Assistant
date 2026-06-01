// Google Maps Routes API (v2) — supports CORS from browsers.
// Requires "Routes API" enabled on the API key in Google Cloud Console.
//
// How location resolution works:
// - Origin: hotel text address, OR coordinates from a full Maps URL (@lat,lng)
// - Destination: plan item text address, OR coordinates from a full Maps URL
// - Short mobile URLs (maps.app.goo.gl) cannot be used — Google blocks cross-origin
//   access to them. Users should enter a text address OR paste the full desktop URL.

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

export const hasGmapsKey = () => GMAPS_KEY.length > 0;

// ── Coordinate extraction from full Google Maps URLs ──────────────────────────
export function extractCoordsFromMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  // @lat,lng  (standard desktop Maps URL)
  const m1 = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m1) return `${m1[1]},${m1[2]}`;
  // ?q=lat,lng
  const m2 = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m2) return `${m2[1]},${m2[2]}`;
  // ?ll=lat,lng
  const m3 = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m3) return `${m3[1]},${m3[2]}`;
  // !3dlat!4dlng  (embedded in Maps data= parameter)
  const m4 = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m4) return `${m4[1]},${m4[2]}`;
  return null;
}

// Build a Routes API waypoint from a "lat,lng" string or a text address
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
  const res = await fetch(`${ROUTES_URL}?key=${GMAPS_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: toWaypoint(origin),
      destination: toWaypoint(destination),
      travelMode,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const route = data?.routes?.[0];
  if (!route) return null;
  const secs = parseInt(String(route.duration || '0s').replace('s', '')) || 0;
  return {
    duration: fmtDuration(secs),
    distance: fmtDistance(route.distanceMeters || 0),
  };
}

// ── Location resolvers ────────────────────────────────────────────────────────

// Resolve origin: prefer custom origin coords, then hotel text address, then hotel link coords
export function resolveOriginString(hotelDetails, customOrigin) {
  if (customOrigin?.mapsUrl) {
    const c = extractCoordsFromMapsUrl(customOrigin.mapsUrl);
    if (c) return c;
  }
  if (hotelDetails?.address?.trim()) return hotelDetails.address.trim();
  if (hotelDetails?.link) {
    const c = extractCoordsFromMapsUrl(hotelDetails.link);
    if (c) return c;
  }
  return null;
}

// Resolve destination from a plan item.
// Returns: text address, OR lat,lng string from a full Maps URL, OR null.
// Note: short mobile URLs (maps.app.goo.gl) return null — Google blocks
// cross-origin access to them from browsers. Use a text address instead.
export function resolveDestinationString(plan) {
  const { address, links } = plan;

  // Text address in the address field — most reliable
  if (address && !/^https?:\/\//i.test(address) && address.trim()) {
    return address.trim();
  }

  // Full Maps URL in the address field — try to extract coordinates
  if (address && /^https?:\/\//i.test(address)) {
    const c = extractCoordsFromMapsUrl(address);
    if (c) return c;
  }

  // Links — try to extract coordinates from any link URL
  if (Array.isArray(links)) {
    for (const link of links) {
      const c = extractCoordsFromMapsUrl(link?.url || '');
      if (c) return c;
    }
  }

  return null;
}

// ── Main fetch ────────────────────────────────────────────────────────────────
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
