// Trip export to PDF / Word / Excel — Hebrew, RTL.
// Heavy libraries are dynamic-imported so they don't bloat the main bundle.

import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { saveFile } from '../lib/saveFile';
import { dayActivities } from '../lib/dayActivities';
import { CURRENCY_META, convert, refreshRatesIfStale, getInitialRates } from './currency';
import { toTime24 } from './flightSimulator';

// ──────────────────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────────────────

export async function loadTripExportData(tripId, trip) {
  const planningSnap = await getDocs(collection(db, 'trips', tripId, 'planning'));
  const planning = planningSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const daysSnap = await getDocs(collection(db, 'trips', tripId, 'days'));
  const days = daysSnap.docs
    .map(d => ({ id: d.id, ...d.data(), activities: dayActivities(d.data().activities) }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const checklistSnap = await getDocs(collection(db, 'trips', tripId, 'checklist'));
  const checklist = checklistSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const infoSnap = await getDocs(collection(db, 'trips', tripId, 'info'));
  const info = infoSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const expensesSnap = await getDocs(collection(db, 'trips', tripId, 'expenses'));
  const expenses = expensesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  // Currency rates for ILS conversion — refresh if stale, fall back to seeded.
  let rates = null;
  try {
    rates = (await refreshRatesIfStale())?.rates || getInitialRates().rates;
  } catch {
    rates = getInitialRates().rates;
  }

  // Member profiles (for "paid by" names) — fetch users/{uid} for each member.
  const memberProfiles = {};
  const memberUids = Object.keys(trip?.members || {});
  await Promise.all(memberUids.map(async (uid) => {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) memberProfiles[uid] = snap.data();
    } catch { /* ignore individual profile failures */ }
  }));

  // Planning categories' own colours (the PDF draws them).
  let categorySettings = {};
  try {
    const snap = await getDoc(doc(db, 'trips', tripId, 'settings', 'categories'));
    if (snap.exists()) categorySettings = snap.data() || {};
  } catch { /* the defaults will do */ }

  return { trip, planning, days, checklist, info, expenses, rates, memberProfiles, memberCount: Math.max(memberUids.length, 1), categorySettings };
}

// Build a full expense report (totals, breakdowns, statistics) for export.
// Mirrors the figures shown in the in-app Expenses summary panel.
function computeExpenseReport(expenses, rates, memberProfiles, memberCount, planning) {
  const curMeta = (code) => CURRENCY_META[code] || { name: code, symbol: code, flag: '' };
  const planById = {};
  (planning || []).forEach(p => { planById[p.id] = p; });

  // ILS value: prefer live conversion (matches app), fall back to stored snapshot.
  const ilsOf = (e) => {
    const live = rates ? convert(e.amount, e.currency, 'ILS', rates) : 0;
    if (live) return live;
    if (e.ilsSnapshot != null) return Number(e.ilsSnapshot) || 0;
    return e.currency === 'ILS' ? (Number(e.amount) || 0) : 0;
  };
  const payerName = (uid) => {
    const p = memberProfiles?.[uid];
    return p?.displayName || p?.email || (uid ? 'משתמש' : 'לא ידוע');
  };
  const placeOf = (e) => {
    const linked = e.linkedPlanId ? planById[e.linkedPlanId] : null;
    return linked?.title || e.customPlace || '';
  };
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const ilsTotal = expenses.reduce((s, e) => s + ilsOf(e), 0);

  // Original-currency totals
  const curTotals = {};
  expenses.forEach(e => { curTotals[e.currency] = (curTotals[e.currency] || 0) + (Number(e.amount) || 0); });
  const byCurrency = Object.entries(curTotals)
    .map(([code, total]) => ({ code, total, ...curMeta(code) }))
    .sort((a, b) => b.total - a.total);

  // Category breakdown (ILS)
  const catTotals = {};
  expenses.forEach(e => { const c = e.category || 'כללי'; catTotals[c] = (catTotals[c] || 0) + ilsOf(e); });
  const catGrand = Object.values(catTotals).reduce((a, b) => a + b, 0) || 1;
  const byCategory = Object.entries(catTotals)
    .map(([cat, total]) => ({ cat, total, pct: Math.round((total / catGrand) * 100) }))
    .sort((a, b) => b.total - a.total);

  // Per-payer breakdown (ILS)
  const payerTotals = {};
  expenses.forEach(e => { const u = e.paidBy || 'unknown'; payerTotals[u] = (payerTotals[u] || 0) + ilsOf(e); });
  const payGrand = Object.values(payerTotals).reduce((a, b) => a + b, 0) || 1;
  const byPayer = Object.entries(payerTotals)
    .map(([uid, total]) => ({ uid, name: payerName(uid), total, pct: Math.round((total / payGrand) * 100) }))
    .sort((a, b) => b.total - a.total);

  // Daily average
  const dayKeys = new Set(expenses.map(e => (e.createdAt || '').slice(0, 10)).filter(Boolean));
  const days = dayKeys.size || 1;
  const daily = expenses.length > 0 ? { avg: ilsTotal / days, days } : null;

  // Top expenses (ILS)
  const enriched = expenses.map(e => ({
    ils: ilsOf(e),
    amount: Number(e.amount) || 0,
    currency: e.currency,
    symbol: curMeta(e.currency).symbol,
    category: e.category || 'כללי',
    description: e.description || '',
    place: placeOf(e),
    payer: payerName(e.paidBy),
    date: fmtDate(e.createdAt),
    label: e.description || placeOf(e) || (e.category || 'הוצאה'),
  }));
  const topExpenses = [...enriched].sort((a, b) => b.ils - a.ils).slice(0, 5);

  // Full itemized list, newest first (already sorted on load)
  const items = enriched;

  const hasForeign = byCurrency.some(c => c.code !== 'ILS');
  const perPerson = memberCount >= 2 ? ilsTotal / memberCount : null;

  return {
    count: expenses.length, ilsTotal, perPerson, memberCount,
    byCurrency, byCategory, byPayer, daily, topExpenses, items, hasForeign,
  };
}

