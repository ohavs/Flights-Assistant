import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFlightProgressInfo, formatOffsetFromIsrael, toTime24, parseUtcOffset } from '../services/flightSimulator';
import { lookupFlightLive } from '../services/flightApi';
import { useTrip } from '../TripContext';
import { useConfirm } from '../ConfirmContext';
import MapComponent from './MapComponent';
import { CustomDatePicker, CustomDateTimePicker, CustomTimePicker, CustomDropdown } from './CustomDatePicker';
import {
  MapPin,
  Calendar,
  Edit2,
  Building,
  Loader2,
  Search,
  PlaneTakeoff,
  PlaneLanding,
  RefreshCw,
  ExternalLink,
  Link2
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
function TimeSlot({ scheduled, updated, label, icon, cancelled, flightDate }) {
  const effective = updated || scheduled;
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
  const delta = suppressDelta ? null : deltaMinutes(scheduled, updated);
  const delayed = delta != null && delta > 0;
  const early = delta != null && delta < 0;

  let color = 'var(--primary)';
  let bgChip = null;
  let chipColor = null;
  if (cancelled) color = 'rgb(220, 38, 38)';
  else if (delayed) { color = 'rgb(220, 38, 38)'; bgChip = 'rgba(220, 38, 38, 0.1)'; chipColor = 'rgb(220, 38, 38)'; }
  else if (early)   { bgChip = 'rgba(5, 150, 105, 0.1)'; chipColor = 'var(--text-success)'; }

  // When the chip is suppressed, also show the *scheduled* time rather
  // than a stale "updated" value (otherwise the row would silently
  // display fake numbers without explanation).
  const displayValue = cancelled ? '—' : (suppressDelta ? (scheduled || effective || '—') : (effective || '—'));

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontWeight: 700 }}>
        {icon}
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {delta != null && delta !== 0 && !cancelled && (
          <span style={{
            background: bgChip, color: chipColor,
            fontSize: 11, fontWeight: 800,
            padding: '2px 8px', borderRadius: 999,
          }}>
            {formatDelta(delta)}
          </span>
        )}
        <span style={{
          fontWeight: 800,
          color,
          textDecoration: cancelled ? 'line-through' : 'none',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {displayValue}
        </span>
        {delayed && !cancelled && (
          <span style={{
            fontSize: 10, fontWeight: 800,
            color: 'rgb(220, 38, 38)',
            background: 'rgba(220, 38, 38, 0.06)',
            padding: '1px 6px', borderRadius: 6,
          }}>
            מעודכן
          </span>
        )}
      </div>
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
  const confirm = useConfirm();
  const [tripData, setTripData] = useState(null);
  // Snapshot of the form state when the modal opened, used to detect
  // unsaved changes when the user tries to close it.
  const initialFormSnapshot = useRef(null);
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

  const Banner = ({ color, bg, border, children }) => (
    <div style={{ marginTop: 8, padding: '10px 12px', background: bg, border: `1px solid ${border}`, borderRadius: 10, fontSize: 12, fontWeight: 700, color, lineHeight: 1.5 }}>
      {children}
    </div>
  );

  const renderLookupFeedback = (result) => {
    if (!result) return null;
    switch (result.kind) {
      case 'empty':
        return <Banner color="rgb(190, 18, 60)" bg="rgba(239, 68, 68, 0.08)" border="rgba(239, 68, 68, 0.2)">⚠️ הזן מספר טיסה לפני החיפוש.</Banner>;
      case 'live':
        return <Banner color="var(--text-success)" bg="rgba(5, 150, 105, 0.1)" border="rgba(5, 150, 105, 0.3)">✅ נתונים בזמן אמת: {result.flightNumber} · {result.airline} · {result.route}</Banner>;
      case 'no-key':
        return <Banner color="rgb(146, 64, 14)" bg="rgba(245, 158, 11, 0.1)" border="rgba(245, 158, 11, 0.3)">⚠️ חיפוש חי אינו זמין (חסר מפתח API מובנה). נטענו נתונים מקומיים.</Banner>;
      case 'no-results':
        return <Banner color="rgb(146, 64, 14)" bg="rgba(245, 158, 11, 0.1)" border="rgba(245, 158, 11, 0.3)">⚠️ AeroDataBox לא מצא את הטיסה בתאריך שצוין. נסה תאריך מדויק לטיסה (התאריך שמופיע בכרטיס שלך).</Banner>;
      case 'http-error':
        return <Banner color="rgb(190, 18, 60)" bg="rgba(239, 68, 68, 0.08)" border="rgba(239, 68, 68, 0.2)">❌ {result.message}</Banner>;
      case 'network-error':
        return <Banner color="rgb(146, 64, 14)" bg="rgba(245, 158, 11, 0.08)" border="rgba(245, 158, 11, 0.25)">📡 {result.message}</Banner>;
      default:
        return <Banner color="rgb(146, 64, 14)" bg="rgba(245, 158, 11, 0.08)" border="rgba(245, 158, 11, 0.25)">ⓘ נטענו נתונים משוערים מהמאגר המקומי.</Banner>;
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
        return { kind: 'generated', flightNumber: flight?.flightNumber, airline: flight?.airline, route };
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
          if (wrap?.flight) applyLookup('out', wrap.flight);
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
          if (wrap?.flight) applyLookup('ret', wrap.flight);
          setLookupResultRet(resultFromWrapper(wrap));
        })
        .finally(() => setLookupBusyRet(false));
    }
  };

  // Refresh a saved flight's live data (called from card refresh button + auto-refresh)
  const [refreshingOut, setRefreshingOut] = useState(false);
  const [refreshingRet, setRefreshingRet] = useState(false);
  const refreshFlight = async (kind) => {
    if (!tripId || !tripData) return;
    const flight = kind === 'outbound' ? tripData.outboundFlightDetails : tripData.returnFlightDetails;
    if (!flight?.flightNumber) return;
    if (kind === 'outbound') setRefreshingOut(true);
    else setRefreshingRet(true);
    try {
      const wrap = await lookupFlightLive(flight.flightNumber, flight.date);
      const res = wrap?.flight;
      if (!res) return;
      const docRef = doc(db, 'trips', tripId);
      const newData = { ...tripData };
      const merged = {
        ...flight,
        airline: res.airline || flight.airline,
        depAirport: { ...(flight.depAirport || {}), ...(res.depAirport || {}) },
        arrAirport: { ...(flight.arrAirport || {}), ...(res.arrAirport || {}) },
        scheduledDep: res.scheduledDep || flight.scheduledDep,
        actualDep: res.actualDep || flight.actualDep,
        scheduledArr: res.scheduledArr || flight.scheduledArr,
        estimatedArr: res.estimatedArr || flight.estimatedArr,
        status: res.status || flight.status,
        gate: res.gate || flight.gate,
        lastRefreshed: new Date().toISOString(),
      };
      if (kind === 'outbound') newData.outboundFlightDetails = merged;
      else newData.returnFlightDetails = merged;
      await setDoc(docRef, newData, { merge: true });
    } finally {
      if (kind === 'outbound') setRefreshingOut(false);
      else setRefreshingRet(false);
    }
  };

  // Auto-refresh every 5 minutes (always on — API key is baked in)
  useEffect(() => {
    if (!tripId) return;
    const interval = setInterval(() => {
      refreshFlight('outbound');
      refreshFlight('return');
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, tripData?.outboundFlightDetails?.flightNumber, tripData?.returnFlightDetails?.flightNumber]);

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
        const isPrague = currentData.destination?.includes('פראג') || currentData.name?.includes('פראג') || tripId.includes('prague');

        if (isPrague) {
          await setDoc(docRef, { ...defaultTrip, ...currentData }, { merge: true });
        } else {
          await setDoc(docRef, {
            outboundFlightDetails: emptyFlightDetails,
            returnFlightDetails: emptyFlightDetails,
            hotelDetails: emptyHotelDetails,
            ...currentData
          }, { merge: true });
        }
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

  // Listen for "open edit" events dispatched by the App header pencil button
  useEffect(() => {
    const handler = (e) => openEditModal(e?.detail?.scope || 'all');
    window.addEventListener('flight:openEdit', handler);
    return () => window.removeEventListener('flight:openEdit', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripData]);

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
    setFormOutDate(out.date || '2026-06-15');
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
    setFormRetDate(ret.date || '2026-06-22');
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
      formOutDate: out.date || '2026-06-15',
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
      formRetDate: ret.date || '2026-06-22',
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

  const attemptCloseEdit = async () => {
    if (initialFormSnapshot.current && currentFormSerialized() !== initialFormSnapshot.current) {
      const ok = await confirm({
        title: 'יש שינויים שלא נשמרו',
        message: 'ערכת נתונים שלא נשמרו עדיין. אם תצא עכשיו השינויים יאבדו.',
        confirmText: 'צא בלי לשמור',
        cancelText: 'המשך עריכה',
        danger: true,
      });
      if (!ok) return;
    }
    setShowEditModal(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!tripId) return;
    const docRef = doc(db, 'trips', tripId);

    await setDoc(docRef, {
      name: formTripName,
      dates: formatDateRange(formOutDate, formRetDate),
      outboundFlightDetails: {
        flightNumber: formOutFlightNum,
        airline: formOutAirline,
        depAirport: { ...outAirportsRef.current.dep, timezone: formOutDepTz },
        arrAirport: { ...outAirportsRef.current.arr, timezone: formOutArrTz },
        scheduledDep: formOutSchedDep,
        actualDep: formOutActDep,
        scheduledArr: formOutSchedArr,
        estimatedArr: formOutEstArr,
        status: formOutStatus,
        date: formOutDate,
        gate: formOutGate
      },
      returnFlightDetails: {
        flightNumber: formRetFlightNum,
        airline: formRetAirline,
        depAirport: { ...retAirportsRef.current.dep, timezone: formRetDepTz },
        arrAirport: { ...retAirportsRef.current.arr, timezone: formRetArrTz },
        scheduledDep: formRetSchedDep,
        actualDep: formRetActDep,
        scheduledArr: formRetSchedArr,
        estimatedArr: formRetEstArr,
        status: formRetStatus,
        date: formRetDate,
        gate: formRetGate
      },
      hotelDetails: {
        name: formHotelName,
        address: formHotelAddress,
        link: formHotelLink,
        checkIn: formHotelCheckIn,
        checkOut: formHotelCheckOut,
        roomNumber: formHotelRoom,
        notes: formHotelNotes
      }
    }, { merge: true });

    setShowEditModal(false);
  };

  const handleUpdateFlightDate = async (type, dateValue) => {
    if (!tripId) return;
    const docRef = doc(db, 'trips', tripId);
    const newData = { ...tripData };
    if (type === 'outbound') {
      newData.outboundFlightDetails = { ...tripData.outboundFlightDetails, date: dateValue };
    } else {
      newData.returnFlightDetails = { ...tripData.returnFlightDetails, date: dateValue };
    }
    newData.dates = formatDateRange(
      type === 'outbound' ? dateValue : tripData.outboundFlightDetails?.date,
      type === 'return' ? dateValue : tripData.returnFlightDetails?.date
    );

    // Keep the hotel's check-in / check-out aligned with the flights.
    const hotel = tripData.hotelDetails || {};
    if (type === 'outbound') {
      const time = (hotel.checkIn || '').split('T')[1] || '14:00';
      newData.hotelDetails = { ...hotel, checkIn: `${dateValue}T${time}` };
    } else {
      const time = (hotel.checkOut || '').split('T')[1] || '12:00';
      newData.hotelDetails = { ...(newData.hotelDetails || hotel), checkOut: `${dateValue}T${time}` };
    }

    await setDoc(docRef, newData, { merge: true });
  };

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '';
    const d = new Date(dateTimeStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} בשעה ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  if (loading || !tripData) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, height: '100%', padding: '40px 0' }}>
        <div className="pulsing-dot" style={{ width: '12px', height: '12px' }}></div>
        <span style={{ marginRight: '10px', color: 'var(--text-muted)', fontSize: '15px' }}>טוען נתוני טיסה ומלון...</span>
      </div>
    );
  }

  const outbound = tripData.outboundFlightDetails || emptyFlightDetails;
  const returning = tripData.returnFlightDetails || emptyFlightDetails;
  const hotel = tripData.hotelDetails || emptyHotelDetails;

  // Render a flight card (extracted to share between outbound + return)
  const renderFlightCard = (flight, kind) => {
    const label = kind === 'outbound' ? 'טיסת הלוך' : 'טיסת חזור';
    const badgeColor = kind === 'outbound' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    const badgeText = kind === 'outbound' ? 'var(--secondary-color)' : 'rgb(239, 68, 68)';
    const isRefreshing = kind === 'outbound' ? refreshingOut : refreshingRet;
    const lastRefreshed = flight.lastRefreshed
      ? new Date(flight.lastRefreshed).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
        {/* Card Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="badge-success" style={{ background: badgeColor, color: badgeText, padding: '4px 10px', fontSize: '11px', marginLeft: '8px' }}>{label}</span>
            <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--primary-color)' }}>{flight.flightNumber || '—'}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '6px' }}>{flight.airline}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {canEdit && (
            <button
              onClick={() => openEditModal(kind)}
              title={`ערוך ${label}`}
              style={{
                background: 'rgba(79, 70, 229, 0.06)',
                border: 'none', padding: '6px', borderRadius: 8, cursor: 'pointer',
                color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <Edit2 size={14} />
            </button>
            )}
            <button
              onClick={() => refreshFlight(kind)}
              disabled={isRefreshing || !flight.flightNumber}
              title={lastRefreshed ? `עודכן לאחרונה: ${lastRefreshed}` : 'רענן מידע טיסה'}
              style={{
                background: 'rgba(79, 70, 229, 0.08)',
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

        {/* Date Picker Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(11,11,48,0.03)', padding: '10px 14px', borderRadius: 'var(--border-radius-md)' }}>
          <Calendar size={16} style={{ color: 'var(--primary-color)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>תאריך טיסה</div>
            {canEdit ? (
              <CustomDatePicker
                value={flight.date || (kind === 'outbound' ? '2026-06-15' : '2026-06-22')}
                onChange={(val) => handleUpdateFlightDate(kind, val)}
                variant="compact"
              />
            ) : (
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary-color)' }}>
                {flight.date ? new Date(flight.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
              </div>
            )}
          </div>
        </div>

        {/* Airport Codes Row + live local clock under each */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--primary-color)' }}>{flight.depAirport?.code || '—'}</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary-color)' }}>{flight.depAirport?.city}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{flight.depAirport?.timezone}</div>
            <LocalClock timezone={flight.depAirport?.timezone} />
          </div>

          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--primary-color)' }}>{flight.arrAirport?.code || '—'}</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary-color)' }}>{flight.arrAirport?.city}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{flight.arrAirport?.timezone}</div>
            <LocalClock timezone={flight.arrAirport?.timezone} />
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }} />

        {/* Times / status / gate — single time with delta highlighting */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
          <TimeSlot
            label="המראה"
            icon={<PlaneTakeoff size={15} style={{ color: 'var(--accent)' }} />}
            scheduled={toTime24(flight.scheduledDep)}
            updated={toTime24(flight.actualDep)}
            cancelled={flight.status === 'בוטלה'}
            flightDate={flight.date}
          />
          <TimeSlot
            label="נחיתה"
            icon={<PlaneLanding size={15} style={{ color: 'var(--accent)' }} />}
            scheduled={toTime24(flight.scheduledArr)}
            updated={toTime24(flight.estimatedArr)}
            cancelled={flight.status === 'בוטלה'}
            flightDate={flight.date}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>סטטוס טיסה (בזמן אמת):</span>
            <span className="badge-success" style={flight.status === 'בוטלה' ? { background: 'rgba(220,38,38,0.1)', color: 'rgb(220,38,38)' } : flight.status === 'באיחור קל' || flight.status === 'באיחור רציני' ? { background: 'rgba(245,158,11,0.12)', color: 'rgb(146,64,14)' } : undefined}>
              <span className="pulsing-dot" style={flight.status === 'בוטלה' ? { background: 'rgb(220,38,38)' } : flight.status?.includes('איחור') ? { background: 'rgb(245,158,11)' } : undefined}></span>
              <span>{flight.status || '—'}</span>
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>שער עלייה למטוס (Gate):</span>
            <strong style={{ color: 'var(--accent)', fontSize: '15px' }}>{flight.gate || '—'}</strong>
          </div>
        </div>
      </div>
    );
  };

  // Choose a map flight to show (outbound by default if it has coords, else return)
  const hasOutCoords = outbound.depAirport?.lat && outbound.arrAirport?.lat;
  const mapFlight = hasOutCoords ? outbound : returning;
  const mapProgress = getFlightProgressInfo(mapFlight);

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
            background: canEdit ? 'rgba(5,150,105,0.12)' : 'rgba(11,11,48,0.06)',
            color: canEdit ? 'var(--text-success)' : 'var(--text-muted)'
          }}>
            {canEdit ? 'הרשאה: עריכה' : 'הרשאה: צפייה בלבד'}
          </span>
        </div>
      )}

      {/* Map at the very top — no header, no toggle buttons */}
      <MapComponent
        depCoords={mapFlight.depAirport}
        arrCoords={mapFlight.arrAirport}
        progressPercent={mapProgress.progressPercent}
      />

      {/* Outbound flight card */}
      {renderFlightCard(outbound, 'outbound')}

      {/* Return flight card — same gap as flight→hotel (handled by .dashboard-grid gap) */}
      {renderFlightCard(returning, 'return')}

      {/* Hotel — bigger gap above (handled by the grid's row-gap), same gap as outbound→return originally was) */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '8px' }}>
          <Building size={18} style={{ color: 'var(--primary-color)' }} />
          <h4 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary-color)', flex: 1 }}>
            פרטי המלון ביעד
          </h4>
          {canEdit && (
          <button
            onClick={() => openEditModal('hotel')}
            title="ערוך פרטי מלון"
            style={{
              background: 'rgba(79, 70, 229, 0.06)', border: 'none',
              padding: '6px', borderRadius: 8, cursor: 'pointer',
              color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <Edit2 size={14} />
          </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '17px', fontWeight: '800', color: 'var(--primary-color)' }}>{hotel.name}</div>
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
                  background: 'rgba(79,70,229,0.08)',
                  border: '1px solid rgba(79,70,229,0.18)',
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

          <div style={{ borderTop: '1px dashed rgba(0,0,0,0.04)', padding: '4px 0' }} />

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
              <div style={{ borderTop: '1px dashed rgba(0,0,0,0.04)', padding: '2px 0' }} />
              <div style={{ background: 'rgba(11,11,48,0.03)', padding: '12px 14px', borderRadius: 'var(--border-radius-md)', fontSize: '13px', lineHeight: '1.4', fontWeight: '600' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', marginBottom: '4px' }}>הנחיות והערות מיוחדות:</div>
                {hotel.notes}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={attemptCloseEdit}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>

            <div className="modal-header">
              <h2>{
                editScope === 'outbound' ? 'עריכת טיסת הלוך' :
                editScope === 'return' ? 'עריכת טיסת חזור' :
                editScope === 'hotel' ? 'עריכת פרטי המלון' :
                editScope === 'trip' ? 'עריכת פרטי הטיול' :
                'עריכת כל פרטי הנסיעה'
              }</h2>
              <button className="btn-close" onClick={attemptCloseEdit}>✕</button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* === TRIP HEADER: name + 2 decisive date pickers === */}
              {(editScope === 'all' || editScope === 'trip') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid rgba(79, 70, 229, 0.2)', padding: '16px', borderRadius: 'var(--border-radius-lg)', background: 'rgba(79, 70, 229, 0.03)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '900', color: 'var(--secondary-color)', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '6px', marginBottom: '4px' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid rgba(11,11,48,0.1)', padding: '16px', borderRadius: 'var(--border-radius-lg)', background: 'rgba(11,11,48,0.01)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '900', color: 'var(--secondary-color)', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '6px', marginBottom: '4px' }}>
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
                    <label>אזור זמן – מוצא ({formatOffsetFromIsrael(formOutDepTz)})</label>
                    <input type="text" className="form-control" value={formOutDepTz} onChange={(e) => setFormOutDepTz(e.target.value)} placeholder="UTC +03:00" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>אזור זמן – יעד ({formatOffsetFromIsrael(formOutArrTz)})</label>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid rgba(11,11,48,0.1)', padding: '16px', borderRadius: 'var(--border-radius-lg)', background: 'rgba(11,11,48,0.01)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '900', color: 'rgb(239, 68, 68)', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '6px', marginBottom: '4px' }}>
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
                    <label>אזור זמן – מוצא ({formatOffsetFromIsrael(formRetDepTz)})</label>
                    <input type="text" className="form-control" value={formRetDepTz} onChange={(e) => setFormRetDepTz(e.target.value)} placeholder="UTC +02:00" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>אזור זמן – יעד ({formatOffsetFromIsrael(formRetArrTz)})</label>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid rgba(11,11,48,0.1)', padding: '16px', borderRadius: 'var(--border-radius-lg)', background: 'rgba(11,11,48,0.01)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '900', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '6px', marginBottom: '4px' }}>
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
                  <label>קישור למלון (אופציונלי)</label>
                  <input
                    type="url"
                    className="form-control"
                    value={formHotelLink}
                    onChange={(e) => setFormHotelLink(e.target.value)}
                    placeholder="https://www.booking.com/..."
                    dir="ltr"
                  />
                  <small style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>
                    אתר המלון, קישור Booking.com, או כל URL אחר.
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

              <div style={{ display: 'flex', gap: '12px', paddingBottom: '20px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>שמור</button>
                <button type="button" onClick={attemptCloseEdit} className="btn-secondary">ביטול</button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
