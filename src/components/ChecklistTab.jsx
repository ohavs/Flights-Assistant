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
import { Check, Plus, Trash2, Pencil, ChevronDown, ChevronUp, X, GripVertical, List } from 'lucide-react';
import { CustomDropdown } from './CustomDatePicker';
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

/* ── RemindersCard ──────────────────────────────────────────────────────── */
function RemindersCard({ tripId, canEdit }) {
  const { currentUid, currentUserProfile, memberProfiles, tripMembers } = useTrip();
  const confirm = useConfirm();
  const [reminders, setReminders] = useState([]);
  const [shuffledReminders, setShuffledReminders] = useState([]);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState(null); // null | 'add' | 'edit' | 'pickUser'
  const [inputText, setInputText] = useState('');
  const [editId, setEditId] = useState(null);
  const [userPickRemId, setUserPickRemId] = useState(null);
  const [showAll, setShowAll] = useState(false);
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

  // Auto-advance every 3s; cleared and restarted whenever idx changes (manual or auto)
  const startAutoAdvance = useCallback(() => {
    clearInterval(autoTimer.current);
    if (shuffledReminders.length <= 1) return;
    autoTimer.current = setInterval(() => {
      setIdx(i => (i + 1) % shuffledReminders.length);
    }, 3000);
  }, [shuffledReminders.length]);

  useEffect(() => {
    startAutoAdvance();
    return () => clearInterval(autoTimer.current);
  }, [startAutoAdvance]);

  useEffect(() => {
    if (mode === 'add' || mode === 'edit') inputRef.current?.focus();
  }, [mode]);


  // All trip members with their profiles for the user picker
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

  const handleSave = () => {
    const text = inputText.trim();
    if (!text) { setMode(null); return; }
    if (mode === 'add') {
      const newRef = doc(collection(db, 'trips', tripId, 'reminders'));
      const newIdx = reminders.length;
      setMode(null); setInputText('');
      setTimeout(() => goTo(newIdx), 50);
      setDoc(newRef, {
        text, createdAt: Date.now(),
        addedByUid: currentUid || '',
        addedByName: currentUserProfile?.displayName || currentUserProfile?.email || '',
        addedByPhoto: currentUserProfile?.photoURL || '',
      });
    } else if (mode === 'edit' && editId) {
      setMode(null); setInputText(''); setEditId(null);
      updateDoc(doc(db, 'trips', tripId, 'reminders', editId), { text });
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
    ids.forEach(id => deleteDoc(doc(db, 'trips', tripId, 'reminders', id)));
  };

  const handlePickUser = (remId, member) => {
    updateDoc(doc(db, 'trips', tripId, 'reminders', remId), {
      addedByUid: member.uid,
      addedByName: member.displayName,
      addedByPhoto: member.photoURL,
    });
    setUserPickRemId(null);
    setMode(null);
  };

  const iconBtn = (color = 'var(--text-muted)') => ({
    background: 'none', border: 'none', cursor: 'pointer',
    color, padding: '6px 8px', display: 'flex', alignItems: 'center', flexShrink: 0,
  });

  const Avatar = ({ photoURL, name, size = 26 }) => (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {photoURL
        ? <img src={photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
        : <span style={{ fontSize: size * 0.38, fontWeight: 700, color: '#fff' }}>{(name || '?')[0]}</span>}
    </div>
  );

  return (
    <div>
      <style>{`
        @keyframes remFadeUp {
          from { opacity: 0; transform: translateY(7px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>

      {/* Text input overlay (add / edit) */}
      {(mode === 'add' || mode === 'edit') && (
        <div className="glass-card" style={{ direction: 'rtl', padding: '12px 14px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0 }}>
            {mode === 'add' ? 'תזכורת חדשה' : 'עריכה'}
          </span>
          <input ref={inputRef} type="text" className="form-control"
            value={inputText} onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setMode(null); setEditId(null); } }}
            placeholder="כתוב תזכורת..."
            style={{ flex: 1, minHeight: 36, fontSize: 14 }}
          />
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button onClick={handleSave}
              style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', borderRadius: 10, cursor: 'pointer', background: 'var(--accent)', color: '#fff' }}>
              <Check size={15} />
            </button>
            <button onClick={() => { setMode(null); setEditId(null); }}
              style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', borderRadius: 10, cursor: 'pointer', background: 'var(--ink-7)', color: 'var(--text-muted)' }}>
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* User picker overlay */}
      {mode === 'pickUser' && (
        <div className="glass-card" style={{ direction: 'rtl', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>שנה משתמש</span>
            <button onClick={() => { setMode(null); setUserPickRemId(null); }} style={iconBtn()}>
              <X size={15} />
            </button>
          </div>
          {allMembers.map(m => (
            <button key={m.uid} onClick={() => handlePickUser(userPickRemId, m)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', background: 'var(--ink-4)', border: 'none', borderRadius: 10, cursor: 'pointer', textAlign: 'right' }}>
              <Avatar photoURL={m.photoURL} name={m.displayName} size={30} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main)' }}>{m.displayName}</span>
            </button>
          ))}
        </div>
      )}

      {/* Reminder card — visible only when no overlay is active */}
      {mode === null && (
        shuffledReminders.length === 0 ? (
          <div className="glass-card" style={{ direction: 'rtl', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>תזכורות</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1, textAlign: 'center' }}>
              {canEdit ? 'לחץ + להוספת תזכורת' : 'אין תזכורות'}
            </span>
            {canEdit && (
              <button onClick={() => { setInputText(''); setMode('add'); }} style={iconBtn('var(--accent)')}>
                <Plus size={15} />
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
                padding: '14px 18px 12px', gap: 10,
                height: 160, boxSizing: 'border-box',
                borderTop: '3px solid var(--accent)',
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>תזכורות</span>
                  {n > 1 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      background: 'var(--p-10)', color: 'var(--accent)',
                      border: '1px solid var(--p-18)',
                      borderRadius: 20, padding: '1px 7px',
                    }}>
                      {idx + 1} / {n}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
                  <button onClick={() => setShowAll(true)} style={iconBtn('var(--accent)')} title="כל התזכורות">
                    <List size={14} />
                  </button>
                  {canEdit && (<>
                    <button onClick={() => { setInputText(r.text); setEditId(r.id); setMode('edit'); }} style={iconBtn()}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDeleteById(r.id)} style={iconBtn('rgba(239,68,68,0.75)')}>
                      <Trash2 size={14} />
                    </button>
                    <button onClick={() => { setInputText(''); setMode('add'); }} style={iconBtn('var(--accent)')}>
                      <Plus size={14} />
                    </button>
                  </>)}
                </div>
              </div>

              {/* Animated text */}
              <div key={`${r.id}-${idx}`} style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', animation: 'remFadeUp 0.35s ease' }}>
                <p style={{
                  fontSize: 17, fontWeight: 600, color: 'var(--text-main)',
                  textAlign: 'right', lineHeight: 1.55, margin: 0, width: '100%',
                  display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  userSelect: 'none',
                }}>{r.text}</p>
              </div>

              {/* Footer: user + dots */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <button onClick={() => canEdit && (setUserPickRemId(r.id), setMode('pickUser'))}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: canEdit ? 'pointer' : 'default' }}>
                  <Avatar photoURL={r.addedByPhoto} name={r.addedByName} size={22} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{r.addedByName || ''}</span>
                  {canEdit && <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} />}
                </button>
                {n > 1 && (
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    {shuffledReminders.map((_, j) => (
                      <button key={j} onClick={() => goTo(j)} style={{
                        width: j === idx ? 18 : 6, height: 6, borderRadius: 3,
                        border: 'none', padding: 0, flexShrink: 0,
                        background: j === idx ? 'var(--accent)' : 'var(--p-15)',
                        cursor: 'pointer', transition: 'all 0.25s ease',
                      }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()
      )}
      {/* All-reminders bottom sheet */}
      {showAll && (
        <div
          onClick={() => setShowAll(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(11,11,48,0.50)', backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
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
              maxHeight: 'calc(75vh - 64px)',
              overflow: 'hidden',
            }}
          >
            {/* Drag handle pill */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--ink-12)' }} />
            </div>

            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 20px 14px',
              borderBottom: '1px solid var(--ink-7)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>כל התזכורות</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, background: 'var(--p-10)',
                  color: 'var(--accent)', border: '1px solid var(--p-18)',
                  borderRadius: 20, padding: '1px 8px',
                }}>{reminders.length}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {checkedIds.size > 0 && (<>
                  <button onClick={handleBulkDelete} style={{
                    fontSize: 12, color: '#fff', background: 'rgba(220,38,38,0.85)',
                    border: 'none', borderRadius: 20,
                    cursor: 'pointer', padding: '3px 10px', fontWeight: 700,
                  }}>מחק ({checkedIds.size})</button>
                  <button onClick={() => setCheckedIds(new Set())} style={{
                    fontSize: 12, color: 'var(--text-muted)', background: 'var(--ink-6)',
                    border: 'none', borderRadius: 20,
                    cursor: 'pointer', padding: '3px 10px', fontWeight: 600,
                  }}>בטל בחירה</button>
                </>)}
                <button onClick={() => setShowAll(false)} style={{
                  background: 'var(--ink-6)', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 7, display: 'flex', borderRadius: 10,
                }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* List */}
            <div style={{ overflowY: 'auto', padding: '6px 12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {reminders.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, padding: '28px 0' }}>אין תזכורות</p>
              ) : reminders.map((r, ri) => {
                const checked = checkedIds.has(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => setCheckedIds(prev => {
                      const next = new Set(prev);
                      checked ? next.delete(r.id) : next.add(r.id);
                      return next;
                    })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '13px 10px', borderRadius: 14,
                      background: checked ? 'var(--p-8)' : ri % 2 === 0 ? 'transparent' : 'var(--ink-2)',
                      border: 'none', cursor: 'pointer', textAlign: 'right', width: '100%',
                      transition: 'background 0.15s',
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                      border: checked ? 'none' : '2px solid rgba(79,70,229,0.25)',
                      background: checked ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.18s', boxShadow: checked ? '0 2px 8px rgba(79,70,229,0.3)' : 'none',
                    }}>
                      {checked && <Check size={13} color="#fff" strokeWidth={3} />}
                    </div>
                    {/* Text */}
                    <span style={{
                      fontSize: 15, fontWeight: checked ? 400 : 500,
                      color: 'var(--text-main)', lineHeight: 1.45, flex: 1,
                      textDecoration: checked ? 'line-through' : 'none',
                      opacity: checked ? 0.4 : 1, transition: 'all 0.18s',
                    }}>
                      {r.text}
                    </span>
                    {/* Author avatar */}
                    {(r.addedByPhoto || r.addedByName) && (
                      <div title={r.addedByName || ''} style={{ flexShrink: 0, opacity: checked ? 0.35 : 0.85, transition: 'opacity 0.18s' }}>
                        <Avatar photoURL={r.addedByPhoto} name={r.addedByName} size={26} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
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
  pendingDeleteId, handleToggle, handleStartEdit, handleDeleteItem,
  quickAddCat, setQuickAddCat, quickAddText, setQuickAddText,
  quickAddInputRef, handleQuickAdd,
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
            const isPending = pendingDeleteId === item.id;
            return (
              <div key={item.id}
                className="glass-card checklist-item-row"
                onClick={canEdit && !isPending ? () => handleToggle(item) : undefined}
                style={{
                  padding: '12px 14px',
                  cursor: canEdit && !isPending ? 'pointer' : 'default',
                  background: isPending ? 'rgba(239,68,68,0.06)' : item.completed ? 'rgba(255,255,255,0.45)' : 'var(--card-bg)',
                  border: isPending ? '1.5px solid rgba(239,68,68,0.25)' : item.completed ? '1px solid rgba(255,255,255,0.2)' : 'var(--card-border)',
                  transition: 'background 0.2s, border 0.2s',
                }}
              >
                <div style={{ width: 22, height: 22, borderRadius: 6, border: item.completed ? 'none' : '2px solid rgba(11,11,48,0.18)', background: item.completed ? 'var(--primary-color)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', flexShrink: 0 }}>
                  {item.completed && <Check size={14} color="#ffffff" strokeWidth={3} />}
                </div>
                <span style={{ fontSize: 15, fontWeight: item.completed ? 500 : 600, textDecoration: item.completed ? 'line-through' : 'none', color: isPending ? 'rgb(239,68,68)' : item.completed ? 'var(--text-muted)' : 'var(--text-main)', transition: 'all 0.2s ease', textAlign: 'right', wordBreak: 'break-word', flex: 1 }}>
                  {item.text}
                </span>
                {canEdit ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    {!isPending && (
                      <button onClick={e => { e.stopPropagation(); handleStartEdit(item); }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center' }}>
                        <Pencil size={15} />
                      </button>
                    )}
                    <button onClick={e => { e.stopPropagation(); handleDeleteItem(item.id); }}
                      style={{ background: isPending ? 'rgba(239,68,68,0.12)' : 'transparent', border: isPending ? '1px solid rgba(239,68,68,0.3)' : 'none', borderRadius: 7, color: isPending ? 'rgb(239,68,68)' : 'rgba(239,68,68,0.6)', cursor: 'pointer', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s' }}>
                      <Trash2 size={14} />
                      {isPending && <span style={{ fontSize: 11, fontWeight: 800 }}>מחק?</span>}
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
  const { canEdit, tripMembers } = useTrip();
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
  const [editingItemId, setEditingItemId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Category open/close — default ALL closed (empty obj = all closed)
  const [openCategories, setOpenCategories] = useState({});

  // Long-press to reveal category actions
  const [longPressedCat, setLongPressedCat] = useState(null);
  const longPressTimer = useRef(null);
  const longPressActive = useRef(false);
  const [editingCat, setEditingCat] = useState(null);
  const [editCatText, setEditCatText] = useState('');

  // Two-tap delete for items
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const pendingDeleteTimer = useRef(null);

  // Quick-add inside an open category
  const [quickAddCat, setQuickAddCat] = useState(null);
  const [quickAddText, setQuickAddText] = useState('');
  const quickAddInputRef = useRef(null);

  // Cleanup timers on unmount
  useEffect(() => () => {
    clearTimeout(longPressTimer.current);
    clearTimeout(pendingDeleteTimer.current);
  }, []);

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
    const syncRef = doc(db, 'trips', tripId, 'settings', 'checklistSync');
    const batch = writeBatch(db);
    catItems.forEach(item => batch.delete(doc(db, 'trips', tripId, 'checklist', item.id)));
    await batch.commit();
    await setDoc(syncRef, { extraCategories: extraCategories.filter(c => c !== cat) }, { merge: true });
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

  // Two-tap delete: first tap → pending (highlighted), second tap → delete
  const handleDeleteItem = (id) => {
    if (!tripId) return;
    if (pendingDeleteId === id) {
      clearTimeout(pendingDeleteTimer.current);
      setPendingDeleteId(null);
      deleteDoc(doc(db, 'trips', tripId, 'checklist', id));
      if (mergedGlobalChecklist.some(g => g.id === id)) {
        const syncRef = doc(db, 'trips', tripId, 'settings', 'checklistSync');
        setDoc(syncRef, {
          deletedGlobalIds: [...new Set([...deletedGlobalIds, id])],
        }, { merge: true });
      }
    } else {
      clearTimeout(pendingDeleteTimer.current);
      setPendingDeleteId(id);
      pendingDeleteTimer.current = setTimeout(() => setPendingDeleteId(null), 3000);
    }
  };

  const doAdd = (overrideCategory) => {
    const text = newItemText.trim();
    if (!text || !tripId) return;
    const cat = overrideCategory !== undefined ? overrideCategory : newItemCategory;
    setNewItemText('');
    if (editingItemId) {
      setEditingItemId(null);
      updateDoc(doc(db, 'trips', tripId, 'checklist', editingItemId), { text, category: cat });
    } else {
      setDoc(doc(db, 'trips', tripId, 'checklist', 'custom-' + Date.now()), {
        text, completed: false, category: cat,
      });
    }
  };

  const handleAdd = (e) => { e.preventDefault(); doAdd(); };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setNewItemText('');
    setNewItemCategory('מסמכים וסידורים');
  };

  const handleStartEdit = (item) => {
    setPendingDeleteId(null);
    setEditingItemId(item.id);
    setNewItemText(item.text);
    setNewItemCategory(item.category);
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
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, padding: '40px 0' }}>
        <div className="pulsing-dot" style={{ width: 12, height: 12 }} />
        <span style={{ marginRight: 10, color: 'var(--text-muted)', fontSize: 15 }}>טוען רשימת ציוד...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Reminders — full-width One UI widget carousel */}
      <RemindersCard tripId={tripId} canEdit={canEdit} />

      {/* Add New Item + Progress Ring */}
      {canEdit && (
        <div className="glass-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0, direction: 'rtl' }}>

          {/* Title row: ring on left, title on right */}
          <div style={{ display: 'flex', flexDirection: 'row', direction: 'ltr', alignItems: 'center', gap: 0 }}>

            {/* Progress ring */}
            <div style={{ width: 54, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
              <div style={{ position: 'relative', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width={44} height={44} viewBox="0 0 44 44" style={{ position: 'absolute', top: 0, left: 0 }}>
                  <circle cx={22} cy={22} r={17} fill="none" stroke="rgba(11,11,48,0.08)" strokeWidth={4} />
                  <circle cx={22} cy={22} r={17} fill="none" stroke="var(--primary-color)" strokeWidth={4}
                    strokeLinecap="round"
                    strokeDasharray="106.81"
                    strokeDashoffset={`${(106.81 * (1 - progressPercent / 100)).toFixed(2)}`}
                    transform="rotate(-90 22 22)"
                    style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.4,0,0.2,1)' }}
                  />
                </svg>
                <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--primary-color)' }}>{progressPercent}%</span>
                  <span style={{ fontSize: 7, fontWeight: 700, color: 'var(--text-muted)', marginTop: 1 }}>{completedCount}/{totalCount}</span>
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
                </div>
                <CustomDropdown
                  label="קטגוריה" value={newItemCategory} onChange={setNewItemCategory}
                  options={categories} addable addLabel="הוסף קטגוריה חדשה"
                  onCommit={cat => saveExtraCategory(cat)}
                />
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

      {/* Checklist categories — sortable, all closed by default */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={categories} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {categories.map((category) => {
              const categoryItems = items.filter(item => item.category === category);
              if (categoryItems.length === 0 && !extraCategories.includes(category)) return null;
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
                  pendingDeleteId={pendingDeleteId}
                  handleToggle={handleToggle}
                  handleStartEdit={handleStartEdit}
                  handleDeleteItem={handleDeleteItem}
                  quickAddCat={quickAddCat}
                  setQuickAddCat={setQuickAddCat}
                  quickAddText={quickAddText}
                  setQuickAddText={setQuickAddText}
                  quickAddInputRef={quickAddInputRef}
                  handleQuickAdd={handleQuickAdd}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

    </div>
  );
}