// Format an ILS amount with thousands separators, no fraction.
function ils(n) {
  return '₪' + Math.round(Number(n) || 0).toLocaleString('en-US');
}
// Format an original-currency amount.
function curAmt(symbol, n) {
  const v = Number(n) || 0;
  const s = v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${symbol}${s}`;
}

function safeFileName(name) {
  return String(name || 'trip')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

// Excel sheet names forbid [ ] \ / * ? : and max 31 chars
function safeSheetName(name) {
  return String(name || 'כללי').replace(/[[\]\\\/\*\?:']/g, '_').trim().slice(0, 31) || 'כללי';
}

function formatHotelDateTime(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function groupByCategory(items) {
  const map = {};
  for (const item of items) {
    const c = item.category || 'אחר';
    if (!map[c]) map[c] = [];
    map[c].push(item);
  }
  return map;
}

// Scope is one of: 'flight' | 'planning' | 'checklist' | 'info' | 'expenses' | 'all'
// It controls which sections each export includes.
const SCOPE = {
  flight:   { flight: true,  planning: false, days: false, checklist: false, info: false, expenses: false },
  planning: { flight: false, planning: true,  days: true,  checklist: false, info: false, expenses: false },
  checklist:{ flight: false, planning: false, days: false, checklist: true,  info: false, expenses: false },
  info:     { flight: false, planning: false, days: false, checklist: false, info: true,  expenses: false },
  expenses: { flight: false, planning: false, days: false, checklist: false, info: false, expenses: true  },
  all:      { flight: true,  planning: true,  days: true,  checklist: true,  info: true,  expenses: true  },
};

const SCOPE_LABEL = { flight: 'טיסה', planning: 'תכנון', checklist: 'ציוד', info: 'מידע', expenses: 'הוצאות', all: 'מלא' };

// ──────────────────────────────────────────────────────────────────────
// PDF
// ──────────────────────────────────────────────────────────────────────

// The app's look on paper (docs/PLAN-pdf.md): Rubik in three weights, the
// light theme's colours, a chapter per part, cards and quiet tables
// instead of colour bands. Page 1 is a cover with the contents.
const PDF_THEME = {
  text: [11, 11, 12], muted: [91, 95, 102], faint: [150, 153, 160], line: [230, 231, 234],
  card: [244, 245, 247], zebra: [248, 249, 250], white: [255, 255, 255],
  accent: [22, 135, 74], brand: [34, 164, 93], red: [220, 38, 38], orange: [194, 98, 12],
  mint: [230, 244, 236], lavender: [238, 237, 254], butter: [255, 247, 214], sky: [231, 240, 255], rose: [253, 236, 236],
};
const PDF_WEIGHTS = { normal: 400, medium: 500, bold: 700 };

// Category colours, as the planning and expenses tabs draw them.
const PLAN_COLORS = {
  'אטרקציות ודברים לעשות': '#F2701D', 'מסעדות ומקומות אכילה': '#E5484D', 'מקומות לבקר': '#16874A',
  'תחבורה ציבורית': '#2563EB', 'מידע כללי וטיפים': '#6E56CF', 'אירועים': '#C2410C',
};
const EXPENSE_COLORS = {
  'אוכל ושתייה': '#F97316', 'תחבורה': '#3B82F6', 'לינה': '#8B5CF6', 'בידור ותיירות': '#EC4899', 'קניות': '#14B8A6',
};
const rgbOf = (hex) => {
  const h = String(hex || '').replace('#', '');
  return h.length === 6 ? [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) : [79, 70, 229];
};
// A pale version of a colour, as a card or a bar's track.
const tintOf = (rgb, a = 0.14) => rgb.map(c => Math.round(c * a + 255 * (1 - a)));

const pad2 = (n) => String(n).padStart(2, '0');
// 'YYYY-MM-DD' (or any date) → dd.mm.yyyy
function pdfDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function pdfDateTime(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const mapsUrl = (q) => `https://www.google.com/maps?q=${encodeURIComponent(q)}`;

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

let pdfFontsPromise = null;
function loadPdfFonts() {
  if (!pdfFontsPromise) {
    pdfFontsPromise = Promise.all(Object.entries(PDF_WEIGHTS).map(async ([style, w]) => {
      const res = await fetch(`/fonts/Rubik-${w}.ttf`);
      if (!res.ok) throw new Error('Failed to load the PDF font');
      return { style, file: `Rubik-${w}.ttf`, data: bytesToBase64(new Uint8Array(await res.arrayBuffer())) };
    })).catch((err) => { pdfFontsPromise = null; throw err; });
  }
  return pdfFontsPromise;
}

let bidiInstance = null;
async function getBidi() {
  if (!bidiInstance) {
    const mod = await import('bidi-js');
    const factory = mod.default || mod;
    bidiInstance = factory();
  }
  return bidiInstance;
}

// Visual order for jsPDF. A string with no Hebrew in it (a phone number,
// an address abroad, a flight code, a date range) stays left to right as
// written; an RTL paragraph would reverse its runs ("+351 21 355" → "355 21 351+").
const RTL_CHARS = /[\u0590-\u05FF\u0600-\u06FF\uFB1D-\uFDFF]/;
function shapeBidi(bidi, text) {
  if (!text) return '';
  const s = String(text);
  return bidi.getReorderedString(s, bidi.getEmbeddingLevels(s, RTL_CHARS.test(s) ? 'rtl' : 'ltr'));
}

export async function exportTripPdf(data, scope = 'all') {
  const { trip, planning = [], days = [], checklist = [], info = [], expenses = [], rates, memberProfiles = {}, memberCount = 1, categorySettings = {} } = data;
  const SS = SCOPE[scope] || SCOPE.all;
  const { jsPDF } = await import('jspdf');
  const [fonts, bidi] = await Promise.all([loadPdfFonts(), getBidi()]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  for (const f of fonts) {
    doc.addFileToVFS(f.file, f.data);
    doc.addFont(f.file, 'Rubik', f.style);
  }
  const T = PDF_THEME;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const L = 44, R = pageW - 44, W = R - L;
  const TOP = 72, BOTTOM = pageH - 58;
  let y = TOP;

  // ── Drawing helpers ──
  // Text is pre-shaped with bidi-js and handed over as visual order, so
  // jsPDF's own bidi does not run a second time.
  const setFont = (weight = 'normal', size = 11, color = T.text) => {
    doc.setFont('Rubik', weight); doc.setFontSize(size); doc.setTextColor(...color);
  };
  const text = (s, x, base, { align = 'right', weight = 'normal', size = 11, color = T.text } = {}) => {
    setFont(weight, size, color);
    doc.text(shapeBidi(bidi, String(s ?? '')), x, base, { align, isInputVisual: true, isOutputVisual: true });
  };
  const width = (s, weight = 'normal', size = 11) => { setFont(weight, size); return doc.getTextWidth(String(s ?? '')); };
  const wrap = (s, w, weight = 'normal', size = 11) => {
    if (s == null || s === '') return [];
    setFont(weight, size);
    return doc.splitTextToSize(String(s), w);
  };
  const link = (s, x, base, url, { align = 'right', weight = 'normal', size = 10.5 } = {}) => {
    text(s, x, base, { align, weight, size, color: T.accent });
    const w = width(s, weight, size);
    const x0 = align === 'right' ? x - w : x;
    doc.setDrawColor(...T.accent); doc.setLineWidth(0.5);
    doc.line(x0, base + 1.8, x0 + w, base + 1.8);
    if (url) doc.link(x0, base - size, w, size + 4, { url });
  };
  const box = (x, top, w, h, fill, r = 14) => { doc.setFillColor(...fill); doc.roundedRect(x, top, w, h, r, r, 'F'); };
  const pill = (s, xRight, top, { fill = T.card, color = T.text, size = 9.5, weight = 'medium' } = {}) => {
    const w = width(s, weight, size) + 16, h = size + 9;
    box(xRight - w, top, w, h, fill, h / 2);
    text(s, xRight - 8, top + h / 2 + size * 0.36, { size, weight, color });
    return w;
  };
  const dot = (cx, cy, r, rgb) => { doc.setFillColor(...rgb); doc.circle(cx, cy, r, 'F'); };
  // The app's done-circle: a ticked disc, or an empty ring.
  const checkCircle = (cx, cy, done, r = 6) => {
    if (done) {
      dot(cx, cy, r, T.accent);
      doc.setDrawColor(...T.white); doc.setLineWidth(1.4);
      doc.lines([[r * 0.38, r * 0.38], [r * 0.7, -r * 0.78]], cx - r * 0.5, cy + 0.1, [1, 1], 'S', false);
    } else {
      doc.setDrawColor(...T.faint); doc.setLineWidth(1);
      doc.circle(cx, cy, r, 'S');
    }
  };
  const hr = (top, color = T.line, lw = 0.8) => { doc.setDrawColor(...color); doc.setLineWidth(lw); doc.line(L, top, R, top); };

  const newPage = () => { doc.addPage(); y = TOP; };
  const ensure = (h) => { if (y + h > BOTTOM) { newPage(); return true; } return false; };

  // A part of the trip: always a fresh page, a small number in the
  // accent, the title, a hairline.
  const chapters = [];
  const chapter = (title) => {
    newPage();
    chapters.push({ title, page: doc.getNumberOfPages() });
    text(pad2(chapters.length), R, y + 8, { weight: 'medium', size: 11, color: T.accent });
    text(title, R, y + 38, { weight: 'bold', size: 24 });
    y += 52;
    hr(y, T.line, 1);
    y += 24;
  };
  // A group's title: a dot in its colour, the name, a quiet count.
  const groupTitle = (title, { color, count, keep = 60 } = {}) => {
    ensure(keep);
    let x = R;
    if (color) { dot(R - 5, y + 8.5, 5, color); x = R - 17; }
    text(title, x, y + 13, { weight: 'bold', size: 14 });
    if (count != null && count !== '') {
      text(String(count), x - width(title, 'bold', 14) - 8, y + 13, { weight: 'medium', size: 10.5, color: T.muted });
    }
    y += 26;
  };

  // A quiet table. cols run right to left: { label, w, weight?, color? };
  // a cell is a string or { text, url, color, weight, check }. The header
  // repeats on a new page.
  const table = (cols, rows, { size = 10, total } = {}) => {
    const PAD = 7, LH = size * 1.45;
    const xs = [];
    let cx = R;
    for (const c of cols) { xs.push(cx); cx -= c.w; }
    const header = () => {
      ensure(48);
      cols.forEach((c, i) => text(c.label, xs[i] - PAD, y + 13, { size: 9, weight: 'medium', color: T.muted }));
      y += 20;
      hr(y);
    };
    header();
    rows.forEach((row, ri) => {
      const cells = row.map((cell, i) => {
        const c = cell && typeof cell === 'object' ? cell : { text: cell ?? '' };
        const weight = c.weight || cols[i].weight || 'normal';
        return { ...c, weight, lines: c.check != null ? [] : wrap(c.text, cols[i].w - PAD * 2, weight, size) };
      });
      const h = Math.max(1, ...cells.map(c => c.lines.length)) * LH + PAD * 2 - (LH - size) + 2;
      if (ensure(h)) header();
      if (ri % 2 === 1) { doc.setFillColor(...T.zebra); doc.rect(L, y, W, h, 'F'); }
      cells.forEach((c, i) => {
        if (c.check != null) { checkCircle(xs[i] - PAD - 6, y + PAD + size * 0.5, c.check, 5.5); return; }
        let base = y + PAD + size * 0.8;
        for (const line of c.lines) {
          if (c.url) link(line, xs[i] - PAD, base, c.url, { size, weight: c.weight });
          else text(line, xs[i] - PAD, base, { size, weight: c.weight, color: c.color || cols[i].color || T.text });
          base += LH;
        }
      });
      y += h;
    });
    if (total) {
      const h = size + PAD * 2 + 4;
      ensure(h);
      box(L, y + 4, W, h, T.mint, 8);
      total.forEach((cell, i) => {
        if (cell) text(cell, xs[i] - PAD, y + 4 + h / 2 + size * 0.36, { size: size + 0.5, weight: 'bold', color: T.accent });
      });
      y += h + 4;
    } else {
      hr(y);
    }
    y += 18;
  };

  // A row of label over value, right to left, inside a card.
  const facts = (items, top, x0 = R - 18, gap = 22) => {
    let x = x0;
    for (const { label, value, color } of items) {
      if (!value) continue;
      text(label, x, top, { size: 9, weight: 'medium', color: T.muted });
      text(value, x, top + 16, { size: 12, weight: 'medium', color: color || T.text });
      x -= Math.max(width(label, 'medium', 9), width(value, 'medium', 12)) + gap;
    }
  };

  const ob = trip?.outboundFlightDetails;
  const rt = trip?.returnFlightDetails;
  const ht = trip?.hotelDetails;
  const planColor = (cat) => rgbOf(categorySettings?.[cat]?.color || PLAN_COLORS[cat] || '#4F46E5');
  const expenseColor = (cat) => rgbOf(EXPENSE_COLORS[cat] || '#64748B');

  // ── Cover ──
  const tripName = trip?.name || 'הטיול שלי';
  const nameLines = wrap(tripName, W - 56, 'bold', 34).slice(0, 2);
  const heroH = 150 + nameLines.length * 40;
  box(L, 48, W, heroH, T.mint, 24);
  text('עוזר טיסות', R - 28, 84, { size: 11, weight: 'medium', color: T.accent });
  let cy = 84 + 48;
  for (const line of nameLines) { text(line, R - 28, cy, { size: 34, weight: 'bold' }); cy += 40; }
  if (trip?.destination) { text(trip.destination, R - 28, cy + 4, { size: 16, color: T.muted }); cy += 30; }
  if (trip?.dates) pill(trip.dates, R - 28, cy + 4, { fill: T.white, size: 11 });
  y = 48 + heroH + 40;

  const contentsTop = y;   // filled in at the end, once the pages are known
  const members = Object.keys(trip?.members || {})
    .map(uid => memberProfiles[uid]?.displayName || memberProfiles[uid]?.email)
    .filter(Boolean);

  // ── Flight and hotel ──
  const hasFlight = (f) => !!(f?.flightNumber || f?.depAirport?.code || f?.date);
  if (SS.flight && (hasFlight(ob) || hasFlight(rt) || ht?.name || ht?.address)) {
    chapter('טיסה ומלון');

    const flightCard = (f, label, tone) => {
      if (!hasFlight(f)) return;
      const h = 168;
      ensure(h + 16);
      const top = y;
      box(L, top, W, h, T.card);
      let x = R - 18;
      x -= pill(label, x, top + 16, { fill: tone.fill, color: tone.color }) + 10;
      text(f.flightNumber || '—', x, top + 29, { weight: 'bold', size: 15 });
      x -= width(f.flightNumber || '—', 'bold', 15) + 8;
      if (f.airline) text(f.airline, x, top + 29, { size: 10.5, color: T.muted });
      if (f.date) text(pdfDate(f.date), L + 18, top + 29, { align: 'left', size: 11, weight: 'medium', color: T.muted });

      // The route: departure on the right, arrival on the left (RTL).
      const dep = f.depAirport || {}, arr = f.arrAirport || {};
      const depCode = dep.code || '—', arrCode = arr.code || '—';
      text(depCode, R - 18, top + 78, { weight: 'bold', size: 28 });
      text(arrCode, L + 18, top + 78, { weight: 'bold', size: 28, align: 'left' });
      const x1 = L + 18 + width(arrCode, 'bold', 28) + 18;
      const x2 = R - 18 - width(depCode, 'bold', 28) - 18;
      if (x2 - x1 > 40) {
        doc.setDrawColor(...T.faint); doc.setLineWidth(1); doc.setLineDashPattern([2, 3], 0);
        doc.line(x1, top + 68, x2, top + 68);
        doc.setLineDashPattern([], 0);
        dot(x1, top + 68, 2.5, T.faint);
        dot(x2, top + 68, 2.5, T.faint);
        dot((x1 + x2) / 2, top + 68, 5, T.accent);
      }
      if (dep.city) text(dep.city, R - 18, top + 96, { size: 10, color: T.muted });
      if (arr.city) text(arr.city, L + 18, top + 96, { size: 10, color: T.muted, align: 'left' });

      const time = (scheduled, updated) => {
        const s = toTime24(scheduled), u = toTime24(updated);
        return { main: u || s || '—', was: u && s && u !== s ? s : '' };
      };
      const d = time(f.scheduledDep, f.actualDep), a = time(f.scheduledArr, f.estimatedArr);
      text(d.main, R - 18, top + 122, { weight: 'bold', size: 16 });
      text('המראה', R - 24 - width(d.main, 'bold', 16), top + 122, { size: 9.5, color: T.muted });
      if (d.was) text(`במקור ${d.was}`, R - 18, top + 138, { size: 9, color: T.orange });
      text(a.main, L + 18, top + 122, { weight: 'bold', size: 16, align: 'left' });
      text('נחיתה', L + 24 + width(a.main, 'bold', 16), top + 122, { size: 9.5, color: T.muted, align: 'left' });
      if (a.was) text(`במקור ${a.was}`, L + 18, top + 138, { size: 9, color: T.orange, align: 'left' });

      let px = R - 18;
      if (f.gate) px -= pill(`שער ${f.gate}`, px, top + 144, { fill: T.white, size: 9 }) + 6;
      if (f.status) {
        const bad = f.status === 'בוטלה', late = String(f.status).includes('איחור');
        pill(f.status, px, top + 144, { fill: bad ? T.rose : late ? T.butter : T.mint, color: bad ? T.red : late ? T.orange : T.accent, size: 9 });
      }
      y += h + 16;
    };
    flightCard(ob, 'טיסת הלוך', { fill: T.mint, color: T.accent });
    flightCard(rt, 'טיסת חזור', { fill: T.rose, color: T.red });

    if (ht?.name || ht?.address) {
      const IW = W - 36;
      const nameL = wrap(ht.name || 'מלון', IW, 'bold', 16);
      const addrL = wrap(ht.address, IW, 'normal', 10.5);
      const linkL = ht.link ? [String(ht.link).replace(/^https?:\/\//, '').slice(0, 70)] : [];
      const notesL = wrap(ht.notes, IW, 'normal', 10);
      const hasDates = ht.checkIn || ht.checkOut || ht.roomNumber;
      const h = 18 + 12 + nameL.length * 21 + (addrL.length + linkL.length) * 15 + (hasDates ? 50 : 0)
        + (notesL.length ? 22 + notesL.length * 14.5 : 0) + 8;
      ensure(h + 16);
      const top = y;
      box(L, top, W, h, T.card);
      let base = top + 34;
      for (const line of nameL) { text(line, R - 18, base, { weight: 'bold', size: 16 }); base += 21; }
      for (const line of addrL) { link(line, R - 18, base, mapsUrl(ht.address)); base += 15; }
      for (const line of linkL) { link(line, R - 18, base, ht.link); base += 15; }
      if (hasDates) {
        base += 10;
        facts([
          { label: 'כניסה', value: pdfDateTime(ht.checkIn) },
          { label: 'יציאה', value: pdfDateTime(ht.checkOut) },
          { label: 'חדר', value: ht.roomNumber },
        ], base, R - 18, 28);
        base += 40;
      }
      if (notesL.length) {
        text('הערות', R - 18, base + 6, { size: 9, weight: 'medium', color: T.muted });
        base += 22;
        for (const line of notesL) { text(line, R - 18, base, { size: 10, color: T.text }); base += 14.5; }
      }
      y += h + 16;
    }
  }

  // ── Planning ──
  if (SS.planning && planning.length > 0) {
    chapter('תכנון');
    const COLS = [
      { label: '', w: 26 },
      { label: 'שם', w: 150, weight: 'medium' },
      { label: 'כתובת', w: 150 },
      { label: 'הערות', w: W - 326, color: T.muted },
    ];
    for (const [cat, items] of Object.entries(groupByCategory(planning))) {
      groupTitle(cat, { color: planColor(cat), count: items.length });
      table(COLS, items.map(p => {
        const addr = p.address || '';
        const firstLink = Array.isArray(p.links) && p.links[0] ? p.links[0] : null;
        const where = addr
          ? { text: addr, url: /^https?:\/\//i.test(addr) ? addr : mapsUrl(addr) }
          : firstLink?.url ? { text: firstLink.label || firstLink.url.replace(/^https?:\/\//, '').slice(0, 40), url: firstLink.url } : '';
        return [{ check: !!p.visited }, p.title || '', where, p.description || ''];
      }));
    }
  }

  // ── Days: a timeline each, every day on its own page ──
  if (SS.days && days.length > 0) {
    days.forEach((day, i) => {
      if (i === 0) chapter('לוח הימים'); else newPage();
      const date = day.date ? new Date(`${day.date}T12:00:00`) : null;
      text(day.title || `יום ${i + 1}`, R, y + 16, { weight: 'bold', size: 18 });
      if (date && !Number.isNaN(date.getTime())) {
        text(`יום ${WEEKDAYS[date.getDay()]} · ${pdfDate(day.date)}`, L, y + 16, { align: 'left', size: 11, weight: 'medium', color: T.muted });
      }
      y += 38;
      const acts = day.activities || [];
      if (acts.length === 0) {
        text('אין פעילויות מתוכננות', R, y + 12, { size: 11, color: T.muted });
        y += 30;
        return;
      }
      const TX = L + 62;            // the timeline
      const CW = R - (TX + 18);     // the item's width
      acts.forEach((act, ai) => {
        const titleL = wrap(act.title || '', CW, 'bold', 13);
        const descL = wrap(act.description, CW, 'normal', 10);
        const addrL = wrap(act.address, CW, 'normal', 10);
        const h = titleL.length * 18 + (act.category ? 22 : 0) + descL.length * 14 + addrL.length * 14 + 18;
        ensure(h);
        const top = y;
        if (act.timeLabel) text(act.timeLabel, L, top + 13, { align: 'left', weight: 'bold', size: 12 });
        doc.setDrawColor(...T.line); doc.setLineWidth(1.5);
        if (ai < acts.length - 1) doc.line(TX, top + 9, TX, top + h + 4);
        dot(TX, top + 9, 4.5, act.category ? planColor(act.category) : T.accent);
        let base = top + 13;
        for (const line of titleL) { text(line, R, base, { weight: 'bold', size: 13 }); base += 18; }
        if (act.category) {
          const c = planColor(act.category);
          pill(act.category, R, base - 9, { fill: tintOf(c), color: c, size: 9 });
          base += 22;
        }
        for (const line of descL) { text(line, R, base, { size: 10, color: T.muted }); base += 14; }
        for (const line of addrL) { link(line, R, base, mapsUrl(act.address), { size: 10 }); base += 14; }
        y += h;
      });
    });
  }

  // ── Checklist: two columns of done-circles ──
  if (SS.checklist && checklist.length > 0) {
    chapter("צ'קליסט");
    const GAP = 18, CW = (W - GAP) / 2;
    for (const [cat, items] of Object.entries(groupByCategory(checklist))) {
      groupTitle(cat, { count: `${items.filter(i => i.completed).length}/${items.length}` });
      for (let i = 0; i < items.length; i += 2) {
        const pair = items.slice(i, i + 2).map(it => ({ it, lines: wrap(it.text, CW - 24, 'normal', 11) }));
        const h = Math.max(...pair.map(p => Math.max(1, p.lines.length))) * 15 + 9;
        ensure(h);
        pair.forEach(({ it, lines }, k) => {
          const xr = k === 0 ? R : R - CW - GAP;
          checkCircle(xr - 6, y + 7.5, !!it.completed);
          let base = y + 11.5;
          for (const line of lines) { text(line, xr - 20, base, { size: 11, color: it.completed ? T.muted : T.text }); base += 15; }
        });
        y += h;
      }
      y += 14;
    }
  }

  // ── Important info: a card per category; emergency numbers stand out ──
  if (SS.info && info.length > 0) {
    chapter('מידע חשוב');
    const VW = W * 0.46;   // the value's column, on the left
    for (const [cat, items] of Object.entries(groupByCategory(info))) {
      const urgent = cat === 'מספרי חירום';
      const rows = items.map(it => {
        const v = String(it.value || '');
        const url = !v ? null
          : it.type === 'phone' ? `tel:${v.replace(/[^0-9+]/g, '')}`
          : it.type === 'address' ? mapsUrl(v)
          : it.type === 'url' ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null;
        const titleL = wrap(it.title || '', W - VW - 54, 'medium', 11.5);
        const valueL = wrap(v, VW - 18, urgent ? 'bold' : 'normal', urgent ? 13 : 11);
        return { url, titleL, valueL, h: Math.max(titleL.length, valueL.length, 1) * 16 + 14 };
      });
      groupTitle(cat, { color: urgent ? T.red : null, keep: 26 + (rows[0]?.h || 0) + 20 });
      const total = rows.reduce((s, r) => s + r.h, 0) + 12;
      let top = y;
      const start = (h) => { box(L, top, W, h, urgent ? T.rose : T.card); };
      // One card; it breaks with the page when it has to.
      let left = total;
      if (y + Math.min(total, rows[0].h + 12) > BOTTOM) { newPage(); top = y; }
      start(Math.min(left, BOTTOM - top));
      y += 6;
      rows.forEach((r, ri) => {
        if (y + r.h > BOTTOM) {
          newPage(); top = y;
          start(Math.min(left, BOTTOM - top));
          y += 6;
        }
        if (ri > 0) { doc.setDrawColor(...(urgent ? tintOf(T.red, 0.2) : T.line)); doc.setLineWidth(0.6); doc.line(L + 18, y, R - 18, y); }
        let base = y + 18;
        for (const line of r.titleL) { text(line, R - 18, base, { weight: 'medium', size: 11.5 }); base += 16; }
        base = y + 18;
        for (const line of r.valueL) {
          if (r.url) link(line, L + 18, base, r.url, { align: 'left', weight: urgent ? 'bold' : 'normal', size: urgent ? 13 : 11 });
          else text(line, L + 18, base, { align: 'left', size: 11, color: T.muted });
          base += 16;
        }
        y += r.h;
        left -= r.h;
      });
      y += 22;
    }
  }

  // ── Expenses ──
  if (SS.expenses && expenses.length > 0) {
    const rep = computeExpenseReport(expenses, rates, memberProfiles, memberCount, planning);
    const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
    chapter('הוצאות');

    // The total, and the figures around it.
    const h = 96;
    box(L, y, W, h, T.mint, 18);
    text('סך כל ההוצאות', R - 22, y + 30, { size: 10.5, weight: 'medium', color: T.muted });
    text(ils(rep.ilsTotal), R - 22, y + 68, { size: 32, weight: 'bold', color: T.accent });
    const side = [
      rep.perPerson != null ? `${ils(rep.perPerson)} לאדם (${rep.memberCount} משתתפים)` : null,
      rep.daily ? `${ils(rep.daily.avg)} ביום בממוצע (${rep.daily.days} ימים)` : null,
      `${rep.count} הוצאות`,
    ].filter(Boolean);
    side.forEach((s, i) => text(s, L + 22, y + 32 + i * 20, { align: 'left', size: 10.5, weight: i === 0 ? 'medium' : 'normal', color: i === 0 ? T.text : T.muted }));
    y += h + 30;

    // Bars: a pale track in the colour, filled from the right.
    const bars = (rows, colorOf) => {
      for (const r of rows) {
        ensure(34);
        const c = colorOf(r);
        dot(R - 4.5, y + 8, 4.5, c);
        text(r.label, R - 15, y + 12, { size: 11, weight: 'medium' });
        text(`${ils(r.total)} · ${r.pct}%`, L, y + 12, { align: 'left', size: 10.5, color: T.muted });
        y += 19;
        box(L, y, W, 6, tintOf(c, 0.18), 3);
        const fw = Math.max(6, (W * r.pct) / 100);
        box(R - fw, y, fw, 6, c, 3);
        y += 16;
      }
      y += 12;
    };
    if (rep.byCategory.length > 0) {
      groupTitle('לפי קטגוריה');
      bars(rep.byCategory.map(c => ({ label: c.cat, total: c.total, pct: c.pct, cat: c.cat })), r => expenseColor(r.cat));
    }
    if (rep.byPayer.length > 0 && expenses.some(e => e.paidBy)) {
      groupTitle('מי שילם');
      bars(rep.byPayer.map(p => ({ label: p.name, total: p.total, pct: p.pct })), () => T.brand);
    }
    if (rep.hasForeign) {
      groupTitle('לפי מטבע');
      table([{ label: 'מטבע', w: 240, weight: 'medium' }, { label: 'סכום', w: W - 240 }],
        rep.byCurrency.map(c => [`${c.name} (${c.code})`, `${fmtNum(c.total)} ${c.code}`]));
    }
    if (rep.topExpenses.length > 0) {
      groupTitle('ההוצאות הגדולות');
      table([{ label: '', w: 26, color: T.muted }, { label: 'פירוט', w: W - 26 - 100, weight: 'medium' }, { label: 'בשקלים', w: 100 }],
        rep.topExpenses.map((e, i) => [String(i + 1), e.label, ils(e.ils)]));
    }
    groupTitle('כל ההוצאות', { count: rep.count });
    table([
      { label: 'תאריך', w: 66, color: T.muted },
      { label: 'קטגוריה', w: 92 },
      { label: 'פירוט', w: W - 66 - 92 - 96 - 76, weight: 'medium' },
      { label: 'סכום מקורי', w: 96 },
      { label: 'בשקלים', w: 76 },
    ], rep.items.map(it => [
      it.date.replace(/\//g, '.'), it.category, it.description || it.place || '', `${fmtNum(it.amount)} ${it.currency}`, ils(it.ils),
    ]), { size: 9.5, total: ['סה"כ', '', '', '', ils(rep.ilsTotal)] });
  }

  // ── Cover: contents and who is on the trip ──
  doc.setPage(1);
  y = contentsTop;
  if (chapters.length > 0) {
    text('בחוברת', R, y, { weight: 'bold', size: 14 });
    y += 16;
    chapters.forEach((c, i) => {
      y += 26;
      text(pad2(i + 1), R, y, { weight: 'medium', size: 11, color: T.accent });
      text(c.title, R - 26, y, { size: 13 });
      text(String(c.page), L, y, { align: 'left', size: 12, weight: 'medium', color: T.muted });
      doc.link(L, y - 14, W, 20, { pageNumber: c.page });
      hr(y + 10);
    });
    y += 44;
  }
  if (chapters.length === 0) {
    text('עוד אין בטיול פרטים לייצוא.', R, y, { size: 13, color: T.muted });
    y += 40;
  }
  if (members.length > 1) {
    text('חברי הטיול', R, y, { weight: 'bold', size: 14 });
    y += 22;
    for (const line of wrap(members.join(' · '), W, 'normal', 11.5)) { text(line, R, y, { size: 11.5, color: T.muted }); y += 17; }
  }
  const now = new Date();
  text(`הופק ב־${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${now.getFullYear()}`, R, pageH - 44, { size: 9.5, color: T.faint });

  // ── Running header and footer, every page but the cover ──
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 2; p <= totalPages; p++) {
    doc.setPage(p);
    text(tripName, R, 40, { size: 9, weight: 'medium', color: T.faint });
    text(`עמוד ${p} מתוך ${totalPages}`, L, pageH - 30, { align: 'left', size: 9, color: T.faint });
    text('עוזר טיסות', R, pageH - 30, { size: 9, color: T.faint });
  }

  await saveFile(doc.output('blob'), `${safeFileName(tripName)}_${SCOPE_LABEL[scope] || scope}.pdf`);
}

// ──────────────────────────────────────────────────────────────────────
// WORD (.docx)
// ──────────────────────────────────────────────────────────────────────

export async function exportTripDocx(data, scope = 'all') {
  const { trip, planning, days, checklist, info, expenses = [], rates, memberProfiles, memberCount = 1 } = data;
  const SS = SCOPE[scope] || SCOPE.all;
  const { Document, Packer, Paragraph, TextRun, ExternalHyperlink, HeadingLevel, AlignmentType,
          Table, TableRow, TableCell, WidthType, Footer, Header } = await import('docx');

  const RUN_OPTS = { rtl: true, font: 'David', size: 24 };

  const para = (text, opts = {}) => {
    const { bold = false, size = 24, color = '0b0b26', heading, spacing, indent } = opts;
    return new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      heading,
      spacing: spacing || { after: 100 },
      indent,
      children: [new TextRun({ text: String(text || ''), bold, size, color, rtl: true, font: 'David' })],
    });
  };

  const linkPara = (text, url, opts = {}) => {
    const { size = 22, indent } = opts;
    return new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      spacing: { after: 100 },
      indent,
      children: [new ExternalHyperlink({
        link: url,
        children: [new TextRun({ text: String(text || ''), color: '4f46e5', underline: {}, size, rtl: true, font: 'David' })],
      })],
    });
  };

  const spacer = () => new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: '', ...RUN_OPTS })] });

  const sections = [];
  const main = [];

  // Cover
  main.push(para(trip?.name || 'הטיול שלי', { bold: true, size: 52, heading: HeadingLevel.TITLE }));
  if (trip?.destination) main.push(para(trip.destination, { size: 30, color: '475569' }));
  if (trip?.dates)       main.push(para(trip.dates, { size: 26, color: '475569' }));
  main.push(spacer());

  const ob = trip?.outboundFlightDetails;
  const rt = trip?.returnFlightDetails;
  const ht = trip?.hotelDetails;

  if (SS.flight) {
    main.push(para('טיסה ומלון', { bold: true, size: 36, color: '4f46e5', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 200 } }));
    if (ob?.flightNumber) {
      main.push(para('טיסת הלוך', { bold: true, size: 28, color: '0b0b26', heading: HeadingLevel.HEADING_2, spacing: { before: 120, after: 100 } }));
      main.push(para(`${ob.flightNumber}   ${ob.airline || ''}`, { bold: true, size: 26 }));
      main.push(para(`${ob.depAirport?.code || ''} → ${ob.arrAirport?.code || ''}`, { size: 24, color: '334155' }));
      if (ob.date) main.push(para(`תאריך: ${ob.date}`, { color: '475569' }));
      if (ob.scheduledDep || ob.scheduledArr) main.push(para(`המראה ${ob.scheduledDep || '—'}    נחיתה ${ob.scheduledArr || '—'}`, { color: '475569' }));
      if (ob.gate) main.push(para(`שער: ${ob.gate}`, { color: '475569' }));
    }
    if (rt?.flightNumber) {
      main.push(para('טיסת חזור', { bold: true, size: 28, color: '0b0b26', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
      main.push(para(`${rt.flightNumber}   ${rt.airline || ''}`, { bold: true, size: 26 }));
      main.push(para(`${rt.depAirport?.code || ''} → ${rt.arrAirport?.code || ''}`, { size: 24, color: '334155' }));
      if (rt.date) main.push(para(`תאריך: ${rt.date}`, { color: '475569' }));
      if (rt.scheduledDep || rt.scheduledArr) main.push(para(`המראה ${rt.scheduledDep || '—'}    נחיתה ${rt.scheduledArr || '—'}`, { color: '475569' }));
      if (rt.gate) main.push(para(`שער: ${rt.gate}`, { color: '475569' }));
    }
    if (ht?.name) {
      main.push(para('מלון', { bold: true, size: 28, color: '0b0b26', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
      main.push(para(ht.name, { bold: true, size: 26 }));
      if (ht.address) main.push(linkPara(`📍 ${ht.address}`, `https://www.google.com/maps?q=${encodeURIComponent(ht.address)}`, { size: 22 }));
      if (ht.link) main.push(linkPara(`🔗 ${ht.link}`, ht.link, { size: 22 }));
      if (ht.checkIn || ht.checkOut) main.push(para(`כניסה ${formatHotelDateTime(ht.checkIn)}    יציאה ${formatHotelDateTime(ht.checkOut)}`, { color: '475569' }));
      if (ht.roomNumber) main.push(para(`חדר: ${ht.roomNumber}`, { color: '475569' }));
      if (ht.notes) main.push(para(ht.notes, { color: '475569' }));
    }
    main.push(spacer());
  }

  if (SS.planning && planning.length > 0) {
    main.push(para('תכנון הטיול', { bold: true, size: 36, color: '4f46e5', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 200 } }));

    const mkCell = (text, { isHeader = false, widthPct = 25 } = {}) => new TableCell({
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      shading: isHeader ? { fill: '4F46E5', color: '4F46E5', type: 'solid' } : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({
          text: String(text || ''),
          bold: isHeader,
          color: isHeader ? 'FFFFFF' : '0b0b26',
          rtl: true,
          font: 'David',
          size: isHeader ? 22 : 20,
        })],
      })],
    });

    const planGroups = groupByCategory(planning);
    for (const [cat, items] of Object.entries(planGroups)) {
      main.push(para(cat, { bold: true, size: 26, color: '4f46e5', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));

      const headerRow = new TableRow({
        tableHeader: true,
        children: [
          mkCell('שם',    { isHeader: true, widthPct: 30 }),
          mkCell('תיאור', { isHeader: true, widthPct: 35 }),
          mkCell('כתובת', { isHeader: true, widthPct: 27 }),
          mkCell('נצפה',  { isHeader: true, widthPct: 8 }),
        ],
      });

      const dataRows = items.map(p => {
        const addrText = p.address
          || (Array.isArray(p.links) && p.links[0] ? (p.links[0].label || p.links[0].url || '') : '');
        return new TableRow({
          children: [
            mkCell(p.title || '',    { widthPct: 30 }),
            mkCell(p.description || '', { widthPct: 35 }),
            mkCell(addrText,         { widthPct: 27 }),
            mkCell(p.visited ? '✓' : '', { widthPct: 8 }),
          ],
        });
      });

      main.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        bidi: true,
        rows: [headerRow, ...dataRows],
      }));
      main.push(spacer());
    }
  }

  sections.push({
    properties: {
      bidi: true,
      page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } },
    },
    children: main,
  });

  // One section per day = its own page in Word
  if (SS.days) {
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const dayChildren = [];
      dayChildren.push(para(day.title || `יום ${i + 1}`, { bold: true, size: 44, color: '4f46e5', heading: HeadingLevel.TITLE, spacing: { after: 240 } }));
      const acts = day.activities || [];
      if (acts.length === 0) {
        dayChildren.push(para('אין פעילויות מתוכננות', { color: '64748b' }));
      } else {
        for (const act of acts) {
          const labelPart = act.timeLabel ? `[${act.timeLabel}]   ` : '';
          dayChildren.push(para(`• ${labelPart}${act.title}`, { bold: true, size: 30, heading: HeadingLevel.HEADING_2 }));
          if (act.category) dayChildren.push(para(act.category, { color: '64748b' }));
          if (act.description) dayChildren.push(para(act.description, { color: '475569' }));
          if (act.address) dayChildren.push(linkPara(`📍 ${act.address}`, `https://www.google.com/maps?q=${encodeURIComponent(act.address)}`));
          dayChildren.push(spacer());
        }
      }
      sections.push({
        properties: {
      bidi: true,
      page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } },
    },
        children: dayChildren,
      });
    }
  }

  if (SS.checklist && checklist?.length > 0) {
    const ck = [];
    ck.push(para("צ'קליסט ציוד", { bold: true, size: 44, color: '4f46e5', heading: HeadingLevel.TITLE, spacing: { after: 240 } }));
    const groups = groupByCategory(checklist);
    for (const [cat, items] of Object.entries(groups)) {
      ck.push(para(cat, { bold: true, size: 28, color: '0b0b26', heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 } }));
      for (const item of items) {
        const mark = item.completed ? '☑' : '☐';
        ck.push(para(`${mark}   ${item.text}`, { size: 24 }));
      }
      ck.push(spacer());
    }
    sections.push({
      properties: {
      bidi: true,
      page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } },
    },
      children: ck,
    });
  }

  if (SS.info && info?.length > 0) {
    const inf = [];
    inf.push(para('מידע חשוב', { bold: true, size: 44, color: 'dc2626', heading: HeadingLevel.TITLE, spacing: { after: 240 } }));
    const groups = groupByCategory(info);
    for (const [cat, items] of Object.entries(groups)) {
      inf.push(para(cat, { bold: true, size: 28, color: '0b0b26', heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 } }));
      for (const item of items) {
        inf.push(para(`• ${item.title}`, { bold: true, size: 26 }));
        if (item.value) {
          if (item.type === 'phone') {
            inf.push(linkPara(`📞  ${item.value}`, `tel:${String(item.value).replace(/[^0-9+]/g, '')}`));
          } else if (item.type === 'address') {
            inf.push(linkPara(`📍 ${item.value}`, `https://www.google.com/maps?q=${encodeURIComponent(item.value)}`));
          } else if (item.type === 'url') {
            const url = /^https?:\/\//i.test(item.value) ? item.value : `https://${item.value}`;
            inf.push(linkPara(`🔗 ${item.value}`, url));
          } else {
            inf.push(para(item.value, { color: '475569' }));
          }
        }
        inf.push(spacer());
      }
    }
    sections.push({
      properties: {
      bidi: true,
      page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } },
    },
      children: inf,
    });
  }

  // Expenses report section
  if (SS.expenses && expenses?.length > 0) {
    const rep = computeExpenseReport(expenses, rates, memberProfiles, memberCount, planning);
    const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const exp = [];

    const expCell = (text, { isHeader = false, widthPct = 20, color, bold = false, fill } = {}) => new TableCell({
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      shading: isHeader ? { fill: '059669', color: '059669', type: 'solid' } : (fill ? { fill, color: fill, type: 'solid' } : undefined),
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({
          text: String(text ?? ''),
          bold: isHeader || bold,
          color: isHeader ? 'FFFFFF' : (color || '0b0b26'),
          rtl: true, font: 'David', size: isHeader ? 21 : 19,
        })],
      })],
    });

    exp.push(para('דוח הוצאות', { bold: true, size: 44, color: '059669', heading: HeadingLevel.TITLE, spacing: { after: 200 } }));

    // Headline figures
    exp.push(para(`סך כל ההוצאות: ${ils(rep.ilsTotal)}`, { bold: true, size: 32, color: '059669', spacing: { after: 80 } }));
    if (rep.perPerson != null) exp.push(para(`עלות לאדם (חלוקה ל-${rep.memberCount} משתתפים): ${ils(rep.perPerson)}`, { size: 24, color: '0b0b26' }));
    if (rep.daily) exp.push(para(`ממוצע הוצאה יומי (${rep.daily.days} ימים): ${ils(rep.daily.avg)}`, { size: 24, color: '0b0b26' }));
    exp.push(para(`סך הכל ${rep.count} רשומות`, { size: 22, color: '475569' }));
    exp.push(spacer());

    // Category breakdown table
    if (rep.byCategory.length > 0) {
      exp.push(para('התפלגות לפי קטגוריה', { bold: true, size: 28, color: '0b0b26', heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 } }));
      exp.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, bidi: true,
        rows: [
          new TableRow({ tableHeader: true, children: [
            expCell('קטגוריה', { isHeader: true, widthPct: 50 }),
            expCell('סכום (₪)', { isHeader: true, widthPct: 30 }),
            expCell('אחוז', { isHeader: true, widthPct: 20 }),
          ]}),
          ...rep.byCategory.map((c, i) => new TableRow({ children: [
            expCell(c.cat, { widthPct: 50, fill: i % 2 ? 'F0FDF4' : undefined }),
            expCell(ils(c.total), { widthPct: 30, fill: i % 2 ? 'F0FDF4' : undefined }),
            expCell(`${c.pct}%`, { widthPct: 20, fill: i % 2 ? 'F0FDF4' : undefined }),
          ]})),
        ],
      }));
      exp.push(spacer());
    }

    // Per-payer
    if (rep.byPayer.length > 0 && expenses.some(e => e.paidBy)) {
      exp.push(para('מי שילם', { bold: true, size: 28, color: '0b0b26', heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 } }));
      for (const { name, total, pct } of rep.byPayer) {
        exp.push(para(`${name} — ${ils(total)} (${pct}%)`, { size: 24, color: '0b0b26' }));
      }
      exp.push(spacer());
    }

    // Original-currency totals
    if (rep.hasForeign) {
      exp.push(para('סכומים לפי מטבע מקורי', { bold: true, size: 28, color: '0b0b26', heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 } }));
      for (const c of rep.byCurrency) {
        exp.push(para(`${c.name} (${c.code}): ${fmtNum(c.total)} ${c.code}`, { size: 24, color: '0b0b26' }));
      }
      exp.push(spacer());
    }

    // Full itemized table
    exp.push(para('פירוט כל ההוצאות', { bold: true, size: 28, color: '0b0b26', heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 } }));
    exp.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE }, bidi: true,
      rows: [
        new TableRow({ tableHeader: true, children: [
          expCell('תאריך', { isHeader: true, widthPct: 13 }),
          expCell('קטגוריה', { isHeader: true, widthPct: 18 }),
          expCell('פירוט', { isHeader: true, widthPct: 31 }),
          expCell('סכום מקורי', { isHeader: true, widthPct: 19 }),
          expCell('בשקלים', { isHeader: true, widthPct: 19 }),
        ]}),
        ...rep.items.map((it, i) => new TableRow({ children: [
          expCell(it.date, { widthPct: 13, fill: i % 2 ? 'F0FDF4' : undefined }),
          expCell(it.category, { widthPct: 18, fill: i % 2 ? 'F0FDF4' : undefined }),
          expCell(it.description || it.place || '', { widthPct: 31, fill: i % 2 ? 'F0FDF4' : undefined }),
          expCell(`${fmtNum(it.amount)} ${it.currency}`, { widthPct: 19, fill: i % 2 ? 'F0FDF4' : undefined }),
          expCell(ils(it.ils), { widthPct: 19, color: '059669', bold: true, fill: i % 2 ? 'F0FDF4' : undefined }),
        ]})),
        new TableRow({ children: [
          expCell('סה"כ', { widthPct: 13, bold: true, fill: 'D1FAE5' }),
          expCell('', { widthPct: 18, fill: 'D1FAE5' }),
          expCell('', { widthPct: 31, fill: 'D1FAE5' }),
          expCell('', { widthPct: 19, fill: 'D1FAE5' }),
          expCell(ils(rep.ilsTotal), { widthPct: 19, color: '065f46', bold: true, fill: 'D1FAE5' }),
        ]}),
      ],
    }));

    sections.push({
      properties: {
        bidi: true,
        page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } },
      },
      children: exp,
    });
  }

  const documentInstance = new Document({
    creator: 'Flights Assistant',
    title: trip?.name || 'Trip',
    styles: {
      default: {
        document: {
          run: { font: 'David', rightToLeft: true, size: 24 },
          paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT },
        },
      },
      paragraphStyles: [
        { id: 'Title',    name: 'Title',    basedOn: 'Normal', next: 'Normal', run: { font: 'David', bold: true, size: 52, color: '0b0b26', rightToLeft: true }, paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 240 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { font: 'David', bold: true, size: 36, color: '4f46e5', rightToLeft: true }, paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { before: 240, after: 160 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { font: 'David', bold: true, size: 28, color: '0b0b26', rightToLeft: true }, paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { before: 200, after: 100 } } },
      ],
    },
    sections,
  });
  const blob = await Packer.toBlob(documentInstance);
  await saveFile(blob, `${safeFileName(trip?.name || 'trip')}_${SCOPE_LABEL[scope] || scope}.docx`);
}

