import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import {
  Calendar, CheckCircle2, MoreHorizontal, Pencil, Trash2, ArrowLeftRight, ArrowUp, ArrowDown,
  CalendarCheck, CalendarClock, Footprints, Bus, Plane, Hotel, Star, Check, Plus, Search, MapPin,
  Navigation, Phone, ExternalLink, Copy, Users, UserRound, Sunrise, Sun, Sunset, Moon, Clock,
  ChevronDown, Loader2, CornerDownLeft,
} from 'lucide-react';
import { db } from '../firebase';
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
import { removeActivity, swapActivities, updateActivity, moveActivityToDay, swapDays } from '../lib/dayActivities';
import { dayItems, groupItems, canSwap, anchoredIds, swapDayFields, legMinutes, bookingsOn, legKey } from '../lib/dayPlan';

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
  const items = useMemo(() => (day ? dayItems({
    acts: day.activities, date: day.date || null, bookings, flights, hotel: hotelDetails,
  }) : []), [day, bookings, flights, hotelDetails]);
  const groups = useMemo(() => groupItems(items), [items]);
  const anchored = useMemo(() => (day ? anchoredIds(day.activities, day.date, bookings) : new Set()), [day, bookings]);

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
      const to = stopOf(it);
      if (!to) return;
      const custom = originOf(it.act?.travelFrom);
      const from = custom || prev || hotelStop;
      if (from.key !== to.key) out.set(it.key, { from, to, custom: !!custom, first: !prev && !custom });
      prev = to;
    });
    return out;
  }, [items, distancesOn, planById, distanceOrigins, hotelStop]); // eslint-disable-line react-hooks/exhaustive-deps

  // Measure what isn't known yet: on opening a day, after a change, and
  // again when the connection is back.
  const legSig = [...legs.values()].map(l => `${l.from.key}>${l.to.key}`).join('|');
  useEffect(() => {
    if (!legs.size) return undefined;
    const t = setTimeout(() => legs.forEach(l => measureLeg(l.from, l.to)), 0);
    return () => clearTimeout(t);
  }, [legSig, netEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  const originIds = useMemo(() => distanceOrigins.map(o => o.id), [distanceOrigins]);
  const fromLabel = (stop) => (stop.key === 'hotel'
    ? (hotelDetails?.name ? 'מהמלון' : 'ממרכז העיר')
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
  const handleInitDaysFromFlight = async () => {
    if (!tripId || !tripFlightDates.out || !tripFlightDates.ret) return;
    if (days.length > 0) {
      const ok = await confirm({
        title: 'החלפת ימי הטיול',
        message: 'כבר קיימים ימים מתוכננים. האם למחוק אותם וליצור מחדש לפי תאריכי הטיסה?',
        confirmText: 'כן, החלף',
        cancelText: 'ביטול',
        danger: true,
      });
      if (!ok) return;
    }
    const start = localDay(String(tripFlightDates.out).slice(0, 10));
    const end = localDay(String(tripFlightDates.ret).slice(0, 10));
    if (!start || !end) return;
    // One batch, not awaited: the old days go and the new ones come in the
    // same write, offline too.
    const batch = writeBatch(db);
    days.forEach(d => batch.delete(doc(db, 'trips', tripId, 'days', d.id)));
    let n = 1;
    const cur = new Date(start);
    while (cur <= end && n <= 30) {
      batch.set(doc(db, 'trips', tripId, 'days', `day-${Date.now()}-${n}`), {
        title: `יום ${n}`, date: isoDay(cur), order: n, activities: [],
      });
      cur.setDate(cur.getDate() + 1);
      n++;
    }
    batch.update(doc(db, 'trips', tripId), {
      plannerDaysFromFlight: { out: tripFlightDates.out, ret: tripFlightDates.ret },
    });
    batch.commit().catch(err => console.error('Make days failed:', err));
    setPickedId(null);
    clearTimeout(syncedTimer.current);
    setJustSynced(true);
    syncedTimer.current = setTimeout(() => setJustSynced(false), 4000);
  };

  const saveTitle = () => {
    const t = (renaming || '').trim();
    setRenaming(null);
    if (!t || !day || t === day.title) return;
    updateDoc(doc(db, 'trips', tripId, 'days', day.id), { title: t })
      .catch(err => console.error('Save day title error:', err));
  };

  const deleteDay = async () => {
    if (!day) return;
    const ok = await confirm({
      title: 'מחיקת יום טיול',
      message: <>האם למחוק את <strong>{day.title || 'היום'}</strong> וכל הפעילויות שבו?</>,
      confirmText: 'מחק יום',
      cancelText: 'בטל',
      danger: true,
    });
    if (!ok) return;
    const next = days[dayIdx + 1] || days[dayIdx - 1];
    if (next) pick(next.id);
    deleteDoc(doc(db, 'trips', tripId, 'days', day.id)).catch(err => console.error('Delete day error:', err));
  };

  // The days and bookings as they are now, for an undo that runs after
  // the change came back (read when it runs, never while rendering).
  const latest = useRef({ days, bookings });
  useEffect(() => { latest.current = { days, bookings }; });

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
    removeActivity(db, tripId, day.id, day.rawActivities, act.id, !canEdit)
      .catch(err => console.error('Activity delete error:', err));
  };

  const moveTo = (act, target) => {
    const fromId = day.id;
    moveActivityToDay(db, tripId, day, target, act.id, !canEdit)
      .catch(err => console.error('Move to day failed:', err));
    say({
      icon: <Calendar size={18} />,
      title: `${act.title} עבר ל${target.title}${target.date ? ` (${shortDate(target.date)})` : ''}`,
      action: {
        label: 'ביטול',
        run: () => {
          const ds = latest.current.days;
          const from = ds.find(d => d.id === target.id);
          const back = ds.find(d => d.id === fromId);
          if (from && back) {
            moveActivityToDay(db, tripId, from, back, act.id, !canEdit)
              .catch(err => console.error('Move back failed:', err));
          }
        },
      },
    });
  };

  const setTravelFrom = (act, key) => {
    updateActivity(db, tripId, day.id, day.rawActivities, { ...act, travelFrom: key || null }, !canEdit)
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
  const legChip = (it) => {
    const leg = legs.get(it.key);
    if (!leg) return null;
    const v = legValue(leg);
    const canPick = it.kind === 'activity' && mine(it.act);
    const fromText = leg.custom || leg.first || leg.from.key === 'hotel' ? fromLabel(leg.from) : '';
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
      {canPick && <ChevronDown size={13} aria-hidden="true" className="dp-leg-chev" />}
    </>);
    return (
      <div className="dp-row dp-leg-row">
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

  const renderItem = (it) => {
    const time = it.slot.minutes != null ? it.slot.label : '';
    if (it.kind === 'flight' || it.kind === 'hotel') {
      const f = it.flight;
      const isFlight = it.kind === 'flight';
      const title = isFlight
        ? (it.leg === 'out' ? `טיסה ל${f.arrAirport?.city || 'יעד'}` : `טיסה ל${f.arrAirport?.city || 'הבית'}`)
        : (it.what === 'in' ? 'צ׳ק־אין במלון' : 'צ׳ק־אאוט מהמלון');
      const route = isFlight && f.depAirport?.code && f.arrAirport?.code ? `${f.depAirport.code} → ${f.arrAirport.code}` : '';
      const sub = isFlight
        ? <>{[f.flightNumber, time ? `המראה ${time}` : ''].filter(Boolean).join(' · ')}{route && <>{' · '}<bdi dir="ltr">{route}</bdi></>}</>
        : (it.hotel?.name || '');
      return (
        <div key={it.key} className="dp-row">
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
          {legChip(it)}
          <div className="dp-row">
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
        {legChip(it)}
        <div className="dp-row">
          <span className="dp-rail" aria-hidden="true">
            <span className="dp-time">{time}</span>
          </span>
          <div className={`dp-card${visited ? ' visited' : ''}${it.booking ? ' booked' : ''}`} style={{ '--c': color }}>
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
                {(visited || toBook || elsewhere || it.slot.custom) && (
                  <span className="dp-card-tags">
                    {it.slot.custom && <Pill size="sm" tone="sky" icon={<Clock size={11} />}>{it.slot.label}</Pill>}
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
            {mine(act) && (
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
  const syncable = canEdit && tripFlightDates.out && tripFlightDates.ret &&
    !(tripFlightDates.plannerSync?.out === tripFlightDates.out && tripFlightDates.plannerSync?.ret === tripFlightDates.ret);
  const dayDate = day?.date ? localDay(day.date) : null;
  const dayW = day?.date ? weatherByDate[day.date] : null;
  const actCount = day ? (day.activities || []).length : 0;
  const bookingCount = items.filter(it => it.booking).length;

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

      {canEdit && <Fab label="יום חדש" onClick={handleAddDay} />}

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
          ) : null}
        />
      ) : (<>
        {/* The days */}
        <div className="dp-strip hide-scroll" role="tablist" aria-label="ימי הטיול" ref={stripRef}>
          {days.map((d, i) => {
            const dd = d.date ? localDay(d.date) : null;
            const w = d.date ? weatherByDate[d.date] : null;
            const n = (d.activities || []).length + bookingsOn(bookings, d.date).filter(b => !b.placeId || !(d.activities || []).some(a => a.placeId === b.placeId)).length;
            const on = d.id === day.id;
            return (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={`${d.title}${d.date ? `, ${shortDate(d.date)}` : ''}`}
                className={`dp-chip${d.date === today ? ' today' : ''}${d.date && d.date < today ? ' past' : ''}`}
                onClick={() => pick(d.id)}
              >
                <span className="dp-chip-top">{dd ? DOW[dd.getDay()] : 'יום'}</span>
                <span className="dp-chip-num">{dd ? dd.getDate() : i + 1}</span>
                <span className="dp-chip-bottom">
                  {w ? <>{getWeatherIcon(w.code)} {w.max}°</> : dd ? shortMonth(dd) : ' '}
                </span>
                <span className="dp-chip-dots" aria-hidden="true">
                  {Array.from({ length: Math.min(n, 4) }, (_, k) => <i key={k} />)}
                </span>
              </button>
            );
          })}
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
            {canEdit && (
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
            <p className="dp-empty">אין עדיין פעילויות ליום זה.</p>
          )}

          {canAdd && (
            <button type="button" className="dp-add" onClick={() => setForm({ editing: null })}>
              <Plus size={16} />
              <span>הוסף פעילות</span>
            </button>
          )}
        </section>
      </>)}

      {/* ── Adding / editing an activity ── */}
      {form && day && (
        <ActivitySheet
          tripId={tripId}
          day={day}
          editing={form.editing}
          plans={plans}
          categories={categories}
          usedOn={usedOn}
          canEdit={canEdit}
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
        const at = g ? g.items.indexOf(it) : -1;
        const up = at > 0 && canSwap(g.items[at - 1], it) ? g.items[at - 1] : null;
        const down = g && canSwap(it, g.items[at + 1]) ? g.items[at + 1] : null;
        const fixed = anchored.has(act.id);
        return (
          <Sheet title={act.title} onClose={() => setActMenu(null)}>
            <div className="list-group">
              {[
                ...(canEdit ? [
                  { key: 'up', label: 'הזז למעלה', Icon: ArrowUp, disabled: !up,
                    run: () => swapActivities(db, tripId, day.id, day.rawActivities, act.id, up.act.id).catch(err => console.error('Activity move error:', err)) },
                  { key: 'down', label: 'הזז למטה', Icon: ArrowDown, disabled: !down,
                    run: () => swapActivities(db, tripId, day.id, day.rawActivities, act.id, down.act.id).catch(err => console.error('Activity move error:', err)) },
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
            {canEdit && (!up || !down) && (it.slot.minutes != null || it.booking) && (
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
              {days.length > 1 && (
                <button type="button" className="list-row" onClick={() => { close(); setSwapOpen(true); }}>
                  <ArrowLeftRight size={18} className="list-row-icon" />
                  <span className="list-row-label">
                    החלפה עם יום אחר
                    <span className="list-row-hint">הפעילויות מתחלפות, התאריכים וההזמנות נשארים</span>
                  </span>
                </button>
              )}
              <button type="button" className="list-row danger" onClick={() => { close(); deleteDay(); }}>
                <Trash2 size={18} className="list-row-icon" />
                <span className="list-row-label">מחיקת היום</span>
              </button>
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
        if (act && mine(act)) actions.push({ key: 'edit', label: 'עריכה', Icon: Pencil, tone: '', run: () => { close(); setForm({ editing: act }); } });
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

              {act?.description && <p className="dp-detail-text">{act.description}</p>}
              {!act && b?.notes && <p className="dp-detail-text">{b.notes}</p>}
              {plan?.description && plan.description !== act?.description && (
                <p className="dp-detail-text muted">{plan.description}</p>
              )}

              {leg && (
                (act && mine(act))
                  ? <button type="button" className="travel-from" onClick={() => { close(); setLegQuery(''); setLegFor(it.key); }}>
                      <span className="travel-from-head"><span>{`זמן הגעה ${fromLabel(leg.from)}`}</span><ChevronDown size={14} aria-hidden="true" /></span>
                      <LegTimes v={v} />
                    </button>
                  : <div className="travel-from">
                      <span className="travel-from-head"><span>{`זמן הגעה ${fromLabel(leg.from)}`}</span></span>
                      <LegTimes v={v} />
                    </div>
              )}

              {address && (
                <a href={mapsHref(address)} target="_blank" rel="noreferrer" className="dp-detail-row">
                  <span className="dp-detail-row-icon"><MapPin size={17} /></span>
                  <span>{isUrl(address) ? 'פתח בגוגל מפות' : address}</span>
                </a>
              )}

              {act && !act.description && !address && !plan && !b && (
                <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
                  אין עוד פרטים לפעילות הזו.{mine(act) ? ' אפשר להוסיף שעה, כתובת והערות בעריכה.' : ''}
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
