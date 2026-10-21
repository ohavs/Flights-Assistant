import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db } from '../firebase';
import { listen } from '../lib/listen';
import { missingGlobalItems, copyGlobalItems } from '../lib/checklistSync';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { changedFields } from '../lib/changes';
import { Check, Plus, Trash2, Pencil, X, GripVertical, ClipboardList, Bell, ChevronLeft, ArrowUp } from 'lucide-react';
import { CustomDropdown, CustomDateTimePicker, formatHebrewDateTime } from './CustomDatePicker';
import Skeleton from './Skeleton';
import ListCard from '../ui/ListCard';
import SheetDelete from '../ui/SheetDelete';
import useFlip from '../hooks/useFlip';
import SectionHeader from '../ui/SectionHeader';
import { CheckCircle } from '../ui/kit';
import Fab from './Fab';
import EmptyState from './EmptyState';
import ChecklistToolbar from './ChecklistFilter';
import Sheet, { Segmented } from '../ui/Sheet';
import { useTrip } from '../TripContext';
import { useConfirm } from '../ConfirmContext';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* Small round avatar used across the reminder UI. */
function Avatar({ photoURL, name, size = 26 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'var(--lavender)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {photoURL
        ? <img src={photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
        : <span style={{ fontSize: size * 0.38, fontWeight: 700, color: 'var(--text)' }}>{(name || '?')[0]}</span>}
    </div>
  );
}

/* The people a list can name.
 *
 * Current members, plus anyone who has left the trip but is still
 * attached to something in it. Leaving removes the uid from the trip's
 * `members`, and profiles are only fetched for members — so without this
 * an expense a departed person paid, or an item assigned to them, would
 * render with no name at all. Their work is never deleted; only the
 * attribution needed rescuing, which is what `formerMembers` (a snapshot
 * written when they leave) is for.
 *
 * `stillReferenced` is supplied by the caller because only the caller
 * knows what "attached" means for its own list: someone who left and had
 * nothing assigned is simply gone, and does not belong in a picker.
 */
export function buildMemberList({
  currentUid, currentUserProfile, tripMembers, memberProfiles,
  formerMembers = {}, stillReferenced = new Set(),
}) {
  const list = [];
  if (currentUid && currentUserProfile) {
    list.push({
      uid: currentUid,
      displayName: currentUserProfile.displayName || currentUserProfile.email || '',
      photoURL: currentUserProfile.photoURL || '',
    });
  }
  Object.keys(tripMembers || {}).forEach(uid => {
    if (uid === currentUid) return;
    const p = memberProfiles?.[uid] || {};
    list.push({ uid, displayName: p.displayName || p.email || uid, photoURL: p.photoURL || '' });
  });
  Object.entries(formerMembers).forEach(([uid, p]) => {
    if (uid === currentUid || tripMembers?.[uid]) return;
    if (!stillReferenced.has(uid)) return;
    list.push({
      uid,
      displayName: p.displayName || p.email || uid,
      photoURL: p.photoURL || '',
      former: true,
    });
  });
  // Anyone referenced who is in neither map left before the snapshot
  // existed. Their name is unrecoverable, but the row is still theirs and
  // saying so beats a bare "?".
  stillReferenced.forEach(uid => {
    if (list.some(m => m.uid === uid)) return;
    list.push({ uid, displayName: 'משתתף שעזב', photoURL: '', former: true });
  });
  return list;
}

/* ── Reminders ───────────────────────────────────────────────────────────

   A rebuild, not a restyle. What stood here was a strip that shuffled the
   reminders and auto-advanced through them every five seconds: one visible
   at a time, moving on its own, reachable again only by guessing at a
   swipe. Acting on one meant opening the "all" sheet, tapping edit,
   watching that sheet close and a second one open in its place — and a
   hidden "selection mode" that quietly changed what a tap did.

   What replaces it holds still. The tile says where the trip stands and
   opens one sheet; that sheet is the whole feature — read, tick, add,
   edit, delete — and it never swaps itself for another. Editing runs
   through the composer already sitting at the bottom of it, the way a chat
   edits a message, so the list you were reading stays put under your
   thumb. Rows carry their actions behind a swipe, the same gesture the
   checklist and the expenses already use.                                */

/* Long enough to read a line of Hebrew, short enough that a queue of them
   gets through. The ring below sweeps exactly this. */
const REMINDER_DWELL_MS = 3000;

/* One arc doing two jobs, which is why there is no second indicator.

   It is drawn at i/n when a reminder appears and grows to (i+1)/n by the
   time the next one takes over. Read at any instant it says how far
   through the open list you are; watched, the growth itself is the
   countdown to the swap — so the change is announced without a separate
   bar competing with the very line that already advances with the numbers.
   A full ring means the last one is on screen and the lap restarts.

   The sweep is a CSS animation with only a `from`: the implicit `to` is
   the element's own stroke-dashoffset, already set to this step's end. If
   the animation never runs — reduced motion, or an engine that declines —
   the ring still sits at the right place and simply steps instead of
   gliding. */
function CycleRing({ index, count, animate, size = 44 }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  // dash offset that leaves k/count of the ring drawn
  const offsetAt = (k) => circumference * (1 - (count > 0 ? k / count : 0));

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--p-15)" strokeWidth={stroke} />
        <circle
          // Remounting per step restarts the sweep; without it the browser
          // keeps running the old one and the arc drifts out of step.
          key={index}
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference}
          style={{
            strokeDashoffset: offsetAt(index + 1),
            ...(animate ? {
              '--arc-from': String(offsetAt(index)),
              animation: `reminder-arc ${REMINDER_DWELL_MS}ms linear`,
            } : null),
          }}
        />
      </svg>
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 900, color: 'var(--accent)', direction: 'ltr',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {index + 1}/{count}
      </span>
    </div>
  );
}

/* The reminder's time on its chip, short enough to sit beside the
   avatars: "היום · 09:00", "מחר · 18:30", "24.10 · 08:00". */
