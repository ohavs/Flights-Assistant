// When a reminder rings (8.92.0): the quick choices in its "מתי להזכיר?"
// sheet and how a time reads on its row. Pure, for the tests
// (tests/reminderWhen.test.mjs). A time is 'YYYY-MM-DDTHH:mm' in the
// phone's own time, as `remindAt` keeps it (reminderAlerts.js).

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localIso = (d) => `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const WEEKDAY = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

// Four quick times: in an hour (on the next five minutes), tonight at
// eight while there is still time for it, tomorrow morning and evening,
// and the morning after when tonight is gone.
export function whenPresets(now = new Date()) {
  const inHour = new Date(now.getTime() + 60 * 60000);
  inHour.setSeconds(0, 0);
  inHour.setMinutes(Math.ceil(inHour.getMinutes() / 5) * 5);
  const at = (days, h) => localIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, 0));
  const out = [{ key: 'hour', label: 'בעוד שעה', at: localIso(inHour) }];
  if (now.getHours() < 19) out.push({ key: 'tonight', label: 'הערב', at: at(0, 20) });
  out.push({ key: 'morning', label: 'מחר בבוקר', at: at(1, 9) });
  out.push({ key: 'evening', label: 'מחר בערב', at: at(1, 20) });
  if (out.length < 4) out.push({ key: 'after', label: 'מחרתיים בבוקר', at: at(2, 9) });
  return out;
}

// "היום · 09:00", "מחר · 18:30", "ה׳ 24.10 · 08:00" (another year: "24.10.27").
export function shortWhen(at, now = new Date()) {
  const [d, t = ''] = String(at || '').split('T');
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  let day;
  if (d === isoDay(now)) day = 'היום';
  else if (d === isoDay(tomorrow)) day = 'מחר';
  else {
    const date = new Date(+m[1], +m[2] - 1, +m[3]);
    const year = +m[1] === now.getFullYear() ? '' : `.${m[1].slice(2)}`;
    day = `${WEEKDAY[date.getDay()]} ${+m[3]}.${+m[2]}${year}`;
  }
  return t ? `${day} · ${t.slice(0, 5)}` : day;
}

// Already past (its notification will not come).
export function whenPast(at, now = new Date()) {
  const m = String(at || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return false;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) <= now;
}
