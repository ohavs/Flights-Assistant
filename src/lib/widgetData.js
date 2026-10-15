// What the home screen widget shows (Android app only) — pure, tested on its
// own (tests/widgetData.test.mjs) and handed to the widget by
// src/lib/native/widget.js.
//
// The widget draws long after the app saved this, so the snapshot carries
// what the coming days need and the widget picks by its own clock
// (TripWidget.java): the next flight still ahead with a countdown, or,
// during the trip, today's plan; packing and open reminders always. Texts
// are ready to show; instants are epoch ms; dates are the phone's local
// 'YYYY-MM-DD'.
import { departureAt, parseClock } from './flightAlerts.js';
import { tripRange, dayFor, activityRank } from './morningAlerts.js';

export const WIDGET_TRIPS = 3;      // the current or next trip, and the ones after it
export const WIDGET_DAYS = 14;      // planner days kept per trip, from today
const PLAN_LINES = 3;

const LEGS = [
  { field: 'outboundFlightDetails', name: 'טיסת הלוך' },
  { field: 'returnFlightDetails', name: 'טיסת חזור' },
];
const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const assignees = (it) => (Array.isArray(it.assignedTo) ? it.assignedTo : it.assignedTo ? [it.assignedTo] : []);

// "יום ג׳ 20.10 · 07:30" (the time only when known).
function whenText(date, clock) {
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const day = DAY_LETTERS[new Date(+m[1], +m[2] - 1, +m[3]).getDay()];
  const time = clock ? ` · ${pad(clock[0])}:${pad(clock[1])}` : '';
  return `יום ${day} ${+m[3]}.${+m[2]}${time}`;
}

// The trips the widget may show: not on their way to deletion, with a day
// today or later, soonest first.
export function widgetTrips(trips, now = new Date()) {
  const today = isoOf(now);
  return (trips || [])
    .filter(t => typeof t?.deleteAt !== 'number')
    .map(t => ({ t, range: tripRange(t) }))
    .filter(({ range }) => range.length && range[range.length - 1] >= today)
    .sort((a, b) => (a.range[0] < b.range[0] ? -1 : a.range[0] > b.range[0] ? 1 : 0))
    .slice(0, WIDGET_TRIPS)
    .map(({ t }) => t);
}

function flightsOf(trip) {
  const out = [];
  for (const leg of LEGS) {
    const f = trip?.[leg.field];
    if (!f?.date) continue;
    const clock = parseClock(f.actualDep) || parseClock(f.scheduledDep);
    const at = departureAt(f);
    const from = f.depAirport?.code, to = f.arrAirport?.code;
    out.push({
      at: at ? at.getTime() : null,
      date: f.date,
      title: f.flightNumber ? `${leg.name} · ${f.flightNumber}` : leg.name,
      route: from && to ? `${from} → ${to}` : (from || to || ''),
      when: whenText(f.date, clock),
    });
  }
  return out;
}

function daysOf(trip, days, range, now) {
  const today = isoOf(now);
  const out = {};
  for (const iso of range.filter(d => d >= today).slice(0, WIDGET_DAYS)) {
    const day = dayFor(days, iso, range);
    const acts = [...(day?.activities || [])].filter(a => a.title)
      .sort((a, b) => activityRank(a) - activityRank(b));
    const n = range.indexOf(iso);
    out[iso] = {
      title: [`יום ${n + 1}`, day?.title].filter(Boolean).join(' · '),
      lines: acts.slice(0, PLAN_LINES).map(a => [a.timeLabel?.trim(), a.title].filter(Boolean).join(' · ')),
      more: Math.max(0, acts.length - PLAN_LINES),
    };
  }
  return out;
}

function remindersOf(list) {
  const open = (list || []).filter(r => !r.completed && r.text)
    .sort((a, b) => String(a.remindAt || '9999').localeCompare(String(b.remindAt || '9999'))
      || (a.createdAt || 0) - (b.createdAt || 0));
  return { open: open.length, next: open[0]?.text || '' };
}

// trips: [trip]; daysByTrip / checklistByTrip / remindersByTrip: { [tripId]: [doc] }.
// uid: whose packing is counted first ("mine" beside the whole list).
export function widgetSnapshot({ trips, daysByTrip = {}, checklistByTrip = {}, remindersByTrip = {}, uid = null, accent = null, now = new Date() }) {
  return {
    v: 1,
    savedAt: now.getTime(),
    accent,
    trips: widgetTrips(trips, now).map(trip => {
      const range = tripRange(trip);
      const items = checklistByTrip[trip.id] || [];
      const mine = uid ? items.filter(it => assignees(it).includes(uid)) : [];
      return {
        id: trip.id,
        name: trip.name || trip.destination || 'הטיול',
        start: range[0],
        end: range[range.length - 1],
        flights: flightsOf(trip),
        days: daysOf(trip, daysByTrip[trip.id], range, now),
        packed: {
          done: items.filter(it => it.completed).length,
          total: items.length,
          mineDone: mine.filter(it => it.completed).length,
          mine: mine.length,
        },
        reminders: remindersOf(remindersByTrip[trip.id]),
      };
    }),
  };
}