// ──────────────────────────────────────────────────────────────────────
// EXCEL (.xlsx) — with header formatting (font, fill, borders)
// ──────────────────────────────────────────────────────────────────────

// Apply consistent style ranges to a worksheet.
function styleSheet(ws, { headerRows = [0], titleRows = [], divRows = [], colCount = 1 }) {
  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 13, name: 'David' },
    fill: { patternType: 'solid', fgColor: { rgb: 'FF4F46E5' } },
    alignment: { horizontal: 'right', vertical: 'center', readingOrder: 2 },
    border: {
      top:    { style: 'thin', color: { rgb: 'FF312E81' } },
      bottom: { style: 'thin', color: { rgb: 'FF312E81' } },
      left:   { style: 'thin', color: { rgb: 'FF312E81' } },
      right:  { style: 'thin', color: { rgb: 'FF312E81' } },
    },
  };
  const titleStyle = {
    font: { bold: true, color: { rgb: 'FF0B0B26' }, sz: 14, name: 'David' },
    fill: { patternType: 'solid', fgColor: { rgb: 'FFEEF2FF' } },
    alignment: { horizontal: 'right', vertical: 'center', readingOrder: 2 },
  };
  const divStyle = {
    font: { bold: true, color: { rgb: 'FF4F46E5' }, sz: 12, name: 'David' },
    fill: { patternType: 'solid', fgColor: { rgb: 'FFF1F5F9' } },
    alignment: { horizontal: 'right', vertical: 'center', readingOrder: 2 },
  };
  const bodyStyle = {
    font: { name: 'David', sz: 12, color: { rgb: 'FF0B0B26' } },
    alignment: { horizontal: 'right', vertical: 'center', wrapText: true, readingOrder: 2 },
  };
  const setRowStyle = (r, st) => {
    for (let c = 0; c < colCount; c++) {
      const ref = encodeCell(c, r);
      if (!ws[ref]) ws[ref] = { v: '', t: 's' };
      ws[ref].s = st;
    }
  };
  // Determine sheet range
  const range = ws['!ref'] ? decodeRange(ws['!ref']) : { s: { c: 0, r: 0 }, e: { c: colCount - 1, r: 0 } };
  for (let r = range.s.r; r <= range.e.r; r++) {
    if (headerRows.includes(r))      setRowStyle(r, headerStyle);
    else if (titleRows.includes(r))  setRowStyle(r, titleStyle);
    else if (divRows.includes(r))    setRowStyle(r, divStyle);
    else                              setRowStyle(r, bodyStyle);
  }
  // Frozen header row
  ws['!freeze'] = { xSplit: 0, ySplit: headerRows.length };
}

