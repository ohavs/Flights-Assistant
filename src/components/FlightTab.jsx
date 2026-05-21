import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { lookupFlight, getFlightProgressInfo } from '../services/flightSimulator';
import MapComponent from './MapComponent';
import { CustomDatePicker, CustomDateTimePicker, formatHebrewDate } from './CustomDatePicker';
import { 
  Plane, 
  MapPin, 
  Calendar, 
  Edit2, 
  Share2, 
  Building,
  Search,
  Compass,
  ChevronLeft
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
  aircraftType: '',
  registration: '',
  serialNumber: '',
  country: '',
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

export default function FlightTab({ tripId }) {
  const [tripData, setTripData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formTripName, setFormTripName] = useState('');
  const [formTripDates, setFormTripDates] = useState('');
  const [activeMapType, setActiveMapType] = useState('outbound'); // 'outbound' or 'return'
  const [highlightedCard, setHighlightedCard] = useState(null);
  
  // Search query inputs in edit modal
  const [searchOutboundCode, setSearchOutboundCode] = useState('');
  const [searchReturnCode, setSearchReturnCode] = useState('');

  // Outbound Flight Form States
  const [formOutFlightNum, setFormOutFlightNum] = useState('');
  const [formOutAirline, setFormOutAirline] = useState('');
  const [formOutDepCode, setFormOutDepCode] = useState('');
  const [formOutDepCity, setFormOutDepCity] = useState('');
  const [formOutDepLat, setFormOutDepLat] = useState(0);
  const [formOutDepLng, setFormOutDepLng] = useState(0);
  const [formOutDepTz, setFormOutDepTz] = useState('UTC +02:00');
  const [formOutArrCode, setFormOutArrCode] = useState('');
  const [formOutArrCity, setFormOutArrCity] = useState('');
  const [formOutArrLat, setFormOutArrLat] = useState(0);
  const [formOutArrLng, setFormOutArrLng] = useState(0);
  const [formOutArrTz, setFormOutArrTz] = useState('UTC +02:00');
  const [formOutSchedDep, setFormOutSchedDep] = useState('');
  const [formOutActDep, setFormOutActDep] = useState('');
  const [formOutSchedArr, setFormOutSchedArr] = useState('');
  const [formOutEstArr, setFormOutEstArr] = useState('');
  const [formOutStatus, setFormOutStatus] = useState('בזמן');
  const [formOutAcType, setFormOutAcType] = useState('');
  const [formOutAcReg, setFormOutAcReg] = useState('');
  const [formOutAcSerial, setFormOutAcSerial] = useState('');
  const [formOutAcCountry, setFormOutAcCountry] = useState('');
  const [formOutDate, setFormOutDate] = useState('');
  const [formOutGate, setFormOutGate] = useState('');

  // Return Flight Form States
  const [formRetFlightNum, setFormRetFlightNum] = useState('');
  const [formRetAirline, setFormRetAirline] = useState('');
  const [formRetDepCode, setFormRetDepCode] = useState('');
  const [formRetDepCity, setFormRetDepCity] = useState('');
  const [formRetDepLat, setFormRetDepLat] = useState(0);
  const [formRetDepLng, setFormRetDepLng] = useState(0);
  const [formRetDepTz, setFormRetDepTz] = useState('UTC +02:00');
  const [formRetArrCode, setFormRetArrCode] = useState('');
  const [formRetArrCity, setFormRetArrCity] = useState('');
  const [formRetArrLat, setFormRetArrLat] = useState(0);
  const [formRetArrLng, setFormRetArrLng] = useState(0);
  const [formRetArrTz, setFormRetArrTz] = useState('UTC +02:00');
  const [formRetSchedDep, setFormRetSchedDep] = useState('');
  const [formRetActDep, setFormRetActDep] = useState('');
  const [formRetSchedArr, setFormRetSchedArr] = useState('');
  const [formRetEstArr, setFormRetEstArr] = useState('');
  const [formRetStatus, setFormRetStatus] = useState('בזמן');
  const [formRetAcType, setFormRetAcType] = useState('');
  const [formRetAcReg, setFormRetAcReg] = useState('');
  const [formRetAcSerial, setFormRetAcSerial] = useState('');
  const [formRetAcCountry, setFormRetAcCountry] = useState('');
  const [formRetDate, setFormRetDate] = useState('');
  const [formRetGate, setFormRetGate] = useState('');

  // Hotel Form States
  const [formHotelName, setFormHotelName] = useState('');
  const [formHotelAddress, setFormHotelAddress] = useState('');
  const [formHotelCheckIn, setFormHotelCheckIn] = useState('');
  const [formHotelCheckOut, setFormHotelCheckOut] = useState('');
  const [formHotelRef, setFormHotelRef] = useState('');
  const [formHotelRoom, setFormHotelRoom] = useState('');
  const [formHotelNotes, setFormHotelNotes] = useState('');

  // Automatic Lookup Trackers
  const lastOutLookupRef = useRef({ flightNum: '', date: '' });
  const lastRetLookupRef = useRef({ flightNum: '', date: '' });

  // Listen to Firestore
  useEffect(() => {
    if (!tripId) return;
    const docRef = doc(db, 'trips', tripId);
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists() && docSnap.data().outboundFlightDetails) {
        setTripData(docSnap.data());
        setLoading(false);
      } else {
        // Seed default flight/hotel data for new trip
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

  // Debounced auto-fetch for outbound flight
  useEffect(() => {
    if (!showEditModal) return;
    const flightNum = (formOutFlightNum || '').trim().toUpperCase();
    const date = (formOutDate || '').trim();
    
    if (flightNum.length >= 3 && date) {
      if (lastOutLookupRef.current.flightNum !== flightNum || lastOutLookupRef.current.date !== date) {
        lastOutLookupRef.current = { flightNum, date };
        const simResult = lookupFlight(flightNum);
        if (simResult) {
          setFormOutAirline(simResult.airline || '');
          setFormOutDepCode(simResult.depAirport?.code || '');
          setFormOutDepCity(simResult.depAirport?.city || '');
          setFormOutDepLat(simResult.depAirport?.lat || 0);
          setFormOutDepLng(simResult.depAirport?.lng || 0);
          setFormOutDepTz(simResult.depAirport?.timezone || 'UTC +02:00');
          setFormOutArrCode(simResult.arrAirport?.code || '');
          setFormOutArrCity(simResult.arrAirport?.city || '');
          setFormOutArrLat(simResult.arrAirport?.lat || 0);
          setFormOutArrLng(simResult.arrAirport?.lng || 0);
          setFormOutArrTz(simResult.arrAirport?.timezone || 'UTC +02:00');
          setFormOutSchedDep(simResult.scheduledDep || '');
          setFormOutActDep(simResult.actualDep || '');
          setFormOutSchedArr(simResult.scheduledArr || '');
          setFormOutEstArr(simResult.estimatedArr || '');
          setFormOutStatus(simResult.status || 'בזמן');
          setFormOutAcType(simResult.aircraftType || '');
          setFormOutAcReg(simResult.registration || '');
          setFormOutAcSerial(simResult.serialNumber || '');
          setFormOutAcCountry(simResult.country || '');
          setFormOutGate(simResult.gate || '');
        }
      }
    }
  }, [formOutFlightNum, formOutDate, showEditModal]);

  // Debounced auto-fetch for return flight
  useEffect(() => {
    if (!showEditModal) return;
    const flightNum = (formRetFlightNum || '').trim().toUpperCase();
    const date = (formRetDate || '').trim();
    
    if (flightNum.length >= 3 && date) {
      if (lastRetLookupRef.current.flightNum !== flightNum || lastRetLookupRef.current.date !== date) {
        lastRetLookupRef.current = { flightNum, date };
        const simResult = lookupFlight(flightNum);
        if (simResult) {
          setFormRetAirline(simResult.airline || '');
          setFormRetDepCode(simResult.depAirport?.code || '');
          setFormRetDepCity(simResult.depAirport?.city || '');
          setFormRetDepLat(simResult.depAirport?.lat || 0);
          setFormRetDepLng(simResult.depAirport?.lng || 0);
          setFormRetDepTz(simResult.depAirport?.timezone || 'UTC +02:00');
          setFormRetArrCode(simResult.arrAirport?.code || '');
          setFormRetArrCity(simResult.arrAirport?.city || '');
          setFormRetArrLat(simResult.arrAirport?.lat || 0);
          setFormRetArrLng(simResult.arrAirport?.lng || 0);
          setFormRetArrTz(simResult.arrAirport?.timezone || 'UTC +02:00');
          setFormRetSchedDep(simResult.scheduledDep || '');
          setFormRetActDep(simResult.actualDep || '');
          setFormRetSchedArr(simResult.scheduledArr || '');
          setFormRetEstArr(simResult.estimatedArr || '');
          setFormRetStatus(simResult.status || 'בזמן');
          setFormRetAcType(simResult.aircraftType || '');
          setFormRetAcReg(simResult.registration || '');
          setFormRetAcSerial(simResult.serialNumber || '');
          setFormRetAcCountry(simResult.country || '');
          setFormRetGate(simResult.gate || '');
        }
      }
    }
  }, [formRetFlightNum, formRetDate, showEditModal]);

  const handleOutboundSearch = () => {
    if (!searchOutboundCode.trim()) return;
    const simResult = lookupFlight(searchOutboundCode);
    
    // Auto-fill outbound fields
    setFormOutFlightNum(simResult.flightNumber);
    setFormOutAirline(simResult.airline);
    setFormOutDepCode(simResult.depAirport.code);
    setFormOutDepCity(simResult.depAirport.city);
    setFormOutDepLat(simResult.depAirport.lat);
    setFormOutDepLng(simResult.depAirport.lng);
    setFormOutDepTz(simResult.depAirport.timezone);
    setFormOutArrCode(simResult.arrAirport.code);
    setFormOutArrCity(simResult.arrAirport.city);
    setFormOutArrLat(simResult.arrAirport.lat);
    setFormOutArrLng(simResult.arrAirport.lng);
    setFormOutArrTz(simResult.arrAirport.timezone);
    setFormOutSchedDep(simResult.scheduledDep);
    setFormOutActDep(simResult.actualDep);
    setFormOutSchedArr(simResult.scheduledArr);
    setFormOutEstArr(simResult.estimatedArr);
    setFormOutStatus(simResult.status);
    setFormOutAcType(simResult.aircraftType);
    setFormOutAcReg(simResult.registration);
    setFormOutAcSerial(simResult.serialNumber);
    setFormOutAcCountry(simResult.country);
    setFormOutGate(simResult.gate || '');
  };

  const handleReturnSearch = () => {
    if (!searchReturnCode.trim()) return;
    const simResult = lookupFlight(searchReturnCode);
    
    // Auto-fill return fields
    setFormRetFlightNum(simResult.flightNumber);
    setFormRetAirline(simResult.airline);
    setFormRetDepCode(simResult.depAirport.code);
    setFormRetDepCity(simResult.depAirport.city);
    setFormRetDepLat(simResult.depAirport.lat);
    setFormRetDepLng(simResult.depAirport.lng);
    setFormRetDepTz(simResult.depAirport.timezone);
    setFormRetArrCode(simResult.arrAirport.code);
    setFormRetArrCity(simResult.arrAirport.city);
    setFormRetArrLat(simResult.arrAirport.lat);
    setFormRetArrLng(simResult.arrAirport.lng);
    setFormRetArrTz(simResult.arrAirport.timezone);
    setFormRetSchedDep(simResult.scheduledDep);
    setFormRetActDep(simResult.actualDep);
    setFormRetSchedArr(simResult.scheduledArr);
    setFormRetEstArr(simResult.estimatedArr);
    setFormRetStatus(simResult.status);
    setFormRetAcType(simResult.aircraftType);
    setFormRetAcReg(simResult.registration);
    setFormRetAcSerial(simResult.serialNumber);
    setFormRetAcCountry(simResult.country);
    setFormRetGate(simResult.gate || '');
  };

  const openEditModal = () => {
    if (!tripData) return;
    const out = tripData.outboundFlightDetails || emptyFlightDetails;
    const ret = tripData.returnFlightDetails || emptyFlightDetails;
    const htl = tripData.hotelDetails || emptyHotelDetails;

    setFormTripName(tripData.name || '');
    setFormTripDates(tripData.dates || '');

    // Outbound form states setup
    setFormOutFlightNum(out.flightNumber || '');
    setFormOutAirline(out.airline || '');
    setFormOutDepCode(out.depAirport.code || '');
    setFormOutDepCity(out.depAirport.city || '');
    setFormOutDepLat(out.depAirport.lat || 0);
    setFormOutDepLng(out.depAirport.lng || 0);
    setFormOutDepTz(out.depAirport.timezone || 'UTC +02:00');
    setFormOutArrCode(out.arrAirport.code || '');
    setFormOutArrCity(out.arrAirport.city || '');
    setFormOutArrLat(out.arrAirport.lat || 0);
    setFormOutArrLng(out.arrAirport.lng || 0);
    setFormOutArrTz(out.arrAirport.timezone || 'UTC +02:00');
    setFormOutSchedDep(out.scheduledDep || '');
    setFormOutActDep(out.actualDep || '');
    setFormOutSchedArr(out.scheduledArr || '');
    setFormOutEstArr(out.estimatedArr || '');
    setFormOutStatus(out.status || 'בזמן');
    setFormOutAcType(out.aircraftType || '');
    setFormOutAcReg(out.registration || '');
    setFormOutAcSerial(out.serialNumber || '');
    setFormOutAcCountry(out.country || '');
    setFormOutDate(out.date || '2026-06-15');
    setFormOutGate(out.gate || '');

    // Return form states setup
    setFormRetFlightNum(ret.flightNumber || '');
    setFormRetAirline(ret.airline || '');
    setFormRetDepCode(ret.depAirport.code || '');
    setFormRetDepCity(ret.depAirport.city || '');
    setFormRetDepLat(ret.depAirport.lat || 0);
    setFormRetDepLng(ret.depAirport.lng || 0);
    setFormRetDepTz(ret.depAirport.timezone || 'UTC +02:00');
    setFormRetArrCode(ret.arrAirport.code || '');
    setFormRetArrCity(ret.arrAirport.city || '');
    setFormRetArrLat(ret.arrAirport.lat || 0);
    setFormRetArrLng(ret.arrAirport.lng || 0);
    setFormRetArrTz(ret.arrAirport.timezone || 'UTC +02:00');
    setFormRetSchedDep(ret.scheduledDep || '');
    setFormRetActDep(ret.actualDep || '');
    setFormRetSchedArr(ret.scheduledArr || '');
    setFormRetEstArr(ret.estimatedArr || '');
    setFormRetStatus(ret.status || 'בזמן');
    setFormRetAcType(ret.aircraftType || '');
    setFormRetAcReg(ret.registration || '');
    setFormRetAcSerial(ret.serialNumber || '');
    setFormRetAcCountry(ret.country || '');
    setFormRetDate(ret.date || '2026-06-22');
    setFormRetGate(ret.gate || '');

    // Hotel form states setup
    setFormHotelName(htl.name || '');
    setFormHotelAddress(htl.address || '');
    setFormHotelCheckIn(htl.checkIn || '');
    setFormHotelCheckOut(htl.checkOut || '');
    setFormHotelRef(htl.bookingRef || '');
    setFormHotelRoom(htl.roomNumber || '');
    setFormHotelNotes(htl.notes || '');

    setSearchOutboundCode('');
    setSearchReturnCode('');
    setShowEditModal(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!tripId) return;
    const docRef = doc(db, 'trips', tripId);

    await setDoc(docRef, {
      outboundFlightDetails: {
        flightNumber: formOutFlightNum,
        airline: formOutAirline,
        depAirport: {
          code: formOutDepCode,
          city: formOutDepCity,
          lat: Number(formOutDepLat),
          lng: Number(formOutDepLng),
          timezone: formOutDepTz
        },
        arrAirport: {
          code: formOutArrCode,
          city: formOutArrCity,
          lat: Number(formOutArrLat),
          lng: Number(formOutArrLng),
          timezone: formOutArrTz
        },
        scheduledDep: formOutSchedDep,
        actualDep: formOutActDep,
        scheduledArr: formOutSchedArr,
        estimatedArr: formOutEstArr,
        status: formOutStatus,
        aircraftType: formOutAcType,
        registration: formOutAcReg,
        serialNumber: formOutAcSerial,
        country: formOutAcCountry,
        date: formOutDate,
        gate: formOutGate
      },
      returnFlightDetails: {
        flightNumber: formRetFlightNum,
        airline: formRetAirline,
        depAirport: {
          code: formRetDepCode,
          city: formRetDepCity,
          lat: Number(formRetDepLat),
          lng: Number(formRetDepLng),
          timezone: formRetDepTz
        },
        arrAirport: {
          code: formRetArrCode,
          city: formRetArrCity,
          lat: Number(formRetArrLat),
          lng: Number(formRetArrLng),
          timezone: formRetArrTz
        },
        scheduledDep: formRetSchedDep,
        actualDep: formRetActDep,
        scheduledArr: formRetSchedArr,
        estimatedArr: formRetEstArr,
        status: formRetStatus,
        aircraftType: formRetAcType,
        registration: formRetAcReg,
        serialNumber: formRetAcSerial,
        country: formRetAcCountry,
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
    });

    setShowEditModal(false);
  };

  const handleUpdateFlightDate = async (type, dateValue) => {
    if (!tripId) return;
    const docRef = doc(db, 'trips', tripId);
    
    // Quick inline date updates
    if (type === 'outbound') {
      await setDoc(docRef, {
        ...tripData,
        outboundFlightDetails: {
          ...tripData.outboundFlightDetails,
          date: dateValue
        }
      });
    } else {
      await setDoc(docRef, {
        ...tripData,
        returnFlightDetails: {
          ...tripData.returnFlightDetails,
          date: dateValue
        }
      });
    }
  };

  const handleMapTypeChange = (type) => {
    setActiveMapType(type);
    setHighlightedCard(type);
    
    // Smooth scroll to card
    const cardId = type === 'outbound' ? 'outbound-card' : 'return-card';
    const element = document.getElementById(cardId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Remove glow after animation completes
    setTimeout(() => {
      setHighlightedCard(null);
    }, 2000);
  };

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '';
    const d = new Date(dateTimeStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} בשעה ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const formatDateString = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
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

  // Progress info calculation
  const outProgress = getFlightProgressInfo(outbound);
  const retProgress = getFlightProgressInfo(returning);

  // Selected map config
  const mapFlight = activeMapType === 'outbound' ? outbound : returning;
  const mapProgress = activeMapType === 'outbound' ? outProgress : retProgress;

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Map Switcher Header and Map */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Compass size={18} />
            <span>מפת נתיב טיסה:</span>
          </h3>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => handleMapTypeChange('outbound')}
              className={`btn-tab-toggle ${activeMapType === 'outbound' ? 'active' : ''}`}
            >
              הלוך ({outbound.flightNumber || 'לא מוגדר'})
            </button>
            <button 
              onClick={() => handleMapTypeChange('return')}
              className={`btn-tab-toggle ${activeMapType === 'return' ? 'active' : ''}`}
            >
              חזור ({returning.flightNumber || 'לא מוגדר'})
            </button>
          </div>
        </div>

        <MapComponent 
          depCoords={mapFlight.depAirport} 
          arrCoords={mapFlight.arrAirport} 
          progressPercent={mapProgress.progressPercent}
        />
      </div>

      {/* Dynamic Grid for Outbound & Return Flight Cards */}
      <div className="dashboard-grid">
        
        {/* Outbound Flight Card */}
        <div id="outbound-card" className={`glass-card ${highlightedCard === 'outbound' ? 'highlight-pulse' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
          
          {/* Card Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="badge-success" style={{ background: 'rgba(79, 70, 229, 0.1)', color: 'var(--secondary-color)', padding: '4px 10px', fontSize: '11px', marginLeft: '8px' }}>טיסת הלוך</span>
              <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--primary-color)' }}>{outbound.flightNumber}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '6px' }}>{outbound.airline}</span>
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
                value={outbound.date || '2026-06-15'}
                onChange={(val) => handleUpdateFlightDate('outbound', val)}
                variant="compact"
              />
            </div>
          </div>

          {/* Airport Details */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'right' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--primary-color)' }}>{outbound.depAirport.code}</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary-color)' }}>{outbound.depAirport.city}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{outbound.depAirport.timezone}</div>
            </div>

            <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <div style={{ flex: 1, borderTop: '2px dashed rgba(11, 11, 48, 0.15)' }}></div>
                <Plane size={16} style={{ color: 'var(--primary-color)', margin: '0 6px', transform: 'rotate(-90deg)' }} />
                <div style={{ flex: 1, borderTop: '2px dashed rgba(11, 11, 48, 0.15)' }}></div>
              </div>
            </div>

            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--primary-color)' }}>{outbound.arrAirport.code}</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary-color)' }}>{outbound.arrAirport.city}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{outbound.arrAirport.timezone}</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }} />

          {/* Progress Slider */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ position: 'relative', height: '14px', width: '100%' }}>
              <div style={{ position: 'absolute', top: '6px', left: 0, right: 0, height: '2px', background: 'rgba(11,11,48,0.1)' }}></div>
              <div style={{ position: 'absolute', top: '6px', right: 0, width: `${outProgress.progressPercent * 100}%`, height: '2px', background: 'var(--primary-color)' }}></div>
              <div style={{ 
                position: 'absolute', 
                top: '-3px', 
                right: `${outProgress.progressPercent * 100}%`, 
                transform: 'translateX(50%) rotate(-90deg)', 
                color: 'var(--primary-color)',
                background: '#ffffff',
                borderRadius: '50%',
                padding: '2px',
                display: 'flex',
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
              }}>
                <Plane size={12} fill="var(--primary-color)" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700' }}>
              <span>{outProgress.completedDistance} ק"מ</span>
              <span>{outProgress.remainingDistance} ק"מ נותר • כ-{outProgress.remainingTime} שעות</span>
              <span>{outProgress.totalDistance} ק"מ</span>
            </div>
          </div>

          {/* Table Grid Times */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>המראה מתוכננת / מעודכנת:</span>
              <span style={{ fontWeight: '800' }}>{outbound.scheduledDep} ◄ {outbound.actualDep}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>נחיתה מתוכננת / משוערת:</span>
              <span style={{ fontWeight: '800' }}>{outbound.scheduledArr} ◄ {outbound.estimatedArr}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>סטטוס טיסה:</span>
              <span className="badge-success">
                <span className="pulsing-dot"></span>
                <span>{outbound.status}</span>
              </span>
            </div>
          </div>

          {/* Aircraft Subcard */}
          <div style={{ background: 'rgba(11,11,48,0.03)', padding: '12px', borderRadius: 'var(--border-radius-md)', fontSize: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>מטוס: </span>
              <strong style={{ color: 'var(--primary-color)' }}>{outbound.aircraftType || 'N/A'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>רישום: </span>
              <strong style={{ color: 'var(--primary-color)' }}>{outbound.registration || 'N/A'}</strong>
            </div>
            {outbound.gate && (
              <div style={{ gridColumn: 'span 2', borderTop: '1px dashed rgba(0,0,0,0.04)', paddingTop: '6px', marginTop: '2px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>שער עלייה למטוס (Gate): </span>
                <strong style={{ color: 'var(--accent)', fontSize: '13px' }}>{outbound.gate}</strong>
              </div>
            )}
          </div>

        </div>

        {/* Return Flight Card */}
        <div id="return-card" className={`glass-card ${highlightedCard === 'return' ? 'highlight-pulse' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
          
          {/* Card Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="badge-success" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'rgb(239, 68, 68)', padding: '4px 10px', fontSize: '11px', marginLeft: '8px' }}>טיסת חזור</span>
              <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--primary-color)' }}>{returning.flightNumber}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '6px' }}>{returning.airline}</span>
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
                value={returning.date || '2026-06-22'}
                onChange={(val) => handleUpdateFlightDate('return', val)}
                variant="compact"
              />
            </div>
          </div>

          {/* Airport Details */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'right' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--primary-color)' }}>{returning.depAirport.code}</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary-color)' }}>{returning.depAirport.city}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{returning.depAirport.timezone}</div>
            </div>

            <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <div style={{ flex: 1, borderTop: '2px dashed rgba(11, 11, 48, 0.15)' }}></div>
                <Plane size={16} style={{ color: 'var(--primary-color)', margin: '0 6px', transform: 'rotate(-90deg)' }} />
                <div style={{ flex: 1, borderTop: '2px dashed rgba(11, 11, 48, 0.15)' }}></div>
              </div>
            </div>

            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--primary-color)' }}>{returning.arrAirport.code}</div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary-color)' }}>{returning.arrAirport.city}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{returning.arrAirport.timezone}</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }} />

          {/* Progress Slider */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ position: 'relative', height: '14px', width: '100%' }}>
              <div style={{ position: 'absolute', top: '6px', left: 0, right: 0, height: '2px', background: 'rgba(11,11,48,0.1)' }}></div>
              <div style={{ position: 'absolute', top: '6px', right: 0, width: `${retProgress.progressPercent * 100}%`, height: '2px', background: 'var(--primary-color)' }}></div>
              <div style={{ 
                position: 'absolute', 
                top: '-3px', 
                right: `${retProgress.progressPercent * 100}%`, 
                transform: 'translateX(50%) rotate(-90deg)', 
                color: 'var(--primary-color)',
                background: '#ffffff',
                borderRadius: '50%',
                padding: '2px',
                display: 'flex',
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
              }}>
                <Plane size={12} fill="var(--primary-color)" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700' }}>
              <span>{retProgress.completedDistance} ק"מ</span>
              <span>{retProgress.remainingDistance} ק"מ נותר • כ-{retProgress.remainingTime} שעות</span>
              <span>{retProgress.totalDistance} ק"מ</span>
            </div>
          </div>

          {/* Table Grid Times */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>המראה מתוכננת / מעודכנת:</span>
              <span style={{ fontWeight: '800' }}>{returning.scheduledDep} ◄ {returning.actualDep}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>נחיתה מתוכננת / משוערת:</span>
              <span style={{ fontWeight: '800' }}>{returning.scheduledArr} ◄ {returning.estimatedArr}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>סטטוס טיסה:</span>
              <span className="badge-success">
                <span className="pulsing-dot"></span>
                <span>{returning.status}</span>
              </span>
            </div>
          </div>

          {/* Aircraft Subcard */}
          <div style={{ background: 'rgba(11,11,48,0.03)', padding: '12px', borderRadius: 'var(--border-radius-md)', fontSize: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>מטוס: </span>
              <strong style={{ color: 'var(--primary-color)' }}>{returning.aircraftType || 'N/A'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>רישום: </span>
              <strong style={{ color: 'var(--primary-color)' }}>{returning.registration || 'N/A'}</strong>
            </div>
            {returning.gate && (
              <div style={{ gridColumn: 'span 2', borderTop: '1px dashed rgba(0,0,0,0.04)', paddingTop: '6px', marginTop: '2px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: '700' }}>שער עלייה למטוס (Gate): </span>
                <strong style={{ color: 'var(--accent)', fontSize: '13px' }}>{returning.gate}</strong>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Hotel Card & Bottom Action bar */}
      <div className="dashboard-grid">
        
        {/* Hotel Details Card */}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
            רוצה לשנות קודי טיסה, זמנים, קואורדינטות, רישומי מטוסים או את פרטי המלון? 
            הכל פתוח ועריץ לחלוטין.
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

      </div>

      {/* Full Field Editor Modal (Outbound + Return + Hotel) */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            
            <div className="modal-header">
              <h2>עריכת כל פרטי הנסיעה</h2>
              <button className="btn-close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* === GENERAL TRIP METADATA === */}
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
                
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>תאריכים</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formTripDates} 
                    onChange={(e) => setFormTripDates(e.target.value)} 
                    required 
                    placeholder="למשל: 15.06.2026 - 22.06.2026"
                  />
                </div>
              </div>
              
              {/* === SECTION 1: OUTBOUND FLIGHT === */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid rgba(11,11,48,0.1)', padding: '16px', borderRadius: 'var(--border-radius-lg)', background: 'rgba(11,11,48,0.01)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '900', color: 'var(--secondary-color)', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '6px', marginBottom: '4px' }}>
                  <span>1. פרטי טיסת הלוך</span>
                </h3>

                {/* Lookup bar */}
                <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.7)', padding: '8px', borderRadius: 'var(--border-radius-md)', border: '1px solid rgba(11,11,48,0.08)' }}>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="שליפה מהירה (למשל: FR3891, LY381)" 
                    value={searchOutboundCode}
                    onChange={(e) => setSearchOutboundCode(e.target.value)}
                    style={{ flex: 1, minHeight: '40px', padding: '8px 12px', fontSize: '14px' }}
                  />
                  <button type="button" onClick={handleOutboundSearch} className="btn-primary" style={{ minHeight: '40px', padding: '0 16px', fontSize: '14px' }}>
                    <Search size={14} />
                    <span>שלוף</span>
                  </button>
                </div>

                <div className="row-2">
                  <div className="form-group">
                    <label>מספר טיסה</label>
                    <input type="text" className="form-control" value={formOutFlightNum} onChange={(e) => setFormOutFlightNum(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>חברת תעופה</label>
                    <input type="text" className="form-control" value={formOutAirline} onChange={(e) => setFormOutAirline(e.target.value)} required />
                  </div>
                </div>

                <div className="form-group">
                  <label>שער עלייה למטוס (Gate)</label>
                  <input type="text" className="form-control" value={formOutGate} onChange={(e) => setFormOutGate(e.target.value)} placeholder="למשל: B12" />
                </div>

                <div className="form-group">
                  <CustomDatePicker value={formOutDate} onChange={(val) => setFormOutDate(val)} label="תאריך טיסה" required />
                </div>

                {/* Departure details */}
                <div style={{ background: '#ffffff', padding: '12px', borderRadius: 'var(--border-radius-md)', border: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--primary-color)' }}>שדה מוצא</span>
                  <div className="row-2">
                    <div className="form-group" style={{ marginBottom: 0 }}><label>קוד IATA</label><input type="text" className="form-control" value={formOutDepCode} onChange={(e) => setFormOutDepCode(e.target.value)} required /></div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label>עיר מוצא</label><input type="text" className="form-control" value={formOutDepCity} onChange={(e) => setFormOutDepCity(e.target.value)} required /></div>
                  </div>
                  <div className="row-2">
                    <div className="form-group" style={{ marginBottom: 0 }}><label>קו רוחב (Lat)</label><input type="number" step="any" className="form-control" value={formOutDepLat} onChange={(e) => setFormOutDepLat(e.target.value)} required /></div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label>קו אורך (Lng)</label><input type="number" step="any" className="form-control" value={formOutDepLng} onChange={(e) => setFormOutDepLng(e.target.value)} required /></div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>אזור זמן</label><input type="text" className="form-control" value={formOutDepTz} onChange={(e) => setFormOutDepTz(e.target.value)} required /></div>
                </div>

                {/* Arrival details */}
                <div style={{ background: '#ffffff', padding: '12px', borderRadius: 'var(--border-radius-md)', border: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--primary-color)' }}>שדה יעד</span>
                  <div className="row-2">
                    <div className="form-group" style={{ marginBottom: 0 }}><label>קוד IATA</label><input type="text" className="form-control" value={formOutArrCode} onChange={(e) => setFormOutArrCode(e.target.value)} required /></div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label>עיר יעד</label><input type="text" className="form-control" value={formOutArrCity} onChange={(e) => setFormOutArrCity(e.target.value)} required /></div>
                  </div>
                  <div className="row-2">
                    <div className="form-group" style={{ marginBottom: 0 }}><label>קו רוחב (Lat)</label><input type="number" step="any" className="form-control" value={formOutArrLat} onChange={(e) => setFormOutArrLat(e.target.value)} required /></div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label>קו אורך (Lng)</label><input type="number" step="any" className="form-control" value={formOutArrLng} onChange={(e) => setFormOutArrLng(e.target.value)} required /></div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>אזור זמן</label><input type="text" className="form-control" value={formOutArrTz} onChange={(e) => setFormOutArrTz(e.target.value)} required /></div>
                </div>

                <div className="row-2">
                  <div className="form-group" style={{ marginBottom: 0 }}><label>המראה מתוכננת</label><input type="text" className="form-control" value={formOutSchedDep} onChange={(e) => setFormOutSchedDep(e.target.value)} required /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>המראה בפועל</label><input type="text" className="form-control" value={formOutActDep} onChange={(e) => setFormOutActDep(e.target.value)} required /></div>
                </div>
                <div className="row-2">
                  <div className="form-group" style={{ marginBottom: 0 }}><label>נחיתה מתוכננת</label><input type="text" className="form-control" value={formOutSchedArr} onChange={(e) => setFormOutSchedArr(e.target.value)} required /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>נחיתה משוערת</label><input type="text" className="form-control" value={formOutEstArr} onChange={(e) => setFormOutEstArr(e.target.value)} required /></div>
                </div>

                <div className="row-2">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>סטטוס טיסה</label>
                    <select className="form-control" value={formOutStatus} onChange={(e) => setFormOutStatus(e.target.value)}>
                      <option value="בזמן">בזמן</option>
                      <option value="באיחור קל">באיחור קל</option>
                      <option value="באיחור רציני">באיחור רציני</option>
                      <option value="בוטלה">בוטלה</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>סוג מטוס</label><input type="text" className="form-control" value={formOutAcType} onChange={(e) => setFormOutAcType(e.target.value)} /></div>
                </div>

                <div className="row-2">
                  <div className="form-group" style={{ marginBottom: 0 }}><label>רישום (Reg)</label><input type="text" className="form-control" value={formOutAcReg} onChange={(e) => setFormOutAcReg(e.target.value)} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>מספר סידורי</label><input type="text" className="form-control" value={formOutAcSerial} onChange={(e) => setFormOutAcSerial(e.target.value)} /></div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}><label>מדינת רישום</label><input type="text" className="form-control" value={formOutAcCountry} onChange={(e) => setFormOutAcCountry(e.target.value)} /></div>
              </div>

              {/* === SECTION 2: RETURN FLIGHT === */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid rgba(11,11,48,0.1)', padding: '16px', borderRadius: 'var(--border-radius-lg)', background: 'rgba(11,11,48,0.01)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '900', color: 'rgb(239, 68, 68)', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '6px', marginBottom: '4px' }}>
                  <span>2. פרטי טיסת חזור</span>
                </h3>

                {/* Lookup bar */}
                <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.7)', padding: '8px', borderRadius: 'var(--border-radius-md)', border: '1px solid rgba(11,11,48,0.08)' }}>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="שליפה מהירה (למשל: FR3892, LY382)" 
                    value={searchReturnCode}
                    onChange={(e) => setSearchReturnCode(e.target.value)}
                    style={{ flex: 1, minHeight: '40px', padding: '8px 12px', fontSize: '14px' }}
                  />
                  <button type="button" onClick={handleReturnSearch} className="btn-primary" style={{ minHeight: '40px', padding: '0 16px', fontSize: '14px' }}>
                    <Search size={14} />
                    <span>שלוף</span>
                  </button>
                </div>

                <div className="row-2">
                  <div className="form-group">
                    <label>מספר טיסה</label>
                    <input type="text" className="form-control" value={formRetFlightNum} onChange={(e) => setFormRetFlightNum(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>חברת תעופה</label>
                    <input type="text" className="form-control" value={formRetAirline} onChange={(e) => setFormRetAirline(e.target.value)} required />
                  </div>
                </div>

                <div className="form-group">
                  <label>שער עלייה למטוס (Gate)</label>
                  <input type="text" className="form-control" value={formRetGate} onChange={(e) => setFormRetGate(e.target.value)} placeholder="למשל: A4" />
                </div>

                <div className="form-group">
                  <CustomDatePicker value={formRetDate} onChange={(val) => setFormRetDate(val)} label="תאריך טיסה" required />
                </div>

                {/* Departure details */}
                <div style={{ background: '#ffffff', padding: '12px', borderRadius: 'var(--border-radius-md)', border: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--primary-color)' }}>שדה מוצא</span>
                  <div className="row-2">
                    <div className="form-group" style={{ marginBottom: 0 }}><label>קוד IATA</label><input type="text" className="form-control" value={formRetDepCode} onChange={(e) => setFormRetDepCode(e.target.value)} required /></div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label>עיר מוצא</label><input type="text" className="form-control" value={formRetDepCity} onChange={(e) => setFormRetDepCity(e.target.value)} required /></div>
                  </div>
                  <div className="row-2">
                    <div className="form-group" style={{ marginBottom: 0 }}><label>קו רוחב (Lat)</label><input type="number" step="any" className="form-control" value={formRetDepLat} onChange={(e) => setFormRetDepLat(e.target.value)} required /></div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label>קו אורך (Lng)</label><input type="number" step="any" className="form-control" value={formRetDepLng} onChange={(e) => setFormRetDepLng(e.target.value)} required /></div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>אזור זמן</label><input type="text" className="form-control" value={formRetDepTz} onChange={(e) => setFormRetDepTz(e.target.value)} required /></div>
                </div>

                {/* Arrival details */}
                <div style={{ background: '#ffffff', padding: '12px', borderRadius: 'var(--border-radius-md)', border: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--primary-color)' }}>שדה יעד</span>
                  <div className="row-2">
                    <div className="form-group" style={{ marginBottom: 0 }}><label>קוד IATA</label><input type="text" className="form-control" value={formRetArrCode} onChange={(e) => setFormRetArrCode(e.target.value)} required /></div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label>עיר יעד</label><input type="text" className="form-control" value={formRetArrCity} onChange={(e) => setFormRetArrCity(e.target.value)} required /></div>
                  </div>
                  <div className="row-2">
                    <div className="form-group" style={{ marginBottom: 0 }}><label>קו רוחב (Lat)</label><input type="number" step="any" className="form-control" value={formRetArrLat} onChange={(e) => setFormRetArrLat(e.target.value)} required /></div>
                    <div className="form-group" style={{ marginBottom: 0 }}><label>קו אורך (Lng)</label><input type="number" step="any" className="form-control" value={formRetArrLng} onChange={(e) => setFormRetArrLng(e.target.value)} required /></div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>אזור זמן</label><input type="text" className="form-control" value={formRetArrTz} onChange={(e) => setFormRetArrTz(e.target.value)} required /></div>
                </div>

                <div className="row-2">
                  <div className="form-group" style={{ marginBottom: 0 }}><label>המראה מתוכננת</label><input type="text" className="form-control" value={formRetSchedDep} onChange={(e) => setFormRetSchedDep(e.target.value)} required /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>המראה בפועל</label><input type="text" className="form-control" value={formRetActDep} onChange={(e) => setFormRetActDep(e.target.value)} required /></div>
                </div>
                <div className="row-2">
                  <div className="form-group" style={{ marginBottom: 0 }}><label>נחיתה מתוכננת</label><input type="text" className="form-control" value={formRetSchedArr} onChange={(e) => setFormRetSchedArr(e.target.value)} required /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>נחיתה משוערת</label><input type="text" className="form-control" value={formRetEstArr} onChange={(e) => setFormRetEstArr(e.target.value)} required /></div>
                </div>

                <div className="row-2">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>סטטוס טיסה</label>
                    <select className="form-control" value={formRetStatus} onChange={(e) => setFormRetStatus(e.target.value)}>
                      <option value="בזמן">בזמן</option>
                      <option value="באיחור קל">באיחור קל</option>
                      <option value="באיחור רציני">באיחור רציני</option>
                      <option value="בוטלה">בוטלה</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>סוג מטוס</label><input type="text" className="form-control" value={formRetAcType} onChange={(e) => setFormRetAcType(e.target.value)} /></div>
                </div>

                <div className="row-2">
                  <div className="form-group" style={{ marginBottom: 0 }}><label>רישום (Reg)</label><input type="text" className="form-control" value={formRetAcReg} onChange={(e) => setFormRetAcReg(e.target.value)} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>מספר סידורי</label><input type="text" className="form-control" value={formRetAcSerial} onChange={(e) => setFormRetAcSerial(e.target.value)} /></div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}><label>מדינת רישום</label><input type="text" className="form-control" value={formRetAcCountry} onChange={(e) => setFormRetAcCountry(e.target.value)} /></div>
              </div>

              {/* === SECTION 3: HOTEL DETAILS === */}
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
                  <CustomDateTimePicker value={formHotelCheckIn} onChange={(val) => setFormHotelCheckIn(val)} label="כניסה (Check-in)" />
                  <CustomDateTimePicker value={formHotelCheckOut} onChange={(val) => setFormHotelCheckOut(val)} label="עזיבה (Check-out)" />
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

              {/* Action Buttons */}
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
