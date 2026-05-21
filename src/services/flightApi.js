// Live flight lookup via AeroDataBox (RapidAPI). Falls back to the local
// simulator when no key is configured or the request fails.
//
// API key is read from localStorage so users can configure it at runtime
// without redeploying. They get one free at https://rapidapi.com/aedbx-aedbx
// (aerodatabox) — free tier = 500 requests/month over HTTPS with CORS.

import { lookupFlight as localLookup } from './flightSimulator';

const API_KEY_STORAGE = 'aerodataboxApiKey';
const API_HOST = 'aerodatabox.p.rapidapi.com';

export function getApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE, key.trim());
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

export function hasApiKey() {
  return getApiKey().length > 0;
}

// Map AeroDataBox airport timezone (e.g. "Europe/Prague") to UTC offset string.
function tzOffsetFromAirport(apt) {
  if (!apt) return 'UTC +00:00';
  const offsetMin = apt.timeZone && apt.timeZone.startsWith('UTC')
    ? null
    : computeOffsetFromTz(apt.timeZone);
  if (offsetMin != null) {
    const sign = offsetMin >= 0 ? '+' : '-';
    const h = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
    const m = String(Math.abs(offsetMin) % 60).padStart(2, '0');
    return `UTC ${sign}${h}:${m}`;
  }
  return apt.timeZone || 'UTC +00:00';
}

function computeOffsetFromTz(ianaTz) {
  if (!ianaTz) return null;
  try {
    const now = new Date();
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(now.toLocaleString('en-US', { timeZone: ianaTz }));
    return Math.round((local - utc) / 60000);
  } catch {
    return null;
  }
}

// Convert a local "YYYY-MM-DDTHH:MM" string to a "HH:MM AM/PM" string,
// preserving the local airport time (not converting to user's TZ).
function localTimeToAmPm(iso) {
  if (!iso) return '';
  // AeroDataBox local times are like "2024-05-21 07:30+02:00" or ISO
  const m = String(iso).match(/(\d{2}):(\d{2})/);
  if (!m) return '';
  const h24 = parseInt(m[1], 10);
  const min = m[2];
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = String(((h24 + 11) % 12) + 1).padStart(2, '0');
  return `${h12}:${min} ${period}`;
}

function pickAirport(side) {
  if (!side) return null;
  const apt = side.airport || {};
  return {
    code: apt.iata || apt.icao || '',
    city: apt.municipalityName || apt.shortName || '',
    name: apt.name || '',
    lat: (apt.location && apt.location.lat) || 0,
    lng: (apt.location && apt.location.lon) || 0,
    timezone: tzOffsetFromAirport(apt),
  };
}

function statusFromApi(apiStatus) {
  if (!apiStatus) return 'בזמן';
  const s = String(apiStatus).toLowerCase();
  if (s.includes('cancel')) return 'בוטלה';
  if (s.includes('divert') || s.includes('delay')) {
    // We don't know severity; conservative
    return 'באיחור קל';
  }
  if (s.includes('arriv') || s.includes('landed')) return 'נחתה';
  if (s.includes('en route') || s.includes('inair') || s.includes('flight')) return 'בטיסה';
  return 'בזמן';
}

function adaptFlight(api) {
  const dep = api.departure || {};
  const arr = api.arrival || {};
  return {
    flightNumber: (api.number || api.callSign || '').replace(/\s+/g, ''),
    airline: (api.airline && api.airline.name) || '',
    depAirport: pickAirport(api.departure) || { code: '', city: '', name: '', lat: 0, lng: 0, timezone: 'UTC +00:00' },
    arrAirport: pickAirport(api.arrival) || { code: '', city: '', name: '', lat: 0, lng: 0, timezone: 'UTC +00:00' },
    scheduledDep: localTimeToAmPm(dep.scheduledTime && (dep.scheduledTime.local || dep.scheduledTime.utc)),
    actualDep:    localTimeToAmPm((dep.actualTime || dep.revisedTime || {}).local || (dep.actualTime || dep.revisedTime || {}).utc || (dep.scheduledTime && (dep.scheduledTime.local || dep.scheduledTime.utc))),
    scheduledArr: localTimeToAmPm(arr.scheduledTime && (arr.scheduledTime.local || arr.scheduledTime.utc)),
    estimatedArr: localTimeToAmPm((arr.predictedTime || arr.revisedTime || arr.actualTime || {}).local || (arr.predictedTime || arr.revisedTime || arr.actualTime || {}).utc || (arr.scheduledTime && (arr.scheduledTime.local || arr.scheduledTime.utc))),
    status: statusFromApi(api.status),
    gate: dep.gate || arr.gate || '',
    matched: true,
    source: 'api',
  };
}

export async function lookupFlightLive(flightNumber, dateStr) {
  const num = String(flightNumber || '').trim().toUpperCase();
  if (!num) return null;

  const key = getApiKey();
  const fallback = () => {
    const r = localLookup(num, dateStr);
    if (r) r.source = 'local';
    return r;
  };

  if (!key) return fallback();

  try {
    // AeroDataBox flight-by-number endpoint:
    // GET /flights/number/{number}/{YYYY-MM-DD}
    const date = (dateStr || '').match(/^\d{4}-\d{2}-\d{2}/) ? dateStr.slice(0, 10) : '';
    const url = `https://${API_HOST}/flights/number/${encodeURIComponent(num)}` + (date ? `/${date}` : '');
    const res = await fetch(url + '?dateLocalRole=Both&withAircraftImage=false&withLocation=true', {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': API_HOST,
      },
    });
    if (!res.ok) {
      console.warn('AeroDataBox response not ok:', res.status);
      return fallback();
    }
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data && data.flights) || [];
    if (list.length === 0) return fallback();
    // Pick the first flight (could be multiple operating dates)
    return adaptFlight(list[0]);
  } catch (e) {
    console.warn('Live flight lookup failed:', e);
    return fallback();
  }
}
