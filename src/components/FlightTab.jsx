import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { formatOffsetFromIsrael, toTime24, parseUtcOffset } from '../services/flightTime';
import { lookupFlightLive, normaliseFlightNumber } from '../services/flightApi';
import Sheet from '../ui/Sheet';
import { useTrip } from '../TripContext';
import { WeatherChip, InfoCard } from './TripHeaderInfo';
import Fab from './Fab';
import Skeleton from './Skeleton';
import Notice from '../ui/Notice';
import { CustomDatePicker, CustomDateTimePicker, CustomTimePicker, CustomDropdown } from './CustomDatePicker';
import {
  MapPin,
  Pencil,
  Building,
  Loader2,
  Search,
  Plane,
  PlaneTakeoff,
  PlaneLanding,
  RefreshCw,
  ExternalLink,
  Link2,
} from 'lucide-react';

const FLIGHT_STATUS_OPTIONS = [
  { value: 'בזמן', label: 'בזמן' },
  { value: 'באיחור קל', label: 'באיחור קל' },
  { value: 'באיחור רציני', label: 'באיחור רציני' },
  { value: 'בוטלה', label: 'בוטלה' },
  { value: 'נחתה', label: 'נחתה' },
  { value: 'בטיסה', label: 'בטיסה' },
];

const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export const defaultTrip = {
  id: 'prague',
  name: 'פראג - סוף שבוע אירופאי קלאסי',
  destination: 'פראג, צ\'כיה',
  dates: '15.06.2026 - 22.06.2026',
  outboundFlightDetails: {
    flightNumber: 'OK983',
    airline: 'Czech Airlines',
    depAirport: { code: 'TLV', city: 'תל אביב', name: 'Ben Gurion Airport', lat: 32.0055, lng: 34.8854, timezone: 'UTC +03:00' },
    arrAirport: { code: 'PRG', city: 'פראג', name: 'Václav Havel Airport Prague', lat: 50.1008, lng: 14.2600, timezone: 'UTC +02:00' },
    scheduledDep: '07:30 AM',
    actualDep: '07:35 AM',
    scheduledArr: '10:45 AM',
    estimatedArr: '10:40 AM',
    status: 'בזמן',
    aircraftType: 'Airbus A320-214',
    registration: 'OK-HEU',
    serialNumber: '5421',
    country: 'צ\'כיה',
    date: '2026-06-15',
    gate: 'B12'
  },
  returnFlightDetails: {
    flightNumber: 'OK984',
    airline: 'Czech Airlines',
    depAirport: { code: 'PRG', city: 'פראג', name: 'Václav Havel Airport Prague', lat: 50.1008, lng: 14.2600, timezone: 'UTC +02:00' },
    arrAirport: { code: 'TLV', city: 'תל אביב', name: 'Ben Gurion Airport', lat: 32.0055, lng: 34.8854, timezone: 'UTC +03:00' },
    scheduledDep: '11:55 AM',
    actualDep: '12:00 PM',
    scheduledArr: '04:50 PM',
    estimatedArr: '04:45 PM',
    status: 'בזמן',
    aircraftType: 'Airbus A320-214',
    registration: 'OK-HEU',
    serialNumber: '5421',
    country: 'צ\'כיה',
    date: '2026-06-22',
    gate: 'A4'
  },
  hotelDetails: {
    name: 'Grandium Hotel Prague',
    address: 'Politických vězňů 913/12, 110 00 Nové Město, Prague, Czech Republic',
    link: 'https://www.grandium.cz/',
    checkIn: '2026-06-15T14:00',
    checkOut: '2026-06-22T12:00',
    roomNumber: '308',
    notes: 'מלון 5 כוכבים במרכז העיר, קרוב לכיכר ואצלב. ארוחת בוקר כלולה.'
  }
};

const emptyFlightDetails = {
  flightNumber: '',
  airline: '',
  depAirport: { code: '', city: '', name: '', lat: 0, lng: 0, timezone: 'UTC +02:00' },
  arrAirport: { code: '', city: '', name: '', lat: 0, lng: 0, timezone: 'UTC +02:00' },
  scheduledDep: '',
  actualDep: '',
  scheduledArr: '',
  estimatedArr: '',
  status: 'בזמן',
  date: '',
  gate: ''
};

const emptyHotelDetails = {
  name: '',
  address: '',
  link: '',
  checkIn: '',
  checkOut: '',
  roomNumber: '',
  notes: ''
};

// Format date as DD.MM.YYYY for the trip "dates" summary string
function formatDateRange(out, ret) {
  const fmt = (s) => {
    if (!s) return '';
    const [y, m, d] = s.split('-');
    if (!y || !m || !d) return '';
    return `${d}.${m}.${y}`;
  };
  const a = fmt(out);
  const b = fmt(ret);
  if (a && b) return `${a} - ${b}`;
  return a || b || '';
}

// Parse "07:35", "07:35 AM" etc. to minutes since midnight.
function timeToMinutes(t) {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const period = (m[3] || '').toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + mins;
}

// Compute the difference (in minutes) between scheduled and updated times,
// rounding for next-day rollover (e.g. scheduled 23:50 -> actual 00:10).
function deltaMinutes(scheduled, actual) {
  const s = timeToMinutes(scheduled);
  const a = timeToMinutes(actual);
  if (s == null || a == null) return null;
  let diff = a - s;
  if (diff < -12 * 60) diff += 24 * 60;       // crossed midnight forward
  else if (diff > 12 * 60) diff -= 24 * 60;   // wrapped backward
  return diff;
}

function formatDelta(mins) {
  if (mins == null || mins === 0) return null;
  const abs = Math.abs(mins);
  if (abs >= 60) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    const body = m ? `${h}:${String(m).padStart(2, '0')} שע'` : `${h} שע'`;
    return mins > 0 ? `+${body}` : `−${body}`;
  }
  return mins > 0 ? `+${abs} דק'` : `−${abs} דק'`;
}

