import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { listen } from '../lib/listen';
import { collection, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { changedFields } from '../lib/changes';
import { withScheme } from '../lib/links';
import {
  UtensilsCrossed, Compass, Landmark, Ticket, Train, BedDouble, Tag,
  Pencil, Trash2, Phone, MapPin, ExternalLink, Copy, Check, Users, Clock,
  CalendarCheck, UserRound,
} from 'lucide-react';
import { CustomDropdown, CustomDatePicker, CustomTimePicker } from './CustomDatePicker';
import Sheet from '../ui/Sheet';
import { useTrip } from '../TripContext';
import { useConfirm } from '../ConfirmContext';
import Skeleton from './Skeleton';
import Fab from './Fab';
import { CardShell } from '../ui/ListCard';
import ActionsMenu from '../ui/ActionsMenu';
import SheetDelete from '../ui/SheetDelete';
import SectionHeader from '../ui/SectionHeader';
import { Segmented } from '../ui/Sheet';
import { Pill } from '../ui/kit';
import EmptyState from './EmptyState';

/* ══════════════════════════════════════════════════════════
   הזמנות — everything already booked for the trip: restaurants,
   tours, tickets, transfers. One place to find the confirmation
   code, the time, and the phone number when standing at the door.

   Stored in trips/{tripId}/bookings. A booking can point at a place
   from the planner (placeId); the planner then shows that place as
   booked instead of "to book".

   Each booking reads as a ticket, not a row: a band in its type's
   colour with the status, the date as a calendar leaf beside the title,
   and below a perforated line the stub, the confirmation code (a tap
   copies it) and the ways to call, navigate and open the link.
   ══════════════════════════════════════════════════════════ */

const BOOKING_TYPES = [
  { value: 'restaurant', label: 'מסעדה',    Icon: UtensilsCrossed, color: '#ea580c' },
  { value: 'tour',       label: 'סיור',     Icon: Compass,         color: '#4f46e5' },
  { value: 'attraction', label: 'אטרקציה',  Icon: Landmark,        color: '#0891b2' },
  { value: 'tickets',    label: 'כרטיסים / מופע', Icon: Ticket,    color: '#db2777' },
  { value: 'transport',  label: 'תחבורה',   Icon: Train,           color: '#059669' },
  { value: 'stay',       label: 'לינה',     Icon: BedDouble,       color: '#7c3aed' },
  { value: 'other',      label: 'אחר',      Icon: Tag,             color: '#64748b' },
];
const typeOf = (v) => BOOKING_TYPES.find(t => t.value === v) || BOOKING_TYPES[BOOKING_TYPES.length - 1];

const STATUSES = [
  { value: 'confirmed', label: 'מאושרת',        tone: 'mint', Icon: Check },
  { value: 'pending',   label: 'ממתינה לאישור', tone: 'butter' },
  { value: 'cancelled', label: 'בוטלה',         tone: 'muted' },
];
const statusOf = (v) => STATUSES.find(st => st.value === v) || STATUSES[0];

const PAYMENTS = [
  { value: null,      label: 'לא צוין' },
  { value: 'paid',    label: 'שולם' },
  { value: 'deposit', label: 'מקדמה' },
  { value: 'onsite',  label: 'תשלום במקום' },
];
const PAYMENT_LABEL = { paid: 'שולם', deposit: 'שולמה מקדמה', onsite: 'תשלום במקום' };

// Planner category → booking type, for pre-filling from a linked place.
const TYPE_FROM_CATEGORY = {
  'מסעדות ומקומות אכילה': 'restaurant',
  'אטרקציות ודברים לעשות': 'attraction',
  'מקומות לבקר': 'attraction',
  'תחבורה ציבורית': 'transport',
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
// The ticket's calendar leaf: "יום ה׳", 14, "נוב׳".
function dateLeaf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return { dow: `יום ${DOW[new Date(y, m - 1, d).getDay()]}`, day: d, month: MONTHS[m - 1] };
}

const telHref = (p) => `tel:${String(p).replace(/[^0-9+]/g, '')}`;
const mapsHref = (a) => (/^https?:\/\//i.test(a) ? a : `https://maps.google.com/?q=${encodeURIComponent(a)}`);

const EMPTY_FORM = {
  title: '', type: 'restaurant', placeId: '', date: '', time: '', people: '',
  confirmation: '', bookedUnder: '', address: '', phone: '', url: '',
  price: '', payment: null, status: 'confirmed', notes: '',
};

export default function BookingsTab({ tripId }) {
  const { canEdit, currentUid } = useTrip();
  const confirm = useConfirm();
  const [bookings, setBookings] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState(EMPTY_FORM); // to tell unsaved edits apart
  const set = (key) => (value) => setForm(prev => ({ ...prev, [key]: value }));
  const setFromInput = (key) => (e) => set(key)(e.target.value);

  useEffect(() => {
    if (!tripId) return;
    return listen(collection(db, 'trips', tripId, 'bookings'), snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));   // refused for good: the empty list, not a skeleton forever
  }, [tripId]);

  // Planner places, for linking a booking to one.
  useEffect(() => {
    if (!tripId) return;
    return listen(collection(db, 'trips', tripId, 'planning'), snap => {
      setPlaces(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [tripId]);

  // Upcoming soonest-first; no date after them; past (and cancelled
  // past ones) folded away at the bottom, most recent first.
  const { upcoming, undated, past } = useMemo(() => {
    const today = todayISO();
    const key = (b) => `${b.date || ''}T${b.time || '99:99'}`;
    const withDate = bookings.filter(b => b.date);
    return {
      upcoming: withDate.filter(b => b.date >= today).sort((a, b) => key(a).localeCompare(key(b))),
      undated: bookings.filter(b => !b.date).sort((a, b) => (a.title || '').localeCompare(b.title || '', 'he')),
      past: withDate.filter(b => b.date < today).sort((a, b) => key(b).localeCompare(key(a))),
    };
  }, [bookings]);

  const bookedPlaceIds = useMemo(
    () => new Set(bookings.filter(b => b.placeId && b.status !== 'cancelled').map(b => b.placeId)),
    [bookings],
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setInitialForm(EMPTY_FORM);
    setShowForm(true);
  };

  const startEdit = (b) => {
    const next = {
      ...EMPTY_FORM,
      ...Object.fromEntries(Object.entries(b).filter(([k]) => k in EMPTY_FORM && b[k] != null)),
      people: b.people != null ? String(b.people) : '',
      placeId: b.placeId || '',
    };
    setEditingId(b.id);
    setForm(next);
    setInitialForm(next);
    setShowForm(true);
  };

  const formDirty = () => JSON.stringify(form) !== JSON.stringify(initialForm);

  // Linking a place fills in what the place already knows, without
  // overwriting anything typed by hand.
  const pickPlace = (placeId) => {
    const place = places.find(p => p.id === placeId);
    setForm(prev => ({
      ...prev,
      placeId,
      title: prev.title || place?.title || '',
      address: prev.address || place?.address || '',
      type: place && TYPE_FROM_CATEGORY[place.category] && prev.title === '' ? TYPE_FROM_CATEGORY[place.category] : prev.type,
    }));
  };

  const payloadOf = (f) => {
    const people = parseInt(f.people, 10);
    return {
      title: f.title.trim(),
      type: f.type,
      placeId: f.placeId || null,
      date: f.date || null,
      time: f.time || null,
      people: Number.isFinite(people) && people > 0 ? people : null,
      confirmation: f.confirmation.trim(),
      bookedUnder: f.bookedUnder.trim(),
      address: f.address.trim(),
      phone: f.phone.trim(),
      url: withScheme(f.url),
      price: f.price.trim(),
      payment: f.payment || null,
      status: f.status || 'confirmed',
      notes: f.notes.trim(),
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!tripId || !form.title.trim()) return;
    const payload = payloadOf(form);
    const id = editingId || ('booking-' + Date.now());
    const ref = doc(db, 'trips', tripId, 'bookings', id);
    // Fire-and-forget: the offline cache queues the write. An edit writes
    // only what it changed (src/lib/changes.js).
    const updates = editingId ? changedFields(payloadOf(initialForm), payload) : null;
    if (!editingId || Object.keys(updates).length) {
      (editingId
        ? updateDoc(ref, updates)
        : setDoc(ref, { ...payload, addedBy: currentUid || null, addedAt: new Date().toISOString() })
      ).catch(err => console.error('Booking save error:', err));
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = async (b) => {
    const ok = await confirm({
      title: 'מחיקת הזמנה',
      message: <>האם למחוק את <strong>{b.title}</strong>?</>,
      confirmText: 'מחק', cancelText: 'בטל', danger: true,
    });
    if (!ok) return false;
    // Not awaited, so the sheet closes offline too (see ExpensesTab).
    deleteDoc(doc(db, 'trips', tripId, 'bookings', b.id)).catch(err => console.error('Delete booking failed:', err));
    return true;
  };

  const copyCode = async (b) => {
    try {
      await navigator.clipboard.writeText(b.confirmation);
      setCopiedId(b.id);
      setTimeout(() => setCopiedId(prev => (prev === b.id ? null : prev)), 1500);
    } catch { /* clipboard unavailable — the code is on screen anyway */ }
  };

  if (loading) return <Skeleton rows={4} header={false} label="טוען הזמנות" />;

  const placeOptions = [
    { value: '', label: 'ללא קישור' },
    ...[...places]
      .sort((a, b) => {
        // Places still waiting to be booked first.
        const rank = (p) => (p.needsReservation && !bookedPlaceIds.has(p.id) ? 0 : 1);
        return rank(a) - rank(b) || (a.title || '').localeCompare(b.title || '', 'he');
      })
      .map(p => ({
        value: p.id,
        label: p.needsReservation && !bookedPlaceIds.has(p.id) && p.id !== form.placeId
          ? `${p.title} · להזמין`
          : p.title,
      })),
  ];

  const renderCard = (b) => {
    const t = typeOf(b.type);
    const cancelled = b.status === 'cancelled';
    const status = statusOf(b.status);
    const leaf = b.date ? dateLeaf(b.date) : null;
    const facts = [
      b.time && { key: 'time', Icon: Clock, text: b.time },
      b.people && { key: 'people', Icon: Users, text: `${b.people} אנשים` },
      b.bookedUnder && { key: 'name', Icon: UserRound, text: `על שם ${b.bookedUnder}` },
    ].filter(Boolean);
    const quick = [
      b.phone && { key: 'tel', href: telHref(b.phone), Icon: Phone, label: 'התקשר' },
      b.address && { key: 'map', href: mapsHref(b.address), Icon: MapPin, label: 'ניווט', external: true },
      b.url && { key: 'url', href: b.url, Icon: ExternalLink, label: 'קישור', external: true },
    ].filter(Boolean);
    const actions = canEdit ? [
      { key: 'edit', label: 'עריכה', Icon: Pencil, run: () => startEdit(b) },
      { key: 'del', label: 'מחיקה', Icon: Trash2, run: () => handleDelete(b), danger: true, swipe: true },
    ] : [];
    const stub = !!b.confirmation || quick.length > 0;

    return (
      <CardShell
        key={b.id}
        className={`booking-ticket${stub ? ' has-stub' : ''}`}
        style={{ '--t': cancelled ? 'var(--text-muted)' : t.color }}
        muted={cancelled}
        onOpen={canEdit ? () => startEdit(b) : undefined}
        actions={actions}
      >
        <div className="ticket-main">
          <div className="ticket-band">
            <span className="ticket-type"><t.Icon size={14} strokeWidth={2.4} />{t.label}</span>
            <Pill size="sm" tone={status.tone} icon={status.Icon && <status.Icon size={12} strokeWidth={3} />}>{status.label}</Pill>
            {actions.length > 0 && <ActionsMenu title={b.title} actions={actions} className="list-card-more" />}
          </div>
          <div className="ticket-body">
            <div className="ticket-leaf">
              {leaf ? (
                <>
                  <span className="ticket-leaf-dow">{leaf.dow}</span>
                  <span className="ticket-leaf-day">{leaf.day}</span>
                  <span className="ticket-leaf-month">{leaf.month}</span>
                </>
              ) : <t.Icon size={24} />}
            </div>
            <div className="ticket-info">
              <h3 className="list-card-title">{b.title}</h3>
              {facts.length > 0 && (
                <div className="ticket-facts">
                  {facts.map(f => <span key={f.key} className={`ticket-fact ${f.key}`}><f.Icon size={13} />{f.text}</span>)}
                </div>
              )}
              {(b.price || b.payment) && (
                <div className="ticket-pills">
                  {b.price && <Pill size="sm">{b.price}</Pill>}
                  {b.payment && <Pill size="sm" tone={b.payment === 'paid' ? 'mint' : 'muted'}>{PAYMENT_LABEL[b.payment]}</Pill>}
                </div>
              )}
            </div>
          </div>
          {b.notes && <p className="ticket-notes">{b.notes}</p>}
        </div>

        {stub && (
          <div className="ticket-stub">
            {b.confirmation && (
              <button type="button" className="ticket-code" onClick={(e) => { e.stopPropagation(); copyCode(b); }}
                aria-label={`העתק מספר הזמנה ${b.confirmation}`}>
                <span className="ticket-code-label">מספר אישור</span>
                <span className="ticket-code-value">
                  <span dir="ltr">{b.confirmation}</span>
                  {copiedId === b.id ? <Check size={14} /> : <Copy size={14} className="ticket-code-copy" />}
                </span>
              </button>
            )}
            {quick.length > 0 && (
              <div className="ticket-actions">
                {quick.map(q => (
                  <a key={q.key} href={q.href} className="ticket-action" aria-label={q.label} title={q.label}
                    target={q.external ? '_blank' : undefined} rel={q.external ? 'noreferrer' : undefined}
                    onClick={e => e.stopPropagation()}>
                    <q.Icon size={18} />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </CardShell>
    );
  };

  const section = (title, list) => list.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionHeader title={title} count={list.length} />
      {list.map(renderCard)}
    </div>
  );

  return (
    <>
      <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {bookings.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="עוד אין הזמנות"
            hint="מסעדות, סיורים, כרטיסים והסעות שכבר הוזמנו — עם מספר האישור, השעה והטלפון, במקום אחד."
          />
        ) : (
          <>
            {section('קרובות', upcoming)}
            {section('בלי תאריך', undated)}
            {past.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <SectionHeader title="עברו" count={past.length} collapsed={!showPast} onToggle={() => setShowPast(v => !v)} />
                {showPast && past.map(renderCard)}
              </div>
            )}
          </>
        )}
      </div>

      {canEdit && <Fab label="הזמנה חדשה" onClick={openAdd} />}

      {showForm && canEdit && (
        <Sheet
          title={editingId ? 'עריכת הזמנה' : 'הזמנה חדשה'}
          onClose={() => setShowForm(false)}
          dirty={formDirty()}
          style={{ maxHeight: '92vh' }}
        >
          {({ cancel, close }) => (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>סוג</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {BOOKING_TYPES.map(t => {
                    const active = form.type === t.value;
                    return (
                      <button key={t.value} type="button" onClick={() => set('type')(t.value)} aria-pressed={active}
                        className="chip"
                        // A type is chosen in its own colour, as a category is.
                        style={active ? { background: `${t.color}1f`, borderColor: 'transparent', color: t.color } : undefined}>
                        <t.Icon size={14} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>שם *</label>
                <input type="text" className="form-control" required value={form.title} onChange={setFromInput('title')}
                  placeholder="למשל: ארוחת ערב ב-Costes" />
              </div>

              {places.length > 0 && (
                <CustomDropdown
                  label="מקום מהתכנון (לא חובה)"
                  value={form.placeId}
                  onChange={pickPlace}
                  options={placeOptions}
                />
              )}

              <div className="row-2" style={{ gap: 10 }}>
                <CustomDatePicker label="תאריך" value={form.date} onChange={set('date')} />
                <CustomTimePicker label="שעה" value={form.time} onChange={set('time')} />
              </div>

              <div className="row-2" style={{ gap: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>מספר אנשים</label>
                  <input type="number" inputMode="numeric" min="1" className="form-control" value={form.people}
                    onChange={setFromInput('people')} placeholder="2" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>על שם</label>
                  <input type="text" className="form-control" value={form.bookedUnder} onChange={setFromInput('bookedUnder')}
                    placeholder="שם המזמין" />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>מספר הזמנה / קוד אישור</label>
                <input type="text" className="form-control" dir="ltr" value={form.confirmation} onChange={setFromInput('confirmation')}
                  placeholder="ABC123" />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>סטטוס</label>
                <Segmented
                  label="סטטוס"
                  value={form.status}
                  onChange={set('status')}
                  options={STATUSES.map(st => ({ key: st.value, label: st.label }))}
                />
              </div>

              <div className="row-2" style={{ gap: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>מחיר</label>
                  <input type="text" className="form-control" value={form.price} onChange={setFromInput('price')}
                    placeholder="למשל: 80 €" />
                </div>
                <CustomDropdown
                  label="תשלום"
                  value={form.payment}
                  onChange={set('payment')}
                  options={PAYMENTS}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>כתובת</label>
                <input type="text" className="form-control" value={form.address} onChange={setFromInput('address')}
                  placeholder="כתובת או קישור למפה" />
              </div>

              <div className="row-2" style={{ gap: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>טלפון</label>
                  <input type="tel" className="form-control" dir="ltr" value={form.phone} onChange={setFromInput('phone')}
                    placeholder="+36 1 234 5678" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>קישור להזמנה</label>
                  <input type="text" inputMode="url" className="form-control" dir="ltr" value={form.url} onChange={setFromInput('url')}
                    placeholder="https://..." />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>הערות</label>
                <textarea className="form-control" rows="3" value={form.notes} onChange={setFromInput('notes')}
                  placeholder="קוד לבוש, להגיע 15 דקות לפני, מה כלול..." style={{ resize: 'none', fontFamily: 'inherit' }} />
              </div>

              <div className="sheet-footer">
                <button type="submit" className="btn-primary">שמור</button>
                <button type="button" className="btn-secondary" onClick={cancel}>ביטול</button>
                {editingId && <SheetDelete close={close} onDelete={() => handleDelete(bookings.find(b => b.id === editingId) || { id: editingId })} />}
              </div>
            </form>
          )}
        </Sheet>
      )}
    </>
  );
}