function shortWhen(at) {
  const [d, t = ''] = String(at).split('T');
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const [, mm, dd] = d.split('-');
  const day = d === iso(now) ? 'היום' : d === iso(tomorrow) ? 'מחר' : `${Number(dd)}.${Number(mm)}`;
  return t ? `${day} · ${t.slice(0, 5)}` : day;
}

function RemindersCard({ tripId, canEdit }) {
  const { currentUid, currentUserProfile, memberProfiles, tripMembers } = useTrip();
  const confirm = useConfirm();

  const [reminders, setReminders] = useState([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('open');      // 'open' | 'done' | 'all'

  /* One composer at the bottom of the sheet, in one of two modes: writing a
     new reminder, or editing an existing one (editingId holds which). */
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draftUid, setDraftUid] = useState('');
  // When to be notified (Android app), 'YYYY-MM-DDTHH:mm' in the phone's time.
  const [draftAt, setDraftAt] = useState('');
  const [editFrom, setEditFrom] = useState(null);   // the reminder as the edit opened it
  const inputRef = useRef(null);

  useEffect(() => {
    if (!tripId) return undefined;
    return listen(collection(db, 'trips', tripId, 'reminders'), snap => {
      setReminders(snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    });
  }, [tripId]);

  const allMembers = useMemo(
    () => buildMemberList({ currentUid, currentUserProfile, tripMembers, memberProfiles }),
    [currentUid, currentUserProfile, memberProfiles, tripMembers],
  );

  const doneCount = reminders.filter(r => r.completed).length;
  const openOnes = reminders.filter(r => !r.completed);

  /* The tile cycles through the open reminders so more than one gets seen.
     What makes that bearable — and what the old strip never had — is the
     hairline underneath: it fills over the dwell, so the change is
     announced before it happens and you can decide to wait for it rather
     than being surprised by it. In fixed order, never shuffled: a list
     that reorders itself can't be followed.                            */
  const [tileIdx, setTileIdx] = useState(0);
  const cycleCount = openOnes.length;
  // Nothing moves while the sheet is open, or for a single reminder, or for
  // anyone who has asked the system for less motion.
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const cycling = cycleCount > 1 && !open && !reducedMotion;

  useEffect(() => {
    if (!cycling) return undefined;
    const t = setInterval(() => setTileIdx(i => i + 1), REMINDER_DWELL_MS);
    return () => clearInterval(t);
  }, [cycling, cycleCount]);

  // The list shrinks as things get ticked off, so never index past its end.
  const pos = cycleCount > 0 ? tileIdx % cycleCount : 0;
  const nextUp = cycleCount > 0 ? openOnes[pos] : null;

  const visible = filter === 'open' ? openOnes
    : filter === 'done' ? reminders.filter(r => r.completed)
      : reminders;

  const resetComposer = useCallback(() => {
    setDraft('');
    setEditingId(null);
    setDraftUid(currentUid || '');
    setDraftAt('');
  }, [currentUid]);

  const openSheet = (focus = false) => {
    resetComposer();
    setFilter('open');
    setOpen(true);
    if (focus && canEdit) setTimeout(() => inputRef.current?.focus(), 260);
  };

  const closeSheet = () => { setOpen(false); resetComposer(); };
  // A reminder typed but not added, or an edit not saved.
  const editingOne = editingId ? reminders.find(r => r.id === editingId) : null;
  const composerDirty = editingId
    ? draft !== (editingOne?.text || '') || draftAt !== (editingOne?.remindAt || '')
    : !!draft.trim() || !!draftAt;

  const toggleDone = (r) => {
    if (!canEdit) return;
    updateDoc(doc(db, 'trips', tripId, 'reminders', r.id), { completed: !r.completed });
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setDraft(r.text || '');
    setDraftUid(r.addedByUid || currentUid || '');
    setDraftAt(r.remindAt || '');
    setEditFrom({ text: (r.text || '').trim(), remindAt: r.remindAt || null, uid: r.addedByUid || '' });   // no owner yet: the edit gives it one
    setTimeout(() => inputRef.current?.focus(), 40);
  };

  const submit = (e) => {
    e?.preventDefault?.();
    const text = draft.trim();
    if (!text || !canEdit) return;

    /* A reminder always carries an owner — the avatar on the row depends on
       it — so fall back to the signed-in user when the picker is hidden on a
       solo trip, or when the chosen uid has since left. */
    const owner = allMembers.find(m => m.uid === draftUid) || (currentUid ? {
      uid: currentUid,
      displayName: currentUserProfile?.displayName || currentUserProfile?.email || '',
      photoURL: currentUserProfile?.photoURL || '',
    } : null);
    const ownerFields = owner ? {
      addedByUid: owner.uid,
      addedByName: owner.displayName || '',
      addedByPhoto: owner.photoURL || '',
    } : {};

    if (editingId) {
      // Only what the edit changed: a partner may have ticked it or moved
      // its time meanwhile (src/lib/changes.js).
      const updates = changedFields(editFrom || {}, { text, remindAt: draftAt || null });
      if (owner && owner.uid !== editFrom?.uid) Object.assign(updates, ownerFields);
      if (Object.keys(updates).length) {
        updateDoc(doc(db, 'trips', tripId, 'reminders', editingId), updates).catch(err => console.error('Reminder save error:', err));
      }
    } else {
      setDoc(doc(collection(db, 'trips', tripId, 'reminders')), {
        text, createdAt: Date.now(), completed: false, ...ownerFields,
        ...(draftAt ? { remindAt: draftAt } : {}),
      });
      if (filter === 'done') setFilter('open');
    }
    resetComposer();
    // Keep the keyboard up: several reminders usually arrive together.
    if (!editingId) inputRef.current?.focus();
  };

  const remove = async (r) => {
    const ok = await confirm({
      title: 'מחיקת תזכורת',
      message: <span>למחוק את <strong>{r.text}</strong>?</span>,
      confirmText: 'מחק', cancelText: 'בטל', danger: true,
    });
    if (!ok) return false;
    if (editingId === r.id) resetComposer();
    deleteDoc(doc(db, 'trips', tripId, 'reminders', r.id));
    return true;
  };

  const clearDone = async () => {
    const done = reminders.filter(r => r.completed);
    if (done.length === 0) return;
    const ok = await confirm({
      title: 'ניקוי שבוצעו',
      message: `למחוק ${done.length} תזכורות שכבר בוצעו?`,
      confirmText: 'מחק', cancelText: 'בטל', danger: true,
    });
    if (!ok) return;
    const batch = writeBatch(db);
    done.forEach(r => batch.delete(doc(db, 'trips', tripId, 'reminders', r.id)));
    batch.commit();
    setFilter('open');
  };

  const TABS = [
    { key: 'open', label: 'פתוחות', n: openOnes.length },
    { key: 'done', label: 'בוצעו', n: doneCount },
    { key: 'all', label: 'הכל', n: reminders.length },
  ];

  return (
    <>
      {/* ── Tile ────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => openSheet(reminders.length === 0)}
        className="glass-card"
        aria-label="תזכורות"
        aria-live="polite"
        style={{
          direction: 'rtl', width: '100%', textAlign: 'right', cursor: 'pointer',
          border: 'var(--card-border)', fontFamily: 'var(--font-hebrew)',
          /* .glass-card is a flex *column*; these rows are horizontal, so the
             direction has to be stated or the parts stack. */
          padding: '12px 14px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12,
          minHeight: 68,
        }}
      >
        {cycleCount > 0
          ? <CycleRing index={pos} count={cycleCount} animate={cycling} />
          : (
            <div style={{
              width: 44, height: 44, borderRadius: 14, flexShrink: 0,
              background: 'var(--p-8)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bell size={20} />
            </div>
          )}

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.4px' }}>
            תזכורות
          </span>
          <span
            key={nextUp?.id || 'none'}
            className={cycling ? 'reminder-swap' : undefined}
            style={{
              fontSize: 14.5, fontWeight: 700, color: nextUp ? 'var(--text-main)' : 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4,
            }}
          >
            {nextUp ? nextUp.text
              : reminders.length > 0 ? 'הכל בוצע 🎉'
                : canEdit ? 'הוסף תזכורת ראשונה' : 'אין תזכורות'}
          </span>
        </div>

        <ChevronLeft size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>

      {/* ── The one sheet ────────────────────────────────────────────────
          Everything happens here. Drag it down to close, as everywhere
          else in the app. */}
      {open && (
        <Sheet
          label="תזכורות"
          onClose={closeSheet}
          dirty={composerDirty}
          // One height for every filter: the sheet no longer jumps as
          // "פתוחות", "בוצעו" and "הכל" show more or fewer rows.
          style={{ height: 'min(88vh, 100vh - 32px)' }}
          header={({ cancel }) => (
            <div className="modal-header" style={{ gap: 10 }}>
              <h2 style={{ flex: 1 }}>תזכורות</h2>
              {doneCount > 0 && canEdit && (
                <button
                  type="button" onClick={clearDone}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px',
                    fontFamily: 'var(--font-hebrew)', fontSize: 12.5, fontWeight: 700,
                    color: 'var(--text-muted)',
                  }}
                >
                  נקה שבוצעו
                </button>
              )}
              <button type="button" className="btn-close" onClick={cancel} aria-label="סגור">✕</button>
            </div>
          )}
        >
          {/* Filter — a visible state, not a hidden mode */}
          {reminders.length > 0 && (
            <Segmented
              label="סינון תזכורות"
              value={filter}
              onChange={setFilter}
              options={TABS.map(t => ({ key: t.key, label: t.n > 0 ? `${t.label} ${t.n}` : t.label }))}
            />
          )}

          {/* Fills the sheet, so the composer sits at its foot however
              few rows there are. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 0 auto' }}>
            {visible.length === 0 ? (
              <EmptyState
                icon={filter === 'open' && reminders.length > 0 ? Check : Bell}
                title={filter === 'done' ? 'עוד לא בוצעה אף תזכורת'
                  : filter === 'open' && reminders.length > 0 ? 'אין תזכורות פתוחות, הכל בוצע'
                    : 'אין תזכורות'}
                hint={filter === 'all' || reminders.length === 0
                  ? (canEdit ? 'כתבו תזכורת בשדה שלמטה. כל מי שבטיול יראה אותה.' : null)
                  : null}
              />
            ) : visible.map(r => {
              const done = !!r.completed;
              const editing = editingId === r.id;
              return (
                <ListCard
                  key={r.id}
                  style={{ padding: '12px 14px', ...(editing ? { background: 'var(--p-8)', boxShadow: '0 0 0 1px var(--p-18)' } : null) }}
                  lead={(
                    <CheckCircle
                      checked={done}
                      onToggle={canEdit ? () => toggleDone(r) : undefined}
                      label={done ? 'בטל סימון' : 'סמן כבוצע'}
                    />
                  )}
                  title={r.text}
                  meta={r.remindAt ? formatHebrewDateTime(r.remindAt) : undefined}
                  metaIcon={r.remindAt ? <Bell size={13} aria-hidden="true" /> : undefined}
                  muted={done && !editing}
                  onOpen={canEdit ? () => startEdit(r) : undefined}
                  trailing={(r.addedByPhoto || r.addedByName) && (
                    <span title={r.addedByName || ''} style={{ flexShrink: 0, opacity: done ? 0.4 : 0.9 }}>
                      <Avatar photoURL={r.addedByPhoto} name={r.addedByName} size={26} />
                    </span>
                  )}
                  actions={canEdit ? [
                    { key: 'del', label: 'מחיקה', Icon: Trash2, run: () => remove(r), danger: true, swipe: true },
                  ] : []}
                />
              );
            })}
          </div>

          {/* ── Composer ──────────────────────────────────────────────────
              Add and edit live in the same field. Editing never opens a
              second sheet, so the list stays visible behind the keyboard.
              One box, as in a chat: the text and send on top, under them
              whose it is and when to ring. Nothing in it scrolls sideways,
              so no avatar's ring is ever cut off. */}
          {canEdit && (
            <form onSubmit={submit} className="sheet-footer reminder-footer">
              {editingId && (
                <div className="reminder-editing">
                  <Pencil size={12} aria-hidden="true" />
                  <span>עריכת תזכורת</span>
                  <button type="button" className="btn-x" onClick={resetComposer} aria-label="בטל עריכה">
                    <X size={12} />
                  </button>
                  {editingOne && (
                    <button type="button" className="danger" onClick={() => remove(editingOne)} aria-label="מחיקת התזכורת" title="מחיקה">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )}

              <div className="reminder-composer">
                <div className="reminder-composer-row">
                  <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') resetComposer(); }}
                    enterKeyHint={editingId ? 'done' : 'send'}
                    placeholder={editingId ? 'עדכן את התזכורת...' : 'כתוב תזכורת ושלח...'}
                    aria-label="טקסט התזכורת"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    aria-label={editingId ? 'שמור תזכורת' : 'הוסף תזכורת'}
                    className={`round-btn${draft.trim() ? ' on' : ''}`}
                    style={{ width: 40, height: 40, minWidth: 40 }}
                  >
                    {editingId ? <Check size={19} strokeWidth={3} /> : <ArrowUp size={19} strokeWidth={3} />}
                  </button>
                </div>

                <div className="reminder-tools">
                  {allMembers.length > 1 && (
                    <div className="reminder-owners" role="radiogroup" aria-label="של מי">
                      {allMembers.map(m => (
                        <button
                          key={m.uid} type="button" role="radio"
                          aria-checked={draftUid === m.uid}
                          onClick={() => setDraftUid(m.uid)}
                          title={m.displayName}
                          aria-label={m.displayName}
                        >
                          <Avatar photoURL={m.photoURL} name={m.displayName} size={28} />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* An optional time: the owner's phone (Android app) is
                      notified then. */}
                  <CustomDateTimePicker
                    value={draftAt}
                    onChange={setDraftAt}
                    renderTrigger={(openPicker) => draftAt ? (
                      <span className="chip reminder-when" aria-pressed="true">
                        <button type="button" onClick={openPicker} aria-label={`שעת ההתראה: ${formatHebrewDateTime(draftAt)}. שינוי`}>
                          <Bell size={14} aria-hidden="true" /> {shortWhen(draftAt)}
                        </button>
                        <button type="button" className="btn-x" aria-label="בלי שעה" onClick={() => setDraftAt('')}>
                          <X size={14} />
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="chip add reminder-when" onClick={openPicker}>
                        <Bell size={14} aria-hidden="true" /> שעה להתראה
                      </button>
                    )}
                  />
                </div>
              </div>
            </form>
          )}
        </Sheet>
      )}
    </>
  );
}

/* ── SortableCategoryBlock ──────────────────────────────────────────────── */
function SortableCategoryBlock({
  category, categoryItems, isOpen, doneCount, canEdit,
  editingCat, editCatText, setEditCatText, setEditingCat, handleRenameCategory,
  toggleCategory, handleDeleteCategory,
  handleToggle, handleStartEdit, handleDeleteItem,
  quickAddCat, setQuickAddCat, quickAddText, setQuickAddText,
  quickAddInputRef, handleQuickAdd,
  allMembers,
}) {
  const listRef = useRef(null);
  useFlip(listRef);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={{ ...style, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Category header */}
      {editingCat === category ? (
        <div className="section-header">
          <form onSubmit={e => { e.preventDefault(); handleRenameCategory(category, editCatText); }}
            style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text" autoFocus className="form-control"
              value={editCatText} onChange={e => setEditCatText(e.target.value)}
              style={{ flex: 1, minHeight: 40 }}
            />
            <button type="submit" aria-label="שמור שם" className="round-btn on" style={{ width: 38, height: 38, minWidth: 38 }}>
              <Check size={16} />
            </button>
            <button type="button" aria-label="בטל" onClick={() => setEditingCat(null)} className="round-btn" style={{ width: 38, height: 38, minWidth: 38, background: 'var(--surface-2)' }}>
              <X size={16} />
            </button>
          </form>
        </div>
      ) : (
        <SectionHeader
          // The planning pool's group header (8.63.0); its rule fills with
          // the accent as the category gets packed.
          className="plan-group-head group-progress"
          style={{ '--done': `${categoryItems.length ? Math.round((doneCount / categoryItems.length) * 100) : 0}%` }}
          title={category}
          count={`${doneCount}/${categoryItems.length}`}
          collapsed={!isOpen}
          onToggle={() => toggleCategory(category)}
          lead={canEdit && (
          <button type="button" {...attributes} {...listeners} aria-label="גרור לשינוי סדר" className="section-header-grip">
            <GripVertical size={15} />
          </button>
          )}
          actions={canEdit ? [
            { key: 'rename', label: 'שינוי שם', Icon: Pencil, run: () => { setEditingCat(category); setEditCatText(category); } },
            { key: 'del', label: 'מחיקת הקטגוריה', Icon: Trash2, run: () => handleDeleteCategory(category), danger: true },
          ] : null}
        />
      )}

      {/* Category items + quick-add */}
      {isOpen && (
        <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {categoryItems.map((item, idx) => {
            const assigned = Array.isArray(item.assignedTo) ? item.assignedTo
              : item.assignedTo ? [item.assignedTo] : [];
            return (
              <div key={item.id} data-flip={item.id}>
              <ListCard
                className="list-in"
                // Cap the stagger so the tail of a long list isn't delayed.
                style={{ '--i': Math.min(idx, 8), padding: '12px 14px' }}
                lead={(
                  <CheckCircle
                    checked={!!item.completed}
                    onToggle={canEdit ? () => handleToggle(item) : undefined}
                    label={item.completed ? 'בטל סימון' : 'סמן כבוצע'}
                  />
                )}
                title={item.text}
                muted={!!item.completed}
                // The circle ticks; the rest of the row opens the item's
                // sheet: its text, category, who it is for, and delete.
                onOpen={canEdit ? () => handleStartEdit(item) : undefined}
                trailing={assigned.length > 0 && (
                  <span aria-label={`שייך ל: ${assigned.map(uid => allMembers.find(x => x.uid === uid)?.displayName).filter(Boolean).join(', ')}`}
                    style={{ padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}>

                          <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center' }}>
                            {assigned.slice(0, 3).map((uid, idx) => {
                              const m = allMembers.find(x => x.uid === uid);
                              return (
                                <div key={uid}
                                  className={m?.former ? 'person-former' : undefined}
                                  title={m?.former ? `${m.displayName} — כבר לא בטיול` : m?.displayName}
                                  style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--surface)', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, marginLeft: idx > 0 ? -6 : 0, position: 'relative', zIndex: assigned.length - idx }}>
                                  {m?.photoURL
                                    ? <img src={m.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                                    : <span style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>{(m?.displayName || '?')[0]}</span>
                                  }
                                </div>
                              );
                            })}
                            {assigned.length > 3 && (
                              <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--surface)', background: 'var(--ink-8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0, marginLeft: -6 }}>
                                +{assigned.length - 3}
                              </div>
                            )}
                          </div>
                  </span>
                )}
                actions={canEdit ? [
                  { key: 'del', label: 'מחיקה', Icon: Trash2, run: () => handleDeleteItem(item.id), danger: true, swipe: true },
                ] : []}
              />
              </div>
            );
          })}

          {/* Quick-add inside open category */}
          {canEdit && (
            quickAddCat === category ? (
              <form onSubmit={e => handleQuickAdd(e, category)}
                style={{ display: 'flex', gap: 6, padding: '2px 0' }}>
                <input
                  ref={quickAddInputRef}
                  type="text"
                  className="form-control"
                  autoFocus
                  placeholder={`פריט ב${category}...`}
                  value={quickAddText}
                  onChange={e => setQuickAddText(e.target.value)}
                  style={{ flex: 1, minHeight: 38, fontSize: 13 }}
                />
                <button type="submit" className="round-btn on" aria-label="הוסף" title="הוסף">
                  <Plus size={16} />
                </button>
                <button type="button" className="btn-x" aria-label="ביטול" title="ביטול" onClick={() => { setQuickAddCat(null); setQuickAddText(''); }}>
                  <X size={16} />
                </button>
              </form>
            ) : (
              <button type="button" className="chip add" style={{ alignSelf: 'flex-start' }}
                aria-label={`הוסף פריט ל${category}`}
                onClick={() => { setQuickAddCat(category); setQuickAddText(''); }}>
                <Plus size={14} /> פריט
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}


export default function ChecklistTab({ tripId }) {
  const { canEdit, tripMembers, currentUid, currentUserProfile, memberProfiles, formerMembers } = useTrip();
  const confirm = useConfirm();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletedGlobalIds, setDeletedGlobalIds] = useState([]);
  const [extraCategories, setExtraCategories] = useState([]);
  const [categoryOrder, setCategoryOrder] = useState([]);
  const [membersGlobalChecklists, setMembersGlobalChecklists] = useState({});

  // Form state
  const [newItemText, setNewItemText] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('מסמכים וסידורים');
  const [newItemAssignedTo, setNewItemAssignedTo] = useState([]);
  const [editingItemId, setEditingItemId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Filter by assigned user
  const [filterAssignee, setFilterAssignee] = useState(null);
  const [filterCategory, setFilterCategory] = useState(null);

  /* A ticked item goes to the bottom of its category, but not at once: the
     tick shows first, then the row glides down (useFlip). An unticked one
     comes back up the same way. Ids still settling keep their place. */
  const [settling, setSettling] = useState(() => new Set());
  const settle = (id) => {
    setSettling(prev => new Set(prev).add(id));
    setTimeout(() => setSettling(prev => { const next = new Set(prev); next.delete(id); return next; }), 650);
  };

  // Category open/close — default ALL closed (empty obj = all closed)
  const [openCategories, setOpenCategories] = useState({});

  const [editingCat, setEditingCat] = useState(null);
  const [editCatText, setEditCatText] = useState('');

  // Quick-add inside an open category
  const [quickAddCat, setQuickAddCat] = useState(null);
  const [quickAddText, setQuickAddText] = useState('');
  const quickAddInputRef = useRef(null);

  const defaultCategoryNames = [
    'מסמכים וסידורים', 'בגדים', 'אלקטרוניקה',
    'תרופות ועזרה ראשונה', 'סידורים אחרונים בארץ',
  ];
  const categories = useMemo(() => {
    const all = Array.from(new Set([
      ...defaultCategoryNames,
      ...extraCategories,
      ...items.map(i => i.category).filter(Boolean),
    ]));
    if (!categoryOrder.length) return all;
    const ordered = categoryOrder.filter(c => all.includes(c));
    const rest = all.filter(c => !categoryOrder.includes(c));
    return [...ordered, ...rest];
  }, [extraCategories, items, categoryOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Anyone still carrying an assignment keeps their place in the list,
  // member or not — otherwise their rows lose their name and there is no
  // chip to find them by.
  const assignedUids = useMemo(() => {
    const set = new Set();
    items.forEach(it => {
      const a = Array.isArray(it.assignedTo) ? it.assignedTo : (it.assignedTo ? [it.assignedTo] : []);
      a.forEach(uid => set.add(uid));
    });
    return set;
  }, [items]);

  const allMembers = useMemo(() => buildMemberList({
    currentUid, currentUserProfile, tripMembers, memberProfiles,
    formerMembers, stillReferenced: assignedUids,
  }), [currentUid, currentUserProfile, memberProfiles, tripMembers, formerMembers, assignedUids]);

  const duplicateSuggestions = useMemo(() => {
    if (!newItemText.trim() || newItemText.trim().length < 2) return [];
    const q = newItemText.toLowerCase();
    return items.filter(i => i.id !== editingItemId && i.text.toLowerCase().includes(q));
  }, [items, newItemText, editingItemId]);

  // ── Firestore listeners ──────────────────────────────────────────────────
  // Both listeners also say for which trip the server has confirmed what
  // they show (`metadata`): the copy of global items below waits for that.
  // A snapshot that only confirms leaves the rest of the state as it is.
  const [itemsConfirmedFor, setItemsConfirmedFor] = useState(null);
  const [syncConfirmedFor, setSyncConfirmedFor] = useState(null);

  useEffect(() => {
    if (!tripId) return;
    let first = true;
    return listen(collection(db, 'trips', tripId, 'checklist'), snap => {
      if (first || snap.docChanges().length) setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      first = false;
      setItemsConfirmedFor(snap.metadata.fromCache ? null : tripId);
      setLoading(false);
    }, () => setLoading(false), { metadata: true });   // refused for good: not a skeleton forever
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;
    let seen = null;
    return listen(doc(db, 'trips', tripId, 'settings', 'checklistSync'), snap => {
      setSyncConfirmedFor(snap.metadata.fromCache ? null : tripId);
      const data = snap.exists() ? snap.data() : {};
      const json = JSON.stringify(data);
      if (json === seen) return;
      seen = json;
      setDeletedGlobalIds(data.deletedGlobalIds || []);
      setExtraCategories(data.extraCategories || []);
      setCategoryOrder(data.categoryOrder || []);
    }, undefined, { metadata: true });
  }, [tripId]);

  useEffect(() => {
    const uids = Object.keys(tripMembers);
    if (uids.length === 0) return;
    const unsubs = uids.map(uid =>
      onSnapshot(doc(db, 'users', uid), snap => {
        setMembersGlobalChecklists(prev => ({
          ...prev, [uid]: snap.data()?.globalChecklist || [],
        }));
      })
    );
    return () => unsubs.forEach(u => u());
  }, [tripMembers]);

  // ── Merged global checklist (all members, deduped) ───────────────────────
  const mergedGlobalChecklist = useMemo(() => {
    const seen = new Set();
    return Object.values(membersGlobalChecklists).flat().filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [membersGlobalChecklists]);

  // ── Auto-sync missing global items (src/lib/checklistSync.js) ────────────
  useEffect(() => {
    if (!tripId || !canEdit || !mergedGlobalChecklist.length) return;
    if (itemsConfirmedFor !== tripId || syncConfirmedFor !== tripId) return;
    const missing = missingGlobalItems(mergedGlobalChecklist, items, deletedGlobalIds);
    if (!missing.length) return;
    copyGlobalItems(db, tripId, missing).catch(console.error);
  }, [mergedGlobalChecklist, items, itemsConfirmedFor, syncConfirmedFor, tripId, canEdit, deletedGlobalIds]);

  // ── DnD sensors ─────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = categories.indexOf(active.id);
    const newIdx = categories.indexOf(over.id);
    const newOrder = arrayMove(categories, oldIdx, newIdx);
    setCategoryOrder(newOrder);
    const syncRef = doc(db, 'trips', tripId, 'settings', 'checklistSync');
    setDoc(syncRef, { categoryOrder: newOrder }, { merge: true }).catch(err => console.error('Category order save error:', err));
  };

  // ── Category helpers ─────────────────────────────────────────────────────
  const toggleCategory = (cat) =>
    setOpenCategories(prev => ({ ...prev, [cat]: !prev[cat] }));


  const saveExtraCategory = async (cat) => {
    if (!cat || !tripId || extraCategories.includes(cat)) return;
    const syncRef = doc(db, 'trips', tripId, 'settings', 'checklistSync');
    // Not awaited: offline the write waits for the network (the form goes on).
    setDoc(syncRef, { extraCategories: arrayUnion(cat) }, { merge: true }).catch(err => console.error('Category save error:', err));
  };

  const handleDeleteCategory = async (cat) => {
    const catItems = items.filter(i => i.category === cat);
    const ok = await confirm({
      title: 'מחיקת קטגוריה',
      message: catItems.length > 0
        ? `האם למחוק את "${cat}" ואת ${catItems.length} הפריטים שבה?`
        : `האם למחוק את הקטגוריה "${cat}"?`,
      confirmText: 'מחק', cancelText: 'בטל', danger: true,
    });
    if (!ok) return;

    // Optimistic state updates BEFORE batch so the re-sync effect doesn't
    // immediately re-add deleted global items or show the empty category again.
    const deletingGlobalIds = catItems
      .filter(item => mergedGlobalChecklist.some(g => g.id === item.id))
      .map(i => i.id);
    const newDeletedIds = [...new Set([...deletedGlobalIds, ...deletingGlobalIds])];
    const newExtraCategories = extraCategories.filter(c => c !== cat);
    const newCategoryOrder = categoryOrder.filter(c => c !== cat);
    setDeletedGlobalIds(newDeletedIds);
    setExtraCategories(newExtraCategories);
    setCategoryOrder(newCategoryOrder);

    const syncRef = doc(db, 'trips', tripId, 'settings', 'checklistSync');
    // One batch: another phone never sees the items gone while their ids
    // are not yet in deletedGlobalIds, and copies them back in.
    const batch = writeBatch(db);
    batch.set(syncRef, {
      // Only what changed, so a partner's change to these lists stays.
      ...(deletingGlobalIds.length ? { deletedGlobalIds: arrayUnion(...deletingGlobalIds) } : {}),
      extraCategories: arrayRemove(cat),
      categoryOrder: arrayRemove(cat),
    }, { merge: true });
    catItems.forEach(item => batch.delete(doc(db, 'trips', tripId, 'checklist', item.id)));
    batch.commit().catch(console.error);
  };

  const handleRenameCategory = async (oldCat, newCat) => {
    const trimmed = newCat.trim();
    setEditingCat(null);
    if (!trimmed || trimmed === oldCat) return;
    const catItems = items.filter(i => i.category === oldCat);
    const batch = writeBatch(db);
    catItems.forEach(item =>
      batch.update(doc(db, 'trips', tripId, 'checklist', item.id), { category: trimmed })
    );
    batch.commit().catch(err => console.error('Category rename error:', err));
  };

  // ── Item actions ─────────────────────────────────────────────────────────
  const handleToggle = (item) => {
    if (!tripId) return;
    settle(item.id);
    updateDoc(doc(db, 'trips', tripId, 'checklist', item.id), {
      completed: !item.completed,
    });
  };

  const handleDeleteItem = async (id, text) => {
    if (!tripId) return;
    const ok = await confirm({
      title: text ? 'מחיקת פריט' : undefined,
      message: text ? <span>למחוק את <strong>{text}</strong> מהרשימה?</span> : 'למחוק את הפריט?',
      confirmText: 'מחק', cancelText: 'בטל', danger: true,
    });
    if (!ok) return false;
    // Optimistically update deletedGlobalIds BEFORE deleteDoc so the re-sync
    // effect (which runs when items changes) doesn't immediately re-add the item.
    const isGlobal = mergedGlobalChecklist.some(g => g.id === id);
    if (isGlobal) {
      const newDeletedIds = [...new Set([...deletedGlobalIds, id])];
      setDeletedGlobalIds(newDeletedIds);
      const syncRef = doc(db, 'trips', tripId, 'settings', 'checklistSync');
      setDoc(syncRef, { deletedGlobalIds: arrayUnion(id) }, { merge: true });
    }
    deleteDoc(doc(db, 'trips', tripId, 'checklist', id));
    return true;
  };

  // The add/edit form lives in a sheet, opened by the floating button.
  // Both entry points go through these two so the fields can never carry
  // over from a previous edit into a fresh add.
  const resetItemForm = () => {
    setEditingItemId(null);
    setNewItemText('');
    setNewItemCategory('מסמכים וסידורים');
    setNewItemAssignedTo([]);
  };

  // What the form held when it opened: closing it unchanged is free.
  const [itemBaseline, setItemBaseline] = useState(null);
  const itemKey = (text, category, assigned) => JSON.stringify([text, category, assigned]);
  const itemFormDirty = () => itemKey(newItemText, newItemCategory, newItemAssignedTo) !== itemBaseline;

  const openAddSheet = () => {
    resetItemForm();
    setItemBaseline(itemKey('', 'מסמכים וסידורים', []));
    setShowAddForm(true);
  };
  const closeAddSheet = () => { setShowAddForm(false); resetItemForm(); };

  const doAdd = (overrideCategory) => {
    const text = newItemText.trim();
    if (!text || !tripId) return;
    const cat = overrideCategory !== undefined ? overrideCategory : newItemCategory;
    const assigned = newItemAssignedTo.length > 0 ? newItemAssignedTo : null;
    if (editingItemId) {
      // Only what the edit changed (src/lib/changes.js).
      const [t0, c0, a0] = itemBaseline ? JSON.parse(itemBaseline) : [];
      const updates = changedFields(
        { text: (t0 || '').trim(), category: c0, assignedTo: a0?.length ? a0 : null },
        { text, category: cat, assignedTo: assigned },
      );
      if (Object.keys(updates).length) {
        updateDoc(doc(db, 'trips', tripId, 'checklist', editingItemId), updates).catch(err => console.error('Checklist save error:', err));
      }
    } else {
      setDoc(doc(db, 'trips', tripId, 'checklist', 'custom-' + Date.now()), {
        text, completed: false, category: cat, assignedTo: assigned,
      });
    }
    // Saving dismisses the sheet. Adding several items in a row is what the
    // per-category "הוסף לרשימה" row is for, and it stays where it was.
    closeAddSheet();
  };

  const handleAdd = (e) => { e.preventDefault(); doAdd(); };

  const handleStartEdit = (item) => {
    setEditingItemId(item.id);
    setNewItemText(item.text);
    setNewItemCategory(item.category);
    const a = item.assignedTo;
    const assigned = Array.isArray(a) ? a : a ? [a] : [];
    setNewItemAssignedTo(assigned);
    setItemBaseline(itemKey(item.text, item.category, assigned));
    setShowAddForm(true);
  };

  const handleQuickAdd = (e, cat) => {
    e.preventDefault();
    if (!quickAddText.trim() || !tripId) return;
    const text = quickAddText.trim();
    setQuickAddText('');
    setQuickAddCat(null);
    setDoc(doc(db, 'trips', tripId, 'checklist', 'custom-' + Date.now()), {
      text, completed: false, category: cat,
    });
  };

  const totalCount = items.length;

  if (loading) {
    return <Skeleton rows={5} label="טוען רשימת ציוד" />;
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Reminders — compact strip; add/edit happen in a sheet */}
      <RemindersCard tripId={tripId} canEdit={canEdit} />

      {/* One row: the filter (category and member, combined) and how much
          of what it shows is packed. */}
      {totalCount > 0 && (
        <ChecklistToolbar
          items={items}
          categories={categories}
          members={allMembers}
          category={filterCategory}
          onCategory={setFilterCategory}
          member={filterAssignee}
          onMember={setFilterAssignee}
        />
      )}

      {canEdit && <Fab label="פריט חדש" onClick={openAddSheet} />}

      {/* Add / edit one item */}
      {canEdit && showAddForm && (
        <Sheet
          title={editingItemId ? 'עריכת פריט' : 'פריט חדש לרשימה'}
          onClose={closeAddSheet}
          dirty={itemFormDirty()}
          style={{ maxHeight: '88vh' }}
        >
          {({ cancel, close }) => (
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>מה להביא?</label>
                  <input type="text" className="form-control" placeholder="למשל: סוודר, מטען"
                    value={newItemText} onChange={e => setNewItemText(e.target.value)} required />
                  {/* Already on the list: each one can go from here, after
                      a confirmation, without leaving the form. */}
                  {duplicateSuggestions.length > 0 && (
                    <div className="dup-box" role="group" aria-label="פריטים דומים כבר ברשימה">
                      <span className="dup-box-title">פריטים דומים כבר ברשימה:</span>
                      {duplicateSuggestions.slice(0, 4).map(s => (
                        <div key={s.id} className="dup-row">
                          <span className="dup-row-text">{s.text}</span>
                          <span className="dup-row-cat">{s.category}</span>
                          <button type="button" className="btn-x danger" aria-label={`מחיקת ${s.text}`} title="מחיקה"
                            onClick={() => handleDeleteItem(s.id, s.text)}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <CustomDropdown
                  label="קטגוריה" value={newItemCategory} onChange={setNewItemCategory}
                  options={categories} addable addLabel="הוסף קטגוריה חדשה"
                  onCommit={cat => saveExtraCategory(cat)}
                />
                {allMembers.length > 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>שייך ל (ניתן לבחור כמה)</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {/* Current members, and someone who has left only while
                          the item is still theirs (to hand it on): a new
                          assignment to them would be a dead end. */}
                      {allMembers.filter(m => !m.former || newItemAssignedTo.includes(m.uid)).map(m => {
                        const isSelected = newItemAssignedTo.includes(m.uid);
                        return (
                          <button type="button" key={m.uid}
                            className={m.former ? 'person-former' : undefined}
                            onClick={() => setNewItemAssignedTo(prev =>
                              prev.includes(m.uid) ? prev.filter(x => x !== m.uid) : [...prev, m.uid]
                            )}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, border: isSelected ? '1.5px solid var(--accent)' : '1.5px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: isSelected ? 'var(--p-10)' : 'var(--ink-5)', color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>
                            {m.photoURL
                              ? <img src={m.photoURL} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} referrerPolicy="no-referrer" />
                              : <div style={{ width: 18, height: 18, borderRadius: '50%', background: isSelected ? 'var(--brand)' : 'var(--lavender)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: isSelected ? 'var(--brand-fg)' : 'var(--text)', fontWeight: 800, flexShrink: 0 }}>{(m.displayName || '?')[0]}</div>
                            }
                            {m.displayName}
                            {isSelected && <Check size={12} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="sheet-footer">
                <button type="submit" className="btn-primary">שמור</button>
                <button type="button" className="btn-secondary" onClick={cancel}>ביטול</button>
                {editingItemId && <SheetDelete close={close} onDelete={() => handleDeleteItem(editingItemId)} />}
              </div>
            </form>
          )}
        </Sheet>
      )}

      {totalCount > 0 && (filterCategory || filterAssignee) && !items.some(it =>
        (!filterCategory || it.category === filterCategory)
        && (!filterAssignee || (Array.isArray(it.assignedTo) ? it.assignedTo : [it.assignedTo]).includes(filterAssignee))
      ) && (
        <EmptyState icon={ClipboardList} title="אין פריטים בסינון הזה" hint="בחרו קטגוריה או חבר אחרים בסינון." />
      )}

      {totalCount === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="הרשימה ריקה"
          hint={canEdit
            ? 'כל פריט נכנס לקטגוריה ואפשר לשייך אותו למי שאחראי עליו. הרשימה הקבועה שלכם נטענת לכאן אוטומטית בטיול חדש.'
            : 'עוד לא נוספו פריטים לרשימת הציוד של הטיול.'}
        />
      )}

      {/* Checklist categories — sortable, all closed by default */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={categories} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {categories.filter(c => !filterCategory || c === filterCategory).map((category) => {
              // What is still to pack first, what is packed below it.
              // (An item still settling counts as it was before the tap.)
              const sunk = (item) => (!!item.completed !== settling.has(item.id) ? 1 : 0);
              const categoryItems = items.filter(item => {
                if (item.category !== category) return false;
                if (filterAssignee !== null) {
                  const a = Array.isArray(item.assignedTo) ? item.assignedTo : (item.assignedTo ? [item.assignedTo] : []);
                  if (!a.includes(filterAssignee)) return false;
                }
                return true;
              }).sort((a, b) => sunk(a) - sunk(b));
              if (categoryItems.length === 0 && (filterAssignee !== null || !extraCategories.includes(category))) return null;
              // A category picked in the filter shows its items right away.
              const isOpen = filterCategory === category || !!openCategories[category];
              const doneCount = categoryItems.filter(i => i.completed).length;
              return (
                <SortableCategoryBlock
                  key={category}
                  category={category}
                  categoryItems={categoryItems}
                  isOpen={isOpen}
                  doneCount={doneCount}
                  canEdit={canEdit}
                  editingCat={editingCat}
                  editCatText={editCatText}
                  setEditCatText={setEditCatText}
                  setEditingCat={setEditingCat}
                  handleRenameCategory={handleRenameCategory}
                  toggleCategory={toggleCategory}
                  handleDeleteCategory={handleDeleteCategory}
                  handleToggle={handleToggle}
                  handleStartEdit={handleStartEdit}
                  handleDeleteItem={handleDeleteItem}
                  quickAddCat={quickAddCat}
                  setQuickAddCat={setQuickAddCat}
                  quickAddText={quickAddText}
                  setQuickAddText={setQuickAddText}
                  quickAddInputRef={quickAddInputRef}
                  handleQuickAdd={handleQuickAdd}
                  allMembers={allMembers}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>


    </div>
  );
}
