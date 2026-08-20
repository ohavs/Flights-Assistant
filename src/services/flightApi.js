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
    // Local departure date (YYYY-MM-DD) as the API reports it — used to tell
    // the user which date this flight number actually operates on.
    date: String((dep.scheduledTime && (dep.scheduledTime.local || dep.scheduledTime.utc)) || '').slice(0, 10),
    matched: true,
    source: 'api',
  };
}

// "W6 2329" / "w6-2329" → "W62329". Airlines print the designator with a
// space; the API expects it without one.
export function normaliseFlightNumber(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
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
  // AeroDataBox matches the compact IATA designator ("W62329"), so anything
  // the user typed with a space or dash ("W6 2329", "W6-2329") has to be
  // normalised first — otherwise the request asks for "W6%202329", matches
  // nothing, and comes back empty. adaptFlight() already stores numbers this
  // way, so a flight that was looked up once would work while the same flight
  // typed by hand would not.
  const num = normaliseFlightNumber(flightNumber);
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

  // One call to the flights-by-number endpoint. Returns { list } on success,
  // or { fail } holding the wrapper to hand back to the caller.
  const queryApi = async (forDate) => {
    const url = `https://${API_HOST}/flights/number/${encodeURIComponent(num)}` + (forDate ? `/${forDate}` : '');
    const res = await fetch(url + '?dateLocalRole=Both&withAircraftImage=false&withLocation=true', {
      headers: { 'X-RapidAPI-Key': API_KEY, 'X-RapidAPI-Host': API_HOST },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { fail: { flight: localFallback(), status: 'http-error', code: res.status, message: humaniseHttp(res.status, text) } };
    }
    // "Nothing for this flight/date" comes back as 204, or as 200 with an
    // empty body. res.json() on that throws "Unexpected end of JSON input",
    // which used to surface as a raw English error — so read text first.
    const raw = res.status === 204 ? '' : await res.text().catch(() => '');
    if (!raw.trim()) return { list: [] };
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return { fail: { flight: localFallback(), status: 'http-error', code: res.status,
        message: 'התקבלה תשובה לא תקינה משירות הטיסות. נסה שוב מאוחר יותר.' } };
    }
    return { list: Array.isArray(data) ? data : (data && data.flights) || [] };
  };

  try {
    const first = await queryApi(date);
    if (first.fail) return first.fail;
    if (first.list.length > 0) return { flight: adaptFlight(first.list[0]), status: 'api' };

    // Nothing on that date. Ask the same endpoint without a date, which
    // returns the nearest known operation of this flight number. That
    // separates the two cases the user otherwise can't tell apart:
    // an unknown flight number, versus a valid one that simply doesn't
    // operate on the requested date.
    if (date) {
      const probe = await queryApi('');
      if (!probe.fail && probe.list.length > 0) {
        const near = adaptFlight(probe.list[0]);
        return {
          flight: localFallback(),
          status: 'no-results',
          knownDate: near.date || '',
          message: near.date
            ? `מספר הטיסה ${num} קיים במאגר, אבל לא בתאריך שביקשת. התאריך הקרוב שנמצא עבורו הוא ${near.date.split('-').reverse().join('/')} — כנראה שהטיסה לא מופעלת בכל יום.`
            : `מספר הטיסה ${num} קיים במאגר, אבל אין לו תוצאה בתאריך שביקשת — כנראה שהטיסה לא מופעלת באותו יום.`,
        };
      }
      if (!probe.fail) {
        // Not found on the date and not found at all → the number itself is
        // not in the database, whatever the date.
        return {
          flight: localFallback(),
          status: 'no-results',
          message: `מספר הטיסה ${num} לא נמצא במאגר של AeroDataBox באף תאריך. ייתכן שהוא מופעל בפועל תחת מספר אחר (code-share), או שהמאגר לא מכסה את הטיסה הזו. כדאי להשוות למספר שמופיע בכרטיס העלייה למטוס.`,
        };
      }
    }

    return {
      flight: localFallback(),
      status: 'no-results',
      message: daysAhead(date) > FUTURE_HORIZON_DAYS
        ? `לוחות הזמנים לתאריך הזה עדיין לא זמינים במאגר (התאריך בעוד כ-${daysAhead(date)} ימים). זה תקין — הנתונים יתעדכנו אוטומטית ככל שנתקרב למועד. בינתיים אפשר למלא את הפרטים ידנית.`
        : 'AeroDataBox לא החזיר תוצאות עבור מספר הטיסה הזה בתאריך שצוין. כדאי לוודא את מספר הטיסה ואת התאריך מול הכרטיס.',
    };
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
