// Google Maps Distance Matrix — uses the JS API (not REST) to avoid CORS.
// The Maps JS library is loaded lazily on first call.

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

export const hasGmapsKey = () => GMAPS_KEY.length > 0;

// ── Lazy loader ──────────────────────────────────────────────────────────────
let loadPromise = null;

function loadGoogleMaps() {
  if (window.google?.maps?.DistanceMatrixService) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const cb = `_gmcb_${Date.now()}`;
    window[cb] = () => { delete window[cb]; resolve(); };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&callback=${cb}&loading=async`;
    s.onerror = () => { loadPromise = null; reject(new Error('Maps load failed')); };
    document.head.appendChild(s);
  });
  return loadPromise;
}

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
    await loadGoogleMaps();
    const svc = new window.google.maps.DistanceMatrixService();

    const query = (mode, extra = {}) => new Promise((resolve) => {
      svc.getDistanceMatrix(
        { origins: [origin], destinations: [destination], travelMode: mode, language: 'he', ...extra },
        (res, status) => {
          if (status !== 'OK') { resolve(null); return; }
          const el = res?.rows?.[0]?.elements?.[0];
          resolve(el?.status === 'OK'
            ? { duration: el.duration.text, distance: el.distance.text }
            : null);
        }
      );
    });

    const [walk, transit] = await Promise.all([
      query(window.google.maps.TravelMode.WALKING),
      query(window.google.maps.TravelMode.TRANSIT, { transitOptions: { departureTime: new Date() } }),
    ]);

    return { walk, transit };
  } catch {
    return null;
  }
}
