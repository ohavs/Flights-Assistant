import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import {
  Plus, Trash2, Pencil, Phone, MapPin, Link2, FileText, Hash,
  ChevronDown, ExternalLink, RotateCcw, AlertCircle, Globe, X
} from 'lucide-react';
import { CustomDropdown } from './CustomDatePicker';
import { useTrip } from '../TripContext';
import { useConfirm } from '../ConfirmContext';

// Default items seeded for every new trip. Israeli emergency numbers
// + the European universal 112, plus a couple of placeholders the user
// is likely to fill in.
export const defaultInfoItems = [
  { id: 'info-il-police',    title: 'משטרת ישראל',       value: '100', type: 'phone',   category: 'מספרי חירום' },
  { id: 'info-il-mda',       title: 'מד"א — אמבולנס',    value: '101', type: 'phone',   category: 'מספרי חירום' },
  { id: 'info-il-fire',      title: 'כיבוי אש',            value: '102', type: 'phone',   category: 'מספרי חירום' },
  { id: 'info-il-civil',     title: 'מל"ל (חירום אזרחי)', value: '104', type: 'phone',   category: 'מספרי חירום' },
  { id: 'info-eu-112',       title: 'חירום באירופה (כללי)', value: '112', type: 'phone', category: 'מספרי חירום' },
  { id: 'info-il-mfa',       title: 'משרד החוץ — מוקד לאזרחים בחו"ל', value: '+972-3-9744444', type: 'phone', category: 'מספרי חירום' },
  { id: 'info-embassy',      title: 'שגרירות ישראל ביעד',   value: '',    type: 'phone',   category: 'מספרי חירום' },
  { id: 'info-insurance',    title: 'מוקד ביטוח נסיעות',   value: '',    type: 'phone',   category: 'מספרי חירום' },
  { id: 'info-credit-block', title: 'חסימת אשראי (חברת האשראי)', value: '', type: 'phone', category: 'מספרי חירום' },
];

const DEFAULT_CATEGORIES = [
  'מספרי חירום',
  'אנשי קשר',
  'כתובות חשובות',
  'אתרים שימושיים',
  'מותאם אישית',
];

const TYPES = [
  { value: 'phone',   label: 'טלפון',  icon: Phone },
  { value: 'address', label: 'כתובת',  icon: MapPin },
  { value: 'url',     label: 'קישור',  icon: Link2 },
  { value: 'number',  label: 'מספר',   icon: Hash },
  { value: 'text',    label: 'טקסט',   icon: FileText },
];

function iconFor(type) {
  const t = TYPES.find(x => x.value === type);
  return (t || TYPES[3]).icon;
}

function hrefFor(item) {
  if (!item.value) return null;
  switch (item.type) {
    case 'phone':   return `tel:${String(item.value).replace(/[^0-9+]/g, '')}`;
    case 'address': return `https://maps.google.com/?q=${encodeURIComponent(item.value)}`;
    case 'url': {
      const v = String(item.value).trim();
      return /^https?:\/\//i.test(v) ? v : `https://${v}`;
    }
    default: return null;
  }
}