// One slot for an event time: shows the most up-to-date time,
// highlighted red on delay, green on "earlier than scheduled",
// strike-through if cancelled.
function useTimeState({ scheduled, updated, cancelled, flightDate }) {
  // Suppress delay/early chip for flights more than 18h in the future.
  // Real airlines virtually never announce schedule changes that far
  // out; any divergence at that range is almost certainly stale data
  // (either from a previous fake-delay generator or from before the
  // current refresh fixed it). For "imminent" flights, deltas are real.
  let suppressDelta = false;
  if (flightDate) {
    const dep = new Date(flightDate + 'T00:00:00').getTime();
    const hours = (dep - Date.now()) / 3600000;
    if (hours > 18) suppressDelta = true;
  }
  const effective = updated || scheduled;
  const delta = suppressDelta ? null : deltaMinutes(scheduled, updated);
  const delayed = delta != null && delta > 0;
  const early = delta != null && delta < 0;

  let color = 'var(--primary)';
  let chipBg = null;
  let chipColor = null;
  if (cancelled) color = 'var(--c-red)';
  else if (delayed) { color = 'var(--c-red)'; chipBg = 'var(--c-red-10)'; chipColor = 'var(--c-red)'; }
  else if (early) { chipBg = 'var(--c-teal-10)'; chipColor = 'var(--text-success)'; }

  // When the chip is suppressed, also show the *scheduled* time rather
  // than a stale "updated" value (otherwise the row would silently
  // display fake numbers without explanation).
  const display = cancelled ? '—' : (suppressDelta ? (scheduled || effective || '—') : (effective || '—'));

  return { display, delta, delayed, early, color, chipBg, chipColor, cancelled };
}

/* One end of the route: the time, big, with its delay chip underneath.
   The airport sits above it in the card, so this block carries only what
   changes — which is what you check when you glance at the card. */
function RouteTime({ scheduled, updated, cancelled, flightDate, align = 'right' }) {
  const t = useTimeState({ scheduled, updated, cancelled, flightDate });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 3 }}>
      <span style={{
        fontSize: 26, fontWeight: 900, lineHeight: 1,
        color: t.color,
        textDecoration: t.cancelled ? 'line-through' : 'none',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.5px',
      }}>
        {t.display}
      </span>
      {t.delta != null && t.delta !== 0 && !t.cancelled && (
        <span style={{
          background: t.chipBg, color: t.chipColor,
          fontSize: 11, fontWeight: 800,
          padding: '2px 7px', borderRadius: 999,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          {formatDelta(t.delta)}
          {t.delayed && <span style={{ opacity: 0.75 }}>מעודכן</span>}
        </span>
      )}
    </div>
  );
}

// Live ticking clock for an airport, based on a "UTC ±HH:MM" string.
function LocalClock({ timezone }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!timezone) return null;
  const offsetH = parseUtcOffset(timezone);
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const local = new Date(utcMs + offsetH * 3600000);
  const hh = String(local.getHours()).padStart(2, '0');
  const mm = String(local.getMinutes()).padStart(2, '0');
  const ss = String(local.getSeconds()).padStart(2, '0');
  return (
    <span style={{
      fontFamily: 'monospace',
      fontVariantNumeric: 'tabular-nums',
      fontSize: 12,
      fontWeight: 800,
      color: 'var(--accent)',
      letterSpacing: '0.5px',
    }}>
      {hh}:{mm}:{ss}
    </span>
  );
}

