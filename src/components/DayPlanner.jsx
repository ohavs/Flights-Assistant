import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, setDoc, updateDoc, deleteDoc, deleteField, collection, arrayUnion } from 'firebase/firestore';
import {
  Calendar, CheckCircle2, MoreHorizontal, Pencil, Trash2, ArrowLeftRight, ArrowUp, ArrowDown,
  CalendarCheck, CalendarClock, Footprints, Bus, Plane, Hotel, Star, Check, Plus, Search, MapPin,
  Navigation, Phone, ExternalLink, Copy, Users, UserRound, Sunrise, Sun, Sunset, Moon, Clock,
  ChevronDown, Loader2, CornerDownLeft, User, Lock, Eraser, CalendarPlus, CircleDashed, AlertTriangle, GripVertical,
} from 'lucide-react';
import { db } from '../firebase';
import { listen } from '../lib/listen';
import { useTrip } from '../TripContext';
import { useConfirm } from '../ConfirmContext';
import Sheet from '../ui/Sheet';
import Toast from '../ui/Toast';
import { Pill, CategoryDisc } from '../ui/kit';
import Fab from './Fab';
import EmptyState from './EmptyState';
import ActivitySheet from './ActivitySheet';
import { typeOf, statusOf, PAYMENT_LABEL, telHref, mapsHref } from './bookingKinds';
import { getWeatherIcon } from '../hooks/useWeather';
import { localDay, isoDay } from '../lib/dates';
import { creatorOf } from '../lib/roles';
import {
  dayActivities, removeActivity, swapActivities, updateActivity, moveActivityToDay, swapDays,
  clearActivities, putBack, restoreDays, addActivities,
} from '../lib/dayActivities';
import {
  dayItems, personalItems, fixedTitle, groupItems, canSwap, anchoredIds, swapDayFields, legMinutes, bookingsOn, legKey,
  missingDates, placeDays, nextDate, orderFor, blockDrop, baseKey,
} from '../lib/dayPlan';
import DayBlock, { AddBlockRow } from './DayBlock';
import { newBlock } from '../lib/blocks';
import { DatePickerDialog } from './CustomDatePicker';
import { guessedLocation, savedLocation, wayOf } from '../lib/placeLocation';

/* ══════════════════════════════════════════════════════════
   לוח זמנים — the trip one day at a time.

   A strip of the trip's days on top (date, weather, how full), and under
   it the chosen day as a timeline in time order: what is planned, and
   what is fixed to the date without being planned — a booking from the
   bookings tab, a flight, the hotel's check-in or check-out. Between two
   stops, how long it takes to get there from the one before (the first
   from the hotel); a tap picks another starting point.

   Swapping two days trades their activities. The date stays put, and so
   does whatever is fixed to it: a booking, and an activity whose place is
   booked that day (src/lib/dayPlan.js). A message says what happened,
   with a way back.

   A day of the trip is never taken away (8.81.0): "ניקוי היום" takes out
   its activities, and the day stays with what is fixed to its date. A date
   of the trip with no day shows in the strip as missing, and a tap brings
   it back.
   ══════════════════════════════════════════════════════════ */

