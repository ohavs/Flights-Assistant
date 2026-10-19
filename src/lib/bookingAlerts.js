// When to notify about a trip's bookings — pure, tested on its own
// (tests/bookingAlerts.test.mjs), scheduled by src/lib/native/notify.js.
//
// A booking is saved with a local date ('2026-11-03') and maybe a time
// ('20:00'). It is notified at a time the phone's owner picks (08:00 by
// default, in the phone's own time) on the booking's day, or the day
// before when they chose so. A booking at or before that time (a 07:00
// tour) is notified the day before, so the notice never comes after it.
// Every member of the trip is notified; never of a cancelled booking.
import { alertId, parseClock } from './flightAlerts.js';

export const BOOKING_TIME = '08:00';
export const BOOKING_DAYS = [
  { value: 'same', label: 'ביום ההזמנה' },
  { value: 'before', label: 'יום לפני' },
];

const pad = (n) => String(n).padStart(2, '0');

function bodyOf(b, trip) {
  const clock = parseClock(b.time);
  const people = b.people > 1 ? `${b.people} אנשים` : b.people === 1 ? 'אדם אחד' : '';
  return [
    clock && `ב־${pad(clock[0])}:${pad(clock[1])}`,
    people,
    b.bookedUnder && `על שם ${b.bookedUnder}`,
    b.confirmation && `אישור ${b.confirmation}`,
    b.status === 'pending' && 'ממתינה לאישור',
    trip.name,
  ].filter(Boolean).join(' · ');
}

// trips: [{ id, name }], byTrip: { [tripId]: [booking] },
// day: 'same' | 'before'
export function bookingAlerts(trips, byTrip, time = BOOKING_TIME, day = 'same', now = new Date()) {
  const [hh, mm] = parseClock(time) || parseClock(BOOKING_TIME);
  const out = [];
  for (const trip of trips || []) {
    for (const b of byTrip?.[trip.id] || []) {
      if (b.status === 'cancelled' || !b.title) continue;
      const d = String(b.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!d) continue;
      const clock = parseClock(b.time);
      const early = clock && clock[0] * 60 + clock[1] <= hh * 60 + mm;
      const before = day === 'before' || early;
      const at = new Date(+d[1], +d[2] - 1, +d[3] - (before ? 1 : 0), hh, mm);
      if (at <= now) continue;
      out.push({
        id: alertId(trip.id, 'booking', b.id),
        at,
        title: `${before ? 'הזמנה למחר' : 'הזמנה להיום'}: ${b.title}`,
        body: bodyOf(b, trip),
        extra: { kind: 'booking', tripId: trip.id, tab: 'bookings' },
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
