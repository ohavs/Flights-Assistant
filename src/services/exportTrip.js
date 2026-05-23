// Trip export to PDF / Word / Excel — Hebrew, RTL.
// Heavy libraries are dynamic-imported so they don't bloat the main bundle.

import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

// ──────────────────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────────────────

export async function loadTripExportData(tripId, trip) {
  const planningSnap = await getDocs(collection(db, 'trips', tripId, 'planning'));
  const planning = planningSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const daysSnap = await getDocs(collection(db, 'trips', tripId, 'days'));
  const days = daysSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const checklistSnap = await getDocs(collection(db, 'trips', tripId, 'checklist'));
  const checklist = checklistSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  return { trip, planning, days, checklist };
}

function safeFileName(name) {
  return String(name || 'trip')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
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

// ──────────────────────────────────────────────────────────────────────
// PDF — uses bidi-js for proper Unicode BIDI ordering so Hebrew runs
// flow right-to-left while Latin/digit runs stay left-to-right.
// ──────────────────────────────────────────────────────────────────────

let hebrewFontPromise = null;
async function loadHebrewFont() {
  if (hebrewFontPromise) return hebrewFontPromise;
  hebrewFontPromise = (async () => {
    const res = await fetch('/fonts/NotoSansHebrew.ttf');
    if (!res.ok) throw new Error('Failed to load Hebrew font');
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  })();
  return hebrewFontPromise;
}

// Re-orders a logical-order string into visual order using the Unicode
// BIDI algorithm (paragraph base direction = RTL). This is what jsPDF
// needs since it just draws characters left-to-right.
let bidiInstance = null;
async function getBidi() {
  if (!bidiInstance) {
    const mod = await import('bidi-js');
    const factory = mod.default || mod;
    bidiInstance = factory();
  }
  return bidiInstance;
}
function shapeBidi(bidi, text) {
  if (!text) return '';
  const s = String(text);
  const embeddingLevels = bidi.getEmbeddingLevels(s, 'rtl');
  return bidi.getReorderedString(s, embeddingLevels);
}

export async function exportTripPdf({ trip, planning, days, checklist }) {
  const { jsPDF } = await import('jspdf');
  const [fontBase64, bidi] = await Promise.all([loadHebrewFont(), getBidi()]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.addFileToVFS('NotoSansHebrew.ttf', fontBase64);
  doc.addFont('NotoSansHebrew.ttf', 'NotoSansHebrew', 'normal');
  doc.setFont('NotoSansHebrew');

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const rightX = pageW - margin;
  let y = margin;

  const shape = (t) => shapeBidi(bidi, t);

  const ensureSpace = (h = 16) => {
    if (y + h > pageH - margin) { doc.addPage(); y = margin; return true; }
    return false;
  };

  const writeRtl = (text, { size = 11, color = [11, 11, 48], indent = 0 } = {}) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const maxWidth = pageW - margin * 2 - indent;
    const lines = doc.splitTextToSize(String(text), maxWidth);
    for (const line of lines) {
      ensureSpace(size * 1.4);
      doc.text(shape(line), rightX - indent, y, { align: 'right' });
      y += size * 1.4;
    }
  };

  const writeLink = (text, url, { size = 11, indent = 0 } = {}) => {
    if (!url) return writeRtl(text, { size, color: [79, 70, 229], indent });
    doc.setFontSize(size);
    doc.setTextColor(79, 70, 229);
    const maxWidth = pageW - margin * 2 - indent;
    const lines = doc.splitTextToSize(String(text), maxWidth);
    for (const line of lines) {
      ensureSpace(size * 1.4);
      doc.textWithLink(shape(line), rightX - indent, y, { url, align: 'right' });
      y += size * 1.4;
    }
    doc.setTextColor(11, 11, 48);
  };

  const hr = (opacity = 1) => {
    ensureSpace(20);
    doc.setDrawColor(220 * opacity + 255 * (1 - opacity), 220 * opacity + 255 * (1 - opacity), 230 * opacity + 255 * (1 - opacity));
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
  };

  const sectionHeader = (text, accent = false) => {
    ensureSpace(40);
    // Accent bar at the right edge
    doc.setFillColor(79, 70, 229);
    doc.rect(rightX - 4, y - 4, 4, 22, 'F');
    doc.setFontSize(18);
    doc.setTextColor(11, 11, 48);
    doc.text(shape(text), rightX - 12, y + 12, { align: 'right' });
    y += 28;
  };

  const subHeader = (text) => {
    ensureSpace(22);
    doc.setFontSize(13);
    doc.setTextColor(79, 70, 229);
    doc.text(shape(text), rightX, y + 8, { align: 'right' });
    y += 20;
  };

  const titlePage = () => {
    // Trip name as a big centered-right title
    doc.setFontSize(28);
    doc.setTextColor(11, 11, 48);
    doc.text(shape(trip?.name || 'הטיול שלי'), rightX, y + 24, { align: 'right' });
    y += 36;
    if (trip?.destination) {
      doc.setFontSize(15);
      doc.setTextColor(71, 85, 105);
      doc.text(shape(trip.destination), rightX, y + 10, { align: 'right' });
      y += 22;
    }
    if (trip?.dates) {
      doc.setFontSize(13);
      doc.setTextColor(71, 85, 105);
      doc.text(shape(trip.dates), rightX, y + 10, { align: 'right' });
      y += 20;
    }
    y += 10;
    hr();
  };

  // ── 1. Title + flight & hotel summary ──
  titlePage();

  sectionHeader('סיכום טיסה ומלון');
  const ob = trip?.outboundFlightDetails;
  const rt = trip?.returnFlightDetails;
  const ht = trip?.hotelDetails;

  if (ob?.flightNumber) {
    subHeader('טיסת הלוך');
    writeRtl(`${ob.flightNumber}  ${ob.airline || ''}`, { size: 12 });
    writeRtl(`${ob.depAirport?.code || ''} → ${ob.arrAirport?.code || ''}`, { size: 11, color: [71, 85, 105], indent: 12 });
    if (ob.date) writeRtl(`תאריך: ${ob.date}`, { size: 11, color: [71, 85, 105], indent: 12 });
    if (ob.scheduledDep || ob.scheduledArr) writeRtl(`המראה ${ob.scheduledDep || '—'} · נחיתה ${ob.scheduledArr || '—'}`, { size: 11, color: [71, 85, 105], indent: 12 });
    if (ob.gate) writeRtl(`שער: ${ob.gate}`, { size: 11, color: [71, 85, 105], indent: 12 });
    y += 6;
  }
  if (rt?.flightNumber) {
    subHeader('טיסת חזור');
    writeRtl(`${rt.flightNumber}  ${rt.airline || ''}`, { size: 12 });
    writeRtl(`${rt.depAirport?.code || ''} → ${rt.arrAirport?.code || ''}`, { size: 11, color: [71, 85, 105], indent: 12 });
    if (rt.date) writeRtl(`תאריך: ${rt.date}`, { size: 11, color: [71, 85, 105], indent: 12 });
    if (rt.scheduledDep || rt.scheduledArr) writeRtl(`המראה ${rt.scheduledDep || '—'} · נחיתה ${rt.scheduledArr || '—'}`, { size: 11, color: [71, 85, 105], indent: 12 });
    if (rt.gate) writeRtl(`שער: ${rt.gate}`, { size: 11, color: [71, 85, 105], indent: 12 });
    y += 6;
  }
  if (ht?.name) {
    subHeader('מלון');
    writeRtl(ht.name, { size: 12 });
    if (ht.address) writeLink(`📍 ${ht.address}`, `https://maps.google.com/?q=${encodeURIComponent(ht.address)}`, { size: 11, indent: 12 });
    if (ht.link) writeLink(`🔗 ${ht.link}`, ht.link, { size: 11, indent: 12 });
    if (ht.checkIn || ht.checkOut) writeRtl(`כניסה ${formatHotelDateTime(ht.checkIn)} · יציאה ${formatHotelDateTime(ht.checkOut)}`, { size: 11, color: [71, 85, 105], indent: 12 });
    if (ht.roomNumber) writeRtl(`חדר: ${ht.roomNumber}`, { size: 11, color: [71, 85, 105], indent: 12 });
    if (ht.notes) writeRtl(ht.notes, { size: 10, color: [71, 85, 105], indent: 12 });
  }

  // ── 2. Planning pool ──
  if (planning.length > 0) {
    doc.addPage(); y = margin;
    sectionHeader('תכנון הטיול');
    const groups = groupByCategory(planning);
    for (const [cat, items] of Object.entries(groups)) {
      subHeader(cat);
      for (const p of items) {
        ensureSpace(40);
        writeRtl(`• ${p.title}${p.visited ? '  ✓' : ''}`, { size: 12 });
        if (p.description) writeRtl(p.description, { size: 10, color: [71, 85, 105], indent: 14 });
        if (p.price) writeRtl(`מחיר: ${p.price}`, { size: 10, color: [71, 85, 105], indent: 14 });
        if (p.address) writeLink(`📍 ${p.address}`, `https://maps.google.com/?q=${encodeURIComponent(p.address)}`, { size: 10, indent: 14 });
        if (Array.isArray(p.links)) {
          for (const ln of p.links) {
            if (ln?.url) writeLink(`🔗 ${ln.label || ln.url}`, ln.url, { size: 10, indent: 14 });
          }
        }
        y += 6;
      }
      y += 4;
    }
  }

  // ── 3. Daily plan — each day on its own page ──
  if (days.length > 0) {
    for (let i = 0; i < days.length; i++) {
      doc.addPage(); y = margin;
      const day = days[i];
      sectionHeader(day.title || `יום ${i + 1}`);
      const acts = day.activities || [];
      if (acts.length === 0) {
        writeRtl('אין פעילויות מתוכננות', { size: 11, color: [148, 163, 184] });
      } else {
        for (const act of acts) {
          ensureSpace(40);
          const labelPart = act.timeLabel ? `[${act.timeLabel}]  ` : '';
          writeRtl(`• ${labelPart}${act.title}`, { size: 13 });
          if (act.category) writeRtl(act.category, { size: 10, color: [148, 163, 184], indent: 14 });
          if (act.description) writeRtl(act.description, { size: 10, color: [71, 85, 105], indent: 14 });
          if (act.address) writeLink(`📍 ${act.address}`, `https://maps.google.com/?q=${encodeURIComponent(act.address)}`, { size: 10, indent: 14 });
          y += 8;
        }
      }
    }
  }

  // ── 4. Checklist ──
  if (checklist?.length > 0) {
    doc.addPage(); y = margin;
    sectionHeader("צ'קליסט הציוד");
    const groups = groupByCategory(checklist);
    for (const [cat, items] of Object.entries(groups)) {
      subHeader(cat);
      for (const item of items) {
        ensureSpace(18);
        const mark = item.completed ? '☑' : '☐';
        writeRtl(`${mark}  ${item.text}`, { size: 11, indent: 4 });
      }
      y += 6;
    }
  }

  doc.save(`${safeFileName(trip?.name || 'trip')}.pdf`);
}

// ──────────────────────────────────────────────────────────────────────
// WORD (.docx)  — uses docx package with bidirectional paragraphs
// ──────────────────────────────────────────────────────────────────────

export async function exportTripDocx({ trip, planning, days, checklist }) {
  const { Document, Packer, Paragraph, TextRun, ExternalHyperlink, HeadingLevel, AlignmentType } = await import('docx');
  const { saveAs } = await import('file-saver');

  // RTL-aware paragraph helpers.
  const RTL_RUN_OPTS = { rtl: true, font: 'Arial' };
  const para = (text, opts = {}) => {
    const { bold = false, size = 22, color = '0b0b30', heading } = opts;
    return new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      heading,
      spacing: { after: 80 },
      children: [new TextRun({ text: String(text || ''), bold, size, color, ...RTL_RUN_OPTS })],
    });
  };
  const linkPara = (text, url, opts = {}) => {
    const { size = 22 } = opts;
    return new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80 },
      children: [new ExternalHyperlink({
        link: url,
        children: [new TextRun({ text: String(text || ''), color: '4f46e5', underline: {}, size, ...RTL_RUN_OPTS })],
      })],
    });
  };
  const spacer = () => new Paragraph({ children: [new TextRun({ text: '', ...RTL_RUN_OPTS })] });

  const sections = [];

  // ── Section 1: cover + flight + hotel summary ──
  const cover = [];
  cover.push(para(trip?.name || 'הטיול שלי', { bold: true, size: 48, heading: HeadingLevel.TITLE }));
  if (trip?.destination) cover.push(para(trip.destination, { size: 28, color: '475569' }));
  if (trip?.dates)       cover.push(para(trip.dates, { size: 24, color: '475569' }));
  cover.push(spacer());

  cover.push(para('סיכום טיסה ומלון', { bold: true, size: 32, color: '4f46e5', heading: HeadingLevel.HEADING_1 }));
  const ob = trip?.outboundFlightDetails;
  const rt = trip?.returnFlightDetails;
  const ht = trip?.hotelDetails;
  if (ob?.flightNumber) {
    cover.push(para('טיסת הלוך', { bold: true, size: 26, heading: HeadingLevel.HEADING_2 }));
    cover.push(para(`${ob.flightNumber}  ${ob.airline || ''}`, { bold: true, size: 24 }));
    cover.push(para(`${ob.depAirport?.code || ''} → ${ob.arrAirport?.code || ''}`, { color: '475569' }));
    if (ob.date) cover.push(para(`תאריך: ${ob.date}`, { color: '475569' }));
    if (ob.scheduledDep || ob.scheduledArr) cover.push(para(`המראה ${ob.scheduledDep || '—'} · נחיתה ${ob.scheduledArr || '—'}`, { color: '475569' }));
    if (ob.gate) cover.push(para(`שער: ${ob.gate}`, { color: '475569' }));
  }
  if (rt?.flightNumber) {
    cover.push(para('טיסת חזור', { bold: true, size: 26, heading: HeadingLevel.HEADING_2 }));
    cover.push(para(`${rt.flightNumber}  ${rt.airline || ''}`, { bold: true, size: 24 }));
    cover.push(para(`${rt.depAirport?.code || ''} → ${rt.arrAirport?.code || ''}`, { color: '475569' }));
    if (rt.date) cover.push(para(`תאריך: ${rt.date}`, { color: '475569' }));
    if (rt.scheduledDep || rt.scheduledArr) cover.push(para(`המראה ${rt.scheduledDep || '—'} · נחיתה ${rt.scheduledArr || '—'}`, { color: '475569' }));
    if (rt.gate) cover.push(para(`שער: ${rt.gate}`, { color: '475569' }));
  }
  if (ht?.name) {
    cover.push(para('מלון', { bold: true, size: 26, heading: HeadingLevel.HEADING_2 }));
    cover.push(para(ht.name, { bold: true, size: 24 }));
    if (ht.address) cover.push(linkPara(`📍 ${ht.address}`, `https://maps.google.com/?q=${encodeURIComponent(ht.address)}`));
    if (ht.link) cover.push(linkPara(`🔗 ${ht.link}`, ht.link));
    if (ht.checkIn || ht.checkOut) cover.push(para(`כניסה ${formatHotelDateTime(ht.checkIn)} · יציאה ${formatHotelDateTime(ht.checkOut)}`, { color: '475569' }));
    if (ht.roomNumber) cover.push(para(`חדר: ${ht.roomNumber}`, { color: '475569' }));
    if (ht.notes) cover.push(para(ht.notes, { color: '475569' }));
  }

  // ── Section 2: planning grouped by category ──
  if (planning.length > 0) {
    cover.push(spacer());
    cover.push(para('תכנון הטיול', { bold: true, size: 32, color: '4f46e5', heading: HeadingLevel.HEADING_1 }));
    const groups = groupByCategory(planning);
    for (const [cat, items] of Object.entries(groups)) {
      cover.push(para(cat, { bold: true, size: 26, color: '0b0b30', heading: HeadingLevel.HEADING_2 }));
      for (const p of items) {
        cover.push(para(`• ${p.title}${p.visited ? '  ✓' : ''}`, { bold: true, size: 24 }));
        if (p.description) cover.push(para(p.description, { color: '475569' }));
        if (p.price) cover.push(para(`מחיר: ${p.price}`, { color: '475569' }));
        if (p.address) cover.push(linkPara(`📍 ${p.address}`, `https://maps.google.com/?q=${encodeURIComponent(p.address)}`));
        if (Array.isArray(p.links)) {
          for (const ln of p.links) if (ln?.url) cover.push(linkPara(`🔗 ${ln.label || ln.url}`, ln.url));
        }
        cover.push(spacer());
      }
    }
  }

  sections.push({
    properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
    children: cover,
  });

  // ── A separate section per day = new page in Word ──
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const dayChildren = [];
    dayChildren.push(para(day.title || `יום ${i + 1}`, { bold: true, size: 40, color: '0b0b30', heading: HeadingLevel.TITLE }));
    const acts = day.activities || [];
    if (acts.length === 0) {
      dayChildren.push(para('אין פעילויות מתוכננות', { color: '94a3b8' }));
    } else {
      for (const act of acts) {
        const labelPart = act.timeLabel ? `[${act.timeLabel}]  ` : '';
        dayChildren.push(para(`• ${labelPart}${act.title}`, { bold: true, size: 28 }));
        if (act.category) dayChildren.push(para(act.category, { color: '94a3b8' }));
        if (act.description) dayChildren.push(para(act.description, { color: '475569' }));
        if (act.address) dayChildren.push(linkPara(`📍 ${act.address}`, `https://maps.google.com/?q=${encodeURIComponent(act.address)}`));
        dayChildren.push(spacer());
      }
    }
    sections.push({
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children: dayChildren,
    });
  }

  // ── Checklist section ──
  if (checklist?.length > 0) {
    const ck = [];
    ck.push(para("צ'קליסט הציוד", { bold: true, size: 40, color: '0b0b30', heading: HeadingLevel.TITLE }));
    const groups = groupByCategory(checklist);
    for (const [cat, items] of Object.entries(groups)) {
      ck.push(para(cat, { bold: true, size: 26, color: '4f46e5', heading: HeadingLevel.HEADING_2 }));
      for (const item of items) {
        const mark = item.completed ? '☑' : '☐';
        ck.push(para(`${mark}  ${item.text}`, { size: 24 }));
      }
      ck.push(spacer());
    }
    sections.push({
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children: ck,
    });
  }

  const documentInstance = new Document({
    creator: 'Flights Assistant',
    title: trip?.name || 'Trip',
    styles: { default: { document: { run: { font: 'Arial', rightToLeft: true } } } },
    sections,
  });
  const blob = await Packer.toBlob(documentInstance);
  saveAs(blob, `${safeFileName(trip?.name || 'trip')}.docx`);
}

