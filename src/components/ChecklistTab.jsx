import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
import SwipeRow from './SwipeRow';
import Fab from './Fab';
import EmptyState from './EmptyState';
import useSheetDrag from '../hooks/useSheetDrag';
import useBackHandler from '../hooks/useBackHandler';
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
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {photoURL
        ? <img src={photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
        : <span style={{ fontSize: size * 0.38, fontWeight: 700, color: '#fff' }}>{(name || '?')[0]}</span>}
    </div>
  );
}

/* Bottom-sheet shell shared by the reminder sheets. Declared at module level
   on purpose: a component defined inside another component is a brand-new
   type on every render, which would remount the sheet — and drop focus out
   of the textarea — on every keystroke. */
function Sheet({ onClose, children, maxHeight = '80vh' }) {
  const drag = useSheetDrag(onClose);
  // This shell is mounted only while the sheet is open, so it is a back
  // layer for its whole life.
  useBackHandler(true, drag.close);
  return createPortal(
    <div
      onClick={drag.close}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(11,11,48,0.50)', backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        opacity: drag.closing ? 0 : 1,
        transition: 'opacity var(--dur-base) var(--ease-out)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        {...drag.handlers}
        style={{
          width: '100%', maxWidth: 520,
          background: 'var(--modal-bg)',
          borderRadius: '24px 24px 0 0',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column',
          maxHeight, overflow: 'hidden', direction: 'rtl',
          animation: drag.closing ? 'none' : 'slideUp 0.25s ease',
          ...drag.style,
        }}
      >
        <div className="sheet-grab" />
        {children}
      </div>
    </div>,
    document.body
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
        <Sheet onClose={closeSheet} maxHeight="min(88vh, 100vh - 32px)">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '2px 16px 12px', flexShrink: 0,
          }}>
            <span style={{ fontSize: 17, fontWeight: 900, color: 'var(--primary)', flex: 1 }}>תזכורות</span>
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
            <button
              type="button" onClick={closeSheet} aria-label="סגור"
              style={{
                background: 'var(--ink-6)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                width: 34, height: 34, borderRadius: 12, display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              <X size={17} />
            </button>
          </div>

          {/* Filter — a visible state, not a hidden mode */}
          {reminders.length > 0 && (
            <div style={{
              display: 'flex', gap: 4, padding: 4, margin: '0 16px 10px',
              background: 'var(--ink-3)', borderRadius: 14, flexShrink: 0,
            }}>
              {TABS.map(t => {
                const active = filter === t.key;
                return (
                  <button
                    key={t.key} type="button" onClick={() => setFilter(t.key)}
                    style={{
                      flex: 1, border: 'none', cursor: 'pointer', borderRadius: 11,
                      padding: '9px 4px', fontFamily: 'var(--font-hebrew)',
                      fontSize: 13, fontWeight: 800,
                      background: active ? 'var(--surface)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-muted)',
                      boxShadow: active ? 'var(--shadow-sm)' : 'none',
                      transition: 'background 0.18s, color 0.18s',
                    }}
                  >
                    {t.label} {t.n > 0 && <span style={{ opacity: 0.65 }}>{t.n}</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div
            data-sheet-scroll
            style={{
              overflowY: 'auto', padding: '0 12px 8px', flex: 1,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}
          >
            {visible.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, padding: '34px 12px', lineHeight: 1.6 }}>
                {filter === 'done' ? 'עוד לא בוצעה אף תזכורת'
                  : filter === 'open' && reminders.length > 0 ? 'אין תזכורות פתוחות — הכל בוצע 🎉'
                    : canEdit ? 'כתוב תזכורת ראשונה בשדה שלמטה' : 'אין תזכורות'}
              </p>
            ) : visible.map(r => {
              const done = !!r.completed;
              const editing = editingId === r.id;
              return (
                <SwipeRow
                  key={r.id}
                  enabled={canEdit}
                  actions={[
                    { key: 'edit', label: 'ערוך', Icon: Pencil, onAction: () => startEdit(r) },
                    { key: 'del', label: 'מחק', Icon: Trash2, tone: 'danger', onAction: () => remove(r) },
                  ]}
                  className="glass-card"
                  onClick={() => toggleDone(r)}
                  style={{
                    display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12,
                    padding: '12px 14px', textAlign: 'right',
                    minHeight: 56, cursor: canEdit ? 'pointer' : 'default',
                    background: editing ? 'var(--p-8)' : done ? 'var(--ink-2)' : 'var(--card-bg)',
                    border: editing ? '1px solid var(--p-18)' : 'var(--card-border)',
                    transition: 'background 0.18s',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 26, height: 26, borderRadius: 9, flexShrink: 0,
                      border: done ? 'none' : '2px solid var(--p-22)',
                      background: done ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.18s',
                    }}
                  >
                    {done && <Check size={15} color="#fff" strokeWidth={3} />}
                  </span>

                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 15, lineHeight: 1.45,
                    fontWeight: done ? 500 : 700,
                    color: done ? 'var(--text-muted)' : 'var(--text-main)',
                    textDecoration: done ? 'line-through' : 'none',
                    wordBreak: 'break-word',
                  }}>
                    {r.text}
                  </span>

                  {(r.addedByPhoto || r.addedByName) && (
                    <span title={r.addedByName || ''} style={{ flexShrink: 0, opacity: done ? 0.4 : 0.9 }}>
                      <Avatar photoURL={r.addedByPhoto} name={r.addedByName} size={26} />
                    </span>
                  )}

                  {/* Pointer devices keep buttons; on touch the same two ride the swipe. */}
                  {canEdit && (
                    <span className="row-inline-actions" style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button
                        type="button" aria-label="ערוך תזכורת"
                        onClick={e => { e.stopPropagation(); startEdit(r); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, display: 'flex' }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button" aria-label="מחק תזכורת"
                        onClick={e => { e.stopPropagation(); remove(r); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-red2)', padding: 6, display: 'flex' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  )}
                </SwipeRow>
              );
            })}
          </div>

          {/* ── Composer ──────────────────────────────────────────────────
              Add and edit live in the same field. Editing never opens a
              second sheet, so the list stays visible behind the keyboard. */}
          {canEdit && (
            <form
              onSubmit={submit}
              style={{
                flexShrink: 0, borderTop: '1px solid var(--ink-7)', background: 'var(--modal-bg)',
                padding: '10px 14px calc(10px + env(safe-area-inset-bottom))',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}
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
                  style={{
                    width: 46, height: 46, borderRadius: '50%', flexShrink: 0, border: 'none',
                    background: draft.trim() ? 'var(--accent)' : 'var(--ink-8)',
                    color: draft.trim() ? '#fff' : 'var(--text-muted)',
                    cursor: draft.trim() ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.18s',
                  }}
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
  category, categoryItems, isOpen, isLongPressed, doneCount, canEdit,
  editingCat, editCatText, setEditCatText, setEditingCat, handleRenameCategory,
  toggleCategory, longPressActive, startLongPress, cancelLongPress,
  setLongPressedCat, handleDeleteCategory,
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
      {/* Category header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Drag handle */}
        {canEdit && (
          <button type="button" {...attributes} {...listeners} aria-label="גרור לשינוי סדר"
            style={{ background: 'none', border: 'none', cursor: 'grab', color: 'rgba(11,11,48,0.2)', padding: '4px 2px', display: 'flex', alignItems: 'center', flexShrink: 0, touchAction: 'none' }}>
            <GripVertical size={15} />
          </button>
        )}

        {editingCat === category ? (
          <form onSubmit={e => { e.preventDefault(); handleRenameCategory(category, editCatText); }}
            style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text" autoFocus className="form-control"
              value={editCatText} onChange={e => setEditCatText(e.target.value)}
              style={{ flex: 1, minHeight: 34, fontSize: 13 }}
            />
            <button type="submit" className="btn-primary" style={{ padding: '5px 10px', flexShrink: 0 }}>
              <Check size={13} />
            </button>
            <button type="button" onClick={() => setEditingCat(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', flexShrink: 0 }}>
              <X size={14} />
            </button>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                if (longPressActive.current) { longPressActive.current = false; return; }
                toggleCategory(category);
              }}
              onMouseDown={() => canEdit && startLongPress(category)}
              onMouseUp={cancelLongPress}
              onTouchStart={e => { e.stopPropagation(); canEdit && startLongPress(category); }}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}
              style={{ flex: 1, background: 'transparent', border: 'none', padding: '4px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--font-hebrew)' }}
            >
              <ChevronDown size={16} style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s ease', flexShrink: 0 }} />
              <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary-color)', letterSpacing: '-0.2px', textAlign: 'right', flex: 1, margin: 0 }}>
                {category}
              </h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>
                {doneCount}/{categoryItems.length}
              </span>
            </button>

            {/* Quick-add shortcut in header */}
            {canEdit && !isLongPressed && (
              <button type="button" aria-label={`הוסף פריט ל${category}`}
                onClick={() => { setQuickAddCat(category); setQuickAddText(''); if (!isOpen) toggleCategory(category); }}
                style={{ padding: 5, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <Plus size={15} />
              </button>
            )}

            {isLongPressed && canEdit && (
              <>
                <button type="button" aria-label="שנה שם קטגוריה"
                  onClick={() => { setEditingCat(category); setEditCatText(category); setLongPressedCat(null); }}
                  style={{ padding: 6, borderRadius: 8, border: 'none', background: 'rgba(79,70,229,0.1)', color: 'rgb(79,70,229)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                  <Pencil size={13} />
                </button>
                <button type="button" onClick={() => handleDeleteCategory(category)} aria-label="מחק קטגוריה"
                  style={{ padding: 6, borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: 'rgb(239,68,68)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                  <Trash2 size={13} />
                </button>
                <button type="button" onClick={() => setLongPressedCat(null)} aria-label="בטל"
                  style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* Category items + quick-add */}
      {isOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {categoryItems.map((item, idx) => {
            const assigned = Array.isArray(item.assignedTo) ? item.assignedTo
              : item.assignedTo ? [item.assignedTo] : [];
            return (
              <SwipeRow
                key={item.id}
                enabled={canEdit}
                actions={[
                  { key: 'edit', label: 'ערוך', Icon: Pencil, onAction: () => handleStartEdit(item) },
                  { key: 'del', label: 'מחק', Icon: Trash2, tone: 'danger', onAction: () => handleDeleteItem(item.id) },
                ]}
                className="glass-card checklist-item-row list-in"
                onClick={canEdit ? () => handleToggle(item) : undefined}
                style={{
                  // Cap the stagger so the tail of a long list isn't delayed.
                  '--i': Math.min(idx, 8),
                  padding: '12px 14px',
                  cursor: canEdit ? 'pointer' : 'default',
                  background: item.completed ? 'rgba(255,255,255,0.45)' : 'var(--card-bg)',
                  border: item.completed ? '1px solid rgba(255,255,255,0.2)' : 'var(--card-border)',
                  transition: 'background 0.2s, border 0.2s',
                }}
              >
                <div style={{ width: 22, height: 22, borderRadius: 6, border: item.completed ? 'none' : '2px solid rgba(11,11,48,0.18)', background: item.completed ? 'var(--primary-color)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', flexShrink: 0 }}>
                  {item.completed && <Check size={14} color="#ffffff" strokeWidth={3} />}
                </div>
                <span style={{ fontSize: 15, fontWeight: item.completed ? 500 : 600, textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? 'var(--text-muted)' : 'var(--text-main)', transition: 'all 0.2s ease', textAlign: 'right', wordBreak: 'break-word', flex: 1 }}>
                  {item.text}
                </span>
                {canEdit ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    {allMembers.length > 1 && (
                      <button type="button" onClick={e => { e.stopPropagation(); setAssignPickerItemId(item.id); }}
                        title="שייך לחברים"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        {assigned.length > 0 ? (
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
                        ) : (
                          <User size={15} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
                        )}
                      </button>
                    )}
                    <span className="row-inline-actions" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={e => { e.stopPropagation(); handleStartEdit(item); }}
                        aria-label="ערוך פריט"
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center' }}>
                        <Pencil size={15} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleDeleteItem(item.id); }}
                        aria-label="מחק פריט"
                        style={{ background: 'transparent', border: 'none', borderRadius: 7, color: 'rgba(239,68,68,0.6)', cursor: 'pointer', padding: '5px 8px', display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                ) : <div />}
              </SwipeRow>
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
                <button type="submit" className="btn-primary"
                  style={{ padding: '6px 12px', fontSize: 13, flexShrink: 0 }}>
                  <Plus size={14} />
                </button>
                <button type="button"
                  onClick={() => { setQuickAddCat(null); setQuickAddText(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, display: 'flex' }}>
                  <X size={14} />
                </button>
              </form>
            ) : (
              <button type="button"
                onClick={() => { setQuickAddCat(category); setQuickAddText(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 10, border: '1px dashed rgba(79,70,229,0.22)', background: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, alignSelf: 'flex-start' }}>
                <Plus size={14} />
                הוסף לרשימה
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

  // Long-press to reveal category actions
  const [longPressedCat, setLongPressedCat] = useState(null);
  const longPressTimer = useRef(null);
  const longPressActive = useRef(false);
  const [editingCat, setEditingCat] = useState(null);
  const [editCatText, setEditCatText] = useState('');

  // Quick-add inside an open category
  const [quickAddCat, setQuickAddCat] = useState(null);
  const [quickAddText, setQuickAddText] = useState('');
  const quickAddInputRef = useRef(null);

  // Cleanup timers on unmount
  useEffect(() => () => {
    clearTimeout(longPressTimer.current);
  }, []);

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

  const startLongPress = (cat) => {
    longPressActive.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressActive.current = true;
      setLongPressedCat(cat);
    }, 550);
  };
  const cancelLongPress = () => {
    clearTimeout(longPressTimer.current);
  };

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
    setLongPressedCat(null);
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
    setAssignPickerItemId(null);
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

  const openAddSheet = () => { resetItemForm(); setShowAddForm(true); };
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

  const handleCancelEdit = () => closeAddSheet();

  const handleStartEdit = (item) => {
    setEditingItemId(item.id);
    setNewItemText(item.text);
    setNewItemCategory(item.category);
    const a = item.assignedTo;
    setNewItemAssignedTo(Array.isArray(a) ? a : a ? [a] : []);
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
        <Sheet onClose={closeAddSheet} maxHeight="88vh">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 18px 12px', borderBottom: '1px solid var(--ink-7)', flexShrink: 0,
          }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--primary)' }}>
              {editingItemId ? 'עריכת פריט' : 'פריט חדש לרשימה'}
            </h3>
            <button type="button" onClick={closeAddSheet} aria-label="סגור"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 7, display: 'flex', borderRadius: 10 }}>
              <X size={18} />
            </button>
          </div>

            <form onSubmit={handleAdd} data-sheet-scroll style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 18px calc(16px + env(safe-area-inset-bottom))' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>מה להביא?</label>
                  <input type="text" className="form-control" placeholder="למשל: סוודר, מטען"
                    value={newItemText} onChange={e => setNewItemText(e.target.value)} required />
                  {duplicateSuggestions.length > 0 && (
                    <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', direction: 'rtl' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(180,120,0,0.85)', display: 'block', marginBottom: 4 }}>פריטים דומים כבר ברשימה:</span>
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
                              : <div style={{ width: 18, height: 18, borderRadius: '50%', background: isSelected ? 'var(--accent)' : 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 800, flexShrink: 0 }}>{(m.displayName || '?')[0]}</div>
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
              {editingItemId ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>שמור שינויים</button>
                  <button type="button" className="btn-secondary" onClick={handleCancelEdit}>ביטול</button>
                </div>
              ) : (
                <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                  <Plus size={18} /><span>הוסף פריט לרשימה</span>
                </button>
              )}
            </form>
        </Sheet>
      )}

      {/* Who-it's-for filter — one scrollable row (never wraps to a second
          line) with a count per member, so the row reads as a summary too. */}
      {allMembers.length > 1 && (() => {
        const countFor = (uid) => items.filter(it => {
          const a = Array.isArray(it.assignedTo) ? it.assignedTo : (it.assignedTo ? [it.assignedTo] : []);
          return a.includes(uid);
        }).length;
        const chipStyle = (active) => ({
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-hebrew)',
          background: active ? 'var(--accent)' : 'var(--ink-6)',
          color: active ? '#fff' : 'var(--text-muted)',
          transition: 'all 0.15s',
        });
        const countStyle = (active) => ({
          fontSize: 11, fontWeight: 800, borderRadius: 20, padding: '0 6px',
          background: active ? 'rgba(255,255,255,0.25)' : 'var(--ink-8)',
          color: active ? '#fff' : 'var(--text-muted)',
        });
        return (
          <div className="horizontal-scroll" style={{ direction: 'rtl', gap: 6 }}>
            <button type="button" onClick={() => setFilterAssignee(null)} style={chipStyle(filterAssignee === null)}>
              הכל
              <span style={countStyle(filterAssignee === null)}>{items.length}</span>
            </button>
            {allMembers.map(m => {
              const active = filterAssignee === m.uid;
              return (
                <button type="button" key={m.uid}
                  onClick={() => setFilterAssignee(prev => prev === m.uid ? null : m.uid)}
                  className={m.former ? 'person-former' : undefined}
                  title={m.former ? `${m.displayName} — כבר לא בטיול` : undefined}
                  style={chipStyle(active)}>
                  {m.photoURL
                    ? <img src={m.photoURL} alt="" style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0 }} referrerPolicy="no-referrer" />
                    : <div style={{ width: 18, height: 18, borderRadius: '50%', background: active ? 'rgba(255,255,255,0.25)' : 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 800, flexShrink: 0 }}>{(m.displayName || '?')[0]}</div>
                  }
                  <span style={{ whiteSpace: 'nowrap' }}>{m.displayName}</span>
                  <span style={countStyle(active)}>{countFor(m.uid)}</span>
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
              const isLongPressed = longPressedCat === category;
              const doneCount = categoryItems.filter(i => i.completed).length;
              return (
                <SortableCategoryBlock
                  key={category}
                  category={category}
                  categoryItems={categoryItems}
                  isOpen={isOpen}
                  isLongPressed={isLongPressed}
                  doneCount={doneCount}
                  canEdit={canEdit}
                  editingCat={editingCat}
                  editCatText={editCatText}
                  setEditCatText={setEditCatText}
                  setEditingCat={setEditingCat}
                  handleRenameCategory={handleRenameCategory}
                  toggleCategory={toggleCategory}
                  longPressActive={longPressActive}
                  startLongPress={startLongPress}
                  cancelLongPress={cancelLongPress}
                  setLongPressedCat={setLongPressedCat}
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
      {assignPickerItemId && createPortal(
        <div
          onClick={() => setAssignPickerItemId(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(11,11,48,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--modal-bg)', borderRadius: 20, padding: '20px', width: '85%', maxWidth: 320, direction: 'rtl', boxShadow: 'var(--shadow-lg)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>שייך לחברים</span>
              <button onClick={() => setAssignPickerItemId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={16} /></button>
            </div>
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
                      : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#fff', fontWeight: 800, flexShrink: 0 }}>{(m.displayName || '?')[0]}</div>
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
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                onClick={() => setPickerSelected(new Set())}
                style={{ flex: 1, padding: '9px 0', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--ink-6)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>
                נקה הכל
              </button>
              <button
                onClick={() => handleSaveAssignment(assignPickerItemId)}
                style={{ flex: 2, padding: '9px 0', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700 }}>
                אשר
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
