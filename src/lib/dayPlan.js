// A day of the schedule as it is shown: pure, no Firebase, so it is tested
// on its own (tests/dayPlan.test.mjs).
//
// A day holds its own activities (trips/{id}/days/{dayId}.activities). What
// is fixed to a date is shown on it without being stored there: a booking
// (הזמנות) on that date, the flights and the hotel's check-in and check-out.
// So swapping two days can never carry a booking off its date.
//
// An activity's time is its `timeLabel`, as every reader already shows it
// (the widget, the morning summary, the exports): a part of the day
// ('בוקר'), a clock time ('10:30'), or free text saved before.
import { parseClock } from './flightAlerts.js';

export const PARTS = ['בוקר', 'צהריים', 'ערב', 'לילה'];

const pad = (n) => String(n).padStart(2, '0');
export const fmtClock = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

// '10:30', '9:05', '10.30', '7:30 PM' → minutes since midnight; else null.
export function clockMinutes(s) {
  const t = String(s || '').trim().replace(/^(\d{1,2})\.(\d{2})$/, '$1:$2');
  const c = parseClock(t);
  return c ? c[0] * 60 + c[1] : null;
}

// The part of the day a clock time falls in.
export function partOf(mins) {
  if (mins == null) return null;
  if (mins >= 300 && mins < 720) return 'בוקר';
  if (mins >= 720 && mins < 1020) return 'צהריים';
  if (mins >= 1020 && mins < 1260) return 'ערב';
  return 'לילה';
}

// A saved time label, read: { label, part, minutes, custom }.
export function slotOf(label) {
  const t = String(label || '').trim();
  if (!t) return { label: '', part: null, minutes: null, custom: false };
  const minutes = clockMinutes(t);
  if (minutes != null) return { label: fmtClock(minutes), part: partOf(minutes), minutes, custom: false };
  if (PARTS.includes(t)) return { label: t, part: t, minutes: null, custom: false };
  return { label: t, part: null, minutes: null, custom: true };
}

// After midnight is still the night before (01:00 comes after 23:00).
const dayMinutes = (m) => (m < 300 ? m + 1440 : m);

// The bookings that stand on a date. A cancelled one is not shown.
export function bookingsOn(bookings, date) {
  if (!date) return [];
  return (bookings || []).filter(b => b && b.date === date && b.status !== 'cancelled');
}

// Activities whose place has a booking on this date: they belong to the
// date, and stay on it when days are swapped.
export function anchoredIds(acts, date, bookings) {
  const booked = new Set(bookingsOn(bookings, date).map(b => b.placeId).filter(Boolean));
  return new Set((acts || []).filter(a => a?.placeId && booked.has(a.placeId)).map(a => a.id));
}

// The flight's departure as 'HH:MM', or ''.
function departure(f) {
  const m = clockMinutes(f?.actualDep) ?? clockMinutes(f?.scheduledDep);
  return m == null ? '' : fmtClock(m);
}

// Everything on one day, in the order shown.
//   acts      the day's activities (dayActivities())
//   date      'YYYY-MM-DD' or null
//   bookings  the trip's bookings
//   flights   { out, ret } as saved on the trip
//   hotel     hotelDetails ({ checkIn: 'YYYY-MM-DDTHH:MM', checkOut })
// Each item: { key, kind: 'activity' | 'booking' | 'flight' | 'hotel', slot, … }.
// An activity whose place is booked that day carries the booking (`booking`)
// and takes its time: one row, not two.
export function dayItems({ acts = [], date = null, bookings = [], flights = {}, hotel = null } = {}) {
  const items = [];
  const onDay = bookingsOn(bookings, date);
  const byPlace = new Map();
  onDay.forEach(b => { if (b.placeId && !byPlace.has(b.placeId)) byPlace.set(b.placeId, b); });
  const merged = new Set();
  let seq = 0;
  acts.forEach(act => {
    if (!act) return;
    const booking = act.placeId ? byPlace.get(act.placeId) || null : null;
    if (booking) merged.add(booking.id);
    const slot = booking?.time ? slotOf(booking.time) : slotOf(act.timeLabel);
    items.push({ key: `act:${act.id}`, kind: 'activity', act, booking, slot, seq: seq++ });
  });
  onDay.forEach(b => {
    if (merged.has(b.id)) return;
    items.push({ key: `bk:${b.id}`, kind: 'booking', booking: b, slot: slotOf(b.time), seq: seq++ });
  });
  if (date) {
    for (const leg of ['out', 'ret']) {
      const f = flights?.[leg];
      if (f?.date && String(f.date).slice(0, 10) === date) {
        items.push({ key: `fl:${leg}`, kind: 'flight', leg, flight: f, slot: slotOf(departure(f)), seq: seq++ });
      }
    }
    for (const what of ['in', 'out']) {
      const at = String((what === 'in' ? hotel?.checkIn : hotel?.checkOut) || '');
      if (at.slice(0, 10) === date) {
        items.push({ key: `ht:${what}`, kind: 'hotel', what, hotel, slot: slotOf(at.slice(11, 16)), seq: seq++ });
      }
    }
  }

  // Parts of the day in their order, then free-text labels as they first
  // appear, then what has no time. Inside a part: what has no clock time
  // first (in the day's own order), then by the clock.
  const customs = [];
  items.forEach(it => { if (it.slot.custom && !customs.includes(it.slot.label)) customs.push(it.slot.label); });
  const group = (it) => (it.slot.part ? PARTS.indexOf(it.slot.part)
    : it.slot.custom ? PARTS.length + customs.indexOf(it.slot.label) : 99);
  return items.sort((a, b) => group(a) - group(b)
    || (a.slot.minutes == null ? -1 : dayMinutes(a.slot.minutes)) - (b.slot.minutes == null ? -1 : dayMinutes(b.slot.minutes))
    || a.seq - b.seq);
}

