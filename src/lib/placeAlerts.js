// An alert for a place with a date: one per place, at a day and time the
// user picks (a preset, or any). Kept on the phone (they are the phone's
// own notifications; src/lib/native/placeAlarms.js) and scheduled by
// src/lib/native/notify.js as kind 'place'. Pure
// (tests/placeAlerts.test.mjs).
//
// Times are local, 'YYYY-MM-DDTHH:MM' in the phone's own time, like a
// reminder's remindAt.
import { alertId, parseClock } from './flightAlerts.js';
import { parseLocal } from './reminderAlerts.js';

const pad = (n) => String(n).padStart(2, '0');
const DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export const toLocal = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// "ה׳ 13.11 · 10:00"
export function formatAlert(at) {
  const d = parseLocal(at);
  if (!d) return '';
  return `${DOW[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The ready choices for a place's date (`event`), those still ahead:
// with a time, an hour and three before it; the morning of the day (when
// before the time); the evening before.
export function alertPresets(event, now = new Date()) {
  const m = String(event?.startDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return [];
  const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
  const clock = parseClock(event.startTime);
  const out = [];
  if (clock) {
    const start = new Date(y, mo, d, clock[0], clock[1]);
    out.push({ key: 'h1', label: 'שעה לפני', at: new Date(start.getTime() - 60 * 60000) });
    out.push({ key: 'h3', label: '3 שעות לפני', at: new Date(start.getTime() - 180 * 60000) });
  }
  const morning = new Date(y, mo, d, 8, 0);
  if (!clock || morning.getTime() < new Date(y, mo, d, clock[0], clock[1]).getTime() - 60 * 60000) {
    out.push({ key: 'morning', label: 'בבוקר של היום', at: morning });
  }
  out.push({ key: 'eve', label: 'ערב לפני', at: new Date(y, mo, d - 1, 20, 0) });
  const seen = new Set();
  return out
    .filter(p => p.at > now)
    .map(p => ({ ...p, at: toLocal(p.at) }))
    .filter(p => !seen.has(p.at) && seen.add(p.at));
}

// The default for a new alert: the first preset, else the day itself at 08:00.
export function defaultAlert(event, now = new Date()) {
  const presets = alertPresets(event, now);
  if (presets.length) return presets[0].at;
  const m = String(event?.startDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T08:00` : null;
}

// store: { [tripId/placeId]: { tripId, placeId, at, title, when, tripName } }
// → the notifications still ahead.
export function placeAlerts(store, now = new Date()) {
  const out = [];
  for (const a of Object.values(store || {})) {
    const at = parseLocal(a?.at);
    if (!at || at <= now || !a.tripId || !a.placeId) continue;
    out.push({
      id: alertId(a.tripId, 'place', a.placeId),
      at,
      title: a.title || 'מקום בתוכנית',
      body: [a.when, a.tripName].filter(Boolean).join(' · '),
      extra: { kind: 'place', tripId: a.tripId, tab: 'planning', placeId: a.placeId },
    });
  }
  return out.sort((a, b) => a.at - b.at);
}
