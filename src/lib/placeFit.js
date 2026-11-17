/* Can a place be in the schedule on this day at this time? Its own dates
   and hours (`event`, eventFit.js, 8.93.0) and its weekly opening hours
   (`openHours`, openHours.js, 8.96.0), as one answer. Every screen asks
   here, with the place itself. Pure: tests/openHours.test.mjs.        */
import { eventSpan, eventNote, endsLate, hoursText, onDate, partFits, timeFits, whyNot, stayingIds as eventStaying } from './eventFit.js';
import { hoursNote, hoursEndsLate, hoursWhyNot, openAt, openOnDay, partOpen, dayText, weekdayOf, weekOf } from './openHours.js';

// Why the whole day can't be: '' when it can.
export const offDay = (p, date) => whyNot(p?.event, date, '') || hoursWhyNot(p?.openHours, date, '');

// Why this date and time can't be: '' when they can.
export const fitWhyNot = (p, date, timeLabel) => whyNot(p?.event, date, timeLabel) || hoursWhyNot(p?.openHours, date, timeLabel);

// Whether clock times are checked at all on that date (a time wheel greys
// what is out).
export const clockChecked = (p, date) => eventSpan(p?.event)?.close != null
  || (!!weekOf(p?.openHours) && weekdayOf(date) != null);

// A clock time (minutes) out of the hours: 'פתוח רק …', else ''.
export function timeWhy(p, date, m) {
  if (!timeFits(p?.event, m)) return `פתוח רק ${hoursText(eventSpan(p.event))}`;
  if (!openAt(p?.openHours, date, m)) return `פתוח רק ${dayText(p.openHours, weekdayOf(date))}`;
  return '';
}

// A part of the day out of the hours: 'פתוח רק …', else ''.
export function partWhy(p, date, part) {
  if (!partFits(p?.event, part)) return `פתוח רק ${hoursText(eventSpan(p.event))}`;
  if (!openOnDay(p?.openHours, date)) return hoursWhyNot(p.openHours, date, '');
  if (!partOpen(p?.openHours, date, part)) return `פתוח רק ${dayText(p.openHours, weekdayOf(date))}`;
  return '';
}

// A range that ends after the closing: what to say, or ''.
export const fitEndsLate = (p, date, timeLabel) => endsLate(p?.event, timeLabel) || hoursEndsLate(p?.openHours, date, timeLabel);

// On its dates, and open that day.
export const fitsDay = (p, date) => onDate(p?.event, date) && openOnDay(p?.openHours, date);

/* What an activity of the place says: { tone, text, full, quiet } or null.
   The worse of the two notes leads (bad, then warn); `full` holds both.
   Only the opening hours, with nothing wrong: `quiet` (the schedule's
   card shows no tag for it; the details and the exports do).          */
const RANK = { bad: 2, warn: 1, info: 0 };
export function placeNote(p, date, timeLabel) {
  const e = eventNote(p?.event, date, timeLabel);
  const h = hoursNote(p?.openHours, date, timeLabel);
  if (!e && !h) return null;
  const full = [e?.full, h?.full].filter(Boolean).join(' · ');
  const lead = !h || (e && RANK[e.tone] >= RANK[h.tone]) ? e : h;
  const quiet = lead === h && h.tone === 'info';
  return { tone: lead.tone, text: lead.text, full, ...(quiet ? { quiet: true } : {}) };
}

// A day swap: what stays on its own date. A place with dates not on the
// other day's date, or closed on its weekday (the owner's decision for
// dates, 8.93.0; the same for a closed day).
export function stayingIds(acts, placeById, to) {
  const out = eventStaying(acts, placeById, to);
  (acts || []).forEach(a => {
    if (a?.placeId && !openOnDay(placeById.get(a.placeId)?.openHours, to)) out.add(a.id);
  });
  return out;
}
