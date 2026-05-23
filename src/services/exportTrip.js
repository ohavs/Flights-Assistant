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

  const infoSnap = await getDocs(collection(db, 'trips', tripId, 'info'));
  const info = infoSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  return { trip, planning, days, checklist, info };
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

// Scope is one of: 'flight' | 'planning' | 'checklist' | 'all'
// It controls which sections each export includes.
const SCOPE = {
  flight:   { flight: true,  planning: false, days: false, checklist: false, info: false },
  planning: { flight: false, planning: true,  days: true,  checklist: false, info: false },
  checklist:{ flight: false, planning: false, days: false, checklist: true,  info: false },
  info:     { flight: false, planning: false, days: false, checklist: false, info: true  },
  all:      { flight: true,  planning: true,  days: true,  checklist: true,  info: true  },
};

// ──────────────────────────────────────────────────────────────────────
// PDF
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
  return bidi.getReorderedString(s, bidi.getEmbeddingLevels(s, 'rtl'));
}

export async function exportTripPdf(data, scope = 'all') {
  const { trip, planning, days, checklist, info } = data;
  const SS = SCOPE[scope] || SCOPE.all;
  const { jsPDF } = await import('jspdf');
  const [fontBase64, bidi] = await Promise.all([loadHebrewFont(), getBidi()]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.addFileToVFS('NotoSansHebrew.ttf', fontBase64);
  doc.addFont('NotoSansHebrew.ttf', 'NotoSansHebrew', 'normal');
  doc.setFont('NotoSansHebrew');

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 52;
  const rightX = pageW - margin;
  const leftX  = margin;
  const contentW = pageW - margin * 2;
  let y = margin;

  // Key trick: pre-shape with bidi-js AND tell jsPDF the input is already
  // in visual order so its internal bidi engine doesn't double-process.
  const TEXT_OPTS = { align: 'right', isInputVisual: true, isOutputVisual: true };
  const shape = (t) => shapeBidi(bidi, t);

  const ensureSpace = (h = 16) => {
    if (y + h > pageH - margin) { doc.addPage(); y = margin; }
  };

  // Colors — darker than before for readability
  const C_TEXT = [11, 11, 38];          // near-black navy for body text
  const C_MUTED = [55, 65, 81];         // dark gray for secondary
  const C_ACCENT = [79, 70, 229];       // purple
  const C_HEADING = [11, 11, 38];

  const write = (text, { size = 12, color = C_TEXT, indent = 0, bold = false } = {}) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const maxWidth = contentW - indent;
    const lines = doc.splitTextToSize(String(text), maxWidth);
    for (const line of lines) {
      ensureSpace(size * 1.5);
      doc.text(shape(line), rightX - indent, y, { ...TEXT_OPTS });
      y += size * 1.5;
    }
  };

  const writeLink = (text, url, { size = 12, indent = 0 } = {}) => {
    if (!url) return write(text, { size, color: C_ACCENT, indent });
    doc.setFontSize(size);
    doc.setTextColor(...C_ACCENT);
    const maxWidth = contentW - indent;
    const lines = doc.splitTextToSize(String(text), maxWidth);
    for (const line of lines) {
      ensureSpace(size * 1.5);
      doc.textWithLink(shape(line), rightX - indent, y, { url, ...TEXT_OPTS });
      y += size * 1.5;
    }
  };

  // Decorative banner: full-width background + label
  const banner = (label, color = C_ACCENT) => {
    ensureSpace(48);
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(leftX, y, contentW, 32, 'F');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text(shape(label), rightX - 12, y + 22, { ...TEXT_OPTS });
    y += 44;
  };

  const sectionHeader = (label) => {
    ensureSpace(40);
    // Right-edge accent bar
    doc.setFillColor(...C_ACCENT);
    doc.rect(rightX - 4, y - 4, 4, 26, 'F');
    doc.setFontSize(20);
    doc.setTextColor(...C_HEADING);
    doc.text(shape(label), rightX - 14, y + 14, { ...TEXT_OPTS });
    y += 32;
  };

  const subHeader = (label) => {
    ensureSpace(22);
    doc.setFontSize(14);
    doc.setTextColor(...C_ACCENT);
    doc.text(shape(label), rightX, y + 8, { ...TEXT_OPTS });
    y += 22;
  };

  const hr = () => {
    ensureSpace(20);
    doc.setDrawColor(200, 200, 220);
    doc.setLineWidth(0.5);
    doc.line(leftX, y, pageW - margin, y);
    y += 14;
  };

  const newPage = () => { doc.addPage(); y = margin; };

  // ── Cover ──
  doc.setFontSize(30);
  doc.setTextColor(...C_HEADING);
  doc.text(shape(trip?.name || 'הטיול שלי'), rightX, y + 26, { ...TEXT_OPTS });
  y += 40;
  if (trip?.destination) {
    doc.setFontSize(16);
    doc.setTextColor(...C_MUTED);
    doc.text(shape(trip.destination), rightX, y + 10, { ...TEXT_OPTS });
    y += 24;
  }
  if (trip?.dates) {
    doc.setFontSize(14);
    doc.setTextColor(...C_MUTED);
    doc.text(shape(trip.dates), rightX, y + 10, { ...TEXT_OPTS });
    y += 22;
  }
  y += 12;
  hr();

  const ob = trip?.outboundFlightDetails;
  const rt = trip?.returnFlightDetails;
  const ht = trip?.hotelDetails;

  // ── Flight & hotel section ──
  if (SS.flight) {
    banner('טיסה ומלון');
    if (ob?.flightNumber) {
      subHeader('טיסת הלוך');
      write(`${ob.flightNumber}   ${ob.airline || ''}`, { size: 13, bold: true });
      write(`${ob.depAirport?.code || ''} → ${ob.arrAirport?.code || ''}`, { size: 12, indent: 14 });
      if (ob.date) write(`תאריך: ${ob.date}`, { size: 12, color: C_MUTED, indent: 14 });
      if (ob.scheduledDep || ob.scheduledArr) write(`המראה ${ob.scheduledDep || '—'}    נחיתה ${ob.scheduledArr || '—'}`, { size: 12, color: C_MUTED, indent: 14 });
      if (ob.gate) write(`שער: ${ob.gate}`, { size: 12, color: C_MUTED, indent: 14 });
      y += 8;
    }
    if (rt?.flightNumber) {
      subHeader('טיסת חזור');
      write(`${rt.flightNumber}   ${rt.airline || ''}`, { size: 13 });
      write(`${rt.depAirport?.code || ''} → ${rt.arrAirport?.code || ''}`, { size: 12, indent: 14 });
      if (rt.date) write(`תאריך: ${rt.date}`, { size: 12, color: C_MUTED, indent: 14 });
      if (rt.scheduledDep || rt.scheduledArr) write(`המראה ${rt.scheduledDep || '—'}    נחיתה ${rt.scheduledArr || '—'}`, { size: 12, color: C_MUTED, indent: 14 });
      if (rt.gate) write(`שער: ${rt.gate}`, { size: 12, color: C_MUTED, indent: 14 });
      y += 8;
    }
    if (ht?.name) {
      subHeader('מלון');
      write(ht.name, { size: 13 });
      if (ht.address) writeLink(`📍 ${ht.address}`, `https://maps.google.com/?q=${encodeURIComponent(ht.address)}`, { size: 12, indent: 14 });
      if (ht.link) writeLink(`🔗 ${ht.link}`, ht.link, { size: 12, indent: 14 });
      if (ht.checkIn || ht.checkOut) write(`כניסה ${formatHotelDateTime(ht.checkIn)}    יציאה ${formatHotelDateTime(ht.checkOut)}`, { size: 12, color: C_MUTED, indent: 14 });
      if (ht.roomNumber) write(`חדר: ${ht.roomNumber}`, { size: 12, color: C_MUTED, indent: 14 });
      if (ht.notes) write(ht.notes, { size: 11, color: C_MUTED, indent: 14 });
    }
  }

  // ── Planning section ──
  if (SS.planning && planning.length > 0) {
    if (SS.flight) newPage();
    banner('תכנון הטיול');
    const groups = groupByCategory(planning);
    for (const [cat, items] of Object.entries(groups)) {
      subHeader(cat);
      for (const p of items) {
        ensureSpace(60);
        write(`• ${p.title}${p.visited ? '   ✓' : ''}`, { size: 13 });
        if (p.description) write(p.description, { size: 11, color: C_MUTED, indent: 16 });
        if (p.price) write(`מחיר: ${p.price}`, { size: 11, color: C_MUTED, indent: 16 });
        if (p.address) writeLink(`📍 ${p.address}`, `https://maps.google.com/?q=${encodeURIComponent(p.address)}`, { size: 11, indent: 16 });
        if (Array.isArray(p.links)) {
          for (const ln of p.links) {
            if (ln?.url) writeLink(`🔗 ${ln.label || ln.url}`, ln.url, { size: 11, indent: 16 });
          }
        }
        y += 6;
      }
      y += 6;
    }
  }

  // ── Daily plan: each day on its own page ──
  if (SS.days && days.length > 0) {
    for (let i = 0; i < days.length; i++) {
      newPage();
      const day = days[i];
      banner(day.title || `יום ${i + 1}`);
      const acts = day.activities || [];
      if (acts.length === 0) {
        write('אין פעילויות מתוכננות', { size: 12, color: [148, 163, 184] });
      } else {
        for (const act of acts) {
          ensureSpace(60);
          const labelPart = act.timeLabel ? `[${act.timeLabel}]   ` : '';
          write(`• ${labelPart}${act.title}`, { size: 14 });
          if (act.category) write(act.category, { size: 11, color: [148, 163, 184], indent: 16 });
          if (act.description) write(act.description, { size: 11, color: C_MUTED, indent: 16 });
          if (act.address) writeLink(`📍 ${act.address}`, `https://maps.google.com/?q=${encodeURIComponent(act.address)}`, { size: 11, indent: 16 });
          y += 10;
        }
      }
    }
  }

  // ── Checklist ──
  if (SS.checklist && checklist?.length > 0) {
    newPage();
    banner("צ'קליסט ציוד");
    const groups = groupByCategory(checklist);
    for (const [cat, items] of Object.entries(groups)) {
      subHeader(cat);
      for (const item of items) {
        ensureSpace(20);
        const mark = item.completed ? '☑' : '☐';
        write(`${mark}   ${item.text}`, { size: 12, indent: 6 });
      }
      y += 8;
    }
  }

  // ── Important info / emergency contacts ──
  if (SS.info && info?.length > 0) {
    newPage();
    banner('מידע חשוב', [220, 38, 38]);
    const groups = groupByCategory(info);
    for (const [cat, items] of Object.entries(groups)) {
      subHeader(cat);
      for (const item of items) {
        ensureSpace(40);
        write(`• ${item.title}`, { size: 13 });
        if (item.value) {
          if (item.type === 'phone') {
            writeLink(`📞  ${item.value}`, `tel:${String(item.value).replace(/[^0-9+]/g, '')}`, { size: 12, indent: 16 });
          } else if (item.type === 'address') {
            writeLink(`📍 ${item.value}`, `https://maps.google.com/?q=${encodeURIComponent(item.value)}`, { size: 12, indent: 16 });
          } else if (item.type === 'url') {
            const url = /^https?:\/\//i.test(item.value) ? item.value : `https://${item.value}`;
            writeLink(`🔗 ${item.value}`, url, { size: 12, indent: 16 });
          } else {
            write(item.value, { size: 12, color: C_MUTED, indent: 16 });
          }
        }
        y += 4;
      }
      y += 6;
    }
  }

  doc.save(`${safeFileName(trip?.name || 'trip')}_${scope}.pdf`);
}

