import { useMemo, useState } from 'react';
import { Search, MapPin, Check, Star } from 'lucide-react';
import Sheet from '../ui/Sheet';
import SectionHeader from '../ui/SectionHeader';
import { Pill } from '../ui/kit';

/* ── Choosing a place from the trip's list ──────────────────────────────
   One sheet for every "which place?": a search box on top that stays put,
   the places under it by category ("must" first in each). Used by the
   schedule's activity form and the booking form, instead of a long
   dropdown with no search.

   `multiple`: tick several and add them at once (a new activity); else a
   tap picks one and closes. `hintOf`, `metaOf` and `badgeOf` add a line
   under the name, something at the row's end (travel times) and a pill.
   `colorOf`/`iconOf` give a category its colour and icon where the caller
   knows them. `metaFrom`: where the times may be counted from (8.91.0),
   [{ key, title }], the first the default; a tap on one changes them all,
   and `metaOf(place, from)` is asked again. `offOf(place)`: why it can't
   be picked here (not on the day's date, 8.93.0), shown greyed with the
   reason instead of the hint; '' when it can.                          */
export default function PlacePicker({
  places,
  value,
  multiple = false,
  title = 'בחירת מקום',
  categories = [],
  colorOf,
  iconOf,
  hintOf,
  metaOf,
  metaFrom = null,
  badgeOf,
  offOf,
  onPick,
  onClose,
}) {
  const [q, setQ] = useState('');
  const [fromKey, setFromKey] = useState(metaFrom?.[0]?.key ?? null);
  const from = metaFrom?.find(o => o.key === fromKey) || metaFrom?.[0] || null;
  const [picked, setPicked] = useState(() => new Set(multiple ? (value || []) : (value ? [value] : [])));

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (p) => !needle || [p.title, p.category, p.address, p.description]
      .some(v => (v || '').toLowerCase().includes(needle));
    const rank = (p) => (p.priority === 'must' ? 0 : p.priority === 'optional' ? 2 : 1);
    const byCat = new Map();
    places.filter(match).forEach(p => {
      const cat = p.category || 'ללא קטגוריה';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(p);
    });
    return [
      ...categories.filter(c => byCat.has(c)),
      ...[...byCat.keys()].filter(c => !categories.includes(c)),
    ].map(cat => ({
      cat,
      items: byCat.get(cat).sort((a, b) => rank(a) - rank(b) || (a.title || '').localeCompare(b.title || '', 'he')),
    }));
  }, [places, q, categories]);

  const toggle = (id, close) => {
    if (!multiple) { onPick(id); close(); return; }
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Sheet
      label={title}
      onClose={onClose}
      style={{ maxHeight: '88vh' }}
      header={({ close }) => (
        <div className="modal-header origin-picker-head">
          <div className="origin-picker-title">
            <h2>{title}</h2>
            <button type="button" aria-label="סגור" className="btn-close" onClick={close}>✕</button>
          </div>
          <div className="origin-picker-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              enterKeyHint="search"
              className="form-control"
              placeholder="חיפוש מקום ברשימה"
              aria-label="חיפוש מקום ברשימה"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {metaFrom && (
            <div className="place-pick-from" role="group" aria-label="זמני הגעה מ־">
              <span className="place-pick-from-label">זמנים מ־</span>
              {metaFrom.map(o => (
                <button
                  key={o.key}
                  type="button"
                  className="chip"
                  aria-pressed={o.key === from?.key}
                  onClick={() => setFromKey(o.key)}
                >
                  {o.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    >
      {({ close }) => (
        <div className="place-picker">
          {groups.length === 0 && (
            <div className="place-picker-empty">
              {q.trim() ? `אף מקום לא נמצא עבור "${q.trim()}"` : 'אין עדיין מקומות ברשימה'}
            </div>
          )}
          {groups.map(({ cat, items }) => {
            const color = colorOf?.(cat);
            return (
              <section key={cat} className="origin-picker-group">
                <SectionHeader title={cat} icon={iconOf?.(cat, 14)} color={color} count={items.length} />
                <div className="list-group" role={multiple ? 'group' : 'radiogroup'} aria-label={cat}>
                  {items.map(p => {
                    const on = picked.has(p.id);
                    const off = on ? '' : offOf?.(p) || '';
                    const hint = off || hintOf?.(p);
                    const badge = badgeOf?.(p);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role={multiple ? 'checkbox' : 'radio'}
                        aria-checked={on}
                        className={`list-row place-pick-row${on ? ' on' : ''}${off ? ' off' : ''}`}
                        disabled={!!off}
                        onClick={() => toggle(p.id, close)}
                      >
                        <span className="list-row-icon" style={{ color: color || undefined }}>
                          {iconOf ? iconOf(p.category, 16) : <MapPin size={16} />}
                        </span>
                        <span className="list-row-label">
                          <span className="place-pick-name">
                            {p.priority === 'must' && <Star size={12} className="star-must" aria-label="חובה" />}
                            <span>{p.title}</span>
                          </span>
                          {hint && <span className={`list-row-hint${off ? ' place-pick-off' : ''}`}>{hint}</span>}
                        </span>
                        {badge && <Pill size="sm" tone={badge.tone}>{badge.text}</Pill>}
                        {metaOf && <span className="place-pick-meta">{metaOf(p, from)}</span>}
                        {multiple
                          ? <span className={`place-pick-tick${on ? ' on' : ''}`} aria-hidden="true">{on && <Check size={14} strokeWidth={3} />}</span>
                          : on && <Check size={16} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {multiple && (
            <div className="sheet-footer">
              <button
                type="button"
                className="btn-primary"
                disabled={picked.size === 0}
                onClick={() => { onPick([...picked]); close(); }}
              >
                {picked.size > 1 ? `בחירת ${picked.size} מקומות` : 'בחירה'}
              </button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
