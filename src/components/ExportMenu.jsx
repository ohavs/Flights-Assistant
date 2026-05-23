import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, FileSpreadsheet, FileType2, Loader2, Plane, Compass, ClipboardList, Layers } from 'lucide-react';
import { loadTripExportData, exportTripPdf, exportTripDocx, exportTripXlsx } from '../services/exportTrip';

// Export menu: pick a scope (current tab / all), then a format.
// `activeTab` is the currently visible app tab (flight | planning | checklist),
// passed in by App.jsx so the "current tab" radio defaults sensibly.

export default function ExportMenu({ tripId, trip, activeTab }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null); // 'pdf' | 'docx' | 'xlsx' | null
  const [scope, setScope] = useState('all'); // 'flight' | 'planning' | 'checklist' | 'all'
  const [popupRect, setPopupRect] = useState(null);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  // Default the scope chip to the currently-viewed tab when the menu opens
  useEffect(() => {
    if (open) setScope(activeTab || 'all');
  }, [open, activeTab]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      setPopupRect({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 300) });
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
      if (kind === 'pdf')  await exportTripPdf(data, scope);
      if (kind === 'docx') await exportTripDocx(data, scope);
      if (kind === 'xlsx') await exportTripXlsx(data, scope);
      setOpen(false);
    } catch (err) {
      console.error('Export failed:', err);
      alert('ייצוא הקובץ נכשל: ' + (err?.message || err));
    } finally {
      setBusy(null);
    }
  };

  const scopes = [
    { key: 'flight',    label: 'טיסה ומלון',   icon: <Plane size={14} /> },
    { key: 'planning',  label: 'תכנון הטיול',  icon: <Compass size={14} /> },
    { key: 'checklist', label: "צ'קליסט",      icon: <ClipboardList size={14} /> },
    { key: 'all',       label: 'הכל ביחד',      icon: <Layers size={14} /> },
  ];

  const formats = [
    { kind: 'pdf',  label: 'PDF',   icon: <FileType2 size={16} />,        color: 'rgb(220, 38, 38)' },
    { kind: 'docx', label: 'Word',  icon: <FileText size={16} />,         color: 'rgb(37, 99, 235)' },
    { kind: 'xlsx', label: 'Excel', icon: <FileSpreadsheet size={16} />, color: 'rgb(5, 150, 105)' },
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
            maxHeight: '70vh',
            padding: 10,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', paddingBottom: 6 }}>
            מה לכלול בייצוא?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            {scopes.map(s => {
              const active = scope === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setScope(s.key)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                    gap: 6,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: active ? '1.5px solid var(--accent)' : '1.5px solid rgba(11,11,48,0.08)',
                    background: active ? 'rgba(79,70,229,0.08)' : '#fff',
                    color: active ? 'var(--accent)' : 'var(--primary)',
                    fontSize: 12, fontWeight: 800,
                    cursor: 'pointer', fontFamily: 'var(--font-hebrew)'
                  }}
                >
                  {s.icon}
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', paddingBottom: 4 }}>
            פורמט:
          </div>
          {formats.map(it => (
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
              <span style={{ flex: 1, textAlign: 'right' }}>ייצוא ל-{it.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
