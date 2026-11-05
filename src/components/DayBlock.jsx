import { useEffect, useRef, useState } from 'react';
import { Check, X, Plus, ExternalLink, Link2, Type, ListChecks, Pencil, Trash2 } from 'lucide-react';
import { emptyBlock, cleanBlock, linkName, checkCount } from '../lib/blocks';

/* ══════════════════════════════════════════════════════════
   A free block in the schedule (8.87.0): text, a checklist or a link.
   The row, the drag handle and the writes are DayPlanner's; this is what
   is inside. Editing happens in place; "סיום" saves (an empty one goes),
   and so does leaving it open (another day, another tab).
   ══════════════════════════════════════════════════════════ */

const KINDS = [
  { kind: 'text', label: 'טקסט', Icon: Type },
  { kind: 'check', label: 'רשימה', Icon: ListChecks },
  { kind: 'link', label: 'קישור', Icon: Link2 },
];

// "+ טקסט · + רשימה · + קישור", at the end of the day.
export function AddBlockRow({ onAdd }) {
  return (
    <div className="dp-block-add" role="group" aria-label="הוספת בלוק">
      {KINDS.map(({ kind, label, Icon }) => (
        <button key={kind} type="button" onClick={() => onAdd(kind)}>
          <Plus size={13} aria-hidden="true" /><Icon size={14} aria-hidden="true" /><span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export default function DayBlock({ act, editable, editing, onEditing, onSave, onDelete, onToggle }) {
  if (editing && editable) {
    return <BlockEditor key={act.id} act={act} onSave={onSave} onDelete={onDelete} onDone={() => onEditing(false)} />;
  }
  const edit = editable
    ? <button type="button" className="round-btn dp-block-edit" aria-label="עריכת הבלוק" onClick={() => onEditing(true)}><Pencil size={14} /></button>
    : null;

  if (act.block === 'check') {
    const { done, all } = checkCount(act);
    const items = (act.items || []).filter(i => String(i?.text || '').trim());
    return (
      <div className="dp-block-body">
        <div className="dp-block-head">
          <ListChecks size={15} aria-hidden="true" className="dp-block-kind" />
          <span className="dp-block-title">{act.text || 'רשימה'}</span>
          {all > 0 && <span className="dp-block-count">{done}/{all}</span>}
          {edit}
        </div>
        {items.length ? (
          <ul className="dp-check">
            {items.map(i => (
              <li key={i.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!i.done}
                  disabled={!editable}
                  className={`dp-check-item${i.done ? ' done' : ''}`}
                  onClick={() => onToggle(i.id)}
                >
                  <span className="dp-check-box" aria-hidden="true">{i.done && <Check size={12} strokeWidth={3} />}</span>
                  <span className="dp-check-text">{i.text}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="dp-block-empty">אין פריטים עדיין</p>}
      </div>
    );
  }

  if (act.block === 'link') {
    return (
      <div className="dp-block-body dp-block-line">
        {act.url
          ? <a className="dp-block-link" href={act.url} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden="true" /><span>{linkName(act)}</span></a>
          : <span className="dp-block-empty">קישור ריק</span>}
        {edit}
      </div>
    );
  }

  return (
    <div className="dp-block-body dp-block-line">
      {String(act.text || '').trim()
        ? <p className="dp-block-text">{act.text}</p>
        : <span className="dp-block-empty">טקסט ריק</span>}
      {edit}
    </div>
  );
}

const draftOf = (act) => (act.block === 'check'
  ? { text: act.text || '', items: (act.items || []).map(i => ({ ...i })) }
  : act.block === 'link' ? { url: act.url || '', label: act.label || '' }
    : { text: act.text || '' });

function BlockEditor({ act, onSave, onDelete, onDone }) {
  const [d, setD] = useState(() => draftOf(act));
  const seq = useRef(0);
  const born = useRef(0);   // when this edit began: new items' ids
  useEffect(() => { born.current = Date.now(); }, []);
  const finished = useRef(false);
  const kind = act.block;

  const commit = () => {
    const clean = cleanBlock(kind, d);
    if (emptyBlock({ block: kind, ...clean })) onDelete(true);
    else if (JSON.stringify(clean) !== JSON.stringify(cleanBlock(kind, draftOf(act)))) onSave(clean);
  };
  // Left open (another day, the tab closed): what was typed is kept.
  const last = useRef({ commit });
  useEffect(() => { last.current = { commit }; });
  useEffect(() => () => { if (!finished.current) last.current.commit(); }, []);
  const done = () => { finished.current = true; commit(); onDone(); };

  const setItem = (id, patch) => setD(v => ({ ...v, items: v.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }));
  const addItem = (afterId = null) => {
    seq.current += 1;
    const item = { id: `i-${born.current}-${seq.current}`, text: '', done: false };
    setD(v => {
      const at = afterId ? v.items.findIndex(i => i.id === afterId) + 1 : v.items.length;
      const items = [...v.items];
      items.splice(at, 0, item);
      return { ...v, items };
    });
    requestAnimationFrame(() => document.getElementById(item.id)?.focus());
  };

  return (
    <div className="dp-block-body dp-block-editor">
      {kind === 'text' && (
        <textarea
          className="form-control"
          rows="3"
          autoFocus
          aria-label="טקסט"
          placeholder="כתבו כאן…"
          value={d.text}
          onChange={(e) => setD({ text: e.target.value })}
        />
      )}
      {kind === 'check' && (<>
        <input className="form-control" aria-label="כותרת הרשימה" placeholder="כותרת (לא חובה)" value={d.text} onChange={(e) => setD(v => ({ ...v, text: e.target.value }))} />
        <ul className="dp-check edit">
          {d.items.map((i, n) => (
            <li key={i.id}>
              <span className={`dp-check-box${i.done ? ' on' : ''}`} aria-hidden="true">{i.done && <Check size={12} strokeWidth={3} />}</span>
              <input
                id={i.id}
                className="form-control"
                aria-label={`פריט ${n + 1}`}
                placeholder="פריט"
                autoFocus={n === 0 && !i.text}
                value={i.text}
                onChange={(e) => setItem(i.id, { text: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(i.id); } }}
              />
              <button type="button" className="btn-x" aria-label="הסרת הפריט" onClick={() => setD(v => ({ ...v, items: v.items.filter(x => x.id !== i.id) }))}><X size={14} /></button>
            </li>
          ))}
        </ul>
        <button type="button" className="dp-block-more" onClick={() => addItem()}><Plus size={14} aria-hidden="true" />פריט</button>
      </>)}
      {kind === 'link' && (<>
        <input className="form-control" dir="ltr" inputMode="url" autoFocus aria-label="כתובת הקישור" placeholder="https://…" value={d.url} onChange={(e) => setD(v => ({ ...v, url: e.target.value }))} />
        <input className="form-control" aria-label="שם הקישור" placeholder="שם (לא חובה)" value={d.label} onChange={(e) => setD(v => ({ ...v, label: e.target.value }))} />
      </>)}
      <div className="dp-block-actions">
        <button type="button" className="btn-primary" onClick={done}>סיום</button>
        <button type="button" className="dp-block-del" onClick={() => { finished.current = true; onDelete(false); onDone(); }}>
          <Trash2 size={14} aria-hidden="true" />מחיקה
        </button>
      </div>
    </div>
  );
}
