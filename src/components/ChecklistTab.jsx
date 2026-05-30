import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { Check, Plus, Trash2, Pencil, ChevronDown, ChevronUp, X } from 'lucide-react';
import { CustomDropdown } from './CustomDatePicker';
import { useTrip } from '../TripContext';
import { useConfirm } from '../ConfirmContext';

/* ── RemindersCard ──────────────────────────────────────────────────────── */
function RemindersCard({ tripId, canEdit }) {
  const [reminders, setReminders] = useState([]);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState(null); // null | 'add' | 'edit'
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const ignoreScroll = useRef(false);

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

  useEffect(() => {
    if (mode && inputRef.current) inputRef.current.focus();
  }, [mode]);

  // Scroll to idx programmatically (dot click / after add)
  const scrollTo = (i) => {
    if (!scrollRef.current) return;
    ignoreScroll.current = true;
    scrollRef.current.scrollTo({ left: i * scrollRef.current.offsetWidth, behavior: 'smooth' });
    setIdx(i);
    setTimeout(() => { ignoreScroll.current = false; }, 400);
  };

  const handleScroll = () => {
    if (ignoreScroll.current || !scrollRef.current) return;
    const { scrollLeft, offsetWidth } = scrollRef.current;
    const newIdx = Math.round(scrollLeft / offsetWidth);
    if (newIdx !== idx) setIdx(newIdx);
  };

  const cur = reminders[idx] ?? null;

  const handleSave = async () => {
    const text = inputText.trim();
    if (!text) { setMode(null); return; }
    if (mode === 'add') {
      const newRef = doc(collection(db, 'trips', tripId, 'reminders'));
      await setDoc(newRef, { text, createdAt: Date.now() });
      const newIdx = reminders.length;
      setMode(null);
      setInputText('');
      setTimeout(() => scrollTo(newIdx), 50);
    } else if (mode === 'edit' && cur) {
      await updateDoc(doc(db, 'trips', tripId, 'reminders', cur.id), { text });
      setMode(null);
      setInputText('');
    }
  };

  const handleDelete = async () => {
    if (!cur) return;
    await deleteDoc(doc(db, 'trips', tripId, 'reminders', cur.id));
    setIdx(i => Math.max(0, i - 1));
  };

  return (
    <div className="glass-card" style={{
      flex: 1, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 6,
      overflow: 'hidden', minWidth: 0,
    }}>
      <style>{`.rc-scroll::-webkit-scrollbar{display:none}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.3px' }}>תזכורות</span>
        {canEdit && mode === null && (
          <button onClick={() => { setInputText(''); setMode('add'); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 2, display: 'flex' }}>
            <Plus size={15} />
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', minWidth: 0 }}>
        {mode !== null ? (
          <div style={{ width: '100%', display: 'flex', gap: 5, alignItems: 'center' }}>
            <input ref={inputRef} type="text" className="form-control"
              value={inputText} onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setMode(null); }}
              placeholder="כתוב תזכורת..."
              style={{ flex: 1, minHeight: 32, fontSize: 13 }}
            />
            <button onClick={handleSave} className="btn-primary" style={{ padding: '4px 8px', flexShrink: 0 }}>
              <Check size={13} />
            </button>
            <button onClick={() => setMode(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 3, display: 'flex', flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>
        ) : reminders.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, width: '100%', textAlign: 'center' }}>
            {canEdit ? 'לחץ + להוספת תזכורת' : 'אין תזכורות'}
          </span>
        ) : (
          /* Scroll-snap carousel — browser handles physics */
          <div
            ref={scrollRef}
            className="rc-scroll"
            onScroll={handleScroll}
            style={{
              display: 'flex', width: '100%', height: '100%',
              overflowX: 'auto', overflowY: 'hidden',
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none', msOverflowStyle: 'none',
              direction: 'ltr', // avoid RTL scroll quirks
            }}
          >
            {reminders.map(r => (
              <div key={r.id} style={{
                flex: '0 0 100%', scrollSnapAlign: 'start',
                direction: 'rtl', display: 'flex', alignItems: 'center',
              }}>
                <p style={{
                  fontSize: 13, fontWeight: 600, color: 'var(--text-main)',
                  textAlign: 'right', lineHeight: 1.5, margin: 0, width: '100%',
                  display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  userSelect: 'none',
                }}>{r.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom: dots + actions */}
      {mode === null && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, minHeight: 18 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {reminders.map((_, i) => (
              <button key={i} onClick={() => scrollTo(i)} style={{
                width: i === idx ? 16 : 6, height: 6, borderRadius: 3,
                border: 'none', padding: 0, flexShrink: 0,
                background: i === idx ? 'var(--primary-color)' : 'rgba(11,11,48,0.15)',
                cursor: 'pointer', transition: 'all 0.2s ease',
              }} />
            ))}
          </div>
          {canEdit && cur && (
            <div style={{ display: 'flex' }}>
              <button onClick={() => { setInputText(cur.text); setMode('edit'); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}>
                <Pencil size={12} />
              </button>
              <button onClick={handleDelete}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.7)', padding: 4, display: 'flex' }}>
                <Trash2 size={12} />
              </button>
            </div>
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
  const categories = Array.from(new Set([
    ...defaultCategoryNames,
    ...extraCategories,
    ...items.map(i => i.category).filter(Boolean),
  ]));

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
      setDeletedGlobalIds(snap.exists() ? (snap.data()?.deletedGlobalIds || []) : []);
      setExtraCategories(snap.exists() ? (snap.data()?.extraCategories || []) : []);
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
    setOpenCategories(prev => ({ ...prev, [cat]: true }));
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
  const handleToggle = async (item) => {
    if (!tripId) return;
    await updateDoc(doc(db, 'trips', tripId, 'checklist', item.id), {
      completed: !item.completed,
    });
  };

  // Two-tap delete: first tap → pending (highlighted), second tap → delete
  const handleDeleteItem = async (id) => {
    if (!tripId) return;
    if (pendingDeleteId === id) {
      clearTimeout(pendingDeleteTimer.current);
      setPendingDeleteId(null);
      await deleteDoc(doc(db, 'trips', tripId, 'checklist', id));
      if (mergedGlobalChecklist.some(g => g.id === id)) {
        const syncRef = doc(db, 'trips', tripId, 'settings', 'checklistSync');
        await setDoc(syncRef, {
          deletedGlobalIds: [...new Set([...deletedGlobalIds, id])],
        }, { merge: true });
      }
    } else {
      clearTimeout(pendingDeleteTimer.current);
      setPendingDeleteId(id);
      pendingDeleteTimer.current = setTimeout(() => setPendingDeleteId(null), 3000);
    }
  };

  const doAdd = async (overrideCategory) => {
    const text = newItemText.trim();
    if (!text || !tripId) return;
    const cat = overrideCategory !== undefined ? overrideCategory : newItemCategory;
    if (editingItemId) {
      await updateDoc(doc(db, 'trips', tripId, 'checklist', editingItemId), { text, category: cat });
      setEditingItemId(null);
    } else {
      await setDoc(doc(db, 'trips', tripId, 'checklist', 'custom-' + Date.now()), {
        text, completed: false, category: cat,
      });
    }
    setNewItemText('');
  };

  const handleAdd = async (e) => { e.preventDefault(); await doAdd(); };

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

  const handleQuickAdd = async (e, cat) => {
    e.preventDefault();
    if (!quickAddText.trim() || !tripId) return;
    await setDoc(doc(db, 'trips', tripId, 'checklist', 'custom-' + Date.now()), {
      text: quickAddText.trim(), completed: false, category: cat,
    });
    setQuickAddText('');
    setQuickAddCat(null);
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

      {/* Progress + Reminders Row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        {/* Compact Progress Card — circular ring */}
        <div className="glass-card" style={{ flex: '0 0 36%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
          <div style={{ position: 'relative', width: 74, height: 74, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={74} height={74} viewBox="0 0 74 74" style={{ position: 'absolute', top: 0, left: 0 }}>
              <circle cx={37} cy={37} r={29} fill="none" stroke="rgba(11,11,48,0.08)" strokeWidth={7} />
              <circle cx={37} cy={37} r={29} fill="none" stroke="var(--primary-color)" strokeWidth={7}
                strokeLinecap="round"
                strokeDasharray="182.21"
                strokeDashoffset={`${(182.21 * (1 - progressPercent / 100)).toFixed(2)}`}
                transform="rotate(-90 37 37)"
                style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.4,0,0.2,1)' }}
              />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, lineHeight: 1 }}>
              <span style={{ fontSize: 17, fontWeight: 900, color: 'var(--primary-color)' }}>{progressPercent}%</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2 }}>{completedCount}/{totalCount}</span>
            </div>
          </div>
        </div>

        {/* Reminders carousel */}
        <RemindersCard tripId={tripId} canEdit={canEdit} />
      </div>

      {/* Add New Item — collapsible, editor only */}
      {canEdit && (
        <div className="glass-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
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

      {/* Checklist categories — all closed by default */}
      {categories.map((category, catIdx) => {
        const categoryItems = items.filter(item => item.category === category);
        if (categoryItems.length === 0 && !extraCategories.includes(category)) return null;
        const isOpen = !!openCategories[category];
        const isLongPressed = longPressedCat === category;
        const doneCount = categoryItems.filter(i => i.completed).length;

        return (
          <div key={catIdx} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Category header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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

                {/* Quick-add at bottom of open category */}
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
      })}

    </div>
  );
}
