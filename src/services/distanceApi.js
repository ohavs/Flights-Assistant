// Google Maps Distance Matrix API — browser-side calls.
// Key loaded from VITE_GOOGLE_MAPS_KEY at build time.

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

export const hasGmapsKey = () => GMAPS_KEY.length > 0;

// Extract "lat,lng" from any Google Maps URL form
export function extractCoordsFromMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  // /@lat,lng,zoom
  const m1 = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m1) return `${m1[1]},${m1[2]}`;
  // ?q=lat,lng
  const m2 = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m2) return `${m2[1]},${m2[2]}`;
  // ll=lat,lng (older format)
  const m3 = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m3) return `${m3[1]},${m3[2]}`;
  return null;
}

// Extract a place name from a google.com/maps/place/PLACE_NAME/... URL
function extractPlaceNameFromMapsUrl(url) {
  if (!url) return null;
  const m = url.match(/google\.com\/maps\/place\/([^/@?]+)/i);
  if (!m) return null;
  try {
    const name = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
    return name.length > 2 ? name : null;
  } catch {
    return null;
  }
}

// Build an origin string from hotelDetails or a custom origin object
export function resolveOriginString(hotelDetails, customOrigin) {
  if (customOrigin?.mapsUrl) {
    const coords = extractCoordsFromMapsUrl(customOrigin.mapsUrl);
    if (coords) return coords;
    const place = extractPlaceNameFromMapsUrl(customOrigin.mapsUrl);
    if (place) return place;
  }
  if (hotelDetails?.address?.trim()) return hotelDetails.address.trim();
  if (hotelDetails?.link) {
    const coords = extractCoordsFromMapsUrl(hotelDetails.link);
    if (coords) return coords;
    const place = extractPlaceNameFromMapsUrl(hotelDetails.link);
    if (place) return place;
  }
  return null;
}

// Build a destination string from a planning item.
// Returns a string (address / coords / place name) or null if unresolvable.
export function resolveDestinationString(plan) {
  const { address, links, title } = plan;

  // 1. Plain-text address in the address field → best option
  if (address && !/^https?:\/\//i.test(address) && address.trim()) {
    return address.trim();
  }

  // 2. URL in the address field → try coords then place name
  if (address && /^https?:\/\//i.test(address)) {
    const coords = extractCoordsFromMapsUrl(address);
    if (coords) return coords;
    const place = extractPlaceNameFromMapsUrl(address);
    if (place) return place;
    // don't return — fall through to links
  }

  // 3. Links array — try any Google Maps URL
  if (Array.isArray(links)) {
    for (const link of links) {
      const url = link?.url || '';
      if (/google\.com\/maps|maps\.google\./i.test(url)) {
        const coords = extractCoordsFromMapsUrl(url);
        if (coords) return coords;
        const place = extractPlaceNameFromMapsUrl(url);
        if (place) return place;
      }
    }
  }

  // 4. Last resort: plan title (Distance Matrix API can geocode place names)
  if (title?.trim()) return title.trim();

  return null;
}

// Returns { walk: {duration, distance} | null, transit: {duration, distance} | null }
// or null on total failure.
export async function fetchTravelTimes(origin, destination) {
  if (!GMAPS_KEY || !origin || !destination) return null;
  const deptTime = Math.floor(Date.now() / 1000);

  const makeUrl = (mode) => {
    const p = new URLSearchParams({
      origins: origin,
      destinations: destination,
      mode,
      key: GMAPS_KEY,
      language: 'he',
    });
    if (mode === 'transit') p.set('departure_time', String(deptTime));
    return `https://maps.googleapis.com/maps/api/distancematrix/json?${p}`;
  };

  const parse = async (res) => {
    if (!res.ok) return null;
    const data = await res.json();
    const el = data?.rows?.[0]?.elements?.[0];
    if (!el || el.status !== 'OK') return null;
    return { duration: el.duration.text, distance: el.distance.text };
  };

  try {
    const [wr, tr] = await Promise.all([
      fetch(makeUrl('walking')),
      fetch(makeUrl('transit')),
    ]);
    const [walk, transit] = await Promise.all([parse(wr), parse(tr)]);
    return { walk, transit };
  } catch {
    return null;
  }
}
