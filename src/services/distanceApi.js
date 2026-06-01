// Google Maps Routes API (v2) + Places API (New) — both support browser CORS.
// Requires "Routes API" and "Places API" enabled on the API key.
//
// Destination resolution priority:
// 1. Text address in plan.address field
// 2. Coordinates from a full Maps URL (with @lat,lng)
// 3. Places Text Search using the plan title + hotel location as bias  ← handles short URLs

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
const ROUTES_URL  = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const PLACES_URL  = 'https://places.googleapis.com/v1/places:searchText';
const PLACE_CACHE = 'gmaps_place_v2_'; // localStorage prefix (v2 = with location context)

export const hasGmapsKey = () => GMAPS_KEY.length > 0;

// ── Coordinate extraction from full Google Maps URLs ──────────────────────────
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

// ── Routes API helpers ────────────────────────────────────────────────────────
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
  return { duration: fmtDuration(secs), distance: fmtDistance(route.distanceMeters || 0) };
}

// ── Places API: find coordinates for a place name ─────────────────────────────
// Results cached in localStorage by planId so each place is looked up only once.
async function findPlaceCoords(planId, title, origin) {
  if (!title?.trim() || !GMAPS_KEY) return null;

  const cacheKey = PLACE_CACHE + planId;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;

  try {
    const body = {};

    // Check whether origin is "lat,lng" coordinates or a text address
    const coordMatch = origin?.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
    if (coordMatch) {
      // Use coordinates as location bias (50 km radius)
      body.locationBias = {
        circle: {
          center: { latitude: parseFloat(coordMatch[1]), longitude: parseFloat(coordMatch[2]) },
          radius: 50000,
        },
      };
      body.textQuery = title.trim();
    } else if (origin) {
      // Hotel has a text address — extract country/city (last comma-separated part)
      // and append it to make the search location-aware.
      const parts = origin.split(',').map(s => s.trim()).filter(Boolean);
      const hint = parts[parts.length - 1]; // e.g. "Czechia" or "Praha 1"
      body.textQuery = hint ? `${title.trim()}, ${hint}` : title.trim();
    } else {
      body.textQuery = title.trim();
    }

    const res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GMAPS_KEY,
        'X-Goog-FieldMask': 'places.location',
      },
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

function resolveDestinationSync(plan) {
  const { address, links } = plan;
  if (address && !/^https?:\/\//i.test(address) && address.trim()) return address.trim();
  if (address && /^https?:\/\//i.test(address)) {
    const c = extractCoordsFromMapsUrl(address);
    if (c) return c;
  }
  if (Array.isArray(links)) {
    for (const link of links) {
      const c = extractCoordsFromMapsUrl(link?.url || '');
      if (c) return c;
    }
  }
  return null;
}

// Async resolver: sync extraction first, then Places Search fallback.
// originCoords is used as location bias for the Places Search ("near the hotel").
export async function resolveDestinationAsync(plan, originCoords) {
  const sync = resolveDestinationSync(plan);
  if (sync) return sync;
  // Fall back to Places Text Search with the plan title + hotel location bias
  return findPlaceCoords(plan.id, plan.title, originCoords);
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
  } catch { return null; }
}