// The items in sections by part of the day ({ key, label, items }). With no
// time on anything, one section without a title.
export function groupItems(items) {
  if (!items.some(it => it.slot.label)) return items.length ? [{ key: '', label: '', items }] : [];
  const out = [];
  items.forEach(it => {
    const key = it.slot.part || (it.slot.custom ? it.slot.label : '');
    let g = out[out.length - 1];
    if (!g || g.key !== key) { g = { key, label: key || 'בלי שעה', items: [] }; out.push(g); }
    g.items.push(it);
  });
  return out;
}

// Two activities next to each other that may trade places: the day orders
// itself by time, so only two with the same time (or none) can.
export function canSwap(a, b) {
  return !!a && !!b && a.kind === 'activity' && b.kind === 'activity' && !a.booking && !b.booking
    && a.slot.label === b.slot.label;
}

// "יום 3": a title that only says where the day is.
export const isGenericTitle = (t) => /^יום \d+$/.test(String(t || '').trim());

// Swapping two days trades their activities. The date stays where it is,
// and so does a title that is only a number ("יום 3"); a title of its own
// ("דיסנילנד") goes with the activities. The documents trade places, so
// each keeps its activities, and what is fixed to a date (`anchoredIds`)
// moves over to stay on it.
//   a, b       day documents ({ id, order, date, title })
//   posA, posB their places in the list, from 1
export function swapDayFields(a, b, posA, posB) {
  const titleAt = (day, other, pos) => (isGenericTitle(day.title)
    ? (isGenericTitle(other.title) ? String(other.title).trim() : `יום ${pos}`)
    : day.title);
  let orderA = b.order ?? posB;
  let orderB = a.order ?? posA;
  if (orderA === orderB) { orderA = orderB + (posB > posA ? 0.5 : -0.5); }
  return {
    a: { order: orderA, date: b.date ?? null, title: titleAt(a, b, posB) },
    b: { order: orderB, date: a.date ?? null, title: titleAt(b, a, posA) },
  };
}

// Minutes of a leg's duration ({ seconds } or '1 שע' 5 דק''), or null.
export function legMinutes(leg) {
  if (!leg) return null;
  if (typeof leg.seconds === 'number') return Math.round(leg.seconds / 60);
  const s = String(leg.duration || '');
  const h = Number((s.match(/(\d+)\s*שע/) || [0, 0])[1]);
  const m = Number((s.match(/(\d+)\s*דק/) || [0, 0])[1]);
  return h || m ? h * 60 + m : null;
}

// The time from one stop to the next. A stop: { key, plan?, title, address? }
// where key is 'hotel', an extra starting point's id, 'place_<id>' or
// 'addr:<address>'. To a place from the hotel, a starting point or another
// place, it is the place's own measurement, saved on it as
// distances[<from key>] and cached as '<placeId>_<from key>'; anything else
// is measured on its own ('leg:<from>><to>').
export const isPlaceLeg = (from, to, originIds = []) => !!to?.plan && (
  from.key === 'hotel' || !!from.plan || originIds.includes(from.key));
export const legKey = (from, to, originIds = []) => (isPlaceLeg(from, to, originIds)
  ? `${to.plan.id}_${from.key}` : `leg:${from.key}>${to.key}`);
