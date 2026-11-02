import { UtensilsCrossed, Compass, Landmark, Ticket, Train, BedDouble, Tag, Check } from 'lucide-react';

// A booking's type and status: how the bookings tab and the schedule both
// show one (BookingsTab, DayPlanner).
export const BOOKING_TYPES = [
  { value: 'restaurant', label: 'מסעדה',    Icon: UtensilsCrossed, color: '#ea580c' },
  { value: 'tour',       label: 'סיור',     Icon: Compass,         color: '#4f46e5' },
  { value: 'attraction', label: 'אטרקציה',  Icon: Landmark,        color: '#0891b2' },
  { value: 'tickets',    label: 'כרטיסים / מופע', Icon: Ticket,    color: '#db2777' },
  { value: 'transport',  label: 'תחבורה',   Icon: Train,           color: '#059669' },
  { value: 'stay',       label: 'לינה',     Icon: BedDouble,       color: '#7c3aed' },
  { value: 'other',      label: 'אחר',      Icon: Tag,             color: '#64748b' },
];
export const typeOf = (v) => BOOKING_TYPES.find(t => t.value === v) || BOOKING_TYPES[BOOKING_TYPES.length - 1];

export const STATUSES = [
  { value: 'confirmed', label: 'מאושרת',        tone: 'mint', Icon: Check },
  { value: 'pending',   label: 'ממתינה לאישור', tone: 'butter' },
  { value: 'cancelled', label: 'בוטלה',         tone: 'muted' },
];
export const statusOf = (v) => STATUSES.find(st => st.value === v) || STATUSES[0];

export const PAYMENT_LABEL = { paid: 'שולם', deposit: 'שולמה מקדמה', onsite: 'תשלום במקום' };

export const telHref = (p) => `tel:${String(p).replace(/[^0-9+]/g, '')}`;
export const mapsHref = (a) => (/^https?:\/\//i.test(a) ? a : `https://maps.google.com/?q=${encodeURIComponent(a)}`);
