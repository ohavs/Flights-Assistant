import { useCallback, useMemo, useState } from 'react';
import { Search, X, Plus, Sunrise, Sun, Sunset, Moon, Clock, ArrowLeftRight, CircleDashed, CalendarClock, AlertTriangle, ChevronsDown, ArrowRight } from 'lucide-react';
import { db } from '../firebase';
import Sheet from '../ui/Sheet';
import { CategoryDisc } from '../ui/kit';
import { CustomDropdown, CustomTimePicker } from './CustomDatePicker';
import PlacePicker from './PlacePicker';
import { addActivities, updateActivity, updateActivities } from '../lib/dayActivities';
import { PARTS, slotOf, partsLabel, clockMinutes, rangeLabel, shiftAfter, shiftText, fixedTitle, timeOptionsOf, startAt, fmtClock } from '../lib/dayPlan';
import { endsLate, eventSpan, eventNote, hoursText, onDate, partFits, timeFits, whyNot } from '../lib/eventFit';

const PART_ICONS = { 'בוקר': Sunrise, 'צהריים': Sun, 'ערב': Sunset, 'לילה': Moon };
const DEFAULT_CATEGORY = 'אטרקציות ודברים לעשות';
const NO_ITEMS = [];
const ANY = () => true;

/* ── Adding or editing an activity of a day ─────────────────────────────
   Either a place from the list, or one typed in: never both. A place
   brings its name, category and address, so those fields go away while
   one is chosen; what a place doesn't know (when, notes) stays. Adding,
   several places can be chosen at once, each its own activity.

   The time is one value, saved as `timeLabel` like before: parts of the
   day (one, or several: 'בוקר–ערב', 8.82.0), or a clock time (which falls
   in a part on its own), or a range of them ('10:00–12:00', 8.94.0: "משעה"
   and "עד"; a new start keeps the length).

   A place with its own dates and hours (`event`, 8.93.0): on a day out of
   its dates it is grey in the list, the parts of the day and the clock
   times out of its hours are grey, and a choice that still ends up out
   (a time picked before the place) says why and can't be saved.

   Editing, a new clock time can move what comes after it by as much
   (8.95.0, `shiftAfter`): only when the switch under the time is on.
   `items` is the day as shown, `canMove(item)` what may change here.
   Other start times to switch between in the schedule (`timeOptions`)
   are added here too.                                                  */

