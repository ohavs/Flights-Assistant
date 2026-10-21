import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { listen } from '../lib/listen';
import { collection, doc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { changedFields } from '../lib/changes';
import {
  Plus, Trash2, Pencil, Phone, MapPin, Link2, FileText, Hash,
  ExternalLink, RotateCcw, Globe, X, GripVertical
} from 'lucide-react';
import { CustomDropdown } from './CustomDatePicker';
import Sheet from '../ui/Sheet';
import { useTrip } from '../TripContext';
import { useConfirm } from '../ConfirmContext';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Skeleton from './Skeleton';
import Fab from './Fab';
import { defaultInfoItems } from '../data/seedData';
import ListCard from '../ui/ListCard';
import SheetDelete from '../ui/SheetDelete';
import SectionHeader from '../ui/SectionHeader';
import { CategoryDisc } from '../ui/kit';
import EmptyState from './EmptyState';


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

/* `embedded`: rendered inside the "מידע חשוב" sheet of the flight tab
   rather than as a tab of its own — the add button sits inline instead of
   being the app-wide floating one, which would paint over the sheet. */
export default function InfoTab({ tripId, embedded = false }) {
  // "הוספה" adds, and changes only what they added (src/lib/roles.js).
  const { canEdit, canAdd, mayChange, currentUid } = useTrip();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openCategories, setOpenCategories] = useState({}); // {} = all closed by default
  const [categoryOrder, setCategoryOrder] = useState([]);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [fTitle, setFTitle] = useState('');
  const [fValue, setFValue] = useState('');
  const [fType, setFType] = useState('phone');
  const [fCategory, setFCategory] = useState('מספרי חירום');
  const [fExtraFields, setFExtraFields] = useState([]);
  // What the form held when it opened: closing it unchanged is free.
  const [formBaseline, setFormBaseline] = useState(null);
  const [openedWith, setOpenedWith] = useState(null);   // the item as the form opened it
  const formKey = (title, value, type, category, extra) => JSON.stringify([title, value, type, category, extra]);

  useEffect(() => {
    if (!tripId) return;
    const unsub = listen(collection(db, 'trips', tripId, 'info'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));   // refused for good: the empty list, not a skeleton forever
    return unsub;
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;
    return listen(doc(db, 'trips', tripId, 'settings', 'infoSync'), snap => {
      setCategoryOrder(snap.exists() ? (snap.data()?.categoryOrder || []) : []);
    });
  }, [tripId]);

  // Categories sorted by saved order
  const categories = useMemo(() => {
    const all = Array.from(new Set([
      ...DEFAULT_CATEGORIES,
      ...items.map(i => i.category).filter(Boolean),
    ]));
    if (!categoryOrder.length) return all;
    const ordered = categoryOrder.filter(c => all.includes(c));
    const rest = all.filter(c => !categoryOrder.includes(c));
    return [...ordered, ...rest];
  }, [items, categoryOrder]);

  const toggleCategory = (cat) => {
    setOpenCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  // DnD
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
    setDoc(doc(db, 'trips', tripId, 'settings', 'infoSync'), { categoryOrder: newOrder }, { merge: true })
      .catch(err => console.error('Info order save error:', err));
  };

  const openAdd = (preCategory = 'מספרי חירום') => {
    setEditingId(null);
    setFTitle('');
    setFValue('');
    setFType('phone');
    setFCategory(preCategory);
    setFExtraFields([]);
    setFormBaseline(formKey('', '', 'phone', preCategory, []));
    setShowForm(true);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setFTitle(item.title || '');
    setFValue(item.value || '');
    setFType(item.type || 'phone');
    setFCategory(item.category || 'מותאם אישית');
    setFExtraFields(item.extraFields || []);
    setFormBaseline(formKey(item.title || '', item.value || '', item.type || 'phone', item.category || 'מותאם אישית', item.extraFields || []));
    setOpenedWith({ title: item.title || '', value: item.value || '', type: item.type || 'phone', category: item.category || 'מותאם אישית', extraFields: item.extraFields || [] });
    setShowForm(true);
  };

  const formDirty = () => formKey(fTitle, fValue, fType, fCategory, fExtraFields) !== formBaseline;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!tripId || !fTitle.trim()) return;
    const payloadOf = (f) => ({
      title: f.title.trim(),
      value: f.value.trim(),
      type: f.type,
      category: f.category,
      extraFields: f.extraFields
        .filter(x => x.label.trim() || x.value.trim())
        .map(x => ({ id: x.id, label: x.label.trim(), type: x.type, value: x.value.trim() })),
    });
    const payload = payloadOf({ title: fTitle, value: fValue, type: fType, category: fCategory, extraFields: fExtraFields });
    // Close form immediately; write is fire-and-forget (offline cache queues locally)
    const id = editingId || ('info-' + Date.now());
    setShowForm(false);
    setEditingId(null);
    setFTitle(''); setFValue('');
    if (editingId) {
      // Only what the edit changed (src/lib/changes.js).
      const updates = changedFields(openedWith ? payloadOf(openedWith) : {}, payload);
      if (Object.keys(updates).length) {
        updateDoc(doc(db, 'trips', tripId, 'info', id), updates).catch(err => console.error('Info save error:', err));
      }
    } else {
      setDoc(doc(db, 'trips', tripId, 'info', id), { ...payload, createdBy: currentUid || null }).catch(err => console.error('Info save error:', err));
    }
  };

  const handleDelete = async (item) => {
    if (!tripId) return;
    const ok = await confirm({
      title: 'מחיקת פריט',
      message: item.title ? <>האם למחוק את <strong>{item.title}</strong>?</> : 'האם למחוק את הפריט?',
      confirmText: 'מחק', cancelText: 'בטל', danger: true,
    });
    if (!ok) return false;
    // Not awaited, so the sheet closes offline too (see ExpensesTab).
    deleteDoc(doc(db, 'trips', tripId, 'info', item.id)).catch(err => console.error('Delete info failed:', err));
    return true;
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
    batch.commit().catch(err => console.error('Info defaults save error:', err));
  };

  if (loading) {
    return <Skeleton rows={4} header={false} label="טוען מידע חשוב" />;
  }

  return (
    <>
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Add/edit form (modal-style inline) */}
      {showForm && canAdd && (
        <Sheet
          title={editingId ? 'עריכת פריט' : 'הוספת פריט חדש'}
          onClose={() => { setShowForm(false); setEditingId(null); }}
          dirty={formDirty()}
          style={{ maxHeight: '92vh' }}
        >
          {({ cancel, close }) => (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  <div key={field.id} style={{ background: 'var(--ink-3)', borderRadius: 12, padding: 10, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text" className="form-control"
                        placeholder="שם השדה (למשל: וואטסאפ, כתובת סניף...)"
                        value={field.label}
                        onChange={e => setFExtraFields(prev => prev.map((f, i) => i === idx ? { ...f, label: e.target.value } : f))}
                        style={{ flex: 1, minHeight: 36, fontSize: 13 }}
                      />
                      <button type="button" className="btn-x danger" aria-label="הסר שדה" title="הסר שדה" onClick={() => setFExtraFields(prev => prev.filter((_, i) => i !== idx))}>
                        <X size={16} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {TYPES.map(t => (
                        <button key={t.value} type="button"
                          onClick={() => setFExtraFields(prev => prev.map((f, i) => i === idx ? { ...f, type: t.value } : f))}
                          className="chip" aria-pressed={field.type === t.value}
                          style={{ minHeight: 32, padding: '0 12px', fontSize: 13 }}>
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
                <button type="button" className="chip add" style={{ alignSelf: 'flex-start' }}
                  onClick={() => setFExtraFields(prev => [...prev, { id: 'ef-' + Date.now(), label: '', type: 'text', value: '' }])}>
                  <Plus size={14} /> שדה נוסף
                </button>
              </div>

              <div className="sheet-footer">
                <button type="submit" className="btn-primary">שמור</button>
                <button type="button" className="btn-secondary" onClick={cancel}>ביטול</button>
                {editingId && <SheetDelete close={close} onDelete={() => handleDelete(items.find(i => i.id === editingId) || { id: editingId })} />}
              </div>
            </form>
          )}
        </Sheet>
      )}

      {embedded && canAdd && (
        <button type="button" className="btn-secondary" onClick={() => openAdd()}
          style={{ width: '100%', gap: 6, border: '1.5px dashed var(--p-30)', color: 'var(--accent)', background: 'var(--p-4)' }}>
          <Plus size={15} />
          <span>פריט חדש</span>
        </button>
      )}

      {items.length === 0 && (
        <EmptyState
          icon={Globe}
          title="עוד אין מידע שמור"
          hint="מספרי חירום, כתובת הלינה, קודים וקישורים — הדברים שצריך למצוא מהר ובלי אינטרנט."
          action={
            canEdit ? (
              <button onClick={handleSeedDefaults} className="btn-secondary">
                <RotateCcw size={14} />
                <span>טען מספרי חירום</span>
              </button>
            ) : null
          }
        />
      )}

      {/* Items grouped by category — sortable */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={categories} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {categories.map(category => {
            const list = items.filter(i => i.category === category);
            if (list.length === 0) return null;
            const isOpen = !!openCategories[category];
            return (
              <InfoSortableCategory
                key={category}
                category={category}
                list={list}
                isOpen={isOpen}
                canEdit={canEdit}
                canAdd={canAdd}
                mayChange={mayChange}
                toggleCategory={toggleCategory}
                openAdd={openAdd}
                startEdit={startEdit}
                handleDelete={handleDelete}
                iconFor={iconFor}
                hrefFor={hrefFor}
              />
            );
          })}
          </div>
        </SortableContext>
      </DndContext>

    </div>
    {/* The full-width docked bar became the app-wide floating button; the
        "load defaults" shortcut moved into the empty state, which is the
        only time it was offered anyway. */}
    {canAdd && !embedded && <Fab label="פריט חדש" onClick={() => openAdd()} />}
    </>
  );
}

/* ── InfoSortableCategory ────────────────────────────────────────────────── */
function InfoSortableCategory({ category, list, isOpen, canEdit, canAdd, mayChange, toggleCategory, openAdd, startEdit, handleDelete, iconFor, hrefFor }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={{ ...style, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Category header */}
      <SectionHeader
        title={category}
        count={list.length}
        collapsed={!isOpen}
        onToggle={() => toggleCategory(category)}
        lead={canEdit && (
          <button type="button" {...attributes} {...listeners} aria-label="גרור לשינוי סדר" className="section-header-grip">
            <GripVertical size={15} />
          </button>
        )}
      />

      {/* Items */}
      {isOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map(item => {
            const Icon = iconFor(item.type);
            const href = hrefFor(item);
            const hasValue = !!item.value;
            const valueClickable = !!href;
            const emergency = item.type === 'phone' && item.category === 'מספרי חירום';
            return (
              <ListCard
                key={item.id}
                icon={<CategoryDisc color={emergency ? '#E5484D' : '#2DBE6C'} size={42}><Icon size={19} /></CategoryDisc>}
                title={item.title}
                onOpen={mayChange(item) ? () => startEdit(item) : undefined}
                actions={mayChange(item) ? [
                  { key: 'edit', label: 'עריכה', Icon: Pencil, run: () => startEdit(item) },
                  { key: 'del', label: 'מחיקה', Icon: Trash2, run: () => handleDelete(item), danger: true, swipe: true },
                ] : []}
              >
                  {hasValue ? (
                    valueClickable ? (
                      <a href={href} target={item.type === 'phone' ? undefined : '_blank'} rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', alignSelf: 'flex-start', direction: item.type === 'phone' || item.type === 'url' ? 'ltr' : 'rtl' }}>
                        <span style={{ overflowWrap: 'anywhere' }}>{item.value}</span>
                        {item.type !== 'phone' && <ExternalLink size={11} style={{ opacity: 0.7 }} />}
                      </a>
                    ) : (
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{item.value}</div>
                    )
                  ) : (
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      לא הוגדר{mayChange(item) ? ' — הקישו על הכרטיס כדי להוסיף' : ''}
                    </div>
                  )}
                  {item.extraFields && item.extraFields.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {item.extraFields.map(field => {
                        if (!field.label && !field.value) return null;
                        const FieldIcon = iconFor(field.type);
                        const fieldHref = hrefFor(field);
                        return (
                          <div key={field.id} style={{ display: 'flex', alignItems: 'baseline', gap: 5, textAlign: 'right' }}>
                            {field.label && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{field.label}:</span>}
                            {field.value ? (
                              fieldHref ? (
                                <a href={fieldHref} target={field.type === 'phone' ? undefined : '_blank'} rel="noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3, direction: field.type === 'phone' || field.type === 'url' ? 'ltr' : 'rtl' }}>
                                  <FieldIcon size={11} />
                                  <span style={{ overflowWrap: 'anywhere' }}>{field.value}</span>
                                  {field.type !== 'phone' && <ExternalLink size={10} style={{ opacity: 0.6 }} />}
                                </a>
                              ) : (
                                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, overflowWrap: 'anywhere' }}>{field.value}</span>
                              )
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>לא הוגדר</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
              </ListCard>
            );
          })}
          {canAdd && (
            <button type="button" className="chip add" style={{ alignSelf: 'flex-start' }}
              onClick={() => openAdd(category)} aria-label={`הוסף פריט ל${category}`}>
              <Plus size={14} /> פריט
            </button>
          )}
        </div>
      )}
    </div>
  );
}
