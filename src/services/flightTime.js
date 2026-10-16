// Flight times: 24-hour clock and "UTC +02:00" offsets.

// Normalize any time string ("07:30 AM", "19:30", "7:30 pm") → "HH:MM" 24h.
export function toTime24(s) {
  if (!s) return '';
  const trimmed = String(s).trim();
  const m12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10) % 12;
    if (m12[3].toUpperCase() === 'PM') h += 12;
    return `${String(h).padStart(2, '0')}:${m12[2]}`;
  }
  const m24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    return `${String(h).padStart(2, '0')}:${m24[2]}`;
  }
  return trimmed;
}

// Parse a "UTC +03:00" / "UTC -04:00" string into a numeric offset in hours.
export function parseUtcOffset(tzStr) {
  if (!tzStr) return 0;
  const m = String(tzStr).match(/UTC\s*([+-])\s*(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) + parseInt(m[3], 10) / 60);
}

// Israel's offset from UTC on a date: +3 in summer, +2 in winter.
function israelOffset(dateStr) {
  const day = /^\d{4}-\d{2}-\d{2}/.test(dateStr || '') ? new Date(`${dateStr.slice(0, 10)}T12:00:00Z`) : new Date();
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', timeZoneName: 'shortOffset' })
      .formatToParts(day).find(p => p.type === 'timeZoneName')?.value || '';
    const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (m) return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) + parseInt(m[3] || '0', 10) / 60);
  } catch { /* old WebView without shortOffset */ }
  return 3;
}

// Format the time-zone difference vs. Israel on the flight's date — e.g.
// "−1 שעה מישראל", "אותה שעה".
export function formatOffsetFromIsrael(tzStr, dateStr) {
  if (!tzStr) return '';
  const diff = parseUtcOffset(tzStr) - israelOffset(dateStr);
  if (diff === 0) return 'אותה שעה כמו בישראל';
  const abs = Math.abs(diff);
  const sign = diff > 0 ? '+' : '−';
  const noun = abs === 1 ? 'שעה' : 'שעות';
  // Show .5 only if non-integer
  const num = Number.isInteger(abs) ? abs : abs.toFixed(1);
  return `${sign}${num} ${noun} מישראל`;
}
