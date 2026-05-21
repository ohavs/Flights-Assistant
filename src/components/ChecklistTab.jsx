import React, { useState, useEffect } from 'react';
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
import { Check, Plus, Trash2, RotateCcw, Pencil, ChevronDown } from 'lucide-react';
import { CustomDropdown } from './CustomDatePicker';

export const defaultChecklist = [
  // Category 1: Documents & Core
  { id: 'doc-1', text: 'דרכון בתוקף (לפחות חצי שנה)', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-2', text: 'כרטיסי טיסה מודפסים / בנייד', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-3', text: 'אישור הזמנת מלון', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-4', text: 'ביטוח נסיעות לחו"ל בתוקף', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-5', text: 'רישיון נהיגה בינלאומי', completed: false, category: 'מסמכים וסידורים' },
  { id: 'doc-6', text: 'המרת מט"ח / כרטיס אשראי בינלאומי', completed: false, category: 'מסמכים וסידורים' },
  
  // Category 2: Clothing
  { id: 'clo-1', text: 'בגדים להחלפה (לפי מספר ימי הטיול)', completed: false, category: 'בגדים' },
  { id: 'clo-2', text: 'בגד ים ומשקפי שמש', completed: false, category: 'בגדים' },
  { id: 'clo-3', text: 'נעלי הליכה נוחות', completed: false, category: 'בגדים' },
  { id: 'clo-4', text: 'ז\'קט / סוודר חם לטיסה', completed: false, category: 'בגדים' },
  { id: 'clo-5', text: 'לבנים, גרביים ופיג\'מה', completed: false, category: 'בגדים' },

  // Category 3: Electronics
  { id: 'ele-1', text: 'מטען לטלפון ומטען נייד (Power Bank)', completed: false, category: 'אלקטרוניקה' },
  { id: 'ele-2', text: 'מתאם שקעים בינלאומי', completed: false, category: 'אלקטרוניקה' },
  { id: 'ele-3', text: 'אוזניות נוחות לטיסה', completed: false, category: 'אלקטרוניקה' },

  // Category 4: Meds & Personal
  { id: 'med-1', text: 'ערכת עזרה ראשונה (פלסטרים, פולידין)', completed: false, category: 'תרופות ועזרה ראשונה' },
  { id: 'med-2', text: 'משככי כאבים ותרופות אישיות', completed: false, category: 'תרופות ועזרה ראשונה' },
  { id: 'med-3', text: 'קרם הגנה ושפתון נגד יובש', completed: false, category: 'תרופות ועזרה ראשונה' },
  { id: 'med-4', text: 'מברשת שיניים, משחה וכלי רחצה', completed: false, category: 'תרופות ועזרה ראשונה' },

  // Category 5: Last checks
  { id: 'chk-1', text: 'סגירת ברז מים ראשי וגז בבית', completed: false, category: 'סידורים אחרונים בארץ' },
  { id: 'chk-2', text: 'כיבוי מכשירים חשמליים ופינוי זבל', completed: false, category: 'סידורים אחרונים בארץ' },
  { id: 'chk-3', text: 'נעילת חלונות, מרפסות ודלת כניסה', completed: false, category: 'סידורים אחרונים בארץ' },
  { id: 'chk-4', text: 'הפעלת חבילת גלישה / סים בינלאומי', completed: false, category: 'סידורים אחרונים בארץ' },
];

export default function ChecklistTab({ tripId }) {
  const [items, setItems] = useState([]);
  const [newItemText, setNewItemText] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('מסמכים וסידורים');
  const [editingItemId, setEditingItemId] = useState(null);
  const [loading, setLoading] = useState(true);
  // Collapsed by default to save space
  const [collapsedCategories, setCollapsedCategories] = useState({});

  const toggleCategory = (cat) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const categories = [
    'מסמכים וסידורים',
    'בגדים',
    'אלקטרוניקה',
    'תרופות ועזרה ראשונה',
    'סידורים אחרונים בארץ'
  ];

  // Listen to Firestore checklist
  useEffect(() => {
    if (!tripId) return;
    const unsubscribe = onSnapshot(collection(db, 'trips', tripId, 'checklist'), (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setItems(fetchedItems);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tripId]);

  const handleToggle = async (item) => {
    if (!tripId) return;
    const docRef = doc(db, 'trips', tripId, 'checklist', item.id);
    await updateDoc(docRef, {
      completed: !item.completed
    });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newItemText.trim() || !tripId) return;

    if (editingItemId) {
      const docRef = doc(db, 'trips', tripId, 'checklist', editingItemId);
      await updateDoc(docRef, {
        text: newItemText.trim(),
        category: newItemCategory
      });
      setEditingItemId(null);
    } else {
      const id = 'custom-' + Date.now();
      const docRef = doc(db, 'trips', tripId, 'checklist', id);
      await setDoc(docRef, {
        text: newItemText.trim(),
        completed: false,
        category: newItemCategory
      });
    }

    setNewItemText('');
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setNewItemText('');
    setNewItemCategory('מסמכים וסידורים');
  };

  const handleStartEdit = (item) => {
    setEditingItemId(item.id);
    setNewItemText(item.text);
    setNewItemCategory(item.category);
    
    // Smooth scroll the app-content container to the top
    const container = document.querySelector('.app-content');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleDelete = async (id) => {
    if (!tripId) return;
    const docRef = doc(db, 'trips', tripId, 'checklist', id);
    await deleteDoc(docRef);
  };

  const handleReset = async () => {
    if (!tripId) return;
    if (!window.confirm('האם אתה בטוח שברצונך לאפס את רשימת הציוד לרשימת ברירת המחדל? כל הפריטים האישיים יימחקו.')) {
      return;
    }

    setLoading(true);
    const batch = writeBatch(db);
    items.forEach((item) => {
      batch.delete(doc(db, 'trips', tripId, 'checklist', item.id));
    });
    await batch.commit();

    const batch2 = writeBatch(db);
    defaultChecklist.forEach((item) => {
      const docRef = doc(collection(db, 'trips', tripId, 'checklist'), item.id);
      batch2.set(docRef, {
        text: item.text,
        completed: item.completed,
        category: item.category
      });
    });
    await batch2.commit();
    setLoading(false);
  };

  // Calculations for progress bar
  const totalCount = items.length;
  const completedCount = items.filter(item => item.completed).length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, height: '100%', padding: '40px 0' }}>
        <div className="pulsing-dot" style={{ width: '12px', height: '12px' }}></div>
        <span style={{ marginRight: '10px', color: 'var(--text-muted)', fontSize: '15px' }}>טוען רשימת ציוד...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Progress Card */}
      <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--primary-color)' }}>מוכנות לטיסה</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>נארזו {completedCount} מתוך {totalCount} פריטים</p>
          </div>
          <span style={{ fontSize: '28px', fontWeight: '900', color: 'var(--primary-color)' }}>{progressPercent}%</span>
        </div>
        
        {/* Progress Bar Track */}
        <div style={{ width: '100%', height: '8px', background: 'rgba(11, 11, 48, 0.06)', borderRadius: '50px', overflow: 'hidden' }}>
          <div style={{ 
            width: `${progressPercent}%`, 
            height: '100%', 
            background: 'var(--primary-color)', 
            borderRadius: '50px',
            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' 
          }} />
        </div>
      </div>

      {/* Add New Item form */}
      <form onSubmit={handleAdd} className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '800', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '6px' }}>
          {editingItemId ? 'עריכת פריט ברשימה' : 'הוספת פריט חדש לרשימה'}
        </h4>
        
        <div className="row-2" style={{ gap: '10px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>מה להביא?</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="למשל: סוודר, מטען" 
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              required
            />
          </div>
          <CustomDropdown
            label="קטגוריה"
            value={newItemCategory}
            onChange={setNewItemCategory}
            options={categories}
          />
        </div>

        {editingItemId ? (
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button type="submit" className="btn-primary" style={{ flex: 1 }}>שמור שינויים</button>
            <button type="button" className="btn-secondary" onClick={handleCancelEdit}>ביטול</button>
          </div>
        ) : (
          <button type="submit" className="btn-primary" style={{ marginTop: '4px', width: '100%' }}>
            <Plus size={18} />
            <span>הוסף פריט לרשימה</span>
          </button>
        )}
      </form>

      {/* Checklist categories — collapsible by default */}
      {categories.map((category, catIdx) => {
        const categoryItems = items.filter(item => item.category === category);
        if (categoryItems.length === 0) return null;
        const isCollapsed = !!collapsedCategories[category];
        const doneCount = categoryItems.filter(i => i.completed).length;

        return (
          <div key={catIdx} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Category header — click to toggle */}
            <button
              type="button"
              onClick={() => toggleCategory(category)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px 4px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                width: '100%',
                fontFamily: 'var(--font-hebrew)'
              }}
            >
              <ChevronDown
                size={16}
                style={{
                  color: 'var(--text-muted)',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                  flexShrink: 0
                }}
              />
              <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--primary-color)', letterSpacing: '-0.2px', textAlign: 'right', flex: 1 }}>
                {category}
              </h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
                {doneCount}/{categoryItems.length}
              </span>
            </button>

            {!isCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {categoryItems.map((item) => (
                  <div
                    key={item.id}
                    className="glass-card checklist-item-row"
                    onClick={() => handleToggle(item)}
                    style={{
                      padding: '12px 14px',
                      cursor: 'pointer',
                      background: item.completed ? 'rgba(255,255,255,0.45)' : 'var(--card-bg)',
                      border: item.completed ? '1px solid rgba(255,255,255,0.2)' : 'var(--card-border)',
                    }}
                  >
                    {/* RTL grid: checkbox(right, first in DOM) | text(center) | actions(left, last in DOM) */}
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '6px',
                      border: item.completed ? 'none' : '2px solid rgba(11, 11, 48, 0.18)',
                      background: item.completed ? 'var(--primary-color)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                      flexShrink: 0
                    }}>
                      {item.completed && <Check size={14} color="#ffffff" strokeWidth={3} />}
                    </div>

                    <span style={{
                      fontSize: '15px',
                      fontWeight: item.completed ? '500' : '600',
                      textDecoration: item.completed ? 'line-through' : 'none',
                      color: item.completed ? 'var(--text-muted)' : 'var(--text-main)',
                      transition: 'all 0.2s ease',
                      textAlign: 'right',
                      wordBreak: 'break-word'
                    }}>
                      {item.text}
                    </span>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStartEdit(item); }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="ערוך"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                        style={{ background: 'transparent', border: 'none', color: 'rgba(239, 68, 68, 0.6)', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="מחק"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Reset button */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
        <button 
          onClick={handleReset} 
          className="btn-secondary" 
          style={{ fontSize: '13px', padding: '10px 16px', gap: '6px', color: 'var(--text-muted)', border: '1px dashed rgba(11, 11, 48, 0.15)' }}
        >
          <RotateCcw size={14} />
          <span>איפוס לרשימת ברירת המחדל</span>
        </button>
      </div>

    </div>
  );
}