const PART_ICONS = { 'בוקר': Sunrise, 'צהריים': Sun, 'ערב': Sunset, 'לילה': Moon };
const DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const longDate = (d) => new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
const shortDate = (iso) => {
  const d = localDay(iso);
  return d ? `${DOW[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}` : '';
};
const isUrl = (s) => /^https?:\/\//i.test(s || '');
let toastSeq = 0;
const shortMonth = (d) => new Intl.DateTimeFormat('he-IL', { month: 'short' }).format(d);
const countActs = (n) => (n === 1 ? 'פעילות אחת' : `${n} פעילויות`);
const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)} שע׳${m % 60 ? ` ${m % 60} דק׳` : ''}` : `${m} דק׳`);

function DayPlanner({
  tripId, days, plans, bookings, flights, hotelDetails, distanceOrigins, tripFlightDates,
  weatherByDate, categories, getCategoryColor, getCategoryIcon, getPlanLocations,
  distanceCache, distancesOn, measureLeg, netEpoch,
  onOpenPlace, onOpenWeather, onAddCategory,
}) {
  const { canEdit, canAdd, currentUid } = useTrip();
  const confirm = useConfirm();
  const mine = (act) => canEdit || (canAdd && creatorOf(act) === currentUid);

  /* ── The personal plan ("שלי", 8.74.0) ───────────────────────────
     Each member's own plan of the days, theirs alone (firestore.rules):
     trips/{tripId}/personal/{uid}/days/{date, or "id_" + the day's id}.
     Keyed by the date, so swapping the shared days doesn't move it. Shown
     over the shared plan, which stays on screen, dimmed. */
  const modeKey = `dayMode_${tripId}`;
  const [mode, setModeState] = useState(() => {
    try { return localStorage.getItem(modeKey) === 'mine' ? 'mine' : 'shared'; } catch { return 'shared'; }
  });
  const setMode = (m) => {
    setModeState(m);
    try { localStorage.setItem(modeKey, m); } catch { /* private mode */ }
  };
  const personalMode = mode === 'mine' && !!currentUid;
  const [personal, setPersonal] = useState({});
  useEffect(() => {
    if (!tripId || !currentUid) return undefined;
    return listen(collection(db, 'trips', tripId, 'personal', currentUid, 'days'), snap => {
      const m = {};
      snap.docs.forEach(d => {
        const raw = d.data().activities || [];
        m[d.id] = { rawActivities: raw, activities: dayActivities(raw) };
      });
      setPersonal(m);
    });
  }, [tripId, currentUid]);
  const keyOf = (d) => d.date || `id_${d.id}`;
  // A day of the member's own plan, written to its own document (made by
  // its first activity).
  const planOf = (d, map = personal) => {
    const key = keyOf(d);
    const got = map[key] || { rawActivities: [], activities: [] };
    return {
      ...got, id: key, title: d.title, date: d.date,
      target: { ref: doc(db, 'trips', tripId, 'personal', currentUid, 'days', key), upsert: true },
    };
  };
  // An item that can be changed here: an activity of the plan on screen.
  const canChange = (it) => (it?.kind === 'activity' || it?.kind === 'block') && !it.shared && (personalMode || mine(it.act));
  // Writes go to the plan on screen; "הוספה" changes only its own shared ones.
  const onlyOwn = personalMode ? false : !canEdit;

  const planById = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans]);
  // Each place's booking, for "booked on another day" and "to book".
  const bookingByPlace = useMemo(() => {
    const m = new Map();
    bookings.forEach(b => { if (b.placeId && b.status !== 'cancelled' && !m.has(b.placeId)) m.set(b.placeId, b); });
    return m;
  }, [bookings]);

  /* ── Which day is shown ─────────────────────────────────────────── */
  const today = isoDay();
  const pickKey = `dayPick_${tripId}`;
  const [pickedId, setPickedId] = useState(() => {
    try { return localStorage.getItem(pickKey) || null; } catch { return null; }
  });
  const day = days.find(d => d.id === pickedId)
    || days.find(d => d.date === today)
    || days.find(d => d.date && d.date > today)
    || days[0] || null;
  const dayIdx = day ? days.indexOf(day) : -1;
  const pick = (id) => {
    setPickedId(id);
    try { localStorage.setItem(pickKey, id); } catch { /* private mode */ }
  };

  const stripRef = useRef(null);
  useEffect(() => {
    const node = stripRef.current?.querySelector('[aria-selected="true"]');
    node?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [day?.id, days.length]);

  /* ── The chosen day, as shown ───────────────────────────────────── */
  // The plan written to: the shared day, or the member's own of it.
  const planDay = useMemo(() => (day && personalMode ? planOf(day) : day),
    [day, personalMode, personal, tripId, currentUid]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => {
    if (!day) return [];
    const at = { date: day.date || null, bookings, flights, hotel: hotelDetails };
    return personalMode
      ? personalItems({ ...at, mine: planDay.activities, shared: day.activities })
      : dayItems({ ...at, acts: day.activities });
  }, [day, planDay, personalMode, bookings, flights, hotelDetails]);
  const groups = useMemo(() => groupItems(items), [items]);
  const anchored = useMemo(() => (planDay ? anchoredIds(planDay.activities, day.date, bookings) : new Set()), [planDay, day, bookings]);

  // Where each stop is, for the time it takes to get there.
  const hotelStop = useMemo(() => ({ key: 'hotel', title: hotelDetails?.name ? 'המלון' : 'מרכז העיר' }), [hotelDetails]);
  const stopOf = (it) => {
    if (it.kind === 'hotel') return hotelStop;
    if (it.kind === 'flight') return null;
    const placeId = it.act?.placeId || it.booking?.placeId;
    const plan = placeId ? planById.get(placeId) : null;
    if (plan) return { key: `place_${plan.id}`, plan, title: plan.title };
    const address = (it.act?.address || it.booking?.address || '').trim();
    if (address) return { key: `addr:${address}`, title: it.act?.title || it.booking?.title || '', address };
    return null;
  };
  const originOf = (key) => {
    if (!key) return null;
    if (key === 'hotel') return hotelStop;
    if (key.startsWith('place_')) {
      const plan = planById.get(key.slice(6));
      return plan ? { key, plan, title: plan.title } : null;
    }
    const o = distanceOrigins.find(x => x.id === key);
    return o ? { key, title: o.name } : null;
  };
  // item key → { from, to, custom, first }
  const legs = useMemo(() => {
    const out = new Map();
    if (!distancesOn) return out;
    let prev = null;
    items.forEach(it => {
      if (it.kind === 'flight') { prev = null; return; }
      if (it.shared) return;   // in "שלי", the way between my own stops
      const to = stopOf(it);
      if (!to) return;
      const custom = originOf(it.act?.travelFrom);
      const from = custom || prev || hotelStop;
      if (from.key !== to.key) out.set(it.key, { from, to, custom: !!custom, first: !prev && !custom });
      prev = to;
    });
    return out;
  }, [items, distancesOn, planById, distanceOrigins, hotelStop]); // eslint-disable-line react-hooks/exhaustive-deps

  // Measure what isn't known yet: on opening a day, after a change, when
  // an end moves (a place found again, the hotel edited: 8.88.0), and
  // again when the connection is back.
  const atStop = (s) => (s.plan ? wayOf(savedLocation(s.plan)) || s.plan.id : s.key === 'hotel'
    ? [hotelDetails?.address, hotelDetails?.link, hotelDetails?.name].join('|') : s.key);
  const legSig = [...legs.values()].map(l => `${l.from.key}@${atStop(l.from)}>${l.to.key}@${atStop(l.to)}`).join('|');
  useEffect(() => {
    if (!legs.size) return undefined;
    const t = setTimeout(() => legs.forEach(l => measureLeg(l.from, l.to)), 0);
    return () => clearTimeout(t);
  }, [legSig, netEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  const originIds = useMemo(() => distanceOrigins.map(o => o.id), [distanceOrigins]);
  // `v`: the measurement. One from the hotel that fell back to the city
  // centre (the hotel had no location) says so (originKind, 8.86.0).
  const fromLabel = (stop, v = null) => (stop.key === 'hotel'
    ? (hotelDetails?.name && v?.originKind !== 'city' ? 'מהמלון' : 'ממרכז העיר')
    : `מ־${stop.title}`);
  const legValue = (leg) => (leg ? distanceCache[legKey(leg.from, leg.to, originIds)] : null);
  const walkTotal = [...legs.values()].reduce((sum, l) => sum + (legMinutes(legValue(l)?.walk) || 0), 0);

  /* ── Sheets and the message ─────────────────────────────────────── */
  const [form, setForm] = useState(null);         // { editing: act | null }
  const [detailKey, setDetailKey] = useState(null);
  const [actMenu, setActMenu] = useState(null);   // item key
  const [moveFor, setMoveFor] = useState(null);   // activity being moved to another day
  const [legFor, setLegFor] = useState(null);     // item key whose starting point is picked
  const [legQuery, setLegQuery] = useState('');
  const [dayMenu, setDayMenu] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [renaming, setRenaming] = useState(null); // the title being typed
  const [editBlock, setEditBlock] = useState(null); // id of the free block being edited
  const [redating, setRedating] = useState(false);
  const [toast, setToast] = useState(null);
  const say = (t) => setToast({ id: ++toastSeq, ...t });
  const itemOf = (key) => items.find(it => it.key === key) || null;

  /* ── Days ───────────────────────────────────────────────────────── */
  const handleAddDay = () => {
    if (!tripId) return;
    const dayId = 'day-' + Date.now();
    setDoc(doc(db, 'trips', tripId, 'days', dayId), {
      title: `יום ${days.length + 1}`,
      // After the last one, whatever the count: a day deleted, or one a partner
      // added offline, would otherwise give two days the same place.
      order: Math.max(0, ...days.map(d => Number(d.order) || 0)) + 1,
      activities: [],
    }).catch(err => console.error('Add day error:', err));
    // Not awaited, so it works offline: the day arrives from the local
    // cache, and it is the one shown.
    pick(dayId);
  };

  // "ימים מסונכרנים עם הטיסה" shows right after a sync, then goes.
  const [justSynced, setJustSynced] = useState(false);
  const syncedTimer = useRef(null);
  useEffect(() => () => clearTimeout(syncedTimer.current), []);
  // Days for dates of the trip that have none, each placed by its date
  // (placeDays). The id is the date, so two phones bringing back the same
  // day write one document.
  const newDays = (dates) => {
    const taken = new Set(days.map(d => d.id));
    return placeDays(days, dates).map(d => ({
      ...d, id: taken.has(`day-${d.date}`) ? `day-${d.date}-${Date.now()}` : `day-${d.date}`,
    }));
  };
  // From the flight dates: adds the dates that have no day. Never takes a
  // day away (8.81.0); the days already there keep what they have.
  const handleInitDaysFromFlight = () => {
    if (!tripId || !tripFlightDates.out || !tripFlightDates.ret) return;
    const made = newDays(missingDates(days, tripFlightDates.out, tripFlightDates.ret));
    // One batch, not awaited: works offline too.
    restoreDays(db, tripId, made, {
      plannerDaysFromFlight: { out: tripFlightDates.out, ret: tripFlightDates.ret },
    }).catch(err => console.error('Make days failed:', err));
    if (!days.length) setPickedId(null);
    clearTimeout(syncedTimer.current);
    setJustSynced(true);
    syncedTimer.current = setTimeout(() => setJustSynced(false), 4000);
  };

  // A date of the trip with no day, back in a tap.
  const restoreDay = (date) => {
    const [made] = newDays([date]);
    restoreDays(db, tripId, [made]).catch(err => console.error('Restore day failed:', err));
    pick(made.id);
    say({ icon: <CalendarPlus size={18} />, title: `${made.title} (${shortDate(date)}) חזר`, text: 'מה שקבוע לתאריך הזה מופיע בו שוב.' });
  };

  // The day after the last one in the strip (8.83.0), added with its date
  // (which can be changed after). With no date anywhere, the chip adds a
  // day without one (handleAddDay).
  const afterLast = nextDate(days, tripFlightDates.out, tripFlightDates.ret);
  const addNextDay = () => {
    if (!tripId || !afterLast) return;
    const [made] = newDays([afterLast]);
    restoreDays(db, tripId, [made]).catch(err => console.error('Add day failed:', err));
    pick(made.id);
    say({ icon: <CalendarPlus size={18} />, title: `${made.title} (${shortDate(afterLast)}) נוסף`, text: 'אפשר לשנות לו את התאריך בתפריט של היום.' });
  };

  // Another date for the chosen day: it moves to its place by date. A date
  // another day has can't be picked (DatePickerDialog `taken`).
  const changeDate = (date) => {
    if (!day || !date || date === day.date) return;
    const was = { date: day.date || null, order: day.order ?? 0 };
    const dayId = day.id;
    const ref = doc(db, 'trips', tripId, 'days', dayId);
    updateDoc(ref, { date, order: orderFor(days, dayId, date) })
      .catch(err => console.error('Change day date failed:', err));
    say({
      icon: <Calendar size={18} />,
      title: `${day.title} עבר ל־${shortDate(date)}`,
      action: {
        label: 'ביטול',
        run: () => {
          updateDoc(ref, { date: was.date || deleteField(), order: was.order })
            .catch(err => console.error('Undo day date failed:', err));
        },
      },
    });
  };

  const saveTitle = () => {
    const t = (renaming || '').trim();
    setRenaming(null);
    if (!t || !day || t === day.title) return;
    updateDoc(doc(db, 'trips', tripId, 'days', day.id), { title: t })
      .catch(err => console.error('Save day title error:', err));
  };

  // Takes out the day's activities. The day stays, and so does what is
  // fixed to its date: the flights, the hotel, the bookings, and an
  // activity whose place is booked that day.
  const clearDay = async () => {
    if (!day) return;
    const gone = (day.activities || []).filter(a => !anchored.has(a.id));
    if (!gone.length) return;
    const ok = await confirm({
      title: 'ניקוי היום',
      message: <>למחוק את {gone.length === 1 ? 'הפעילות' : `${gone.length} הפעילויות`} של <strong>{day.title}</strong>? היום עצמו נשאר, עם הטיסות, המלון וההזמנות שלו.</>,
      confirmText: 'נקה',
      cancelText: 'ביטול',
      danger: true,
    });
    if (!ok) return;
    const dayId = day.id;
    const { removed, done } = clearActivities(db, tripId, dayId, day.rawActivities, anchored);
    done.catch(err => console.error('Clear day failed:', err));
    say({
      icon: <Eraser size={18} />,
      title: `${day.title} נוקה`,
      text: anchored.size ? 'מה שהוזמן ליום הזה נשאר.' : undefined,
      action: {
        label: 'ביטול',
        run: () => {
          putBack(db, tripId, dayId, removed).catch(err => console.error('Put back failed:', err));
          say({ icon: <CornerDownLeft size={18} />, title: 'הפעילויות חזרו' });
        },
      },
    });
  };

  // Only an empty day that is not a date of the trip can go: one with no
  // date, or outside the flights (after the trip got shorter).
  const flightRange = tripFlightDates.out && tripFlightDates.ret
    ? [String(tripFlightDates.out).slice(0, 10), String(tripFlightDates.ret).slice(0, 10)] : null;
  const removable = !!day && !(day.rawActivities || []).length && (
    !day.date || (!!flightRange && (day.date < flightRange[0] || day.date > flightRange[1])));
  const removeDay = () => {
    if (!removable) return;
    const gone = day;
    const next = days[dayIdx + 1] || days[dayIdx - 1];
    if (next) pick(next.id);
    deleteDoc(doc(db, 'trips', tripId, 'days', gone.id)).catch(err => console.error('Remove day error:', err));
    say({
      icon: <Trash2 size={18} />,
      title: `${gone.title} הוסר`,
      action: {
        label: 'ביטול',
        run: () => {
          setDoc(doc(db, 'trips', tripId, 'days', gone.id), {
            title: gone.title || '', order: gone.order ?? 0, ...(gone.date ? { date: gone.date } : {}), activities: arrayUnion(),
          }, { merge: true }).catch(err => console.error('Undo remove day failed:', err));
          pick(gone.id);
        },
      },
    });
  };

  // The days and bookings as they are now, for an undo that runs after
  // the change came back (read when it runs, never while rendering).
  const latest = useRef({ days, bookings, personal });
  useEffect(() => { latest.current = { days, bookings, personal }; });

  // Swaps two days by id (see swapDayFields). Returns the pair, or null.
  const swapPair = (aId, bId) => {
    const { days: ds, bookings: bs } = latest.current;
    const a = ds.find(d => d.id === aId);
    const b = ds.find(d => d.id === bId);
    if (!a || !b || a.id === b.id) return null;
    const stayA = anchoredIds(a.activities, a.date, bs);
    const stayB = anchoredIds(b.activities, b.date, bs);
    swapDays(db, tripId, a, b, swapDayFields(a, b, ds.indexOf(a) + 1, ds.indexOf(b) + 1), stayA, stayB)
      .catch(err => console.error('Swap days failed:', err));
    return { a, b, fixed: bookingsOn(bs, a.date).length + bookingsOn(bs, b.date).length + stayA.size + stayB.size };
  };

  // Swap the shown day with another. The same place in the trip stays on
  // screen: it now holds what the other day had.
  const swapWith = (other) => {
    const done = swapPair(day.id, other.id);
    if (!done) return;
    pick(done.b.id);
    const name = (d) => (d.date ? `${d.title} (${shortDate(d.date)})` : d.title);
    say({
      icon: <ArrowLeftRight size={18} />,
      title: `הפעילויות של ${name(done.a)} ו־${name(done.b)} הוחלפו`,
      text: done.fixed ? 'ההזמנות נשארו בתאריך שלהן.' : 'התאריכים נשארו במקומם, רק התוכן התחלף.',
      action: {
        label: 'ביטול',
        run: () => {
          // The same swap again, of the days as they are now.
          if (swapPair(done.b.id, done.a.id)) {
            pick(done.a.id);
            say({ icon: <CornerDownLeft size={18} />, title: 'ההחלפה בוטלה' });
          }
        },
      },
    });
  };

  /* ── Activities ─────────────────────────────────────────────────── */
  const deleteActivity = async (act) => {
    const ok = await confirm({
      title: 'מחיקת פעילות',
      message: act?.title ? <>האם למחוק את <strong>{act.title}</strong>?</> : 'האם למחוק פעילות זו?',
      confirmText: 'מחק',
      cancelText: 'בטל',
      danger: true,
    });
    if (!ok) return;
    removeActivity(db, tripId, planDay.target ?? planDay.id, planDay.rawActivities, act.id, onlyOwn)
      .catch(err => console.error('Activity delete error:', err));
  };

  const moveTo = (act, target) => {
    const fromId = day.id;
    const own = personalMode;
    const as = (d, map) => (own ? planOf(d, map) : d);
    moveActivityToDay(db, tripId, planDay, as(target), act.id, onlyOwn)
      .catch(err => console.error('Move to day failed:', err));
    say({
      icon: <Calendar size={18} />,
      title: `${act.title || 'הבלוק'} עבר ל${target.title}${target.date ? ` (${shortDate(target.date)})` : ''}`,
      action: {
        label: 'ביטול',
        run: () => {
          const { days: ds, personal: pm } = latest.current;
          const from = ds.find(d => d.id === target.id);
          const back = ds.find(d => d.id === fromId);
          if (from && back) {
            moveActivityToDay(db, tripId, as(from, pm), as(back, pm), act.id, onlyOwn)
              .catch(err => console.error('Move back failed:', err));
          }
        },
      },
    });
  };

  // Optional (8.84.0): if there's time. Off takes the field away.
  const setOptional = (act, on) => {
    const next = patched(act, { optional: on ? true : undefined });
    updateActivity(db, tripId, planDay.target ?? planDay.id, planDay.rawActivities, next, onlyOwn)
      .catch(err => console.error('Optional failed:', err));
  };
  // The activity's own note: on this day only, not on the place.
  const setNote = (act, text) => {
    if (text === (lastWrite(act).description || '')) return;
    const next = patched(act, { description: text });
    updateActivity(db, tripId, planDay.target ?? planDay.id, planDay.rawActivities, next, onlyOwn)
      .catch(err => console.error('Note failed:', err));
  };

  /* ── Free blocks (8.87.0) ───────────────────────────────────────── */
  // A new one goes at the end of the day, open for typing.
  const addBlock = (kind) => {
    if (!planDay) return;
    const last = [...items].reverse().find(it => it.kind !== 'block');
    const blk = newBlock(kind, last ? baseKey(last.key) : null, currentUid, Date.now());
    addActivities(db, tripId, planDay.target ?? planDay.id, planDay.rawActivities, [blk])
      .catch(err => console.error('Add block failed:', err));
    setEditBlock(blk.id);
  };
  const setBlock = (act, patch) => {
    updateActivity(db, tripId, planDay.target ?? planDay.id, planDay.rawActivities, patched(act, patch), onlyOwn)
      .catch(err => console.error('Block save failed:', err));
  };
  const toggleCheck = (act, itemId) => {
    const items2 = (lastWrite(act).items || []).map(i => (i.id === itemId ? { ...i, done: !i.done } : i));
    setBlock(act, { items: items2 });
  };
  // `quiet`: an empty one left behind, gone with no message.
  const deleteBlock = (act, quiet = false) => {
    const dayId = planDay.target ?? planDay.id;
    const raw = planDay.rawActivities;
    removeActivity(db, tripId, dayId, raw, act.id, onlyOwn).catch(err => console.error('Block delete failed:', err));
    setEditBlock(e => (e === act.id ? null : e));
    if (quiet) return;
    const back = lastWrite(act);
    say({
      icon: <Trash2 size={18} />,
      title: 'הבלוק נמחק',
      action: {
        label: 'ביטול',
        run: () => addActivities(db, tripId, dayId, raw, [back]).catch(err => console.error('Undo block delete failed:', err)),
      },
    });
  };

  // Dragging a block by its handle: anywhere in the day (a line shows where
  // it lands), or onto a day in the strip. The page scrolls near its edges.
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null);   // { key, dy, index, day }
  const dragUpdate = () => {
    const d = dragRef.current;
    if (!d) return;
    const st = d.scroller.scrollTop;
    d.index = d.rows.filter(r => r.mid < d.y + st).length;
    // The block itself is under the finger: look through it.
    const chip = document.elementsFromPoint(d.x, d.y).map(el => el.closest?.('.dp-chip[data-day]')).find(Boolean);
    d.day = chip ? chip.dataset.day : null;
    const strip = stripRef.current?.getBoundingClientRect();
    d.strip = !!strip && d.y >= strip.top - 20 && d.y <= strip.bottom + 20;
    setDrag({ key: d.key, dy: d.y - d.y0 + st - d.s0, index: d.index, day: d.day, strip: d.strip });
  };
  const startDrag = (it, e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const scroller = e.currentTarget.closest('.app-content') || document.scrollingElement;
    const st = scroller.scrollTop;
    const rows2 = [...document.querySelectorAll('.dp-timeline [data-item]')]
      .filter(r => r.dataset.item !== it.key)
      .map(r => { const b = r.getBoundingClientRect(); return { key: r.dataset.item, mid: b.top + b.height / 2 + st }; });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const d = { key: it.key, act: it.act, x: e.clientX, y: e.clientY, y0: e.clientY, s0: st, rows: rows2, scroller, raf: 0 };
    d.from = items.findIndex(x => x.key === it.key);   // its place, in the list without it
    dragRef.current = d;
    const tick = () => {
      const c = dragRef.current;
      if (!c) return;
      const box = c.scroller.getBoundingClientRect();
      const top = Math.max(box.top, 0) + 70;
      const bottom = Math.min(box.bottom, window.innerHeight) - 100;
      const step = c.y < top ? -Math.min(16, (top - c.y) / 4 + 2) : c.y > bottom ? Math.min(16, (c.y - bottom) / 4 + 2) : 0;
      if (step) { c.scroller.scrollTop += step; dragUpdate(); }
      // Over the strip of days, near its sides: it scrolls to the others.
      const sr = c.strip && stripRef.current?.getBoundingClientRect();
      if (sr) {
        const side = c.x < sr.left + 48 ? -1 : c.x > sr.right - 48 ? 1 : 0;
        if (side) { stripRef.current.scrollBy({ left: side * 9 }); dragUpdate(); }
      }
      c.raf = requestAnimationFrame(tick);
    };
    d.raf = requestAnimationFrame(tick);
    dragUpdate();
  };
  const moveDrag = (e) => {
    const d = dragRef.current;
    if (!d) return;
    d.x = e.clientX;
    d.y = e.clientY;
    dragUpdate();
  };
  const stopDrag = () => {
    const d = dragRef.current;
    if (d) cancelAnimationFrame(d.raf);
    dragRef.current = null;
    setDrag(null);
    return d;
  };
  const endDrag = () => {
    const d = stopDrag();
    if (!d) return;
    if (d.day) {
      const target = days.find(x => x.id === d.day);
      if (target && target.id !== day.id) moveTo(d.act, target);
      return;
    }
    if (d.index === d.from) return;   // where it was
    const { after, order } = blockDrop(items, d.key, d.index);
    updateActivity(db, tripId, planDay.target ?? planDay.id, planDay.rawActivities, patched(d.act, { after }), onlyOwn, order)
      .catch(err => console.error('Block move failed:', err));
  };

  const setTravelFrom = (act, key) => {
    updateActivity(db, tripId, planDay.target ?? planDay.id, planDay.rawActivities, { ...act, travelFrom: key || null }, onlyOwn)
      .catch(err => console.error('Travel origin failed:', err));
  };

  // Travel times from the hotel, shown when choosing places to add.
  const metaOf = (p) => {
    const c = distanceCache[`${p.id}_${p.distanceOriginId || 'hotel'}`];
    if (!c?.walk && !c?.transit) return null;
    return (
      <span className="dp-leg-times">
        {c.walk && <span className="dp-leg-walk"><Footprints size={12} aria-hidden="true" />{c.walk.duration}</span>}
        {c.transit && <span className="dp-leg-transit"><Bus size={12} aria-hidden="true" />{c.transit.duration}</span>}
      </span>
    );
  };
  // Which days each place is already on, for the place picker.
  const usedOn = useMemo(() => {
    const m = new Map();
    days.forEach(d => (d.activities || []).forEach(a => {
      if (!a.placeId) return;
      if (!m.has(a.placeId)) m.set(a.placeId, []);
      if (!m.get(a.placeId).includes(d.title)) m.get(a.placeId).push(d.title);
    }));
    return m;
  }, [days]);

  /* ── Pieces ─────────────────────────────────────────────────────── */
  const legChip = (it, drop = '') => {
    const leg = legs.get(it.key);
    if (!leg) return null;
    const v = legValue(leg);
    const canPick = canChange(it);
    // Always where from (8.86.0): the previous stop, the hotel, or the one
    // picked. A guessed end (a place found by its name only) is flagged.
    const fromText = fromLabel(leg.from, v);
    const guessed = [leg.from, leg.to].some(s => s.plan && guessedLocation(s.plan));
    let body;
    if (!v || v.loading) body = <span className="dp-leg-note"><Loader2 size={12} className="spinning" aria-hidden="true" />מחשב…</span>;
    else if (v.offline) body = <span className="dp-leg-note">יחושב כשיהיה חיבור</span>;
    else if (!v.walk && !v.transit) body = <span className="dp-leg-note">אין מיקום לחישוב</span>;
    else body = (
      <span className="dp-leg-times">
        {v.walk && <span className="dp-leg-walk"><Footprints size={12} aria-hidden="true" />{v.walk.duration}</span>}
        {v.transit && <span className="dp-leg-transit"><Bus size={12} aria-hidden="true" />{v.transit.duration}</span>}
      </span>
    );
    const inner = (<>
      {body}
      {fromText && <span className="dp-leg-from">{fromText}</span>}
      {guessed && <AlertTriangle size={13} className="dp-leg-guess" aria-label="מיקום משוער לפי השם" />}
      {canPick && <ChevronDown size={13} aria-hidden="true" className="dp-leg-chev" />}
    </>);
    return (
      <div className={`dp-row dp-leg-row${drop}`}>
        <span className="dp-rail" aria-hidden="true" />
        {canPick
          ? <button type="button" className="dp-leg" onClick={() => { setLegQuery(''); setLegFor(it.key); }} aria-label={`זמן הגעה אל ${leg.to.title}, בחירת נקודת יציאה`}>{inner}</button>
          : <div className="dp-leg">{inner}</div>}
      </div>
    );
  };

  const bookingStub = (b) => (
      <span className="dp-stub">
        <CalendarCheck size={13} aria-hidden="true" />
        <span className="dp-stub-label">{b.status === 'pending' ? 'ממתינה לאישור' : 'הזמנה'}</span>
        {b.people && <span className="dp-stub-fact"><Users size={12} aria-hidden="true" />{b.people}</span>}
        {b.confirmation && <span className="dp-stub-code" dir="ltr">#{b.confirmation}</span>}
      </span>
  );

  // While a block is dragged: the line where it would land, above the item
  // at its place (above that item's way there), or under the last.
  const shownWithout = drag ? items.filter(x => x.key !== drag.key) : null;
  const dropAt = (key) => {
    if (!drag || drag.day) return '';
    if (shownWithout[drag.index]?.key === key) return ' drop-before';
    if (drag.index >= shownWithout.length && shownWithout[shownWithout.length - 1]?.key === key) return ' drop-after';
    return '';
  };

  const renderItem = (it) => {
    const time = it.slot.minutes != null ? it.slot.label : '';
    const drop = dropAt(it.key);
    if (it.kind === 'block') {
      const editable = canChange(it);
      const dragging = drag?.key === it.key;
      return (
        <div
          key={it.key}
          data-item={it.key}
          className={`dp-row dp-block-row${it.shared ? ' shared' : ''}${dragging ? ` dragging${drag.strip ? ' over-strip' : ''}` : ''}${drop}`}
          style={dragging ? { transform: `translateY(${drag.dy}px)` } : undefined}
        >
          <span className="dp-rail" aria-hidden="true" />
          <div className={`dp-block kind-${it.act.block}`}>
            {editable && editBlock !== it.act.id && (
              <button
                type="button"
                className="dp-block-grip"
                aria-label="גרירת הבלוק"
                title="גרירה למקום אחר ביום, או ליום אחר בפס"
                onPointerDown={(e) => startDrag(it, e)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={stopDrag}
              >
                <GripVertical size={16} />
              </button>
            )}
            <DayBlock
              act={it.act}
              editable={editable}
              editing={editBlock === it.act.id}
              onEditing={(on) => setEditBlock(on ? it.act.id : null)}
              onSave={(patch) => setBlock(it.act, patch)}
              onDelete={(quiet) => deleteBlock(it.act, quiet)}
              onToggle={(id) => toggleCheck(it.act, id)}
            />
          </div>
        </div>
      );
    }
    if (it.kind === 'flight' || it.kind === 'hotel') {
      const f = it.flight;
      const isFlight = it.kind === 'flight';
      const title = fixedTitle(it);
      const route = isFlight && f.depAirport?.code && f.arrAirport?.code ? `${f.depAirport.code} → ${f.arrAirport.code}` : '';
      const sub = isFlight
        ? <>{[f.flightNumber, time ? `המראה ${time}` : ''].filter(Boolean).join(' · ')}{route && <>{' · '}<bdi dir="ltr">{route}</bdi></>}</>
        : (it.hotel?.name || '');
      return (
        <div key={it.key} data-item={it.key} className={`dp-row${it.shared ? ' shared' : ''}${drop}`}>
          <span className="dp-rail" aria-hidden="true"><span className="dp-time">{time}</span></span>
          <div className="dp-card fixed" style={{ '--c': isFlight ? 'var(--c-blue)' : '#7c3aed' }}>
            <div className="dp-card-main as-div">
              <span className={`dp-disc ${isFlight ? 'sky' : 'lavender'}`}>{isFlight ? <Plane size={18} /> : <Hotel size={18} />}</span>
              <span className="dp-card-text">
                <span className="dp-card-title">{title}</span>
                {sub && <span className="dp-card-sub">{sub}</span>}
              </span>
            </div>
          </div>
        </div>
      );
    }

    if (it.kind === 'booking') {
      const b = it.booking;
      const t = typeOf(b.type);
      const facts = b.bookedUnder ? `על שם ${b.bookedUnder}` : '';
      return (
        <React.Fragment key={it.key}>
          {legChip(it, drop === ' drop-before' ? drop : '')}
          <div data-item={it.key} className={`dp-row${it.shared ? ' shared' : ''}${legs.has(it.key) && drop !== ' drop-after' ? '' : drop}`}>
            <span className="dp-rail" aria-hidden="true"><span className="dp-time">{time}</span></span>
            <div className="dp-card booking" style={{ '--c': t.color }}>
              <button type="button" className="dp-card-main" onClick={() => setDetailKey(it.key)}>
                <span className="dp-disc" style={{ background: `${t.color}1F`, color: t.color }}><t.Icon size={18} /></span>
                <span className="dp-card-text">
                  <span className="dp-card-title">{b.title}</span>
                  <span className="dp-card-sub">{[t.label, facts].filter(Boolean).join(' · ')}</span>
                  {bookingStub(b)}
                </span>
              </button>
            </div>
          </div>
        </React.Fragment>
      );
    }

    // An activity
    const act = it.act;
    const plan = act.placeId ? planById.get(act.placeId) : null;
    const category = plan?.category || act.category;
    const color = getCategoryColor(category);
    const title = plan?.title || act.title;
    const visited = plan?.visited === true;
    const address = (act.address || plan?.address || '').trim();
    const sub = [address && !isUrl(address) ? address : '', !address || isUrl(address) ? category : ''].filter(Boolean).join(' · ');
    const elsewhere = !it.booking && plan ? bookingByPlace.get(plan.id) : null;
    const toBook = plan && !visited && !it.booking && !elsewhere && plan.needsReservation;
    return (
      <React.Fragment key={it.key}>
        {legChip(it, drop === ' drop-before' ? drop : '')}
        <div data-item={it.key} className={`dp-row${it.shared ? ' shared' : ''}${legs.has(it.key) && drop !== ' drop-after' ? '' : drop}`}>
          <span className="dp-rail" aria-hidden="true">
            <span className="dp-time">{time}</span>
          </span>
          <div className={`dp-card${visited ? ' visited' : ''}${it.booking ? ' booked' : ''}${act.optional ? ' optional' : ''}`} style={{ '--c': color }}>
            <button type="button" className="dp-card-main" onClick={() => setDetailKey(it.key)}>
              <CategoryDisc color={color} size={40} radius={13} muted={visited}>
                {visited ? <Check size={18} strokeWidth={3} /> : getCategoryIcon(category, 18)}
              </CategoryDisc>
              <span className="dp-card-text">
                <span className="dp-card-title">
                  {plan?.priority === 'must' && !visited && <Star size={13} className="star-must" aria-label="חובה" />}
                  <h4>{title}</h4>
                </span>
                {sub && <span className="dp-card-sub">{sub}</span>}
                {act.description && <span className="dp-card-note">{act.description}</span>}
                {(visited || toBook || elsewhere || act.optional || it.slot.custom || it.slot.parts.length > 1) && (
                  <span className="dp-card-tags">
                    {act.optional && <Pill size="sm" tone="muted" icon={<CircleDashed size={11} />}>אופציונלי</Pill>}
                    {(it.slot.custom || it.slot.parts.length > 1) && <Pill size="sm" tone="sky" icon={<Clock size={11} />}>{it.slot.label}</Pill>}
                    {visited && <Pill size="sm" tone="muted">ביקרנו</Pill>}
                    {toBook && <Pill size="sm" tone="red" icon={<CalendarCheck size={11} />}>להזמין</Pill>}
                    {elsewhere && (
                      <Pill size="sm" tone={elsewhere.date ? 'butter' : 'mint'} icon={<CalendarCheck size={11} />}>
                        {elsewhere.date ? `ההזמנה ב־${shortDate(elsewhere.date)}` : 'הוזמן'}
                      </Pill>
                    )}
                  </span>
                )}
                {it.booking && bookingStub(it.booking)}
              </span>
            </button>
            {canChange(it) && (
              <button
                type="button"
                className="round-btn dp-more"
                aria-label={`פעולות: ${act.title}`}
                onClick={() => setActMenu(it.key)}
              >
                <MoreHorizontal size={17} />
              </button>
            )}
          </div>
        </div>
      </React.Fragment>
    );
  };

  /* ── The view ───────────────────────────────────────────────────── */
  // The strip: the days, and in their places the dates of the trip that
  // have none (to bring back; only for who can change the days).
  const strip = useMemo(() => {
    const gaps = canEdit && !personalMode
      ? placeDays(days, missingDates(days, tripFlightDates.out, tripFlightDates.ret)) : [];
    const all = [...days.map(d => ({ d, at: Number(d.order) || 0 })), ...gaps.map(g => ({ gap: g, at: g.order }))];
    return all.sort((a, b) => a.at - b.at);
  }, [days, canEdit, personalMode, tripFlightDates.out, tripFlightDates.ret]);
  const syncable = canEdit && tripFlightDates.out && tripFlightDates.ret &&
    !(tripFlightDates.plannerSync?.out === tripFlightDates.out && tripFlightDates.plannerSync?.ret === tripFlightDates.ret);
  const dayDate = day?.date ? localDay(day.date) : null;
  const nextDay = afterLast ? localDay(afterLast) : null;
  const dayW = day?.date ? weatherByDate[day.date] : null;
  const actCount = planDay ? (planDay.activities || []).filter(a => !a.block).length : 0;
  const bookingCount = items.filter(it => it.booking && !it.shared).length;

  return (
    <div className="animate-fade dp">
      {(syncable || justSynced) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {syncable && (
            <button onClick={handleInitDaysFromFlight} className="btn-secondary" style={{ padding: '8px 14px', fontSize: 13, gap: 6 }}
              title="צור ימים אוטומטית לפי תאריכי הטיסה">
              <Calendar size={15} />
              <span>{tripFlightDates.plannerSync ? 'עדכן ימים לפי טיסה' : 'ייצר ימים לפי טיסה'}</span>
            </button>
          )}
          {justSynced && (
            <span className="sync-flash" style={{ fontSize: 12, color: 'var(--c-green)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={13} />
              ימים מסונכרנים עם הטיסה
            </span>
          )}
        </div>
      )}

      {day && (canAdd || personalMode) && <Fab label="פעילות חדשה" onClick={() => setForm({ editing: null })} />}

      {!day ? (
        <EmptyState
          icon={Calendar}
          title="עוד אין ימי טיול"
          hint={
            canEdit && tripFlightDates.out && tripFlightDates.ret
              ? 'אפשר לייצר את כל ימי הטיול בבת אחת לפי תאריכי הטיסה שכבר הוזנו, ואז לשבץ לכל יום את המקומות מהרשימה.'
              : canEdit
                ? 'הוסיפו יום, ואז שבצו לתוכו מקומות מרשימת התכנון עם שעות.'
                : 'עוד לא נבנה לוח זמנים לטיול הזה.'
          }
          action={canEdit && tripFlightDates.out && tripFlightDates.ret ? (
            <button onClick={handleInitDaysFromFlight} className="btn-primary">
              <Calendar size={16} />
              <span>ייצר ימים לפי תאריכי הטיסה</span>
            </button>
          ) : canEdit ? (
            <button onClick={handleAddDay} className="btn-primary">
              <CalendarPlus size={16} />
              <span>הוספת יום</span>
            </button>
          ) : null}
        />
      ) : (<>
        {/* Whose plan: the trip's, or my own over it */}
        {currentUid && (
          <div className="dp-mode-row">
            <div className="dp-mode" role="radiogroup" aria-label="איזה תכנון">
              <button type="button" role="radio" aria-checked={!personalMode} onClick={() => setMode('shared')}>
                <Users size={15} aria-hidden="true" /><span>משותף</span>
              </button>
              <button type="button" role="radio" aria-checked={personalMode} onClick={() => setMode('mine')}>
                <User size={15} aria-hidden="true" /><span>שלי</span>
              </button>
            </div>
            {personalMode && (
              <span className="dp-mode-note"><Lock size={12} aria-hidden="true" />רק את/ה רואה. המשותף מעומעם.</span>
            )}
          </div>
        )}

        {/* The days */}
        <div className="dp-strip hide-scroll" role="tablist" aria-label="ימי הטיול" ref={stripRef}>
          {strip.map(({ d, gap }) => {
            if (gap) {
              const gd = localDay(gap.date);
              return (
                <button
                  key={`gap-${gap.date}`}
                  type="button"
                  aria-label={`החזרת יום: ${shortDate(gap.date)}`}
                  title="יום של הטיול שאין לו מקום בלוח. לחיצה מחזירה אותו."
                  className="dp-chip missing"
                  onClick={() => restoreDay(gap.date)}
                >
                  <span className="dp-chip-top">{DOW[gd.getDay()]}</span>
                  <span className="dp-chip-num">{gd.getDate()}</span>
                  <span className="dp-chip-bottom">{shortMonth(gd)}</span>
                  <span className="dp-chip-add" aria-hidden="true"><Plus size={12} strokeWidth={3} /></span>
                </button>
              );
            }
            const dd = d.date ? localDay(d.date) : null;
            const w = d.date ? weatherByDate[d.date] : null;
            const n = personalMode
              ? (personal[keyOf(d)]?.activities || []).filter(a => !a.block).length
              : (d.activities || []).filter(a => !a.block).length + bookingsOn(bookings, d.date).filter(b => !b.placeId || !(d.activities || []).some(a => a.placeId === b.placeId)).length;
            const on = d.id === day.id;
            return (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={`${d.title}${d.date ? `, ${shortDate(d.date)}` : ''}`}
                data-day={d.id}
                className={`dp-chip${d.date === today ? ' today' : ''}${d.date && d.date < today ? ' past' : ''}${drag?.day === d.id && d.id !== day.id ? ' drop-target' : ''}`}
                onClick={() => pick(d.id)}
              >
                <span className="dp-chip-top">{dd ? DOW[dd.getDay()] : 'יום'}</span>
                <span className="dp-chip-num">{dd ? dd.getDate() : days.indexOf(d) + 1}</span>
                <span className="dp-chip-bottom">
                  {w ? <>{getWeatherIcon(w.code)} {w.max}°</> : dd ? shortMonth(dd) : ' '}
                </span>
                <span className="dp-chip-dots" aria-hidden="true">
                  {Array.from({ length: Math.min(n, 4) }, (_, k) => <i key={k} />)}
                </span>
              </button>
            );
          })}
          {canEdit && !personalMode && (
            <button
              type="button"
              aria-label={nextDay ? `הוספת יום: ${shortDate(afterLast)}` : 'הוספת יום'}
              title="הוספת יום אחרי האחרון"
              className="dp-chip next"
              onClick={afterLast ? addNextDay : handleAddDay}
            >
              <span className="dp-chip-top">{nextDay ? DOW[nextDay.getDay()] : 'יום'}</span>
              <span className="dp-chip-num">{nextDay ? nextDay.getDate() : days.length + 1}</span>
              <span className="dp-chip-bottom">{nextDay ? shortMonth(nextDay) : ' '}</span>
              <span className="dp-chip-add" aria-hidden="true"><Plus size={12} strokeWidth={3} /></span>
            </button>
          )}
        </div>

        {/* The chosen day */}
        <section key={day.id} className="dp-day day-body" aria-label={day.title}>
          <header className="dp-head">
            <div className="dp-head-text">
              <h3 className="dp-title">{day.title}</h3>
              <span className="dp-date">
                {dayDate ? longDate(dayDate) : `יום ${dayIdx + 1} בטיול`}
                {day.date === today && <span className="dp-today">היום</span>}
              </span>
            </div>
            {dayW && (
              <button type="button" className="dp-weather" onClick={() => onOpenWeather(day.date)} aria-label="מזג אוויר לפי שעה">
                <span className="dp-weather-icon">{getWeatherIcon(dayW.code)}</span>
                <span>{dayW.max}°<span className="dp-weather-min">/{dayW.min}°</span></span>
                {dayW.rain > 0 && <span className="dp-weather-rain">{dayW.rain}%</span>}
              </button>
            )}
            {canEdit && !personalMode && (
              <button type="button" className="round-btn" aria-label="פעולות ליום" onClick={() => setDayMenu(true)}>
                <MoreHorizontal size={18} />
              </button>
            )}
          </header>

          {(actCount > 0 || bookingCount > 0 || walkTotal > 0) && (
            <div className="dp-stats">
              {actCount > 0 && <Pill size="sm">{countActs(actCount)}</Pill>}
              {bookingCount > 0 && <Pill size="sm" tone="mint" icon={<CalendarCheck size={11} />}>{bookingCount === 1 ? 'הזמנה אחת' : `${bookingCount} הזמנות`}</Pill>}
              {walkTotal > 0 && <Pill size="sm" tone="sky" icon={<Footprints size={11} />}>{`${fmtMins(walkTotal)} הליכה`}</Pill>}
            </div>
          )}

          {personalMode && actCount === 0 && items.length > 0 && (
            <p className="dp-empty mine">עוד לא תכננת כלום ליום הזה. המשותף מוצג מעומעם, כדי לתכנן סביבו.</p>
          )}

          {items.length > 0 ? (
            <div className="dp-timeline">
              {groups.map(g => {
                const Icon = PART_ICONS[g.key] || (g.key ? Clock : null);
                return (
                  <div key={g.key || 'all'} className="dp-group">
                    {g.label && (
                      <div className="dp-row dp-part">
                        <span className="dp-rail" aria-hidden="true">
                          <span className="dp-part-icon">{Icon ? <Icon size={15} /> : <Clock size={15} />}</span>
                        </span>
                        <span className="dp-part-label">{g.label}</span>
                      </div>
                    )}
                    {g.items.map(renderItem)}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="dp-empty">{personalMode ? 'עוד לא תכננת כלום ליום הזה.' : 'אין עדיין פעילויות ליום זה.'}</p>
          )}

          {(canAdd || personalMode) && <AddBlockRow onAdd={addBlock} />}

        </section>
      </>)}

      {/* ── Adding / editing an activity ── */}
      {form && day && (
        <ActivitySheet
          tripId={tripId}
          day={planDay}
          personal={personalMode}
          onlyOwn={onlyOwn}
          editing={form.editing}
          plans={plans}
          categories={categories}
          usedOn={usedOn}
          currentUid={currentUid}
          getCategoryColor={getCategoryColor}
          getCategoryIcon={getCategoryIcon}
          metaOf={metaOf}
          onAddCategory={onAddCategory}
          onClose={() => setForm(null)}
        />
      )}

      {/* ── An activity's actions ── */}
      {actMenu && (() => {
        const it = itemOf(actMenu);
        if (!it) return null;
        const act = it.act;
        // Neighbours it may trade places with: same time, same section.
        const g = groups.find(x => x.items.includes(it));
        const own = g ? g.items.filter(x => !x.shared) : [];
        const at = own.indexOf(it);
        const up = at > 0 && canSwap(own[at - 1], it) ? own[at - 1] : null;
        const down = at >= 0 && canSwap(it, own[at + 1]) ? own[at + 1] : null;
        const fixed = anchored.has(act.id);
        return (
          <Sheet title={act.title} onClose={() => setActMenu(null)}>
            <div className="list-group">
              {[
                ...(canEdit || personalMode ? [
                  { key: 'up', label: 'הזז למעלה', Icon: ArrowUp, disabled: !up,
                    run: () => swapActivities(db, tripId, planDay.target ?? planDay.id, planDay.rawActivities, act.id, up.act.id).catch(err => console.error('Activity move error:', err)) },
                  { key: 'down', label: 'הזז למטה', Icon: ArrowDown, disabled: !down,
                    run: () => swapActivities(db, tripId, planDay.target ?? planDay.id, planDay.rawActivities, act.id, down.act.id).catch(err => console.error('Activity move error:', err)) },
                ] : []),
                ...(days.length > 1 ? [{
                  key: 'move', label: 'העברה ליום אחר', Icon: Calendar, disabled: fixed,
                  hint: fixed ? 'יש לו הזמנה בתאריך הזה' : '',
                  run: () => setMoveFor(act),
                }] : []),
                { key: 'edit', label: 'עריכה', Icon: Pencil, run: () => setForm({ editing: act }) },
                { key: 'del', label: 'מחיקה', Icon: Trash2, danger: true, run: () => deleteActivity(act) },
              ].map(({ key, label, Icon, disabled, danger, hint, run }) => (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  className={`list-row${danger ? ' danger' : ''}`}
                  onClick={() => { setActMenu(null); run(); }}
                >
                  <Icon size={18} className="list-row-icon" />
                  <span className="list-row-label">
                    {label}
                    {hint && <span className="list-row-hint">{hint}</span>}
                  </span>
                </button>
              ))}
            </div>
            {(canEdit || personalMode) && (!up || !down) && (it.slot.minutes != null || it.booking) && (
              <p className="dp-sheet-note">היום מסודר לפי השעות. כדי להזיז, משנים את השעה בעריכה.</p>
            )}
          </Sheet>
        );
      })()}

      {/* ── Moving an activity to another day ── */}
      {moveFor && (
        <Sheet title={`העברת ${moveFor.title} ליום אחר`} onClose={() => setMoveFor(null)}>
          {({ close }) => (
            <div className="list-group" role="radiogroup">
              {days.filter(d => d.id !== day.id).map(d => (
                <button key={d.id} type="button" className="list-row" onClick={() => { moveTo(moveFor, d); close(); }}>
                  <Calendar size={16} className="list-row-icon" />
                  <span className="list-row-label">
                    {d.title}
                    <span className="list-row-hint">{[shortDate(d.date), countActs((d.activities || []).length)].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}

      {/* ── The day's actions ── */}
      {dayMenu && day && (
        <Sheet title={day.title} onClose={() => setDayMenu(false)}>
          {({ close }) => (
            <div className="list-group">
              <button type="button" className="list-row" onClick={() => { close(); setRenaming(day.title || ''); }}>
                <Pencil size={18} className="list-row-icon" />
                <span className="list-row-label">שינוי שם</span>
              </button>
              <button type="button" className="list-row" onClick={() => { close(); setRedating(true); }}>
                <Calendar size={18} className="list-row-icon" />
                <span className="list-row-label">
                  שינוי תאריך
                  <span className="list-row-hint">{day.date ? shortDate(day.date) : 'ליום אין תאריך'}</span>
                </span>
              </button>
              {days.length > 1 && (
                <button type="button" className="list-row" onClick={() => { close(); setSwapOpen(true); }}>
                  <ArrowLeftRight size={18} className="list-row-icon" />
                  <span className="list-row-label">
                    החלפה עם יום אחר
                    <span className="list-row-hint">הפעילויות מתחלפות, התאריכים וההזמנות נשארים</span>
                  </span>
                </button>
              )}
              {(day.activities || []).some(a => !anchored.has(a.id)) && (
                <button type="button" className="list-row danger" onClick={() => { close(); clearDay(); }}>
                  <Eraser size={18} className="list-row-icon" />
                  <span className="list-row-label">
                    ניקוי היום
                    <span className="list-row-hint">הפעילויות נמחקות. היום, הטיסות, המלון וההזמנות נשארים</span>
                  </span>
                </button>
              )}
              {removable && (
                <button type="button" className="list-row danger" onClick={() => { close(); removeDay(); }}>
                  <Trash2 size={18} className="list-row-icon" />
                  <span className="list-row-label">
                    הסרת היום
                    <span className="list-row-hint">{day.date ? 'יום ריק מחוץ לתאריכי הטיסה' : 'יום ריק בלי תאריך'}</span>
                  </span>
                </button>
              )}
            </div>
          )}
        </Sheet>
      )}

      {renaming != null && day && (
        <Sheet title="שם היום" onClose={() => setRenaming(null)}>
          {({ close }) => (
            <form onSubmit={(e) => { e.preventDefault(); saveTitle(); close(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input className="form-control" value={renaming} onChange={(e) => setRenaming(e.target.value)} aria-label="שם היום" required />
              <div className="sheet-footer">
                <button type="submit" className="btn-primary">שמור</button>
                <button type="button" className="btn-secondary" onClick={close}>ביטול</button>
              </div>
            </form>
          )}
        </Sheet>
      )}

      {redating && day && (
        <DatePickerDialog
          title={`התאריך של ${day.title}`}
          value={day.date || afterLast || undefined}
          taken={new Set(days.filter(d => d.id !== day.id && d.date).map(d => String(d.date).slice(0, 10)))}
          onPick={changeDate}
          onClose={() => setRedating(false)}
        />
      )}

      {swapOpen && day && (
        <Sheet title={`להחליף את ${day.title} עם…`} onClose={() => setSwapOpen(false)}>
          {({ close }) => (<>
            <p className="dp-sheet-note" style={{ marginTop: 0 }}>
              הפעילויות של שני הימים מתחלפות. התאריכים נשארים במקומם, וכך גם הזמנות ומה שמוזמן לתאריך מסוים.
            </p>
            <div className="list-group" role="radiogroup">
              {days.filter(d => d.id !== day.id).map(d => (
                <button key={d.id} type="button" className="list-row" onClick={() => { swapWith(d); close(); }}>
                  <ArrowLeftRight size={16} className="list-row-icon" />
                  <span className="list-row-label">
                    {d.title}
                    <span className="list-row-hint">
                      {[shortDate(d.date), (d.activities || []).length ? countActs((d.activities || []).length) : 'ריק'].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>)}
        </Sheet>
      )}

      {/* ── Where to measure from ── */}
      {legFor && (() => {
        const it = itemOf(legFor);
        const leg = it && legs.get(it.key);
        if (!it || !leg || it.kind !== 'activity') return null;
        const current = it.act.travelFrom || '';
        const prevStop = (() => {
          let prev = null;
          for (const x of items) {
            if (x.key === it.key) break;
            if (x.kind === 'flight') { prev = null; continue; }
            prev = stopOf(x) || prev;
          }
          return prev;
        })();
        const q = legQuery.trim().toLowerCase();
        const places = plans
          .filter(p => p.id !== leg.to.plan?.id)
          .filter(p => !q || [p.title, p.category, p.address].some(v => (v || '').toLowerCase().includes(q)))
          .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'he'));
        const row = (key, icon, label, hint) => (
          <button key={key || 'prev'} type="button" role="radio" aria-checked={current === key} className="list-row"
            onClick={() => { if (key !== current) setTravelFrom(it.act, key); setLegFor(null); }}>
            {icon}
            <span className="list-row-label">{label}{hint && <span className="list-row-hint">{hint}</span>}</span>
            {current === key && <Check size={16} aria-hidden="true" />}
          </button>
        );
        return (
          <Sheet
            label="יוצאים מ…"
            onClose={() => setLegFor(null)}
            header={({ close }) => (
              <div className="modal-header origin-picker-head">
                <div className="origin-picker-title">
                  <div style={{ minWidth: 0 }}>
                    <h2>יוצאים מ…</h2>
                    <div className="origin-picker-sub">זמן ההגעה אל {leg.to.title}</div>
                  </div>
                  <button type="button" aria-label="סגור" className="btn-close" onClick={close}>✕</button>
                </div>
                <div className="origin-picker-search">
                  <Search size={18} aria-hidden="true" />
                  <input type="search" enterKeyHint="search" className="form-control" placeholder="חיפוש מקום ברשימה"
                    aria-label="חיפוש מקום ברשימה" value={legQuery} onChange={(e) => setLegQuery(e.target.value)} />
                </div>
              </div>
            )}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="list-group" role="radiogroup" aria-label="נקודות קבועות">
                {row('', <CornerDownLeft size={16} className="list-row-icon" />, 'מהתחנה הקודמת', prevStop ? prevStop.title : hotelStop.title)}
                {row('hotel', <Hotel size={16} className="list-row-icon" />, hotelStop.title, hotelDetails?.name || '')}
                {distanceOrigins.map(o => row(o.id, <MapPin size={16} className="list-row-icon" />, o.name, ''))}
              </div>
              <div className="list-group" role="radiogroup" aria-label="מקומות מהרשימה">
                {places.length === 0
                  ? <div className="place-picker-empty">אף מקום לא נמצא</div>
                  : places.map(p => row(`place_${p.id}`,
                    <span className="list-row-icon" style={{ color: getCategoryColor(p.category) }}>{getCategoryIcon(p.category, 16)}</span>,
                    p.title, p.category))}
              </div>
            </div>
          </Sheet>
        );
      })()}

      {/* ── Details: an activity, or a booking ── */}
      {detailKey && (() => {
        const it = itemOf(detailKey);
        if (!it) return null;
        const close = () => setDetailKey(null);
        const act = it.act || null;
        const b = it.booking || null;
        const plan = act?.placeId ? planById.get(act.placeId) : (b?.placeId ? planById.get(b.placeId) : null);
        const title = act ? (plan?.title || act.title) : b.title;
        const category = act ? (plan?.category || act.category) : null;
        const t = b ? typeOf(b.type) : null;
        const address = (act?.address || b?.address || plan?.address || '').trim();
        const navUrl = address ? mapsHref(address) : (plan ? getPlanLocations(plan)[0]?.url : null);
        const leg = legs.get(it.key);
        const v = legValue(leg);
        const elsewhere = act && !b && plan ? bookingByPlace.get(plan.id) : null;
        const actions = [];
        if (navUrl) actions.push({ key: 'nav', label: 'ניווט', Icon: Navigation, tone: 'mint', run: () => window.open(navUrl, '_blank', 'noreferrer') });
        if (b?.phone) actions.push({ key: 'tel', label: 'התקשר', Icon: Phone, tone: 'sky', run: () => { window.location.href = telHref(b.phone); } });
        if (b?.url) actions.push({ key: 'url', label: 'קישור', Icon: ExternalLink, tone: 'lavender', run: () => window.open(b.url, '_blank', 'noreferrer') });
        if (plan) actions.push({ key: 'place', label: 'פרטי המקום', Icon: MapPin, tone: 'lavender', run: () => { close(); onOpenPlace(plan.id); } });
        if (canChange(it)) actions.push({ key: 'edit', label: 'עריכה', Icon: Pencil, tone: '', run: () => { close(); setForm({ editing: act }); } });
        const shown = actions.slice(0, 4);
        return (
          <Sheet label={title} onClose={close} header={({ close: closeSheet }) => (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {act ? (
                <CategoryDisc color={getCategoryColor(category)} size={48} radius={16}>{getCategoryIcon(category, 22)}</CategoryDisc>
              ) : (
                <span className="dp-disc big" style={{ background: `${t.color}1F`, color: t.color }}><t.Icon size={22} /></span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="dp-detail-title">{title}</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {it.slot.label && <Pill size="sm" tone="sky" icon={<Clock size={11} />}>{it.slot.label}</Pill>}
                  {act?.optional && <Pill size="sm" tone="muted" icon={<CircleDashed size={11} />}>אופציונלי</Pill>}
                  {category && <Pill size="sm" style={{ background: `${getCategoryColor(category)}1F` }}>{category}</Pill>}
                  {t && <Pill size="sm" style={{ background: `${t.color}1F` }}>{t.label}</Pill>}
                  {plan?.priority === 'must' && <Pill size="sm" tone="butter" icon={<Star size={11} className="star-must" />}>חובה</Pill>}
                  {b && <Pill size="sm" tone={statusOf(b.status).tone} icon={<CalendarCheck size={11} />}>{statusOf(b.status).label}</Pill>}
                  {elsewhere && <Pill size="sm" tone="butter" icon={<CalendarClock size={11} />}>{elsewhere.date ? `ההזמנה ב־${shortDate(elsewhere.date)}` : 'הוזמן'}</Pill>}
                  {!b && !elsewhere && plan?.needsReservation && <Pill size="sm" tone="red" icon={<CalendarCheck size={11} />}>צריך לסגור מראש</Pill>}
                </div>
              </div>
              <button type="button" aria-label="סגור" className="btn-close" onClick={closeSheet} style={{ flexShrink: 0 }}>✕</button>
            </div>
          )}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {b && <BookingFacts b={b} />}

              {act && canChange(it) ? (
                <DayNote key={act.id} value={act.description || ''} place={!!plan} onSave={(text) => setNote(act, text)} />
              ) : act?.description && <p className="dp-detail-text">{act.description}</p>}
              {act && canChange(it) && (
                <div className="list-group">
                  <button type="button" role="switch" aria-checked={!!act.optional} className="list-row" onClick={() => setOptional(act, !act.optional)}>
                    <CircleDashed size={18} className="list-row-icon" />
                    <span className="list-row-label">
                      אופציונלית
                      <span className="list-row-hint">אם יהיה זמן. מסומנת בכרטיס</span>
                    </span>
                    <span className={`switch${act.optional ? ' on' : ''}`} aria-hidden="true"><i /></span>
                  </button>
                </div>
              )}
              {!act && b?.notes && <p className="dp-detail-text">{b.notes}</p>}
              {plan?.description && plan.description !== act?.description && (
                <p className="dp-detail-text muted">{plan.description}</p>
              )}

              {leg && (
                canChange(it)
                  ? <button type="button" className="travel-from" onClick={() => { close(); setLegQuery(''); setLegFor(it.key); }}>
                      <span className="travel-from-head"><span>{`זמן הגעה ${fromLabel(leg.from, v)}`}</span><ChevronDown size={14} aria-hidden="true" /></span>
                      <LegTimes v={v} />
                    </button>
                  : <div className="travel-from">
                      <span className="travel-from-head"><span>{`זמן הגעה ${fromLabel(leg.from, v)}`}</span></span>
                      <LegTimes v={v} />
                    </div>
              )}

              {leg && [leg.to, leg.from].filter(s => s.plan).map(s => ({ s, g: guessedLocation(s.plan) })).filter(x => x.g).map(({ s, g }) => (
                <div key={s.key} className="dp-guess" role="note">
                  <AlertTriangle size={16} aria-hidden="true" className="dp-guess-icon" />
                  <span className="dp-guess-text">
                    {g.hasLink
                      ? <>הקישור של <strong>{s.title}</strong> לא נפתח עדיין, ולכן בינתיים המיקום נמצא לפי השם</>
                      : g.hasAddress
                        ? <>הכתובת של <strong>{s.title}</strong> לא נמצאה, ולכן המיקום נמצא לפי השם</>
                        : <>ל<strong>{s.title}</strong> אין כתובת, ולכן המיקום נמצא לפי השם</>}
                    {g.name || g.address ? <>: <bdi>{[g.name, g.address].filter(Boolean).join(', ')}</bdi></> : ''}.
                    {' '}אם זה לא המקום, הזמן לא נכון.
                  </span>
                  <span className="dp-guess-actions">
                    {g.at && <a href={`https://www.google.com/maps/search/?api=1&query=${g.at}`} target="_blank" rel="noreferrer">איפה זה במפה</a>}
                    <button type="button" onClick={() => { close(); onOpenPlace(s.plan.id); }}>{g.hasLink || g.hasAddress ? 'תיקון הכתובת' : 'הוספת כתובת'}</button>
                  </span>
                </div>
              ))}

              {address && (
                <a href={mapsHref(address)} target="_blank" rel="noreferrer" className="dp-detail-row">
                  <span className="dp-detail-row-icon"><MapPin size={17} /></span>
                  <span>{isUrl(address) ? 'פתח בגוגל מפות' : address}</span>
                </a>
              )}

              {act && !canChange(it) && !act.description && !address && !plan && !b && (
                <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
                  אין עוד פרטים לפעילות הזו.{canChange(it) ? ' אפשר להוסיף שעה, כתובת והערות בעריכה.' : ''}
                </p>
              )}

              {shown.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${shown.length}, 1fr)`, gap: 8, marginTop: 2 }}>
                  {shown.map(({ key, label, Icon, tone, run }) => (
                    <button key={key} type="button" onClick={run} className="action-tile" style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)',
                      fontFamily: 'var(--font-hebrew)', fontSize: 12.5, fontWeight: 700,
                    }}>
                      <span className={`round-btn ${tone}`} style={{ width: 50, height: 50, minWidth: 50 }}><Icon size={20} /></span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Sheet>
        );
      })()}

      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// A change to an activity from its details. Two in a row (the note saved
// as the switch is tapped) come before the day shows the first, so each
// builds on what this phone last wrote, not on the copy from before it.
const wrote = new Map(); // activity id -> { next, at }
const lastWrite = (act) => {
  const w = wrote.get(act.id);
  return w && w.at > (act.updatedAt || 0) ? w.next : act;
};
// `undefined` in `patch` takes the field away.
function patched(act, patch) {
  const next = { ...lastWrite(act), ...patch };
  Object.keys(patch).forEach(k => { if (patch[k] === undefined) delete next[k]; });
  wrote.set(act.id, { next, at: Date.now() });
  return next;
}

// The activity's note, typed right in its details: saved on this day's
// activity (`description`), never on the place. Saved when the field is
// left, with the button, or when the sheet closes (drag, back).
function DayNote({ value, place, onSave }) {
  const [text, setText] = useState(value);
  const save = () => onSave(text.trim());
  const last = useRef({ text, onSave });
  useEffect(() => { last.current = { text, onSave }; });
  useEffect(() => () => last.current.onSave(last.current.text.trim()), []);
  return (
    <div className="dp-detail-own">
      <label className="dp-detail-own-label" htmlFor="dp-day-note">{place ? 'הערה ליום הזה (רק כאן, לא במקום ברשימה)' : 'הערה'}</label>
      <textarea
        id="dp-day-note"
        className="form-control"
        rows="2"
        placeholder="למשל: להגיע לפני 10, לקחת כרטיסים, עם מי נפגשים…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
      />
      {text.trim() !== value && (
        <button type="button" className="btn-secondary dp-detail-own-save" onMouseDown={(e) => e.preventDefault()} onClick={save}>שמירת ההערה</button>
      )}
    </div>
  );
}

function LegTimes({ v }) {
  if (!v || v.loading) return <span className="travel-from-times"><span className="dp-leg-note"><Loader2 size={12} className="spinning" aria-hidden="true" />מחשב…</span></span>;
  if (v.offline) return <span className="travel-from-times"><span className="dp-leg-note">יחושב כשיהיה חיבור</span></span>;
  if (!v.walk && !v.transit) return <span className="travel-from-times"><span className="dp-leg-note">לא נמצא מיקום לחישוב</span></span>;
  return (
    <span className="travel-from-times">
      {v.walk && <span className="dp-leg-walk big"><Footprints size={13} aria-hidden="true" />{v.walk.duration}</span>}
      {v.transit && <span className="dp-leg-transit big"><Bus size={13} aria-hidden="true" />{v.transit.duration}</span>}
    </span>
  );
}

// A booking's facts in the details: when, who, the code (a tap copies it).
function BookingFacts({ b }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(b.confirmation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* the code is on screen anyway */ }
  };
  const facts = [
    b.time && { key: 'time', Icon: Clock, text: b.time },
    b.people && { key: 'people', Icon: Users, text: `${b.people} אנשים` },
    b.bookedUnder && { key: 'name', Icon: UserRound, text: `על שם ${b.bookedUnder}` },
  ].filter(Boolean);
  return (
    <div className="dp-ticket" style={{ '--t': typeOf(b.type).color }}>
      {facts.length > 0 && (
        <div className="ticket-facts">
          {facts.map(f => <span key={f.key} className={`ticket-fact ${f.key}`}><f.Icon size={13} />{f.text}</span>)}
        </div>
      )}
      {(b.price || b.payment) && (
        <div className="ticket-pills">
          {b.price && <Pill size="sm">{b.price}</Pill>}
          {b.payment && <Pill size="sm" tone={b.payment === 'paid' ? 'mint' : 'muted'}>{PAYMENT_LABEL[b.payment]}</Pill>}
        </div>
      )}
      {b.confirmation && (
        <button type="button" className="ticket-code" onClick={copy} aria-label={`העתק מספר הזמנה ${b.confirmation}`}>
          <span className="ticket-code-label">מספר אישור</span>
          <span className="ticket-code-value">
            <span dir="ltr">{b.confirmation}</span>
            {copied ? <Check size={14} /> : <Copy size={14} className="ticket-code-copy" />}
          </span>
        </button>
      )}
    </div>
  );
}

export default React.memo(DayPlanner);