// Small helpers compatible with SheetJS encode/decode
function encodeCell(c, r) {
  let s = '';
  let n = c;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s + (r + 1);
}
function decodeRange(ref) {
  const [from, to] = ref.split(':');
  const decode = (a) => {
    const m = a.match(/^([A-Z]+)(\d+)$/);
    let c = 0;
    for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
    return { c: c - 1, r: parseInt(m[2], 10) - 1 };
  };
  return { s: decode(from), e: decode(to || from) };
}

export async function exportTripXlsx(data, scope = 'all') {
  const { trip, planning, days, checklist, info, expenses = [], rates, memberProfiles, memberCount = 1 } = data;
  const SS = SCOPE[scope] || SCOPE.all;
  const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Flights Assistant';
  wb.created = new Date();
  wb.title = trip?.name || 'Trip';

  // Reusable cell-style helpers (real ExcelJS styling — survives in Excel)
  const FONT = { name: 'Calibri' };
  const stylesPalette = {
    title: {
      font: { ...FONT, name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } },
      alignment: { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' },
      border: { bottom: { style: 'medium', color: { argb: 'FF312E81' } } },
    },
    header: {
      font: { ...FONT, size: 13, bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } },
      alignment: { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' },
      border: {
        top:    { style: 'thin', color: { argb: 'FF4F46E5' } },
        bottom: { style: 'thin', color: { argb: 'FF4F46E5' } },
        left:   { style: 'thin', color: { argb: 'FF4F46E5' } },
        right:  { style: 'thin', color: { argb: 'FF4F46E5' } },
      },
    },
    subHeader: {
      font: { ...FONT, size: 13, bold: true, color: { argb: 'FF312E81' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } },
      alignment: { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' },
    },
    label: {
      font: { ...FONT, size: 12, bold: true, color: { argb: 'FF0B0B26' } },
      alignment: { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' },
    },
    body: {
      font: { ...FONT, size: 12, color: { argb: 'FF1F2937' } },
      alignment: { horizontal: 'right', vertical: 'middle', wrapText: true, readingOrder: 'rtl' },
    },
    bodyAlt: {
      font: { ...FONT, size: 12, color: { argb: 'FF1F2937' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } },
      alignment: { horizontal: 'right', vertical: 'middle', wrapText: true, readingOrder: 'rtl' },
    },
    link: {
      font: { ...FONT, size: 12, color: { argb: 'FF4F46E5' }, underline: true },
      alignment: { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' },
    },
  };

  // Workbook-level RTL view
  wb.views = [{ activeTab: 0 }];

  const applyRowStyle = (row, style) => { row.eachCell({ includeEmpty: true }, cell => { cell.style = { ...cell.style, ...style }; }); };
  const applyCellStyle = (cell, style) => { cell.style = { ...cell.style, ...style }; };

  const addSheet = (name, opts = {}) => {
    const ws = wb.addWorksheet(name.slice(0, 30), {
      views: [{ rightToLeft: true, showGridLines: opts.gridlines !== false }],
      pageSetup: { orientation: 'portrait', paperSize: 9 /* A4 */, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    });
    if (opts.cols) ws.columns = opts.cols.map(w => ({ width: w }));
    return ws;
  };

  // ── Summary sheet ──
  if (SS.flight) {
    const ws = addSheet('סיכום', { cols: [32, 60] });

    // Title banner
    ws.mergeCells('A1:B1');
    const titleCell = ws.getCell('A1');
    titleCell.value = trip?.name || 'הטיול שלי';
    applyCellStyle(titleCell, stylesPalette.title);
    ws.getRow(1).height = 32;

    // Trip metadata
    const meta = [
      ['יעד', trip?.destination || ''],
      ['תאריכים', trip?.dates || ''],
    ];
    let r = 3;
    for (const [label, val] of meta) {
      ws.getCell(`A${r}`).value = label;
      ws.getCell(`B${r}`).value = val;
      applyCellStyle(ws.getCell(`A${r}`), stylesPalette.label);
      applyCellStyle(ws.getCell(`B${r}`), stylesPalette.body);
      r++;
    }

    const section = (title, pairs) => {
      r++;
      ws.mergeCells(`A${r}:B${r}`);
      const head = ws.getCell(`A${r}`);
      head.value = title;
      applyCellStyle(head, stylesPalette.subHeader);
      ws.getRow(r).height = 24;
      r++;
      let alt = false;
      for (const [label, val] of pairs) {
        if (val === '' || val == null) continue;
        ws.getCell(`A${r}`).value = label;
        ws.getCell(`B${r}`).value = val;
        applyCellStyle(ws.getCell(`A${r}`), stylesPalette.label);
        applyCellStyle(ws.getCell(`B${r}`), alt ? stylesPalette.bodyAlt : stylesPalette.body);
        alt = !alt;
        r++;
      }
    };

    section('טיסת הלוך', [
      ['מספר טיסה', trip?.outboundFlightDetails?.flightNumber || ''],
      ['חברת תעופה', trip?.outboundFlightDetails?.airline || ''],
      ['ממוצא', trip?.outboundFlightDetails?.depAirport?.code || ''],
      ['ליעד', trip?.outboundFlightDetails?.arrAirport?.code || ''],
      ['תאריך', trip?.outboundFlightDetails?.date || ''],
      ['המראה', trip?.outboundFlightDetails?.scheduledDep || ''],
      ['נחיתה', trip?.outboundFlightDetails?.scheduledArr || ''],
      ['שער', trip?.outboundFlightDetails?.gate || ''],
    ]);
    section('טיסת חזור', [
      ['מספר טיסה', trip?.returnFlightDetails?.flightNumber || ''],
      ['חברת תעופה', trip?.returnFlightDetails?.airline || ''],
      ['ממוצא', trip?.returnFlightDetails?.depAirport?.code || ''],
      ['ליעד', trip?.returnFlightDetails?.arrAirport?.code || ''],
      ['תאריך', trip?.returnFlightDetails?.date || ''],
      ['המראה', trip?.returnFlightDetails?.scheduledDep || ''],
      ['נחיתה', trip?.returnFlightDetails?.scheduledArr || ''],
      ['שער', trip?.returnFlightDetails?.gate || ''],
    ]);
    section('מלון', [
      ['שם המלון', trip?.hotelDetails?.name || ''],
      ['כתובת', trip?.hotelDetails?.address || ''],
      ['קישור', trip?.hotelDetails?.link || ''],
      ['כניסה', formatHotelDateTime(trip?.hotelDetails?.checkIn)],
      ['יציאה', formatHotelDateTime(trip?.hotelDetails?.checkOut)],
      ['חדר', trip?.hotelDetails?.roomNumber || ''],
      ['הערות', trip?.hotelDetails?.notes || ''],
    ]);
  }

  // Helper for table-style sheets: header row + alternating body rows
  const addTableSheet = (sheetName, headers, rows, cols) => {
    const ws = addSheet(sheetName, { cols });
    // Header row
    ws.addRow(headers);
    applyRowStyle(ws.getRow(1), stylesPalette.header);
    ws.getRow(1).height = 26;
    // Body rows with alternating fill
    rows.forEach((row, i) => {
      ws.addRow(row);
      applyRowStyle(ws.getRow(i + 2), i % 2 === 0 ? stylesPalette.body : stylesPalette.bodyAlt);
      ws.getRow(i + 2).height = 22;
    });
    // Freeze header
    ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  };

  // ── Planning sheets — one tab per category ──
  if (SS.planning && planning.length > 0) {
    const PLAN_COLS   = ['שם', 'תיאור', 'כתובת', 'קישורים', 'נצפה?'];
    const PLAN_WIDTHS = [32, 50, 36, 40, 10];
    const planGroups  = groupByCategory(planning);

    for (const [cat, items] of Object.entries(planGroups)) {
      const ws = addSheet(safeSheetName(cat), { cols: PLAN_WIDTHS });

      ws.addRow(PLAN_COLS);
      applyRowStyle(ws.getRow(1), stylesPalette.header);
      ws.getRow(1).height = 26;
      ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: PLAN_COLS.length } };

      items.forEach((p, i) => {
        const links = Array.isArray(p.links) && p.links.length
          ? p.links.map(l => l.url).filter(Boolean).join(' | ')
          : '';
        ws.addRow([p.title || '', p.description || '', p.address || '', links, p.visited ? '✓' : '']);
        applyRowStyle(ws.getRow(i + 2), i % 2 === 0 ? stylesPalette.body : stylesPalette.bodyAlt);
        ws.getRow(i + 2).height = 22;
      });
    }
  }

  // ── One sheet per day ──
  if (SS.days) {
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const rows = (day.activities || []).map(a => [
        a.timeLabel || '', a.title || '', a.category || '', a.description || '', a.address || '',
      ]);
      addTableSheet(day.title || `יום ${i + 1}`, ['תיוג זמן', 'כותרת', 'קטגוריה', 'הערות', 'כתובת'], rows, [14, 32, 22, 50, 36]);
    }
  }

  // ── Checklist sheet ──
  if (SS.checklist && checklist?.length > 0) {
    const rows = checklist.map(item => [item.category || '', item.text || '', item.completed ? '✓' : '']);
    addTableSheet("צ'קליסט", ['קטגוריה', 'פריט', 'הושלם?'], rows, [22, 50, 12]);
  }

  // ── Info sheet ──
  if (SS.info && info?.length > 0) {
    const typeLabel = { phone: 'טלפון', address: 'כתובת', url: 'קישור', text: 'טקסט' };
    const rows = info.map(item => [item.category || '', item.title || '', typeLabel[item.type] || 'טקסט', item.value || '']);
    addTableSheet('מידע חשוב', ['קטגוריה', 'כותרת', 'סוג', 'ערך'], rows, [22, 32, 14, 50]);
  }

  // ── Expenses: summary + detail sheets ──
  if (SS.expenses && expenses?.length > 0) {
    const rep = computeExpenseReport(expenses, rates, memberProfiles, memberCount, planning);
    const colLetter = (i) => String.fromCharCode(65 + i);

    // Summary sheet
    const ws = addSheet('סיכום הוצאות', { cols: [34, 24, 14] });
    let r = 1;
    ws.mergeCells(`A${r}:C${r}`);
    const titleCell = ws.getCell(`A${r}`);
    titleCell.value = 'דוח הוצאות';
    applyCellStyle(titleCell, stylesPalette.title);
    ws.getRow(r).height = 30;
    r += 2;

    const expSection = (title) => {
      ws.mergeCells(`A${r}:C${r}`);
      const h = ws.getCell(`A${r}`);
      h.value = title;
      applyCellStyle(h, stylesPalette.subHeader);
      ws.getRow(r).height = 24;
      r++;
    };
    const expHeaderRow = (cells) => {
      cells.forEach((c, i) => {
        const cell = ws.getCell(`${colLetter(i)}${r}`);
        cell.value = c;
        applyCellStyle(cell, stylesPalette.header);
      });
      ws.getRow(r).height = 22;
      r++;
    };
    const expRow = (cells, alt, fmts = {}) => {
      cells.forEach((c, i) => {
        const cell = ws.getCell(`${colLetter(i)}${r}`);
        cell.value = c;
        applyCellStyle(cell, alt ? stylesPalette.bodyAlt : stylesPalette.body);
        if (fmts[i]) cell.numFmt = fmts[i];
      });
      r++;
    };
    const kv = (label, val, numFmt) => {
      ws.getCell(`A${r}`).value = label;
      applyCellStyle(ws.getCell(`A${r}`), stylesPalette.label);
      const c = ws.getCell(`B${r}`);
      c.value = val;
      applyCellStyle(c, stylesPalette.body);
      if (numFmt) c.numFmt = numFmt;
      r++;
    };

    // Headline figures
    kv('סך כל ההוצאות', Math.round(rep.ilsTotal), '₪#,##0');
    if (rep.perPerson != null) kv(`עלות לאדם (÷${rep.memberCount})`, Math.round(rep.perPerson), '₪#,##0');
    if (rep.daily) kv(`ממוצע יומי (${rep.daily.days} ימים)`, Math.round(rep.daily.avg), '₪#,##0');
    kv('מספר רשומות', rep.count);
    r++;

    // Category breakdown
    if (rep.byCategory.length > 0) {
      expSection('התפלגות לפי קטגוריה');
      expHeaderRow(['קטגוריה', 'סכום (₪)', 'אחוז']);
      rep.byCategory.forEach((c, i) => expRow([c.cat, Math.round(c.total), c.pct / 100], i % 2 === 1, { 1: '₪#,##0', 2: '0%' }));
      r++;
    }

    // Per-payer
    if (rep.byPayer.length > 0 && expenses.some(e => e.paidBy)) {
      expSection('מי שילם');
      expHeaderRow(['משתתף', 'סכום (₪)', 'אחוז']);
      rep.byPayer.forEach((p, i) => expRow([p.name, Math.round(p.total), p.pct / 100], i % 2 === 1, { 1: '₪#,##0', 2: '0%' }));
      r++;
    }

    // Original-currency totals
    if (rep.hasForeign) {
      expSection('סכומים לפי מטבע מקורי');
      expHeaderRow(['מטבע', 'קוד', 'סכום']);
      rep.byCurrency.forEach((c, i) => expRow([c.name, c.code, c.total], i % 2 === 1, { 2: '#,##0.00' }));
    }

    // Detail sheet
    const ds = addSheet('פירוט הוצאות', { cols: [14, 20, 34, 15, 9, 16, 22] });
    ds.addRow(['תאריך', 'קטגוריה', 'פירוט', 'סכום מקורי', 'מטבע', 'בשקלים', 'שילם/ה']);
    applyRowStyle(ds.getRow(1), stylesPalette.header);
    ds.getRow(1).height = 26;
    ds.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];
    ds.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };
    rep.items.forEach((it, i) => {
      const row = ds.addRow([
        it.date, it.category, it.description || it.place || '',
        it.amount, it.currency, Math.round(it.ils), it.payer,
      ]);
      applyRowStyle(row, i % 2 === 0 ? stylesPalette.body : stylesPalette.bodyAlt);
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(6).numFmt = '₪#,##0';
      row.height = 22;
    });
    const totalRow = ds.addRow(['סה"כ', '', '', '', '', Math.round(rep.ilsTotal), '']);
    applyRowStyle(totalRow, stylesPalette.subHeader);
    totalRow.getCell(6).numFmt = '₪#,##0';
    totalRow.height = 24;
  }

  const buf = await wb.xlsx.writeBuffer();
  await saveFile(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                 `${safeFileName(trip?.name || 'trip')}_${SCOPE_LABEL[scope] || scope}.xlsx`);
}
