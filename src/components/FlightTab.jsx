import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { lookupFlight, getFlightProgressInfo, formatOffsetFromIsrael } from '../services/flightSimulator';
import MapComponent from './MapComponent';
import { CustomDatePicker, CustomDateTimePicker, CustomTimePicker } from './CustomDatePicker';
import {
  MapPin,
  Calendar,
  Edit2,
  Share2,
  Building,
  Loader2,
  Search
} from 'lucide-react';

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
    checkIn: '2026-06-15T14:00',
    checkOut: '2026-06-22T12:00',
    bookingRef: 'PRG-400192-GP',
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
  checkIn: '',
  checkOut: '',
  bookingRef: '',
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

export default function FlightTab({ tripId }) {
  const [tripData, setTripData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formTripName, setFormTripName] = useState('');
  const [lookupBusyOut, setLookupBusyOut] = useState(false);
  const [lookupBusyRet, setLookupBusyRet] = useState(false);

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
  const [formHotelRef, setFormHotelRef] = useState('');
  const [formHotelRoom, setFormHotelRoom] = useState('');
  const [formHotelNotes, setFormHotelNotes] = useState('');

  const runLookup = (which) => {
    if (which === 'out') {
      const num = (formOutFlightNum || '').trim().toUpperCase();
      if (!num) return;
      setLookupBusyOut(true);
      Promise.resolve(lookupFlight(num, formOutDate))
        .then(res => applyLookup('out', res))
        .finally(() => setLookupBusyOut(false));
    } else {
      const num = (formRetFlightNum || '').trim().toUpperCase();
      if (!num) return;
      setLookupBusyRet(true);
      Promise.resolve(lookupFlight(num, formRetDate))
        .then(res => applyLookup('ret', res))
        .finally(() => setLookupBusyRet(false));
    }
  };

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

  const openEditModal = () => {
    if (!tripData) return;
    const out = tripData.outboundFlightDetails || emptyFlightDetails;
    const ret = tripData.returnFlightDetails || emptyFlightDetails;
    const htl = tripData.hotelDetails || emptyHotelDetails;

    setFormTripName(tripData.name || '');

    setFormOutFlightNum(out.flightNumber || '');
    setFormOutAirline(out.airline || '');
    setFormOutDepTz(out.depAirport?.timezone || 'UTC +02:00');
    setFormOutArrTz(out.arrAirport?.timezone || 'UTC +02:00');
    setFormOutSchedDep(out.scheduledDep || '');
    setFormOutActDep(out.actualDep || '');
    setFormOutSchedArr(out.scheduledArr || '');
    setFormOutEstArr(out.estimatedArr || '');
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
    setFormRetSchedDep(ret.scheduledDep || '');
    setFormRetActDep(ret.actualDep || '');
    setFormRetSchedArr(ret.scheduledArr || '');
    setFormRetEstArr(ret.estimatedArr || '');
    setFormRetStatus(ret.status || 'בזמן');
    setFormRetDate(ret.date || '2026-06-22');
    setFormRetGate(ret.gate || '');
    retAirportsRef.current = {
      dep: ret.depAirport || retAirportsRef.current.dep,
      arr: ret.arrAirport || retAirportsRef.current.arr,
    };

    setFormHotelName(htl.name || '');
    setFormHotelAddress(htl.address || '');
    setFormHotelCheckIn(htl.checkIn || '');
    setFormHotelCheckOut(htl.checkOut || '');
    setFormHotelRef(htl.bookingRef || '');
    setFormHotelRoom(htl.roomNumber || '');
    setFormHotelNotes(htl.notes || '');

    setShowEditModal(true);
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
        checkIn: formHotelCheckIn,
        checkOut: formHotelCheckOut,
        bookingRef: formHotelRef,
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

    return (
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
        {/* Card Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="badge-success" style={{ background: badgeColor, color: badgeText, padding: '4px 10px', fontSize: '11px', marginLeft: '8px' }}>{label}</span>
            <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--primary-color)' }}>{flight.flightNumber || '—'}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '6px' }}>{flight.airline}</span>
          </div>

          <button onClick={openEditModal} style={{ background: 'transparent', border: 'none', padding: '6px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Edit2 size={16} />
          </button>
        </div>

        {/* Date Picker Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(11,11,48,0.03)', padding: '10px 14px', borderRadius: 'var(--border-radius-md)' }}>
          <Calendar size={16} style={{ color: 'var(--primary-color)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>תאריך טיסה</div>
            <CustomDatePicker
              value={flight.date || (kind === 'outbound' ? '2026-06-15' : '2026-06-22')}
              onChange={(val) => handleUpdateFlightDate(kind, val)}
              variant="compact"
            />
          </div>
        </div>

        {/* Airport Codes Row — minimal, no flight line/icon between */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--primary-color)' }}>{flight.depAirport?.code || '—'}</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary-color)' }}>{flight.depAirport?.city}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{flight.depAirport?.timezone}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>{formatOffsetFromIsrael(flight.depAirport?.timezone)}</div>
          </div>

          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: '24px', fontWeight: '900', color: 'var(--primary-color)' }}>{flight.arrAirport?.code || '—'}</div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary-color)' }}>{flight.arrAirport?.city}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{flight.arrAirport?.timezone}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>{formatOffsetFromIsrael(flight.arrAirport?.timezone)}</div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }} />

        {/* Times / status / gate */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>המראה מתוכננת / מעודכנת:</span>
            <span style={{ fontWeight: '800' }}>{flight.scheduledDep || '—'} ◄ {flight.actualDep || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>נחיתה מתוכננת / משוערת:</span>
            <span style={{ fontWeight: '800' }}>{flight.scheduledArr || '—'} ◄ {flight.estimatedArr || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>סטטוס טיסה (בזמן אמת):</span>
            <span className="badge-success">
              <span className="pulsing-dot"></span>
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
          <span className="badge-success" style={{ background: 'rgba(16, 185, 129, 0.08)', color: 'var(--text-success)' }}>מאושר</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
          <div>
            <div style={{ fontSize: '17px', fontWeight: '800', color: 'var(--primary-color)' }}>{hotel.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', fontWeight: '600' }}>
              <MapPin size={14} />
              <span>{hotel.address}</span>
            </div>
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
            {hotel.bookingRef && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700' }}>מספר הזמנה במלון</div>
                <div style={{ fontWeight: '800', color: 'var(--primary-color)', fontSize: '13px' }}>{hotel.bookingRef}</div>
              </div>
            )}
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

      {/* Action Panel */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '16px', textAlign: 'center' }}>
        <h4 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--primary-color)' }}>ניהול ועריכת הנסיעה</h4>
        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: '1.5', fontWeight: '600' }}>
          הזן את מספר הטיסה והתאריך, ושאר הפרטים יתעדכנו אוטומטית.
        </p>
        <div style={{ display: 'flex', gap: '12px', width: '100%', maxWidth: '360px' }}>
          <button onClick={openEditModal} className="btn-primary" style={{ flex: 1, padding: '14px 0' }}>
            <Edit2 size={16} />
            <span>ערוך את כל פרטי הנסיעה</span>
          </button>
          <button className="btn-secondary" style={{ padding: '14px' }}>
            <Share2 size={16} />
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>

            <div className="modal-header">
              <h2>עריכת כל פרטי הנסיעה</h2>
              <button className="btn-close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* === TRIP HEADER: name + 2 decisive date pickers === */}
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
                  <CustomDatePicker value={formOutDate} onChange={setFormOutDate} label="תאריך טיסת הלוך" required />
                  <CustomDatePicker value={formRetDate} onChange={setFormRetDate} label="תאריך טיסת חזור" required />
                </div>
              </div>

              {/* === OUTBOUND FLIGHT === */}
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
                </div>

                <CustomDatePicker value={formOutDate} onChange={setFormOutDate} label="תאריך טיסה" required />

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

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>סטטוס טיסה</label>
                  <select className="category-select" value={formOutStatus} onChange={(e) => setFormOutStatus(e.target.value)}>
                    <option value="בזמן">בזמן</option>
                    <option value="באיחור קל">באיחור קל</option>
                    <option value="באיחור רציני">באיחור רציני</option>
                    <option value="בוטלה">בוטלה</option>
                  </select>
                </div>
              </div>

              {/* === RETURN FLIGHT === */}
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
                </div>

                <CustomDatePicker value={formRetDate} onChange={setFormRetDate} label="תאריך טיסה" required />

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

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>סטטוס טיסה</label>
                  <select className="category-select" value={formRetStatus} onChange={(e) => setFormRetStatus(e.target.value)}>
                    <option value="בזמן">בזמן</option>
                    <option value="באיחור קל">באיחור קל</option>
                    <option value="באיחור רציני">באיחור רציני</option>
                    <option value="בוטלה">בוטלה</option>
                  </select>
                </div>
              </div>

              {/* === HOTEL === */}
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
                  <input type="text" className="form-control" value={formHotelAddress} onChange={(e) => setFormHotelAddress(e.target.value)} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <CustomDateTimePicker value={formHotelCheckIn} onChange={setFormHotelCheckIn} label="כניסה (Check-in)" />
                  <CustomDateTimePicker value={formHotelCheckOut} onChange={setFormHotelCheckOut} label="עזיבה (Check-out)" />
                </div>

                <div className="row-2">
                  <div className="form-group">
                    <label>סימוכין הזמנה</label>
                    <input type="text" className="form-control" value={formHotelRef} onChange={(e) => setFormHotelRef(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>חדר</label>
                    <input type="text" className="form-control" value={formHotelRoom} onChange={(e) => setFormHotelRoom(e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label>הערות מיוחדות</label>
                  <textarea className="form-control" rows="3" value={formHotelNotes} onChange={(e) => setFormHotelNotes(e.target.value)} style={{ resize: 'none', fontFamily: 'inherit' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', paddingBottom: '20px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>שמור את כל השינויים</button>
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary">ביטול</button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
