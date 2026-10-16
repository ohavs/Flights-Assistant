// When to remind about a trip's flights — pure, so it is tested on its own
// (tests/flightAlerts.test.mjs) and scheduled by src/lib/native/notify.js.
//
// A flight is saved as a local date ('2026-06-15'), a local time ('07:30',
// '07:30 AM') and its departure airport's offset ('UTC +03:00'). Together
// they are one instant; the reminders are counted back from it:
//   24 h before — check-in is usually open
//   3 h before  — time to leave for the airport

const LEGS = [
  { key: 'outbound', field: 'outboundFlightDetails', name: 'טיסת ההלוך' },
  { key: 'return', field: 'returnFlightDetails', name: 'טיסת החזור' },
];

const ALERTS = [
  { key: 'checkin', hoursBefore: 24, title: (f) => `צ'ק־אין ל${f}`, body: (dep) => `ההמראה מחר ב־${dep}. הצ'ק־אין בדרך כלל כבר פתוח.` },
  { key: 'leave', hoursBefore: 3, title: (f) => `${f} בעוד 3 שעות`, body: (dep) => `ההמראה ב־${dep}. זה הזמן לצאת לשדה.` },
];

// "07:30" / "7:30 AM" / "12:05 pm" → [hours, minutes] (24h), or null.
export function parseClock(t) {
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const p = (m[3] || '').toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return [h, min];
}

// "UTC +03:00" → +180 (minutes). Unknown → null (the caller decides).
export function parseOffset(tz) {
  const m = String(tz || '').match(/UTC\s*([+-])\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

// The departure instant of one flight, or null when it is not fully known.
// The latest time wins: an updated departure moves the reminders with it.
export function departureAt(flight, fallbackOffset = 180) {
  if (!flight?.date) return null;
  const d = String(flight.date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const clock = parseClock(flight.actualDep) || parseClock(flight.scheduledDep);
  if (!d || !clock) return null;
  const offset = parseOffset(flight.depAirport?.timezone) ?? fallbackOffset;
  const utc = Date.UTC(+d[1], +d[2] - 1, +d[3], clock[0], clock[1]) - offset * 60000;
  return new Date(utc);
}

// The landing instant, or null: the arrival time (estimated, else
// scheduled) at the arrival airport's offset, on the departure's date, or
// the day after when that would be before takeoff (an overnight flight).
export function arrivalAt(flight, fallbackOffset = 180) {
  const dep = departureAt(flight, fallbackOffset);
  const d = String(flight?.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const clock = parseClock(flight?.estimatedArr) || parseClock(flight?.scheduledArr);
  if (!dep || !d || !clock) return null;
  const offset = parseOffset(flight.arrAirport?.timezone) ?? fallbackOffset;
  let utc = Date.UTC(+d[1], +d[2] - 1, +d[3], clock[0], clock[1]) - offset * 60000;
  while (utc <= dep.getTime()) utc += 86400000;
  return new Date(utc);
}

// A stable 31-bit id per (trip, leg, alert): scheduling again replaces the
// same notification instead of adding a second one.
export function alertId(tripId, leg, alert) {
  const s = `${tripId}|${leg}|${alert}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 1) || 1;
}

// Every reminder still ahead of `now` for these trips.
export function flightAlerts(trips, now = new Date()) {
  const out = [];
  for (const trip of trips || []) {
    for (const leg of LEGS) {
      const f = trip?.[leg.field];
      const dep = departureAt(f);
      if (!dep) continue;
      const clock = parseClock(f.actualDep) || parseClock(f.scheduledDep);
      const depText = `${String(clock[0]).padStart(2, '0')}:${String(clock[1]).padStart(2, '0')}`;
      const label = f.flightNumber ? `${leg.name} ${f.flightNumber}` : leg.name;
      for (const a of ALERTS) {
        const at = new Date(dep.getTime() - a.hoursBefore * 3600000);
        if (at <= now) continue;
        out.push({
          id: alertId(trip.id, leg.key, a.key),
          at,
          title: a.title(label),
          body: a.body(depText),
          extra: { kind: 'flight', tripId: trip.id, tab: 'flight' },
        });
      }
    }
  }
  return out.sort((x, y) => x.at - y.at);
}
