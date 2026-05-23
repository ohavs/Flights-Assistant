import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, FileSpreadsheet, FileType2, Loader2 } from 'lucide-react';
import { loadTripExportData, exportTripPdf, exportTripDocx, exportTripXlsx } from '../services/exportTrip';

// Single-button trip export menu. Loads the planning + days data once
// and then offers PDF / Word / Excel downloads. Each format renders
// the same content: trip summary, planning grouped by category, and
// each day on its own page (or its own sheet for Excel).

export default function ExportMenu({ tripId, trip }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null); // 'pdf' | 'docx' | 'xlsx' | null
  const [popupRect, setPopupRect] = useState(null);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      setPopupRect({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 240) });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popupRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const run = async (kind) => {
    if (busy) return;
    setBusy(kind);
    try {
      const data = await loadTripExportData(tripId, trip);
      if (kind === 'pdf')  await exportTripPdf(data);
      if (kind === 'docx') await exportTripDocx(data);
      if (kind === 'xlsx') await exportTripXlsx(data);
      setOpen(false);
    } catch (err) {
      console.error('Export failed:', err);
      alert('ייצוא הקובץ נכשל: ' + (err?.message || err));
    } finally {
      setBusy(null);
    }
  };

  const items = [
    { kind: 'pdf',  label: 'ייצוא ל-PDF',  icon: <FileType2 size={16} />,        color: 'rgb(220, 38, 38)' },
    { kind: 'docx', label: 'ייצוא ל-Word', icon: <FileText size={16} />,         color: 'rgb(37, 99, 235)' },
    { kind: 'xlsx', label: 'ייצוא ל-Excel', icon: <FileSpreadsheet size={16} />, color: 'rgb(5, 150, 105)' },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        title="ייצוא הטיול"
        style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'rgba(79,70,229,0.1)', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'var(--accent)'
        }}
      >
        <Download size={15} />
      </button>

      {open && popupRect && createPortal(
        <div
          ref={popupRef}
          className="custom-dropdown-popup"
          style={{
            position: 'fixed',
            top: popupRect.top,
            left: popupRect.left,
            width: popupRect.width,
          }}
        >
          <div style={{ padding: '4px 8px 8px', fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', borderBottom: '1px solid rgba(11,11,48,0.06)', marginBottom: 4 }}>
            ייצוא את הטיול
          </div>
          {items.map(it => (
            <button
              key={it.kind}
              type="button"
              onClick={() => run(it.kind)}
              disabled={busy !== null}
              className="custom-dropdown-option"
              style={{ opacity: busy && busy !== it.kind ? 0.5 : 1 }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', color: it.color }}>
                {busy === it.kind ? <Loader2 size={16} className="spinning" /> : it.icon}
              </span>
              <span style={{ flex: 1, textAlign: 'right' }}>{it.label}</span>
            </button>
          ))}
          <div style={{ padding: '8px 10px 4px', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            כולל סיכום טיסה+מלון, תכנון הטיול, וכל יום בדף נפרד.
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
