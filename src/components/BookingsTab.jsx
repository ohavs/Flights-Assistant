import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  UtensilsCrossed, Compass, Landmark, Ticket, Train, BedDouble, Tag,
  Pencil, Trash2, Phone, MapPin, ExternalLink, Copy, Check, Users, Clock,
  CalendarCheck, ChevronDown,
} from 'lucide-react';
import { CustomDropdown, CustomDatePicker, CustomTimePicker } from './CustomDatePicker';
import Sheet from '../ui/Sheet';
import { useTrip } from '../TripContext';
import { useConfirm } from '../ConfirmContext';
import Skeleton from './Skeleton';
import Fab from './Fab';
import ListCard from '../ui/ListCard';
import { Segmented } from '../ui/Sheet';
import { Pill, CategoryDisc } from '../ui/kit';
import EmptyState from './EmptyState';

/* ══════════════════════════════════════════════════════════
   הזמנות — everything already booked for the trip: restaurants,
   tours, tickets, transfers. One place to find the confirmation
   code, the time, and the phone number when standing at the door.

   Stored in trips/{tripId}/bookings. A booking can point at a place
   from the planner (placeId); the planner then shows that place as
   booked instead of "to book".
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
  { value: 'confirmed', label: 'מאושרת' },
  { value: 'pending',   label: 'ממתינה לאישור' },
  { value: 'cancelled', label: 'בוטלה' },
];

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
function formatWhen(date, time) {
  if (!date) return time || '';
  const [y, m, d] = date.split('-').map(Number);
  const dow = DOW[new Date(y, m - 1, d).getDay()];
  return `יום ${dow} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}${time ? ` · ${time}` : ''}`;
}

const normalizeUrl = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
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
    return onSnapshot(collection(db, 'trips', tripId, 'bookings'), snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [tripId]);

  // Planner places, for linking a booking to one.
  useEffect(() => {
    if (!tripId) return;
    return onSnapshot(collection(db, 'trips', tripId, 'planning'), snap => {
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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!tripId || !form.title.trim()) return;
    const people = parseInt(form.people, 10);
    const payload = {
      title: form.title.trim(),
      type: form.type,
      placeId: form.placeId || null,
      date: form.date || null,
      time: form.time || null,
      people: Number.isFinite(people) && people > 0 ? people : null,
      confirmation: form.confirmation.trim(),
      bookedUnder: form.bookedUnder.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      url: form.url.trim() ? normalizeUrl(form.url.trim()) : '',
      price: form.price.trim(),
      payment: form.payment || null,
      status: form.status || 'confirmed',
      notes: form.notes.trim(),
    };
    const id = editingId || ('booking-' + Date.now());
    const ref = doc(db, 'trips', tripId, 'bookings', id);
    // Fire-and-forget: the offline cache queues the write.
    (editingId
      ? updateDoc(ref, payload)
      : setDoc(ref, { ...payload, addedBy: currentUid || null, addedAt: new Date().toISOString() })
    ).catch(err => console.error('Booking save error:', err));
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = async (b) => {
    const ok = await confirm({
      title: 'מחיקת הזמנה',
      message: <>האם למחוק את <strong>{b.title}</strong>?</>,
      confirmText: 'מחק', cancelText: 'בטל', danger: true,
    });
    if (!ok) return;
    await deleteDoc(doc(db, 'trips', tripId, 'bookings', b.id));
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
    const meta = [
      formatWhen(b.date, b.time),
      b.people ? `${b.people} אנשים` : null,
      b.bookedUnder ? `על שם ${b.bookedUnder}` : null,
    ].filter(Boolean).join(' · ');
    const quick = [
      b.phone && { key: 'tel', href: telHref(b.phone), Icon: Phone, label: 'התקשר' },
      b.address && { key: 'map', href: mapsHref(b.address), Icon: MapPin, label: 'ניווט', external: true },
      b.url && { key: 'url', href: b.url, Icon: ExternalLink, label: 'קישור', external: true },
    ].filter(Boolean);

    return (
      <ListCard
        key={b.id}
        icon={<CategoryDisc color={t.color} size={42}><t.Icon size={19} /></CategoryDisc>}
        title={b.title}
        meta={meta}
        metaIcon={meta ? (b.date || b.time ? <Clock size={12} /> : <Users size={12} />) : null}
        tags={[
          b.status === 'pending' && <Pill key="pending" size="sm" tone="butter">ממתינה לאישור</Pill>,
          cancelled && <Pill key="cancelled" size="sm" tone="muted">בוטלה</Pill>,
        ]}
        muted={cancelled}
        onOpen={canEdit ? () => startEdit(b) : undefined}
        actions={canEdit ? [
          { key: 'edit', label: 'עריכה', Icon: Pencil, run: () => startEdit(b), swipe: true },
          { key: 'del', label: 'מחיקה', Icon: Trash2, run: () => handleDelete(b), danger: true, swipe: true },
        ] : []}
      >
        {(b.confirmation || b.price || b.payment) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {b.confirmation && (
              <button type="button" className="booking-code" onClick={(e) => { e.stopPropagation(); copyCode(b); }}
                aria-label="העתק מספר הזמנה">
                <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>אישור</span>
                <span dir="ltr" style={{ fontWeight: 900, letterSpacing: 0.3 }}>{b.confirmation}</span>
                {copiedId === b.id ? <Check size={13} /> : <Copy size={13} style={{ opacity: 0.6 }} />}
              </button>
            )}
            {b.price && <Pill size="sm">{b.price}</Pill>}
            {b.payment && (
              <Pill size="sm" tone={b.payment === 'paid' ? 'mint' : 'muted'}>{PAYMENT_LABEL[b.payment]}</Pill>
            )}
          </div>
        )}

        {b.notes && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{b.notes}</p>
        )}

        {quick.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {quick.map(q => (
              <a key={q.key} href={q.href} className="booking-action"
                target={q.external ? '_blank' : undefined} rel={q.external ? 'noreferrer' : undefined}
                onClick={e => e.stopPropagation()}>
                <q.Icon size={14} />
                <span>{q.label}</span>
              </a>
            ))}
          </div>
        )}
      </ListCard>
    );
  };

  const section = (title, list) => list.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="booking-section">{title}</span>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button type="button" className="booking-section booking-section-toggle" onClick={() => setShowPast(v => !v)}
                  aria-expanded={showPast}>
                  <ChevronDown size={14} style={{ transform: showPast ? 'none' : 'rotate(90deg)', transition: 'transform 0.2s ease' }} />
                  <span>עברו ({past.length})</span>
                </button>
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
          {({ cancel }) => (
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
                  <input type="url" inputMode="url" className="form-control" dir="ltr" value={form.url} onChange={setFromInput('url')}
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
              </div>
            </form>
          )}
        </Sheet>
      )}
    </>
  );
}
