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
  return null;
}

// Build an origin string from hotelDetails or a custom origin object
export function resolveOriginString(hotelDetails, customOrigin) {
  if (customOrigin?.mapsUrl) {
    const coords = extractCoordsFromMapsUrl(customOrigin.mapsUrl);
    if (coords) return coords;
  }
  if (hotelDetails?.address?.trim()) return hotelDetails.address.trim();
  if (hotelDetails?.link) {
    const coords = extractCoordsFromMapsUrl(hotelDetails.link);
    if (coords) return coords;
  }
  return null;
}

// Build a destination string from a planning item
export function resolveDestinationString(plan) {
  const { address, links } = plan;
  if (address) {
    const isUrl = /^https?:\/\//i.test(address);
    if (isUrl) return extractCoordsFromMapsUrl(address);
    return address.trim() || null;
  }
  if (Array.isArray(links)) {
    for (const link of links) {
      if (/maps\.google\.|google\.com\/maps/i.test(link?.url || '')) {
        const coords = extractCoordsFromMapsUrl(link.url);
        if (coords) return coords;
      }
    }
  }
  return null;
}

// Returns { walk: {duration, distance} | null, transit: {duration, distance} | null }
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
