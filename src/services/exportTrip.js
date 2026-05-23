// Trip export to PDF / Word / Excel — all formatted in Hebrew RTL.
// Heavy libraries are dynamically imported so they don't bloat the main
// bundle until the user actually clicks an export button.

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

  return { trip, planning, days };
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

// Group planning items by category
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
// PDF
// ──────────────────────────────────────────────────────────────────────

let hebrewFontPromise = null;
async function loadHebrewFont() {
  if (hebrewFontPromise) return hebrewFontPromise;
  hebrewFontPromise = (async () => {
    const res = await fetch('/fonts/NotoSansHebrew.ttf');
    if (!res.ok) throw new Error('Failed to load Hebrew font');
    const buf = await res.arrayBuffer();
    // Convert to base64 chunked to avoid call-stack overflow on big arrays
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

// jsPDF doesn't shape RTL text. For Hebrew we get correct visual order
// by reversing the characters in each Hebrew word, but English / numbers
// must stay LTR. This tokenises by Unicode script and reverses Hebrew
// runs only.
function shapeRtl(line) {
  const tokens = String(line).split(/(\s+)/);
  const out = [];
  for (const tok of tokens) {
    if (/[֐-׿]/.test(tok)) {
      out.push(tok.split('').reverse().join(''));
    } else {
      out.push(tok);
    }
  }
  // Mirror token order so the line itself reads RTL
  return out.reverse().join('');
}

export async function exportTripPdf({ trip, planning, days }) {
  const { jsPDF } = await import('jspdf');
  const fontBase64 = await loadHebrewFont();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.addFileToVFS('NotoSansHebrew.ttf', fontBase64);
  doc.addFont('NotoSansHebrew.ttf', 'NotoSansHebrew', 'normal');
  doc.setFont('NotoSansHebrew');

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const rightX = pageW - margin;
  let y = margin;

  const writeRtl = (text, { size = 11, bold = false, color = [11, 11, 48], indent = 0 } = {}) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const maxWidth = pageW - margin * 2 - indent;
    const lines = doc.splitTextToSize(String(text), maxWidth);
    for (const line of lines) {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(shapeRtl(line), rightX - indent, y, { align: 'right' });
      y += size * 1.45;
    }
    if (bold) { /* placeholder; single-weight font */ }
  };

  const writeLink = (text, url, { size = 11, indent = 0 } = {}) => {
    if (!url) { writeRtl(text, { size, color: [79, 70, 229], indent }); return; }
    doc.setFontSize(size);
    doc.setTextColor(79, 70, 229);
    const maxWidth = pageW - margin * 2 - indent;
    const lines = doc.splitTextToSize(String(text), maxWidth);
    for (const line of lines) {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.textWithLink(shapeRtl(line), rightX - indent, y, { url, align: 'right' });
      y += size * 1.45;
    }
    doc.setTextColor(11, 11, 48);
  };

  const hr = () => {
    if (y > pageH - margin) { doc.addPage(); y = margin; }
    doc.setDrawColor(220, 220, 230);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 12;
  };

  const heading = (text, level = 1) => {
    y += level === 1 ? 8 : 4;
    writeRtl(text, { size: level === 1 ? 22 : 16, color: [11, 11, 48] });
    if (level === 1) {
      doc.setDrawColor(79, 70, 229);
      doc.setLineWidth(2);
      doc.line(rightX - 60, y - 4, rightX, y - 4);
    }
    y += 4;
  };

  const newPage = () => { doc.addPage(); y = margin; };

  // ── Title page ──
  heading(trip?.name || 'הטיול שלי', 1);
  if (trip?.destination) writeRtl(trip.destination, { size: 14, color: [71, 85, 105] });
  if (trip?.dates)       writeRtl(trip.dates,       { size: 13, color: [71, 85, 105] });
  y += 12;
  hr();

  // ── Flight + hotel summary ──
  const ob = trip?.outboundFlightDetails;
  const rt = trip?.returnFlightDetails;
  const ht = trip?.hotelDetails;
  heading('סיכום טיסה ומלון', 2);
  if (ob?.flightNumber) {
    writeRtl(`טיסת הלוך: ${ob.flightNumber} · ${ob.airline || ''} · ${ob.depAirport?.code || ''} → ${ob.arrAirport?.code || ''}`, { size: 12 });
    if (ob.date) writeRtl(`תאריך: ${ob.date}`, { size: 11, color: [71, 85, 105], indent: 12 });
    if (ob.scheduledDep || ob.scheduledArr) writeRtl(`המראה ${ob.scheduledDep || '—'} · נחיתה ${ob.scheduledArr || '—'}`, { size: 11, color: [71, 85, 105], indent: 12 });
  }
  if (rt?.flightNumber) {
    y += 4;
    writeRtl(`טיסת חזור: ${rt.flightNumber} · ${rt.airline || ''} · ${rt.depAirport?.code || ''} → ${rt.arrAirport?.code || ''}`, { size: 12 });
    if (rt.date) writeRtl(`תאריך: ${rt.date}`, { size: 11, color: [71, 85, 105], indent: 12 });
    if (rt.scheduledDep || rt.scheduledArr) writeRtl(`המראה ${rt.scheduledDep || '—'} · נחיתה ${rt.scheduledArr || '—'}`, { size: 11, color: [71, 85, 105], indent: 12 });
  }
  if (ht?.name) {
    y += 4;
    writeRtl(`מלון: ${ht.name}`, { size: 12 });
    if (ht.address) writeLink(`כתובת: ${ht.address}`, `https://maps.google.com/?q=${encodeURIComponent(ht.address)}`, { size: 11, indent: 12 });
    if (ht.link) writeLink(`קישור: ${ht.link}`, ht.link, { size: 11, indent: 12 });
    if (ht.checkIn || ht.checkOut) writeRtl(`כניסה ${formatHotelDateTime(ht.checkIn)} · יציאה ${formatHotelDateTime(ht.checkOut)}`, { size: 11, color: [71, 85, 105], indent: 12 });
  }
  hr();

  // ── Planning pool, grouped by category ──
  if (planning.length > 0) {
    heading('תכנון הטיול', 1);
    const groups = groupByCategory(planning);
    for (const [cat, items] of Object.entries(groups)) {
      heading(cat, 2);
      for (const p of items) {
        writeRtl(`• ${p.title}${p.visited ? '  ✓' : ''}`, { size: 12 });
        if (p.description) writeRtl(p.description, { size: 10, color: [71, 85, 105], indent: 14 });
        if (p.price) writeRtl(`מחיר: ${p.price}`, { size: 10, color: [71, 85, 105], indent: 14 });
        if (p.address) writeLink(`📍 ${p.address}`, `https://maps.google.com/?q=${encodeURIComponent(p.address)}`, { size: 10, indent: 14 });
        if (Array.isArray(p.links)) {
          for (const ln of p.links) {
            if (ln?.url) writeLink(`🔗 ${ln.label || ln.url}`, ln.url, { size: 10, indent: 14 });
          }
        }
        y += 4;
      }
    }
  }

  // ── Daily plan, each day on its own page ──
  if (days.length > 0) {
    for (let i = 0; i < days.length; i++) {
      newPage();
      const day = days[i];
      heading(day.title || `יום ${i + 1}`, 1);
      const acts = day.activities || [];
      if (acts.length === 0) {
        writeRtl('— אין פעילויות מתוכננות —', { size: 11, color: [148, 163, 184] });
      } else {
        for (const act of acts) {
          const labelPart = act.timeLabel ? `[${act.timeLabel}] ` : '';
          writeRtl(`• ${labelPart}${act.title}`, { size: 13 });
          if (act.category) writeRtl(act.category, { size: 10, color: [148, 163, 184], indent: 14 });
          if (act.description) writeRtl(act.description, { size: 10, color: [71, 85, 105], indent: 14 });
          if (act.address) writeLink(`📍 ${act.address}`, `https://maps.google.com/?q=${encodeURIComponent(act.address)}`, { size: 10, indent: 14 });
          y += 4;
        }
      }
    }
  }

  doc.save(`${safeFileName(trip?.name || 'trip')}.pdf`);
}

// ──────────────────────────────────────────────────────────────────────
// WORD (.docx)
// ──────────────────────────────────────────────────────────────────────

export async function exportTripDocx({ trip, planning, days }) {
  const { Document, Packer, Paragraph, TextRun, ExternalHyperlink, HeadingLevel, AlignmentType, PageBreak } = await import('docx');
  const { saveAs } = await import('file-saver');

  // Helpers
  const para = (text, { bold = false, size = 22, color = '0b0b30', heading } = {}) =>
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      heading,
      children: [new TextRun({ text, bold, size, color, rtl: true })],
    });
  const linkPara = (text, url, { size = 22 } = {}) =>
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      children: [new ExternalHyperlink({
        link: url,
        children: [new TextRun({ text, color: '4f46e5', underline: {}, size, rtl: true })],
      })],
    });

  const sections = [];
  const children = [];

  children.push(para(trip?.name || 'הטיול שלי', { bold: true, size: 40, heading: HeadingLevel.TITLE }));
  if (trip?.destination) children.push(para(trip.destination, { size: 26, color: '475569' }));
  if (trip?.dates)       children.push(para(trip.dates, { size: 22, color: '475569' }));
  children.push(new Paragraph({ children: [] }));

  // Flight + hotel summary
  children.push(para('סיכום טיסה ומלון', { bold: true, size: 30, heading: HeadingLevel.HEADING_1 }));
  const ob = trip?.outboundFlightDetails;
  const rt = trip?.returnFlightDetails;
  const ht = trip?.hotelDetails;
  if (ob?.flightNumber) {
    children.push(para(`טיסת הלוך: ${ob.flightNumber} · ${ob.airline || ''} · ${ob.depAirport?.code || ''} → ${ob.arrAirport?.code || ''}`, { bold: true }));
    if (ob.date) children.push(para(`תאריך: ${ob.date}`, { color: '475569' }));
    if (ob.scheduledDep || ob.scheduledArr) children.push(para(`המראה ${ob.scheduledDep || '—'} · נחיתה ${ob.scheduledArr || '—'}`, { color: '475569' }));
  }
  if (rt?.flightNumber) {
    children.push(para(`טיסת חזור: ${rt.flightNumber} · ${rt.airline || ''} · ${rt.depAirport?.code || ''} → ${rt.arrAirport?.code || ''}`, { bold: true }));
    if (rt.date) children.push(para(`תאריך: ${rt.date}`, { color: '475569' }));
    if (rt.scheduledDep || rt.scheduledArr) children.push(para(`המראה ${rt.scheduledDep || '—'} · נחיתה ${rt.scheduledArr || '—'}`, { color: '475569' }));
  }
  if (ht?.name) {
    children.push(para(`מלון: ${ht.name}`, { bold: true }));
    if (ht.address) children.push(linkPara(`כתובת: ${ht.address}`, `https://maps.google.com/?q=${encodeURIComponent(ht.address)}`));
    if (ht.link) children.push(linkPara(`קישור: ${ht.link}`, ht.link));
    if (ht.checkIn || ht.checkOut) children.push(para(`כניסה ${formatHotelDateTime(ht.checkIn)} · יציאה ${formatHotelDateTime(ht.checkOut)}`, { color: '475569' }));
  }

  // Planning grouped by category
  if (planning.length > 0) {
    children.push(new Paragraph({ children: [] }));
    children.push(para('תכנון הטיול', { bold: true, size: 32, heading: HeadingLevel.HEADING_1 }));
    const groups = groupByCategory(planning);
    for (const [cat, items] of Object.entries(groups)) {
      children.push(para(cat, { bold: true, size: 26, color: '4f46e5', heading: HeadingLevel.HEADING_2 }));
      for (const p of items) {
        children.push(para(`• ${p.title}${p.visited ? '  ✓' : ''}`, { bold: true }));
        if (p.description) children.push(para(p.description, { color: '475569' }));
        if (p.price) children.push(para(`מחיר: ${p.price}`, { color: '475569' }));
        if (p.address) children.push(linkPara(`📍 ${p.address}`, `https://maps.google.com/?q=${encodeURIComponent(p.address)}`));
        if (Array.isArray(p.links)) {
          for (const ln of p.links) if (ln?.url) children.push(linkPara(`🔗 ${ln.label || ln.url}`, ln.url));
        }
        children.push(new Paragraph({ children: [] }));
      }
    }
  }

  sections.push({
    properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
    children,
  });

  // Each day on its own page
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const dayChildren = [];
    dayChildren.push(para(day.title || `יום ${i + 1}`, { bold: true, size: 36, heading: HeadingLevel.TITLE }));
    const acts = day.activities || [];
    if (acts.length === 0) {
      dayChildren.push(para('— אין פעילויות מתוכננות —', { color: '94a3b8' }));
    } else {
      for (const act of acts) {
        const labelPart = act.timeLabel ? `[${act.timeLabel}] ` : '';
        dayChildren.push(para(`• ${labelPart}${act.title}`, { bold: true, size: 26 }));
        if (act.category) dayChildren.push(para(act.category, { color: '94a3b8' }));
        if (act.description) dayChildren.push(para(act.description, { color: '475569' }));
        if (act.address) dayChildren.push(linkPara(`📍 ${act.address}`, `https://maps.google.com/?q=${encodeURIComponent(act.address)}`));
        dayChildren.push(new Paragraph({ children: [] }));
      }
    }
    sections.push({
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children: dayChildren,
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

export async function exportTripXlsx({ trip, planning, days }) {
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();
  wb.Workbook = wb.Workbook || {};
  wb.Workbook.Views = [{ RTL: true }];

  // ── Summary sheet ──
  const summaryRows = [
    ['פרט', 'ערך'],
    ['שם הטיול', trip?.name || ''],
    ['יעד', trip?.destination || ''],
    ['תאריכים', trip?.dates || ''],
    [],
    ['טיסת הלוך', ''],
    ['מספר טיסה', trip?.outboundFlightDetails?.flightNumber || ''],
    ['חברת תעופה', trip?.outboundFlightDetails?.airline || ''],
    ['ממוצא', trip?.outboundFlightDetails?.depAirport?.code || ''],
    ['ליעד', trip?.outboundFlightDetails?.arrAirport?.code || ''],
    ['תאריך', trip?.outboundFlightDetails?.date || ''],
    ['המראה מתוכננת', trip?.outboundFlightDetails?.scheduledDep || ''],
    ['נחיתה מתוכננת', trip?.outboundFlightDetails?.scheduledArr || ''],
    [],
    ['טיסת חזור', ''],
    ['מספר טיסה', trip?.returnFlightDetails?.flightNumber || ''],
    ['חברת תעופה', trip?.returnFlightDetails?.airline || ''],
    ['ממוצא', trip?.returnFlightDetails?.depAirport?.code || ''],
    ['ליעד', trip?.returnFlightDetails?.arrAirport?.code || ''],
    ['תאריך', trip?.returnFlightDetails?.date || ''],
    ['המראה מתוכננת', trip?.returnFlightDetails?.scheduledDep || ''],
    ['נחיתה מתוכננת', trip?.returnFlightDetails?.scheduledArr || ''],
    [],
    ['מלון', ''],
    ['שם המלון', trip?.hotelDetails?.name || ''],
    ['כתובת', trip?.hotelDetails?.address || ''],
    ['קישור', trip?.hotelDetails?.link || ''],
    ['כניסה', formatHotelDateTime(trip?.hotelDetails?.checkIn)],
    ['יציאה', formatHotelDateTime(trip?.hotelDetails?.checkOut)],
    ['חדר', trip?.hotelDetails?.roomNumber || ''],
    ['הערות', trip?.hotelDetails?.notes || ''],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws1['!cols'] = [{ wch: 28 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'סיכום');

  // ── Planning items sheet ──
  if (planning.length > 0) {
    const rows = [['קטגוריה', 'שם', 'תיאור', 'כתובת', 'מחיר', 'קישורים', 'בוקר/נצפה']];
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
    const ws2 = XLSX.utils.aoa_to_sheet(rows);
    ws2['!cols'] = [
      { wch: 22 }, { wch: 32 }, { wch: 50 }, { wch: 36 },
      { wch: 14 }, { wch: 40 }, { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'תכנון');
  }

  // ── One sheet per day ──
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
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 32 }, { wch: 22 }, { wch: 50 }, { wch: 36 }];
    const sheetName = (day.title || `יום ${i + 1}`).slice(0, 28); // Excel limit 31
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, `${safeFileName(trip?.name || 'trip')}.xlsx`);
}
