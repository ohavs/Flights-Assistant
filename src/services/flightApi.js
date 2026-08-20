// Live flight lookup via AeroDataBox (RapidAPI).
// The API key is loaded from the build-time env var VITE_AERODATABOX_KEY
// (see .env.local, which is gitignored). On Firebase Spark (no Functions)
// the call goes straight from the browser to AeroDataBox.

import { lookupFlight as localLookup } from './flightSimulator';

const API_HOST = 'aerodatabox.p.rapidapi.com';
const API_KEY = import.meta.env.VITE_AERODATABOX_KEY || '';

export function hasApiKey() {
  return API_KEY.length > 0;
}

function tzOffsetFromAirport(apt) {
  if (!apt) return 'UTC +00:00';
  const offsetMin = computeOffsetFromTz(apt.timeZone);
  if (offsetMin != null) {
    const sign = offsetMin >= 0 ? '+' : '-';
    const h = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
    const m = String(Math.abs(offsetMin) % 60).padStart(2, '0');
    return `UTC ${sign}${h}:${m}`;
  }
  return apt.timeZone || 'UTC +00:00';
}

function computeOffsetFromTz(ianaTz) {
  if (!ianaTz || ianaTz.startsWith('UTC')) return null;
  try {
    const now = new Date();
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(now.toLocaleString('en-US', { timeZone: ianaTz }));
    return Math.round((local - utc) / 60000);
  } catch {
    return null;
  }
}

function localTimeTo24(iso) {
  if (!iso) return '';
  const m = String(iso).match(/(\d{2}):(\d{2})/);
  if (!m) return '';
  return `${m[1]}:${m[2]}`;
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
  if (s.includes('divert') || s.includes('delay')) return 'באיחור קל';
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
    scheduledDep: localTimeTo24(dep.scheduledTime && (dep.scheduledTime.local || dep.scheduledTime.utc)),
    actualDep:    localTimeTo24((dep.actualTime || dep.revisedTime || {}).local || (dep.actualTime || dep.revisedTime || {}).utc || (dep.scheduledTime && (dep.scheduledTime.local || dep.scheduledTime.utc))),
    scheduledArr: localTimeTo24(arr.scheduledTime && (arr.scheduledTime.local || arr.scheduledTime.utc)),
    estimatedArr: localTimeTo24((arr.predictedTime || arr.revisedTime || arr.actualTime || {}).local || (arr.predictedTime || arr.revisedTime || arr.actualTime || {}).utc || (arr.scheduledTime && (arr.scheduledTime.local || arr.scheduledTime.utc))),
    status: statusFromApi(api.status),
    gate: dep.gate || arr.gate || '',
    matched: true,
    source: 'api',
  };
}

// Whole days between today and a YYYY-MM-DD date (negative for the past).
function daysAhead(dateStr) {
  if (!dateStr) return 0;
  const target = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return 0;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((target - today) / 86400000);
}

// Beyond roughly this many days the schedule feed generally has nothing yet,
// so an empty result says more about the horizon than about the flight.
const FUTURE_HORIZON_DAYS = 90;

function humaniseHttp(status, body) {
  const snippet = (body || '').slice(0, 140);
  if (status === 401 || status === 403) return `מפתח ה-API לא מאושר (HTTP ${status}). יש להחליף או לחדש את המפתח בקוד. ${snippet}`;
  if (status === 429) return 'חרגנו ממכסת ה-API החודשית (HTTP 429). חיפושים יתחדשו בתחילת החודש הבא.';
  if (status === 404) return 'הטיסה לא נמצאה (HTTP 404).';
  return `שגיאת API (HTTP ${status}). ${snippet}`;
}

// Returns: { flight, status: 'api'|'no-key'|'http-error'|'no-results'|'network-error', code?, message? }
export async function lookupFlightLive(flightNumber, dateStr) {
  const num = String(flightNumber || '').trim().toUpperCase();
  if (!num) return { flight: null, status: 'no-key', message: 'מספר טיסה חסר' };

  const localFallback = () => {
    const r = localLookup(num, dateStr);
    if (r) r.source = 'local';
    return r;
  };

  if (!API_KEY) {
    // No key was bundled into the build — shouldn't happen in production
    // but covers the dev case where .env.local is missing.
    return { flight: localFallback(), status: 'no-key' };
  }

  const date = (dateStr || '').match(/^\d{4}-\d{2}-\d{2}/) ? dateStr.slice(0, 10) : '';
  const url = `https://${API_HOST}/flights/number/${encodeURIComponent(num)}` + (date ? `/${date}` : '');

  try {
    const res = await fetch(url + '?dateLocalRole=Both&withAircraftImage=false&withLocation=true', {
      headers: {
        'X-RapidAPI-Key': API_KEY,
        'X-RapidAPI-Host': API_HOST,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { flight: localFallback(), status: 'http-error', code: res.status, message: humaniseHttp(res.status, text) };
    }

    // AeroDataBox answers "I have nothing for this flight/date" with 204 or a
    // 200 carrying an empty body. Calling res.json() on that throws
    // "Unexpected end of JSON input", which used to surface to the user as a
    // raw English error. Read the body as text first and treat empty as
    // no-results, which is what it actually means.
    const raw = res.status === 204 ? '' : await res.text().catch(() => '');
    const noResults = () => ({
      flight: localFallback(),
      status: 'no-results',
      // A far-future date is the common, benign reason for an empty result:
      // the schedule simply isn't in the data source yet. Saying "wrong flight
      // number" there would send the user looking for a mistake that isn't
      // theirs, so distinguish the two cases.
      message: daysAhead(date) > FUTURE_HORIZON_DAYS
        ? `לוחות הזמנים לתאריך הזה עדיין לא זמינים במאגר (התאריך בעוד כ-${daysAhead(date)} ימים). זה תקין — הנתונים יתעדכנו אוטומטית ככל שנתקרב למועד. בינתיים אפשר למלא את הפרטים ידנית.`
        : 'AeroDataBox לא החזיר תוצאות עבור מספר הטיסה הזה בתאריך שצוין. כדאי לוודא את מספר הטיסה ואת התאריך מול הכרטיס.',
    });
    if (!raw.trim()) return noResults();

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      // A 200 with a body we can't parse is a service-side problem, not
      // something the user can act on — say so in Hebrew rather than leaking
      // the parser's message.
      return {
        flight: localFallback(),
        status: 'http-error',
        code: res.status,
        message: 'התקבלה תשובה לא תקינה משירות הטיסות. נסה שוב מאוחר יותר.',
      };
    }

    const list = Array.isArray(data) ? data : (data && data.flights) || [];
    if (list.length === 0) return noResults();
    return { flight: adaptFlight(list[0]), status: 'api' };
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return {
      flight: localFallback(),
      status: 'network-error',
      message: offline
        ? 'אין חיבור לאינטרנט — מציג נתונים שמורים.'
        : `לא הצלחנו להתחבר לשירות הטיסות (${e?.name || 'שגיאה'}). נסה שוב.`,
    };
  }
}
