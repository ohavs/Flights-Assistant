import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ListFilter, Check } from 'lucide-react';
import useBackHandler from '../hooks/useBackHandler';

/* ── The checklist's one toolbar row ───────────────────────────────────────
   A filter pill on the start side, and how much is packed on the end side:
   one line instead of a progress card plus a row of member chips.

   The pill opens a menu with both filters — a category and a member — and
   they combine ("בגדים" and "Ohav" = Ohav's clothes). The menu stays open
   while picking, so both can be chosen in one go; "הצג N פריטים", a tap
   outside or the back gesture closes it.                                 */

const assigneesOf = (it) => Array.isArray(it.assignedTo) ? it.assignedTo : (it.assignedTo ? [it.assignedTo] : []);

function Ring({ percent }) {
  const C = 2 * Math.PI * 15;
  return (
    <span className="list-progress-ring" aria-hidden="true">
      <svg width={38} height={38} viewBox="0 0 38 38">
        <circle cx={19} cy={19} r={15} fill="none" stroke="var(--ink-8)" strokeWidth={3.5} />
        <circle cx={19} cy={19} r={15} fill="none" stroke="var(--brand)" strokeWidth={3.5}
          strokeLinecap="round" strokeDasharray={C.toFixed(2)}
          strokeDashoffset={(C * (1 - percent / 100)).toFixed(2)}
          transform="rotate(-90 19 19)"
          style={{ transition: 'stroke-dashoffset 0.5s var(--ease-out)' }} />
      </svg>
      <span>{percent}%</span>
    </span>
  );
}

function Avatar({ m }) {
  return m.photoURL
    ? <img src={m.photoURL} alt="" className="filter-menu-avatar" referrerPolicy="no-referrer" />
    : <span className="filter-menu-avatar">{(m.displayName || '?')[0]}</span>;
}

export default function ChecklistToolbar({
  items, categories, members,
  category, onCategory, member, onMember,
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const btn = useRef(null);
  useBackHandler(open, () => setOpen(false));

  const inCategory = (it) => !category || it.category === category;
  const forMember = (it) => !member || assigneesOf(it).includes(member);
  const shown = items.filter(it => inCategory(it) && forMember(it));
  const done = shown.filter(it => it.completed).length;
  const percent = shown.length ? Math.round((done / shown.length) * 100) : 0;

  const memberName = members.find(m => m.uid === member)?.displayName;
  const label = [category, memberName].filter(Boolean).join(' · ') || 'כל הרשימה';
  const filtered = !!(category || member);

  const toggle = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setRect({ bottom: r.bottom, right: r.right });
    setOpen(v => !v);
  };

  const width = Math.min(300, window.innerWidth - 16);
  const host = document.querySelector('.app-container') || document.body;

  return (
    <div className="list-toolbar">
      <button
        ref={btn}
        type="button"
        className="plan-filter-pill"
        aria-expanded={open}
        aria-label={`סינון: ${label}`}
        onClick={toggle}
        style={filtered ? { background: 'color-mix(in srgb, var(--accent) 14%, var(--card-bg-solid))' } : undefined}
      >
        <ListFilter size={16} style={{ flexShrink: 0, color: filtered ? 'var(--accent)' : 'var(--text-muted)' }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <ChevronDown size={15} style={{ flexShrink: 0, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
      </button>

      <div className="list-progress" aria-label={`${done} מתוך ${shown.length} נארזו`}>
        <span><b>{done}</b>/{shown.length} נארזו</span>
        <Ring percent={percent} />
      </div>

      {open && createPortal(
        <>
          <div className="filter-menu-scrim" onClick={() => setOpen(false)} />
          <div
            className="filter-menu"
            role="dialog"
            aria-label="סינון הרשימה"
            style={{
              top: rect ? rect.bottom + 6 : 120,
              right: rect ? Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - 8 - width)) : 8,
              width,
            }}
          >
            <div className="filter-menu-title">קטגוריה</div>
            <div role="radiogroup" aria-label="קטגוריה">
              {[null, ...categories].map(c => {
                const n = items.filter(it => (!c || it.category === c) && forMember(it)).length;
                const on = category === c;
                return (
                  <button key={c ?? '__all'} type="button" role="radio" aria-checked={on}
                    className="filter-menu-row" onClick={() => onCategory(c)}>
                    <span className="filter-menu-label">{c ?? 'כל הקטגוריות'}</span>
                    <span className="filter-menu-count">{n}</span>
                    {on && <Check size={16} className="filter-menu-check" />}
                  </button>
                );
              })}
            </div>

            {members.length > 1 && (
              <>
                <div className="filter-menu-title">שייך ל</div>
                <div role="radiogroup" aria-label="שייך ל">
                  {[null, ...members].map(m => {
                    const uid = m?.uid ?? null;
                    const n = items.filter(it => inCategory(it) && (!uid || assigneesOf(it).includes(uid))).length;
                    const on = member === uid;
                    return (
                      <button key={uid ?? '__all'} type="button" role="radio" aria-checked={on}
                        className={`filter-menu-row${m?.former ? ' person-former' : ''}`}
                        title={m?.former ? `${m.displayName} — כבר לא בטיול` : undefined}
                        onClick={() => onMember(uid)}>
                        {m && <Avatar m={m} />}
                        <span className="filter-menu-label">{m ? m.displayName : 'כולם'}</span>
                        <span className="filter-menu-count">{n}</span>
                        {on && <Check size={16} className="filter-menu-check" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="filter-menu-footer">
              {filtered && (
                <button type="button" className="btn-secondary" onClick={() => { onCategory(null); onMember(null); }}>
                  נקה
                </button>
              )}
              <button type="button" className="btn-primary" onClick={() => setOpen(false)}>
                הצג {shown.length} פריטים
              </button>
            </div>
          </div>
        </>,
        host
      )}
    </div>
  );
}
