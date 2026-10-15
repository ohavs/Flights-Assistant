// When to notify about a trip's reminders — pure, tested on its own
// (tests/reminderAlerts.test.mjs), scheduled by src/lib/native/notify.js.
//
// A reminder may carry `remindAt`, a local date-time ('2026-11-03T09:00')
// in the phone's own time: "remind me at nine" means nine where I am.
// Only its owner is notified (a reminder with no owner is everyone's), and
// never once it is done.
import { alertId } from './flightAlerts.js';

export function parseLocal(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isNaN(d.getTime()) ? null : d;
}

// trips: [{ id, name }], byTrip: { [tripId]: [reminder] }
export function reminderAlerts(trips, byTrip, uid, now = new Date()) {
  const out = [];
  for (const trip of trips || []) {
    for (const r of byTrip?.[trip.id] || []) {
      if (r.completed || !r.text) continue;
      if (r.addedByUid && r.addedByUid !== uid) continue;
      const at = parseLocal(r.remindAt);
      if (!at || at <= now) continue;
      out.push({
        id: alertId(trip.id, 'reminder', r.id),
        at,
        title: trip.name ? `תזכורת · ${trip.name}` : 'תזכורת',
        body: r.text,
        extra: { kind: 'reminder', tripId: trip.id, tab: 'checklist' },
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
