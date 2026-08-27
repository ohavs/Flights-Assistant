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
import { Check, Plus, Trash2, Pencil, ChevronDown, ChevronUp, X, GripVertical, List, User } from 'lucide-react';
import { CustomDropdown } from './CustomDatePicker';
import Skeleton from './Skeleton';
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
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(11,11,48,0.50)', backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          background: 'var(--modal-bg)',
          borderRadius: '24px 24px 0 0',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column',
          maxHeight, overflow: 'hidden', direction: 'rtl',
          animation: 'slideUp 0.25s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--ink-12)' }} />
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ── RemindersCard ───────────────────────────────────────────────────────
   A compact strip at the top of the checklist tab that cycles through the
   trip's reminders, plus two sheets:
     • the editor sheet   — add / edit one reminder (text + whose it is)
     • the "all" sheet    — the full list, with an optional selection mode
   Adding or editing never replaces the strip itself any more, so the card
   you were reading stays on screen and the layout never jumps.            */
function RemindersCard({ tripId, canEdit }) {
  const { currentUid, currentUserProfile, memberProfiles, tripMembers } = useTrip();
  const confirm = useConfirm();
  const [reminders, setReminders] = useState([]);
  const [shuffledReminders, setShuffledReminders] = useState([]);
  const [idx, setIdx] = useState(0);
  // Editor sheet: null when closed, otherwise { id } for an edit or {} for a
  // new reminder. Its draft text and owner live alongside it.
  const [editor, setEditor] = useState(null);
  const [draftText, setDraftText] = useState('');
  const [draftUid, setDraftUid] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const inputRef = useRef(null);
  const autoTimer = useRef(null);
  const prevLengthRef = useRef(0);
  const touchStartX = useRef(0);

  useEffect(() => {
    if (!tripId) return;
    return onSnapshot(collection(db, 'trips', tripId, 'reminders'), snap => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setReminders(docs);
      setIdx(i => Math.min(i, Math.max(0, docs.length - 1)));
    });
  }, [tripId]);

  // Shuffle reminders when the list changes; update in-place on edits
  useEffect(() => {
    const reshuffle = reminders.length !== prevLengthRef.current;
    prevLengthRef.current = reminders.length;
    if (reminders.length === 0) { setShuffledReminders([]); return; }
    if (reshuffle) {
      setShuffledReminders([...reminders].sort(() => Math.random() - 0.5));
      setIdx(0);
    } else {
      setShuffledReminders(prev => prev.map(p => reminders.find(r => r.id === p.id) ?? p));
    }
  }, [reminders]);

  // Auto-advance every 5s. Paused while a sheet is open so nothing moves
  // under your finger while you read or edit.
  const paused = !!editor || showAll;
  const startAutoAdvance = useCallback(() => {
    clearInterval(autoTimer.current);
    if (paused || shuffledReminders.length <= 1) return;
    autoTimer.current = setInterval(() => {
      setIdx(i => (i + 1) % shuffledReminders.length);
    }, 5000);
  }, [shuffledReminders.length, paused]);

  useEffect(() => {
    startAutoAdvance();
    return () => clearInterval(autoTimer.current);
  }, [startAutoAdvance]);

  useEffect(() => {
    if (editor) setTimeout(() => inputRef.current?.focus(), 80);
  }, [editor]);

  // All trip members with their profiles for the owner picker
  const allMembers = useMemo(() => {
    const list = [];
    if (currentUid && currentUserProfile) {
      list.push({ uid: currentUid, displayName: currentUserProfile.displayName || currentUserProfile.email || '', photoURL: currentUserProfile.photoURL || '' });
    }
    Object.keys(tripMembers || {}).forEach(uid => {
      if (uid === currentUid) return;
      const p = memberProfiles?.[uid] || {};
      list.push({ uid, displayName: p.displayName || p.email || uid, photoURL: p.photoURL || '' });
    });
    return list;
  }, [currentUid, currentUserProfile, memberProfiles, tripMembers]);

  const goTo = (i) => {
    setIdx(i);
    startAutoAdvance();
  };

  const openNew = () => {
    setDraftText('');
    setDraftUid(currentUid || '');
    setEditor({});
  };

  const openEdit = (rem) => {
    setDraftText(rem.text || '');
    setDraftUid(rem.addedByUid || currentUid || '');
    setEditor({ id: rem.id });
  };

  const closeEditor = () => { setEditor(null); setDraftText(''); };

  const handleSave = () => {
    const text = draftText.trim();
    if (!text) { closeEditor(); return; }
    // Fall back to the signed-in user when the picker is hidden (solo trip)
    // or the chosen uid is no longer a member, so a reminder always has an
    // owner attached — the avatar on the strip depends on it.
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

    if (editor?.id) {
      const id = editor.id;
      closeEditor();
      updateDoc(doc(db, 'trips', tripId, 'reminders', id), { text, ...ownerFields });
    } else {
      const newRef = doc(collection(db, 'trips', tripId, 'reminders'));
      const newIdx = reminders.length;
      closeEditor();
      setTimeout(() => goTo(newIdx), 50);
      setDoc(newRef, { text, createdAt: Date.now(), completed: false, ...ownerFields });
    }
  };

  const handleDeleteById = async (id) => {
    const ok = await confirm({ message: 'למחוק את התזכורת?', confirmText: 'מחק', cancelText: 'בטל', danger: true });
    if (!ok) return;
    setIdx(i => Math.max(0, i - 1));
    deleteDoc(doc(db, 'trips', tripId, 'reminders', id));
  };

  const handleBulkDelete = async () => {
    if (checkedIds.size === 0) return;
    const ok = await confirm({ message: `למחוק ${checkedIds.size} תזכורות?`, confirmText: 'מחק', cancelText: 'בטל', danger: true });
    if (!ok) return;
    const ids = [...checkedIds];
    setCheckedIds(new Set());
    setSelectMode(false);
    ids.forEach(id => deleteDoc(doc(db, 'trips', tripId, 'reminders', id)));
  };

  const handleToggleReminder = (id, currentCompleted) => {
    updateDoc(doc(db, 'trips', tripId, 'reminders', id), { completed: !currentCompleted });
  };

  const iconBtn = (color = 'var(--text-muted)') => ({
    background: 'none', border: 'none', cursor: 'pointer',
    color, padding: '6px 7px', display: 'flex', alignItems: 'center', flexShrink: 0,
  });

  const doneCount = reminders.filter(r => r.completed).length;

  return (
    <div>
      <style>{`
        @keyframes remFadeUp {
          from { opacity: 0; transform: translateY(7px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>

      {/* ── Compact reminders strip ──────────────────────────────────────── */}
      {shuffledReminders.length === 0 ? (
        <div className="glass-card" style={{
          direction: 'rtl', padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0 }}>תזכורות</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1, textAlign: 'center' }}>
            {canEdit ? 'אין תזכורות — הוסף אחת' : 'אין תזכורות'}
          </span>
          {canEdit && (
            <button onClick={openNew} style={iconBtn('var(--accent)')} title="תזכורת חדשה">
              <Plus size={16} />
            </button>
          )}
        </div>
      ) : (() => {
        const r = shuffledReminders[idx] || shuffledReminders[0];
        if (!r) return null;
        const n = shuffledReminders.length;
        return (
          <div
            className="glass-card"
            onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={e => {
              const dx = e.changedTouches[0].clientX - touchStartX.current;
              if (Math.abs(dx) > 40) goTo(dx > 0 ? (idx - 1 + n) % n : (idx + 1) % n);
            }}
            style={{
              direction: 'rtl', display: 'flex', flexDirection: 'column',
              padding: '10px 14px 10px', gap: 8,
              boxSizing: 'border-box',
              borderTop: '3px solid var(--accent)',
              overflow: 'hidden',
            }}
          >
            {/* Header: label + progress, then list / add */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>תזכורות</span>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: 'var(--p-10)', color: 'var(--accent)',
                  border: '1px solid var(--p-18)',
                  borderRadius: 20, padding: '1px 7px',
                }}>
                  {doneCount}/{n}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <button onClick={() => setShowAll(true)} style={iconBtn('var(--accent)')} title="כל התזכורות">
                  <List size={15} />
                </button>
                {canEdit && (
                  <button onClick={openNew} style={iconBtn('var(--accent)')} title="תזכורת חדשה">
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Current reminder — tapping the text opens the editor */}
            <div key={`${r.id}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'remFadeUp 0.35s ease', minHeight: 44 }}>
              <button
                type="button"
                onClick={() => canEdit && handleToggleReminder(r.id, !!r.completed)}
                style={{
                  width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                  border: r.completed ? 'none' : '2px solid rgba(79,70,229,0.3)',
                  background: r.completed ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: canEdit ? 'pointer' : 'default', padding: 0, transition: 'all 0.2s',
                }}
              >
                {r.completed && <Check size={13} color="#fff" strokeWidth={3} />}
              </button>
              <button
                type="button"
                onClick={() => canEdit && openEdit(r)}
                style={{
                  flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0,
                  textAlign: 'right', cursor: canEdit ? 'pointer' : 'default',
                  fontFamily: 'var(--font-hebrew)',
                }}
              >
                <span style={{
                  fontSize: 15, fontWeight: r.completed ? 400 : 600,
                  color: r.completed ? 'var(--text-muted)' : 'var(--text-main)',
                  lineHeight: 1.45,
                  display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  textDecoration: r.completed ? 'line-through' : 'none',
                }}>{r.text}</span>
              </button>
              {(r.addedByPhoto || r.addedByName) && (
                <div title={r.addedByName || ''} style={{ flexShrink: 0, opacity: r.completed ? 0.4 : 0.9 }}>
                  <Avatar photoURL={r.addedByPhoto} name={r.addedByName} size={24} />
                </div>
              )}
            </div>

            {/* Dots */}
            {n > 1 && (
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {shuffledReminders.map((_, j) => (
                  <button key={j} onClick={() => goTo(j)} aria-label={`תזכורת ${j + 1}`} style={{
                    width: j === idx ? 16 : 6, height: 6, borderRadius: 3,
                    border: 'none', padding: 0, flexShrink: 0,
                    background: j === idx ? 'var(--accent)' : 'var(--p-15)',
                    cursor: 'pointer', transition: 'all 0.25s ease',
                  }} />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Editor sheet (add / edit) ────────────────────────────────────── */}
      {editor && (
        <Sheet onClose={closeEditor} maxHeight="min(85vh, 100vh - 40px)">
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 18px 12px', borderBottom: '1px solid var(--ink-7)', flexShrink: 0,
          }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>
              {editor.id ? 'עריכת תזכורת' : 'תזכורת חדשה'}
            </span>
            <button onClick={closeEditor} style={{
              background: 'var(--ink-6)', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 7, display: 'flex', borderRadius: 10,
            }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>תוכן התזכורת</label>
              <textarea
                ref={inputRef}
                className="form-control"
                rows={3}
                value={draftText}
                onChange={e => setDraftText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
                  if (e.key === 'Escape') closeEditor();
                }}
                placeholder="למשל: לאסוף את הדרכונים מהכספת"
                style={{ resize: 'vertical', minHeight: 74, fontSize: 14, lineHeight: 1.5 }}
              />
            </div>

            {allMembers.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>של מי התזכורת</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {allMembers.map(m => {
                    const active = draftUid === m.uid;
                    return (
                      <button
                        key={m.uid}
                        type="button"
                        onClick={() => setDraftUid(m.uid)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                          border: active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                          background: active ? 'var(--p-10)' : 'var(--ink-5)',
                          color: active ? 'var(--accent)' : 'var(--text-muted)',
                          fontFamily: 'var(--font-hebrew)', fontSize: 12, fontWeight: 700,
                        }}
                      >
                        <Avatar photoURL={m.photoURL} name={m.displayName} size={18} />
                        {m.displayName}
                        {active && <Check size={12} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div style={{
            flexShrink: 0, borderTop: '1px solid var(--ink-7)',
            padding: '12px 18px calc(12px + env(safe-area-inset-bottom))',
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            {editor.id && (
              <button
                type="button"
                onClick={async () => { const id = editor.id; closeEditor(); await handleDeleteById(id); }}
                title="מחק תזכורת"
                style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: 'var(--c-red2-6)', color: 'var(--c-red2)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Trash2 size={17} />
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!draftText.trim()}
              className="btn-primary"
              style={{ flex: 1, minHeight: 44, gap: 8, opacity: draftText.trim() ? 1 : 0.5 }}
            >
              <Check size={17} />
              <span>{editor.id ? 'שמור שינויים' : 'הוסף תזכורת'}</span>
            </button>
            <button type="button" onClick={closeEditor} className="btn-secondary" style={{ minHeight: 44, flexShrink: 0 }}>
              ביטול
            </button>
          </div>
        </Sheet>
      )}

      {/* ── All-reminders sheet ──────────────────────────────────────────── */}
      {showAll && (
        <Sheet
          onClose={() => { setShowAll(false); setSelectMode(false); setCheckedIds(new Set()); }}
          maxHeight="min(80vh, 100vh - 40px)"
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px 12px', borderBottom: '1px solid var(--ink-7)', flexShrink: 0, gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>כל התזכורות</span>
              <span style={{
                fontSize: 11, fontWeight: 700, background: 'var(--p-10)',
                color: 'var(--accent)', border: '1px solid var(--p-18)',
                borderRadius: 20, padding: '1px 8px', flexShrink: 0,
              }}>{doneCount}/{reminders.length}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {canEdit && reminders.length > 0 && (
                <button
                  onClick={() => { setSelectMode(m => !m); setCheckedIds(new Set()); }}
                  style={{
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 20,
                    padding: '4px 12px', fontFamily: 'var(--font-hebrew)',
                    border: 'none',
                    background: selectMode ? 'var(--accent)' : 'var(--ink-6)',
                    color: selectMode ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {selectMode ? 'סיום בחירה' : 'בחירה'}
                </button>
              )}
              <button onClick={() => { setShowAll(false); setSelectMode(false); setCheckedIds(new Set()); }} style={{
                background: 'var(--ink-6)', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 7, display: 'flex', borderRadius: 10,
              }}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div style={{ overflowY: 'auto', padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {reminders.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, padding: '28px 0' }}>אין תזכורות</p>
            ) : reminders.map((r, ri) => {
              const checked = checkedIds.has(r.id);
              const done = !!r.completed;
              return (
                <div
                  key={r.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px', borderRadius: 14,
                    background: checked ? 'var(--p-8)' : done ? 'var(--ink-2)' : ri % 2 === 0 ? 'transparent' : 'var(--ink-2)',
                    transition: 'background 0.15s',
                  }}
                >
                  {selectMode ? (
                    <button
                      onClick={() => setCheckedIds(prev => {
                        const next = new Set(prev);
                        if (checked) next.delete(r.id); else next.add(r.id);
                        return next;
                      })}
                      aria-label="בחר תזכורת"
                      style={{
                        width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                        border: checked ? 'none' : '2px solid rgba(11,11,48,0.18)',
                        background: checked ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', padding: 0, transition: 'all 0.15s',
                      }}
                    >
                      {checked && <Check size={13} color="#fff" strokeWidth={3} />}
                    </button>
                  ) : (
                    <button
                      onClick={() => canEdit && handleToggleReminder(r.id, done)}
                      aria-label={done ? 'בטל סימון' : 'סמן כבוצע'}
                      style={{
                        width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                        border: done ? 'none' : '2px solid rgba(79,70,229,0.25)',
                        background: done ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: canEdit ? 'pointer' : 'default',
                        transition: 'all 0.18s', padding: 0,
                      }}
                    >
                      {done && <Check size={13} color="#fff" strokeWidth={3} />}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (!canEdit) return;
                      if (selectMode) {
                        setCheckedIds(prev => {
                          const next = new Set(prev);
                          if (checked) next.delete(r.id); else next.add(r.id);
                          return next;
                        });
                      } else {
                        setShowAll(false);
                        openEdit(r);
                      }
                    }}
                    style={{
                      flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0,
                      textAlign: 'right', cursor: canEdit ? 'pointer' : 'default',
                      fontFamily: 'var(--font-hebrew)',
                    }}
                  >
                    <span style={{
                      fontSize: 15, fontWeight: done ? 400 : 500,
                      color: done ? 'var(--text-muted)' : 'var(--text-main)', lineHeight: 1.45,
                      textDecoration: done ? 'line-through' : 'none',
                      display: 'block',
                    }}>
                      {r.text}
                    </span>
                  </button>

                  {(r.addedByPhoto || r.addedByName) && (
                    <div title={r.addedByName || ''} style={{ flexShrink: 0, opacity: done ? 0.35 : 0.85 }}>
                      <Avatar photoURL={r.addedByPhoto} name={r.addedByName} size={26} />
                    </div>
                  )}

                  {canEdit && !selectMode && (
                    <button
                      onClick={() => { setShowAll(false); openEdit(r); }}
                      title="ערוך"
                      style={iconBtn('var(--accent)')}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer: add, or delete the current selection */}
          {canEdit && (
            <div style={{
              flexShrink: 0, borderTop: '1px solid var(--ink-7)',
              padding: '10px 16px calc(10px + env(safe-area-inset-bottom))',
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              {selectMode ? (
                <>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={checkedIds.size === 0}
                    style={{
                      flex: 1, minHeight: 42, borderRadius: 12, border: 'none',
                      cursor: checkedIds.size ? 'pointer' : 'default',
                      background: 'var(--c-red2-6)', color: 'var(--c-red2)',
                      opacity: checkedIds.size ? 1 : 0.5,
                      fontFamily: 'var(--font-hebrew)', fontSize: 14, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <Trash2 size={16} />
                    <span>מחק{checkedIds.size ? ` (${checkedIds.size})` : ''}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSelectMode(false); setCheckedIds(new Set()); }}
                    className="btn-secondary"
                    style={{ minHeight: 42, flexShrink: 0 }}
                  >
                    ביטול
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => { setShowAll(false); openNew(); }}
                  className="btn-primary"
                  style={{ width: '100%', minHeight: 42, gap: 8 }}
                >
                  <Plus size={16} />
                  <span>תזכורת חדשה</span>
                </button>
              )}
            </div>
          )}
        </Sheet>
      )}
    </div>
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
          <button type="button" {...attributes} {...listeners}
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
              <button type="button"
                onClick={() => { setQuickAddCat(category); setQuickAddText(''); if (!isOpen) toggleCategory(category); }}
                style={{ padding: 5, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <Plus size={15} />
              </button>
            )}

            {isLongPressed && canEdit && (
              <>
                <button type="button"
                  onClick={() => { setEditingCat(category); setEditCatText(category); setLongPressedCat(null); }}
                  style={{ padding: 6, borderRadius: 8, border: 'none', background: 'rgba(79,70,229,0.1)', color: 'rgb(79,70,229)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                  <Pencil size={13} />
                </button>
                <button type="button" onClick={() => handleDeleteCategory(category)}
                  style={{ padding: 6, borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: 'rgb(239,68,68)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                  <Trash2 size={13} />
                </button>
                <button type="button" onClick={() => setLongPressedCat(null)}
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
          {categoryItems.map(item => {
            const assigned = Array.isArray(item.assignedTo) ? item.assignedTo
              : item.assignedTo ? [item.assignedTo] : [];
            return (
              <div key={item.id}
                className="glass-card checklist-item-row"
                onClick={canEdit ? () => handleToggle(item) : undefined}
                style={{
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
                                <div key={uid} style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--surface)', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, marginLeft: idx > 0 ? -6 : 0, position: 'relative', zIndex: assigned.length - idx }}>
                                  {m?.photoURL
                                    ? <img src={m.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                                    : <span style={{ fontSize: 9, fontWeight: 800, color: '#fff' }}>{(m?.displayName || '?')[0]}</span>
                                  }
                                </div>
                              );
                            })}
                            {assigned.length > 3 && (
                              <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--surface)', background: 'var(--ink-8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0, marginLeft: -6 }}>
                                +{assigned.length - 3}
                              </div>
                            )}
                          </div>
                        ) : (
                          <User size={15} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
                        )}
                      </button>
                    )}
                    <button onClick={e => { e.stopPropagation(); handleStartEdit(item); }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center' }}>
                      <Pencil size={15} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDeleteItem(item.id); }}
                      style={{ background: 'transparent', border: 'none', borderRadius: 7, color: 'rgba(239,68,68,0.6)', cursor: 'pointer', padding: '5px 8px', display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : <div />}
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

export const defaultChecklist = [
  { id: 'doc-1', text: 'דרכון בתוקף (לפחות חצי שנה)', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-2', text: 'כרטיסי טיסה מודפסים / בנייד', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-3', text: 'אישור הזמנת מלון', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-4', text: 'ביטוח נסיעות לחו"ל בתוקף', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-5', text: 'רישיון נהיגה בינלאומי', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-6', text: 'המרת מט"ח / כרטיס אשראי בינלאומי', completed: false, category: 'מסמכים וסידורים' },
  { id: 'clo-1', text: 'בגדים להחלפה (לפי מספר ימי הטיול)', completed: false, category: 'בגדים' },
  { id: 'clo-2', text: 'בגד ים ומשקפי שמש', completed: false, category: 'בגדים' },
  { id: 'clo-3', text: 'נעלי הליכה נוחות', completed: false, category: 'בגדים' },
  { id: 'clo-4', text: 'ז\'קט / סוודר חם לטיסה', completed: false, category: 'בגדים' },
  { id: 'clo-5', text: 'לבנים, גרביים ופיג\'מה', completed: false, category: 'בגדים' },
  { id: 'ele-1', text: 'מטען לטלפון ומטען נייד (Power Bank)', completed: false, category: 'אלקטרוניקה' },
  { id: 'ele-2', text: 'מתאם שקעים בינלאומי', completed: false, category: 'אלקטרוניקה' },
  { id: 'ele-3', text: 'אוזניות נוחות לטיסה', completed: false, category: 'אלקטרוניקה' },
  { id: 'med-1', text: 'ערכת עזרה ראשונה (פלסטרים, פולידין)', completed: false, category: 'תרופות ועזרה ראשונה' },
  { id: 'med-2', text: 'משככי כאבים ותרופות אישיות', completed: false, category: 'תרופות ועזרה ראשונה' },
  { id: 'med-3', text: 'קרם הגנה ושפתון נגד יובש', completed: false, category: 'תרופות ועזרה ראשונה' },
  { id: 'med-4', text: 'מברשת שיניים, משחה וכלי רחצה', completed: false, category: 'תרופות ועזרה ראשונה' },
  { id: 'chk-1', text: 'סגירת ברז מים ראשי וגז בבית', completed: false, category: 'סידורים אחרונים בארץ' },
  { id: 'chk-2', text: 'כיבוי מכשירים חשמליים ופינוי זבל', completed: false, category: 'סידורים אחרונים בארץ' },
  { id: 'chk-3', text: 'נעילת חלונות, מרפסות ודלת כניסה', completed: false, category: 'סידורים אחרונים בארץ' },
  { id: 'chk-4', text: 'הפעלת חבילת גלישה / סים בינלאומי', completed: false, category: 'סידורים אחרונים בארץ' },
];

export default function ChecklistTab({ tripId, globalChecklist = [] }) {
  const { canEdit, tripMembers, currentUid, currentUserProfile, memberProfiles } = useTrip();
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

  const allMembers = useMemo(() => {
    const list = [];
    if (currentUid && currentUserProfile) {
      list.push({ uid: currentUid, displayName: currentUserProfile.displayName || currentUserProfile.email || '', photoURL: currentUserProfile.photoURL || '' });
    }
    Object.keys(tripMembers || {}).forEach(uid => {
      if (uid === currentUid) return;
      const p = memberProfiles?.[uid] || {};
      list.push({ uid, displayName: p.displayName || p.email || uid, photoURL: p.photoURL || '' });
    });
    return list;
  }, [currentUid, currentUserProfile, memberProfiles, tripMembers]);

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

  const doAdd = (overrideCategory) => {
    const text = newItemText.trim();
    if (!text || !tripId) return;
    const cat = overrideCategory !== undefined ? overrideCategory : newItemCategory;
    setNewItemText('');
    if (editingItemId) {
      setEditingItemId(null);
      setShowAddForm(false);
      updateDoc(doc(db, 'trips', tripId, 'checklist', editingItemId), { text, category: cat, assignedTo: newItemAssignedTo.length > 0 ? newItemAssignedTo : null });
    } else {
      setDoc(doc(db, 'trips', tripId, 'checklist', 'custom-' + Date.now()), {
        text, completed: false, category: cat, assignedTo: newItemAssignedTo.length > 0 ? newItemAssignedTo : null,
      });
    }
  };

  const handleAdd = (e) => { e.preventDefault(); doAdd(); };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setNewItemText('');
    setNewItemCategory('מסמכים וסידורים');
    setNewItemAssignedTo([]);
  };

  const handleStartEdit = (item) => {
    setEditingItemId(item.id);
    setNewItemText(item.text);
    setNewItemCategory(item.category);
    const a = item.assignedTo;
    setNewItemAssignedTo(Array.isArray(a) ? a : a ? [a] : []);
    setShowAddForm(true);
    document.querySelector('.app-content')?.scrollTo({ top: 0, behavior: 'smooth' });
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

      {/* Add New Item + Progress Ring */}
      {canEdit && (
        <div className="glass-card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 0, direction: 'rtl' }}>

          {/* Title row: ring on left, title on right */}
          <div style={{ display: 'flex', flexDirection: 'row', direction: 'ltr', alignItems: 'center', gap: 0 }}>

            {/* Progress ring */}
            <div style={{ width: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
              <div style={{ position: 'relative', width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 900, color: 'var(--primary-color)' }}>{progressPercent}%</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', marginTop: 1 }}>{completedCount}/{totalCount}</span>
                </div>
              </div>
            </div>

            {/* Title button */}
            <div style={{ flex: 1, direction: 'rtl' }}>
              <button type="button" onClick={() => setShowAddForm(s => !s)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', width: '100%', padding: 0 }}>
                {showAddForm
                  ? <ChevronUp size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  : <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)', flex: 1, textAlign: 'right' }}>
                  {editingItemId ? 'עריכת פריט ברשימה' : 'הוספת פריט חדש לרשימה'}
                </span>
                {!showAddForm && <Plus size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
              </button>
            </div>
          </div>

          {/* Form — full width below the title row */}
          {showAddForm && (
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
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
                      {allMembers.map(m => {
                        const isSelected = newItemAssignedTo.includes(m.uid);
                        return (
                          <button type="button" key={m.uid}
                            onClick={() => setNewItemAssignedTo(prev =>
                              prev.includes(m.uid) ? prev.filter(x => x !== m.uid) : [...prev, m.uid]
                            )}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, border: isSelected ? '1.5px solid var(--accent)' : '1.5px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: isSelected ? 'var(--p-10)' : 'var(--ink-5)', color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>
                            {m.photoURL
                              ? <img src={m.photoURL} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} referrerPolicy="no-referrer" />
                              : <div style={{ width: 18, height: 18, borderRadius: '50%', background: isSelected ? 'var(--accent)' : 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 800, flexShrink: 0 }}>{(m.displayName || '?')[0]}</div>
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
          )}
        </div>
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
          fontSize: 10.5, fontWeight: 800, borderRadius: 20, padding: '0 6px',
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
                  style={chipStyle(active)}>
                  {m.photoURL
                    ? <img src={m.photoURL} alt="" style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0 }} referrerPolicy="no-referrer" />
                    : <div style={{ width: 18, height: 18, borderRadius: '50%', background: active ? 'rgba(255,255,255,0.25)' : 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 800, flexShrink: 0 }}>{(m.displayName || '?')[0]}</div>
                  }
                  <span style={{ whiteSpace: 'nowrap' }}>{m.displayName}</span>
                  <span style={countStyle(active)}>{countFor(m.uid)}</span>
                </button>
              );
            })}
          </div>
        );
      })()}

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
              {allMembers.map(m => {
                const isSelected = pickerSelected.has(m.uid);
                return (
                  <button key={m.uid}
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
                    <span style={{ fontSize: 14, fontWeight: 600, color: isSelected ? 'var(--accent)' : 'var(--text-main)', flex: 1 }}>{m.displayName}</span>
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
