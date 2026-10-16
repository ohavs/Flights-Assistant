// What the home screen widget shows (Android app only) — pure, tested on its
// own (tests/widgetData.test.mjs) and handed to the widget by
// src/lib/native/widget.js.
//
// The widgets draw long after the app saved this, so the snapshot carries
// what the coming days need and each widget picks by its own clock
// (android/.../widget/): the next flight still ahead with a countdown, or,
// during the trip, today's plan; packing and open reminders always. Texts
// are ready to show; instants are epoch ms; dates are the phone's local
// 'YYYY-MM-DD'. The snapshot ships with the widgets in the same APK, so its
// shape may change with them.
import { departureAt, arrivalAt, parseClock } from './flightAlerts.js';
import { tripRange, dayFor, activityRank } from './morningAlerts.js';
import { dayActivities } from './dayOrder.js';
import { parseLocal } from './reminderAlerts.js';
import { CURRENCY_META } from '../services/currency.js';
import { DEFAULT_CURRENCIES, DEFAULT_EXPENSE_CATEGORIES } from './expenseDefaults.js';
import { tripCurrencies, destinationCurrency } from './destinationCurrency.js';

export const WIDGET_TRIPS = 3;      // the current or next trip, and the ones after it
export const WIDGET_DAYS = 14;      // planner days kept per trip, from today
const PLAN_ITEMS = 20;   // the plan widget's list scrolls
const REMINDERS = 30;    // the reminders widget's list scrolls

const LEGS = [
  { field: 'outboundFlightDetails', name: 'טיסת הלוך' },
  { field: 'returnFlightDetails', name: 'טיסת חזור' },
];
const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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
    const arrClock = parseClock(f.estimatedArr) || parseClock(f.scheduledArr);
    const at = departureAt(f);
    const arriveAt = arrivalAt(f);
    const from = f.depAirport?.code, to = f.arrAirport?.code;
    out.push({
      at: at ? at.getTime() : null,
      // Landing, so the widget can follow the flight in the air (TripWidget).
      arriveAt: arriveAt ? arriveAt.getTime() : null,
      date: f.date,
      title: f.flightNumber ? `${leg.name} · ${f.flightNumber}` : leg.name,
      route: from && to ? `${from} → ${to}` : (from || to || ''),
      from: from || '',
      to: to || '',
      when: whenText(f.date, clock),
      // Local clocks at each airport, and what the flight tab knows.
      dep: clock ? `${pad(clock[0])}:${pad(clock[1])}` : '',
      arr: arrClock ? `${pad(arrClock[0])}:${pad(arrClock[1])}` : '',
      toCity: f.arrAirport?.city || '',
      number: f.flightNumber || '',
      gate: String(f.gate || '').trim(),
      status: String(f.status || '').trim(),
    });
  }
  return out;
}

// "יום 3" is only the default name of the third day (PlanningTab): the
// widget says the day's number itself, so that name is no name.
const ownName = (title) => (/^יום \d+$/.test(String(title || '').trim()) ? '' : String(title || '').trim());

function daysOf(trip, days, range, now, plans) {
  const today = isoOf(now);
  const out = {};
  for (const iso of range.filter(d => d >= today).slice(0, WIDGET_DAYS)) {
    const day = dayFor(days, iso, range);
    const acts = dayActivities(day?.activities).filter(a => a.title)
      .sort((a, b) => activityRank(a) - activityRank(b));
    const n = range.indexOf(iso);
    const name = ownName(day?.title);
    out[iso] = {
      title: [`יום ${n + 1}`, name].filter(Boolean).join(' · '),
      name,
      when: whenText(iso),
      // placeId: the planning tab's place (by id, or by name as the tab
      // matches it), to link an expense to and to tick off as visited.
      items: acts.slice(0, PLAN_ITEMS).map(a => {
        const place = (plans || []).find(p => (a.placeId ? p.id === a.placeId : p.title === a.title));
        const placeId = a.placeId || place?.id;
        return {
          time: a.timeLabel?.trim() || '', title: a.title,
          ...(placeId ? { placeId } : {}), ...(place?.visited ? { visited: true } : {}),
        };
      }),
      more: Math.max(0, acts.length - PLAN_ITEMS),
    };
  }
  return out;
}

