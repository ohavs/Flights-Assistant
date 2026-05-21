// Flight status simulator and coordinate generator
const airportDatabase = {
  // Israel
  TLV: { code: 'TLV', city: 'תל אביב', name: 'נמל התעופה בן גוריון', lat: 32.0055, lng: 34.8854, timezone: 'UTC +03:00' },
  // Europe
  NUE: { code: 'NUE', city: 'נירנברג', name: 'Nuremberg Airport', lat: 49.4987, lng: 11.0780, timezone: 'UTC +02:00' },
  GRO: { code: 'GRO', city: "ז'ירונה", name: 'Girona-Costa Brava Airport', lat: 41.9010, lng: 2.7606, timezone: 'UTC +02:00' },
  FCO: { code: 'FCO', city: 'רומא', name: 'Leonardo da Vinci-Fiumicino Airport', lat: 41.7999, lng: 12.2462, timezone: 'UTC +02:00' },
  MXP: { code: 'MXP', city: 'מילאנו', name: 'Milan Malpensa', lat: 45.6306, lng: 8.7281, timezone: 'UTC +02:00' },
  FRA: { code: 'FRA', city: 'פרנקפורט', name: 'Frankfurt Airport', lat: 50.0379, lng: 8.5622, timezone: 'UTC +02:00' },
  MUC: { code: 'MUC', city: 'מינכן', name: 'Munich Airport', lat: 48.3538, lng: 11.7861, timezone: 'UTC +02:00' },
  BER: { code: 'BER', city: 'ברלין', name: 'Berlin Brandenburg', lat: 52.3667, lng: 13.5033, timezone: 'UTC +02:00' },
  LTN: { code: 'LTN', city: 'לונדון לוטון', name: 'London Luton Airport', lat: 51.8763, lng: -0.3717, timezone: 'UTC +01:00' },
  LHR: { code: 'LHR', city: 'לונדון הית\'רו', name: 'London Heathrow', lat: 51.4700, lng: -0.4543, timezone: 'UTC +01:00' },
  LGW: { code: 'LGW', city: 'לונדון גטוויק', name: 'London Gatwick', lat: 51.1481, lng: -0.1903, timezone: 'UTC +01:00' },
  CDG: { code: 'CDG', city: 'פריז', name: 'Charles de Gaulle Airport', lat: 49.0097, lng: 2.5479, timezone: 'UTC +02:00' },
  ORY: { code: 'ORY', city: 'פריז אורלי', name: 'Paris Orly', lat: 48.7233, lng: 2.3795, timezone: 'UTC +02:00' },
  AMS: { code: 'AMS', city: 'אמסטרדם', name: 'Amsterdam Schiphol', lat: 52.3105, lng: 4.7683, timezone: 'UTC +02:00' },
  BCN: { code: 'BCN', city: 'ברצלונה', name: 'Barcelona-El Prat', lat: 41.2974, lng: 2.0833, timezone: 'UTC +02:00' },
  MAD: { code: 'MAD', city: 'מדריד', name: 'Madrid Barajas', lat: 40.4936, lng: -3.5668, timezone: 'UTC +02:00' },
  ATH: { code: 'ATH', city: 'אתונה', name: 'Athens International Airport', lat: 37.9356, lng: 23.9484, timezone: 'UTC +03:00' },
  PRG: { code: 'PRG', city: 'פראג', name: 'Václav Havel Airport Prague', lat: 50.1008, lng: 14.2600, timezone: 'UTC +02:00' },
  VIE: { code: 'VIE', city: 'וינה', name: 'Vienna International', lat: 48.1102, lng: 16.5697, timezone: 'UTC +02:00' },
  BUD: { code: 'BUD', city: 'בודפשט', name: 'Budapest Ferenc Liszt', lat: 47.4369, lng: 19.2556, timezone: 'UTC +02:00' },
  WAW: { code: 'WAW', city: 'ורשה', name: 'Warsaw Chopin', lat: 52.1657, lng: 20.9671, timezone: 'UTC +02:00' },
  IST: { code: 'IST', city: 'איסטנבול', name: 'Istanbul Airport', lat: 41.2753, lng: 28.7519, timezone: 'UTC +03:00' },
  // Americas
  JFK: { code: 'JFK', city: 'ניו יורק JFK', name: 'John F. Kennedy International', lat: 40.6413, lng: -73.7781, timezone: 'UTC -04:00' },
  EWR: { code: 'EWR', city: 'ניוארק', name: 'Newark Liberty', lat: 40.6895, lng: -74.1745, timezone: 'UTC -04:00' },
  LAX: { code: 'LAX', city: 'לוס אנג\'לס', name: 'Los Angeles International', lat: 33.9416, lng: -118.4085, timezone: 'UTC -07:00' },
  MIA: { code: 'MIA', city: 'מיאמי', name: 'Miami International', lat: 25.7959, lng: -80.2870, timezone: 'UTC -04:00' },
  YYZ: { code: 'YYZ', city: 'טורונטו', name: 'Toronto Pearson', lat: 43.6777, lng: -79.6248, timezone: 'UTC -04:00' },
  // Asia / other
  DXB: { code: 'DXB', city: 'דובאי', name: 'Dubai International', lat: 25.2532, lng: 55.3657, timezone: 'UTC +04:00' },
  BKK: { code: 'BKK', city: 'בנגקוק', name: 'Suvarnabhumi', lat: 13.6900, lng: 100.7501, timezone: 'UTC +07:00' },
  HKG: { code: 'HKG', city: 'הונג קונג', name: 'Hong Kong International', lat: 22.3080, lng: 113.9185, timezone: 'UTC +08:00' },
  NRT: { code: 'NRT', city: 'טוקיו נריטה', name: 'Narita International', lat: 35.7720, lng: 140.3929, timezone: 'UTC +09:00' },
};