// ──────────────────────────────────────────────────────────────────────
// WORD (.docx)
// ──────────────────────────────────────────────────────────────────────

export async function exportTripDocx(data, scope = 'all') {
  const { trip, planning, days, checklist, info } = data;
  const SS = SCOPE[scope] || SCOPE.all;
  const { Document, Packer, Paragraph, TextRun, ExternalHyperlink, HeadingLevel, AlignmentType, Footer, Header } = await import('docx');
  const { saveAs } = await import('file-saver');

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
      if (ht.address) main.push(linkPara(`📍 ${ht.address}`, `https://maps.google.com/?q=${encodeURIComponent(ht.address)}`, { size: 22 }));
      if (ht.link) main.push(linkPara(`🔗 ${ht.link}`, ht.link, { size: 22 }));
      if (ht.checkIn || ht.checkOut) main.push(para(`כניסה ${formatHotelDateTime(ht.checkIn)}    יציאה ${formatHotelDateTime(ht.checkOut)}`, { color: '475569' }));
      if (ht.roomNumber) main.push(para(`חדר: ${ht.roomNumber}`, { color: '475569' }));
      if (ht.notes) main.push(para(ht.notes, { color: '475569' }));
    }
    main.push(spacer());
  }

  if (SS.planning && planning.length > 0) {
    main.push(para('תכנון הטיול', { bold: true, size: 36, color: '4f46e5', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 200 } }));
    const groups = groupByCategory(planning);
    for (const [cat, items] of Object.entries(groups)) {
      main.push(para(cat, { bold: true, size: 28, color: '0b0b26', heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 100 } }));
      for (const p of items) {
        main.push(para(`• ${p.title}${p.visited ? '   ✓' : ''}`, { bold: true, size: 26 }));
        if (p.description) main.push(para(p.description, { color: '475569' }));
        if (p.price) main.push(para(`מחיר: ${p.price}`, { color: '475569' }));
        if (p.address) main.push(linkPara(`📍 ${p.address}`, `https://maps.google.com/?q=${encodeURIComponent(p.address)}`));
        if (Array.isArray(p.links)) {
          for (const ln of p.links) if (ln?.url) main.push(linkPara(`🔗 ${ln.label || ln.url}`, ln.url));
        }
        main.push(spacer());
      }
    }
  }

  sections.push({
    properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
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
        dayChildren.push(para('אין פעילויות מתוכננות', { color: '94a3b8' }));
      } else {
        for (const act of acts) {
          const labelPart = act.timeLabel ? `[${act.timeLabel}]   ` : '';
          dayChildren.push(para(`• ${labelPart}${act.title}`, { bold: true, size: 30, heading: HeadingLevel.HEADING_2 }));
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
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
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
            inf.push(linkPara(`📍 ${item.value}`, `https://maps.google.com/?q=${encodeURIComponent(item.value)}`));
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
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children: inf,
    });
  }

  const documentInstance = new Document({
    creator: 'Flights Assistant',
    title: trip?.name || 'Trip',
    styles: {
      default: {
        document: { run: { font: 'David', rightToLeft: true, size: 24 } },
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
  saveAs(blob, `${safeFileName(trip?.name || 'trip')}_${scope}.docx`);
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
  const { trip, planning, days, checklist, info } = data;
  const SS = SCOPE[scope] || SCOPE.all;
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();
  wb.Workbook = wb.Workbook || {};
  wb.Workbook.Views = [{ RTL: true }];

  const addSheet = (name, rows, opts = {}) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (opts.cols) ws['!cols'] = opts.cols.map(w => ({ wch: w }));
    if (opts.merges) ws['!merges'] = opts.merges;
    styleSheet(ws, {
      headerRows: opts.headerRows || [0],
      titleRows: opts.titleRows || [],
      divRows: opts.divRows || [],
      colCount: rows[0]?.length || 1,
    });
    // Adjust default row height for readability
    ws['!rows'] = rows.map((_, i) => ({ hpt: opts.headerRows?.includes(i) ? 24 : 20 }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 30));
  };

  if (SS.flight) {
    const rows = [
      ['פרט', 'ערך'],
      ['שם הטיול', trip?.name || ''],
      ['יעד', trip?.destination || ''],
      ['תאריכים', trip?.dates || ''],
      ['טיסת הלוך', ''],
      ['מספר טיסה', trip?.outboundFlightDetails?.flightNumber || ''],
      ['חברת תעופה', trip?.outboundFlightDetails?.airline || ''],
      ['ממוצא', trip?.outboundFlightDetails?.depAirport?.code || ''],
      ['ליעד', trip?.outboundFlightDetails?.arrAirport?.code || ''],
      ['תאריך', trip?.outboundFlightDetails?.date || ''],
      ['המראה', trip?.outboundFlightDetails?.scheduledDep || ''],
      ['נחיתה', trip?.outboundFlightDetails?.scheduledArr || ''],
      ['שער', trip?.outboundFlightDetails?.gate || ''],
      ['טיסת חזור', ''],
      ['מספר טיסה', trip?.returnFlightDetails?.flightNumber || ''],
      ['חברת תעופה', trip?.returnFlightDetails?.airline || ''],
      ['ממוצא', trip?.returnFlightDetails?.depAirport?.code || ''],
      ['ליעד', trip?.returnFlightDetails?.arrAirport?.code || ''],
      ['תאריך', trip?.returnFlightDetails?.date || ''],
      ['המראה', trip?.returnFlightDetails?.scheduledDep || ''],
      ['נחיתה', trip?.returnFlightDetails?.scheduledArr || ''],
      ['שער', trip?.returnFlightDetails?.gate || ''],
      ['מלון', ''],
      ['שם המלון', trip?.hotelDetails?.name || ''],
      ['כתובת', trip?.hotelDetails?.address || ''],
      ['קישור', trip?.hotelDetails?.link || ''],
      ['כניסה', formatHotelDateTime(trip?.hotelDetails?.checkIn)],
      ['יציאה', formatHotelDateTime(trip?.hotelDetails?.checkOut)],
      ['חדר', trip?.hotelDetails?.roomNumber || ''],
      ['הערות', trip?.hotelDetails?.notes || ''],
    ];
    addSheet('סיכום', rows, {
      cols: [28, 60],
      headerRows: [0],
      titleRows: [4, 13, 22], // "טיסת הלוך", "טיסת חזור", "מלון"
    });
  }

  if (SS.planning && planning.length > 0) {
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
    addSheet('תכנון', rows, { cols: [22, 32, 50, 36, 14, 40, 10] });
  }

  if (SS.days) {
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
      addSheet(day.title || `יום ${i + 1}`, rows, { cols: [14, 32, 22, 50, 36] });
    }
  }

  if (SS.checklist && checklist?.length > 0) {
    const rows = [['קטגוריה', 'פריט', 'הושלם?']];
    for (const item of checklist) {
      rows.push([item.category || '', item.text || '', item.completed ? '✓' : '']);
    }
    addSheet("צ'קליסט", rows, { cols: [22, 50, 12] });
  }

  if (SS.info && info?.length > 0) {
    const typeLabel = {
      phone: 'טלפון', address: 'כתובת', url: 'קישור', text: 'טקסט',
    };
    const rows = [['קטגוריה', 'כותרת', 'סוג', 'ערך']];
    for (const item of info) {
      rows.push([
        item.category || '',
        item.title || '',
        typeLabel[item.type] || 'טקסט',
        item.value || '',
      ]);
    }
    addSheet('מידע חשוב', rows, { cols: [22, 32, 14, 50] });
  }

  XLSX.writeFile(wb, `${safeFileName(trip?.name || 'trip')}_${scope}.xlsx`);
}
