/* A place's opening hours (8.96.0, the owner's ask): the days and hours it
   is open every week, apart from its own dates and hours (`event`). On a
   day it is closed, or at a time out of its hours, it can't be added to
   the schedule: grey, with why.
   Pure: tests/openHours.test.mjs.

   Saved on the place as `openHours` (optional):
     { '0': [{ from: '09:00', to: '13:00' }, { from: '16:00', to: '20:00' }],
       '1': [...], ..., '6': [] }          '0' is Sunday, as in the calendar.
   - A day with no ranges is closed. Up to MAX_RANGES a day (a break).
   - `to` before `from` runs past midnight into the next day; the same time
     twice is open all day ("24 שעות").
   - None set, or no day open at all: no hours, nothing is checked.
   - A day with no date can't be checked (no weekday).
   - A clock time before 05:00 belongs to the night before (as in the
     schedule, dayPlan.js), so 01:00 on Friday's day is Saturday 01:00,
     inside Friday's 20:00–02:00. The day itself is open or closed by its
     own ranges.                                                         */
import { slotOf, rangeLength } from './dayPlan.js';
import { PART_SPAN, CLOSE_SOON, OPEN_JUST } from './eventFit.js';

export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const MAX_RANGES = 3;
export const ALL_DAY = '24 שעות';

const WEEK = 7 * 1440;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');
const fmt = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const mins = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : h === 24 && mm === 0 ? 0 : null;
};
const around = (n, of) => ((n % of) + of) % of;

// The week, tidied: 7 lists of { from, len, text } in order, or null when
// there are no hours.
export function weekOf(oh) {
  if (!oh || typeof oh !== 'object') return null;
  const days = Array.from({ length: 7 }, (_, d) => (Array.isArray(oh[d]) ? oh[d] : [])
    .map(r => {
      const a = mins(r?.from), b = mins(r?.to);
      if (a == null || b == null) return null;
      const len = a === b ? 1440 : around(b - a, 1440);
      return { from: a, len, text: len === 1440 ? ALL_DAY : `${fmt(a)}–${fmt(b)}` };
    })
    .filter(Boolean)
    .sort((x, y) => x.from - y.from));
  return days.some(d => d.length) ? days : null;
}

export const hasHours = (oh) => !!weekOf(oh);