export default function ActivitySheet({
  tripId, day, editing, plans, categories, usedOn, currentUid, personal = false, onlyOwn = false,
  items = NO_ITEMS, canMove = ANY, getCategoryColor, getCategoryIcon, metaOf, metaFrom, onAddCategory, onClose,
}) {
  const planById = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans]);
  const start = useMemo(() => {
    const linked = editing?.placeId && planById.has(editing.placeId) ? [editing.placeId] : [];
    const own = slotOf(editing?.timeLabel).minutes;
    return {
      alts: timeOptionsOf(editing?.timeOptions).filter(t => clockMinutes(t) !== own),
      placeIds: linked,
      title: linked.length ? '' : (editing?.title || ''),
      category: linked.length ? DEFAULT_CATEGORY : (editing?.category || DEFAULT_CATEGORY),
      address: linked.length ? '' : (editing?.address || ''),
      timeLabel: (editing?.timeLabel || '').trim(),
      notes: editing?.description || '',
      optional: !!editing?.optional,
    };
  }, [editing, planById]);
  const [placeIds, setPlaceIds] = useState(start.placeIds);
  const [title, setTitle] = useState(start.title);
  const [category, setCategory] = useState(start.category);
  const [address, setAddress] = useState(start.address);
  const [timeLabel, setTimeLabel] = useState(start.timeLabel);
  const [notes, setNotes] = useState(start.notes);
  const [optional, setOptional] = useState(start.optional);
  const [picking, setPicking] = useState(false);
  const [shiftOn, setShiftOn] = useState(false);
  const [alts, setAlts] = useState(start.alts);

  const chosen = useMemo(() => placeIds.map(id => planById.get(id)).filter(Boolean), [placeIds, planById]);
  const slot = slotOf(timeLabel);
  const date = day?.date || null;
  // A place that isn't on this day's dates: grey in the list, with why.
  const offOf = (p) => { const why = whyNot(p.event, date, ''); return why ? `לא ביום הזה: ${why}` : ''; };
  // The first chosen place whose hours leave this out, or none.
  const partBlock = (part) => chosen.find(p => !partFits(p.event, part));
  const checkTime = useCallback((hhmm) => {
    const p = chosen.find(x => !timeFits(x.event, clockMinutes(hhmm)));
    return p ? `${p.title} פתוח רק ${hoursText(eventSpan(p.event))}` : '';
  }, [chosen]);
  // What is chosen and can't be: the time was picked before the place, or
  // an activity saved before its day's date changed.
  const problems = chosen.map(p => ({ p, why: whyNot(p.event, date, timeLabel) })).filter(x => x.why);
  // A range that ends after a place closes: allowed, with a word (8.94.0).
  const late = problems.length ? [] : chosen.map(p => ({ p, what: endsLate(p.event, timeLabel) })).filter(x => x.what);
  const touched = !editing || JSON.stringify([placeIds, timeLabel]) !== JSON.stringify([start.placeIds, start.timeLabel]);
  const blocked = problems.length > 0 && touched;
  // What comes after, moved by the new time (8.95.0).
  const shift = useMemo(() => (editing
    ? shiftAfter(items, `act:${editing.id}`, start.timeLabel, timeLabel, canMove)
    : { delta: 0, moves: [], stays: [] }), [editing, items, start.timeLabel, timeLabel, canMove]);
  const shifting = shiftOn && shift.moves.length > 0;
  const nameOf = (it) => (it.kind === 'activity' ? (planById.get(it.act.placeId)?.title || it.act.title)
    : it.kind === 'booking' ? it.booking.title : fixedTitle(it));
  // A moved place that ends up out of its own dates or hours: a word.
  const shiftOff = shift.moves.map(m => {
    const p = planById.get(m.act.placeId);
    const why = p ? whyNot(p.event, date, m.timeLabel) : '';
    return why ? { key: m.it.key, text: `${p.title}: ${why}` } : null;
  }).filter(Boolean);
  // The times to switch between: its own start and the others (8.95.0).
  const others = slot.minutes == null ? [] : alts.filter(t => clockMinutes(t) !== slot.minutes);
  const options = others.length ? timeOptionsOf([fmtClock(slot.minutes), ...others]) : null;
  const checkAlt = (hhmm) => {
    const m = clockMinutes(hhmm);
    if (m === slot.minutes) return 'זו השעה שנבחרה';
    if (alts.some(t => clockMinutes(t) === m)) return 'כבר ברשימה';
    return checkTime(hhmm);
  };
  const dirty = JSON.stringify([placeIds, title, category, address, timeLabel, notes, optional, others])
    !== JSON.stringify([start.placeIds, start.title, start.category, start.address, start.timeLabel, start.notes, start.optional, start.alts]);

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
    if (blocked) return;
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
        optional: true,
        timeOptions: options,
      };
      if (!optional) delete next.optional;
      if (!options) delete next.timeOptions;
      if (!next.title) return;
      const dayId = day.target ?? day.id;
      write = shifting
        ? updateActivities(db, tripId, dayId, day.rawActivities,
          [next, ...shift.moves.map(m => ({ ...m.act, timeLabel: m.timeLabel }))], onlyOwn)
        : updateActivity(db, tripId, dayId, day.rawActivities, next, onlyOwn);
    } else {
      const stamp = Date.now();
      const added = chosen.length
        ? chosen.map((p, i) => ({
          id: `act-${stamp}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          title: p.title, placeId: p.id, address: p.address || '', category: p.category,
          timeLabel: label, description, createdBy: currentUid || null, ...(optional ? { optional: true } : {}),
          ...(options ? { timeOptions: options } : {}),
        }))
        : title.trim() ? [{
          id: `act-${stamp}`,
          title: title.trim(), placeId: null, address: address.trim(), category,
          timeLabel: label, description, createdBy: currentUid || null, ...(optional ? { optional: true } : {}),
          ...(options ? { timeOptions: options } : {}),
        }] : [];
      if (!added.length) return;
      write = addActivities(db, tripId, day.target ?? day.id, day.rawActivities, added);
    }
    write.catch(err => console.error('Activity save error:', err));
    close();
  };

  // A new start keeps the range's length; an end the same as the start is
  // none. With times to switch between, the old start stays one of them.
  const setStart = (hhmm) => {
    if (alts.length && slot.minutes != null) setAlts(a => timeOptionsOf([...a, fmtClock(slot.minutes)]));
    setTimeLabel(startAt(timeLabel, hhmm));
  };
  const setEnd = (hhmm) => setTimeLabel(rangeLabel(slot.minutes, clockMinutes(hhmm)));
  const checkEnd = useCallback((hhmm) => (clockMinutes(hhmm) === slot.minutes ? 'כמו שעת ההתחלה' : ''), [slot.minutes]);

  const partOn = (part) => slot.parts.includes(part);
  // Each part turns on and off on its own; several make one label. With an
  // exact time, its own part drops the time, and another adds itself.
  const togglePart = (part) => {
    if (slot.minutes != null) {
      setTimeLabel(part === slot.part ? part : partsLabel([slot.part, part]));
      return;
    }
    const next = slot.parts.includes(part) ? slot.parts.filter(p => p !== part) : [...slot.parts, part];
    setTimeLabel(partsLabel(next));
  };

  return (
    <Sheet
      title={editing ? 'עריכת פעילות' : (personal ? 'הוספה לתכנון שלי' : 'הוספת פעילות ליום')}
      onClose={onClose}
      dirty={dirty}
      style={{ maxHeight: '90vh' }}
    >
      {({ cancel, close }) => (<>
        <form onSubmit={save(close)} className="act-form">
          {personal && <p className="act-form-private">התכנון האישי שלך: רק את/ה רואה אותו.</p>}

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
                  {(() => {
                    const n = eventNote(p.event, date, timeLabel);
                    return n && (
                      <span className="act-place-when">
                        <CalendarClock size={12} aria-hidden="true" />
                        <span>{n.full}</span>
                      </span>
                    );
                  })()}
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
            <span className="act-form-label">
              מתי{chosen.length > 1 ? ' (לכל המקומות)' : ''}
              <span className="act-form-hint">אפשר לבחור כמה</span>
            </span>
            <div className="act-parts" role="group" aria-label="חלק ביום">
              {PARTS.map(part => {
                const Icon = PART_ICONS[part];
                const on = partOn(part);
                const shut = on ? null : partBlock(part);
                return (
                  <button
                    key={part}
                    type="button"
                    className={`act-part${on ? ' on' : ''}${on && slot.minutes != null ? ' by-time' : ''}`}
                    aria-pressed={on}
                    disabled={!!shut}
                    title={shut ? `${shut.title} פתוח רק ${hoursText(eventSpan(shut.event))}` : undefined}
                    onClick={() => togglePart(part)}
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
            {/* A clock time, or a range: "משעה" and "עד" (8.94.0) */}
            <div className="act-time">
              <div className="act-time-field">
                <CustomTimePicker
                  label="משעה (לא חובה)"
                  value={slot.minutes != null ? rangeLabel(slot.minutes) : ''}
                  onChange={setStart}
                  check={chosen.some(p => eventSpan(p.event)?.close != null) ? checkTime : null}
                />
                {slot.minutes != null && (
                  <button type="button" className="btn-x" aria-label="בלי שעה" title="בלי שעה" onClick={() => setTimeLabel(slot.part || '')}>
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="act-time-field">
                <CustomTimePicker
                  label="עד (לא חובה)"
                  value={slot.end != null ? rangeLabel(slot.end) : ''}
                  onChange={setEnd}
                  check={checkEnd}
                  disabled={slot.minutes == null}
                  suggest={slot.minutes != null ? rangeLabel((slot.minutes + 60) % 1440) : ''}
                />
                {slot.end != null && (
                  <button type="button" className="btn-x" aria-label="בלי שעת סיום" title="בלי שעת סיום" onClick={() => setTimeLabel(rangeLabel(slot.minutes))}>
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
            {/* Moving what comes after (8.95.0) */}
            {shift.moves.length > 0 && (
              <div className="list-group act-shift">
                <button type="button" role="switch" aria-checked={shiftOn} className="list-row" onClick={() => setShiftOn(v => !v)}>
                  <ChevronsDown size={18} className="list-row-icon" />
                  <span className="list-row-label">
                    לחשב את השעות שאחרי בהתאם?
                    <span className="list-row-hint">
                      {`${shift.moves.length === 1 ? 'פעילות אחת' : `${shift.moves.length} פעילויות`}, ${shiftText(shift.delta)}`}
                    </span>
                  </span>
                  <span className={`switch${shiftOn ? ' on' : ''}`} aria-hidden="true"><i /></span>
                </button>
                {shiftOn && (
                  <ul className="act-shift-list">
                    {shift.moves.map(m => (
                      <li key={m.it.key}>
                        <span className="act-shift-name">{nameOf(m.it)}</span>
                        <span className="act-shift-times" dir="ltr">
                          <span className="was">{m.it.slot.label}</span>
                          <ArrowRight size={12} aria-hidden="true" />
                          <span>{slotOf(m.timeLabel).label}</span>
                        </span>
                      </li>
                    ))}
                    {shift.stays.length > 0 && (
                      <li className="act-shift-stay">{`נשאר בשעה שלו: ${shift.stays.map(nameOf).join(', ')}`}</li>
                    )}
                    {shiftOff.map(o => (
                      <li key={o.key} className="act-form-error warn" role="status">
                        <AlertTriangle size={14} aria-hidden="true" />
                        <span>{o.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {/* Other start times, to switch between in the schedule (8.95.0) */}
            {slot.minutes != null && (
              <div className="act-alts">
                {others.length > 0 && (
                  <div className="act-alts-row" aria-label="שעות לבחירה">
                    {options.map(t => (clockMinutes(t) === slot.minutes
                      ? <span key={t} className="act-alt on" dir="ltr">{t}</span>
                      : (
                        <span key={t} className="act-alt" dir="ltr">
                          {t}
                          <button type="button" className="act-alt-x" aria-label={`הסרת ${t}`} onClick={() => setAlts(a => a.filter(x => clockMinutes(x) !== clockMinutes(t)))}>
                            <X size={12} />
                          </button>
                        </span>
                      )))}
                  </div>
                )}
                <CustomTimePicker
                  label="שעה חלופית (לא חובה)"
                  value=""
                  onChange={(hhmm) => setAlts(a => timeOptionsOf([...a, hhmm]))}
                  check={checkAlt}
                  suggest={rangeLabel((slot.minutes + 60) % 1440)}
                />
                <span className="act-form-note">
                  {others.length ? 'בלוז יופיע מתג בין השעות. בחירה בשעה מזיזה גם את כל מה שאחרי.' : 'להחלפה מהירה בלוז בין כמה שעות יציאה. כל מה שאחרי זז איתן.'}
                </span>
              </div>
            )}
            {!problems.length && chosen.some(p => eventSpan(p.event)?.close != null) && (
              <span className="act-form-note">מה שמחוץ לשעות של המקום אפור.</span>
            )}
            {late.map(({ p, what }) => (
              <p key={p.id} className="act-form-error warn" role="status">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{`${p.title} ${what}, לפני סוף הטווח.`}</span>
              </p>
            ))}
            {problems.map(({ p, why }) => (
              <p key={p.id} className="act-form-error" role="alert">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{`${p.title}: ${why}.`}{blocked ? ` ${onDate(p.event, date) ? 'צריך לבחור שעה אחרת.' : 'אפשר להוסיף אותו ליום אחר.'}` : ''}</span>
              </p>
            ))}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{chosen.length ? `הערה ליום הזה${chosen.length > 1 ? ' (לכל המקומות)' : ''}` : 'הערות'}</label>
            <textarea
              className="form-control"
              rows="3"
              placeholder="הערות מיוחדות, שעות פתיחה, עם מי נפגשים..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ resize: 'none', fontFamily: 'inherit' }}
            />
          </div>

          <div className="list-group">
            <button type="button" role="switch" aria-checked={optional} className="list-row" onClick={() => setOptional(v => !v)}>
              <CircleDashed size={18} className="list-row-icon" />
              <span className="list-row-label">
                אופציונלית
                <span className="list-row-hint">אם יהיה זמן</span>
              </span>
              <span className={`switch${optional ? ' on' : ''}`} aria-hidden="true"><i /></span>
            </button>
          </div>

          <div className="sheet-footer">
            <button type="submit" className="btn-primary" disabled={(!chosen.length && !title.trim()) || blocked}>
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
            metaFrom={metaFrom}
            hintOf={(p) => {
              const on = usedOn.get(p.id);
              if (on?.length) return `כבר בלוז: ${on.join(', ')}`;
              return p.address && !/^https?:\/\//i.test(p.address) ? p.address : '';
            }}
            badgeOf={(p) => (p.visited ? { text: 'ביקרנו', tone: 'muted' } : null)}
            offOf={offOf}
            onPick={(v) => setPlaceIds(editing ? [v] : v)}
            onClose={() => setPicking(false)}
          />
        )}
      </>)}
    </Sheet>
  );
}