const flightPresetDatabase = {
  FR3891: {
    flightNumber: 'FR3891',
    airline: 'Lufthansa',
    depAirport: airportDatabase.NUE,
    arrAirport: airportDatabase.GRO,
    scheduledDep: '09:10 AM',
    actualDep: '09:12 AM',
    scheduledArr: '12:24 PM',
    estimatedArr: '12:20 PM',
    status: 'בזמן',
    aircraftType: 'Boeing 737-8AS',
    registration: 'EI-EKI',
    serialNumber: '33821',
    country: 'אירלנד',
  },
  FR3892: {
    flightNumber: 'FR3892',
    airline: 'Lufthansa',
    depAirport: airportDatabase.GRO,
    arrAirport: airportDatabase.NUE,
    scheduledDep: '04:15 PM',
    actualDep: '04:15 PM',
    scheduledArr: '07:30 PM',
    estimatedArr: '07:25 PM',
    status: 'בזמן',
    aircraftType: 'Boeing 737-8AS',
    registration: 'EI-EKI',
    serialNumber: '33821',
    country: 'אירלנד',
  },
  LY381: {
    flightNumber: 'LY381',
    airline: 'אל על',
    depAirport: airportDatabase.TLV,
    arrAirport: airportDatabase.FCO,
    scheduledDep: '06:15 AM',
    actualDep: '06:20 AM',
    scheduledArr: '09:45 AM',
    estimatedArr: '09:38 AM',
    status: 'בזמן',
    aircraftType: 'Boeing 737-900ER',
    registration: '4X-EHD',
    serialNumber: '41555',
    country: 'ישראל',
  },
  LY382: {
    flightNumber: 'LY382',
    airline: 'אל על',
    depAirport: airportDatabase.FCO,
    arrAirport: airportDatabase.TLV,
    scheduledDep: '11:30 AM',
    actualDep: '11:40 AM',
    scheduledArr: '04:45 PM',
    estimatedArr: '04:40 PM',
    status: 'בזמן',
    aircraftType: 'Boeing 737-900ER',
    registration: '4X-EHD',
    serialNumber: '41555',
    country: 'ישראל',
  },
  LH686: {
    flightNumber: 'LH686',
    airline: 'Lufthansa',
    depAirport: airportDatabase.FRA,
    arrAirport: airportDatabase.TLV,
    scheduledDep: '10:00 AM',
    actualDep: '10:15 AM',
    scheduledArr: '03:10 PM',
    estimatedArr: '03:15 PM',
    status: 'בזמן',
    aircraftType: 'Airbus A321-231',
    registration: 'D-AIDQ',
    serialNumber: '5252',
    country: 'גרמניה',
  },
  LH687: {
    flightNumber: 'LH687',
    airline: 'Lufthansa',
    depAirport: airportDatabase.TLV,
    arrAirport: airportDatabase.FRA,
    scheduledDep: '04:50 PM',
    actualDep: '05:00 PM',
    scheduledArr: '08:20 PM',
    estimatedArr: '08:25 PM',
    status: 'בזמן',
    aircraftType: 'Airbus A321-231',
    registration: 'D-AIDQ',
    serialNumber: '5252',
    country: 'גרמניה',
  },
  EZY2083: {
    flightNumber: 'EZY2083',
    airline: 'EasyJet',
    depAirport: airportDatabase.LTN,
    arrAirport: airportDatabase.TLV,
    scheduledDep: '12:30 PM',
    actualDep: '12:45 PM',
    scheduledArr: '07:40 PM',
    estimatedArr: '07:45 PM',
    status: 'בזמן',
    aircraftType: 'Airbus A320-214',
    registration: 'G-EZWM',
    serialNumber: '6161',
    country: 'בריטניה',
  },
  EZY2084: {
    flightNumber: 'EZY2084',
    airline: 'EasyJet',
    depAirport: airportDatabase.TLV,
    arrAirport: airportDatabase.LTN,
    scheduledDep: '08:55 PM',
    actualDep: '09:05 PM',
    scheduledArr: '12:15 AM',
    estimatedArr: '12:10 AM',
    status: 'בזמן',
    aircraftType: 'Airbus A320-214',
    registration: 'G-EZWM',
    serialNumber: '6161',
    country: 'בריטניה',
  }
};