// The weekday of 'YYYY-MM-DD' (0 is Sunday), or null.
export function weekdayOf(date) {
  if (!ISO.test(date || '')) return null;
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Every range as a stretch of the week: { at, len, day, r }.
const spansOf = (w) => w.flatMap((list, day) => list.map(r => ({ at: day * 1440 + r.from, len: r.len, day, r })));
// Where on the week a clock time of the day `d` is (before 05:00: the
// next morning).
const weekAt = (d, m) => around(d * 1440 + m + (m < 300 ? 1440 : 0), WEEK);
const spanAt = (w, t) => spansOf(w).find(s => around(t - s.at, WEEK) < s.len) || null;
// The stretches that meet [t, t+len).
const meeting = (w, t, len) => spansOf(w).filter(s => around(t - s.at, WEEK) < s.len || around(s.at - t, WEEK) < len);

// One day's hours as text: '09:00–13:00, 16:00–20:00', '24 שעות', 'סגור'.
export function dayText(oh, d) {
  const w = weekOf(oh);
  if (!w || d == null) return '';
  return w[d].length ? w[d].map(r => r.text).join(', ') : 'סגור';
}

// The week in lines, days in a row with the same hours together:
// [{ days: 'א׳–ה׳', text: '09:00–17:00', from: 0, to: 4 }, …].
export function weekLines(oh) {
  const w = weekOf(oh);
  if (!w) return [];
  const out = [];
  for (let d = 0; d < 7; d++) {
    const text = dayText(oh, d);
    const last = out[out.length - 1];
    if (last && last.text === text) last.to = d;
    else out.push({ from: d, to: d, text });
  }
  return out.map(({ from, to, text }) => ({
    from, to,
    days: from === to ? DAY_SHORT[from] : to === from + 1 ? `${DAY_SHORT[from]}, ${DAY_SHORT[to]}` : `${DAY_SHORT[from]}–${DAY_SHORT[to]}`,
    text,
  }));
}
export const weekText = (oh) => weekLines(oh).map(l => `${l.days} ${l.text}`).join(' · ');

// Open on that date at all (its own ranges). No hours or no date: yes.
export function openOnDay(oh, date) {
  const w = weekOf(oh), d = weekdayOf(date);
  return !w || d == null || w[d].length > 0;
}

// Open at a clock time (minutes) of that date's day.
export function openAt(oh, date, m) {
  const w = weekOf(oh), d = weekdayOf(date);
  return !w || d == null || m == null || !!spanAt(w, weekAt(d, m));
}

// A part of the day meets the hours at all.
export function partOpen(oh, date, part) {
  const w = weekOf(oh), d = weekdayOf(date);
  if (!w || d == null || !PART_SPAN[part]) return true;
  const [from, len] = PART_SPAN[part];
  return meeting(w, d * 1440 + from, len).length > 0;
}

// Why not on that date at that time: '' when it can be. With no time,
// only whether it is open that day.
export function hoursWhyNot(oh, date, timeLabel) {
  const w = weekOf(oh), d = weekdayOf(date);
  if (!w || d == null) return '';
  if (!w[d].length) return `סגור ביום ${DAY_NAMES[d]}`;
  const slot = slotOf(timeLabel);
  if (slot.custom) return '';
  const out = slot.minutes != null ? !openAt(oh, date, slot.minutes) : slot.parts.some(p => !partOpen(oh, date, p));
  return out ? `פתוח רק ${dayText(oh, d)}` : '';
}

// The range a clock time is in, with how long since it opened and how long
// until it closes, or null.
function rangeAt(w, d, m) {
  const s = spanAt(w, weekAt(d, m));
  if (!s) return null;
  const since = around(weekAt(d, m) - s.at, WEEK);
  return { s, since, left: s.len - since, opens: fmt(s.r.from), closes: fmt((s.r.from + s.len) % 1440) };
}

// A range of clock times that starts in the hours and ends after they
// close: what to say ("נסגר ב־18:00"), or ''.
export function hoursEndsLate(oh, date, timeLabel) {
  const w = weekOf(oh), d = weekdayOf(date);
  const slot = slotOf(timeLabel);
  if (!w || d == null || slot.minutes == null || slot.end == null) return '';
  const at = rangeAt(w, d, slot.minutes);
  if (!at || at.s.len >= 1440) return '';
  return rangeLength(slot.minutes, slot.end) > at.left ? `נסגר ב־${at.closes}` : '';
}

/* What an activity of the place says about its hours that day:
   { tone: 'info' | 'warn' | 'bad', text, full } or null.
   - bad: closed that day ("סגור ביום שני"), or out of its hours.
   - warn: CLOSE_SOON before the closing, OPEN_JUST after the opening, a
     range that ends after the closing, a part of the day that starts
     before the opening or ends after the closing.
   - info: the day's hours.
   A day with no date: the week, in `full` only.                       */
export function hoursNote(oh, date, timeLabel) {
  const w = weekOf(oh);
  if (!w) return null;
  const d = weekdayOf(date);
  if (d == null) return { tone: 'info', text: '', full: `שעות פעילות: ${weekText(oh)}` };
  const today = dayText(oh, d);
  const full = `שעות פעילות ביום ${DAY_NAMES[d]}: ${today}`;
  const why = hoursWhyNot(oh, date, timeLabel);
  if (why) return { tone: 'bad', text: w[d].length ? `מחוץ לשעות ${today}` : why, full };

  const slot = slotOf(timeLabel);
  let warn = hoursEndsLate(oh, date, timeLabel);
  if (!warn && !slot.custom) {
    if (slot.minutes != null) {
      const at = rangeAt(w, d, slot.minutes);
      if (at && at.s.len < 1440) {
        if (at.left <= CLOSE_SOON) warn = `נסגר ב־${at.closes}`;
        else if (at.since < OPEN_JUST) warn = `נפתח ב־${at.opens}`;
      }
    } else if (slot.parts.length) {
      const first = PART_SPAN[slot.parts[0]];
      const last = PART_SPAN[slot.parts[slot.parts.length - 1]];
      const startAt = d * 1440 + first[0];
      const endAt = d * 1440 + last[0] + last[1] - 1;
      // The ranges it meets, by when they open relative to its start.
      const off = (s) => { const o = around(s.at - startAt, WEEK); return o > WEEK / 2 ? o - WEEK : o; };
      const all = meeting(w, startAt, endAt - startAt + 1).sort((a, b) => off(a) - off(b));
      const early = !spanAt(w, startAt);
      const late = !spanAt(w, endAt);
      if (all.length && early && late) warn = `רק ${today}`;
      else if (all.length && early) warn = `נפתח ב־${fmt(all[0].r.from)}`;
      else if (all.length && late) { const s = all[all.length - 1]; warn = `נסגר ב־${fmt((s.r.from + s.len) % 1440)}`; }
    }
  }
  if (warn) return { tone: 'warn', text: warn, full };
  return { tone: 'info', text: today, full };
}

/* ── From Google (Places API, `regularOpeningHours.periods`) ──────────
   Each period: { open: { day, hour, minute }, close?: { day, hour, minute } },
   day 0 is Sunday. One period with no close: open all the time. A period
   that closes on another day runs past midnight, kept on its opening day.
   What comes back is the shape saved on the place, or null.            */
export function fromGoogle(periods) {
  if (!Array.isArray(periods) || !periods.length) return null;
  const out = Object.fromEntries(Array.from({ length: 7 }, (_, d) => [String(d), []]));
  const hm = (p) => `${pad(Number(p?.hour) || 0)}:${pad(Number(p?.minute) || 0)}`;
  for (const p of periods) {
    const day = Number(p?.open?.day);
    if (!(day >= 0 && day <= 6)) continue;
    if (!p.close) {
      // Open all the time.
      for (let d = 0; d < 7; d++) out[String(d)] = [{ from: '00:00', to: '00:00' }];
      return out;
    }
    const from = hm(p.open), to = hm(p.close);
    // A whole day, midnight to midnight.
    const whole = from === '00:00' && to === '00:00' && Number(p.close.day) === (day + 1) % 7;
    const list = out[String(day)];
    if (list.length < MAX_RANGES) list.push(whole ? { from: '00:00', to: '00:00' } : { from, to });
  }
  return weekOf(out) ? out : null;
}

// The hours as saved: only valid ranges, every day there (closed: []).
// Null when nothing is open.
export function tidyHours(oh) {
  if (!weekOf(oh)) return null;
  return Object.fromEntries(Array.from({ length: 7 }, (_, d) => [String(d),
    (Array.isArray(oh[d]) ? oh[d] : [])
      .filter(r => mins(r?.from) != null && mins(r?.to) != null)
      .slice(0, MAX_RANGES)
      .map(r => ({ from: fmt(mins(r.from)), to: fmt(mins(r.to)) }))]));
}
