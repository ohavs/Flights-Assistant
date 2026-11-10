// A day of the export (PDF, Word, Excel) as the schedule shows it (8.92.0):
// the activities, the bookings, flights and hotel on its date, and the
// free blocks in their places, in the app's own order (dayItems). Before,
// the export listed the stored activities only, and dropped the blocks.
// Pure, for the tests (tests/exportDay.test.mjs).
//
// An entry:
//   { kind: 'activity', time, title, category, description, address, optional, booking, hours }
//   `hours`: the place's own hours on that day, as its card shows them
//   (8.93.0, eventFit.js), or null: { text, warn } (warn: near the
//   closing or the opening, or out of them).
//   { kind: 'booking',  time, title, booking }
//   { kind: 'fixed',    time, title }                      a flight, the hotel
//   { kind: 'block',    block: 'text', text }
//   { kind: 'block',    block: 'check', text (title), items: [{ text, done }] }
//   { kind: 'block',    block: 'link', url, label }
import { dayItems, fixedTitle } from './dayPlan.js';
import { emptyBlock, linkName } from './blocks.js';
import { eventNote } from './eventFit.js';

// `places`: Map of id → place, for their hours (optional).
export function exportDay(day, { bookings = [], flights = {}, hotel = null, places = null } = {}) {
  const items = dayItems({ acts: day?.activities || [], date: day?.date || null, bookings, flights, hotel });
  const out = [];
  for (const it of items) {
    const time = it.slot?.label || '';
    if (it.kind === 'block') {
      const b = it.act;
      if (emptyBlock(b)) continue;
      if (b.block === 'check') {
        out.push({
          kind: 'block', block: 'check', text: String(b.text || '').trim(),
          items: (b.items || []).filter(i => String(i?.text || '').trim()).map(i => ({ text: String(i.text).trim(), done: !!i.done })),
        });
      } else if (b.block === 'link') {
        out.push({ kind: 'block', block: 'link', url: b.url, label: linkName(b) });
      } else {
        out.push({ kind: 'block', block: 'text', text: String(b.text || '').trim() });
      }
      continue;
    }
    if (it.kind === 'activity') {
      const a = it.act;
      if (!a?.title) continue;
      const plan = a.placeId ? places?.get(a.placeId) : null;
      const note = plan && !plan.visited ? eventNote(plan.event, day?.date || null, a.timeLabel) : null;
      out.push({
        kind: 'activity', time, title: a.title, category: a.category || '',
        description: a.description || '', address: a.address || it.booking?.address || '',
        optional: !!a.optional, booking: it.booking || null,
        hours: note ? { text: note.text, warn: note.tone !== 'info' } : null,
      });
      continue;
    }
    if (it.kind === 'booking') {
      if (!it.booking?.title) continue;
      out.push({ kind: 'booking', time, title: it.booking.title, booking: it.booking });
      continue;
    }
    const title = fixedTitle(it);
    if (title) out.push({ kind: 'fixed', time, title });
  }
  return out;
}

// One line about a booking, under its name: "הזמנה · אישור COL7 · 4 אנשים · על שם כהן".
export function bookingLine(b, typeLabel = '') {
  if (!b) return '';
  return [
    typeLabel ? `הזמנה (${typeLabel})` : 'הזמנה',
    b.status === 'pending' ? 'ממתינה לאישור' : '',
    b.confirmation ? `אישור ${b.confirmation}` : '',
    b.people ? `${b.people} אנשים` : '',
    b.bookedUnder ? `על שם ${b.bookedUnder}` : '',
  ].filter(Boolean).join(' · ');
}

// A block in one line of text (Word's day and Excel's rows).
export function blockText(e) {
  if (e.block === 'check') {
    const list = e.items.map(i => `${i.done ? '✓' : '○'} ${i.text}`).join('  ');
    return [e.text, list].filter(Boolean).join(': ');
  }
  if (e.block === 'link') return e.label && e.label !== e.url ? `${e.label} (${e.url})` : e.url;
  return e.text;
}