export default function FlightTab({ tripId }) {
  const { canEdit, ownerProfile } = useTrip();
  const [tripData, setTripData] = useState(null);
  // Snapshot of the form state when the modal opened, used to detect
  // unsaved changes when the user tries to close it.
  const initialFormSnapshot = useRef(null);
  // The airports the form opened with, to tell what the lookup changed.
  const openAirports = useRef({ out: {}, ret: {} });
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  // 'all' | 'trip' | 'outbound' | 'return' | 'hotel'
  const [editScope, setEditScope] = useState('all');
  const [formTripName, setFormTripName] = useState('');
  const [lookupBusyOut, setLookupBusyOut] = useState(false);
  const [lookupBusyRet, setLookupBusyRet] = useState(false);
  // After a search: { kind: 'found'|'generated'|'empty', flightNumber, airline, route }
  const [lookupResultOut, setLookupResultOut] = useState(null);
  const [lookupResultRet, setLookupResultRet] = useState(null);

  // Outbound Flight Form States — only user-editable fields
  const [formOutFlightNum, setFormOutFlightNum] = useState('');
  const [formOutAirline, setFormOutAirline] = useState('');
  const [formOutDepTz, setFormOutDepTz] = useState('UTC +02:00');
  const [formOutArrTz, setFormOutArrTz] = useState('UTC +02:00');
  const [formOutSchedDep, setFormOutSchedDep] = useState('');
  const [formOutActDep, setFormOutActDep] = useState('');
  const [formOutSchedArr, setFormOutSchedArr] = useState('');
  const [formOutEstArr, setFormOutEstArr] = useState('');
  const [formOutStatus, setFormOutStatus] = useState('בזמן');
  const [formOutDate, setFormOutDate] = useState('');
  const [formOutGate, setFormOutGate] = useState('');
  // Hidden (auto-filled by lookup, used for the map)
  const outAirportsRef = useRef({
    dep: { code: '', city: '', name: '', lat: 0, lng: 0, timezone: 'UTC +02:00' },
    arr: { code: '', city: '', name: '', lat: 0, lng: 0, timezone: 'UTC +02:00' }
  });

  // Return Flight Form States
  const [formRetFlightNum, setFormRetFlightNum] = useState('');
  const [formRetAirline, setFormRetAirline] = useState('');
  const [formRetDepTz, setFormRetDepTz] = useState('UTC +02:00');
  const [formRetArrTz, setFormRetArrTz] = useState('UTC +02:00');
  const [formRetSchedDep, setFormRetSchedDep] = useState('');
  const [formRetActDep, setFormRetActDep] = useState('');
  const [formRetSchedArr, setFormRetSchedArr] = useState('');
  const [formRetEstArr, setFormRetEstArr] = useState('');
  const [formRetStatus, setFormRetStatus] = useState('בזמן');
  const [formRetDate, setFormRetDate] = useState('');
  const [formRetGate, setFormRetGate] = useState('');
  const retAirportsRef = useRef({
    dep: { code: '', city: '', name: '', lat: 0, lng: 0, timezone: 'UTC +02:00' },
    arr: { code: '', city: '', name: '', lat: 0, lng: 0, timezone: 'UTC +02:00' }
  });

  // Hotel Form States
  const [formHotelName, setFormHotelName] = useState('');
  const [formHotelAddress, setFormHotelAddress] = useState('');
  const [formHotelCheckIn, setFormHotelCheckIn] = useState('');
  const [formHotelCheckOut, setFormHotelCheckOut] = useState('');
  const [formHotelRoom, setFormHotelRoom] = useState('');
  const [formHotelNotes, setFormHotelNotes] = useState('');
  const [formHotelLink, setFormHotelLink] = useState('');

  // When the outbound flight date changes, slide the hotel check-in to
  // the same calendar day (preserving the previously-picked time, or
  // defaulting to 14:00 — standard hotel check-in). Same for return
  // flight → check-out (default 12:00).
  const syncOutboundDate = (newDate) => {
    setFormOutDate(newDate);
    if (!newDate) return;
    const time = (formHotelCheckIn || '').split('T')[1] || '14:00';
    setFormHotelCheckIn(`${newDate}T${time}`);
  };
  const syncReturnDate = (newDate) => {
    setFormRetDate(newDate);
    if (!newDate) return;
    const time = (formHotelCheckOut || '').split('T')[1] || '12:00';
    setFormHotelCheckOut(`${newDate}T${time}`);
  };

  const Banner = ({ tone, children }) => <Notice tone={tone} style={{ marginTop: 8 }}>{children}</Notice>;

  const renderLookupFeedback = (result) => {
    if (!result) return null;
    switch (result.kind) {
      case 'empty':
        return <Banner tone="warn">הזן מספר טיסה לפני החיפוש.</Banner>;
      case 'live':
        return <Banner tone="success">נתונים בזמן אמת: {result.flightNumber} · {result.airline} · {result.route}</Banner>;
      case 'no-key':
        return <Banner tone="warn">חיפוש חי אינו זמין (חסר מפתח API מובנה). אפשר למלא את הפרטים ידנית.</Banner>;
      case 'no-results':
        return <Banner tone={result.message ? 'info' : 'warn'}>
          {result.message
            ? result.message
            : 'AeroDataBox לא מצא את הטיסה בתאריך שצוין. נסה תאריך מדויק לטיסה (התאריך שמופיע בכרטיס שלך).'}
        </Banner>;
      case 'http-error':
        return <Banner tone="error">{result.message}</Banner>;
      case 'network-error':
        return <Banner tone="offline">{result.message}</Banner>;
      default:
        return null;
    }
  };

  const resultFromWrapper = (wrapper) => {
    const flight = wrapper?.flight || null;
    const route = flight ? `${flight.depAirport?.code} → ${flight.arrAirport?.code}` : '';
    switch (wrapper?.status) {
      case 'api':
        return { kind: 'live', flightNumber: flight?.flightNumber, airline: flight?.airline, route };
      case 'no-key':
        return { kind: 'no-key', flightNumber: flight?.flightNumber, airline: flight?.airline, route };
      case 'no-results':
        return { kind: 'no-results', message: wrapper.message };
      case 'http-error':
        return { kind: 'http-error', message: wrapper.message, code: wrapper.code };
      case 'network-error':
        return { kind: 'network-error', message: wrapper.message };
      default:
        return null;
    }
  };

  const runLookup = (which) => {
    if (which === 'out') {
      const num = (formOutFlightNum || '').trim().toUpperCase();
      if (!num) {
        setLookupResultOut({ kind: 'empty' });
        return;
      }
      setLookupBusyOut(true);
      setLookupResultOut(null);
      lookupFlightLive(num, formOutDate)
        .then(wrap => {
          if (wrap?.status === 'api') applyLookup('out', wrap.flight);
          setLookupResultOut(resultFromWrapper(wrap));
        })
        .finally(() => setLookupBusyOut(false));
    } else {
      const num = (formRetFlightNum || '').trim().toUpperCase();
      if (!num) {
        setLookupResultRet({ kind: 'empty' });
        return;
      }
      setLookupBusyRet(true);
      setLookupResultRet(null);
      lookupFlightLive(num, formRetDate)
        .then(wrap => {
          if (wrap?.status === 'api') applyLookup('ret', wrap.flight);
          setLookupResultRet(resultFromWrapper(wrap));
        })
        .finally(() => setLookupBusyRet(false));
    }
  };

  // Refresh a saved flight's live data (called from card refresh button + auto-refresh).
  // Only a real answer from the API is written, and only the fields it
  // changed, by path. A lookup that failed (offline, quota, no schedule yet)
  // leaves the saved flight as it is.
  const [refreshingOut, setRefreshingOut] = useState(false);
  const [refreshingRet, setRefreshingRet] = useState(false);
  const refreshFlight = async (kind) => {
    if (!tripId || !tripData || !canEdit) return;
    const field = kind === 'outbound' ? 'outboundFlightDetails' : 'returnFlightDetails';
    const flight = tripData[field];
    if (!flight?.flightNumber) return;
    const setBusy = kind === 'outbound' ? setRefreshingOut : setRefreshingRet;
    setBusy(true);
    try {
      const wrap = await lookupFlightLive(flight.flightNumber, flight.date);
      const res = wrap?.status === 'api' ? wrap.flight : null;
      // The leg was edited while the API answered: this answer is for the old one.
      const now = latestTrip.current?.[field];
      if (!res || now?.flightNumber !== flight.flightNumber || now?.date !== flight.date) return;
      const updates = {};
      for (const key of ['airline', 'scheduledDep', 'actualDep', 'scheduledArr', 'estimatedArr', 'status', 'gate']) {
        if (res[key] && res[key] !== now[key]) updates[`${field}.${key}`] = res[key];
      }
      for (const key of ['depAirport', 'arrAirport']) {
        // What the API left out (no coordinates, no country) keeps the saved value.
        const known = Object.fromEntries(Object.entries(res[key] || {}).filter(([, v]) => v));
        const merged = { ...(now[key] || {}), ...known };
        if (JSON.stringify(merged) !== JSON.stringify(now[key] || {})) updates[`${field}.${key}`] = merged;
      }
      updates[`${field}.lastRefreshed`] = new Date().toISOString();
      updateDoc(doc(db, 'trips', tripId), updates).catch(err => console.error('Flight refresh save error:', err));
    } finally {
      setBusy(false);
    }
  };

  // The interval below outlives renders, so it reads the trip and calls the
  // refresh through refs. With the render's own copies it kept the trip as it
  // was when the tab opened.
  const latestTrip = useRef(null);
  const refreshRef = useRef(refreshFlight);
  useEffect(() => {
    latestTrip.current = tripData;
    refreshRef.current = refreshFlight;
  });

  // Auto-refresh every 5 minutes (always on — API key is baked in)
  useEffect(() => {
    if (!tripId) return;
    const interval = setInterval(() => {
      refreshRef.current('outbound');
      refreshRef.current('return');
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [tripId]);

  // Listen to Firestore
  useEffect(() => {
    if (!tripId) return;
    const docRef = doc(db, 'trips', tripId);
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists() && docSnap.data().outboundFlightDetails) {
        setTripData(docSnap.data());
        setLoading(false);
      } else {
        setLoading(true);
        const currentData = docSnap.data() || {};
        // Always seed EMPTY details — never copy any other trip's data in.
        // Each trip is fully self-contained.
        await setDoc(docRef, {
          outboundFlightDetails: emptyFlightDetails,
          returnFlightDetails: emptyFlightDetails,
          hotelDetails: emptyHotelDetails,
          ...currentData
        }, { merge: true });
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [tripId]);

  const applyLookup = (which, simResult) => {
    if (!simResult) return;
    if (which === 'out') {
      setFormOutAirline(simResult.airline || '');
      setFormOutDepTz(simResult.depAirport?.timezone || 'UTC +02:00');
      setFormOutArrTz(simResult.arrAirport?.timezone || 'UTC +02:00');
      setFormOutSchedDep(simResult.scheduledDep || '');
      setFormOutActDep(simResult.actualDep || '');
      setFormOutSchedArr(simResult.scheduledArr || '');
      setFormOutEstArr(simResult.estimatedArr || '');
      setFormOutStatus(simResult.status || 'בזמן');
      setFormOutGate(simResult.gate || '');
      outAirportsRef.current = {
        dep: simResult.depAirport || outAirportsRef.current.dep,
        arr: simResult.arrAirport || outAirportsRef.current.arr,
      };
    } else {
      setFormRetAirline(simResult.airline || '');
      setFormRetDepTz(simResult.depAirport?.timezone || 'UTC +02:00');
      setFormRetArrTz(simResult.arrAirport?.timezone || 'UTC +02:00');
      setFormRetSchedDep(simResult.scheduledDep || '');
      setFormRetActDep(simResult.actualDep || '');
      setFormRetSchedArr(simResult.scheduledArr || '');
      setFormRetEstArr(simResult.estimatedArr || '');
      setFormRetStatus(simResult.status || 'בזמן');
      setFormRetGate(simResult.gate || '');
      retAirportsRef.current = {
        dep: simResult.depAirport || retAirportsRef.current.dep,
        arr: simResult.arrAirport || retAirportsRef.current.arr,
      };
    }
  };

  // Lookup is triggered explicitly by the "חפש" button — no noisy auto-lookup
  // on every keystroke (which previously made the form flicker between flights).

  const openEditModal = (scope = 'all') => {
    if (!canEdit) return;
    setEditScope(scope);
    if (!tripData) return;
    const out = tripData.outboundFlightDetails || emptyFlightDetails;
    const ret = tripData.returnFlightDetails || emptyFlightDetails;
    const htl = tripData.hotelDetails || emptyHotelDetails;

    setFormTripName(tripData.name || '');

    setFormOutFlightNum(out.flightNumber || '');
    setFormOutAirline(out.airline || '');
    setFormOutDepTz(out.depAirport?.timezone || 'UTC +02:00');
    setFormOutArrTz(out.arrAirport?.timezone || 'UTC +02:00');
    setFormOutSchedDep(toTime24(out.scheduledDep));
    setFormOutActDep(toTime24(out.actualDep));
    setFormOutSchedArr(toTime24(out.scheduledArr));
    setFormOutEstArr(toTime24(out.estimatedArr));
    setFormOutStatus(out.status || 'בזמן');
    setFormOutDate(out.date || '');
    setFormOutGate(out.gate || '');
    outAirportsRef.current = {
      dep: out.depAirport || outAirportsRef.current.dep,
      arr: out.arrAirport || outAirportsRef.current.arr,
    };

    setFormRetFlightNum(ret.flightNumber || '');
    setFormRetAirline(ret.airline || '');
    setFormRetDepTz(ret.depAirport?.timezone || 'UTC +02:00');
    setFormRetArrTz(ret.arrAirport?.timezone || 'UTC +02:00');
    setFormRetSchedDep(toTime24(ret.scheduledDep));
    setFormRetActDep(toTime24(ret.actualDep));
    setFormRetSchedArr(toTime24(ret.scheduledArr));
    setFormRetEstArr(toTime24(ret.estimatedArr));
    setFormRetStatus(ret.status || 'בזמן');
    setFormRetDate(ret.date || '');
    setFormRetGate(ret.gate || '');
    retAirportsRef.current = {
      dep: ret.depAirport || retAirportsRef.current.dep,
      arr: ret.arrAirport || retAirportsRef.current.arr,
    };

    setFormHotelName(htl.name || '');
    setFormHotelAddress(htl.address || '');
    setFormHotelLink(htl.link || '');
    setFormHotelCheckIn(htl.checkIn || '');
    setFormHotelCheckOut(htl.checkOut || '');
    setFormHotelRoom(htl.roomNumber || '');
    setFormHotelNotes(htl.notes || '');

    openAirports.current = { out: outAirportsRef.current, ret: retAirportsRef.current };

    // Snapshot the seeded form values so we can detect unsaved changes.
    initialFormSnapshot.current = JSON.stringify({
      formTripName: tripData.name || '',
      formOutFlightNum: out.flightNumber || '',
      formOutAirline: out.airline || '',
      formOutDepTz: out.depAirport?.timezone || 'UTC +02:00',
      formOutArrTz: out.arrAirport?.timezone || 'UTC +02:00',
      formOutSchedDep: out.scheduledDep || '',
      formOutActDep: out.actualDep || '',
      formOutSchedArr: out.scheduledArr || '',
      formOutEstArr: out.estimatedArr || '',
      formOutStatus: out.status || 'בזמן',
      formOutDate: out.date || '',
      formOutGate: out.gate || '',
      formRetFlightNum: ret.flightNumber || '',
      formRetAirline: ret.airline || '',
      formRetDepTz: ret.depAirport?.timezone || 'UTC +02:00',
      formRetArrTz: ret.arrAirport?.timezone || 'UTC +02:00',
      formRetSchedDep: ret.scheduledDep || '',
      formRetActDep: ret.actualDep || '',
      formRetSchedArr: ret.scheduledArr || '',
      formRetEstArr: ret.estimatedArr || '',
      formRetStatus: ret.status || 'בזמן',
      formRetDate: ret.date || '',
      formRetGate: ret.gate || '',
      formHotelName: htl.name || '',
      formHotelAddress: htl.address || '',
      formHotelLink: htl.link || '',
      formHotelCheckIn: htl.checkIn || '',
      formHotelCheckOut: htl.checkOut || '',
      formHotelRoom: htl.roomNumber || '',
      formHotelNotes: htl.notes || '',
    });

    setShowEditModal(true);
  };

  const currentFormSerialized = () => JSON.stringify({
    formTripName, formOutFlightNum, formOutAirline, formOutDepTz, formOutArrTz,
    formOutSchedDep, formOutActDep, formOutSchedArr, formOutEstArr, formOutStatus,
    formOutDate, formOutGate, formRetFlightNum, formRetAirline, formRetDepTz,
    formRetArrTz, formRetSchedDep, formRetActDep, formRetSchedArr, formRetEstArr,
    formRetStatus, formRetDate, formRetGate, formHotelName, formHotelAddress, formHotelLink,
    formHotelCheckIn, formHotelCheckOut, formHotelRoom, formHotelNotes,
  });

  // Nothing to lose until the form differs from what it opened with.
  const editDirty = !!initialFormSnapshot.current && currentFormSerialized() !== initialFormSnapshot.current;

  // What the form writes, from one set of its values (the keys of
  // currentFormSerialized) and the airports the lookup filled in.
  const formPayload = (v, outAirports, retAirports) => ({
    name: v.formTripName,
    dates: formatDateRange(v.formOutDate, v.formRetDate),
    outboundFlightDetails: {
      // Store the compact designator so saved flights always match what the
      // lookup and refresh calls send.
      flightNumber: normaliseFlightNumber(v.formOutFlightNum),
      airline: v.formOutAirline,
      depAirport: { ...outAirports.dep, timezone: v.formOutDepTz },
      arrAirport: { ...outAirports.arr, timezone: v.formOutArrTz },
      scheduledDep: v.formOutSchedDep,
      actualDep: v.formOutActDep,
      scheduledArr: v.formOutSchedArr,
      estimatedArr: v.formOutEstArr,
      status: v.formOutStatus,
      date: v.formOutDate,
      gate: v.formOutGate
    },
    returnFlightDetails: {
      flightNumber: normaliseFlightNumber(v.formRetFlightNum),
      airline: v.formRetAirline,
      depAirport: { ...retAirports.dep, timezone: v.formRetDepTz },
      arrAirport: { ...retAirports.arr, timezone: v.formRetArrTz },
      scheduledDep: v.formRetSchedDep,
      actualDep: v.formRetActDep,
      scheduledArr: v.formRetSchedArr,
      estimatedArr: v.formRetEstArr,
      status: v.formRetStatus,
      date: v.formRetDate,
      gate: v.formRetGate
    },
    hotelDetails: {
      name: v.formHotelName,
      address: v.formHotelAddress,
      link: v.formHotelLink,
      checkIn: v.formHotelCheckIn,
      checkOut: v.formHotelCheckOut,
      roomNumber: v.formHotelRoom,
      notes: v.formHotelNotes
    }
  });

  // Writes only what the user changed since the form opened, by path. The
  // form holds every field, also those its scope hides: writing them all put
  // back what a partner, or a flight refresh, changed while it was open.
  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!tripId) return;
    const prev = formPayload(JSON.parse(initialFormSnapshot.current || '{}'), openAirports.current.out, openAirports.current.ret);
    const next = formPayload(JSON.parse(currentFormSerialized()), outAirportsRef.current, retAirportsRef.current);
    const updates = {};
    for (const [key, value] of Object.entries(next)) {
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          if (JSON.stringify(v) !== JSON.stringify(prev[key][k])) updates[`${key}.${k}`] = v;
        }
      } else if (value !== prev[key]) {
        updates[key] = value;
      }
    }

    // Fire-and-forget: the offline cache queues the write. Awaiting it kept
    // the form open until the server answered, so offline "שמור" did nothing.
    if (Object.keys(updates).length > 0) {
      updateDoc(doc(db, 'trips', tripId), updates).catch(err => console.error('Trip details save error:', err));
    }

    setShowEditModal(false);
  };

  // Writes only the fields the date moves, by path, and doesn't wait for the
  // server: a whole copy of the trip would undo what others changed meanwhile.
  const handleUpdateFlightDate = (type, dateValue) => {
    if (!tripId || !tripData) return;
    const out = type === 'outbound';
    const hotel = tripData.hotelDetails || {};
    const updates = {
      [out ? 'outboundFlightDetails.date' : 'returnFlightDetails.date']: dateValue,
      dates: formatDateRange(
        out ? dateValue : tripData.outboundFlightDetails?.date,
        out ? tripData.returnFlightDetails?.date : dateValue
      ),
    };
    // Keep the hotel's check-in / check-out aligned with the flights.
    if (out) updates['hotelDetails.checkIn'] = `${dateValue}T${(hotel.checkIn || '').split('T')[1] || '14:00'}`;
    else updates['hotelDetails.checkOut'] = `${dateValue}T${(hotel.checkOut || '').split('T')[1] || '12:00'}`;
    updateDoc(doc(db, 'trips', tripId), updates).catch(err => console.error('Flight date save error:', err));
  };

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '';
    const d = new Date(dateTimeStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} בשעה ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const outbound = tripData?.outboundFlightDetails || emptyFlightDetails;
  const returning = tripData?.returnFlightDetails || emptyFlightDetails;
  const hotel = tripData?.hotelDetails || emptyHotelDetails;

  if (loading || !tripData) {
    return (
      <Skeleton rows={3} label="טוען נתוני טיסה ומלון" />
    );
  }

  // Render a flight card (extracted to share between outbound + return)
  // Tiles inside a flight card: gate, date and status all read the same way.
  const tileStyle = {
    display: 'flex', flexDirection: 'column', gap: 3,
    alignItems: 'center', justifyContent: 'center',
    background: 'var(--ink-3)', borderRadius: 12,
    padding: '9px 6px', minHeight: 56, textAlign: 'center',
  };
  const tileLabel = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' };
  const tileValue = { fontSize: 15, fontWeight: 900, color: 'var(--primary-color)', fontVariantNumeric: 'tabular-nums' };

  const renderFlightCard = (flight, kind) => {
    const label = kind === 'outbound' ? 'טיסת הלוך' : 'טיסת חזור';
    const badgeColor = kind === 'outbound' ? 'var(--p-10)' : 'var(--c-red2-10)';
    const badgeText = kind === 'outbound' ? 'var(--secondary-color)' : 'var(--c-red2)';
    const isRefreshing = kind === 'outbound' ? refreshingOut : refreshingRet;
    const lastRefreshed = flight.lastRefreshed
      ? new Date(flight.lastRefreshed).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
        {/* Card Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span className="badge-success" style={{ background: badgeColor, color: badgeText, padding: '4px 10px', fontSize: '11px', flexShrink: 0 }}>{label}</span>
            <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>{flight.flightNumber || '—'}</span>
            <span style={{
              fontSize: '12px', color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{flight.airline}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {canEdit && (
            <button
              type="button"
              className="icon-btn accent"
              onClick={() => openEditModal(kind)}
              title={`ערוך ${label}`}
              aria-label={`ערוך ${label}`}
            >
              <Pencil size={16} />
            </button>
            )}
            <button
              onClick={() => refreshFlight(kind)}
              disabled={isRefreshing || !flight.flightNumber || !canEdit}
              title={lastRefreshed ? `עודכן לאחרונה: ${lastRefreshed}` : 'רענן מידע טיסה'}
              style={{
                background: 'var(--p-8)',
                border: 'none',
                padding: '6px 10px',
                borderRadius: 8,
                cursor: isRefreshing ? 'default' : 'pointer',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 800,
                opacity: !flight.flightNumber ? 0.4 : 1
              }}
            >
              <RefreshCw size={13} className={isRefreshing ? 'spinning' : ''} />
              <span>רענן</span>
            </button>
          </div>
        </div>

        {/* Route — the two ends of the flight, side by side, with the times
            that actually change sitting under each airport. This is what
            you glance at in the terminal; everything else is secondary. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--primary-color)', lineHeight: 1.1 }}>
              {flight.depAirport?.code || '—'}
            </div>
            <div className="route-city" style={{ justifyContent: 'flex-start' }}>
              <span>{flight.depAirport?.city || ''}</span>
              {/* The destination's weather sits with the destination: the
                  return flight leaves from it. */}
              {kind === 'return' && flight.depAirport?.city && <WeatherChip trip={tripData} />}
            </div>
            <div style={{ marginTop: 8 }}>
              <RouteTime
                scheduled={toTime24(flight.scheduledDep)}
                updated={toTime24(flight.actualDep)}
                cancelled={flight.status === 'בוטלה'}
                flightDate={flight.date}
                align="right"
              />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginTop: 4, display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
              <PlaneTakeoff size={11} style={{ color: 'var(--accent)' }} />
              <span>המראה</span>
            </div>
          </div>

          {/* The line between them — direction of travel, in RTL: departure
              on the right, arrival on the left. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 6, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--p-30)' }} />
              <span style={{ width: 26, height: 2, background: 'var(--p-15)', borderRadius: 2 }} />
              <Plane size={15} style={{ color: 'var(--accent)', transform: 'rotate(-90deg)' }} />
              <span style={{ width: 26, height: 2, background: 'var(--p-15)', borderRadius: 2 }} />
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--p-30)' }} />
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--primary-color)', lineHeight: 1.1 }}>
              {flight.arrAirport?.code || '—'}
            </div>
            <div className="route-city" style={{ justifyContent: 'flex-end' }}>
              {kind === 'outbound' && flight.arrAirport?.city && <WeatherChip trip={tripData} />}
              <span>{flight.arrAirport?.city || ''}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <RouteTime
                scheduled={toTime24(flight.scheduledArr)}
                updated={toTime24(flight.estimatedArr)}
                cancelled={flight.status === 'בוטלה'}
                flightDate={flight.date}
                align="left"
              />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginTop: 4, display: 'flex', gap: 5 }}>
              <PlaneLanding size={11} style={{ color: 'var(--accent)' }} />
              <span>נחיתה</span>
            </div>
          </div>
        </div>

        {/* The three things you are asked for at the airport, as tiles
            rather than "label: value" rows. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.85fr 0.95fr', gap: 8 }}>
          <div style={{ ...tileStyle, fontSize: 13 }}>
            <span style={tileLabel}>תאריך</span>
            {canEdit ? (
              <CustomDatePicker
                value={flight.date || ''}
                onChange={(val) => handleUpdateFlightDate(kind, val)}
                variant="compact"
              />
            ) : (
              <span style={tileValue}>
                {flight.date
                  ? new Date(flight.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
                  : '—'}
              </span>
            )}
          </div>

          <div style={tileStyle}>
            <span style={tileLabel}>שער (Gate)</span>
            <span style={{ ...tileValue, color: flight.gate ? 'var(--accent)' : 'var(--text-muted)' }}>
              {flight.gate || '—'}
            </span>
          </div>

          <div style={tileStyle}>
            <span style={tileLabel}>סטטוס</span>
            <span className="badge-success" style={{
              ...(flight.status === 'בוטלה' ? { background: 'var(--c-red-10)', color: 'var(--c-red)' }
                : flight.status === 'באיחור קל' || flight.status === 'באיחור רציני' ? { background: 'var(--c-orange-12)', color: 'var(--c-orange)' }
                : {}),
              fontSize: 12, padding: '3px 8px', gap: 5,
            }}>
              <span className="pulsing-dot" style={
                flight.status === 'בוטלה' ? { background: 'var(--c-red)' }
                : flight.status?.includes('איחור') ? { background: 'var(--c-orange)' }
                : undefined
              } />
              <span>{flight.status || '—'}</span>
            </span>
          </div>
        </div>

        {/* Local time at both ends — useful, but never the headline. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
          borderTop: '1px solid var(--ink-6)', paddingTop: 10,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontWeight: 800 }}>{flight.depAirport?.code || '—'}</span>
            <LocalClock timezone={flight.depAirport?.timezone} />
            <span style={{ opacity: 0.7 }}>{flight.depAirport?.timezone}</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ opacity: 0.7 }}>{flight.arrAirport?.timezone}</span>
            <LocalClock timezone={flight.arrAirport?.timezone} />
            <span style={{ fontWeight: 800 }}>{flight.arrAirport?.code || '—'}</span>
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade dashboard-grid">
      {ownerProfile && (
        <div className="owner-banner">
          {ownerProfile.photoURL ? (
            <img src={ownerProfile.photoURL} alt="" referrerPolicy="no-referrer" />
          ) : (
            <div className="owner-banner-avatar">
              {(ownerProfile.displayName || ownerProfile.email || '?')[0]}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>טיול משותף של</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ownerProfile.displayName || ownerProfile.email}
            </div>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 800,
            padding: '4px 10px', borderRadius: 999,
            background: canEdit ? 'var(--c-teal-12)' : 'var(--ink-6)',
            color: canEdit ? 'var(--text-success)' : 'var(--text-muted)'
          }}>
            {canEdit ? 'הרשאה: עריכה' : 'הרשאה: צפייה בלבד'}
          </span>
        </div>
      )}

      {/* Outbound flight card */}
      {renderFlightCard(outbound, 'outbound')}

      {/* Return flight card — same gap as flight→hotel (handled by .dashboard-grid gap) */}
      {renderFlightCard(returning, 'return')}

      {/* Hotel */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--ink-6)', paddingBottom: '8px' }}>
          <Building size={18} style={{ color: 'var(--primary-color)' }} />
          <h4 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary-color)', flex: 1 }}>
            פרטי המלון ביעד
          </h4>
          {canEdit && (
          <button
            type="button"
            className="icon-btn accent"
            onClick={() => openEditModal('hotel')}
            title="ערוך פרטי מלון"
            aria-label="ערוך פרטי מלון"
          >
            <Pencil size={16} />
          </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--primary-color)' }}>{hotel.name}</div>
            {hotel.address && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(hotel.address)}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: 'var(--text-muted)', fontSize: 13,
                  fontWeight: 600, textDecoration: 'none'
                }}
              >
                <MapPin size={14} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{hotel.address}</span>
                <ExternalLink size={11} style={{ opacity: 0.6, marginRight: 2, flexShrink: 0 }} />
              </a>
            )}
            {hotel.link && (
              <a
                href={hotel.link}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  color: 'var(--accent)', fontSize: 12,
                  fontWeight: 700, textDecoration: 'none',
                  background: 'var(--p-8)',
                  border: '1px solid var(--p-18)',
                  borderRadius: 999, padding: '4px 10px',
                  alignSelf: 'flex-start',
                  maxWidth: '100%'
                }}
                dir="ltr"
              >
                <Link2 size={12} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                  {hotel.link.replace(/^https?:\/\//, '')}
                </span>
                <ExternalLink size={11} style={{ opacity: 0.6, flexShrink: 0 }} />
              </a>
            )}
          </div>

          <div style={{ borderTop: '1px dashed var(--ink-4)', padding: '4px 0' }} />

          <div className="hotel-meta-grid">
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>כניסה למלון (Check-in)</div>
              <div style={{ fontWeight: '800', color: 'var(--primary-color)', fontSize: '13px' }}>{formatDateTime(hotel.checkIn)}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>עזיבת המלון (Check-out)</div>
              <div style={{ fontWeight: '800', color: 'var(--primary-color)', fontSize: '13px' }}>{formatDateTime(hotel.checkOut)}</div>
            </div>
            {hotel.roomNumber && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>סוג חדר / מספר חדר</div>
                <div style={{ fontWeight: '800', color: 'var(--primary-color)', fontSize: '13px' }}>{hotel.roomNumber}</div>
              </div>
            )}
          </div>

          {hotel.notes && (
            <>
              <div style={{ borderTop: '1px dashed var(--ink-4)', padding: '2px 0' }} />
              <div style={{ background: 'var(--ink-3)', padding: '12px 14px', borderRadius: 'var(--border-radius-md)', fontSize: '13px', lineHeight: '1.4', fontWeight: '600' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', marginBottom: '4px' }}>הנחיות והערות מיוחדות:</div>
                {hotel.notes}
              </div>
            </>
          )}
        </div>
      </div>

      <InfoCard tripId={tripId} />

      {/* Everything at once — the trip's name and dates too, which have no
          card of their own — from the tab's main button, where every tab
          keeps its main action. Each card's pencil edits just that card. */}
      {canEdit && <Fab label="עריכת פרטים" icon={<Pencil size={18} />} onClick={() => openEditModal('all')} />}

      {/* Edit Modal */}
      {showEditModal && (
        <Sheet
          title={
            editScope === 'outbound' ? 'עריכת טיסת הלוך' :
            editScope === 'return' ? 'עריכת טיסת חזור' :
            editScope === 'hotel' ? 'עריכת פרטי המלון' :
            editScope === 'trip' ? 'עריכת פרטי הטיול' :
            'עריכת כל פרטי הנסיעה'
          }
          onClose={() => setShowEditModal(false)}
          dirty={editDirty}
        >
          {({ cancel }) => (
            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* === TRIP HEADER: name + 2 decisive date pickers === */}
              {(editScope === 'all' || editScope === 'trip') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--p-20)', padding: '16px', borderRadius: 'var(--border-radius-lg)', background: 'var(--p-3)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '900', color: 'var(--secondary-color)', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--ink-5)', paddingBottom: '6px', marginBottom: '4px' }}>
                  <span>פרטי כותרת ותאריכי הטיול</span>
                </h3>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>שם הטיול</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formTripName}
                    onChange={(e) => setFormTripName(e.target.value)}
                    required
                    placeholder="למשל: פראג - סוף שבוע רומנטי"
                  />
                </div>

                {/* Two "decisive" date pickers — these set the source of truth */}
                <div className="row-2">
                  <CustomDatePicker value={formOutDate} onChange={syncOutboundDate} label="תאריך טיסת הלוך" required />
                  <CustomDatePicker value={formRetDate} onChange={syncReturnDate} label="תאריך טיסת חזור" required />
                </div>
              </div>
              )}

              {/* === OUTBOUND FLIGHT === */}
              {(editScope === 'all' || editScope === 'outbound') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--ink-10)', padding: '16px', borderRadius: 'var(--border-radius-lg)', background: 'var(--ink-2)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '900', color: 'var(--secondary-color)', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--ink-5)', paddingBottom: '6px', marginBottom: '4px' }}>
                  <span>1. פרטי טיסת הלוך</span>
                  {lookupBusyOut && <Loader2 size={14} className="spinning" style={{ color: 'var(--accent)' }} />}
                </h3>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>מספר טיסה</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className="form-control"
                      value={formOutFlightNum}
                      onChange={(e) => setFormOutFlightNum(e.target.value)}
                      placeholder="למשל: LY381, FR3891"
                      required
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => runLookup('out')}
                      className="btn-primary"
                      style={{ minHeight: 48, padding: '0 18px', gap: 6, flexShrink: 0 }}
                      aria-label="חיפוש טיסה"
                    >
                      {lookupBusyOut ? <Loader2 size={16} className="spinning" /> : <Search size={16} />}
                      <span>חפש</span>
                    </button>
                  </div>
                  <small style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>
                    לחץ "חפש" כדי למלא אוטומטית את שאר הפרטים.
                  </small>
                  {renderLookupFeedback(lookupResultOut)}
                </div>

                <CustomDatePicker value={formOutDate} onChange={syncOutboundDate} label="תאריך טיסה" required />

                <div className="row-2">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>חברת תעופה</label>
                    <input type="text" className="form-control" value={formOutAirline} onChange={(e) => setFormOutAirline(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>שער עלייה למטוס (Gate)</label>
                    <input type="text" className="form-control" value={formOutGate} onChange={(e) => setFormOutGate(e.target.value)} placeholder="B12" />
                  </div>
                </div>

                <div className="row-2">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>אזור זמן – מוצא ({formatOffsetFromIsrael(formOutDepTz, formOutDate)})</label>
                    <input type="text" className="form-control" value={formOutDepTz} onChange={(e) => setFormOutDepTz(e.target.value)} placeholder="UTC +03:00" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>אזור זמן – יעד ({formatOffsetFromIsrael(formOutArrTz, formOutDate)})</label>
                    <input type="text" className="form-control" value={formOutArrTz} onChange={(e) => setFormOutArrTz(e.target.value)} placeholder="UTC +02:00" />
                  </div>
                </div>

                <div className="row-2">
                  <CustomTimePicker value={formOutSchedDep} onChange={setFormOutSchedDep} label="המראה מתוכננת" />
                  <CustomTimePicker value={formOutActDep} onChange={setFormOutActDep} label="המראה בפועל" />
                </div>
                <div className="row-2">
                  <CustomTimePicker value={formOutSchedArr} onChange={setFormOutSchedArr} label="נחיתה מתוכננת" />
                  <CustomTimePicker value={formOutEstArr} onChange={setFormOutEstArr} label="נחיתה משוערת" />
                </div>

                <CustomDropdown
                  label="סטטוס טיסה"
                  value={formOutStatus}
                  onChange={setFormOutStatus}
                  options={FLIGHT_STATUS_OPTIONS}
                />
              </div>
              )}

              {/* === RETURN FLIGHT === */}
              {(editScope === 'all' || editScope === 'return') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--ink-10)', padding: '16px', borderRadius: 'var(--border-radius-lg)', background: 'var(--ink-2)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '900', color: 'var(--c-red2)', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--ink-5)', paddingBottom: '6px', marginBottom: '4px' }}>
                  <span>2. פרטי טיסת חזור</span>
                  {lookupBusyRet && <Loader2 size={14} className="spinning" style={{ color: 'var(--accent)' }} />}
                </h3>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>מספר טיסה</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className="form-control"
                      value={formRetFlightNum}
                      onChange={(e) => setFormRetFlightNum(e.target.value)}
                      placeholder="למשל: LY382, FR3892"
                      required
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => runLookup('ret')}
                      className="btn-primary"
                      style={{ minHeight: 48, padding: '0 18px', gap: 6, flexShrink: 0 }}
                      aria-label="חיפוש טיסה"
                    >
                      {lookupBusyRet ? <Loader2 size={16} className="spinning" /> : <Search size={16} />}
                      <span>חפש</span>
                    </button>
                  </div>
                  {renderLookupFeedback(lookupResultRet)}
                </div>

                <CustomDatePicker value={formRetDate} onChange={syncReturnDate} label="תאריך טיסה" required />

                <div className="row-2">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>חברת תעופה</label>
                    <input type="text" className="form-control" value={formRetAirline} onChange={(e) => setFormRetAirline(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>שער עלייה למטוס (Gate)</label>
                    <input type="text" className="form-control" value={formRetGate} onChange={(e) => setFormRetGate(e.target.value)} placeholder="A4" />
                  </div>
                </div>

                <div className="row-2">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>אזור זמן – מוצא ({formatOffsetFromIsrael(formRetDepTz, formRetDate)})</label>
                    <input type="text" className="form-control" value={formRetDepTz} onChange={(e) => setFormRetDepTz(e.target.value)} placeholder="UTC +02:00" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>אזור זמן – יעד ({formatOffsetFromIsrael(formRetArrTz, formRetDate)})</label>
                    <input type="text" className="form-control" value={formRetArrTz} onChange={(e) => setFormRetArrTz(e.target.value)} placeholder="UTC +03:00" />
                  </div>
                </div>

                <div className="row-2">
                  <CustomTimePicker value={formRetSchedDep} onChange={setFormRetSchedDep} label="המראה מתוכננת" />
                  <CustomTimePicker value={formRetActDep} onChange={setFormRetActDep} label="המראה בפועל" />
                </div>
                <div className="row-2">
                  <CustomTimePicker value={formRetSchedArr} onChange={setFormRetSchedArr} label="נחיתה מתוכננת" />
                  <CustomTimePicker value={formRetEstArr} onChange={setFormRetEstArr} label="נחיתה משוערת" />
                </div>

                <CustomDropdown
                  label="סטטוס טיסה"
                  value={formRetStatus}
                  onChange={setFormRetStatus}
                  options={FLIGHT_STATUS_OPTIONS}
                />
              </div>
              )}

              {/* === HOTEL === */}
              {(editScope === 'all' || editScope === 'hotel') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--ink-10)', padding: '16px', borderRadius: 'var(--border-radius-lg)', background: 'var(--ink-2)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '900', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--ink-5)', paddingBottom: '6px', marginBottom: '4px' }}>
                  <span>3. פרטי מלון</span>
                </h3>

                <div className="form-group">
                  <label>שם המלון</label>
                  <input type="text" className="form-control" value={formHotelName} onChange={(e) => setFormHotelName(e.target.value)} required />
                </div>

                <div className="form-group">
                  <label>כתובת המלון</label>
                  <input type="text" className="form-control" value={formHotelAddress} onChange={(e) => setFormHotelAddress(e.target.value)} placeholder="הכתובת הפיזית — תיפתח ב-Google Maps" />
                </div>

                <div className="form-group">
                  <label>קישור Google Maps</label>
                  <input
                    type="url"
                    className="form-control"
                    value={formHotelLink}
                    onChange={(e) => setFormHotelLink(e.target.value)}
                    placeholder="https://maps.google.com/..."
                    dir="ltr"
                  />
                  <small style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>
                    קישור לגוגל מפות — ישמש לחישוב מרחק אוטומטי מהמלון לאטרקציות.
                  </small>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <CustomDateTimePicker value={formHotelCheckIn} onChange={setFormHotelCheckIn} label="כניסה (Check-in)" />
                  <CustomDateTimePicker value={formHotelCheckOut} onChange={setFormHotelCheckOut} label="עזיבה (Check-out)" />
                </div>

                <div className="form-group">
                  <label>חדר</label>
                  <input type="text" className="form-control" value={formHotelRoom} onChange={(e) => setFormHotelRoom(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>הערות מיוחדות</label>
                  <textarea className="form-control" rows="3" value={formHotelNotes} onChange={(e) => setFormHotelNotes(e.target.value)} style={{ resize: 'none', fontFamily: 'inherit' }} />
                </div>
              </div>
              )}

              <div className="sheet-footer">
                <button type="submit" className="btn-primary">שמור</button>
                <button type="button" onClick={cancel} className="btn-secondary">ביטול</button>
              </div>

            </form>
          )}
        </Sheet>
      )}

    </div>
  );
}