export default function InfoTab({ tripId }) {
  const { canEdit } = useTrip();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsedCategories, setCollapsedCategories] = useState({});

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [fTitle, setFTitle] = useState('');
  const [fValue, setFValue] = useState('');
  const [fType, setFType] = useState('phone');
  const [fCategory, setFCategory] = useState('מספרי חירום');
  const [fExtraFields, setFExtraFields] = useState([]);

  useEffect(() => {
    if (!tripId) return;
    const unsub = onSnapshot(collection(db, 'trips', tripId, 'info'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [tripId]);

  // Categories shown in the form dropdown = defaults + any user-added
  const categories = Array.from(new Set([
    ...DEFAULT_CATEGORIES,
    ...items.map(i => i.category).filter(Boolean),
  ]));

  const toggleCategory = (cat) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const openAdd = () => {
    setEditingId(null);
    setFTitle('');
    setFValue('');
    setFType('phone');
    setFCategory('מספרי חירום');
    setFExtraFields([]);
    setShowForm(true);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setFTitle(item.title || '');
    setFValue(item.value || '');
    setFType(item.type || 'phone');
    setFCategory(item.category || 'מותאם אישית');
    setFExtraFields(item.extraFields || []);
    setShowForm(true);
  };

  const formDirty = () => fTitle.trim() || fValue.trim() || fExtraFields.some(f => f.label.trim() || f.value.trim());
  const attemptCloseForm = async () => {
    if (formDirty()) {
      const ok = await confirm({
        title: 'יש שינויים שלא נשמרו',
        message: 'הזנת פרטים שלא נשמרו. האם לצאת בלי לשמור?',
        confirmText: 'צא בלי לשמור', cancelText: 'המשך עריכה', danger: true,
      });
      if (!ok) return;
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tripId || !fTitle.trim()) return;
    const payload = {
      title: fTitle.trim(),
      value: fValue.trim(),
      type: fType,
      category: fCategory,
      extraFields: fExtraFields
        .filter(f => f.label.trim() || f.value.trim())
        .map(f => ({ id: f.id, label: f.label.trim(), type: f.type, value: f.value.trim() })),
    };
    if (editingId) {
      await updateDoc(doc(db, 'trips', tripId, 'info', editingId), payload);
    } else {
      const id = 'info-' + Date.now();
      await setDoc(doc(db, 'trips', tripId, 'info', id), payload);
    }
    setShowForm(false);
    setEditingId(null);
    setFTitle(''); setFValue('');
  };

  const handleDelete = async (item) => {
    if (!tripId) return;
    const ok = await confirm({
      title: 'מחיקת פריט',
      message: item.title ? <>האם למחוק את <strong>{item.title}</strong>?</> : 'האם למחוק את הפריט?',
      confirmText: 'מחק', cancelText: 'בטל', danger: true,
    });
    if (!ok) return;
    await deleteDoc(doc(db, 'trips', tripId, 'info', item.id));
  };

  const handleSeedDefaults = async () => {
    if (!tripId) return;
    const ok = await confirm({
      title: 'טען מספרי חירום ברירת מחדל',
      message: 'יתווספו פריטי ברירת מחדל (מספרי חירום, מוקדים) ללא מחיקת פריטים קיימים. ניתן יהיה לערוך כל פריט אחרי כן.',
      confirmText: 'טען', cancelText: 'בטל',
    });
    if (!ok) return;
    const batch = writeBatch(db);
    const existing = new Set(items.map(i => i.id));
    for (const def of defaultInfoItems) {
      if (existing.has(def.id)) continue;
      batch.set(doc(db, 'trips', tripId, 'info', def.id), {
        title: def.title, value: def.value, type: def.type, category: def.category,
      });
    }
    await batch.commit();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px 0' }}>
        <div className="pulsing-dot" style={{ width: 12, height: 12 }} />
        <span style={{ marginRight: 10, color: 'var(--text-muted)', fontSize: 15 }}>טוען מידע חשוב…</span>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Intro / explainer card */}
      <div className="glass-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: 'rgba(220, 38, 38, 0.1)', color: 'rgb(220, 38, 38)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <AlertCircle size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--primary)', margin: 0 }}>מידע חשוב לטיול</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4, lineHeight: 1.55 }}>
            מספרי חירום, אנשי קשר, כתובות וקישורים שתרצה לזכור. הכל לחיץ —
            טלפונים מתקשרים ישר, כתובות נפתחות במפה, קישורים בדפדפן.
          </p>
        </div>
      </div>

      {/* Add button */}
      {canEdit && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={openAdd} className="btn-primary" style={{ flex: 1 }}>
            <Plus size={16} />
            <span>{editingId ? 'ערוך פריט' : 'הוסף פריט חדש'}</span>
          </button>
          {items.length === 0 && (
            <button onClick={handleSeedDefaults} className="btn-secondary" style={{ minHeight: 48 }}>
              <RotateCcw size={14} />
              <span>טען מספרי חירום</span>
            </button>
          )}
        </div>
      )}

      {/* Add/edit form (modal-style inline) */}
      {showForm && canEdit && (
        <div className="modal-overlay" onClick={attemptCloseForm}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h2>{editingId ? 'עריכת פריט' : 'הוספת פריט חדש'}</h2>
              <button className="btn-close" onClick={attemptCloseForm}>✕</button>
            </div>

            <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 4 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>כותרת</label>
                <input
                  type="text" className="form-control" required
                  value={fTitle} onChange={e => setFTitle(e.target.value)}
                  placeholder="למשל: שגרירות ישראל בפראג"
                />
              </div>

              <CustomDropdown
                label="סוג"
                value={fType}
                onChange={setFType}
                options={TYPES.map(t => ({ value: t.value, label: t.label, icon: <t.icon size={14} /> }))}
              />

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>
                  {fType === 'phone' ? 'מספר טלפון' :
                   fType === 'address' ? 'כתובת' :
                   fType === 'url' ? 'כתובת אתר (URL)' :
                   'תוכן הפריט'}
                </label>
                <input
                  type="text" className="form-control"
                  value={fValue} onChange={e => setFValue(e.target.value)}
                  placeholder={
                    fType === 'phone' ? '+420 123 456 789' :
                    fType === 'address' ? 'Politických vězňů 12, Prague' :
                    fType === 'url' ? 'https://...' : ''
                  }
                  dir={fType === 'url' || fType === 'phone' ? 'ltr' : 'rtl'}
                />
              </div>

              <CustomDropdown
                label="קטגוריה"
                value={fCategory}
                onChange={setFCategory}
                options={categories}
                addable
                addLabel="הוסף קטגוריה חדשה"
              />

              {/* Extra fields */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>שדות נוספים (אופציונלי)</label>
                {fExtraFields.map((field, idx) => (
                  <div key={field.id} style={{ background: 'rgba(11,11,48,0.03)', borderRadius: 12, padding: 10, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text" className="form-control"
                        placeholder="שם השדה (למשל: וואטסאפ, כתובת סניף...)"
                        value={field.label}
                        onChange={e => setFExtraFields(prev => prev.map((f, i) => i === idx ? { ...f, label: e.target.value } : f))}
                        style={{ flex: 1, minHeight: 36, fontSize: 13 }}
                      />
                      <button type="button"
                        onClick={() => setFExtraFields(prev => prev.filter((_, i) => i !== idx))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.7)', padding: 6, display: 'flex', flexShrink: 0 }}>
                        <X size={15} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {TYPES.map(t => (
                        <button key={t.value} type="button"
                          onClick={() => setFExtraFields(prev => prev.map((f, i) => i === idx ? { ...f, type: t.value } : f))}
                          style={{
                            padding: '4px 10px', borderRadius: 16, border: 'none',
                            background: field.type === t.value ? 'var(--accent)' : 'rgba(11,11,48,0.06)',
                            color: field.type === t.value ? '#fff' : 'var(--primary)',
                            fontFamily: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      inputMode={field.type === 'number' ? 'numeric' : field.type === 'phone' ? 'tel' : undefined}
                      className="form-control"
                      placeholder={
                        field.type === 'phone' ? 'מספר טלפון' :
                        field.type === 'address' ? 'כתובת' :
                        field.type === 'url' ? 'https://...' :
                        field.type === 'number' ? '0' : 'ערך'
                      }
                      value={field.value}
                      onChange={e => setFExtraFields(prev => prev.map((f, i) => i === idx ? { ...f, value: e.target.value } : f))}
                      style={{ minHeight: 36, fontSize: 13 }}
                      dir={field.type === 'url' || field.type === 'phone' ? 'ltr' : 'rtl'}
                    />
                  </div>
                ))}
                <button type="button"
                  onClick={() => setFExtraFields(prev => [...prev, { id: 'ef-' + Date.now(), label: '', type: 'text', value: '' }])}
                  style={{
                    width: '100%', border: '1.5px dashed rgba(79,70,229,0.3)', background: 'transparent',
                    color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '8px 0',
                    borderRadius: 12, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                  }}>
                  <Plus size={13} /> הוסף שדה נוסף
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>שמור</button>
                <button type="button" className="btn-secondary" onClick={attemptCloseForm}>ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="glass-card" style={{ padding: 32, textAlign: 'center' }}>
          <Globe size={32} style={{ margin: '0 auto 12px', color: 'var(--text-muted)', opacity: 0.5 }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)', margin: 0 }}>
            עוד אין מידע שמור.
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
            לחץ "טען מספרי חירום" לקבלת בסיס התחלתי, או "הוסף פריט חדש" להוספה ידנית.
          </p>
        </div>
      )}

      {/* Items grouped by category */}
      {categories.map(category => {
        const list = items.filter(i => i.category === category);
        if (list.length === 0) return null;
        const isCollapsed = !!collapsedCategories[category];

        return (
          <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button" onClick={() => toggleCategory(category)}
              style={{
                background: 'transparent', border: 'none', padding: '4px 4px',
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                width: '100%', fontFamily: 'var(--font-hebrew)'
              }}
            >
              <ChevronDown
                size={16}
                style={{
                  color: 'var(--text-muted)',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease', flexShrink: 0
                }}
              />
              <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary-color)', textAlign: 'right', flex: 1, margin: 0 }}>
                {category}
              </h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
                {list.length}
              </span>
            </button>

            {!isCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {list.map(item => {
                  const Icon = iconFor(item.type);
                  const href = hrefFor(item);
                  const hasValue = !!item.value;
                  const valueClickable = !!href;

                  return (
                    <div
                      key={item.id}
                      className="glass-card"
                      style={{
                        padding: '12px 14px',
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto',
                        gap: 12,
                        alignItems: 'center',
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: item.type === 'phone' && item.category === 'מספרי חירום'
                          ? 'rgba(220, 38, 38, 0.1)' : 'rgba(79, 70, 229, 0.1)',
                        color: item.type === 'phone' && item.category === 'מספרי חירום'
                          ? 'rgb(220, 38, 38)' : 'var(--accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon size={18} />
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)', textAlign: 'right' }}>
                          {item.title}
                        </div>
                        {hasValue ? (
                          valueClickable ? (
                            <a
                              href={href} target={item.type === 'phone' ? undefined : '_blank'} rel="noreferrer"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 14, fontWeight: 700, color: 'var(--accent)',
                                textDecoration: 'none', marginTop: 2,
                                direction: item.type === 'phone' || item.type === 'url' ? 'ltr' : 'rtl',
                              }}
                            >
                              <span style={{ overflowWrap: 'anywhere' }}>{item.value}</span>
                              {item.type !== 'phone' && <ExternalLink size={11} style={{ opacity: 0.7 }} />}
                            </a>
                          ) : (
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2, textAlign: 'right' }}>
                              {item.value}
                            </div>
                          )
                        ) : (
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgb(180, 180, 195)', marginTop: 2, textAlign: 'right', fontStyle: 'italic' }}>
                            לא הוגדר — לחץ עיפרון להוסיף
                          </div>
                        )}
                        {/* Extra fields */}
                        {item.extraFields && item.extraFields.length > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {item.extraFields.map(field => {
                              if (!field.label && !field.value) return null;
                              const FieldIcon = iconFor(field.type);
                              const fieldHref = hrefFor(field);
                              return (
                                <div key={field.id} style={{ display: 'flex', alignItems: 'baseline', gap: 5, textAlign: 'right' }}>
                                  {field.label && (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                      {field.label}:
                                    </span>
                                  )}
                                  {field.value ? (
                                    fieldHref ? (
                                      <a href={fieldHref} target={field.type === 'phone' ? undefined : '_blank'} rel="noreferrer"
                                        style={{
                                          fontSize: 13, fontWeight: 700, color: 'var(--accent)',
                                          textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3,
                                          direction: field.type === 'phone' || field.type === 'url' ? 'ltr' : 'rtl',
                                        }}>
                                        <FieldIcon size={11} />
                                        <span style={{ overflowWrap: 'anywhere' }}>{field.value}</span>
                                        {field.type !== 'phone' && <ExternalLink size={10} style={{ opacity: 0.6 }} />}
                                      </a>
                                    ) : (
                                      <span style={{ fontSize: 13, color: '#334155', fontWeight: 600, overflowWrap: 'anywhere' }}>{field.value}</span>
                                    )
                                  ) : (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>לא הוגדר</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {canEdit && (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button
                            type="button" onClick={() => startEdit(item)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6 }}
                            title="ערוך"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button" onClick={() => handleDelete(item)}
                            style={{ background: 'transparent', border: 'none', color: 'rgba(239,68,68,0.6)', cursor: 'pointer', padding: 6 }}
                            title="מחק"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
