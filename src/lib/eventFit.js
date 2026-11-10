/* Does a time in the schedule fall inside a place's own dates and hours
   (`event`: startDate, startTime, endDate, endTime)? The owner's ask
   (8.93.0): what is outside can't be picked, and an activity of such a
   place says its hours, and warns when it is close to opening or closing.
   Pure: tests/eventFit.test.mjs.

   - Dates: from startDate to endDate (or that one day). A day with no date
     is not checked.
   - Hours: only with both a start and an end time (the owner's decision:
     a start alone, a show at 20:00, holds only its date). A range of days
     with hours is open every day in those hours (8.70.1); an end earlier
     than the start runs past midnight.
   - A clock time is in if it is within the hours; a part of the day if it
     meets them at all. Free text is never checked.
   - Warnings: a clock time less than CLOSE_SOON minutes before closing,
     or less than OPEN_JUST after opening (or up to 3 hours before a start
     with no end);
     a part of the day that starts before the opening or ends after the
     closing.                                                            */
import { slotOf } from './dayPlan.js';

export const CLOSE_SOON = 60;
export const OPEN_JUST = 30;
const EARLY = 180;

// The parts of the day as minutes on the clock: [from, length).
const PART_SPAN = { 'בוקר': [300, 420], 'צהריים': [720, 300], 'ערב': [1020, 240], 'לילה': [1260, 480] };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const mins = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const around = (n) => ((n % 1440) + 1440) % 1440;
export const dm = (iso) => { const [, m, d] = iso.split('-'); return `${d}.${m}`; };

// The place's dates and hours, or null when it has none.
export function eventSpan(ev) {
  if (!ISO.test(ev?.startDate || '')) return null;
  const first = ev.startDate;
  const last = ISO.test(ev.endDate || '') && ev.endDate > first ? ev.endDate : first;
  const open = mins(ev.startTime);
  const end = open != null ? mins(ev.endTime) : null;
  const hours = open != null && end != null && end !== open;
  return {
    first, last, multi: last !== first,
    open, close: hours ? end : null,
    // Minutes from the opening to the closing (past midnight too).
    length: hours ? around(end - open) : null,
    startTime: open != null ? ev.startTime.trim() : '',
    endTime: hours ? ev.endTime.trim() : '',
  };
}

export const datesText = (s) => (s.multi ? `${dm(s.first)}–${dm(s.last)}` : dm(s.first));
export const hoursText = (s) => (s.close != null ? `${s.startTime}–${s.endTime}` : s.open != null ? `מ־${s.startTime}` : '');

// On this date? A day with no date, or a place with no dates: yes.
export function onDate(ev, date) {
  const s = eventSpan(ev);
  return !s || !ISO.test(date || '') || (date >= s.first && date <= s.last);
}

const inHours = (s, m) => s.close == null || around(m - s.open) < s.length;
// Two stretches on the clock meet when either starts inside the other.
const meets = (s, [from, len]) => s.close == null
  || around(from - s.open) < s.length || around(s.open - from) < len;

export const timeFits = (ev, m) => { const s = eventSpan(ev); return !s || m == null || inHours(s, m); };
export const partFits = (ev, part) => { const s = eventSpan(ev); return !s || !PART_SPAN[part] || meets(s, PART_SPAN[part]); };

// Why this date and time can't be: '' when they can.
export function whyNot(ev, date, timeLabel) {
  const s = eventSpan(ev);
  if (!s) return '';
  if (!onDate(ev, date)) return `רק ב־${datesText(s)}`;
  const slot = slotOf(timeLabel);
  if (s.close == null || slot.custom) return '';
  const out = slot.minutes != null ? !inHours(s, slot.minutes) : slot.parts.some(p => !partFits(ev, p));
  return out ? `רק בשעות ${hoursText(s)}` : '';
}

/* What an activity of the place shows, in a few words:
   { tone: 'info' | 'warn' | 'bad', text, full } or null.
   - bad: not on its dates, or outside its hours (a day swap can't do it,
     but a changed date or changed hours can).
   - warn: close to the closing or the opening ("נסגר ב־20:00").
   - info: its hours, and for days in a row until when ("10:00–20:00 · עד
     24.12", "יום אחרון"). One day with no hours: "רק ביום הזה". */
export function eventNote(ev, date, timeLabel) {
  const s = eventSpan(ev);
  if (!s) return null;
  const dated = ISO.test(date || '');
  const hours = hoursText(s);
  const full = [s.close != null && s.multi ? `כל יום ${hours}` : hours, datesText(s)].filter(Boolean).join(' · ');
  const why = whyNot(ev, date, timeLabel);
  if (why) return { tone: 'bad', text: dated && !onDate(ev, date) ? why : `מחוץ לשעות ${hours}`, full };

  const days = !dated ? datesText(s)
    : s.multi ? (date === s.last ? 'יום אחרון' : `עד ${dm(s.last)}`)
      : hours ? '' : 'רק ביום הזה';
  const slot = slotOf(timeLabel);
  // Every day in its hours opens and closes; one day starts and ends.
  const opens = `${s.multi ? 'נפתח' : 'מתחיל'} ב־${s.startTime}`;
  const closes = `${s.multi ? 'נסגר' : 'מסתיים'} ב־${s.endTime}`;
  let warn = '';
  if (s.open != null && !slot.custom) {
    if (slot.minutes != null) {
      const since = around(slot.minutes - s.open);
      if (s.close != null && s.length - since <= CLOSE_SOON) warn = closes;
      // With no end: a few hours before the start counts as before it.
      else if (since < OPEN_JUST || (s.close == null && since >= 1440 - EARLY)) warn = opens;
    } else if (slot.parts.length && s.close != null) {
      const spans = slot.parts.map(p => PART_SPAN[p]);
      const [from] = spans[0];
      const [lastFrom, lastLen] = spans[spans.length - 1];
      const early = around(from - s.open) >= s.length;              // starts before the opening
      const late = around(lastFrom + lastLen - 1 - s.open) >= s.length; // ends after the closing
      warn = early && late ? `רק ${hours}` : early ? opens : late ? closes : '';
    }
  }
  if (warn) return { tone: 'warn', text: [warn, days].filter(Boolean).join(' · '), full };
  const text = [hours, days].filter(Boolean).join(' · ');
  return text ? { tone: 'info', text, full } : null;
}

// A day swap: the activities of a place with dates that the other day's
// date is not among stay on their own date, like a booked one (the owner's
// decision). `placeById`: Map of the places. A day with no date: none stay.
export function stayingIds(acts, placeById, to) {
  if (!ISO.test(to || '')) return new Set();
  return new Set((acts || [])
    .filter(a => a?.placeId && !onDate(placeById.get(a.placeId)?.event, to))
    .map(a => a.id));
}
