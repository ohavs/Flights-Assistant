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
  const [membersGlobalChecklists, setMembersGlobalChecklists] = useState({});

  // Form state
  const [newItemText, setNewItemText] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('מסמכים וסידורים');
  const [editingItemId, setEditingItemId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Category open/close — default ALL closed (empty obj = all closed)
  const [openCategories, setOpenCategories] = useState({});

  // Long-press to reveal category delete
  const [longPressedCat, setLongPressedCat] = useState(null);
  const longPressTimer = useRef(null);
  const longPressActive = useRef(false); // ref avoids stale-closure in onClick

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
    if (!ok || catItems.length === 0) return;
    const batch = writeBatch(db);
    catItems.forEach(item => batch.delete(doc(db, 'trips', tripId, 'checklist', item.id)));
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

      {/* Progress Card */}
      <div className="glass-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary-color)' }}>מוכנות לטיסה</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>נארזו {completedCount} מתוך {totalCount} פריטים</p>
          </div>
          <span style={{ fontSize: 28, fontWeight: 900, color: 'var(--primary-color)' }}>{progressPercent}%</span>
        </div>
        <div style={{ width: '100%', height: 8, background: 'rgba(11,11,48,0.06)', borderRadius: 50, overflow: 'hidden' }}>
          <div style={{ width: `${progressPercent}%`, height: '100%', background: 'var(--primary-color)', borderRadius: 50, transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)' }} />
        </div>
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
                  onCommit={cat => { if (newItemText.trim()) doAdd(cat); }}
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
        if (categoryItems.length === 0) return null;
        const isOpen = !!openCategories[category];
        const isLongPressed = longPressedCat === category;
        const doneCount = categoryItems.filter(i => i.completed).length;

        return (
          <div key={catIdx} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Category header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
                  <button type="button" onClick={() => handleDeleteCategory(category)}
                    style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: 'rgb(239,68,68)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    <Trash2 size={12} />
                    מחק קטגוריה
                  </button>
                  <button type="button" onClick={() => setLongPressedCat(null)}
                    style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
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
