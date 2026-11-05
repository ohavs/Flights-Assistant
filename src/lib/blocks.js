// Free blocks in the schedule (8.87.0): a text, a checklist or a link,
// kept in a day's activities array (see isBlock and placeBlocks in
// dayPlan.js for where each one sits). Pure, for the tests.
//
//   { id: 'blk-…', block: 'text',  text,                 after, createdBy }
//   { id: 'blk-…', block: 'check', text (a title), items: [{ id, text, done }], … }
//   { id: 'blk-…', block: 'link',  url, label, … }

// A new block of `kind`, after the item whose key is `after` (or the top).
export function newBlock(kind, after, uid, stamp) {
  const base = { id: `blk-${stamp}`, block: kind, after: after || null, createdBy: uid || null };
  if (kind === 'check') return { ...base, text: '', items: [{ id: `i-${stamp}`, text: '', done: false }] };
  if (kind === 'link') return { ...base, url: '', label: '' };
  return { ...base, text: '' };
}

// Nothing in it worth keeping.
export function emptyBlock(b) {
  if (!b) return true;
  if (b.block === 'link') return !String(b.url || '').trim();
  if (b.block === 'check') return !String(b.text || '').trim() && !(b.items || []).some(i => String(i?.text || '').trim());
  return !String(b.text || '').trim();
}

// What an edit keeps: trimmed, a checklist's empty lines dropped, a link
// with no scheme given https://.
export function cleanBlock(kind, d) {
  if (kind === 'check') {
    return {
      text: String(d.text || '').trim(),
      items: (d.items || []).map(i => ({ ...i, text: String(i.text || '').trim() })).filter(i => i.text),
    };
  }
  if (kind === 'link') {
    const url = String(d.url || '').trim();
    return { url: url && !/^[a-z][a-z0-9+.-]*:/i.test(url) ? `https://${url}` : url, label: String(d.label || '').trim() };
  }
  return { text: String(d.text || '').trim() };
}

// A link's name when it has none: its host, without www.
export function linkName(b) {
  if (String(b?.label || '').trim()) return b.label.trim();
  try { return new URL(b.url).host.replace(/^www\./, ''); } catch { return String(b?.url || ''); }
}

// "2/5" of a checklist.
export function checkCount(b) {
  const items = (b?.items || []).filter(i => String(i?.text || '').trim());
  return { done: items.filter(i => i.done).length, all: items.length };
}
