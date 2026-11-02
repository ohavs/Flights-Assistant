import { useMemo, useState } from 'react';
import { Search, X, Plus, Sunrise, Sun, Sunset, Moon, Clock, ArrowLeftRight } from 'lucide-react';
import { db } from '../firebase';
import Sheet from '../ui/Sheet';
import { CategoryDisc } from '../ui/kit';
import { CustomDropdown, CustomTimePicker } from './CustomDatePicker';
import PlacePicker from './PlacePicker';
import { addActivities, updateActivity } from '../lib/dayActivities';
import { PARTS, slotOf } from '../lib/dayPlan';

const PART_ICONS = { 'בוקר': Sunrise, 'צהריים': Sun, 'ערב': Sunset, 'לילה': Moon };
const DEFAULT_CATEGORY = 'אטרקציות ודברים לעשות';

/* ── Adding or editing an activity of a day ─────────────────────────────
   Either a place from the list, or one typed in: never both. A place
   brings its name, category and address, so those fields go away while
   one is chosen; what a place doesn't know (when, notes) stays. Adding,
   several places can be chosen at once, each its own activity.

   The time is one value, saved as `timeLabel` like before: a part of the
   day, or a clock time (which falls in a part on its own).             */
export default function ActivitySheet({
  tripId, day, editing, plans, categories, usedOn, canEdit, currentUid,
  getCategoryColor, getCategoryIcon, metaOf, onAddCategory, onClose,
}) {
  const planById = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans]);
  const start = useMemo(() => {
    const linked = editing?.placeId && planById.has(editing.placeId) ? [editing.placeId] : [];
    return {
      placeIds: linked,
      title: linked.length ? '' : (editing?.title || ''),
      category: linked.length ? DEFAULT_CATEGORY : (editing?.category || DEFAULT_CATEGORY),
      address: linked.length ? '' : (editing?.address || ''),
      timeLabel: (editing?.timeLabel || '').trim(),
      notes: editing?.description || '',
    };
  }, [editing, planById]);
  const [placeIds, setPlaceIds] = useState(start.placeIds);
  const [title, setTitle] = useState(start.title);
  const [category, setCategory] = useState(start.category);
  const [address, setAddress] = useState(start.address);
  const [timeLabel, setTimeLabel] = useState(start.timeLabel);
  const [notes, setNotes] = useState(start.notes);
  const [picking, setPicking] = useState(false);

  const chosen = placeIds.map(id => planById.get(id)).filter(Boolean);
  const slot = slotOf(timeLabel);
  const dirty = JSON.stringify([placeIds, title, category, address, timeLabel, notes])
    !== JSON.stringify([start.placeIds, start.title, start.category, start.address, start.timeLabel, start.notes]);

  // Letting go of the place brings back the typed-in fields, filled with
  // what the place had, so nothing has to be typed again.
  const unlink = (id) => {
    const p = planById.get(id);
    const rest = placeIds.filter(x => x !== id);
    setPlaceIds(rest);
    if (!rest.length && p && editing) {
      setTitle(p.title || '');
      setCategory(p.category || DEFAULT_CATEGORY);
      setAddress(p.address || '');
    }
  };

  const save = (close) => (e) => {
    e.preventDefault();
    const label = timeLabel.trim();
    const description = notes.trim();
    let write;
    if (editing) {
      const p = chosen[0];
      const next = {
        ...editing,
        title: p ? p.title : title.trim(),
        placeId: p ? p.id : null,
        address: p ? (p.address || '') : address.trim(),
        category: p ? p.category : category,
        timeLabel: label,
        description,
        // Whose it is stays with it (firestore.rules).
        createdBy: editing.createdBy || null,
      };
      if (!next.title) return;
      write = updateActivity(db, tripId, day.id, day.rawActivities, next, !canEdit);
    } else {
      const stamp = Date.now();
      const added = chosen.length
        ? chosen.map((p, i) => ({
          id: `act-${stamp}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          title: p.title, placeId: p.id, address: p.address || '', category: p.category,
          timeLabel: label, description, createdBy: currentUid || null,
        }))
        : title.trim() ? [{
          id: `act-${stamp}`,
          title: title.trim(), placeId: null, address: address.trim(), category,
          timeLabel: label, description, createdBy: currentUid || null,
        }] : [];
      if (!added.length) return;
      write = addActivities(db, tripId, day.id, day.rawActivities, added);
    }
    write.catch(err => console.error('Activity save error:', err));
    close();
  };

  const partOn = (part) => slot.part === part;

  return (
    <Sheet
      title={editing ? 'עריכת פעילות' : 'הוספת פעילות ליום'}
      onClose={onClose}
      dirty={dirty}
      style={{ maxHeight: '90vh' }}
    >
      {({ cancel, close }) => (<>
        <form onSubmit={save(close)} className="act-form">

          {/* Where: a place from the list, or typed in */}
          <div className="act-form-block">
            <span className="act-form-label">מקום מהרשימה</span>
            {chosen.map(p => (
              <div key={p.id} className="act-place">
                <CategoryDisc color={getCategoryColor(p.category)} size={40} radius={13}>
                  {getCategoryIcon(p.category, 18)}
                </CategoryDisc>
                <div className="act-place-text">
                  <span className="act-place-title">{p.title}</span>
                  <span className="act-place-sub">{[p.category, p.address].filter(Boolean).join(' · ')}</span>
                </div>
                {editing && (
                  <button type="button" className="round-btn" aria-label="החלפת מקום" title="החלפת מקום" onClick={() => setPicking(true)}>
                    <ArrowLeftRight size={16} />
                  </button>
                )}
                <button type="button" className="btn-x" aria-label={`הסרת ${p.title}`} title="הסרה" onClick={() => unlink(p.id)}>
                  <X size={16} />
                </button>
              </div>
            ))}
            {(!chosen.length || !editing) && (
              <button type="button" className="act-pick" onClick={() => setPicking(true)} disabled={!plans.length}>
                {chosen.length ? <Plus size={17} aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
                <span>{!plans.length ? 'אין עדיין מקומות ברשימה' : chosen.length ? 'עוד מקום' : 'חיפוש מקום ברשימה'}</span>
              </button>
            )}
            {chosen.length > 0 && (
              <span className="act-form-note">השם, הקטגוריה והכתובת מגיעים מהמקום.</span>
            )}
          </div>

          {!chosen.length && (<>
            <div className="act-or"><span>או הזנה ידנית</span></div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>שם הפעילות *</label>
              <input
                type="text"
                className="form-control"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="למשל: נסיעה ברכבת, ארוחת צהריים, ביקור במוזיאון"
              />
            </div>
            <CustomDropdown
              label="קטגוריה"
              value={category}
              onChange={setCategory}
              options={categories}
              addable
              addLabel="הוסף קטגוריה חדשה"
              onCommit={onAddCategory}
            />
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>כתובת / מיקום</label>
              <input
                type="text"
                className="form-control"
                placeholder="כתובת או קישור למפה"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </>)}

          {/* When: a part of the day, or an exact time */}
          <div className="act-form-block">
            <span className="act-form-label">מתי{chosen.length > 1 ? ' (לכל המקומות)' : ''}</span>
            <div className="act-parts" role="group" aria-label="חלק ביום">
              {PARTS.map(part => {
                const Icon = PART_ICONS[part];
                const on = partOn(part);
                return (
                  <button
                    key={part}
                    type="button"
                    className={`act-part${on ? ' on' : ''}${on && slot.minutes != null ? ' by-time' : ''}`}
                    aria-pressed={on}
                    onClick={() => setTimeLabel(on && slot.minutes == null ? '' : part)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{part}</span>
                  </button>
                );
              })}
              {slot.custom && (
                <button type="button" className="act-part on" aria-pressed="true" onClick={() => setTimeLabel('')}>
                  <Clock size={16} aria-hidden="true" />
                  <span>{slot.label}</span>
                </button>
              )}
            </div>
            <div className="act-time">
              <div style={{ flex: 1, minWidth: 0 }}>
                <CustomTimePicker label="שעה מדויקת (לא חובה)" value={slot.minutes != null ? slot.label : ''} onChange={setTimeLabel} />
              </div>
              {slot.minutes != null && (
                <button type="button" className="btn-x" aria-label="בלי שעה מדויקת" title="בלי שעה מדויקת" onClick={() => setTimeLabel(slot.part || '')}>
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>הערות{chosen.length > 1 ? ' (לכל המקומות)' : ''}</label>
            <textarea
              className="form-control"
              rows="3"
              placeholder="הערות מיוחדות, שעות פתיחה, עם מי נפגשים..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ resize: 'none', fontFamily: 'inherit' }}
            />
          </div>

          <div className="sheet-footer">
            <button type="submit" className="btn-primary" disabled={!chosen.length && !title.trim()}>
              {!editing && chosen.length > 1 ? `הוסף ${chosen.length} פעילויות` : 'שמור'}
            </button>
            <button type="button" onClick={cancel} className="btn-secondary">ביטול</button>
          </div>

        </form>
        {picking && (
          <PlacePicker
            places={plans}
            multiple={!editing}
            value={editing ? placeIds[0] : placeIds}
            title={editing ? 'החלפת מקום' : 'בחירת מקומות ליום'}
            categories={categories}
            colorOf={getCategoryColor}
            iconOf={getCategoryIcon}
            metaOf={metaOf}
            hintOf={(p) => {
              const on = usedOn.get(p.id);
              if (on?.length) return `כבר בלוז: ${on.join(', ')}`;
              return p.address && !/^https?:\/\//i.test(p.address) ? p.address : '';
            }}
            badgeOf={(p) => (p.visited ? { text: 'ביקרנו', tone: 'muted' } : null)}
            onPick={(v) => setPlaceIds(editing ? [v] : v)}
            onClose={() => setPicking(false)}
          />
        )}
      </>)}
    </Sheet>
  );
}

