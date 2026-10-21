import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Layers, Star } from 'lucide-react';
import { Pill } from '../ui/kit';
import useBackHandler from '../hooks/useBackHandler';

/* ── The planning pool's category filter ───────────────────────────────────
   A pill that opens a menu of checkboxes: any number of categories, and
   "רק חובה" on top, which combines with them. Nothing checked = every
   category. The menu stays open while picking; "הצג N מקומות", a tap
   outside or the back gesture closes it. Two or more categories are shown
   one section per category, each under its own header (PlanningTab).

   `also`: the list's other filters (search, hide visited), so the footer
   counts what will actually be on screen. The rows count every place.   */

export default function PlanCategoryFilter({
  plans, categories, picked, onPicked, mustOnly, onMustOnly,
  colorOf, iconOf, also = () => true,
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const btn = useRef(null);
  useBackHandler(open, () => setOpen(false));

  const isMust = (p) => p.priority === 'must';
  const used = categories.filter(c => plans.some(p => p.category === c));
  const inPicked = (p) => !picked.length || picked.includes(p.category);
  const mustTotal = plans.filter(isMust).length;
  const mustCount = plans.filter(p => inPicked(p) && isMust(p)).length;
  const countIn = (c) => plans.filter(p => (!c || p.category === c) && (!mustOnly || isMust(p))).length;
  const shown = plans.filter(p => inPicked(p) && (!mustOnly || isMust(p)) && also(p)).length;
  const filtered = picked.length > 0 || mustOnly;

  const toggleCat = (c) => onPicked(picked.includes(c) ? picked.filter(x => x !== c) : [...picked, c]);

  // The pill: the one category in its colour, several as their colour
  // dots and a count, nothing picked as "הכל".
  const one = picked.length === 1 ? picked[0] : null;
  const tint = one ? colorOf(one) : picked.length ? 'var(--accent)' : mustOnly ? 'var(--c-orange)' : null;
  const catsLabel = one || (picked.length ? `${picked.length} קטגוריות` : '');
  const label = [mustOnly && 'חובה', catsLabel].filter(Boolean).join(' · ') || 'הכל';
  const lead = one ? iconOf(one, 15)
    : picked.length ? (
      <span className="plan-filter-dots" aria-hidden="true">
        {picked.slice(0, 3).map(c => <i key={c} style={{ background: colorOf(c) }} />)}
      </span>
    )
    : mustOnly ? <Star size={15} className="star-must" />
    : <Layers size={15} />;

  const toggle = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setRect({ bottom: r.bottom, right: r.right });
    setOpen(v => !v);
  };

  const width = Math.min(300, window.innerWidth - 16);
  const host = document.querySelector('.app-container') || document.body;

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        title="סינון לפי קטגוריה"
        aria-label={`סינון: ${label}`}
        aria-expanded={open}
        className="plan-filter-pill"
        // A filter in effect tints the pill in its colour.
        style={tint ? { background: `color-mix(in srgb, ${tint} 14%, var(--card-bg-solid))` } : undefined}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', color: tint || 'var(--text-muted)', flexShrink: 0 }}>
          {lead}
        </span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <Pill size="sm" tone={tint ? 'neutral' : 'muted'} style={tint ? { background: 'var(--card-bg-solid)' } : undefined}>
          {plans.filter(p => inPicked(p) && (!mustOnly || isMust(p))).length}
        </Pill>
        <ChevronDown size={15} style={{ flexShrink: 0, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
      </button>

      {/* Out of the toolbar: it is backdrop-filtered, and a filtered
          ancestor would offset a position:fixed popup by its own position. */}
      {open && createPortal(
        <>
          <div className="filter-menu-scrim" onClick={() => setOpen(false)} />
          <div
            className="filter-menu"
            role="dialog"
            aria-label="סינון לפי קטגוריה"
            style={{
              top: rect ? rect.bottom + 6 : 120,
              right: rect ? Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - 8 - width)) : 8,
              width,
            }}
          >
            {mustTotal > 0 && (
              <button type="button" role="switch" aria-checked={mustOnly}
                className="filter-menu-row filter-menu-pick" style={{ '--c': 'var(--c-orange)' }}
                onClick={() => onMustOnly(!mustOnly)}>
                <span className="filter-menu-disc"><Star size={14} className="star-must" /></span>
                <span className="filter-menu-label">רק חובה</span>
                <span className="filter-menu-count">{mustCount}</span>
                <span className={`switch${mustOnly ? ' on' : ''}`} aria-hidden="true"><i /></span>
              </button>
            )}

            <div className="filter-menu-title">קטגוריות · אפשר לבחור כמה</div>
            <div role="group" aria-label="קטגוריות">
              <button type="button" role="checkbox" aria-checked={!picked.length}
                className="filter-menu-row filter-menu-pick" onClick={() => onPicked([])}>
                <span className="filter-menu-disc"><Layers size={14} /></span>
                <span className="filter-menu-label">כל הקטגוריות</span>
                <span className="filter-menu-count">{countIn(null)}</span>
                <span className="filter-menu-box" aria-hidden="true">{!picked.length && <Check size={14} strokeWidth={3} />}</span>
              </button>
              {used.map(c => {
                const on = picked.includes(c);
                return (
                  <button key={c} type="button" role="checkbox" aria-checked={on}
                    className="filter-menu-row filter-menu-pick" style={{ '--c': colorOf(c) }}
                    onClick={() => toggleCat(c)}>
                    <span className="filter-menu-disc">{iconOf(c, 14)}</span>
                    <span className="filter-menu-label">{c}</span>
                    <span className="filter-menu-count">{countIn(c)}</span>
                    <span className="filter-menu-box" aria-hidden="true">{on && <Check size={14} strokeWidth={3} />}</span>
                  </button>
                );
              })}
            </div>

            <div className="filter-menu-footer">
              {filtered && (
                <button type="button" className="btn-secondary" onClick={() => { onPicked([]); onMustOnly(false); }}>
                  נקה
                </button>
              )}
              <button type="button" className="btn-primary" onClick={() => setOpen(false)}>
                הצג {shown} מקומות
              </button>
            </div>
          </div>
        </>,
        host
      )}
    </>
  );
}
