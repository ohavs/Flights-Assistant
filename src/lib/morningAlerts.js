// The morning summary — pure, tested on its own (tests/morningAlerts.test.mjs)
// and scheduled by src/lib/native/notify.js.
//
// Every morning of a trip, at a time the phone's owner picks (08:00 by
// default, in the phone's own time): how many activities today's plan has,
// the first of them, and the forecast at the destination. The forecast is
// the one at scheduling time; the app schedules the coming week each time
// it opens, so it stays fresh enough.
import { alertId } from './flightAlerts.js';
import { getWeatherIcon, getWeatherLabel } from './weatherCodes.js';
import { dayActivities } from './dayOrder.js';

export const MORNING_DAYS = 7;
export const MORNING_TIME = '08:00';

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

// The trip's dates, from the outbound flight to the return one ([] when
// neither is known; one day when only one is).
export function tripRange(trip) {
  const a = dateOf(trip?.outboundFlightDetails?.date);
  const b = dateOf(trip?.returnFlightDetails?.date);
  const from = a || b, to = b || a;
  if (!from || to < from) return [];
  const out = [];
  for (let d = new Date(from); d <= to && out.length < 90; d.setDate(d.getDate() + 1)) out.push(isoOf(d));
  return out;
}

// Is any day of the trip within the coming week? Only those trips are
// listened to and get a forecast.
export function isMorningTrip(trip, now = new Date()) {
  const range = tripRange(trip);
  if (!range.length) return false;
  const today = isoOf(now), last = isoOf(new Date(now.getTime() + MORNING_DAYS * DAY_MS));
  return range[0] <= last && range[range.length - 1] >= today;
}

// Where the forecast is for: the destination airport.
export function tripPlace(trip) {
  const p = trip?.outboundFlightDetails?.arrAirport || trip?.returnFlightDetails?.depAirport;
  return p?.lat && p?.lng ? { lat: p.lat, lng: p.lng } : null;
}

// The planner groups a day by time of day; the first activity is the first
// of the earliest group (as in PlanningTab's groupActivitiesByTime).
const TIME_ORDER = ['בוקר', 'צהריים', 'ערב', 'לילה'];
export function activityRank(a) {
  const l = (a.timeLabel || '').trim();
  return l === '' ? 99 : TIME_ORDER.includes(l) ? TIME_ORDER.indexOf(l) : 50;
}
export function firstActivity(acts) {
  return (acts || []).reduce((best, a) => (best === null || activityRank(a) < activityRank(best) ? a : best), null);
}

// The planner day of `iso`: the one dated so, or — when no day has a date
// (added by hand) — the one in the same place counting from the first day.
export function dayFor(days, iso, range) {
  const sorted = [...(days || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const dated = sorted.find(d => d.date === iso);
  if (dated || sorted.some(d => d.date)) return dated || null;
  const i = range.indexOf(iso);
  return i >= 0 ? sorted[i] || null : null;
}

function planText(acts) {
  const named = (acts || []).filter(a => a.title);
  if (!named.length) return 'אין פעילויות בתוכנית להיום.';
  const f = firstActivity(named);
  const first = [f.timeLabel?.trim(), f.title].filter(Boolean).join(' · ');
  return named.length === 1 ? `פעילות אחת היום: ${first}.` : `${named.length} פעילויות היום. ראשונה: ${first}.`;
}

function weatherText(w) {
  if (!w) return '';
  const label = getWeatherLabel(w.code);
  const rain = w.rain >= 30 ? `, ${w.rain}% גשם` : '';
  return `${getWeatherIcon(w.code)} ${label ? `${label}, ` : ''}${w.min}°–${w.max}°${rain}`;
}

// trips: [trip], daysByTrip: { [tripId]: [day] },
// weatherByTrip: { [tripId]: { daily: [{ date, code, min, max, rain }] } }
export function morningAlerts(trips, daysByTrip, weatherByTrip, time = MORNING_TIME, now = new Date()) {
  const [hh, mm] = (String(time).match(/^(\d{2}):(\d{2})$/) || [null, 8, 0]).slice(1).map(Number);
  const until = now.getTime() + MORNING_DAYS * DAY_MS;
  const out = [];
  for (const trip of trips || []) {
    const range = tripRange(trip);
    const days = daysByTrip?.[trip.id] || [];
    const dates = [...new Set([...range, ...days.map(d => d.date).filter(Boolean)])].sort();
    const forecast = Object.fromEntries((weatherByTrip?.[trip.id]?.daily || []).map(d => [d.date, d]));
    for (const iso of dates) {
      const d = dateOf(iso);
      if (!d) continue;
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
      if (at <= now || at.getTime() > until) continue;
      const day = dayFor(days, iso, range);
      const n = range.indexOf(iso);
      const dayTitle = day?.title || (n >= 0 ? `יום ${n + 1}` : 'היום');
      const body = [planText(dayActivities(day?.activities)), weatherText(forecast[iso])].filter(Boolean).join(' ');
      out.push({
        id: alertId(trip.id, 'morning', iso),
        at,
        title: trip.name ? `${dayTitle} · ${trip.name}` : dayTitle,
        body,
        extra: { kind: 'morning', tripId: trip.id, tab: 'planning' },
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
