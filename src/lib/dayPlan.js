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
// ('בוקר'), several ('בוקר–ערב', 8.82.0), a clock time ('10:30'), a range
// of clock times ('10:00–12:00', 8.94.0), or free text saved before.
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

// A range of clock times ('10:00–12:00', '22:00-01:00'): [from, to] in
// minutes, or null. The same time twice is no range.
function rangeOf(t) {
  const ends = t.split(/\s*[–—-]\s*/);
  if (ends.length !== 2) return null;
  const [a, b] = ends.map(clockMinutes);
  return a != null && b != null && a !== b ? [a, b] : null;
}

// A range as saved: '10:00–12:00'. With no end (or the same), the time.
export const rangeLabel = (from, to) => (to == null || to === from
  ? fmtClock(from) : `${fmtClock(from)}–${fmtClock(to)}`);

// The minutes from the start of a range to its end (past midnight too).
export const rangeLength = (from, to) => (((to - from) % 1440) + 1440) % 1440;

// The part of the day a clock time falls in.
export function partOf(mins) {
  if (mins == null) return null;
  if (mins >= 300 && mins < 720) return 'בוקר';
  if (mins >= 720 && mins < 1020) return 'צהריים';
  if (mins >= 1020 && mins < 1260) return 'ערב';
  return 'לילה';
}

// Several parts of the day as one label (8.82.0): 'בוקר–ערב' when they
// follow each other, else 'בוקר, ערב'. One part is itself; none is ''.
// Old readers show the label as it is, as text.
export function partsLabel(parts) {
  const ps = PARTS.filter(p => (parts || []).includes(p));
  if (ps.length < 2) return ps[0] || '';
  const inRow = ps.every((p, i) => i === 0 || PARTS.indexOf(p) === PARTS.indexOf(ps[i - 1]) + 1);
  return inRow ? `${ps[0]}–${ps[ps.length - 1]}` : ps.join(', ');
}

// The parts in a label of several ('בוקר–ערב', 'בוקר, ערב'), or null.
function spanOf(t) {
  const range = t.split(/\s*[–—-]\s*/);
  if (range.length === 2) {
    const [a, b] = range.map(x => PARTS.indexOf(x));
    if (a >= 0 && b > a) return PARTS.slice(a, b + 1);
  }
  const list = t.split(/\s*[,،]\s*/);
  if (list.length > 1 && list.every(x => PARTS.includes(x))) {
    const ps = PARTS.filter(p => list.includes(p));
    if (ps.length > 1) return ps;
  }
  return null;
}

