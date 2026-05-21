// Flight status simulator and coordinate generator
const airportDatabase = {
  NUE: { code: 'NUE', city: 'נירנברג', name: 'Nuremberg Airport', lat: 49.4987, lng: 11.0780, timezone: 'UTC +02:00' },
  GRO: { code: 'GRO', city: 'ז\'ירונה', name: 'Girona-Costa Brava Airport', lat: 41.9010, lng: 2.7606, timezone: 'UTC +02:00' },
  TLV: { code: 'TLV', city: 'תל אביב', name: 'נמל התעופה בן גוריון', lat: 32.0055, lng: 34.8854, timezone: 'UTC +03:00' },
  FCO: { code: 'FCO', city: 'רומא', name: 'Leonardo da Vinci-Fiumicino Airport', lat: 41.7999, lng: 12.2462, timezone: 'UTC +02:00' },
  FRA: { code: 'FRA', city: 'פרנקפורט', name: 'Frankfurt Airport', lat: 50.0379, lng: 8.5622, timezone: 'UTC +02:00' },
  LTN: { code: 'LTN', city: 'לונדון לוטון', name: 'London Luton Airport', lat: 51.8763, lng: -0.3717, timezone: 'UTC +01:00' },
  CDG: { code: 'CDG', city: 'פריז', name: 'Charles de Gaulle Airport', lat: 49.0097, lng: 2.5479, timezone: 'UTC +02:00' },
  JFK: { code: 'JFK', city: 'ניו יורק', name: 'John F. Kennedy International Airport', lat: 40.6413, lng: -73.7781, timezone: 'UTC -04:00' },
  ATH: { code: 'ATH', city: 'אתונה', name: 'Athens International Airport', lat: 37.9356, lng: 23.9484, timezone: 'UTC +03:00' },
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

// Main lookup function
export function lookupFlight(flightNumInput) {
  const flightNumber = flightNumInput.trim().toUpperCase();
  
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

  // If not found, generate dynamically
  // Find airline
  let airline = 'חברת תעופה גלובלית';
  for (const item of airlinePrefixes) {
    if (flightNumber.startsWith(item.prefix)) {
      airline = item.name;
      break;
    }
  }

  // Select departure and arrival
  const keys = Object.keys(airportDatabase);
  let depKey = 'TLV';
  let arrKey = 'CDG';

  // Make sure dep != arr
  if (flightNumber.charCodeAt(0) % 2 === 0) {
    depKey = keys[flightNumber.charCodeAt(0) % keys.length];
    arrKey = keys[(flightNumber.charCodeAt(1) || 0) % keys.length];
  } else {
    depKey = keys[(flightNumber.charCodeAt(1) || 0) % keys.length];
    arrKey = keys[flightNumber.charCodeAt(0) % keys.length];
  }

  if (depKey === arrKey) {
    arrKey = keys[(keys.indexOf(depKey) + 1) % keys.length];
  }

  const depAirport = airportDatabase[depKey];
  const arrAirport = airportDatabase[arrKey];

  // Select aircraft
  const acIdx = (flightNumber.charCodeAt(flightNumber.length - 1) || 0) % aircraftTypes.length;
  const ac = aircraftTypes[acIdx];
  const randNum = Math.floor(100 + Math.random() * 900);
  const registration = `${ac.regPrefix}${String.fromCharCode(65 + (randNum % 26))}${String.fromCharCode(65 + ((randNum + 3) % 26))}`;
  const serialNumber = String(10000 + Math.floor(Math.random() * 40000));

  // Generate times
  const scheduledDepHours = 6 + Math.floor(Math.random() * 14);
  const scheduledDepMins = Math.floor(Math.random() * 4) * 15;
  const scheduledDepStr = `${String(scheduledDepHours % 12 || 12).padStart(2, '0')}:${String(scheduledDepMins).padStart(2, '0')} ${scheduledDepHours >= 12 ? 'PM' : 'AM'}`;

  const actualDelay = Math.random() > 0.5 ? Math.floor(Math.random() * 15) : 0;
  const actualDepMinsTotal = scheduledDepHours * 60 + scheduledDepMins + actualDelay;
  const actualDepHours = Math.floor(actualDepMinsTotal / 60);
  const actualDepMins = actualDepMinsTotal % 60;
  const actualDepStr = `${String(actualDepHours % 12 || 12).padStart(2, '0')}:${String(actualDepMins).padStart(2, '0')} ${actualDepHours >= 12 ? 'PM' : 'AM'}`;

  const durationMins = 90 + Math.floor(Math.random() * 180);
  const scheduledArrMinsTotal = scheduledDepHours * 60 + scheduledDepMins + durationMins;
  const scheduledArrHours = Math.floor(scheduledArrMinsTotal / 60);
  const scheduledArrMins = scheduledArrMinsTotal % 60;
  const scheduledArrStr = `${String(scheduledArrHours % 12 || 12).padStart(2, '0')}:${String(scheduledArrMins).padStart(2, '0')} ${scheduledArrHours >= 12 ? 'PM' : 'AM'}`;

  const estimatedArrMinsTotal = actualDepMinsTotal + durationMins - (Math.random() > 0.6 ? 5 : 0);
  const estimatedArrHours = Math.floor(estimatedArrMinsTotal / 60);
  const estimatedArrMins = estimatedArrMinsTotal % 60;
  const estimatedArrStr = `${String(estimatedArrHours % 12 || 12).padStart(2, '0')}:${String(estimatedArrMins).padStart(2, '0')} ${estimatedArrHours >= 12 ? 'PM' : 'AM'}`;

  const gate = generateGate(flightNumber);

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
    gate,
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
