// What a change in a trip means to its other members, in words (N5). The
// triggers in index.js read the documents and send; everything here is
// pure, so tests/push.test.mjs runs it in plain node.

// Several things from one person, close together, are one notification
// that counts up ("3 הוצאות חדשות"), not one each.
export const DIGEST_MS = 30 * 60 * 1000;
const DIGEST_ITEMS = 4;

const SYMBOL = { ILS: '₪', EUR: '€', USD: '$', GBP: '£' };

export function money(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const v = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const s = SYMBOL[currency];
  return s ? `${v} ${s}` : `${v} ${currency || ''}`.trim();
}

// '2026-11-03' → '3.11'; '2026-11-03T15:00' → '3.11 15:00'.
export function when(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!m) return String(s || '');
  return `${+m[3]}.${+m[2]}${m[4] ? ` ${m[4]}` : ''}`;
}

export function expenseLabel(e) {
  const what = String(e?.description || '').trim() || String(e?.category || '').trim() || 'הוצאה';
  const amount = money(e?.amount, e?.currency);
  return amount ? `${amount} · ${what}` : what;
}

// The uids of the trip's members, less those in `except`.
export function membersOf(trip, except = []) {
  const all = new Set([...(trip?.memberIds || []), ...Object.keys(trip?.members || {})]);
  for (const uid of except) all.delete(uid);
  return [...all].filter(Boolean);
}

export function addedMembers(before, after) {
  const was = new Set(Object.keys(before?.members || {}));
  return Object.keys(after?.members || {}).filter(uid => !was.has(uid));
}

// Activities on a day that were not there before (by id: a move or an
// edit keeps its id, see src/lib/dayActivities.js).
export function newActivities(before, after) {
  const was = new Set((before?.activities || []).map(a => a?.id).filter(Boolean));
  const seen = new Set();
  return (after?.activities || []).filter(a => {
    if (!a?.id || was.has(a.id) || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

// What changed in the flights and the hotel that a member would want to
// know: [{ which: 'outbound' | 'return' | 'hotel', parts: ['שער B12', …] }].
// Not what a refresh only stamps (lastRefreshed) or the airports' details.
const FLIGHT = [
  ['flightNumber', v => `טיסה ${v}`],
  ['date', v => `תאריך ${when(v)}`],
  ['scheduledDep', v => `המראה ${v}`],
  ['actualDep', v => `המראה בפועל ${v}`],
  ['scheduledArr', v => `נחיתה ${v}`],
  ['estimatedArr', v => `נחיתה צפויה ${v}`],
  ['gate', v => `שער ${v}`],
  ['status', v => v],
];
const HOTEL = [
  ['name', v => v],
  ['address', v => v],
  ['checkIn', v => `צ׳ק־אין ${when(v)}`],
  ['checkOut', v => `צ׳ק־אאוט ${when(v)}`],
];

function changed(before, after, fields) {
  const parts = [];
  for (const [key, say] of fields) {
    const a = String(before?.[key] ?? '').trim();
    const b = String(after?.[key] ?? '').trim();
    if (a !== b && b) parts.push(say(b));
  }
  return parts;
}

export function travelChanges(before, after) {
  const out = [];
  const add = (which, parts) => { if (parts.length) out.push({ which, parts }); };
  add('outbound', changed(before?.outboundFlightDetails, after?.outboundFlightDetails, FLIGHT));
  add('return', changed(before?.returnFlightDetails, after?.returnFlightDetails, FLIGHT));
  add('hotel', changed(before?.hotelDetails, after?.hotelDetails, HOTEL));
  return out;
}

// The running count for one person's additions of one kind to one trip.
// A gap of DIGEST_MS starts a new one.
export function digest(prev, label, now) {
  const fresh = !prev || !(now - (prev.lastAt || 0) < DIGEST_MS);
  const items = fresh ? [] : (prev.items || []);
  return {
    count: (fresh ? 0 : prev.count || 0) + 1,
    items: [...items, label].slice(-DIGEST_ITEMS),
    lastAt: now,
  };
}

const list = (items, count) => {
  const shown = items.join(', ');
  return count > items.length ? `${shown} ועוד` : shown;
};

// The notification for an event: { title, body }.
//   expense: { label }            plan: { label, activity }
//   travel:  { which, parts }     joined: { name }   added: {}
export function text(kind, { trip, actor, digest: d, ...e }) {
  const name = String(trip?.name || 'הטיול').trim();
  const by = String(actor || '').trim();
  const from = (s) => (by ? `${by} · ${s}` : s);
  switch (kind) {
    case 'expense':
      return d.count > 1
        ? { title: `${name}: ${d.count} הוצאות חדשות`, body: from(list(d.items, d.count)) }
        : { title: `${name}: הוצאה חדשה`, body: from(d.items[d.items.length - 1]) };
    case 'plan':
      return d.count > 1
        ? { title: `${name}: ${d.count} חדשים בתכנון`, body: from(list(d.items, d.count)) }
        : { title: `${name}: ${e.activity ? 'פעילות חדשה' : 'מקום חדש'}`, body: from(d.items[d.items.length - 1]) };
    case 'travel': {
      const what = { outbound: 'שינוי בטיסת הלוך', return: 'שינוי בטיסת החזור', hotel: 'שינוי במלון' }[e.which];
      return { title: `${name}: ${what}`, body: from(e.parts.join(' · ')) };
    }
    case 'joined':
      return { title: `${name}: הצטרפות לטיול`, body: String(e.name || '').trim() || 'חבר חדש' };
    case 'added':
      return { title: 'צורפת לטיול', body: by ? `${name} · מאת ${by}` : name };
    default:
      return { title: name, body: '' };
  }
}

// Which tab a tap opens.
export const TAB = { expense: 'expenses', plan: 'planning', travel: 'flight', joined: 'flight', added: 'flight' };