const airlinePrefixes = [
  { prefix: 'LY', name: 'אל על' },
  { prefix: 'LH', name: 'Lufthansa' },
  { prefix: 'FR', name: 'Lufthansa' }, // following user mockup where FR3891 is Lufthansa
  { prefix: 'EZY', name: 'EasyJet' },
  { prefix: 'U2', name: 'EasyJet' },
  { prefix: 'BA', name: 'British Airways' },
  { prefix: 'AF', name: 'Air France' },
  { prefix: 'AZ', name: 'ITA Airways' },
  { prefix: 'TK', name: 'Turkish Airlines' },
  { prefix: 'IB', name: 'Iberia' },
];

const aircraftTypes = [
  { type: 'Boeing 737-800', regPrefix: '4X-EK', country: 'ישראל' },
  { type: 'Boeing 787-9 Dreamliner', regPrefix: '4X-ED', country: 'ישראל' },
  { type: 'Airbus A320neo', regPrefix: 'D-AI', country: 'גרמניה' },
  { type: 'Boeing 737-8AS', regPrefix: 'EI-EK', country: 'אירלנד' },
  { type: 'Airbus A321neo', regPrefix: 'G-NE', country: 'בריטניה' },
];

// Parse a "UTC +03:00" / "UTC -04:00" string into a numeric offset in hours.
export function parseUtcOffset(tzStr) {
  if (!tzStr) return 0;
  const m = String(tzStr).match(/UTC\s*([+-])\s*(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) + parseInt(m[3], 10) / 60);
}

// Israel is UTC+3 year-round (IST is UTC+2, IDT is UTC+3). Using +3 as the user's reference.
const ISRAEL_UTC_OFFSET = 3;

// Format the time-zone difference vs. Israel — e.g. "−1 שעה מישראל", "אותה שעה".
export function formatOffsetFromIsrael(tzStr) {
  if (!tzStr) return '';
  const diff = parseUtcOffset(tzStr) - ISRAEL_UTC_OFFSET;
  if (diff === 0) return 'אותה שעה כמו בישראל';
  const abs = Math.abs(diff);
  const sign = diff > 0 ? '+' : '−';
  const noun = abs === 1 ? 'שעה' : 'שעות';
  // Show .5 only if non-integer
  const num = Number.isInteger(abs) ? abs : abs.toFixed(1);
  return `${sign}${num} ${noun} מישראל`;
}

// Helper to calculate distance in km between two lat/lng points (Haversine formula)
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return Math.round(d);
}

// Generate intermediate coordinates along a line (0 = start, 1 = end)
export function getIntermediatePoint(lat1, lon1, lat2, lon2, fraction) {
  // Simple linear interpolation for short/medium distances (sufficient for simple map animation)
  const lat = lat1 + (lat2 - lat1) * fraction;
  const lng = lon1 + (lon2 - lon1) * fraction;
  return [lat, lng];
}