function remindersOf(list) {
  const open = (list || []).filter(r => !r.completed && r.text)
    .sort((a, b) => String(a.remindAt || '9999').localeCompare(String(b.remindAt || '9999'))
      || (a.createdAt || 0) - (b.createdAt || 0));
  return {
    open: open.length,
    next: open[0]?.text || '',
    items: open.slice(0, REMINDERS).map(r => ({ id: r.id, text: r.text, at: parseLocal(r.remindAt)?.getTime() ?? null })),
  };
}

// The expense widget's choices (ExpenseWidget.java): the currencies a new
// expense offers on this trip (shekels, euros or dollars, the destination's
// own, then any used), the one the keypad starts on (the destination's,
// else the latest expense's), the tab's categories, and the trip's places
// to link an expense to.
const PLACES = 40;
function spendOf(trip, list, plans) {
  const latest = [...(list || [])].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  const codes = [...new Set([...tripCurrencies(trip, DEFAULT_CURRENCIES), ...latest.map(e => e.currency).filter(Boolean)])];
  return {
    currency: destinationCurrency(trip) || latest.find(e => e.currency)?.currency || DEFAULT_CURRENCIES[0],
    currencies: codes.map(code => ({ code, symbol: CURRENCY_META[code]?.symbol || code })),
    categories: [...new Set([...DEFAULT_EXPENSE_CATEGORIES, ...latest.map(e => e.category).filter(Boolean)])],
    // Not yet visited first, then by name.
    places: (plans || []).filter(p => p?.id && p.title)
      .sort((a, b) => (!!a.visited - !!b.visited) || String(a.title).localeCompare(String(b.title), 'he'))
      .slice(0, PLACES)
      .map(p => ({ id: p.id, title: p.title })),
  };
}

// trips: [trip]; daysByTrip / checklistByTrip / remindersByTrip /
// expensesByTrip / plansByTrip (the planning tab's places): { [tripId]: [doc] }. palette: the app's palette key; the
// widget has each one's light and dark colours. theme: the app's setting,
// 'light' or 'dark' whatever the phone is, else 'system' (the phone's).
// rates: the expenses tab's (per euro), for the shekel value of an expense
// the widget saves.
export function widgetSnapshot({ trips, daysByTrip = {}, checklistByTrip = {}, remindersByTrip = {}, expensesByTrip = {}, plansByTrip = {}, rates = null, palette = 'green', theme = 'system', now = new Date() }) {
  const shown = widgetTrips(trips, now).map(trip => ({ trip, spend: spendOf(trip, expensesByTrip[trip.id], plansByTrip[trip.id]) }));
  const codes = new Set(['ILS', ...shown.flatMap(s => s.spend.currencies.map(c => c.code))]);
  return {
    v: 1,
    savedAt: now.getTime(),
    palette,
    theme: theme === 'light' || theme === 'dark' ? theme : 'system',
    rates: rates ? Object.fromEntries([...codes].filter(c => Number(rates[c]) > 0).map(c => [c, Number(rates[c])])) : null,
    trips: shown.map(({ trip, spend }) => {
      const range = tripRange(trip);
      const items = checklistByTrip[trip.id] || [];
      return {
        id: trip.id,
        name: trip.name || trip.destination || 'הטיול',
        start: range[0],
        end: range[range.length - 1],
        flights: flightsOf(trip),
        days: daysOf(trip, daysByTrip[trip.id], range, now, plansByTrip[trip.id]),
        packed: { done: items.filter(it => it.completed).length, total: items.length },
        reminders: remindersOf(remindersByTrip[trip.id]),
        spend,
      };
    }),
  };
}