// A saved time label, read: { label, part, parts, minutes, end, custom }.
// `part` is where it stands in the day: for several parts, the first; for
// a range, its start's. `minutes` is the clock time, or a range's start,
// and `end` a range's end (else null).
export function slotOf(label) {
  const t = String(label || '').trim();
  if (!t) return { label: '', part: null, parts: [], minutes: null, end: null, custom: false };
  const minutes = clockMinutes(t);
  if (minutes != null) {
    const part = partOf(minutes);
    return { label: fmtClock(minutes), part, parts: [part], minutes, end: null, custom: false };
  }
  const range = rangeOf(t);
  if (range) {
    const part = partOf(range[0]);
    return { label: rangeLabel(...range), part, parts: [part], minutes: range[0], end: range[1], custom: false };
  }
  if (PARTS.includes(t)) return { label: t, part: t, parts: [t], minutes: null, end: null, custom: false };
  const span = spanOf(t);
  if (span) return { label: partsLabel(span), part: span[0], parts: span, minutes: null, end: null, custom: false };
  return { label: t, part: null, parts: [], minutes: null, end: null, custom: true };
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
export function dayItems({ acts = [], ...at } = {}) {
  return placeBlocks(timedItems({ acts: acts.filter(a => !isBlock(a)), ...at }), blockItems(acts));
}

// Free blocks (8.87.0): a text, a checklist or a link, kept in the day's
// activities array like an activity (`block`: 'text' | 'check' | 'link'),
// with no title, so whatever reads activities by title (the widget, the
// morning summary) passes them by. A block has no time: it sits after an
// item (`after`: that item's key as dayItems gives it, without the "sh:" of
// the shared plan; null = the top of the day), in the array's order among
// the blocks after the same one. One whose item is gone goes to the end.
export const isBlock = (a) => !!a?.block;
const NO_SLOT = { label: '', part: null, parts: [], minutes: null, end: null, custom: false };
export const baseKey = (k) => String(k || '').replace(/^sh:/, '');
function blockItems(acts, shared = false) {
  return acts.filter(isBlock).map((act, i) => ({
    key: `${shared ? 'sh:' : ''}blk:${act.id}`, kind: 'block', act, slot: NO_SLOT, seq: i,
    ...(shared ? { shared: true } : {}),
  }));
}
export function placeBlocks(items, blocks) {
  if (!blocks.length) return items;
  const keys = new Set(items.map(it => baseKey(it.key)));
  const after = new Map();
  const lost = [];
  blocks.forEach(b => {
    const k = b.act.after ? baseKey(b.act.after) : '';
    if (k && !keys.has(k)) { lost.push(b); return; }
    if (!after.has(k)) after.set(k, []);
    after.get(k).push(b);
  });
  const out = [...(after.get('') || [])];
  items.forEach(it => { out.push(it, ...(after.get(baseKey(it.key)) || [])); });
  return [...out, ...lost];
}

// Where a block dropped at `index` goes (8.87.0): after the item above it
// (`after`), and its `order` between the blocks next to it there.
//   items  the day as shown; index: its place in that list without it.
export function blockDrop(items, key, index) {
  const list = items.filter(it => it.key !== key);
  let after = null;
  for (let i = Math.min(index, list.length) - 1; i >= 0; i--) {
    if (list[i].kind !== 'block') { after = baseKey(list[i].key); break; }
  }
  const sib = (it) => it?.kind === 'block' && (it.act.after ? baseKey(it.act.after) : null) === after;
  const prev = sib(list[index - 1]) ? list[index - 1] : null;
  const next = sib(list[index]) ? list[index] : null;
  const o = (it) => Number(it.act.order) || 0;
  const order = prev && next ? (o(prev) + o(next)) / 2
    : prev ? o(prev) + 1
      : next ? o(next) - 1
        : null;
  return { after, order };
}

function timedItems({ acts = [], date = null, bookings = [], flights = {}, hotel = null } = {}) {
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
    // The booking's time, unless the activity's range starts at it.
    const own = slotOf(act.timeLabel);
    const at = booking?.time ? slotOf(booking.time) : null;
    const slot = at && !(own.end != null && own.minutes === at.minutes) ? at : own;
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

  return sortItems(items);
}

// Items in the order shown: parts of the day in their order, then
// free-text labels as they first appear, then what has no time. Inside a
// part: what has no clock time first (by `seq`, the day's own order), then
// by the clock. Two lists merged (the personal plan over the shared one)
// sort the same way.
export function sortItems(items) {
  const customs = [];
  items.forEach(it => { if (it.slot.custom && !customs.includes(it.slot.label)) customs.push(it.slot.label); });
  const group = (it) => (it.slot.part ? PARTS.indexOf(it.slot.part)
    : it.slot.custom ? PARTS.length + customs.indexOf(it.slot.label) : 99);
  return [...items].sort((a, b) => group(a) - group(b)
    || (a.slot.minutes == null ? -1 : dayMinutes(a.slot.minutes)) - (b.slot.minutes == null ? -1 : dayMinutes(b.slot.minutes))
    || a.seq - b.seq);
}

// What starts before something with a range ends (8.94.0, the owner's
// ask): the keys of the later ones, each with the earlier one it meets.
// Only clock times count; after midnight is still the night before.
export function overlaps(items) {
  const out = new Map();
  const timed = (items || []).filter(it => it.kind !== 'block' && it.slot?.minutes != null)
    .map(it => ({ it, from: dayMinutes(it.slot.minutes) }))
    .sort((a, b) => a.from - b.from);
  let open = null;   // the range that ends last so far: { it, to }
  timed.forEach(({ it, from }) => {
    if (open && from < open.to) out.set(it.key, open.it);
    if (it.slot.end != null) {
      const to = from + rangeLength(it.slot.minutes, it.slot.end);
      if (!open || to > open.to) open = { it, to };
    }
  });
  return out;
}

// The personal plan ("שלי") over the shared one: the member's own
// activities (a booking merged into one of theirs when it is for their
// place), and everything shared (the day's activities, the other
// bookings, flights, the hotel) marked `shared`, in one order.
export function personalItems({ mine = [], shared = [], date = null, bookings = [], flights = {}, hotel = null } = {}) {
  const places = new Set(mine.map(a => a?.placeId).filter(Boolean));
  const ours = (b) => !!b?.placeId && places.has(b.placeId);
  const own = timedItems({ acts: mine.filter(a => !isBlock(a)), date, bookings: bookings.filter(ours) });
  const rest = timedItems({ acts: shared.filter(a => !isBlock(a)), date, bookings: bookings.filter(b => !ours(b)), flights, hotel })
    .map(it => ({ ...it, key: `sh:${it.key}`, shared: true, seq: it.seq + 10000 }));
  return placeBlocks(sortItems([...own, ...rest]), [...blockItems(mine), ...blockItems(shared, true)]);
}

// What a fixed item is called, in the schedule and in the plan widget.
export function fixedTitle(it) {
  if (it?.kind === 'flight') {
    const a = it.flight?.arrAirport || {};
    if (a.city) return `טיסה ל${a.city}`;
    if (a.code) return `טיסה ל־${a.code}`;
    return it.leg === 'out' ? 'טיסת הלוך' : 'טיסת חזור';
  }
  if (it?.kind === 'hotel') return it.what === 'in' ? 'צ׳ק־אין במלון' : 'צ׳ק־אאוט מהמלון';
  return '';
}

// The items in sections by part of the day ({ key, label, items }). With no
// time on anything, one section without a title.
export function groupItems(items) {
  if (!items.some(it => it.slot.label)) return items.length ? [{ key: '', label: '', items }] : [];
  const out = [];
  items.forEach(it => {
    // A block stays in the section of the item above it.
    if (it.kind === 'block') {
      if (!out.length) out.push({ key: '·top', label: '', items: [] });
      out[out.length - 1].items.push(it);
      return;
    }
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
    && !a.shared && !b.shared && a.slot.label === b.slot.label;
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

/* ── The trip's days stay (8.81.0) ─────────────────────────────────
   A day of the trip is never taken away. Clearing it takes out its
   activities, and the day stays with whatever is fixed to its date. A date
   of the trip with no day (taken away before this) shows in the strip as
   missing, to bring back in a tap. */
const isoOf = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || '')) ? String(s).slice(0, 10) : null);
const DAY_MS = 86400000;
function datesFrom(lo, hi, max = 45) {
  const out = [];
  const end = Date.parse(`${hi}T00:00:00Z`);
  for (let t = Date.parse(`${lo}T00:00:00Z`); t <= end && out.length < max; t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

// The dates of the trip with no day, sorted: from the flight out to the
// flight back, and any gap between the days.
export function missingDates(days, out, ret) {
  const have = new Set((days || []).map(d => isoOf(d.date)).filter(Boolean));
  const dated = [...have].sort();
  const want = new Set();
  const o = isoOf(out);
  const r = isoOf(ret);
  if (o && r && o <= r) datesFrom(o, r).forEach(d => want.add(d));
  if (dated.length > 1) datesFrom(dated[0], dated[dated.length - 1]).forEach(d => want.add(d));
  return [...want].filter(d => !have.has(d)).sort();
}

// The date after the last one in the strip of days: after the last day
// with a date, and after the flight back (whose dates show as missing
// days). null when there is no date at all.
export function nextDate(days, out, ret) {
  const o = isoOf(out);
  const r = isoOf(ret);
  const dates = (days || []).map(d => isoOf(d.date)).filter(Boolean);
  if (o && r && o <= r) dates.push(r);
  if (!dates.length) return null;
  const last = dates.sort()[dates.length - 1];
  return new Date(Date.parse(`${last}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

// The order of a day whose date changes to `date`: its place by date among
// the other days, as for a day brought back (placeDays).
export function orderFor(days, id, date) {
  return placeDays((days || []).filter(d => d.id !== id), [date])[0].order;
}

// Where days brought back on `dates` go: each before the first day after
// its date (or after the last day with a date), its title the number of
// its place. The others keep theirs.
//   days  the day documents ({ order, date })
// Returns [{ date, order, title }], by date.
export function placeDays(days, dates) {
  const list = [...(days || [])].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  return [...dates].sort().map(date => {
    let at = list.findIndex(d => isoOf(d.date) && isoOf(d.date) > date);
    if (at < 0) {
      const last = list.map(d => !!isoOf(d.date)).lastIndexOf(true);
      at = last < 0 ? list.length : last + 1;
    }
    const before = list[at - 1];
    const after = list[at];
    const o = (d) => Number(d.order) || 0;
    const order = before && after ? (o(before) + o(after)) / 2
      : after ? o(after) - 1
        : before ? o(before) + 1
          : 1;
    const day = { date, order, title: `יום ${at + 1}` };
    list.splice(at, 0, day);
    return day;
  });
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
