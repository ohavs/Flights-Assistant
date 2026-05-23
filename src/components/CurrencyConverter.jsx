import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownUp, Coins, ChevronDown, Search, Check, Wifi, WifiOff } from 'lucide-react';
import {
  CURRENCY_META, getInitialRates, refreshRatesIfStale,
  convert, formatAmount
} from '../services/currency';

const QUICK_CODES = ['ILS', 'USD', 'EUR'];

// Searchable currency dropdown rendered via portal (won't get clipped by
// the parent card overflow).
function CurrencyPicker({ value, onChange, exclude }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const gutter = 8;
      const width = Math.max(r.width, 240);
      let left = r.right - width;
      if (left < gutter) left = gutter;
      if (left + width > window.innerWidth - gutter) {
        left = window.innerWidth - width - gutter;
      }
      const spaceBelow = window.innerHeight - r.bottom;
      const openAbove = spaceBelow < 280 && r.top > 280;
      setRect({
        top: openAbove ? undefined : r.bottom + 6,
        bottom: openAbove ? (window.innerHeight - r.top + 6) : undefined,
        left, width,
      });
    };
    update();
    requestAnimationFrame(() => inputRef.current?.focus());
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const click = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popupRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const norm = q.trim().toLowerCase();
    return Object.entries(CURRENCY_META)
      .filter(([code]) => code !== exclude)
      .filter(([code, meta]) =>
        !norm ||
        code.toLowerCase().includes(norm) ||
        meta.name.toLowerCase().includes(norm)
      );
  }, [q, exclude]);

  const current = CURRENCY_META[value];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="custom-dropdown-trigger"
        style={{ gap: 8, paddingInline: 14 }}
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>{current?.flag}</span>
        <span style={{ flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{value}</span>
          <span style={{ fontWeight: 600, color: 'var(--text-muted)', marginRight: 6, fontSize: 12 }}>{current?.name}</span>
        </span>
        <ChevronDown size={16} style={{ color: 'var(--accent)', transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s ease' }} />
      </button>

      {open && rect && createPortal(
        <div
          ref={popupRef}
          className="custom-dropdown-popup"
          style={{ position: 'fixed', ...rect, maxHeight: 320, padding: 8 }}
        >
          <div style={{ position: 'relative', marginBottom: 6 }}>
            <Search size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="חיפוש מטבע…"
              style={{
                width: '100%', minHeight: 36, padding: '6px 32px 6px 10px',
                border: '1px solid rgba(11,11,48,0.12)', borderRadius: 8,
                fontFamily: 'var(--font-hebrew)', fontSize: 13, outline: 'none',
                textAlign: 'right',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 240 }}>
            {filtered.map(([code, meta]) => (
              <button
                key={code}
                type="button"
                onClick={() => { onChange(code); setOpen(false); setQ(''); }}
                className={`custom-dropdown-option ${code === value ? 'active' : ''}`}
              >
                <span style={{ fontSize: 18 }}>{meta.flag}</span>
                <span style={{ flex: 1, textAlign: 'right' }}>
                  <strong style={{ marginLeft: 6 }}>{code}</strong>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: 12 }}>{meta.name}</span>
                </span>
                {code === value && <Check size={14} style={{ color: 'var(--accent)' }} />}
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>
                לא נמצאו מטבעות
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default function CurrencyConverter() {
  const [{ rates, fetchedAt }, setCache] = useState(getInitialRates);
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState('ILS');
  const [to, setTo] = useState('EUR');
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [refreshing, setRefreshing] = useState(false);

  // Refresh rates on mount (and whenever we come back online), but always
  // fall back to whatever's in localStorage.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      setRefreshing(true);
      const r = await refreshRatesIfStale();
      if (!cancelled && r) setCache(r);
      setRefreshing(false);
    };
    refresh();
    const onlineHandler = () => { setOnline(true); refresh(); };
    const offlineHandler = () => setOnline(false);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }, []);

  const result = convert(amount, from, to, rates);
  const reverseRate = convert(1, to, from, rates);
  const directRate = convert(1, from, to, rates);

  const swap = () => { setFrom(to); setTo(from); };

  const fetchedLabel = fetchedAt
    ? new Date(fetchedAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="glass-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'rgba(5, 150, 105, 0.1)', color: 'var(--text-success)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Coins size={18} />
        </div>
        <h4 style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)', margin: 0, flex: 1 }}>
          המרת מטבעות
        </h4>
        <span title={`עודכן: ${fetchedLabel}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontWeight: 800,
          padding: '3px 8px', borderRadius: 999,
          background: online ? 'rgba(5, 150, 105, 0.1)' : 'rgba(245, 158, 11, 0.12)',
          color: online ? 'var(--text-success)' : 'rgb(146, 64, 14)',
        }}>
          {online ? <Wifi size={11} /> : <WifiOff size={11} />}
          {online ? (refreshing ? 'מעדכן…' : 'עדכני') : 'מצב לא מקוון'}
        </span>
      </div>

      {/* Amount input */}
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>סכום להמרה</label>
        <input
          type="number"
          inputMode="decimal"
          className="form-control"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0"
          style={{ fontSize: 18, fontWeight: 800, textAlign: 'right', direction: 'ltr' }}
        />
      </div>

      {/* From / Swap / To */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>מ-</label>
          <CurrencyPicker value={from} onChange={setFrom} exclude={to} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={swap}
            title="החלף בין המטבעות"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '1.5px solid rgba(79, 70, 229, 0.25)',
              background: 'rgba(79, 70, 229, 0.08)',
              color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <ArrowDownUp size={16} />
          </button>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>ל-</label>
          <CurrencyPicker value={to} onChange={setTo} exclude={from} />
        </div>
      </div>

      {/* Result */}
      <div style={{
        marginTop: 4,
        padding: '14px 16px',
        background: 'linear-gradient(135deg, rgba(79,70,229,0.08), rgba(124,58,237,0.08))',
        border: '1px solid rgba(79,70,229,0.18)',
        borderRadius: 14,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 4 }}>
          תוצאה
        </div>
        <div style={{
          fontSize: 26, fontWeight: 900, color: 'var(--primary)',
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px',
          direction: 'ltr', textAlign: 'right',
        }}>
          {formatAmount(result, to)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginTop: 6, direction: 'ltr', textAlign: 'right' }}>
          1 {from} = {Number.isFinite(directRate) ? directRate.toFixed(4) : '—'} {to}   ·   1 {to} = {Number.isFinite(reverseRate) ? reverseRate.toFixed(4) : '—'} {from}
        </div>
      </div>

      {/* Quick switch chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 800, marginLeft: 4, alignSelf: 'center' }}>בחירה מהירה:</span>
        {QUICK_CODES.map(code => (
          <button
            key={code}
            type="button"
            onClick={() => (from === code ? setTo(code) : setFrom(code))}
            style={{
              border: 'none', cursor: 'pointer',
              padding: '4px 10px', borderRadius: 999,
              fontSize: 12, fontWeight: 800,
              background: (from === code || to === code) ? 'var(--primary)' : 'rgba(11,11,48,0.05)',
              color:      (from === code || to === code) ? '#fff' : 'var(--primary)',
            }}
          >
            {CURRENCY_META[code].flag} {code}
          </button>
        ))}
      </div>
    </div>
  );
}