// ──────────────────────────────────────────────────────────────────────
// EXCEL (.xlsx)
// ──────────────────────────────────────────────────────────────────────

export async function exportTripXlsx({ trip, planning, days, checklist }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  wb.Workbook = wb.Workbook || {};
  wb.Workbook.Views = [{ RTL: true }];

  const addSheet = (name, rows, colWidths) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (colWidths) ws['!cols'] = colWidths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 28));
  };

  // 1. Trip summary
  addSheet('סיכום', [
    ['פרט', 'ערך'],
    ['שם הטיול', trip?.name || ''],
    ['יעד', trip?.destination || ''],
    ['תאריכים', trip?.dates || ''],
    [],
    ['── טיסת הלוך ──', ''],
    ['מספר טיסה', trip?.outboundFlightDetails?.flightNumber || ''],
    ['חברת תעופה', trip?.outboundFlightDetails?.airline || ''],
    ['ממוצא', trip?.outboundFlightDetails?.depAirport?.code || ''],
    ['ליעד', trip?.outboundFlightDetails?.arrAirport?.code || ''],
    ['תאריך', trip?.outboundFlightDetails?.date || ''],
    ['המראה', trip?.outboundFlightDetails?.scheduledDep || ''],
    ['נחיתה', trip?.outboundFlightDetails?.scheduledArr || ''],
    ['שער', trip?.outboundFlightDetails?.gate || ''],
    [],
    ['── טיסת חזור ──', ''],
    ['מספר טיסה', trip?.returnFlightDetails?.flightNumber || ''],
    ['חברת תעופה', trip?.returnFlightDetails?.airline || ''],
    ['ממוצא', trip?.returnFlightDetails?.depAirport?.code || ''],
    ['ליעד', trip?.returnFlightDetails?.arrAirport?.code || ''],
    ['תאריך', trip?.returnFlightDetails?.date || ''],
    ['המראה', trip?.returnFlightDetails?.scheduledDep || ''],
    ['נחיתה', trip?.returnFlightDetails?.scheduledArr || ''],
    ['שער', trip?.returnFlightDetails?.gate || ''],
    [],
    ['── מלון ──', ''],
    ['שם המלון', trip?.hotelDetails?.name || ''],
    ['כתובת', trip?.hotelDetails?.address || ''],
    ['קישור', trip?.hotelDetails?.link || ''],
    ['כניסה', formatHotelDateTime(trip?.hotelDetails?.checkIn)],
    ['יציאה', formatHotelDateTime(trip?.hotelDetails?.checkOut)],
    ['חדר', trip?.hotelDetails?.roomNumber || ''],
    ['הערות', trip?.hotelDetails?.notes || ''],
  ], [28, 60]);

  // 2. Planning pool
  if (planning.length > 0) {
    const rows = [['קטגוריה', 'שם', 'תיאור', 'כתובת', 'מחיר', 'קישורים', 'נצפה?']];
    for (const p of planning) {
      const linksText = Array.isArray(p.links) && p.links.length
        ? p.links.map(l => l.url).filter(Boolean).join(' | ')
        : '';
      rows.push([
        p.category || '',
        p.title || '',
        p.description || '',
        p.address || '',
        p.price || '',
        linksText,
        p.visited ? '✓' : '',
      ]);
    }
    addSheet('תכנון', rows, [22, 32, 50, 36, 14, 40, 10]);
  }

  // 3. One sheet per day
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const rows = [['תיוג זמן', 'כותרת', 'קטגוריה', 'הערות', 'כתובת']];
    for (const a of (day.activities || [])) {
      rows.push([
        a.timeLabel || '',
        a.title || '',
        a.category || '',
        a.description || '',
        a.address || '',
      ]);
    }
    addSheet(day.title || `יום ${i + 1}`, rows, [14, 32, 22, 50, 36]);
  }

  // 4. Checklist
  if (checklist?.length > 0) {
    const rows = [['קטגוריה', 'פריט', 'הושלם?']];
    for (const item of checklist) {
      rows.push([item.category || '', item.text || '', item.completed ? '✓' : '']);
    }
    addSheet("צ'קליסט", rows, [22, 50, 12]);
  }

  XLSX.writeFile(wb, `${safeFileName(trip?.name || 'trip')}.xlsx`);
}
