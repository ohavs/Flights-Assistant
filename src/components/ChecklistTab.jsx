import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { Check, Plus, Trash2, Pencil, ChevronDown, X, GripVertical, User, ClipboardList, Bell, ChevronLeft, ArrowUp } from 'lucide-react';
import { CustomDropdown } from './CustomDatePicker';
import Skeleton from './Skeleton';
import ListCard from '../ui/ListCard';
import SectionHeader from '../ui/SectionHeader';
import { CheckCircle } from '../ui/kit';
import Fab from './Fab';
import EmptyState from './EmptyState';
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
  const inputRef = useRef(null);

  useEffect(() => {
    if (!tripId) return undefined;
    return onSnapshot(collection(db, 'trips', tripId, 'reminders'), snap => {
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
  }, [currentUid]);

  const openSheet = (focus = false) => {
    resetComposer();
    setFilter('open');
    setOpen(true);
    if (focus && canEdit) setTimeout(() => inputRef.current?.focus(), 260);
  };

  const closeSheet = () => { setOpen(false); resetComposer(); };
  // A reminder typed but not added, or an edit not saved.
  const composerDirty = editingId
    ? draft !== (reminders.find(r => r.id === editingId)?.text || '')
    : !!draft.trim();

  const toggleDone = (r) => {
    if (!canEdit) return;
    updateDoc(doc(db, 'trips', tripId, 'reminders', r.id), { completed: !r.completed });
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setDraft(r.text || '');
    setDraftUid(r.addedByUid || currentUid || '');
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
      updateDoc(doc(db, 'trips', tripId, 'reminders', editingId), { text, ...ownerFields });
    } else {
      setDoc(doc(collection(db, 'trips', tripId, 'reminders')), {
        text, createdAt: Date.now(), completed: false, ...ownerFields,
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
    if (!ok) return;
    if (editingId === r.id) resetComposer();
    deleteDoc(doc(db, 'trips', tripId, 'reminders', r.id));
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
          style={{ maxHeight: 'min(88vh, 100vh - 32px)' }}
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                  muted={done && !editing}
                  onOpen={canEdit ? () => toggleDone(r) : undefined}
                  trailing={(r.addedByPhoto || r.addedByName) && (
                    <span title={r.addedByName || ''} style={{ flexShrink: 0, opacity: done ? 0.4 : 0.9 }}>
                      <Avatar photoURL={r.addedByPhoto} name={r.addedByName} size={26} />
                    </span>
                  )}
                  actions={canEdit ? [
                    { key: 'edit', label: 'עריכה', Icon: Pencil, run: () => startEdit(r), swipe: true },
                    { key: 'del', label: 'מחיקה', Icon: Trash2, run: () => remove(r), danger: true, swipe: true },
                  ] : []}
                />
              );
            })}
          </div>

          {/* ── Composer ──────────────────────────────────────────────────
              Add and edit live in the same field. Editing never opens a
              second sheet, so the list stays visible behind the keyboard. */}
          {canEdit && (
            <form
              onSubmit={submit}
              className="sheet-footer"
              style={{ flexDirection: 'column', gap: 8, marginTop: 0 }}
            >
              {editingId && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
                  background: 'var(--p-10)', color: 'var(--accent)', borderRadius: 20,
                  padding: '3px 6px 3px 12px', fontSize: 12, fontWeight: 800,
                }}>
                  <Pencil size={12} />
                  <span>עריכת תזכורת</span>
                  <button
                    type="button" onClick={resetComposer} aria-label="בטל עריכה"
                    style={{
                      background: 'var(--p-15)', border: 'none', cursor: 'pointer', color: 'var(--accent)',
                      width: 20, height: 20, borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {allMembers.length > 1 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', paddingBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>של מי:</span>
                  {allMembers.map(m => {
                    const active = draftUid === m.uid;
                    return (
                      <button
                        key={m.uid} type="button" onClick={() => setDraftUid(m.uid)}
                        title={m.displayName}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0,
                          borderRadius: '50%', display: 'flex',
                          outline: active ? '2px solid var(--accent)' : '2px solid transparent',
                          opacity: active ? 1 : 0.45, transition: 'opacity 0.15s, outline-color 0.15s',
                        }}
                      >
                        <Avatar photoURL={m.photoURL} name={m.displayName} size={28} />
                      </button>
                    );
                  })}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') resetComposer(); }}
                  enterKeyHint={editingId ? 'done' : 'send'}
                  placeholder={editingId ? 'עדכן את התזכורת...' : 'כתוב תזכורת ושלח...'}
                  style={{
                    flex: 1, minWidth: 0, minHeight: 46, borderRadius: 23,
                    border: '1px solid var(--ink-10)', background: 'var(--ink-2)',
                    padding: '0 16px', fontFamily: 'var(--font-hebrew)', fontSize: 15,
                    color: 'var(--text-main)', outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label={editingId ? 'שמור תזכורת' : 'הוסף תזכורת'}
                  className={`round-btn${draft.trim() ? ' on' : ''}`}
                  style={{ width: 46, height: 46, minWidth: 46 }}
                >
                  {editingId ? <Check size={20} strokeWidth={3} /> : <ArrowUp size={20} strokeWidth={3} />}
                </button>
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
  allMembers, setAssignPickerItemId,
}) {
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {categoryItems.map((item, idx) => {
            const assigned = Array.isArray(item.assignedTo) ? item.assignedTo
              : item.assignedTo ? [item.assignedTo] : [];
            return (
              <ListCard
                key={item.id}
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
                // Tapping a checklist row ticks it, as before.
                onOpen={canEdit ? () => handleToggle(item) : undefined}
                trailing={assigned.length > 0 && (
                  <button type="button" title="שייך לחברים" aria-label="שייך לחברים"
                    onClick={e => { e.stopPropagation(); if (canEdit) setAssignPickerItemId(item.id); }}
                    style={{ background: 'none', border: 'none', cursor: canEdit ? 'pointer' : 'default', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}>

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
                  </button>
                )}
                actions={canEdit ? [
                  { key: 'edit', label: 'עריכה', Icon: Pencil, run: () => handleStartEdit(item), swipe: true },
                  allMembers.length > 1 && { key: 'assign', label: 'שיוך לחברים', Icon: User, run: () => setAssignPickerItemId(item.id), swipe: true },
                  { key: 'del', label: 'מחיקה', Icon: Trash2, run: () => handleDeleteItem(item.id), danger: true, swipe: true },
                ] : []}
              />
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


export default function ChecklistTab({ tripId, globalChecklist = [] }) {
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

  // Assignment picker (item id whose picker is open + current toggle selections)
  const [assignPickerItemId, setAssignPickerItemId] = useState(null);
  const [pickerSelected, setPickerSelected] = useState(new Set());

  // Category open/close — default ALL closed (empty obj = all closed)
  const [openCategories, setOpenCategories] = useState({});

  const [editingCat, setEditingCat] = useState(null);
  const [editCatText, setEditCatText] = useState('');

  // Quick-add inside an open category
  const [quickAddCat, setQuickAddCat] = useState(null);
  const [quickAddText, setQuickAddText] = useState('');
  const quickAddInputRef = useRef(null);

  // Seed picker selection from item's current assignedTo when picker opens
  useEffect(() => {
    if (!assignPickerItemId) return;
    const item = items.find(i => i.id === assignPickerItemId);
    const cur = item?.assignedTo;
    setPickerSelected(new Set(Array.isArray(cur) ? cur : cur ? [cur] : []));
  }, [assignPickerItemId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  useEffect(() => {
    if (!tripId) return;
    return onSnapshot(collection(db, 'trips', tripId, 'checklist'), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;
    return onSnapshot(doc(db, 'trips', tripId, 'settings', 'checklistSync'), snap => {
      const data = snap.exists() ? snap.data() : {};
      setDeletedGlobalIds(data.deletedGlobalIds || []);
      setExtraCategories(data.extraCategories || []);
      setCategoryOrder(data.categoryOrder || []);
    });
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

  // ── Auto-sync missing global items ───────────────────────────────────────
  useEffect(() => {
    if (!tripId || !canEdit || loading || !mergedGlobalChecklist.length) return;
    const existingIds = new Set(items.map(i => i.id));
    const deletedSet = new Set(deletedGlobalIds);
    const missing = mergedGlobalChecklist.filter(
      item => !existingIds.has(item.id) && !deletedSet.has(item.id)
    );
    if (!missing.length) return;
    const batch = writeBatch(db);
    missing.forEach(item => {
      batch.set(doc(db, 'trips', tripId, 'checklist', item.id), {
        text: item.text, completed: false, category: item.category,
      });
    });
    batch.commit().catch(console.error);
  }, [mergedGlobalChecklist, items, loading, tripId, canEdit, deletedGlobalIds]);

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
    await setDoc(syncRef, { categoryOrder: newOrder }, { merge: true });
  };

  // ── Category helpers ─────────────────────────────────────────────────────
  const toggleCategory = (cat) =>
    setOpenCategories(prev => ({ ...prev, [cat]: !prev[cat] }));


  const saveExtraCategory = async (cat) => {
    if (!cat || !tripId || extraCategories.includes(cat)) return;
    const syncRef = doc(db, 'trips', tripId, 'settings', 'checklistSync');
    await setDoc(syncRef, { extraCategories: [...new Set([...extraCategories, cat])] }, { merge: true });
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
    const batch = writeBatch(db);
    catItems.forEach(item => batch.delete(doc(db, 'trips', tripId, 'checklist', item.id)));
    batch.commit();
    setDoc(syncRef, {
      deletedGlobalIds: newDeletedIds,
      extraCategories: newExtraCategories,
      categoryOrder: newCategoryOrder,
    }, { merge: true });
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
    await batch.commit();
  };

  // ── Item actions ─────────────────────────────────────────────────────────
  const handleToggle = (item) => {
    if (!tripId) return;
    updateDoc(doc(db, 'trips', tripId, 'checklist', item.id), {
      completed: !item.completed,
    });
  };

  const handleDeleteItem = async (id) => {
    if (!tripId) return;
    const ok = await confirm({ message: 'למחוק את הפריט?', confirmText: 'מחק', cancelText: 'בטל', danger: true });
    if (!ok) return;
    // Optimistically update deletedGlobalIds BEFORE deleteDoc so the re-sync
    // effect (which runs when items changes) doesn't immediately re-add the item.
    const isGlobal = mergedGlobalChecklist.some(g => g.id === id);
    if (isGlobal) {
      const newDeletedIds = [...new Set([...deletedGlobalIds, id])];
      setDeletedGlobalIds(newDeletedIds);
      const syncRef = doc(db, 'trips', tripId, 'settings', 'checklistSync');
      setDoc(syncRef, { deletedGlobalIds: newDeletedIds }, { merge: true });
    }
    deleteDoc(doc(db, 'trips', tripId, 'checklist', id));
  };

  const handleSaveAssignment = (itemId) => {
    if (!tripId) return;
    const arr = [...pickerSelected];
    updateDoc(doc(db, 'trips', tripId, 'checklist', itemId), { assignedTo: arr.length > 0 ? arr : null });
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
      updateDoc(doc(db, 'trips', tripId, 'checklist', editingItemId), { text, category: cat, assignedTo: assigned });
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

  // ── Progress ─────────────────────────────────────────────────────────────
  const totalCount = items.length;
  const completedCount = items.filter(i => i.completed).length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (loading) {
    return <Skeleton rows={5} label="טוען רשימת ציוד" />;
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Reminders — compact strip; add/edit happen in a sheet */}
      <RemindersCard tripId={tripId} canEdit={canEdit} />

      {/* Progress — a read-out now, not a control. Adding used to unfold
          out of this card; it moved to the floating button and its sheet,
          which is how every tab adds things. Shown to viewers too: the
          count is information, not an edit. */}
      {totalCount > 0 && (
        <div className="glass-card" style={{ padding: '12px 14px', flexDirection: 'row', alignItems: 'center', gap: 12, direction: 'rtl' }}>
          <div style={{ position: 'relative', width: 46, height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={46} height={46} viewBox="0 0 52 52" style={{ position: 'absolute', top: 0, left: 0 }}>
              <circle cx={26} cy={26} r={20} fill="none" stroke="var(--ink-8)" strokeWidth={4} />
              <circle cx={26} cy={26} r={20} fill="none" stroke="var(--primary-color)" strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray="125.66"
                strokeDashoffset={`${(125.66 * (1 - progressPercent / 100)).toFixed(2)}`}
                transform="rotate(-90 26 26)"
                style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.4,0,0.2,1)' }}
              />
            </svg>
            <span style={{ zIndex: 1, fontSize: 13, fontWeight: 900, color: 'var(--primary-color)', lineHeight: 1 }}>{progressPercent}%</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>רשימת הציוד</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>
              {completedCount} מתוך {totalCount} כבר נארזו
            </div>
          </div>
        </div>
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
          {({ cancel }) => (
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>מה להביא?</label>
                  <input type="text" className="form-control" placeholder="למשל: סוודר, מטען"
                    value={newItemText} onChange={e => setNewItemText(e.target.value)} required />
                  {duplicateSuggestions.length > 0 && (
                    <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 10, background: 'var(--butter)', border: 'none', direction: 'rtl' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>פריטים דומים כבר ברשימה:</span>
                      {duplicateSuggestions.slice(0, 4).map(s => (
                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 13, color: 'var(--text-main)' }}>
                          <span style={{ flex: 1, textAlign: 'right' }}>{s.text}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 8, flexShrink: 0 }}>{s.category}</span>
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
                      {/* Only current members: a new assignment to someone
                          who has left would be a dead end. */}
                      {allMembers.filter(m => !m.former).map(m => {
                        const isSelected = newItemAssignedTo.includes(m.uid);
                        return (
                          <button type="button" key={m.uid}
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
              </div>
            </form>
          )}
        </Sheet>
      )}

      {/* Who-it's-for filter — one scrollable row (never wraps to a second
          line) with a count per member, so the row reads as a summary too. */}
      {allMembers.length > 1 && (() => {
        const countFor = (uid) => items.filter(it => {
          const a = Array.isArray(it.assignedTo) ? it.assignedTo : (it.assignedTo ? [it.assignedTo] : []);
          return a.includes(uid);
        }).length;
        // The count rides in the chip as a small pill of its own.
        const countStyle = { fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '1px 7px', background: 'var(--ink-8)' };
        return (
          <div className="horizontal-scroll" style={{ direction: 'rtl', gap: 6 }}>
            <button type="button" onClick={() => setFilterAssignee(null)} className="chip" aria-pressed={filterAssignee === null} style={{ flexShrink: 0 }}>
              הכל
              <span style={countStyle}>{items.length}</span>
            </button>
            {allMembers.map(m => {
              const active = filterAssignee === m.uid;
              return (
                <button type="button" key={m.uid}
                  onClick={() => setFilterAssignee(prev => prev === m.uid ? null : m.uid)}
                  className={`chip${m.former ? ' person-former' : ''}`}
                  title={m.former ? `${m.displayName} — כבר לא בטיול` : undefined}
                  aria-pressed={active}
                  style={{ flexShrink: 0 }}>
                  {m.photoURL
                    ? <img src={m.photoURL} alt="" style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0 }} referrerPolicy="no-referrer" />
                    : <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--lavender)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text)', fontWeight: 800, flexShrink: 0 }}>{(m.displayName || '?')[0]}</div>
                  }
                  <span style={{ whiteSpace: 'nowrap' }}>{m.displayName}</span>
                  <span style={countStyle}>{countFor(m.uid)}</span>
                </button>
              );
            })}
          </div>
        );
      })()}

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
            {categories.map((category) => {
              const categoryItems = items.filter(item => {
                if (item.category !== category) return false;
                if (filterAssignee !== null) {
                  const a = Array.isArray(item.assignedTo) ? item.assignedTo : (item.assignedTo ? [item.assignedTo] : []);
                  if (!a.includes(filterAssignee)) return false;
                }
                return true;
              });
              if (categoryItems.length === 0 && (filterAssignee !== null || !extraCategories.includes(category))) return null;
              const isOpen = !!openCategories[category];
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
                  setAssignPickerItemId={setAssignPickerItemId}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Assign-to-member picker portal — multi-select with toggle + confirm */}
      {assignPickerItemId && (
        <Sheet title="שייך לחברים" onClose={() => setAssignPickerItemId(null)}>
          {({ close }) => (<>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Someone who left is offered only if this item is already
                  theirs — so it can be handed on, never newly assigned. */}
              {allMembers.filter(m => !m.former || pickerSelected.has(m.uid)).map(m => {
                const isSelected = pickerSelected.has(m.uid);
                return (
                  <button key={m.uid}
                    className={m.former ? 'person-former' : undefined}
                    onClick={() => setPickerSelected(prev => {
                      const next = new Set(prev);
                      isSelected ? next.delete(m.uid) : next.add(m.uid);
                      return next;
                    })}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: isSelected ? 'var(--p-10)' : 'var(--ink-4)', border: isSelected ? '1.5px solid var(--accent)' : '1.5px solid transparent', borderRadius: 12, cursor: 'pointer', textAlign: 'right' }}>
                    {m.photoURL
                      ? <img src={m.photoURL} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} referrerPolicy="no-referrer" />
                      : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--lavender)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--text)', fontWeight: 800, flexShrink: 0 }}>{(m.displayName || '?')[0]}</div>
                    }
                    <span style={{ fontSize: 14, fontWeight: 600, color: isSelected ? 'var(--accent)' : 'var(--text-main)', flex: 1 }}>
                      {m.displayName}
                      {m.former && <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>כבר לא בטיול</span>}
                    </span>
                    {isSelected && <Check size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
            <div className="sheet-footer">
              <button type="button" className="btn-primary"
                onClick={() => { handleSaveAssignment(assignPickerItemId); close(); }}>
                שמור
              </button>
              <button type="button" className="btn-secondary" onClick={() => setPickerSelected(new Set())}>
                נקה הכל
              </button>
            </div>
          </>)}
        </Sheet>
      )}

    </div>
  );
}