// Main lookup function. Deterministic: same flightNumber + date will always return
// the same data so the UI stops "changing its mind" between renders.
export function lookupFlight(flightNumInput, dateInput) {
  const flightNumber = String(flightNumInput || '').trim().toUpperCase();
  const dateStr = String(dateInput || '').trim();
  if (!flightNumber) return null;

  // Simple string hash → 32-bit unsigned integer. Stable across calls/runs.
  const hash = (s) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h = (h ^ s.charCodeAt(i)) >>> 0;
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  };
  const seed = hash(flightNumber + '|' + dateStr);
  // Deterministic pseudo-random helpers using the seed
  let s = seed || 1;
  const next = () => { s = (Math.imul(s, 48271) ^ (s >>> 0)) >>> 0; return s; };
  const intIn = (min, max) => min + (next() % (max - min + 1));

  const generateGate = (numStr) => {
    const gates = ['A', 'B', 'C', 'D', 'E'];
    const gateLetter = gates[numStr.charCodeAt(0) % gates.length];
    const gateNum = (numStr.charCodeAt(numStr.length - 1) % 20) + 1;
    return `${gateLetter}${gateNum}`;
  };

  if (flightPresetDatabase[flightNumber]) {
    const preset = { ...flightPresetDatabase[flightNumber] };
    if (!preset.gate) {
      preset.gate = generateGate(flightNumber);
    }
    return preset;
  }

  // Generate deterministically from seeded RNG
  let airline = 'חברת תעופה גלובלית';
  for (const item of airlinePrefixes) {
    if (flightNumber.startsWith(item.prefix)) {
      airline = item.name;
      break;
    }
  }

  const keys = Object.keys(airportDatabase);
  let depKey = keys[intIn(0, keys.length - 1)];
  let arrKey = keys[intIn(0, keys.length - 1)];
  if (depKey === arrKey) {
    arrKey = keys[(keys.indexOf(depKey) + 1) % keys.length];
  }

  const depAirport = airportDatabase[depKey];
  const arrAirport = airportDatabase[arrKey];

  // Aircraft picked deterministically from the flight number
  const acIdx = (flightNumber.charCodeAt(flightNumber.length - 1) || 0) % aircraftTypes.length;
  const ac = aircraftTypes[acIdx];
  const regSeed = intIn(100, 999);
  const registration = `${ac.regPrefix}${String.fromCharCode(65 + (regSeed % 26))}${String.fromCharCode(65 + ((regSeed + 3) % 26))}`;
  const serialNumber = String(10000 + intIn(0, 39999));

  // Times
  const scheduledDepHours = intIn(6, 19);
  const scheduledDepMins = intIn(0, 3) * 15;
  const fmt = (hours, mins) => {
    const period = hours >= 12 ? 'PM' : 'AM';
    const h12 = ((hours + 11) % 12) + 1; // 0→12, 13→1, etc.
    return `${String(h12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${period}`;
  };

  const actualDelay = next() % 2 === 0 ? intIn(0, 14) : 0;
  const scheduledDepTotal = scheduledDepHours * 60 + scheduledDepMins;
  const actualDepTotal = scheduledDepTotal + actualDelay;
  const durationMins = intIn(90, 270);
  const scheduledArrTotal = scheduledDepTotal + durationMins;
  const estimatedArrTotal = actualDepTotal + durationMins - (next() % 3 === 0 ? 5 : 0);

  const toHM = (t) => [Math.floor(t / 60) % 24, t % 60];

  const scheduledDepStr = fmt(...toHM(scheduledDepTotal));
  const actualDepStr = fmt(...toHM(actualDepTotal));
  const scheduledArrStr = fmt(...toHM(scheduledArrTotal));
  const estimatedArrStr = fmt(...toHM(estimatedArrTotal));

  return {
    flightNumber,
    airline,
    depAirport,
    arrAirport,
    scheduledDep: scheduledDepStr,
    actualDep: actualDepStr,
    scheduledArr: scheduledArrStr,
    estimatedArr: estimatedArrStr,
    status: actualDelay > 10 ? 'באיחור קל' : 'בזמן',
    aircraftType: ac.type,
    registration,
    serialNumber,
    country: ac.country,
    gate: generateGate(flightNumber),
  };
}

// Calculate the progress of the flight based on simulated start time
export function getFlightProgressInfo(flight) {
  // We simulate a constant 60% progress, or we can make it dynamic based on time!
  // To make it look alive, we can save a "simulationStartTime" when the flight is loaded.
  // We will store the start time and simulate the flight taking about 5 minutes for a full trip, 
  // or use the current time of day to match the flight duration.
  // Let's do a time-of-day simulation: if it's currently between actualDep and estimatedArr, we show the actual percent.
  // Otherwise, we default to a realistic 55% progress so that the map looks interesting out of the box.
  
  const totalDist = calculateDistance(
    flight.depAirport.lat,
    flight.depAirport.lng,
    flight.arrAirport.lat,
    flight.arrAirport.lng
  );

  // Default to 58% completed
  const progressPercent = 0.58;
  const completedDist = Math.round(totalDist * progressPercent);
  const remainingDist = totalDist - completedDist;
  const remainingTimeStr = '01:23'; // realistic hours remaining

  const currentCoords = getIntermediatePoint(
    flight.depAirport.lat,
    flight.depAirport.lng,
    flight.arrAirport.lat,
    flight.arrAirport.lng,
    progressPercent
  );

  return {
    totalDistance: totalDist,
    completedDistance: completedDist,
    remainingDistance: remainingDist,
    remainingTime: remainingTimeStr,
    progressPercent,
    currentCoords,
  };
}
