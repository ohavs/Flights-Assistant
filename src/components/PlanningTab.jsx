import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import { listen } from '../lib/listen';
import { addCategory, saveCategory, removeCategory, setCategoryIcon, setCategoryEmoji } from '../lib/categorySettings';
import { lastEmoji } from '../lib/emoji';
import { dayActivities, addActivities, updateActivity, removeActivity, swapActivities } from '../lib/dayActivities';
import { localDay, isoDay } from '../lib/dates';
import { changedFields } from '../lib/changes';
import { Pill, CategoryDisc, CheckCircle } from '../ui/kit';
import Sheet, { SheetSection, Segmented } from '../ui/Sheet';
import SectionHeader from '../ui/SectionHeader';
import PlanCategoryFilter from './PlanCategoryFilter';
import { useWeather, getWeatherIcon } from '../hooks/useWeather';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
  deleteField,
} from 'firebase/firestore';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  hasGmapsKey,
  resolveOriginString,
  hasPreciseOrigin,
  buildOriginCandidates,
  originFingerprint,
  isOnlineNow,
  isSaneTravel,
  clearPlaceCache,
  resolveRegionCoords,
  resolveDestinationAsync,
  resolvePlanCoords,
  fetchTravelTimes,
  knownPlaceCoords,
} from '../services/distanceApi';
import { CustomDropdown, CustomDatePicker, CustomTimePicker, CustomDateRangePicker, CustomTimeRangePicker } from './CustomDatePicker';
import { categoryTheme, THEMES } from '../lib/categoryTheme';
import { creatorOf } from '../lib/roles';
import Skeleton from './Skeleton';
import Fab from './Fab';
import EmptyState from './EmptyState';
import { useTrip } from '../TripContext';
import { useConfirm } from '../ConfirmContext';
import { withScheme } from '../lib/links';
import { findDuplicates } from '../lib/placeDuplicates';
import {
  Search,
  Plus,
  Trash2,
  MapPin,
  ExternalLink,
  Compass,
  UtensilsCrossed,
  Train,
  Info,
  CheckCircle2,
  Pencil,
  ArrowUp, MoreHorizontal,
  ArrowDown,
  Loader2,
  Hotel,
  Calendar,
  ChevronDown,
  ChevronLeft,
  Eye,
  EyeOff,
  Tag,
  Link2,
  X,
  Settings,
  Camera,
  Coffee,
  ShoppingBag,
  Plane,
  Star,
  Clock,
  Bike,
  Car,
  Landmark,
  Mountain,
  Tent,
  Navigation,
  GripVertical,
  Check,
  Layers,
  LayoutList,
  PanelLeft,
  LayoutGrid,
  Rows3,
  RefreshCw,
  SlidersHorizontal,
  MessageSquare,
  CalendarCheck,
  Footprints,
  Bus,
  Sunrise,
  Sun,
  Sunset,
  Moon,
  Pin,
  WifiOff,
  MapPinOff,
  SmilePlus,
  Wallet,
  CalendarClock,
  Copy,
} from 'lucide-react';

const ICON_OPTIONS = [
  { key: 'Compass',        Icon: Compass },
  { key: 'UtensilsCrossed',Icon: UtensilsCrossed },
  { key: 'Train',          Icon: Train },
  { key: 'Info',           Icon: Info },
  { key: 'MapPin',         Icon: MapPin },
  { key: 'Camera',         Icon: Camera },
  { key: 'Coffee',         Icon: Coffee },
  { key: 'ShoppingBag',   Icon: ShoppingBag },
  { key: 'Plane',          Icon: Plane },
  { key: 'Star',           Icon: Star },
  { key: 'Bike',           Icon: Bike },
  { key: 'Car',            Icon: Car },
  { key: 'Landmark',       Icon: Landmark },
  { key: 'Mountain',       Icon: Mountain },
  { key: 'Tent',           Icon: Tent },
  { key: 'Calendar',       Icon: Calendar },
];

const ICON_MAP = Object.fromEntries(ICON_OPTIONS.map(({ key, Icon }) => [key, Icon]));

// The category colour picker. Starts with the built-in categories' own
// colours (DEFAULT_CATEGORY_COLORS) so they can be picked back.
const COLOR_OPTIONS = [
  '#F2701D', '#E5484D', '#16874A', '#2563EB',
  '#6E56CF', '#C2410C', '#DB2777', '#0891B2',
  '#CA8A04', '#4F46E5', '#64748B', '#334155',
];

// Colours of the built-in categories until the user picks one in category
// settings (a saved colour always wins). From the Payments-2026 palette, so
// a list of places is not one shade of indigo.
const DEFAULT_CATEGORY_COLORS = {
  'אטרקציות ודברים לעשות': '#F2701D',
  'מסעדות ומקומות אכילה': '#E5484D',
  'מקומות לבקר': '#16874A',
  'תחבורה ציבורית': '#2563EB',
  'מידע כללי וטיפים': '#6E56CF',
  'אירועים': '#C2410C',
};

// Dedicated category whose items carry a date + time (concerts, reservations,
// guided tours…). Items in this category render date/time inputs in the form
// and are shown as a chronological agenda.
const EVENTS_CATEGORY = 'אירועים';

// Two places within this many metres of each other are treated as "near" and
// grouped into the same area in the proximity-grouping view.
const PROXIMITY_THRESHOLD_M = 800;

// The details sheet can show travel times from another place on the list
// (`travelFrom: 'place_<id>'` on the place). The times are saved under the
// same key in `distances`. The card and the distance sort keep the place's
// own origin (`distanceOriginId`, the hotel by default).
const PLACE_ORIGIN = 'place_';

// Local today date (YYYY-MM-DD) evaluated once on module load.
// Used for event-status badges; stale by at most one day if tab is left open overnight.
const todayISO = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

// Short, readable form of a URL — used whenever a link has no name of its
// own, so the UI never has to fall back to showing the raw address twice.
function prettyUrl(url) {
  if (!url) return '';
  let s = String(url).trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  s = s.replace(/\/$/, '');
  return s.length > 42 ? s.slice(0, 40) + '…' : s;
}

// Great-circle distance between two {lat,lng} points, in metres.
function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Greedy single-link clustering: each place joins an existing cluster if it is
// within PROXIMITY_THRESHOLD_M of any member, otherwise it seeds a new cluster.
function clusterByProximity(items, thresholdM) {
  const clusters = [];
  for (const item of items) {
    let placed = false;
    for (const cluster of clusters) {
      if (cluster.some(m => haversineMeters(m.coords, item.coords) <= thresholdM)) {
        cluster.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([item]);
  }
  return clusters;
}

/* A category's emoji, typed from the phone's own keyboard: tap, switch to
   the emoji keyboard, pick one. Whatever was there is selected on focus,
   so the new one replaces it; anything that is not an emoji is refused;
   erasing it brings the icon back. Shaped like the icon buttons beside it. */
function EmojiField({ value, color, label, disabled, onPick }) {
  const [refused, setRefused] = useState(false);
  const refuseTimer = useRef(null);
  useEffect(() => () => clearTimeout(refuseTimer.current), []);
  return (
    <span className={`emoji-field${value ? ' on' : ''}`} style={{ '--c': color }}>
      <input
        type="text"
        value={value}
        aria-label={label}
        title={refused ? 'רק אימוג׳י' : label}
        disabled={disabled}
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onFocus={e => e.target.select()}
        onChange={e => {
          const typed = e.target.value;
          if (!typed.trim()) { if (value) onPick(''); return; }
          const emoji = lastEmoji(typed);
          if (!emoji) {
            setRefused(true);
            clearTimeout(refuseTimer.current);
            refuseTimer.current = setTimeout(() => setRefused(false), 1600);
            return;
          }
          setRefused(false);
          if (emoji !== value) onPick(emoji);
          e.target.blur();
        }}
      />
      {!value && <SmilePlus size={16} aria-hidden="true" />}
      {refused && <span className="emoji-field-hint" role="status">רק אימוג׳י</span>}
    </span>
  );
}

// A leg's time in the stub: the number big, its unit under it. From the
// seconds when they were saved, else read back from the words.
function stubTime(leg) {
  if (!leg) return null;
  let m = typeof leg.seconds === 'number' ? Math.round(leg.seconds / 60) : null;
  if (m == null) {
    const h = /(\d+)\s*שע/.exec(leg.duration || ''), mm = /(\d+)\s*דק/.exec(leg.duration || '');
    if (!h && !mm) return null;
    m = (h ? Number(h[1]) * 60 : 0) + (mm ? Number(mm[1]) : 0);
  }
  m = Math.max(m, 1);
  if (m < 60) return { minutes: m, num: String(m), unit: "דק'" };
  return { minutes: m, num: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, unit: "שע'" };
}

const DOW_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

// A place's date and time (`event`, any category since 8.66.0) as its card
// shows it: a top line, the big value and a small one under it (the stub
// and the leaf), a tag for what doesn't fit there (`until`), the whole of
// it in one line, and whether it is over.
// A date range with hours is open every day in those hours (a Christmas
// market), as the sheet says: "כל יום", the hours, and the dates as a tag.
// Before 8.70.1 the card read it as one stretch from the first day's
// opening to the last day's closing.
function placeWhen(ev) {
  if (!ev?.startDate) return null;
  const [y, m, d] = ev.startDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const day = new Date(y, m - 1, d);
  const now = new Date();
  const diff = Math.round((day - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  const dm = (iso) => { const [, mm, dd] = iso.split('-'); return `${dd}.${mm}`; };
  const rel = diff === 0 ? 'היום' : diff === 1 ? 'מחר' : null;
  const dow = DOW_HE[day.getDay()];
  const time = ev.startTime || '';
  const range = !!ev.endDate && ev.endDate !== ev.startDate;
  const base = { dm: dm(ev.startDate), today: diff === 0, past: todayISO > (ev.endDate || ev.startDate) };
  if (range && time) {
    const hours = `${time}${ev.endTime ? `–${ev.endTime}` : ''}`;
    const dates = `${dm(ev.startDate)}–${dm(ev.endDate)}`;
    return { ...base, daily: true, top: 'כל יום', main: time, sub: ev.endTime ? `עד ${ev.endTime}` : '',
      until: dates, hours: `כל יום ${hours}`, dates, line: `כל יום ${hours} · ${dates}` };
  }
  const top = rel || dow;
  if (range) {
    return { ...base, top, main: dm(ev.startDate), sub: `עד ${dm(ev.endDate)}`, until: '',
      line: `${top} ${dm(ev.startDate)} עד ${dm(ev.endDate)}` };
  }
  return { ...base, top, main: time || dm(ev.startDate), sub: time ? dm(ev.startDate) : '',
    until: ev.endTime ? `עד ${ev.endTime}` : '',
    line: `${top} ${dm(ev.startDate)}${time ? ` · ${time}${ev.endTime ? `–${ev.endTime}` : ''}` : ''}` };
}

// Card layouts for the places list. Each entry drives the density of the
// card chrome; the list ones keep the same behaviour (open, navigate, mark
// visited). "עמודת זמן" (stub) is a card of its own: everything about a
// place you can read without opening it, and its travel time big in a
// stub on the side that navigates. It replaced "מרווח" (8.65.0), so a
// trip that had "מרווח" saved opens in it.
const PLAN_LAYOUTS = {
  stub: {
    label: 'עמודת זמן',
    icon: PanelLeft,
    listGap: 12,
    columns: 1,
  },
  compact: {
    label: 'קומפקטי',
    icon: Rows3,
    listGap: 8,
    cardPad: '10px 12px',
    iconBox: 32,
    titleSize: 14,
    headerGap: 10,
    showSubtitle: true,
    columns: 1,
  },
  grid: {
    label: 'רשת',
    icon: LayoutGrid,
    listGap: 8,
    cardPad: '10px 11px',
    iconBox: 26,
    titleSize: 12.5,
    headerGap: 7,
    showSubtitle: false,
    columns: 2,
  },
};

// Group a day's activities by their time-of-day label.
// Known labels come first in canonical order, custom labels (e.g. "10:30")
// follow by first appearance, and unlabeled activities are grouped last.
const TIME_GROUP_ORDER = ['בוקר', 'צהריים', 'ערב', 'לילה'];
const TIME_GROUP_ICONS = { 'בוקר': Sunrise, 'צהריים': Sun, 'ערב': Sunset, 'לילה': Moon };

// A place in the day planner's picker: how far it is, and how much it matters.
const travelMeta = (cache) => {
  const walk = cache?.walk?.duration, transit = cache?.transit?.duration;
  if (!walk && !transit) return undefined;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {walk && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Footprints size={12} aria-hidden="true" />{walk}</span>}
      {transit && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Bus size={12} aria-hidden="true" />{transit}</span>}
    </span>
  );
};
const priorityIcon = (priority) =>
  priority === 'must' ? <Star size={13} className="star-must" aria-label="חובה" />
  : priority === 'optional' ? <Clock size={13} aria-label="אופציונלי" style={{ color: 'var(--text-muted)' }} />
  : undefined;

function groupActivitiesByTime(acts) {
  const map = new Map();
  acts.forEach((act, i) => {
    const label = (act.timeLabel || '').trim();
    if (!map.has(label)) map.set(label, { label, acts: [], firstIdx: i });
    map.get(label).acts.push(act);
  });
  const rank = (g) => g.label === '' ? 3 : TIME_GROUP_ORDER.includes(g.label) ? 1 : 2;
  return [...map.values()].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 1) return TIME_GROUP_ORDER.indexOf(a.label) - TIME_GROUP_ORDER.indexOf(b.label);
    return a.firstIdx - b.firstIdx;
  });
}

// The plan form's editable values as one comparable string.
function planFormKey(v) {
  return JSON.stringify([
    v.title, v.category, v.description, v.address, v.price, v.links, v.newLinkLabel, v.newLinkUrl,
    v.eventStartDate, v.eventEndDate, v.eventStartTime, v.eventEndTime,
    v.originId, v.priority, v.needsReservation, v.walkMins, v.transitMins,
  ]);
}

export default function PlanningTab({ tripId, sharedPlace = null, onSharedPlaceHandled }) {
  // "הוספה" (canAdd without canEdit) adds places and activities, ticks
  // visited, and changes only what they added (src/lib/roles.js).
  const { canEdit, canAdd, mayChange, currentUid, currentUserProfile, memberProfiles } = useTrip();
  const confirm = useConfirm();

  // Profile of whoever added a place, for the little avatar on the card.
  const profileFor = (uid) => {
    if (!uid) return null;
    if (uid === currentUid && currentUserProfile) return currentUserProfile;
    return memberProfiles?.[uid] || null;
  };

  // FLIP animation: only fires when the sorted order of cards changes
  // (i.e. a visited-toggle moves a card to the bottom). Expanding/collapsing
  // a card shifts cards below it but does NOT change order — without this
  // guard those positional shifts triggered an unwanted scroll-like animation.
  const itemRefs = useRef(new Map());
  const lastPositions = useRef(new Map());
  const prevSortedIds = useRef([]);
  useLayoutEffect(() => {
    const currentIds = filteredPlans.map(p => p.id);
    const orderChanged =
      currentIds.length !== prevSortedIds.current.length ||
      currentIds.some((id, i) => id !== prevSortedIds.current[i]);
    prevSortedIds.current = currentIds;

    for (const [id, node] of itemRefs.current.entries()) {
      if (!node) continue;
      const newRect = node.getBoundingClientRect();
      if (orderChanged) {
        const prev = lastPositions.current.get(id);
        if (prev) {
          const dy = prev.top - newRect.top;
          if (Math.abs(dy) > 2) {
            node.style.transition = 'none';
            node.style.transform = `translateY(${dy}px)`;
            // eslint-disable-next-line no-unused-expressions
            node.offsetHeight;
            node.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)';
            node.style.transform = 'translateY(0)';
          }
        }
      }
      lastPositions.current.set(id, newRect);
    }
  });
  const [plans, setPlans] = useState([]);
  const [days, setDays] = useState([]);
  const [subTab, setSubTab] = useState('pool'); // 'pool' | 'daily'
  
  const [searchQuery, setSearchQuery] = useState('');
  // The search is a round button until tapped; then it opens into a field
  // across the row. It stays open while there is a query.
  const [searchOpen, setSearchOpen] = useState(false);
  // The category filter: any number of categories (none = all), and
  // "must only" on top of them (PlanCategoryFilter).
  const [pickedCats, setPickedCats] = useState([]);
  const [mustOnly, setMustOnly] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form states for pool items
  const [editingId, setEditingId] = useState(null);
  const [editBaseline, setEditBaseline] = useState(null); // planFormKey() of the place as loaded
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('אטרקציות ודברים לעשות');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [price, setPrice] = useState('');
  const [links, setLinks] = useState([]); // [{ label, url }]
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  // Inline editing of an already-added link (index into `links`).
  const [editingLinkIdx, setEditingLinkIdx] = useState(null);
  const [editLinkLabel, setEditLinkLabel] = useState('');
  const [editLinkUrl, setEditLinkUrl] = useState('');
  // Event fields (shown only when category === EVENTS_CATEGORY)
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventStartTime, setEventStartTime] = useState('');
  const [eventEndTime, setEventEndTime] = useState('');
  // "טווח": a first and a last day, a start and an end time. Off, the end
  // is kept in the form (switching back brings it) but not saved.
  const [whenRange, setWhenRange] = useState(false);
  const endDateOn = whenRange ? eventEndDate : '';
  const endTimeOn = whenRange ? eventEndTime : '';
  // A time was picked with no date: saving waits for one.
  const [whenNeedsDate, setWhenNeedsDate] = useState(false);
  // Manual travel-time overrides (edit form only, in minutes)
  const [editWalkMins, setEditWalkMins] = useState('');
  const [editTransitMins, setEditTransitMins] = useState('');
  // Priority: null | 'must' | 'optional'
  const [formPriority, setFormPriority] = useState(null);
  // Has to be booked / reserved ahead of time. Optional, off by default.
  const [formNeedsReservation, setFormNeedsReservation] = useState(false);

  // Tapping a place card opens a details sheet instead of expanding the card
  // in place — the card itself stays plain text, every action lives here.
  const [detailPlanId, setDetailPlanId] = useState(null);
  // The "from where" picker over the details sheet: the place it measures to.
  const [originPickerFor, setOriginPickerFor] = useState(null);
  const [originQuery, setOriginQuery] = useState('');
  // Categories folded in that picker, per trip on this device.
  const [originFolded, setOriginFolded] = useState(() => {
    try {
      const raw = localStorage.getItem(`origin_folded_${tripId}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`origin_folded_${tripId}`, JSON.stringify([...originFolded]));
    } catch { /* ignore */ }
  }, [originFolded, tripId]);

  // Category customisation (icon + color), synced with Firestore
  const [categorySettings, setCategorySettings] = useState({});
  const [showCategorySettings, setShowCategorySettings] = useState(false);
  const [addingCatInSettings, setAddingCatInSettings] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [showSortMenu, setShowSortMenu] = useState(false);
  // The phone's back gesture closes the options sheet before anything else.
  const optionsBtnRef = useRef(null);
  // Card layout, remembered per trip. 8.69.0 (the owner's ask): everyone
  // starts on stub cards in category sections, even with an older choice
  // saved — so the keys are new ("2"); a choice made from here on is kept.
  const [planLayout, setPlanLayout] = useState(() => {
    try {
      const saved = localStorage.getItem(`planLayout2_${tripId}`);
      return saved && PLAN_LAYOUTS[saved] ? saved : 'stub';
    } catch { return 'stub'; }
  });
  // How the list is broken into sections: none, by category, or by area
  // (proximity clusters). Remembered per trip, like the card layout.
  const [groupBy, setGroupBy] = useState(() => {
    try {
      const saved = localStorage.getItem(`planGroupBy2_${tripId}`);
      return ['none', 'category', 'area'].includes(saved) ? saved : 'category';
    } catch { return 'category'; }
  });
  // Quick way to get finished places out of the way in a long list.
  const [hideVisited, setHideVisited] = useState(false);
  // "Show the duplicates": the notice over the list shows just them, each
  // set as its own section.
  const [dupOnly, setDupOnly] = useState(false);
  const [collapsedAreas, setCollapsedAreas] = useState({}); // headerId → true when collapsed
  // Category sections folded in the list, per trip on this device: with
  // everything (or several categories) shown, a fold skips past one.
  const [foldedCats, setFoldedCats] = useState(() => {
    try {
      const raw = localStorage.getItem(`plan_cats_folded_${tripId}`);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`plan_cats_folded_${tripId}`, JSON.stringify([...foldedCats]));
    } catch { /* storage full or blocked: the fold just isn't remembered */ }
  }, [foldedCats, tripId]);
  const toggleCatFold = (cat) => setFoldedCats(prev => {
    const next = new Set(prev);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    return next;
  });
  const [bulkCalc, setBulkCalc] = useState(null); // { done, total } while running
  // Places whose address/links were just edited — their travel times are
  // recomputed as soon as the updated document comes back.
  const [recomputeIds, setRecomputeIds] = useState([]);
  const [coordsCache, setCoordsCache] = useState({}); // planId → {lat,lng} | null

  // Locations modal: when a card has multiple navigation targets
  const [locationsModal, setLocationsModal] = useState(null);

  // Distance from hotel/origin
  const [hotelDetails, setHotelDetails] = useState(null);
  const [tripDestination, setTripDestination] = useState('');
  // Coordinates of the destination city, resolved once and cached. Keeps a
  // title-only place lookup inside the trip's region.
  const [regionCoords, setRegionCoords] = useState(null);
  // Bumped when connectivity returns, so distances that failed while offline
  // are retried automatically instead of staying stuck.
  const [netEpoch, setNetEpoch] = useState(0);
  const [online, setOnline] = useState(isOnlineNow());
  const [distanceOrigins, setDistanceOrigins] = useState([]); // [{id,name,mapsUrl}]
  const [distanceCache, setDistanceCache] = useState({}); // cacheKey → {walk,transit,loading,error}
  // Form: distance origin selector
  const [formOriginId, setFormOriginId] = useState('hotel');
  const [originDropOpen, setOriginDropOpen] = useState(false);
  const [showAddOriginForm, setShowAddOriginForm] = useState(false);
  const [newOriginName, setNewOriginName] = useState('');
  const [newOriginUrl, setNewOriginUrl] = useState('');

  // Form states for daily activities
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState('');
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [savedPlaceSelections, setSavedPlaceSelections] = useState([{ categoryFilter: '', placeId: '', timeLabel: '' }]);
  const [activityTitle, setActivityTitle] = useState('');
  const [activityTimeLabel, setActivityTimeLabel] = useState('');
  const [activityAddress, setActivityAddress] = useState('');
  const [activityDescription, setActivityDescription] = useState('');
  const [activityCategory, setActivityCategory] = useState('אטרקציות ודברים לעשות');

  // Day Title Editing states
  const [editingDayId, setEditingDayId] = useState(null);
  /* A day is appended to the bottom of the list, which on a trip of any
     length is off-screen — so adding one looked like nothing happened.
     A toast would say "it worked" and still leave you to go find it;
     taking you to the new card puts you where the next action is, which
     is filling it in. The pulse says which of the cards is the new one. */
  const dayNodes = useRef(new Map());
  const [arrivedDayId, setArrivedDayId] = useState(null);

  /* A second layout for the day list: one line per day instead of a full
     timeline. On a week-long trip the full view is several screens of
     scrolling to answer "what is on Thursday?". */
  const [dayLayout, setDayLayout] = useState(() => {
    try { return localStorage.getItem(`dayLayout_${tripId}`) === 'summary' ? 'summary' : 'full'; }
    catch { return 'full'; }
  });
  useEffect(() => {
    try { if (tripId) localStorage.setItem(`dayLayout_${tripId}`, dayLayout); } catch { /* private mode */ }
  }, [dayLayout, tripId]);
  // Which days are opened out of the summary. Kept apart from
  // collapsedDays so switching layouts never disturbs the other one.
  const [openSummaryDays, setOpenSummaryDays] = useState(() => new Set());

  const [collapsedDays, setCollapsedDays] = useState(() => {
    try {
      const raw = localStorage.getItem(`collapsed_days_${tripId}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`collapsed_days_${tripId}`, JSON.stringify([...collapsedDays]));
    } catch { /* ignore */ }
  }, [collapsedDays, tripId]);
  // Collapsed time-of-day groups inside day cards, keyed `${dayId}|${label}`
  const [collapsedTimeGroups, setCollapsedTimeGroups] = useState(() => {
    try {
      const raw = localStorage.getItem(`collapsed_timegroups_${tripId}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`collapsed_timegroups_${tripId}`, JSON.stringify([...collapsedTimeGroups]));
    } catch { /* ignore */ }
  }, [collapsedTimeGroups, tripId]);
  const [hourlyWeatherDate, setHourlyWeatherDate] = useState(null);
  const [activityDetail, setActivityDetail] = useState(null);
  const [editingDayTitle, setEditingDayTitle] = useState('');
  const [tripFlightDates, setTripFlightDates] = useState({ out: null, ret: null, plannerSync: null });
  const [destCoords, setDestCoords] = useState(null);

  const defaultCategoryNames = [
    'אטרקציות ודברים לעשות',
    'מסעדות ומקומות אכילה',
    'מקומות לבקר',
    'תחבורה ציבורית',
    'מידע כללי וטיפים',
    EVENTS_CATEGORY,
  ];
  // Derive the full category list: defaults + custom (saved in Firestore settings) + anything used
  const categories = Array.from(new Set([
    ...defaultCategoryNames,
    ...Object.keys(categorySettings), // custom categories saved via settings
    ...plans.map(p => p.category).filter(Boolean),
    ...days.flatMap(d => (d.activities || []).map(a => a.category).filter(Boolean)),
  ]));

  // Load category customisation settings
  // Places that already have a booking in the הזמנות tab — shown as
  // booked instead of "to book".
  const [bookedPlaceIds, setBookedPlaceIds] = useState(() => new Set());
  useEffect(() => {
    if (!tripId) return;
    return listen(collection(db, 'trips', tripId, 'bookings'), snap => {
      setBookedPlaceIds(new Set(
        snap.docs.map(d => d.data()).filter(b => b.placeId && b.status !== 'cancelled').map(b => b.placeId)
      ));
    });
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;
    const unsub = listen(doc(db, 'trips', tripId, 'settings', 'categories'), snap => {
      setCategorySettings(snap.exists() ? (snap.data() || {}) : {});
    });
    return () => unsub();
  }, [tripId]);

  /* One listener on the trip document.
   *
   * There were two, with identical deps, reading different fields of the
   * same doc — so every trip edit woke two subscriptions, two callbacks
   * and two render passes, and Firestore held two streams open for one
   * document. Everything read from the trip doc is set here together. */
  useEffect(() => {
    if (!tripId) return;
    const unsub = listen(doc(db, 'trips', tripId), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      setHotelDetails(d.hotelDetails || null);
      setTripDestination(d.destination || '');
      setDistanceOrigins(Array.isArray(d.distanceOrigins) ? d.distanceOrigins : []);
      setTripFlightDates({
        out: d.outboundFlightDetails?.date || null,
        ret: d.returnFlightDetails?.date || null,
        plannerSync: d.plannerDaysFromFlight || null,
      });
      const arr = d.outboundFlightDetails?.arrAirport || d.returnFlightDetails?.depAirport;
      if (arr?.lat && arr?.lng) setDestCoords(arr);
    });
    return () => unsub();
  }, [tripId]);

  // Each of these writes one category only (src/lib/categorySettings.js).
  // The listener above shows the change at once, offline too.
  // An editor's: "הוספה" may name a new category on a place (it shows from
  // the place), but the trip's category settings are not theirs.
  const categoryWrite = (write) => {
    if (!tripId || !canEdit) return;
    write().catch(err => console.error('Category save error:', err));
  };

  // Listen to Firestore planning items (pool)
  useEffect(() => {
    if (!tripId) return;
    const unsubscribe = listen(collection(db, 'trips', tripId, 'planning'), (snapshot) => {
      const fetchedPlans = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPlans(fetchedPlans);
      setLoading(false);
    }, () => setLoading(false));   // refused for good: the empty list, not a skeleton forever

    return () => unsubscribe();
  }, [tripId]);

  // Geocode the trip destination once so title lookups can be scoped to it.
  useEffect(() => {
    let cancelled = false;
    resolveRegionCoords(tripDestination)
      .then(c => { if (!cancelled) setRegionCoords(prev => (prev === (c || null) ? prev : (c || null))); })
      .catch(() => { /* falls back to text-only scoping */ });
    return () => { cancelled = true; };
  }, [tripDestination]);

  // Hydrate runtime caches from persisted Firestore data (distances + coords)
  // so we don't re-hit the Routes API on every reload. Runtime values already
  // present (fresher) are kept.
  useEffect(() => {
    if (!plans.length) return;
    setDistanceCache(prev => {
      const next = { ...prev };
      for (const plan of plans) {
        if (!plan.distances) continue;
        for (const [originId, val] of Object.entries(plan.distances)) {
          const key = `${plan.id}_${originId}`;
          // Skip implausible values saved before the geocoding fix — leaving
          // them out means they get recomputed instead of shown.
          if (!isSaneTravel(val)) continue;
          if (!next[key]) next[key] = val;
        }
      }
      return next;
    });
    setCoordsCache(prev => {
      const next = { ...prev };
      for (const plan of plans) {
        if (plan.coords && !(plan.id in next)) next[plan.id] = plan.coords;
      }
      return next;
    });
  }, [plans]);

  // Listen to Firestore daily planner days
  useEffect(() => {
    if (!tripId) return;
    const unsubscribe = listen(collection(db, 'trips', tripId, 'days'), (snapshot) => {
      // `activities` is the day as shown (src/lib/dayActivities.js);
      // changes are written against `rawActivities`, the array as stored.
      const fetchedDays = snapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data, activities: dayActivities(data.activities), rawActivities: data.activities || [] };
      });
      // Sort days by order ascending
      fetchedDays.sort((a, b) => (a.order || 0) - (b.order || 0));
      setDays(fetchedDays);
    });

    return () => unsubscribe();
  }, [tripId]);


  const { data: weather } = useWeather(destCoords?.lat, destCoords?.lng);
  const weatherByDate = useMemo(() => {
    if (!weather?.daily) return {};
    const map = {};
    weather.daily.forEach(d => { map[d.date] = d; });
    return map;
  }, [weather]);

  // Persist sort preference per trip
  useEffect(() => {
    if (!tripId) return;
    const saved = localStorage.getItem(`sortBy_${tripId}`);
    if (saved) setSortBy(saved);
  }, [tripId]);

  useEffect(() => {
    if (tripId) localStorage.setItem(`sortBy_${tripId}`, sortBy);
  }, [sortBy, tripId]);

  // Persist the chosen card layout per trip. It is read back by the useState
  // initializer above — the trip UI unmounts when you go back to the trip
  // list, so the layout is re-read on every entry into a trip.
  useEffect(() => {
    if (!tripId) return;
    localStorage.setItem(`planLayout2_${tripId}`, planLayout);
    localStorage.removeItem(`planLayout_${tripId}`);
  }, [planLayout, tripId]);

  useEffect(() => {
    if (!tripId) return;
    localStorage.setItem(`planGroupBy2_${tripId}`, groupBy);
    localStorage.removeItem(`planGroupBy_${tripId}`);
  }, [groupBy, tripId]);

  /* ══════════════════════════════════════════════════════════
     DISTANCE HELPERS
     ══════════════════════════════════════════════════════════ */
  // The place an origin key points at, when it is one from the list.
  const originPlanOf = (originId) =>
    originId?.startsWith(PLACE_ORIGIN) ? plans.find(p => p.id === originId.slice(PLACE_ORIGIN.length)) || null : null;

  // Where the details sheet measures from: the place's own choice there,
  // as long as what it points at still exists, else the card's origin.
  const sheetOriginKey = (plan) => {
    const base = plan.distanceOriginId || 'hotel';
    const k = plan.travelFrom;
    if (!k || k === plan.distanceOriginId) return base;
    if (k.startsWith(PLACE_ORIGIN)) {
      const from = originPlanOf(k);
      return from && from.id !== plan.id ? k : base;
    }
    return k === 'hotel' || distanceOrigins.some(o => o.id === k) ? k : base;
  };

  // Times measured from another place go stale when that place moves.
  const placeOriginFingerprint = (from) => [
    PLACE_ORIGIN, from.address || '',
    ...(Array.isArray(from.links) ? from.links.map(l => l?.url || '') : []),
  ].join('|');

  const fetchPlanDistances = async (plan, originId = plan.distanceOriginId || 'hotel') => {
    if (!hasGmapsKey()) return;
    const cacheKey = `${plan.id}_${originId}`;
    const existing = distanceCache[cacheKey];

    const fromPlan = originPlanOf(originId);
    if (originId.startsWith(PLACE_ORIGIN) && !fromPlan) return;
    const customOrigin = fromPlan ? null : (distanceOrigins.find(o => o.id === originId) || null);
    // Fingerprint of every input the origin derives from. If the user edits
    // the hotel address/link, this changes and the cached numbers are stale.
    const fp = fromPlan
      ? placeOriginFingerprint(fromPlan)
      : originFingerprint(hotelDetails, customOrigin, tripDestination);

    // Decide against the value saved on the plan document as well as the
    // runtime cache. The hydration effect and this one both run off the same
    // `plans` update, so on the first load after opening a trip the runtime
    // cache is still empty in this closure — relying on it alone would
    // re-measure everything over the network despite having saved results.
    // `plan.distances` comes straight from the snapshot and is never stale.
    const persisted = plan.distances?.[originId];
    const saved = (persisted && isSaneTravel(persisted)) ? persisted : null;
    const known = existing || saved;
    const hasResult = !!(known?.walk || known?.transit);

    if (existing && (existing.loading || existing.manualOverride)) return;
    // Nothing about the origin changed → reuse the saved result, no network.
    if (hasResult && known.originFp === fp) {
      // Make sure the saved value is actually on screen.
      if (!existing && saved) {
        setDistanceCache(prev => (prev[cacheKey] ? prev : { ...prev, [cacheKey]: saved }));
      }
      return;
    }
    // Offline: never discard a good result to re-measure it — show what we have.
    const online = isOnlineNow();
    if (!online && hasResult) {
      if (!existing && saved) {
        setDistanceCache(prev => (prev[cacheKey] ? prev : { ...prev, [cacheKey]: saved }));
      }
      return;
    }

    setDistanceCache(prev => ({ ...prev, [cacheKey]: { loading: true } }));

    // Resolve origin and destination CONCURRENTLY. Both may need to expand a
    // short Maps link over the network, and running them in sequence made
    // adding a new place noticeably slow. The destination only needs a hint
    // for its (fallback) title lookup, and resolveOriginString gives that
    // synchronously from already-cached data.
    const originHint = resolveOriginString(hotelDetails, customOrigin, tripDestination);
    const region = { coords: regionCoords, text: tripDestination };
    const [candidates, dest] = await Promise.all([
      // Ordered origin options: custom → hotel coords → hotel address →
      // expanded hotel link → hotel name → city centre. Another place:
      // where it was located, else resolved the way a destination is.
      fromPlan
        ? (async () => {
          const c = coordsCache[fromPlan.id] || fromPlan.coords;
          const at = c ? `${c.lat},${c.lng}` : await resolveDestinationAsync(fromPlan, originHint, region);
          return at ? [{ value: at, kind: 'place' }] : [];
        })()
        : buildOriginCandidates(hotelDetails, customOrigin, tripDestination, { online }),
      resolveDestinationAsync(plan, originHint, region),
    ]);

    if (candidates.length === 0) {
      setDistanceCache(prev => ({
        ...prev,
        [cacheKey]: (fromPlan && !online) ? { offline: true } : { noLocation: true, noOrigin: !!fromPlan },
      }));
      return;
    }
    if (!dest) {
      setDistanceCache(prev => ({
        ...prev,
        [cacheKey]: online ? { noLocation: true } : { offline: true },
      }));
      return;
    }

    // Try each origin until one yields a route, so a mistyped address or an
    // unresolvable link falls through to the next option instead of failing.
    let value = null;
    let networkFailed = false;
    let bogusLocation = false;
    for (const cand of candidates) {
      const result = await fetchTravelTimes(cand.value, dest);
      if (result?.networkError) { networkFailed = true; break; }
      if (result && (result.walk || result.transit)) {
        // An implausible route means `dest` geocoded to the wrong place —
        // trying other origins would only produce more nonsense. Drop the
        // cached title match so it can be resolved cleanly next time.
        if (!isSaneTravel(result)) {
          clearPlaceCache(plan.id);
          bogusLocation = true;
          break;
        }
        value = {
          walk: result.walk || null, transit: result.transit || null,
          fetchedAt: Date.now(),
          origin: cand.value, originKind: cand.kind, originFp: fp,
        };
        break;
      }
    }

    if (bogusLocation) {
      setDistanceCache(prev => ({ ...prev, [cacheKey]: { noLocation: true } }));
      // Remove the bad value already persisted, so it isn't rehydrated.
      if (tripId) {
        updateDoc(doc(db, 'trips', tripId, 'planning', plan.id), {
          [`distances.${originId}`]: deleteField(),
        }).catch(() => { /* non-fatal */ });
      }
      return;
    }

    if (!value) {
      // Keep whatever we had rather than replacing it with an error state.
      setDistanceCache(prev => ({
        ...prev,
        [cacheKey]: (networkFailed || !online)
          ? (hasResult ? known : { offline: true })
          : { noLocation: true },
      }));
      return;
    }

    setDistanceCache(prev => ({ ...prev, [cacheKey]: { ...value, loading: false } }));
    // Persist so it survives reloads — no API call needed next time. Firestore
    // queues this locally when offline and syncs it on reconnect.
    if (tripId) {
      updateDoc(doc(db, 'trips', tripId, 'planning', plan.id), {
        [`distances.${originId}`]: value,
      }).catch(() => { /* non-fatal: runtime cache still holds the result */ });
    }
  };

  const handleSaveDistanceOrigin = async () => {
    if (!newOriginName.trim() || !newOriginUrl.trim() || !tripId) return;
    const newOrigin = {
      id: 'origin-' + Date.now(),
      name: newOriginName.trim(),
      mapsUrl: withScheme(newOriginUrl),
    };
    // The form clears first and the write is not awaited: offline it waits
    // for the network, and a second tap meanwhile added the origin twice.
    setFormOriginId(newOrigin.id);
    setNewOriginName('');
    setNewOriginUrl('');
    setShowAddOriginForm(false);
    updateDoc(doc(db, 'trips', tripId), { distanceOrigins: arrayUnion(newOrigin) })
      .catch(err => console.error('Add origin failed:', err));
  };

  // One-shot: walk every place, fetch + persist its travel times and resolve
  // its coordinates (for proximity grouping). Skips places already computed so
  // re-pressing is cheap. Runs sequentially to stay gentle on the API quota.
  const handleCalculateAll = async () => {
    if (!hasGmapsKey() || bulkCalc) return;
    // Offline there is nothing to measure — bail out instead of walking every
    // place only to fail on each one.
    if (!isOnlineNow()) return;
    const origin = resolveOriginString(hotelDetails, null, tripDestination);
    const list = [...plans];
    setBulkCalc({ done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      const plan = list[i];
      await fetchPlanDistances(plan);
      if (!(plan.id in coordsCache)) {
        const c = await resolvePlanCoords(plan, origin, { coords: regionCoords, text: tripDestination })
          .catch(() => null);
        setCoordsCache(prev => ({ ...prev, [plan.id]: c }));
        if (c && tripId) {
          // Not awaited: if the connection drops mid-run, the rest still goes on.
          updateDoc(doc(db, 'trips', tripId, 'planning', plan.id), { coords: c }).catch(() => { /* keep runtime */ });
        }
      }
      setBulkCalc({ done: i + 1, total: list.length });
    }
    setBulkCalc(null);
  };

  const handleRemoveDistanceOrigin = async (originId) => {
    if (!tripId) return;
    const origin = distanceOrigins.find(o => o.id === originId);
    if (!origin) return;
    if (formOriginId === originId) setFormOriginId('hotel');
    updateDoc(doc(db, 'trips', tripId), { distanceOrigins: arrayRemove(origin) })
      .catch(err => console.error('Remove origin failed:', err));
  };

  /* ══════════════════════════════════════════════════════════
     PLACES POOL (OLD PLANNING) OPERATIONS
     ══════════════════════════════════════════════════════════ */
  const handleOpenAdd = () => {
    setEditingId(null);
    setTitle('');
    setCategory('אטרקציות ודברים לעשות');
    setDescription('');
    setAddress('');
    setPrice('');
    setLinks([]);
    setEditingLinkIdx(null);
    setNewLinkLabel('');
    setNewLinkUrl('');
    setEventStartDate('');
    setEventEndDate('');
    setEventStartTime('');
    setEventEndTime('');
    setWhenRange(false);
    setWhenNeedsDate(false);
    setFormOriginId('hotel');
    setOriginDropOpen(false);
    setShowAddOriginForm(false);
    setFormPriority(null);
    setFormNeedsReservation(false);
    setShowAddForm(true);
  };

  // A place shared from Google Maps: open the add form on the places sub-tab
  // with the name, the maps link (as the address, so navigation and travel
  // times work off it) and anything else the share carried already filled in.
  useEffect(() => {
    if (!sharedPlace) return;
    // Nothing to fill in a trip this user can only view — release it rather
    // than leaving it pending forever.
    if (!canAdd) { onSharedPlaceHandled?.(); return; }
    setSubTab('pool');
    handleOpenAdd();
    if (sharedPlace.name) setTitle(sharedPlace.name);
    if (sharedPlace.url) setAddress(sharedPlace.url);
    if (sharedPlace.note) setDescription(sharedPlace.note);
    onSharedPlaceHandled?.();
    // handleOpenAdd is recreated every render; the place itself is the trigger.
  }, [sharedPlace]); // eslint-disable-line react-hooks/exhaustive-deps

  // Whether closing the plan form would lose something (the "unsaved
  // changes" prompt, and drag-to-dismiss only while nothing would be lost).
  // A new place: anything typed in. An edit: anything different from what
  // was loaded — its fields are always filled, so "has content" would ask
  // every time, even when nothing changed.
  const currentPlanForm = () => planFormKey({
    title, category, description, address, price, links, newLinkLabel, newLinkUrl,
    eventStartDate, eventEndDate: endDateOn, eventStartTime, eventEndTime: endTimeOn,
    originId: formOriginId, priority: formPriority, needsReservation: formNeedsReservation,
    walkMins: editWalkMins, transitMins: editTransitMins,
  });
  const planFormDirty = () => editingId
    ? currentPlanForm() !== editBaseline
    : !!(title.trim() || description.trim() || address.trim() || price.trim() ||
         links.length > 0 || newLinkLabel.trim() || newLinkUrl.trim());

  const closePlanForm = () => {
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleStartEdit = (plan) => {
    const originKey = plan.distanceOriginId || 'hotel';
    const cacheEntry = distanceCache[`${plan.id}_${originKey}`];
    const walkMins = cacheEntry?.manualOverride && cacheEntry.walk?.seconds ? String(Math.round(cacheEntry.walk.seconds / 60)) : '';
    const transitMins = cacheEntry?.manualOverride && cacheEntry.transit?.seconds ? String(Math.round(cacheEntry.transit.seconds / 60)) : '';
    // What the form holds right after loading: closing it unchanged is free.
    setEditBaseline(planFormKey({
      title: plan.title, category: plan.category, description: plan.description || '',
      address: plan.address || '', price: plan.price || '',
      links: Array.isArray(plan.links) ? plan.links : [], newLinkLabel: '', newLinkUrl: '',
      eventStartDate: plan.event?.startDate || '', eventEndDate: plan.event?.endDate || '',
      eventStartTime: plan.event?.startTime || '', eventEndTime: plan.event?.endTime || '',
      originId: originKey, priority: plan.priority || null, needsReservation: !!plan.needsReservation,
      walkMins, transitMins,
    }));
    setEditingId(plan.id);
    setTitle(plan.title);
    setCategory(plan.category);
    setDescription(plan.description || '');
    setAddress(plan.address || '');
    setPrice(plan.price || '');
    setLinks(Array.isArray(plan.links) ? plan.links : []);
    setEditingLinkIdx(null);
    setNewLinkLabel('');
    setNewLinkUrl('');
    setEventStartDate(plan.event?.startDate || '');
    setEventEndDate(plan.event?.endDate || '');
    setEventStartTime(plan.event?.startTime || '');
    setEventEndTime(plan.event?.endTime || '');
    setWhenRange(!!(plan.event?.endDate || plan.event?.endTime));
    setWhenNeedsDate(false);
    setFormOriginId(plan.distanceOriginId || 'hotel');
    setOriginDropOpen(false);
    setShowAddOriginForm(false);
    setFormPriority(plan.priority || null);
    setFormNeedsReservation(!!plan.needsReservation);
    // Pre-populate manual override fields from cache (only when already overridden)
    setEditWalkMins(walkMins);
    setEditTransitMins(transitMins);
    setShowAddForm(true);
  };

  const handleAddLinkRow = () => {
    const url = newLinkUrl.trim();
    if (!url) return;
    const normalized = withScheme(url);
    // An empty name stays empty — the URL is never copied into the name
    // field, so editing the link later shows the two values distinctly.
    setLinks(prev => [...prev, { label: newLinkLabel.trim(), url: normalized }]);
    setNewLinkLabel('');
    setNewLinkUrl('');
  };

  const handleRemoveLinkRow = async (idx) => {
    const link = links[idx];
    const ok = await confirm({
      title: 'מחיקת קישור',
      message: <>האם למחוק את הקישור <strong>{link?.label || prettyUrl(link?.url)}</strong>?</>,
      confirmText: 'מחק',
      cancelText: 'בטל',
      danger: true,
    });
    if (!ok) return;
    setLinks(prev => prev.filter((_, i) => i !== idx));
    // The edited row may have shifted or disappeared — drop the edit state.
    setEditingLinkIdx(null);
  };

  const handleStartEditLink = (idx) => {
    const link = links[idx] || {};
    setEditingLinkIdx(idx);
    setEditLinkLabel(link.label || '');
    setEditLinkUrl(link.url || '');
  };

  const handleCancelEditLink = () => {
    setEditingLinkIdx(null);
    setEditLinkLabel('');
    setEditLinkUrl('');
  };

  const handleSaveEditLink = () => {
    const url = editLinkUrl.trim();
    if (!url) return;
    const normalized = withScheme(url);
    setLinks(prev => prev.map((l, i) => (
      i === editingLinkIdx ? { label: editLinkLabel.trim(), url: normalized } : l
    )));
    handleCancelEditLink();
  };

  // The sheet measures its travel times itself (see the effect on
  // detailOriginKey), from whatever origin the place shows there.
  const openPlanDetail = (id) => {
    setDetailPlanId(id);
  };

  // Where the details sheet measures from, saved on the place for everyone
  // in the trip. Picking the card's own origin clears the choice.
  const chooseTravelFrom = (plan, key) => {
    if (!tripId) return;
    const base = plan.distanceOriginId || 'hotel';
    updateDoc(doc(db, 'trips', tripId, 'planning', plan.id), {
      travelFrom: key === base ? deleteField() : key,
    }).catch(err => console.error('Travel origin failed:', err));
  };

  const handleToggleVisited = async (plan) => {
    if (!tripId) return;
    const docRef = doc(db, 'trips', tripId, 'planning', plan.id);
    await updateDoc(docRef, {
      visited: !plan.visited
    });
  };

  const cyclePriority = async (plan) => {
    if (!tripId || !mayChange(plan)) return;
    const next = !plan.priority ? 'must' : plan.priority === 'must' ? 'optional' : null;
    await updateDoc(doc(db, 'trips', tripId, 'planning', plan.id), { priority: next });
  };

  const handleDelete = async (id) => {
    if (!tripId) return;
    const plan = plans.find(p => p.id === id);
    const ok = await confirm({
      title: 'מחיקת פריט תכנון',
      message: plan?.title ? <>האם למחוק את <strong>{plan.title}</strong>?</> : 'האם למחוק פריט תכנון זה?',
      confirmText: 'מחק',
      cancelText: 'בטל',
      danger: true,
    });
    if (!ok) return;
    await deleteDoc(doc(db, 'trips', tripId, 'planning', id));
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !tripId) return;

    // A time needs a day to belong to.
    if ((eventStartTime || endTimeOn) && !eventStartDate) { setWhenNeedsDate(true); return; }
    setWhenNeedsDate(false);
    const originId = formOriginId !== 'hotel' ? formOriginId : null;
    // Any place can carry a date and a time (`event`), and with "טווח" an
    // end as well (8.69.0; only events had one before). A last day that is
    // the first is no range. No date, no `event`, as before.
    const whenOf = (v) => v.eventStartDate ? {
      startDate: v.eventStartDate,
      endDate: (v.eventEndDate && v.eventEndDate !== v.eventStartDate && v.eventEndDate) || null,
      startTime: v.eventStartTime || null,
      endTime: v.eventEndTime || null,
    } : null;
    const eventData = whenOf({ eventStartDate, eventEndDate: endDateOn, eventStartTime, eventEndTime: endTimeOn });

    if (editingId) {
      // Only what the edit changed, against the form as it opened (src/lib/
      // changes.js): writing every field put back a partner's change, e.g. a
      // priority set while this form was open.
      const fieldsOf = (v) => ({
        title: (v.title || '').trim(),
        category: v.category,
        description: (v.description || '').trim(),
        address: (v.address || '').trim(),
        price: (v.price || '').trim() || 'חינם',
        links: v.links || [],
        distanceOriginId: v.originId && v.originId !== 'hotel' ? v.originId : null,
        event: whenOf(v),
        priority: v.priority || null,
        needsReservation: !!v.needsReservation,
      });
      const FORM_KEYS = ['title', 'category', 'description', 'address', 'price', 'links', 'newLinkLabel', 'newLinkUrl',
        'eventStartDate', 'eventEndDate', 'eventStartTime', 'eventEndTime', 'originId', 'priority', 'needsReservation',
        'walkMins', 'transitMins'];
      const opened = editBaseline ? Object.fromEntries(JSON.parse(editBaseline).map((x, i) => [FORM_KEYS[i], x])) : null;
      const updates = changedFields(opened ? fieldsOf(opened) : {}, fieldsOf({
        title, category, description, address, price, links,
        eventStartDate, eventEndDate: endDateOn, eventStartTime, eventEndTime: endTimeOn,
        originId: formOriginId, priority: formPriority, needsReservation: formNeedsReservation,
      }));
      // Resolved location depends on address / links / chosen origin — if any
      // changed, drop the persisted distances + coords so they recompute.
      const locationChanged = ['address', 'links', 'distanceOriginId'].some(k => k in updates);
      const manualChanged = !opened || opened.walkMins !== editWalkMins || opened.transitMins !== editTransitMins;

      // Build manual distance entry if the user entered values
      const cacheOriginKey = formOriginId; // 'hotel' or custom ID
      const walkMinsVal = editWalkMins !== '' ? parseInt(editWalkMins, 10) : null;
      const transitMinsVal = editTransitMins !== '' ? parseInt(editTransitMins, 10) : null;
      const hasManualTimes =
        (walkMinsVal !== null && !isNaN(walkMinsVal)) ||
        (transitMinsVal !== null && !isNaN(transitMinsVal));
      const manualEntry = hasManualTimes ? {
        ...(walkMinsVal !== null && !isNaN(walkMinsVal)
          ? { walk: { duration: minsToHebDuration(walkMinsVal), seconds: walkMinsVal * 60 } }
          : {}),
        ...(transitMinsVal !== null && !isNaN(transitMinsVal)
          ? { transit: { duration: minsToHebDuration(transitMinsVal), seconds: transitMinsVal * 60 } }
          : {}),
        manualOverride: true,
        fetchedAt: Date.now(),
      } : null;

      const docRef = doc(db, 'trips', tripId, 'planning', editingId);
      const write = {
        ...updates,
        ...(locationChanged
          ? { distances: manualEntry ? { [cacheOriginKey]: manualEntry } : {}, coords: null }
          : hasManualTimes && manualChanged
            ? { [`distances.${cacheOriginKey}`]: manualEntry }
            : {}),
      };
      if (Object.keys(write).length) {
        updateDoc(docRef, write).catch(err => console.error('Planning update error:', err));
      }

      if (locationChanged) {
        setDistanceCache(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(k => { if (k.startsWith(`${editingId}_`)) delete next[k]; });
          if (manualEntry) next[`${editingId}_${cacheOriginKey}`] = { ...manualEntry, loading: false };
          return next;
        });
        setCoordsCache(prev => {
          const next = { ...prev };
          delete next[editingId];
          return next;
        });
        // Editing the address or a link is exactly when the old numbers
        // stopped being true — queue a recompute instead of waiting for
        // someone to open the place. Manual overrides are left alone.
        if (!manualEntry) {
          setRecomputeIds(prev => (prev.includes(editingId) ? prev : [...prev, editingId]));
        }
      } else if (manualEntry) {
        setDistanceCache(prev => ({
          ...prev,
          [`${editingId}_${cacheOriginKey}`]: { ...manualEntry, loading: false },
        }));
      }
    } else {
      const id = 'plan-' + Date.now();
      const docRef = doc(db, 'trips', tripId, 'planning', id);
      setDoc(docRef, {
        title: title.trim(),
        category,
        description: description.trim(),
        address: address.trim(),
        price: price.trim() || 'חינם',
        links: links,
        visited: false,
        distanceOriginId: originId,
        event: eventData,
        priority: formPriority || null,
        needsReservation: formNeedsReservation,
        addedBy: currentUid || null,
        createdBy: currentUid || null,
        addedAt: new Date().toISOString(),
      }).catch(err => console.error('Planning add error:', err));
    }

    // Reset Form
    setTitle('');
    setDescription('');
    setAddress('');
    setPrice('');
    setLinks([]);
    setEditingLinkIdx(null);
    setEventStartDate('');
    setEventEndDate('');
    setEventStartTime('');
    setEventEndTime('');
    setWhenRange(false);
    setEditWalkMins('');
    setEditTransitMins('');
    setFormPriority(null);
    setFormNeedsReservation(false);
    setEditingId(null);
    setShowAddForm(false);
  };

  /* useCallback and not the ref-wrapper below: DayCard calls these while
     rendering, and a wrapper reading a ref that an effect fills would be
     undefined on the very first paint. They depend only on the category
     settings, which change rarely, so the memo still holds nearly always. */
  // A category's theme (src/lib/categoryTheme.js): its cards' texture and
  // ornament, and its colour when none was picked and it has no default.
  const getCategoryTheme = useCallback(
    (cat) => categoryTheme(cat, categorySettings[cat]?.emoji), [categorySettings]);
  const getCategoryColor = useCallback(
    (cat) => categorySettings[cat]?.color || DEFAULT_CATEGORY_COLORS[cat]
      || THEMES[categoryTheme(cat, categorySettings[cat]?.emoji)]?.hue || '#4F46E5', [categorySettings]);

  // Compact Hebrew "when" string for an event: "12.06" / "12.06–14.06 · 20:30-23:00"
  const formatEventWhen = (ev) => {
    if (!ev?.startDate) return '';
    const dm = (s) => { const [, m, d] = s.split('-'); return `${d}.${m}`; };
    let str = dm(ev.startDate);
    if (ev.endDate && ev.endDate !== ev.startDate) str += `–${dm(ev.endDate)}`;
    if (ev.startTime) str += ` · ${ev.startTime}`;
    if (ev.endTime) str += `-${ev.endTime}`;
    return str;
  };

  // Convert integer minutes → compact Hebrew string ("45 דק'" / "1 שע' 30 דק'")
  const minsToHebDuration = (m) => {
    if (!m || m <= 0) return '';
    const h = Math.floor(m / 60);
    const mins = m % 60;
    if (h === 0) return `${mins} דק'`;
    if (mins === 0) return `${h} שע'`;
    return `${h} שע' ${mins} דק'`;
  };

  const getCategoryIcon = useCallback((cat, size = 18) => {
    // An emoji typed for the category wins over its icon.
    const emoji = categorySettings[cat]?.emoji;
    if (emoji) return <span className="cat-emoji" style={{ fontSize: Math.round(size * 1.1) }} aria-hidden="true">{emoji}</span>;
    const iconKey = categorySettings[cat]?.iconKey;
    const Icon = iconKey ? ICON_MAP[iconKey] : null;
    if (Icon) return <Icon size={size} />;
    switch (cat) {
      case 'אטרקציות ודברים לעשות': return <Compass size={size} />;
      case 'מסעדות ומקומות אכילה': return <UtensilsCrossed size={size} />;
      case 'תחבורה ציבורית':       return <Train size={size} />;
      case 'מידע כללי וטיפים':     return <Info size={size} />;
      case EVENTS_CATEGORY:         return <Calendar size={size} />;
      default:                      return <MapPin size={size} />;
    }
  }, [categorySettings]);

  // Small caption above each link field, so "name" vs "address" is explicit.
  const linkFieldLabel = {
    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    marginBottom: 0, display: 'block',
  };

  const getPlanLocations = (plan) => {
    const locs = [];
    if (plan.address) {
      const isUrl = /^https?:\/\//i.test(plan.address);
      locs.push({
        label: plan.address,
        url: isUrl ? plan.address : `https://maps.google.com/?q=${encodeURIComponent(plan.address)}`,
      });
    }
    if (Array.isArray(plan.links)) {
      plan.links.forEach(link => locs.push({ label: link.label || prettyUrl(link.url), url: link.url }));
    }
    return locs;
  };

  // Cached travel times for a place, if they were already measured. Used for
  // the one-line card summary and for the details sheet header.
  const travelSummary = (plan) => {
    const originId = plan.distanceOriginId || 'hotel';
    const cache = distanceCache[`${plan.id}_${originId}`];
    if (!cache || cache.loading || cache.error) return { walk: null, transit: null };
    return {
      walk: cache.walk?.duration || null,
      transit: cache.transit?.duration || null,
    };
  };

  // Small caption above a section inside the details sheet.
  const sheetSectionLabel = {
    fontSize: 12, fontWeight: 800, color: 'var(--text-muted)',
  };

  // Travel time from the hotel / chosen origin, rendered inside the details
  // sheet. Lives here (rather than inline) so the card stays free of it.
  // Tapping it picks where to measure from (the owner's ask): the hotel,
  // or any other place on the list.
  const renderDistanceBlock = (plan) => {
    if (!hasGmapsKey()) return null;
    if (!hotelDetails && distanceOrigins.length === 0 && !tripDestination) return null;

    const originId = sheetOriginKey(plan);
    const cacheKey = `${plan.id}_${originId}`;
    const cache = distanceCache[cacheKey];
    const fromPlan = originPlanOf(originId);
    const customOrigin = distanceOrigins.find(o => o.id === originId) || null;
    // Label from what the SHOWN numbers were actually computed from, so a
    // city-centre result is never labelled "from hotel". Older cached entries
    // have no originKind — fall back to resolving the current origin.
    const kind = fromPlan ? 'place' : cache?.originKind || (
      (customOrigin && hasPreciseOrigin(null, customOrigin))
        ? 'custom'
        : (hasPreciseOrigin(hotelDetails, null) ? 'hotel' : 'city')
    );
    const cityName = (tripDestination || '').split(',')[0].trim();
    const cityLabel = cityName ? `ממרכז ${cityName}` : 'מהמיקום';
    const originLabel =
      kind === 'place' ? `מ־${fromPlan.title}`
      : kind === 'custom' ? (customOrigin?.name || cityLabel)
      : kind === 'hotel' ? (hotelDetails?.name ? `מהמלון (${hotelDetails.name})` : 'מהמלון')
      : cityLabel;

    const note = { fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 };
    let times;
    if (!cache || cache.loading) times = (
      <span style={{ ...note, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Loader2 size={13} className="spinning" />
        <span>מחשב מרחק...</span>
      </span>
    );
    else if (cache.offline) times = (
      <span style={note}>
        <WifiOff size={12} aria-hidden="true" style={{ verticalAlign: -2, marginInlineEnd: 4 }} />אין חיבור — זמני ההגעה יחושבו כשתהיה מחובר
      </span>
    );
    else if (cache.noLocation || cache.error || (!cache.walk && !cache.transit)) times = (
      <span style={note}>
        <MapPinOff size={12} aria-hidden="true" style={{ verticalAlign: -2, marginInlineEnd: 4 }} />
        {cache.noOrigin ? `לא נמצא המיקום של ${fromPlan?.title || 'המקום'}` : 'לא נמצא מיקום לחישוב זמן הגעה'}
      </span>
    );
    else times = (<>
      {cache.walk && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 800, color: 'var(--c-green)', background: 'var(--c-green-10)', padding: '4px 10px', borderRadius: 8 }}>
          <Footprints size={13} aria-hidden="true" /> {cache.walk.duration}
        </span>
      )}
      {cache.transit && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 800, color: 'var(--accent)', background: 'var(--p-10)', padding: '4px 10px', borderRadius: 8 }}>
          <Bus size={13} aria-hidden="true" /> {cache.transit.duration}
        </span>
      )}
    </>);
    const inner = (<>
      <span className="travel-from-head">
        <span>{originLabel}</span>
        {mayChange(plan) && <ChevronDown size={14} aria-hidden="true" />}
      </span>
      <span className="travel-from-times">{times}</span>
    </>);
    // The choice is saved on the place, so only who may change it can.
    if (!mayChange(plan)) return <div className="travel-from">{inner}</div>;
    return (
      <button
        type="button"
        className="travel-from"
        aria-haspopup="dialog"
        title="בחירת נקודת יציאה אחרת"
        onClick={() => { setOriginQuery(''); setOriginPickerFor(plan.id); }}
      >
        {inner}
      </button>
    );
  };

  const parseDurationMins = (str) => {
    if (!str) return Infinity;
    const h = Number((str.match(/(\d+)\s*שע'/) || [0, 0])[1]);
    const m = Number((str.match(/(\d+)\s*דק'/) || [0, 0])[1]);
    return h * 60 + m || Infinity;
  };

  // Everything that can hide a place from the pool, reset in one call —
  // the empty state offers it, and there is no other way back from a
  // combination of filters that leaves nothing on screen.
  const clearPoolFilters = () => {
    setSearchQuery('');
    setPickedCats([]);
    setMustOnly(false);
    setHideVisited(false);
    setDupOnly(false);
  };
  // Places that look like the same one: the same name, or the same link or
  // address (src/lib/placeDuplicates.js). Each is marked on its card.
  const dups = useMemo(() => findDuplicates(plans), [plans]);
  const showDups = dupOnly && dups.groups.length > 0;
  const dupNames = (id) => (dups.byId.get(id)?.group || [])
    .filter(x => x !== id).map(x => plans.find(p => p.id === x)?.title).filter(Boolean);

  // Filter plans + sort. A category no longer in the list (renamed or
  // deleted since it was picked) no longer filters anything.
  const picked = pickedCats.filter(c => categories.includes(c));
  // Search and "hide visited" — the filters the category menu doesn't set.
  const passesOthers = (plan) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = plan.title.toLowerCase().includes(q) ||
                          (plan.description || '').toLowerCase().includes(q) ||
                          (plan.address || '').toLowerCase().includes(q);
    // "Hide visited" never hides the card currently open in the sheet, so
    // marking a place as visited from there doesn't make it vanish mid-read.
    const matchesVisibility = !hideVisited || !plan.visited || plan.id === detailPlanId;
    return matchesSearch && matchesVisibility;
  };
  const eventTime = (p) => p.event?.startDate
    ? new Date(`${p.event.startDate}T${p.event.startTime || '00:00'}`).getTime()
    : Infinity;
  const filteredPlans = showDups ? plans.filter(p => dups.byId.has(p.id)) : plans
    .filter(plan => {
      const matchesCategory = (!picked.length || picked.includes(plan.category)) &&
        (!mustOnly || plan.priority === 'must');
      return matchesCategory && passesOthers(plan);
    })
    .sort((a, b) => {
      // When viewing the events category, order chronologically by date+time.
      if (picked.length === 1 && picked[0] === EVENTS_CATEGORY && sortBy === 'default') {
        return eventTime(a) - eventTime(b);
      }
      if (sortBy !== 'default') {
        const getTime = (plan, type) => {
          const originId = plan.distanceOriginId || 'hotel';
          const cache = distanceCache[`${plan.id}_${originId}`];
          const leg = type === 'walk' ? cache?.walk : cache?.transit;
          if (!leg) return Infinity;
          return typeof leg.seconds === 'number' ? leg.seconds : parseDurationMins(leg.duration) * 60;
        };
        if (sortBy === 'walk-asc')     return getTime(a, 'walk')    - getTime(b, 'walk');
        if (sortBy === 'walk-desc')    return getTime(b, 'walk')    - getTime(a, 'walk');
        if (sortBy === 'transit-asc')  return getTime(a, 'transit') - getTime(b, 'transit');
        if (sortBy === 'transit-desc') return getTime(b, 'transit') - getTime(a, 'transit');
      }
      // Default: visited items sink to the bottom
      if (!!a.visited === !!b.visited) return 0;
      return a.visited ? 1 : -1;
    });

  // The place shown in the details sheet, read from the live list so the
  // sheet updates as Firestore pushes changes (visited, priority, edits).
  const detailPlan = detailPlanId ? plans.find(p => p.id === detailPlanId) || null : null;

  // Active card layout (density + column count).
  const LO = PLAN_LAYOUTS[planLayout] || PLAN_LAYOUTS.stub;
  // Which days of the schedule each place is on, in the days' order.
  const plannedDays = useMemo(() => {
    const byPlace = new Map();
    days.forEach(d => (d.activities || []).forEach(a => {
      if (!a.placeId) return;
      const list = byPlace.get(a.placeId) || [];
      if (!list.includes(d)) list.push(d);
      byPlace.set(a.placeId, list);
    }));
    return byPlace;
  }, [days]);
  // Small enough that two tiles still fit on a ~360px phone; auto-fill adds
  // more columns on wider screens.
  const gridMinCol = 148;
  const bindItemRef = (id) => (node) => {
    if (node) itemRefs.current.set(id, node);
    else itemRefs.current.delete(id);
  };
  const planListStyle = LO.columns > 1 ? {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinCol}px, 1fr))`,
    gap: LO.listGap,
    // Tiles in the same row share a height, so a two-line name next to
    // a one-line name doesn't leave a ragged edge.
    alignItems: 'stretch',
  } : {
    display: 'flex', flexDirection: 'column', gap: LO.listGap,
  };

  // Proximity-grouping view: flatten filteredPlans into a single render list
  // interleaved with area-header sentinels ({ __header: true }). Places without
  // resolved coordinates land in a trailing "ללא מיקום" group.
  const locatedCount = filteredPlans.filter(p => coordsCache[p.id]).length;
  let renderItems = filteredPlans;
  // Sections by category: the header stays on top while its places scroll,
  // so the cards leave the category out.
  const catGrouped = !showDups && groupBy !== 'area' && (groupBy === 'category' || picked.length >= 2);
  if (showDups) {
    // One section per set of duplicates, so they sit together.
    const byId = new Map(plans.map(p => [p.id, p]));
    renderItems = [];
    dups.groups.forEach((group, i) => {
      const anyName = group.some(id => dups.byId.get(id).name);
      const anyPlace = group.some(id => dups.byId.get(id).place);
      const why = anyName && anyPlace ? 'אותו שם או מיקום' : anyName ? 'אותו שם' : 'אותו מיקום';
      renderItems.push({ __header: true, id: `__dup${i}`, label: `כפילות ${i + 1} · ${why}`, count: group.length, dup: true });
      if (!collapsedAreas[`__dup${i}`]) group.forEach(id => byId.has(id) && renderItems.push(byId.get(id)));
    });
  } else if (groupBy === 'area') {
    const located = filteredPlans
      .filter(p => coordsCache[p.id])
      .map(p => ({ ...p, coords: coordsCache[p.id] }));
    const unlocated = filteredPlans.filter(p => !coordsCache[p.id]);
    const clusters = clusterByProximity(located, PROXIMITY_THRESHOLD_M)
      .sort((a, b) => b.length - a.length);
    renderItems = [];
    clusters.forEach((cluster, i) => {
      const headerId = `__h${i}`;
      renderItems.push({ __header: true, id: headerId, label: `אזור ${i + 1}`, count: cluster.length });
      if (!collapsedAreas[headerId]) cluster.forEach(p => renderItems.push(p));
    });
    if (unlocated.length) {
      renderItems.push({ __header: true, id: '__hx', label: 'ללא מיקום', count: unlocated.length });
      if (!collapsedAreas['__hx']) unlocated.forEach(p => renderItems.push(p));
    }
  } else if (groupBy === 'category' || picked.length >= 2) {
    // One section per category, in the order categories are configured,
    // so a long mixed list reads as a handful of short lists. Picking two
    // or more categories in the filter always shows them this way.
    const byCat = new Map();
    filteredPlans.forEach(p => {
      const cat = p.category || 'ללא קטגוריה';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(p);
    });
    const ordered = [
      ...categories.filter(c => byCat.has(c)),
      ...[...byCat.keys()].filter(c => !categories.includes(c)),
    ];
    renderItems = [];
    ordered.forEach(cat => {
      const items = byCat.get(cat) || [];
      // Events read by date in their own section too.
      if (cat === EVENTS_CATEGORY && sortBy === 'default') items.sort((a, b) => eventTime(a) - eventTime(b));
      // A search shows every match, folded or not.
      const folded = !searchQuery.trim() && foldedCats.has(cat);
      renderItems.push({
        __header: true, id: `__cat:${cat}`, label: cat, count: items.length,
        category: cat, folded,
      });
      if (!folded) items.forEach(p => renderItems.push(p));
    });
  }

  // A category's header sticks to the top, with the toolbar under it.
  // Stuck, it carries the page's background (data-stuck, index.css), the
  // texture lined up with the page's own (--tex-at): measured here, as
  // the header's offset from the frame the page texture is drawn on.
  const headsStick = catGrouped && filteredPlans.length > 0;
  const poolListRef = useRef(null);
  const markStuck = useCallback(() => {
    const list = poolListRef.current;
    const scroller = list?.closest('.app-content');
    const frame = list?.closest('.app-container');
    if (!scroller || !frame) return;
    const top = scroller.getBoundingClientRect().top;
    const f = frame.getBoundingClientRect();
    list.querySelectorAll('.plan-group-head.stuck').forEach(h => {
      const r = h.getBoundingClientRect();
      if (r.top <= top + 0.5 && r.bottom > top) {
        h.dataset.stuck = '';
        h.style.setProperty('--tex-at', `${f.left - r.left}px ${f.top - r.top}px`);
      } else if ('stuck' in h.dataset) {
        delete h.dataset.stuck;
      }
    });
  }, []);
  useEffect(() => { markStuck(); });
  useEffect(() => {
    if (subTab !== 'pool' || !headsStick) return undefined;
    const scroller = poolListRef.current?.closest('.app-content');
    if (!scroller) return undefined;
    let raf = 0;
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; markStuck(); });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [subTab, headsStick, markStuck]);

  /* ══════════════════════════════════════════════════════════
     DAILY PLANNER OPERATIONS
     ══════════════════════════════════════════════════════════ */
  /* Stable handles for everything DayCard is given.
   *
   * React.memo compares props by reference, so a plain arrow re-created
   * each render would make every day re-render anyway and the memo would
   * be decoration. useCallback would work but needs a correct dependency
   * list for each of eight functions, and a wrong one is a stale closure
   * — a bug that shows up as an action quietly using yesterday's state.
   * This keeps the latest implementations in a ref and hands out wrappers
   * created once: permanently stable, never stale, no dependency lists.
   */
  const latestFns = useRef({});
  const dayFns = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs -- the wrapper reads the ref
    // when the handler fires, never while rendering; the two helpers that
    // *are* called during render are useCallback'd above instead.
    const call = (name) => (...args) => latestFns.current[name](...args);
    return {
      handleSaveDayTitle: call('handleSaveDayTitle'),
      handleDeleteDay: call('handleDeleteDay'),
      handleOpenAddActivity: call('handleOpenAddActivity'),
      handleStartEditActivity: call('handleStartEditActivity'),
      handleDeleteActivity: call('handleDeleteActivity'),
      moveActivity: call('moveActivity'),
    };
  }, []);

  /* Refreshed after every render, read only when a handler fires — so a
     wrapper never calls a stale implementation. In an effect rather than
     during render: writing a ref while rendering is what the rules-of-hooks
     lint flags, and events can only run after the effect anyway. */
  useEffect(() => {
    latestFns.current = {
      handleSaveDayTitle, handleDeleteDay, handleOpenAddActivity,
      handleStartEditActivity, handleDeleteActivity, moveActivity,
    };
  });

  const handleAddDay = () => {
    if (!tripId) return;
    const nextDayNum = days.length + 1;
    const dayId = 'day-' + Date.now();
    setDoc(doc(db, 'trips', tripId, 'days', dayId), {
      title: `יום ${nextDayNum}`,
      // After the last one, whatever the count: a day deleted, or one a partner
      // added offline, would otherwise give two days the same place.
      order: Math.max(0, ...days.map(d => Number(d.order) || 0)) + 1,
      activities: []
    }).catch(err => console.error('Add day error:', err));
    // The write is fire-and-forget so this works offline too: the day
    // arrives from the local cache and the effect below takes us to it.
    setArrivedDayId(dayId);
  };

  // Scroll to the day that was just added, once it has actually rendered.
  useEffect(() => {
    if (!arrivedDayId) return undefined;
    const node = dayNodes.current.get(arrivedDayId);
    if (!node) return undefined;   // not in the snapshot yet; runs again when it is
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setArrivedDayId(null), 2000);   // matches .highlight-pulse
    return () => clearTimeout(t);
  }, [arrivedDayId, days]);

  /* "ימים מסונכרנים עם הטיסה" is a confirmation, not a status.
   *
   * It used to render from the persisted comparison between the flight
   * dates and `plannerDaysFromFlight`, which is true from the moment you
   * sync until the dates change — so it sat there permanently, and a
   * message that never leaves stops being read. It now appears only right
   * after a sync actually runs, and clears itself. What it was standing
   * in for is already on the button beside it, which reads "ייצר" before
   * a sync and "עדכן" after one.
   */
  const [justSynced, setJustSynced] = useState(false);
  const syncedTimer = useRef(null);
  useEffect(() => () => clearTimeout(syncedTimer.current), []);

  const flashSynced = () => {
    clearTimeout(syncedTimer.current);
    setJustSynced(true);
    syncedTimer.current = setTimeout(() => setJustSynced(false), 4000);
  };

  const handleInitDaysFromFlight = async () => {
    if (!tripId || !tripFlightDates.out || !tripFlightDates.ret) return;
    if (days.length > 0) {
      const ok = await confirm({
        title: 'החלפת ימי הטיול',
        message: 'כבר קיימים ימים מתוכננים. האם למחוק אותם וליצור מחדש לפי תאריכי הטיסה?',
        confirmText: 'כן, החלף',
        cancelText: 'ביטול',
        danger: true,
      });
      if (!ok) return;
    }
    const start = localDay(String(tripFlightDates.out).slice(0, 10));
    const end = localDay(String(tripFlightDates.ret).slice(0, 10));
    if (!start || !end) return;
    const maxDays = 30;
    // One batch, not awaited: the old days go and the new ones come in the
    // same write. Deleting first and awaiting it lost the days when the app
    // was closed offline in between.
    const batch = writeBatch(db);
    days.forEach(d => batch.delete(doc(db, 'trips', tripId, 'days', d.id)));
    let dayNum = 1;
    const cur = new Date(start);
    while (cur <= end && dayNum <= maxDays) {
      const id = 'day-' + Date.now() + '-' + dayNum;
      batch.set(doc(db, 'trips', tripId, 'days', id), {
        title: `יום ${dayNum}`,
        date: isoDay(cur),
        order: dayNum,
        activities: [],
      });
      cur.setDate(cur.getDate() + 1);
      dayNum++;
    }
    // Record which flight dates were used so we can detect stale state
    batch.update(doc(db, 'trips', tripId), {
      plannerDaysFromFlight: { out: tripFlightDates.out, ret: tripFlightDates.ret },
    });
    batch.commit().catch(err => console.error('Make days failed:', err));
    flashSynced();
  };

  // When the connection comes back, drop the "offline" markers and bump the
  // epoch so anything that couldn't be measured is retried automatically.
  useEffect(() => {
    const onBackOnline = () => {
      setOnline(true);
      setDistanceCache(prev => {
        const next = {};
        let changed = false;
        for (const [k, v] of Object.entries(prev)) {
          if (v?.offline) { changed = true; continue; }
          next[k] = v;
        }
        return changed ? next : prev;
      });
      setNetEpoch(e => e + 1);
    };
    const onWentOffline = () => setOnline(false);
    window.addEventListener('online', onBackOnline);
    window.addEventListener('offline', onWentOffline);
    return () => {
      window.removeEventListener('online', onBackOnline);
      window.removeEventListener('offline', onWentOffline);
    };
  }, []);

  // Recompute the travel times of a place that was just edited. Runs off the
  // `plans` snapshot so it fires in a fresh render — by then the cleared
  // caches are visible and the fetch actually re-measures instead of
  // short-circuiting on the previous result.
  useEffect(() => {
    if (recomputeIds.length === 0) return;
    if (!hasGmapsKey()) { setRecomputeIds([]); return; }
    const done = [];
    recomputeIds.forEach(id => {
      const plan = plans.find(p => p.id === id);
      if (!plan) return;
      fetchPlanDistances(plan);
      done.push(id);
    });
    if (done.length) setRecomputeIds(prev => prev.filter(id => !done.includes(id)));
  }, [plans, recomputeIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-fetch travel times for all day-planner activities that link to a saved place
  useEffect(() => {
    if (!hasGmapsKey() || (!hotelDetails && !tripDestination)) return;
    const allPlaceIds = new Set(
      days.flatMap(d => (d.activities || []).map(a => a.placeId).filter(Boolean))
    );
    allPlaceIds.forEach(placeId => {
      const plan = plans.find(p => p.id === placeId);
      // No cache guard here: fetchPlanDistances() cheaply no-ops when the
      // cached result already matches the current origin, and re-fetches
      // when the hotel address changed underneath it.
      if (plan) fetchPlanDistances(plan);
    });
  }, [days, plans, hotelDetails, tripDestination, netEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // The open details sheet: measure from its origin when it opens, when
  // another origin is picked there, and again once back online.
  const detailOriginKey = detailPlan ? sheetOriginKey(detailPlan) : null;
  useEffect(() => {
    if (!detailPlan || !detailOriginKey) return;
    const t = setTimeout(() => fetchPlanDistances(detailPlan, detailOriginKey), 0);
    return () => clearTimeout(t);
  }, [detailPlanId, detailOriginKey, hotelDetails, tripDestination, netEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  const daySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const handleDayDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = days.findIndex(d => d.id === active.id);
    const newIdx = days.findIndex(d => d.id === over.id);
    const reordered = arrayMove(days, oldIdx, newIdx);
    // Both title and date are positional anchors — only activities travel.
    // They travel with their own document, so the array is not written:
    // writing it back from this phone's view would erase a partner's change.
    const positionalDates  = days.map(d => d.date  ?? null);
    const positionalTitles = days.map(d => d.title ?? '');
    const batch = writeBatch(db);
    reordered.forEach((day, idx) => {
      batch.update(doc(db, 'trips', tripId, 'days', day.id), {
        order:      idx + 1,
        date:       positionalDates[idx],
        title:      positionalTitles[idx],
      });
    });
    await batch.commit();
  };

  const handleSaveDayTitle = (dayId, newTitle) => {
    if (!tripId || !newTitle.trim()) return;
    setEditingDayId(null);
    updateDoc(doc(db, 'trips', tripId, 'days', dayId), { title: newTitle.trim() })
      .catch(err => console.error('Save day title error:', err));
  };

  const handleDeleteDay = async (dayId) => {
    if (!tripId) return;
    const day = days.find(d => d.id === dayId);
    const ok = await confirm({
      title: 'מחיקת יום טיול',
      message: <>האם למחוק את <strong>{day?.title || 'היום'}</strong> וכל הפעילויות שבו?</>,
      confirmText: 'מחק יום',
      cancelText: 'בטל',
      danger: true,
    });
    if (!ok) return;
    await deleteDoc(doc(db, 'trips', tripId, 'days', dayId));
  };

  const handleOpenAddActivity = (dayId) => {
    setSelectedDayId(dayId);
    setEditingActivityId(null);
    setSavedPlaceSelections([{ categoryFilter: '', placeId: '', timeLabel: '' }]);
    setActivityTitle('');
    setActivityTimeLabel('');
    setActivityAddress('');
    setActivityDescription('');
    setActivityCategory('אטרקציות ודברים לעשות');
    setShowActivityForm(true);
  };

  const activityFormDirty = () =>
    !!(activityTitle.trim() || activityTimeLabel.trim() ||
       activityAddress.trim() || activityDescription.trim() ||
       savedPlaceSelections.some(s => s.placeId));

  const closeActivityForm = () => {
    setShowActivityForm(false);
    setEditingActivityId(null);
  };

  const handleStartEditActivity = (dayId, act) => {
    setSelectedDayId(dayId);
    setEditingActivityId(act.id);
    if (act.placeId) {
      const place = plans.find(p => p.id === act.placeId);
      setSavedPlaceSelections([{ categoryFilter: place?.category || '', placeId: act.placeId, timeLabel: act.timeLabel || '' }]);
    } else {
      setSavedPlaceSelections([{ categoryFilter: '', placeId: '', timeLabel: '' }]);
    }
    setActivityTitle(act.title);
    setActivityTimeLabel(act.timeLabel || '');
    setActivityAddress(act.address || '');
    setActivityDescription(act.description || '');
    setActivityCategory(act.category || 'אטרקציות ודברים לעשות');
    setShowActivityForm(true);
  };

  const addSavedPlaceSelection = () =>
    setSavedPlaceSelections(prev => [...prev, { categoryFilter: '', placeId: '', timeLabel: '' }]);

  const removeSavedPlaceSelection = (idx) =>
    setSavedPlaceSelections(prev => prev.filter((_, i) => i !== idx));

  const updateSavedPlaceSelection = (idx, field, value) =>
    setSavedPlaceSelections(prev => prev.map((sel, i) => {
      if (i !== idx) return sel;
      const updated = { ...sel, [field]: value };
      if (field === 'categoryFilter') updated.placeId = '';
      return updated;
    }));

  const handleDeleteActivity = async (dayId, activityId) => {
    if (!tripId) return;
    const day = days.find(d => d.id === dayId);
    if (!day) return;
    const act = (day.activities || []).find(a => a.id === activityId);
    const ok = await confirm({
      title: 'מחיקת פעילות',
      message: act?.title ? <>האם למחוק את <strong>{act.title}</strong>?</> : 'האם למחוק פעילות זו?',
      confirmText: 'מחק',
      cancelText: 'בטל',
      danger: true,
    });
    if (!ok) return;

    removeActivity(db, tripId, dayId, day.rawActivities, activityId, !canEdit)
      .catch(err => console.error('Activity delete error:', err));
  };

  // When activities render grouped by time label, the visual neighbor may not
  // be the array neighbor — `swapWithId` names the exact activity to swap with.
  const moveActivity = (dayId, activityId, direction, swapWithId = null) => {
    if (!tripId) return;
    const day = days.find(d => d.id === dayId);
    if (!day) return;

    const list = day.activities;
    const idx = list.findIndex(act => act.id === activityId);
    if (idx === -1) return;
    const other = swapWithId != null ? swapWithId : list[idx + direction]?.id;
    if (other == null) return;

    swapActivities(db, tripId, dayId, day.rawActivities, activityId, other)
      .catch(err => console.error('Activity move error:', err));
  };

  const handleActivitySubmit = async (e) => {
    e.preventDefault();
    if (!tripId || !selectedDayId) return;

    const hasPlaceSelections = savedPlaceSelections.some(s => s.placeId);
    const hasManualTitle = activityTitle.trim().length > 0;
    if (!hasPlaceSelections && !hasManualTitle) return;

    const day = days.find(d => d.id === selectedDayId);
    if (!day) return;

    let write;
    if (editingActivityId) {
      const firstSel = savedPlaceSelections[0];
      const place = firstSel?.placeId ? plans.find(p => p.id === firstSel.placeId) : null;
      const activityObj = {
        id: editingActivityId,
        title: place ? place.title : activityTitle.trim(),
        timeLabel: firstSel?.placeId ? (firstSel.timeLabel || '') : activityTimeLabel.trim(),
        placeId: firstSel?.placeId || null,
        address: place ? (place.address || '') : activityAddress.trim(),
        description: activityDescription.trim(),
        category: place ? place.category : activityCategory,
        // Whose it is stays with it (firestore.rules).
        createdBy: (day.activities || []).find(a => a.id === editingActivityId)?.createdBy || null,
      };
      write = () => updateActivity(db, tripId, selectedDayId, day.rawActivities, activityObj, !canEdit);
    } else {
      const added = [];
      for (const sel of savedPlaceSelections) {
        if (sel.placeId) {
          const place = plans.find(p => p.id === sel.placeId);
          if (place) {
            added.push({
              id: 'act-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
              title: place.title,
              timeLabel: sel.timeLabel || '',
              placeId: place.id,
              address: place.address || '',
              description: place.description || '',
              category: place.category,
              createdBy: currentUid || null,
            });
          }
        }
      }
      if (hasManualTitle) {
        added.push({
          id: 'act-' + Date.now(),
          title: activityTitle.trim(),
          timeLabel: activityTimeLabel.trim(),
          placeId: null,
          address: activityAddress.trim(),
          description: activityDescription.trim(),
          category: activityCategory,
          createdBy: currentUid || null,
        });
      }
      write = () => addActivities(db, tripId, selectedDayId, day.rawActivities, added);
    }

    setShowActivityForm(false);
    setEditingActivityId(null);
    write().catch(err => console.error('Activity save error:', err));
  };

  if (loading) {
    return <Skeleton rows={6} label="טוען תוכניות טיול" />;
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* Sub-tab switch, with the day-list view control beside it.
          Labels are short so all three fit one line at 400px: with the
          long ones the pill lost enough width that "אטרקציות ומקומות"
          broke onto a second row and the whole control grew a line. The
          icons carry the rest of the meaning. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="subtab-switch" role="tablist">
          <span className="subtab-indicator" style={{ '--sub-i': subTab === 'daily' ? 1 : 0 }} aria-hidden="true" />
          <button
            role="tab"
            aria-selected={subTab === 'pool'}
            className="subtab-btn"
            onClick={() => setSubTab('pool')}
          >
            <Compass size={16} />
            <span>מקומות</span>
          </button>
          <button
            role="tab"
            aria-selected={subTab === 'daily'}
            className="subtab-btn"
            onClick={() => setSubTab('daily')}
          >
            <Calendar size={16} />
            <span>לוח זמנים</span>
          </button>
        </div>
        {subTab === 'daily' && days.length > 0 && (
          <button
            type="button"
            onClick={() => setDayLayout(l => (l === 'summary' ? 'full' : 'summary'))}
            className="btn-secondary"
            style={{ padding: 0, width: 42, minWidth: 42, height: 42, minHeight: 42, flexShrink: 0 }}
            title={dayLayout === 'summary' ? 'תצוגה מלאה' : 'תצוגת סיכום'}
            aria-label={dayLayout === 'summary' ? 'תצוגה מלאה' : 'תצוגת סיכום'}
            aria-pressed={dayLayout === 'summary'}
          >
            {dayLayout === 'summary' ? <LayoutList size={17} /> : <Rows3 size={17} />}
          </button>
        )}
      </div>

      {/* Render sub-tab content */}
      {subTab === 'pool' ? (
        <>
          {/* Adding a place is a whole-tab action, so it gets the floating
              button. Adding an activity in the daily sub-tab is not — it
              belongs to one specific day, and stays on that day's card. */}
          {canAdd && <Fab label="יעד חדש" onClick={handleOpenAdd} />}

          {/* Add/Edit Plan Slide-Up Modal */}
          {showAddForm && (
            <Sheet
              title={editingId ? 'עריכת פריט תכנון' : 'הוספת יעד / אטרקציה חדשה'}
              onClose={closePlanForm}
              dirty={planFormDirty()}
            >
              {({ cancel }) => (
                <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  <div className="form-group">
                    <label>שם המקום/הפעילות *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={title} 
                      onChange={(e) => setTitle(e.target.value)} 
                      required 
                      placeholder="למשל: תצפית שקיעה בגבעה"
                    />
                  </div>

                  <CustomDropdown
                    label="קטגוריה"
                    value={category}
                    onChange={setCategory}
                    options={categories}
                    addable
                    addLabel="הוסף קטגוריה חדשה"
                    onCommit={(newCat) => {
                      categoryWrite(() => addCategory(db, tripId, newCat));
                    }}
                  />

                  {/* Priority selector */}
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Star size={13} className="star-must" />
                      עדיפות
                    </label>
                    <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 14, background: 'var(--surface-2)' }}>
                      {[
                        { value: null,       label: 'לא מוגדר',      icon: null },
                        { value: 'must',     label: 'חובה',          icon: <Star size={13} className="star-must" /> },
                        { value: 'optional', label: 'אם ישאר זמן',   icon: <Clock size={13} /> },
                      ].map(opt => {
                        const active = formPriority === opt.value;
                        return (
                          <button
                            key={String(opt.value)}
                            type="button"
                            onClick={() => setFormPriority(opt.value)}
                            style={{
                              flex: 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                              minHeight: 40,
                              padding: '8px 4px',
                              borderRadius: 11,
                              border: 'none',
                              // Segmented (Payments-2026): the choice is white and raised.
                              background: active ? 'var(--card-bg-solid)' : 'transparent',
                              boxShadow: active ? 'var(--shadow-sm)' : 'none',
                              color: active ? 'var(--text)' : 'var(--text-muted)',
                              fontFamily: 'var(--font-hebrew)',
                              fontSize: 13, fontWeight: 800,
                              cursor: 'pointer', transition: 'background-color 0.2s ease, color 0.2s ease',
                            }}
                          >
                            {opt.icon}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Needs advance booking — optional; when on, the card says so */}
                  <button
                    type="button"
                    onClick={() => setFormNeedsReservation(v => !v)}
                    aria-pressed={formNeedsReservation}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      width: '100%', padding: '12px 14px', borderRadius: 16,
                      border: 'none',
                      background: formNeedsReservation ? 'var(--c-red-8)' : 'var(--surface-2)',
                      color: 'var(--text)',
                      fontFamily: 'var(--font-hebrew)', textAlign: 'right',
                      cursor: 'pointer', transition: 'background-color 0.2s ease',
                    }}
                  >
                    <CalendarCheck size={20} style={{ flexShrink: 0, color: formNeedsReservation ? 'var(--c-red)' : 'var(--text-muted)' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>צריך לסגור / להזמין מראש</span>
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 600, opacity: 0.8, marginTop: 1 }}>
                        {formNeedsReservation ? 'יסומן על כרטיס המקום' : 'לא חובה – לחצו לסימון'}
                      </span>
                    </span>
                    {/* A switch rather than a checkbox: it is an on/off setting. */}
                    <span className={`switch${formNeedsReservation ? ' on danger' : ''}`} aria-hidden="true"><i /></span>
                  </button>

                  {/* When: a date and a time, for any place (8.66.0). "טווח"
                      turns both into ranges, a first and a last day and a
                      start and an end time (8.69.0). Optional; a place with
                      a date is shown as a fixed appointment on its card. */}
                  {(() => {
                    const isEv = category === EVENTS_CATEGORY;
                    const any = eventStartDate || eventStartTime || endDateOn || endTimeOn;
                    return (
                      <div className="place-when" data-set={eventStartDate ? 'true' : undefined}>
                        <div className="place-when-head">
                          <Calendar size={14} aria-hidden="true" />
                          <span>{isEv ? 'מתי האירוע?' : 'מתי? (לא חובה)'}</span>
                          {any && (
                            <button type="button" className="btn-x" aria-label="בלי תאריך ושעה" title="בלי תאריך ושעה"
                              onClick={() => { setEventStartDate(''); setEventStartTime(''); setEventEndDate(''); setEventEndTime(''); }}>
                              <X size={15} />
                            </button>
                          )}
                          <button type="button" role="switch" aria-checked={whenRange} className="place-when-range"
                            onClick={() => setWhenRange(v => !v)}>
                            <span>טווח</span>
                            <span className={`switch${whenRange ? ' on' : ''}`} aria-hidden="true"><i /></span>
                          </button>
                        </div>
                        {!isEv && !any && (
                          <span className="place-when-hint">לסיור, הופעה או שולחן בתאריך ובשעה מסוימים. יוצג בבירור על הכרטיס.</span>
                        )}
                        {whenRange ? (<>
                          <CustomDateRangePicker label="תאריכים" start={eventStartDate} end={eventEndDate}
                            onChange={(a, b) => { setEventStartDate(a); setEventEndDate(b); }} />
                          <CustomTimeRangePicker label="שעות (לא חובה)" start={eventStartTime} end={eventEndTime}
                            onChange={(a, b) => { setEventStartTime(a); setEventEndTime(b); }} />
                        </>) : (
                          <div className="row-2" style={{ gap: 10 }}>
                            <CustomDatePicker label="תאריך" value={eventStartDate} onChange={setEventStartDate} />
                            <CustomTimePicker label="שעה (לא חובה)" value={eventStartTime} onChange={setEventStartTime} />
                          </div>
                        )}
                        {whenNeedsDate && (eventStartTime || endTimeOn) && !eventStartDate && (
                          <span className="place-when-error" role="alert">בחרו תאריך לשעה הזאת</span>
                        )}
                      </div>
                    );
                  })()}

                  <div className="form-group">
                    <label>כתובת / מיקום</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="כתובת או קישור למפה"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>

                  {/* Free-form links — each row is a NAME (optional, shown
                      on the card) plus the ADDRESS itself. The two fields are
                      labelled explicitly so it is never ambiguous which is
                      which, and an empty name is left empty rather than being
                      filled with the URL. */}
                  <div className="form-group">
                    <label>קישורים נוספים</label>
                    {links.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                        {links.map((link, idx) => (
                          editingLinkIdx === idx ? (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'var(--card-bg-solid)', borderRadius: 16, border: '1.5px solid var(--accent)' }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>עריכת קישור</span>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={linkFieldLabel}>שם הקישור (אופציונלי)</label>
                                <input
                                  type="text"
                                  className="form-control"
                                  placeholder="למשל: אתר רשמי, פוסט בפייסבוק"
                                  value={editLinkLabel}
                                  onChange={(e) => setEditLinkLabel(e.target.value)}
                                  style={{ fontSize: 13 }}
                                />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={linkFieldLabel}>כתובת הקישור (URL)</label>
                                <input
                                  type="text"
                                  inputMode="url"
                                  className="form-control"
                                  placeholder="https://..."
                                  value={editLinkUrl}
                                  onChange={(e) => setEditLinkUrl(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEditLink(); } }}
                                  dir="ltr"
                                  style={{ fontSize: 13, textAlign: 'left' }}
                                />
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={handleSaveEditLink}
                                  disabled={!editLinkUrl.trim()}
                                  className="btn-primary"
                                  style={{ flex: 1, minHeight: 34, fontSize: 12, padding: '6px', gap: 5, opacity: editLinkUrl.trim() ? 1 : 0.5 }}
                                >
                                  <Check size={13} />
                                  <span>שמור</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEditLink}
                                  className="btn-secondary"
                                  style={{ flex: 1, minHeight: 34, fontSize: 12, padding: '6px' }}
                                >
                                  ביטול
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 16, border: 'none' }}>
                              <Link2 size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: link.label ? 'var(--primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {link.label || 'ללא שם'}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="ltr">{prettyUrl(link.url)}</div>
                              </div>
                              <button type="button" onClick={() => handleStartEditLink(idx)} title="ערוך קישור" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 4, display: 'flex', flexShrink: 0 }}>
                                <Pencil size={14} />
                              </button>
                              <button type="button" className="btn-x danger" aria-label="מחק קישור" title="מחק קישור" onClick={() => handleRemoveLinkRow(idx)}>
                                <X size={16} />
                              </button>
                            </div>
                          )
                        ))}
                      </div>
                    )}

                    {/* New-link row — stacked, each field under its own label */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 16, border: 'none' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={linkFieldLabel}>שם הקישור (אופציונלי)</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="למשל: אתר רשמי, פוסט בפייסבוק"
                          value={newLinkLabel}
                          onChange={(e) => setNewLinkLabel(e.target.value)}
                          style={{ fontSize: 13 }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={linkFieldLabel}>כתובת הקישור (URL)</label>
                        <input
                          type="text"
                          inputMode="url"
                          className="form-control"
                          placeholder="https://..."
                          value={newLinkUrl}
                          onChange={(e) => setNewLinkUrl(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLinkRow(); } }}
                          dir="ltr"
                          style={{ fontSize: 13, textAlign: 'left' }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddLinkRow}
                        disabled={!newLinkUrl.trim()}
                        className="btn-secondary"
                        style={{ width: '100%', opacity: newLinkUrl.trim() ? 1 : 0.5 }}
                      >
                        <Plus size={14} />
                        <span>הוסף קישור</span>
                      </button>
                    </div>
                  </div>

                  {/* Distance origin selector */}
                  <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Hotel size={14} style={{ color: 'var(--accent)' }} />
                        בדיקת זמנים מ...
                      </label>
                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          onClick={() => setOriginDropOpen(o => !o)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px', borderRadius: 'var(--radius-md)',
                            border: '1.5px solid var(--p-22)', background: 'var(--p-4)',
                            cursor: 'pointer', fontFamily: 'var(--font-hebrew)', fontSize: 14, fontWeight: 700,
                            color: 'var(--primary)',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Hotel size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                            {formOriginId === 'hotel'
                              ? (hotelDetails?.name ? `המלון — ${hotelDetails.name}` : 'המלון')
                              : (distanceOrigins.find(o => o.id === formOriginId)?.name || 'מיקום לא ידוע')}
                          </span>
                          <ChevronDown size={16} style={{ color: 'var(--text-muted)', transform: originDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                        </button>

                        {originDropOpen && (
                          <div style={{
                            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
                            background: 'var(--surface)', border: '1.5px solid var(--p-15)', borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
                          }}>
                            {/* Hotel option */}
                            <button
                              type="button"
                              onClick={() => { setFormOriginId('hotel'); setOriginDropOpen(false); }}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                padding: '11px 14px', border: 'none', background: formOriginId === 'hotel' ? 'var(--p-8)' : 'var(--surface)',
                                cursor: 'pointer', fontFamily: 'var(--font-hebrew)', fontSize: 14, fontWeight: 700,
                                color: formOriginId === 'hotel' ? 'var(--accent)' : 'var(--primary)',
                                borderBottom: '1px solid var(--ink-6)',
                              }}
                            >
                              <Hotel size={15} style={{ flexShrink: 0 }} />
                              <span style={{ flex: 1, textAlign: 'right' }}>
                                {hotelDetails?.name ? `המלון — ${hotelDetails.name}` : 'המלון'}
                              </span>
                              {formOriginId === 'hotel' && <Check size={14} />}
                            </button>

                            {/* Custom origins */}
                            {distanceOrigins.map(origin => (
                              <div key={origin.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--ink-4)' }}>
                                <button
                                  type="button"
                                  onClick={() => { setFormOriginId(origin.id); setOriginDropOpen(false); }}
                                  style={{
                                    flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '11px 14px', border: 'none', background: formOriginId === origin.id ? 'var(--p-8)' : 'var(--surface)',
                                    cursor: 'pointer', fontFamily: 'var(--font-hebrew)', fontSize: 14, fontWeight: 700,
                                    color: formOriginId === origin.id ? 'var(--accent)' : 'var(--primary)',
                                  }}
                                >
                                  <MapPin size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                  <span style={{ flex: 1, textAlign: 'right' }}>{origin.name}</span>
                                  {formOriginId === origin.id && <Check size={14} />}
                                </button>
                                <button type="button" className="btn-x danger" aria-label="הסר מיקום" title="הסר מיקום" onClick={() => handleRemoveDistanceOrigin(origin.id)}>
                                  <X size={16} />
                                </button>
                              </div>
                            ))}

                            {/* Add new origin */}
                            {!showAddOriginForm ? (
                              <button
                                type="button"
                                onClick={() => setShowAddOriginForm(true)}
                                style={{
                                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '10px 14px', border: 'none', background: 'var(--surface)',
                                  cursor: 'pointer', fontFamily: 'var(--font-hebrew)', fontSize: 13, fontWeight: 700,
                                  color: 'var(--accent)',
                                }}
                              >
                                <Plus size={14} />
                                <span>הוסף מיקום...</span>
                              </button>
                            ) : (
                              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--p-3)' }}>
                                <input
                                  type="text"
                                  className="form-control"
                                  placeholder="שם המיקום (למשל: תחנת הרכבת)"
                                  value={newOriginName}
                                  onChange={e => setNewOriginName(e.target.value)}
                                  style={{ fontSize: 13 }}
                                />
                                <input
                                  type="text"
                                  inputMode="url"
                                  className="form-control"
                                  placeholder="קישור לגוגל מפות"
                                  value={newOriginUrl}
                                  onChange={e => setNewOriginUrl(e.target.value)}
                                  dir="ltr"
                                  style={{ fontSize: 13 }}
                                />
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button type="button" onClick={handleSaveDistanceOrigin} className="btn-primary" style={{ flex: 1 }}>שמור</button>
                                  <button type="button" onClick={() => { setShowAddOriginForm(false); setNewOriginName(''); setNewOriginUrl(''); }} className="btn-secondary">ביטול</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                  {/* Manual travel-time overrides — edit mode only, requires Maps key */}
                  {editingId && hasGmapsKey() && (() => {
                    const cacheOriginKey = formOriginId;
                    const cache = distanceCache[`${editingId}_${cacheOriginKey}`];
                    const computed = cache && !cache.loading && !cache.error && !cache.noLocation;
                    return (
                      <div style={{
                        background: 'var(--surface-2)',
                        border: 'none',
                        borderRadius: 12,
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Navigation size={14} /> זמני הגעה (דקות)
                          </span>
                          {cache?.manualOverride && (
                            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--c-orange)', background: 'var(--c-orange-12)', borderRadius: 999, padding: '2px 8px' }}>
                              ידני
                            </span>
                          )}
                        </div>
                        <div className="row-2" style={{ gap: 10 }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Footprints size={13} aria-hidden="true" />הליכה</label>
                            <input
                              type="number"
                              className="form-control"
                              min="0"
                              max="999"
                              placeholder={computed && cache.walk?.seconds ? String(Math.round(cache.walk.seconds / 60)) : '—'}
                              value={editWalkMins}
                              onChange={e => setEditWalkMins(e.target.value)}
                              style={{ fontSize: 14 }}
                            />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Bus size={13} aria-hidden="true" />תחבורה ציבורית</label>
                            <input
                              type="number"
                              className="form-control"
                              min="0"
                              max="999"
                              placeholder={computed && cache.transit?.seconds ? String(Math.round(cache.transit.seconds / 60)) : '—'}
                              value={editTransitMins}
                              onChange={e => setEditTransitMins(e.target.value)}
                              style={{ fontSize: 14 }}
                            />
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                          {computed && (cache.walk || cache.transit)
                            ? `ערכים מחושבים: ${cache.walk ? `הליכה ${cache.walk.duration}` : ''}${cache.walk && cache.transit ? ' · ' : ''}${cache.transit ? `תחבורה ציבורית ${cache.transit.duration}` : ''} — השאר ריק לשמור אוטומטי`
                            : 'הזן דקות לעקיפה ידנית — השאר ריק להשאיר ללא שינוי'}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="form-group">
                    <label>הערות / מידע חשוב</label>
                    <textarea
                      className="form-control"
                      rows="4"
                      placeholder="פרטים נוספים, שעות פתיחה, טיפים..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      style={{ resize: 'none', fontFamily: 'inherit' }}
                    />
                  </div>

                  <div className="sheet-footer">
                    <button type="submit" className="btn-primary">שמור</button>
                    <button type="button" onClick={cancel} className="btn-secondary">ביטול</button>
                  </div>

                </form>
              )}
            </Sheet>
          )}

          {/* Filter pill + search and options buttons — sticky, under the
              stuck category header when there is one (.plan-toolbar-dock).
              The row itself has no background (the owner's ask): each
              control carries its own colour, and the cards scroll under
              them. */}
          <div className={`plan-toolbar-dock${headsStick ? ' under-head' : ''}`}>
          {/* The owner's ask: the category filter as a pill on its own, and
              search and options as two round white buttons. Search opens
              into a field across the whole row. */}
          <div className="plan-toolbar">
          {(searchOpen || searchQuery) ? (
            <div className="plan-search-field">
              <Search size={18} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                type="search"
                enterKeyHint="search"
                placeholder="חיפוש מקומות"
                aria-label="חיפוש מקומות"
                value={searchQuery}
                autoFocus
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false); } }}
              />
              <button
                type="button"
                aria-label="סגור חיפוש"
                onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
                className="round-btn"
                style={{ width: 32, height: 32, minWidth: 32, background: 'var(--surface-2)' }}
              >
                <X size={16} />
              </button>
            </div>
          ) : (<>
            {/* Category filter — one pill instead of a pill per category,
                so the row stays readable however many there are. Its menu
                ticks any number of them. */}
            <PlanCategoryFilter
              plans={plans}
              categories={categories}
              picked={picked}
              onPicked={setPickedCats}
              mustOnly={mustOnly}
              onMustOnly={setMustOnly}
              colorOf={getCategoryColor}
              iconOf={getCategoryIcon}
              also={passesOthers}
            />

            {/* Single options button — no wrapper div (backdrop-filter parent
                causes positioned wrapper divs to get implicit solid bg).
                Dropdown uses position:fixed anchored via getBoundingClientRect. */}
            {(() => {
              const optionsActive = sortBy !== 'default' || groupBy !== 'none' || hideVisited;
              const openMenu = () => {
                setShowSortMenu(s => !s);
              };
              return (
                <>
                  <button
                    ref={optionsBtnRef}
                    onClick={openMenu}
                    title="מיון ותצוגה"
                    aria-label="מיון ותצוגה"
                    className={`round-btn ${optionsActive ? 'on' : 'raised'}`}
                    style={{ width: 42, height: 42, minWidth: 42, gap: 4, marginInlineStart: 'auto' }}
                  >
                    {bulkCalc ? (
                      <>
                        <Loader2 size={14} className="spinning" />
                        <span style={{ fontSize: 11 }}>{bulkCalc.done}/{bulkCalc.total}</span>
                      </>
                    ) : (
                      <SlidersHorizontal size={17} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    title="חיפוש"
                    aria-label="חיפוש"
                    className="round-btn raised"
                    style={{ width: 42, height: 42, minWidth: 42 }}
                  >
                    <Search size={18} />
                  </button>

                  {showSortMenu && (
                    <Sheet title="מיון ותצוגה" onClose={() => setShowSortMenu(false)}>
                      {({ close }) => (<>
                        <SheetSection label="תצוגת כרטיסים">
                          <Segmented
                            value={planLayout}
                            onChange={setPlanLayout}
                            options={Object.entries(PLAN_LAYOUTS).map(([key, cfg]) => ({ key, label: cfg.label, Icon: cfg.icon }))}
                          />
                        </SheetSection>

                        <SheetSection label="מיון">
                          <div className="list-group" role="radiogroup" aria-label="מיון">
                            {[
                              { key: 'default',      label: 'ברירת מחדל' },
                              { key: 'walk-asc',     label: 'הליכה — מהקרוב לרחוק', Icon: Footprints },
                              { key: 'walk-desc',    label: 'הליכה — מהרחוק לקרוב', Icon: Footprints },
                              { key: 'transit-asc',  label: 'תחבורה — מהקרוב לרחוק', Icon: Bus },
                              { key: 'transit-desc', label: 'תחבורה — מהרחוק לקרוב', Icon: Bus },
                            ].map(({ key, label, Icon }) => (
                              <button key={key} type="button" role="radio" aria-checked={sortBy === key} className="list-row"
                                onClick={() => { setSortBy(key); close(); }}>
                                {Icon ? <Icon size={16} className="list-row-icon" /> : <span className="list-row-icon" />}
                                <span className="list-row-label">{label}</span>
                                {sortBy === key && <Check size={16} />}
                              </button>
                            ))}
                          </div>
                        </SheetSection>

                        <SheetSection label="חלוקה לקבוצות">
                          <Segmented
                            value={groupBy}
                            onChange={setGroupBy}
                            options={[
                              { key: 'none', label: 'רשימה', Icon: LayoutList },
                              { key: 'category', label: 'קטגוריה', Icon: Tag },
                              { key: 'area', label: 'איזור', Icon: Layers, disabled: !hasGmapsKey(), title: hasGmapsKey() ? undefined : 'דורש מפתח מפות' },
                            ]}
                          />
                          {/* Hide places already visited — the quickest way to
                              shorten a list that has grown over the trip. */}
                          <div className="list-group">
                            <button type="button" role="switch" aria-checked={hideVisited} className="list-row" onClick={() => setHideVisited(v => !v)}>
                              {hideVisited ? <EyeOff size={16} className="list-row-icon" /> : <Eye size={16} className="list-row-icon" />}
                              <span className="list-row-label">הסתר מקומות שביקרנו בהם</span>
                              <span className={`switch${hideVisited ? ' on' : ''}`} aria-hidden="true"><i /></span>
                            </button>
                          </div>
                        </SheetSection>

                        {/* Distances need the Maps key. */}
                        {hasGmapsKey() && (
                          <SheetSection label="מרחקים">
                            <div className="list-group">
                              <button type="button" className="list-row" onClick={handleCalculateAll} disabled={!!bulkCalc || !online}>
                                {bulkCalc ? <Loader2 size={16} className="spinning list-row-icon" /> : <RefreshCw size={16} className="list-row-icon" />}
                                <span className="list-row-label">
                                  {bulkCalc ? `מחשב… ${bulkCalc.done}/${bulkCalc.total}` : !online ? 'חשב ושמור מרחקים (דרוש חיבור)' : 'חשב ושמור מרחקים'}
                                </span>
                              </button>
                            </div>
                          </SheetSection>
                        )}

                        {canEdit && (
                          <SheetSection label="קטגוריות">
                            <div className="list-group">
                              <button type="button" className="list-row" onClick={() => { setShowSortMenu(false); setShowCategorySettings(true); }}>
                                <Settings size={16} className="list-row-icon" />
                                <span className="list-row-label">הגדרות קטגוריות</span>
                                <ChevronLeft size={16} className="list-row-chevron" />
                              </button>
                            </div>
                          </SheetSection>
                        )}
                      </>)}
                    </Sheet>
                  )}
                </>
              );
            })()}
          </>)}
          </div>
          </div>

          {/* Duplicates: a small note over the list; a tap shows just them,
              each set together. */}
          {dups.groups.length > 0 && !showDups && (
            <button type="button" className="plan-dup-notice" onClick={() => {
              clearPoolFilters();
              setDupOnly(true);
            }}>
              <Copy size={15} aria-hidden="true" />
              <span>
                {dups.byId.size} מקומות נראים כפולים
              </span>
              <span className="plan-dup-notice-go">הצג<ChevronLeft size={14} aria-hidden="true" /></span>
            </button>
          )}

          {/* Active-view summary — one quiet line telling you how much of the
              list you are actually looking at, with a one-tap way back to
              everything. Hidden when nothing is filtered out. */}
          {(() => {
            const total = plans.length;
            const shown = filteredPlans.length;
            const hiddenCount = total - shown;
            if (hiddenCount <= 0) return null;
            const bits = [];
            if (searchQuery.trim()) bits.push(`חיפוש: "${searchQuery.trim()}"`);
            if (mustOnly) bits.push('חובה בלבד');
            if (picked.length) bits.push(picked.length <= 2 ? picked.join(' · ') : `${picked.length} קטגוריות`);
            if (hideVisited) bits.push('ללא מקומות שביקרנו בהם');
            if (showDups) bits.push('רק כפילויות');
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                padding: '7px 12px', borderRadius: 12,
                background: 'var(--ink-3)', border: '1px solid var(--ink-6)',
                fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
              }}>
                <span style={{ color: 'var(--primary)' }}>{shown} מתוך {total} מקומות</span>
                {bits.length > 0 && <span style={{ opacity: 0.75 }}>· {bits.join(' · ')}</span>}
                <button
                  type="button"
                  onClick={clearPoolFilters}
                  style={{
                    marginInlineStart: 'auto', flexShrink: 0,
                    background: 'var(--p-8)', color: 'var(--accent)',
                    border: 'none', borderRadius: 999, cursor: 'pointer',
                    padding: '3px 12px', fontFamily: 'var(--font-hebrew)',
                    fontSize: 12, fontWeight: 700,
                  }}
                >
                  הצג הכל
                </button>
              </div>
            );
          })()}

          {/* Hint when grouping is on but some places aren't located yet */}
          {groupBy === 'area' && locatedCount < filteredPlans.length && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px', borderRadius: 12,
              background: 'var(--p-6)', border: '1px solid var(--p-12)',
              fontSize: 13, fontWeight: 600, color: 'var(--accent)',
            }}>
              <MapPin size={14} style={{ flexShrink: 0 }} />
              <span>
                {locatedCount} מתוך {filteredPlans.length} מקומות מוקמו. פתח את
                <SlidersHorizontal size={12} style={{ verticalAlign: 'middle', margin: '0 4px' }} />
                ולחץ "חשב ושמור מרחקים" כדי למקם ולקבץ את כולם.
              </span>
            </div>
          )}

          {/* Planning Cards List — density and column count come from the
              selected layout. Grid falls back to one column on narrow phones,
              and an expanded card spans the full width so its contents stay
              readable. Grouped, each group is a section of its own that
              spans all columns (see renderItems). */}
          <div ref={poolListRef} style={planListStyle}>
            {filteredPlans.length === 0 ? (
              /* An empty pool and a filter that matched nothing are two
                 different problems. The old copy said "nothing matches the
                 filter" even to someone who had simply not added a place
                 yet — telling them to loosen a filter they never set. */
              <div style={{ gridColumn: '1 / -1' }}>
                {plans.length === 0 ? (
                  <EmptyState
                    icon={Compass}
                    title="עוד אין מקומות ברשימה"
                    hint="כאן נאספים האטרקציות, המסעדות והדברים לעשות. אפשר להוסיף מקום מהכפתור למטה, או לשתף אותו ישר מגוגל מפות."
                  />
                ) : (
                  <EmptyState
                    icon={Search}
                    title="אף מקום לא עונה לסינון"
                    hint={`${plans.length} מקומות ברשימה, אבל אף אחד מהם לא עובר את הסינון הנוכחי.`}
                    action={
                      <button type="button" className="btn-secondary" onClick={clearPoolFilters}>
                        <span>נקה סינון</span>
                      </button>
                    }
                  />
                )}
              </div>
            ) : (
              (() => {
              const renderEntry = (plan) => {
                // Section header rows (area clusters / category sections).
                // A category's stays on top while its own places scroll
                // under it, until the next one's takes over (the owner's
                // ask); the cards then leave the category out. Each folds:
                // a category's is remembered on the device.
                if (plan.__header) {
                  const headerColor = plan.category ? getCategoryColor(plan.category) : 'var(--accent)';
                  const area = !plan.category;
                  const searching = !!searchQuery.trim();
                  return (
                    <SectionHeader
                      key={plan.id}
                      className={`plan-group-head${plan.category ? ' stuck' : ''}`}
                      title={plan.label}
                      icon={plan.category ? getCategoryIcon(plan.category, 16) : plan.dup ? <Copy size={16} /> : <Layers size={16} />}
                      color={headerColor}
                      count={plan.count}
                      collapsed={area ? !!collapsedAreas[plan.id] : plan.folded}
                      onToggle={area
                        ? () => setCollapsedAreas(prev => ({ ...prev, [plan.id]: !prev[plan.id] }))
                        : searching ? undefined : () => toggleCatFold(plan.category)}
                      style={{ '--c': headerColor }}
                    />
                  );
                }

                const isTile = LO.columns > 1;

                // Event status (only for the events category)
                // A date (and time) on the place, of any category: a fixed
                // appointment, and every layout makes it stand out.
                const when = placeWhen(plan.event);
                const isEvent = !!when;
                const isTodayEvent = isEvent && when.today;

                // One quiet meta line under the title: what it is, when it is,
                // how far it is, how many links it carries. No buttons, no
                // chips — every action moved into the details sheet.
                const travel = travelSummary(plan);
                const linkCount = (Array.isArray(plan.links) ? plan.links.length : 0);
                const metaParts = [];
                if (plan.category && !catGrouped) metaParts.push({ key: 'category', text: plan.category });
                if (when?.until) metaParts.push({ key: 'until', Icon: Calendar, text: when.until });
                if (travel.walk) metaParts.push({ key: 'walk', Icon: Footprints, text: travel.walk });
                else if (travel.transit) metaParts.push({ key: 'transit', Icon: Bus, text: travel.transit });
                if (linkCount > 0) metaParts.push({ key: 'links', Icon: Link2, text: String(linkCount) });
                const metaLine = metaParts.length > 0 && metaParts.map(({ key, Icon, text }, i) => (
                  <span key={key} className="meta-part">
                    {i > 0 && ' · '}
                    {Icon && <Icon size={12} aria-hidden="true" />}
                    {text}
                  </span>
                ));

                // "Must" as a pill. A date's "today" and "over" are said by
                // the date itself (the stub, the leaf, the chip).
                const pill = plan.priority === 'must' && !plan.visited
                  ? { text: 'חובה', tone: 'butter', star: true }
                  : null;
                // Looks like another place on the list: said on every card.
                const dup = dups.byId.has(plan.id)
                  ? { text: 'כפילות', title: `כפילות של: ${dupNames(plan.id).join(', ')}` }
                  : null;
                // The date as one solid block, in the category's colour.
                const whenLine = when && when.line;

                const cardClass = `glass-card plan-card${plan.visited ? ' visited' : ''}${isTodayEvent && !plan.visited ? ' event-today' : ''}`;
                // The category's theme; a visited card gives up its surface.
                const theme = plan.visited ? null : getCategoryTheme(plan.category);
                const ornament = theme && THEMES[theme].ornament
                  ? <span className={`ct-ornament ct-${THEMES[theme].ornament}`} aria-hidden="true" /> : null;
                const cardRef = bindItemRef(plan.id);
                const openOnKey = (e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlanDetail(plan.id); }
                };

                /* ── Grid tile ──────────────────────────────────────────────
                   A tile is too small to hold controls: no checkbox, no chip
                   around the icon, no badge. Just the name, one small mark
                   for what it is (or a check once visited), and at most one
                   tiny flag for "must" / "happening today". Everything else
                   is one tap away in the details sheet.                     */
                if (isTile) {
                  const flag = plan.priority === 'must' && !plan.visited ? { star: true, title: 'חובה' } : null;
                  return (
                    <div
                      key={plan.id}
                      ref={cardRef}
                      className={cardClass}
                      onClick={() => openPlanDetail(plan.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={openOnKey}
                      title={plan.title}
                      data-ct={theme || undefined}
                      style={{
                        '--c': getCategoryColor(plan.category),
                        // A tile: the category disc on top, the name under it,
                        // flags in the top corner.
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '14px 14px 13px',
                        minHeight: 104,
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                        willChange: 'transform',
                      }}
                    >
                      {ornament}
                      {/* Under a category's header the disc would repeat it:
                          just the check, once visited. */}
                      {(!catGrouped || plan.visited) && (
                        <CategoryDisc color={getCategoryColor(plan.category)} size={36} radius={12} muted={plan.visited}>
                          {plan.visited
                            ? <Check size={17} strokeWidth={3} />
                            : getCategoryIcon(plan.category, 17)}
                        </CategoryDisc>
                      )}

                      <h3 style={{
                        minWidth: 0, margin: 0, width: '100%',
                        fontSize: 14, fontWeight: 800, lineHeight: 1.3,
                        // Visited: quieter text, no strike-through. The check
                        // already says it, and a line through a place's name
                        // reads as "cancelled", not "we went".
                        color: plan.visited ? 'var(--text-muted)' : 'var(--text)',
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        wordBreak: 'break-word',
                      }}>
                        {plan.title}
                      </h3>

                      {when && (
                        <span className={`plan-when-chip${when.daily ? ' daily' : ''}${when.past || plan.visited ? ' past' : ''}`} style={{ '--c': getCategoryColor(plan.category) }}>
                          <CalendarClock size={12} aria-hidden="true" />
                          {/* Every day: the hours, and the dates on a line of their own when the tile is narrow. */}
                          {when.daily
                            ? <span><span className="nb">{when.hours} ·</span> <span className="nb">{when.dates}</span></span>
                            : <span>{whenLine}</span>}
                        </span>
                      )}

                      {/* Flags in the top corner (inline-end; the disc is at the start). */}
                      {(flag || dup || (!plan.visited && (bookedPlaceIds.has(plan.id) || plan.needsReservation))) && (
                        <span style={{ position: 'absolute', top: 12, insetInlineEnd: 12, display: 'flex', gap: 5 }}>
                          {dup && (
                            <span className="plan-dup-mark" title={dup.title} aria-label={dup.title}>
                              <Copy size={13} />
                            </span>
                          )}
                          {flag && (
                            <span title={flag.title} style={{ display: 'flex', alignItems: 'center', color: 'var(--c-orange)', fontSize: 12, lineHeight: 1 }}>
                              <Star size={14} className="star-must" />
                            </span>
                          )}
                          {!plan.visited && (bookedPlaceIds.has(plan.id) || plan.needsReservation) && (
                            <span title={bookedPlaceIds.has(plan.id) ? 'הוזמן' : 'צריך לסגור / להזמין מראש'} style={{
                              display: 'flex',
                              color: bookedPlaceIds.has(plan.id) ? 'var(--c-green)' : 'var(--c-red)',
                            }}>
                              <CalendarCheck size={14} />
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  );
                }

                /* ── Stub card (עמודת זמן) ──────────────────────────────────
                   Everything about the place you can read without opening
                   it: its name, what and where it is, the start of its
                   notes, then small tags (the day it is on, booking,
                   price, links). The stub on the side holds how long it
                   takes to get there — walking, or transit when the walk
                   is long — and a tap on it navigates. The rest of the
                   card opens the details sheet; the circle ticks it.     */
                if (planLayout === 'stub') {
                  const color = getCategoryColor(plan.category);
                  const cache = distanceCache[`${plan.id}_${plan.distanceOriginId || 'hotel'}`];
                  const ready = cache && !cache.loading && !cache.error;
                  const walk = ready ? stubTime(cache.walk) : null;
                  const transit = ready ? stubTime(cache.transit) : null;
                  const byWalk = walk && (!transit || walk.minutes <= 30 || walk.minutes <= transit.minutes);
                  const main = byWalk ? { ...walk, Icon: Footprints, mode: 'הליכה' } : transit ? { ...transit, Icon: Bus, mode: 'בתחבורה' } : null;
                  const other = main && (byWalk ? transit && { ...transit, Icon: Bus } : walk && { ...walk, Icon: Footprints });
                  const locs = getPlanLocations(plan);
                  const area = plan.address && !/^https?:\/\//i.test(plan.address)
                    ? plan.address.split(',')[0].trim() : '';
                  const onDays = plannedDays.get(plan.id) || [];
                  const booked = bookedPlaceIds.has(plan.id);
                  const price = (plan.price || '').trim();
                  // "Must" and booking sit at the top, by the stub (the
                  // owner's ask), one over the other and one width, so the
                  // title wraps beside them and nothing overlaps. A booking
                  // still to make is solid red: it needs doing.
                  const flags = [];
                  if (pill) flags.push({ key: 'must', cls: 'must', text: pill.text, icon: <Star size={11} className="star-must" /> });
                  if (dup) flags.push({ key: 'dup', cls: 'dup', text: dup.text, icon: <Copy size={11} aria-hidden="true" />, title: dup.title });
                  if (!plan.visited && (booked || plan.needsReservation)) {
                    flags.push(booked
                      ? { key: 'book', cls: 'booked', text: 'הוזמן', icon: <Check size={11} strokeWidth={3} />, title: 'יש הזמנה בטאב ההזמנות' }
                      : { key: 'book', cls: 'book', text: 'להזמין', icon: <CalendarCheck size={11} />, title: 'צריך לסגור / להזמין מראש' });
                  }
                  const tags = [];
                  if (when?.until) tags.push({ key: 'until', tone: 'sky', text: when.until, icon: <Calendar size={11} aria-hidden="true" /> });
                  if (onDays.length) {
                    const d = onDays[0];
                    const when = d.date ? (() => {
                      const [, mm, dd] = d.date.split('-');
                      return `${DOW_HE[(localDay(d.date) || new Date(d.date)).getDay()]} ${dd}.${mm}`;
                    })() : d.title;
                    tags.push({ key: 'day', tone: 'sky', text: onDays.length > 1 ? `${when} +${onDays.length - 1}` : when, icon: <Calendar size={11} aria-hidden="true" />, title: `בלוז: ${onDays.map(x => x.title).join(', ')}` });
                  }
                  if (plan.priority === 'optional' && !plan.visited) tags.push({ key: 'opt', tone: 'muted', text: 'אם יישאר זמן', icon: <Clock size={11} aria-hidden="true" /> });
                  if (price && price !== 'חינם') tags.push({ key: 'price', tone: 'neutral', text: price, icon: <Wallet size={11} aria-hidden="true" /> });
                  if (linkCount > 0) tags.push({ key: 'links', tone: 'neutral', text: String(linkCount), icon: <Link2 size={11} aria-hidden="true" />, title: `${linkCount} קישורים` });

                  // A date takes the stub over: when, big, and the travel
                  // time small under it. Solid in the category's colour, so
                  // a fixed appointment is the first thing the eye finds.
                  const stubBody = when ? (<>
                    <span className="pstub-when-top">{when.top}</span>
                    <span className="pstub-num">{when.main}</span>
                    {when.sub && <span className="pstub-unit">{when.sub}</span>}
                    {main && <span className="pstub-alt"><main.Icon size={11} aria-hidden="true" />{main.num} {main.unit}</span>}
                  </>) : main ? (<>
                    <span className="pstub-num">{main.num}</span>
                    <span className="pstub-unit"><main.Icon size={12} aria-hidden="true" />{main.unit}</span>
                    {other && <span className="pstub-alt"><other.Icon size={11} aria-hidden="true" />{other.num} {other.unit}</span>}
                  </>) : cache?.loading ? (
                    <Loader2 size={20} className="spinning" aria-hidden="true" />
                  ) : locs.length ? (<>
                    <Navigation size={22} aria-hidden="true" />
                    <span className="pstub-unit">ניווט</span>
                  </>) : (
                    <span className="pstub-icon">{getCategoryIcon(plan.category, 24)}</span>
                  );
                  const stubClass = `pstub-stub${when ? ' when' : ''}${when && (when.past || plan.visited) ? ' past' : ''}`;
                  return (
                    <div key={plan.id} ref={cardRef} className={`pstub-wrap${plan.visited ? ' visited' : ''}`}>
                      {ornament}
                      <div
                        className={`${cardClass} pstub`}
                        onClick={() => openPlanDetail(plan.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={openOnKey}
                        style={{ '--c': color }}
                      >
                        {/* The text sits in the middle of the card's height (the
                            owner's ask); "must" and booking stay in the top
                            corner by the stub (.pstub-main is a grid). */}
                        <div className="pstub-main" data-ct={theme || undefined}>
                          <div className="pstub-body">
                          <div className="pstub-head">
                            {(canAdd || plan.visited) && (
                              <CheckCircle
                                checked={!!plan.visited}
                                onToggle={canAdd ? () => handleToggleVisited(plan) : undefined}
                                label={plan.visited ? 'בטל סימון ביקור' : 'סמן שביקרנו'}
                              />
                            )}
                            <h3 className="pstub-title">{plan.title}</h3>
                          </div>
                          {catGrouped ? (area && (
                            <div className="pstub-sub">
                              <MapPin size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
                              <span><bdi>{area}</bdi></span>
                            </div>
                          )) : (
                            <div className="pstub-sub">
                              <CategoryDisc color={color} size={22} radius={7} muted={plan.visited}>
                                {getCategoryIcon(plan.category, 12)}
                              </CategoryDisc>
                              {/* Where first: the disc already says what it is,
                                  and a long category name is what gets cut. */}
                              <span>
                                {area && <><bdi>{area}</bdi> · </>}
                                {plan.category}
                              </span>
                            </div>
                          )}
                          {plan.description && <p className="pstub-desc">{plan.description}</p>}
                          {tags.length > 0 && (
                            <div className="pstub-tags">
                              {tags.map(t => (
                                <Pill key={t.key} size="sm" tone={t.tone} icon={t.icon} title={t.title}>{t.text}</Pill>
                              ))}
                            </div>
                          )}
                          </div>
                          {flags.length > 0 && (
                            <span className="pstub-flags">
                              {flags.map(f => (
                                <span key={f.key} className={`pstub-flag ${f.cls}`} title={f.title}>{f.icon}{f.text}</span>
                              ))}
                            </span>
                          )}
                        </div>
                        {locs.length ? (
                          <button
                            type="button"
                            className={stubClass}
                            aria-label={`ניווט אל ${plan.title}${when ? `, ${whenLine}` : ''}${main ? `, ${main.num} ${main.unit} ${main.mode}` : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (locs.length === 1) window.open(locs[0].url, '_blank', 'noreferrer');
                              else setLocationsModal(plan);
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            {stubBody}
                            {(main || when) && <span className="pstub-go"><Navigation size={10} aria-hidden="true" />ניווט</span>}
                          </button>
                        ) : (
                          <div className={stubClass} aria-label={when ? whenLine : undefined} aria-hidden={!main && !when}>{stubBody}</div>
                        )}
                      </div>
                    </div>
                  );
                }

                /* ── List row (קומפקטי) ──────────────────────────────────── */
                return (
                  <div
                    key={plan.id}
                    ref={cardRef}
                    className={cardClass}
                    onClick={() => openPlanDetail(plan.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={openOnKey}
                    data-ct={theme || undefined}
                    style={{
                      '--c': getCategoryColor(plan.category),
                      padding: LO.cardPad,
                      // .glass-card is a column flexbox — the row direction has
                      // to be set explicitly or the card stacks vertically.
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: LO.headerGap,
                      cursor: 'pointer',
                      willChange: 'transform',
                    }}
                  >
                    {ornament}
                    {/* Visited toggle — the one action that stays on the card,
                        so places can be ticked off without opening anything. */}
                    {(canAdd || plan.visited) && (
                      <CheckCircle
                        checked={!!plan.visited}
                        onToggle={canAdd ? () => handleToggleVisited(plan) : undefined}
                        label={plan.visited ? 'בטל סימון ביקור' : 'סמן שביקרנו'}
                      />
                    )}

                    {!catGrouped && (
                      <CategoryDisc color={getCategoryColor(plan.category)} size={LO.iconBox} muted={plan.visited}>
                        {getCategoryIcon(plan.category, LO.iconBox >= 40 ? 20 : 16)}
                      </CategoryDisc>
                    )}

                    <div style={{ minWidth: 0, flex: 1 }}>
                      {/* The name gets its own line (up to two): tags used to
                          sit beside it and cut it to "מבצר הדי…". */}
                      <h3 style={{
                        fontSize: LO.titleSize,
                        fontWeight: 800,
                        letterSpacing: '-0.01em',
                        color: plan.visited ? 'var(--text-muted)' : 'var(--text)',
                        lineHeight: 1.25,
                        margin: 0,
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        wordBreak: 'break-word',
                      }}>
                        {plan.title}
                      </h3>
                      {(LO.showSubtitle && metaLine) && (
                        <span style={{
                          fontSize: LO.titleSize >= 16 ? 13 : 12, color: 'var(--text-muted)', fontWeight: 500,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          display: 'block', marginTop: 2,
                        }}>
                          {metaLine}
                        </span>
                      )}
                      {(() => {
                        // Booking is a to-do, not a status, so it gets its own
                        // tag beside the status one instead of competing for it.
                        const booked = bookedPlaceIds.has(plan.id);
                        const bookingTag = !plan.visited && (booked || plan.needsReservation);
                        if (!pill && !bookingTag && !dup) return null;
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                            {dup && (
                              <Pill size="sm" tone="lavender" title={dup.title} icon={<Copy size={11} aria-hidden="true" />}>
                                {dup.text}
                              </Pill>
                            )}
                            {pill && (
                              <Pill size="sm" tone={pill.tone} icon={pill.star ? <Star size={11} className="star-must" /> : pill.Icon ? <pill.Icon size={11} aria-hidden="true" /> : null}>
                                {pill.text}
                              </Pill>
                            )}
                            {bookingTag && (
                              <Pill
                                size="sm"
                                tone={booked ? 'mint' : 'red'}
                                title={booked ? 'יש הזמנה בטאב ההזמנות' : 'צריך לסגור / להזמין מראש'}
                                icon={booked ? <Check size={11} strokeWidth={3} /> : <CalendarCheck size={11} />}
                              >
                                {booked ? 'הוזמן' : 'להזמין מראש'}
                              </Pill>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* A date: a leaf off a calendar, solid in the category's
                        colour, where the quiet chevron is otherwise. */}
                    {when ? (
                      <span className={`plan-when-leaf${when.past || plan.visited ? ' past' : ''}`} style={{ '--c': getCategoryColor(plan.category) }}>
                        <span className="plan-when-leaf-top">{when.top}</span>
                        <span className="plan-when-leaf-main">{when.main}</span>
                        {when.sub && <span className="plan-when-leaf-sub">{when.sub}</span>}
                      </span>
                    ) : (
                      /* Quiet "opens a panel" affordance (RTL: points inward) */
                      <ChevronLeft size={18} style={{ color: 'var(--ink-20)', flexShrink: 0 }} />
                    )}
                  </div>
                );
              };
              if (!renderItems.some(item => item.__header)) return renderItems.map(renderEntry);
              // One section per group: its header, then its places in the
              // layout's own list.
              const sections = [];
              renderItems.forEach(item => {
                if (item.__header) sections.push({ header: item, items: [] });
                else sections[sections.length - 1]?.items.push(item);
              });
              return sections.map(({ header, items }, i) => (
                <section
                  key={header.id}
                  className="plan-group"
                  style={{
                    gridColumn: '1 / -1',
                    display: 'flex', flexDirection: 'column', gap: LO.listGap,
                    marginTop: i === 0 ? 0 : 18,
                  }}
                >
                  {renderEntry(header)}
                  {items.length > 0 && <div style={planListStyle}>{items.map(renderEntry)}</div>}
                </section>
              ));
              })()
            )}
          </div>
        </>
      ) : (
        /* DAILY PLANNER SUB-TAB */
        <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* A toolbar only when it has something in it. The title said
              what the sub-tab button above already says, adding a day
              moved to the floating button every tab shares, and the view
              switch moved up beside the sub-tabs — so most of the time
              this row is not rendered at all and the days start higher. */}
          {(() => {
            const syncable = canEdit && tripFlightDates.out && tripFlightDates.ret &&
              !(tripFlightDates.plannerSync?.out === tripFlightDates.out &&
                tripFlightDates.plannerSync?.ret === tripFlightDates.ret);
            if (!syncable && !justSynced) return null;
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {syncable && (
                  <button
                    onClick={handleInitDaysFromFlight}
                    className="btn-secondary"
                    style={{ padding: '8px 14px', fontSize: 13, gap: 6 }}
                    title="צור ימים אוטומטית לפי תאריכי הטיסה"
                  >
                    <Calendar size={15} />
                    <span>{tripFlightDates.plannerSync ? 'עדכן ימים לפי טיסה' : 'ייצר ימים לפי טיסה'}</span>
                  </button>
                )}
                {justSynced && (
                  <span className="sync-flash" style={{
                    fontSize: 12, color: 'var(--c-green)',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <CheckCircle2 size={13} />
                    ימים מסונכרנים עם הטיסה
                  </span>
                )}
              </div>
            );
          })()}

          {/* Adding a day is a whole-sub-tab action, so it gets the
              floating button — same as "יעד חדש" in the pool. Adding an
              *activity* still belongs to one specific day and stays on
              that day's card. */}
          {canEdit && <Fab label="יום חדש" onClick={handleAddDay} />}

          {days.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="עוד אין ימי טיול"
              hint={
                canEdit && tripFlightDates.out && tripFlightDates.ret
                  ? 'אפשר לייצר את כל ימי הטיול בבת אחת לפי תאריכי הטיסה שכבר הוזנו, ואז לשבץ לכל יום את המקומות מהרשימה.'
                  : canEdit
                    ? 'הוסיפו יום, ואז שבצו לתוכו מקומות מרשימת התכנון עם שעות.'
                    : 'עוד לא נבנה לוח זמנים לטיול הזה.'
              }
              action={
                canEdit && tripFlightDates.out && tripFlightDates.ret ? (
                  <button onClick={handleInitDaysFromFlight} className="btn-primary">
                    <Calendar size={16} />
                    <span>ייצר ימים לפי תאריכי הטיסה</span>
                  </button>
                ) : null
              }
            />
          ) : (
            <DndContext sensors={daySensors} collisionDetection={closestCenter} onDragEnd={handleDayDragEnd}>
              <SortableContext items={days.map(d => d.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {days.map((day) => {
                const isSummary = dayLayout === 'summary' && !openSummaryDays.has(day.id);
                const isEditing = editingDayId === day.id;
                return (
                <DayCard
                  key={day.id}
                  day={day}
                  plans={plans}
                  bookedPlaceIds={bookedPlaceIds}
                  canEdit={canEdit}
                  canAdd={canAdd}
                  currentUid={currentUid}
                  isSummary={isSummary}
                  // The chevron reports whether the body is on screen, which
                  // in summary mode is a different question from "collapsed".
                  dayBodyShown={!isSummary && !collapsedDays.has(day.id)}
                  isEditing={isEditing}
                  // '' for every other card, so typing a title re-renders
                  // only the card being edited.
                  editingDayTitle={isEditing ? editingDayTitle : ''}
                  isArrived={arrivedDayId === day.id}
                  dayLayout={dayLayout}
                  collapsedTimeGroups={collapsedTimeGroups}
                  weatherByDate={weatherByDate}
                  distanceCache={distanceCache}
                  dayNodes={dayNodes}
                  getCategoryColor={getCategoryColor}
                  getCategoryIcon={getCategoryIcon}
                  setCollapsedDays={setCollapsedDays}
                  setOpenSummaryDays={setOpenSummaryDays}
                  setCollapsedTimeGroups={setCollapsedTimeGroups}
                  setEditingDayId={setEditingDayId}
                  setEditingDayTitle={setEditingDayTitle}
                  setActivityDetail={setActivityDetail}
                  setHourlyWeatherDate={setHourlyWeatherDate}
                  handleSaveDayTitle={dayFns.handleSaveDayTitle}
                  handleDeleteDay={dayFns.handleDeleteDay}
                  handleOpenAddActivity={dayFns.handleOpenAddActivity}
                  handleStartEditActivity={dayFns.handleStartEditActivity}
                  handleDeleteActivity={dayFns.handleDeleteActivity}
                  moveActivity={dayFns.moveActivity}
                />
                );
              })}
            </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      {/* Locations Modal — multiple navigation targets for a card */}
      {/* ── Place details sheet ──────────────────────────────────────────
          Tapping a card opens this instead of expanding the card in place:
          the list stays a clean column of titles, and everything you can do
          with a place (navigate, edit, prioritise, mark, delete) is laid out
          here in one predictable place. */}
      {detailPlan && (
        <Sheet
          label={detailPlan.title}
          onClose={() => setDetailPlanId(null)}
          header={({ close }) => (
            /* Icon, title, status pills, close */
            <div className="modal-header" style={{ alignItems: 'flex-start', gap: 12 }}>
              <CategoryDisc color={getCategoryColor(detailPlan.category)} size={48} radius={16} muted={detailPlan.visited}>
                {getCategoryIcon(detailPlan.category, 22)}
              </CategoryDisc>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{
                  fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.25,
                  color: detailPlan.visited ? 'var(--text-muted)' : 'var(--text)',
                  wordBreak: 'break-word',
                }}>
                  {detailPlan.title}
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  <Pill size="sm" style={{ background: `${getCategoryColor(detailPlan.category)}1F` }}>{detailPlan.category}</Pill>
                  {detailPlan.priority === 'must' && (
                    <Pill size="sm" tone="butter" icon={<Star size={11} className="star-must" />}>חובה</Pill>
                  )}
                  {detailPlan.priority === 'optional' && (
                    <Pill size="sm" tone="muted" icon={<Clock size={11} />}>אם ישאר זמן</Pill>
                  )}
                  {bookedPlaceIds.has(detailPlan.id) ? (
                    <Pill size="sm" tone="mint" icon={<Check size={11} strokeWidth={3} />}>הוזמן</Pill>
                  ) : detailPlan.needsReservation && (
                    <Pill size="sm" tone="red" icon={<CalendarCheck size={11} />}>צריך לסגור מראש</Pill>
                  )}
                  {detailPlan.visited && (
                    <Pill size="sm" tone="muted" icon={<Check size={11} strokeWidth={3} />}>ביקרנו</Pill>
                  )}
                  {detailPlan.event?.startDate && (
                    <Pill size="sm" tone="sky" icon={<CalendarClock size={11} aria-hidden="true" />}>{formatEventWhen(detailPlan.event)}</Pill>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="btn-close"
                aria-label="סגור"
                onClick={close}
                style={{ flexShrink: 0 }}
              >✕</button>
            </div>
          )}
        >
          {({ close }) => (<>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {detailPlan.description && (
                <p style={{ fontSize: 14, color: 'var(--c-slate)', lineHeight: 1.5, fontWeight: 500, margin: 0 }}>
                  {detailPlan.description}
                </p>
              )}

              {renderDistanceBlock(detailPlan)}

              {/* Locations & links */}
              {(() => {
                const locs = getPlanLocations(detailPlan);
                if (locs.length === 0) return null;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={sheetSectionLabel}>מיקומים וקישורים</span>
                    {locs.map((loc, i) => (
                      <a
                        key={i}
                        href={loc.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ textDecoration: 'none' }}
                      >
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px',
                          background: 'var(--surface-2)',
                          borderRadius: 16,
                          border: 'none',
                        }}>
                          <span style={{
                            width: 34, height: 34, borderRadius: 11, flexShrink: 0,
                            background: 'var(--mint)', color: 'var(--c-green)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {i === 0 && detailPlan.address ? <MapPin size={15} /> : <Link2 size={15} />}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {loc.label}
                            </div>
                            {/* Only when the link carries a name of its own —
                                otherwise the title already IS the address. */}
                            {loc.label !== prettyUrl(loc.url) && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="ltr">
                                {prettyUrl(loc.url)}
                              </div>
                            )}
                          </div>
                          <ExternalLink size={14} style={{ color: 'var(--accent)', flexShrink: 0, opacity: 0.7 }} />
                        </div>
                      </a>
                    ))}
                  </div>
                );
              })()}

              {/* Who added this place */}
              {(() => {
                const who = profileFor(detailPlan.addedBy);
                if (!who) return null;
                const name = who.displayName || who.email || 'משתמש';
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', overflow: 'hidden',
                      flexShrink: 0, background: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {who.photoURL
                        ? <img src={who.photoURL} alt="" referrerPolicy="no-referrer"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>{name[0]}</span>}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                      נוסף על ידי {name}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Actions — pinned to the bottom so they are always in the same spot */}
            <div className="sheet-footer" style={{ flexDirection: 'column', gap: 10, marginTop: 0 }}>
              {(() => {
                const locs = getPlanLocations(detailPlan);
                const actions = [];
                if (locs.length > 0) actions.push({
                  key: 'nav', label: 'ניווט', Icon: Navigation, tone: 'mint',
                  onClick: () => {
                    if (locs.length === 1) window.open(locs[0].url, '_blank', 'noreferrer');
                    else setLocationsModal(detailPlan);
                  },
                });
                if (mayChange(detailPlan)) {
                  actions.push({
                    key: 'edit', label: 'עריכה', Icon: Pencil, tone: 'neutral',
                    onClick: () => { close(); handleStartEdit(detailPlan); },
                  });
                  actions.push({
                    key: 'prio',
                    label: detailPlan.priority === 'must' ? 'אם ישאר זמן'
                         : detailPlan.priority === 'optional' ? 'ללא עדיפות' : 'סמן כחובה',
                    Icon: detailPlan.priority === 'must' ? Clock : Star,
                    tone: 'butter',
                    onClick: () => cyclePriority(detailPlan),
                  });
                  actions.push({
                    key: 'del', label: 'מחיקה', Icon: Trash2, tone: 'danger',
                    onClick: async () => {
                      const id = detailPlan.id;
                      close();
                      await handleDelete(id);
                    },
                  });
                }
                if (actions.length === 0) return null;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(actions.length, 4)}, 1fr)`, gap: 8 }}>
                    {/* Round pastel buttons with a label under each (Payments-2026). */}
                    {actions.map(({ key, label, Icon, onClick, tone }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={onClick}
                        className="action-tile"
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                          padding: '2px 2px 0', border: 'none', background: 'transparent', cursor: 'pointer',
                          color: tone === 'danger' ? 'var(--c-red)' : 'var(--text)',
                          fontFamily: 'var(--font-hebrew)', fontSize: 12.5, fontWeight: 700,
                        }}
                      >
                        <span className={`round-btn ${tone === 'danger' ? 'danger' : tone === 'neutral' ? '' : tone}`} style={{ width: 50, height: 50, minWidth: 50 }}>
                          <Icon size={20} />
                        </span>
                        <span style={{ textAlign: 'center', lineHeight: 1.15 }}>{label}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}

              {canAdd && (
                <button
                  type="button"
                  onClick={() => handleToggleVisited(detailPlan)}
                  className={detailPlan.visited ? 'btn-secondary' : 'btn-primary'}
                  style={{ flex: 'none', width: '100%', minHeight: 50, gap: 8, fontSize: 15 }}
                >
                  <Check size={17} />
                  <span>{detailPlan.visited ? 'בטל סימון ביקור' : 'סמן שביקרנו'}</span>
                </button>
              )}
            </div>
          </>)}
        </Sheet>
      )}

      {/* ── "From where" picker, over the details sheet ──────────────────
          The hotel (and any saved starting point) stays pinned on top for
          a quick tap; below it every other place on the list, nearest
          first, with a search. The choice is saved on the place. */}
      {originPickerFor && (() => {
        const target = plans.find(p => p.id === originPickerFor);
        if (!target) return null;
        const current = sheetOriginKey(target);
        const coordsOf = (p) => coordsCache[p.id] || p.coords || knownPlaceCoords(p);
        const at = coordsOf(target);
        const q = originQuery.trim().toLowerCase();
        const places = plans
          .filter(p => p.id !== target.id)
          .filter(p => !q || [p.title, p.category, p.address].some(v => (v || '').toLowerCase().includes(q)))
          .map(p => {
            const c = coordsOf(p);
            return { plan: p, meters: at && c ? haversineMeters(at, c) : null };
          })
          .sort((a, b) =>
            (a.meters ?? Infinity) - (b.meters ?? Infinity)
            || a.plan.title.localeCompare(b.plan.title, 'he'));
        // One foldable group per category, in the list's category order;
        // nearest first inside each.
        const byCat = new Map();
        places.forEach(e => {
          const cat = e.plan.category || 'ללא קטגוריה';
          if (!byCat.has(cat)) byCat.set(cat, []);
          byCat.get(cat).push(e);
        });
        const groups = [
          ...categories.filter(c => byCat.has(c)),
          ...[...byCat.keys()].filter(c => !categories.includes(c)),
        ].map(cat => ({ cat, items: byCat.get(cat) }));
        const toggleFold = (cat) => setOriginFolded(prev => {
          const next = new Set(prev);
          if (next.has(cat)) next.delete(cat); else next.add(cat);
          return next;
        });
        const fmtMeters = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} מ'` : `${(m / 1000).toFixed(1)} ק"מ`);
        const hasHotel = hasPreciseOrigin(hotelDetails, null);
        const hotelName = hotelDetails?.name || hotelDetails?.address || '';
        const cityName = (tripDestination || '').split(',')[0].trim();
        return (
          <Sheet
            label="יוצאים מ…"
            onClose={() => setOriginPickerFor(null)}
            header={({ close }) => (
              <div className="modal-header origin-picker-head">
                <div className="origin-picker-title">
                  <div style={{ minWidth: 0 }}>
                    <h2>יוצאים מ…</h2>
                    <div className="origin-picker-sub">זמני ההגעה אל {target.title}</div>
                  </div>
                  <button type="button" aria-label="סגור" className="btn-close" onClick={close}>✕</button>
                </div>
                <div className="origin-picker-search">
                  <Search size={18} aria-hidden="true" />
                  <input
                    type="search"
                    enterKeyHint="search"
                    className="form-control"
                    placeholder="חיפוש מקום ברשימה"
                    aria-label="חיפוש מקום ברשימה"
                    value={originQuery}
                    onChange={(e) => setOriginQuery(e.target.value)}
                  />
                </div>
              </div>
            )}
          >
            {({ close }) => {
              const pick = (key) => { if (key !== current) chooseTravelFrom(target, key); close(); };
              const row = (key, icon, label, hint) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={current === key}
                  className="list-row"
                  onClick={() => pick(key)}
                >
                  {icon}
                  <span className="list-row-label">
                    {label}
                    {hint && <span className="list-row-hint">{hint}</span>}
                  </span>
                  {current === key && <Check size={16} aria-hidden="true" />}
                </button>
              );
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(hasHotel || tripDestination || distanceOrigins.length > 0) && (
                    <div className="list-group" role="radiogroup" aria-label="נקודות קבועות">
                      {(hasHotel || tripDestination) && row(
                        'hotel',
                        hasHotel ? <Hotel size={16} className="list-row-icon" /> : <MapPin size={16} className="list-row-icon" />,
                        hasHotel ? 'המלון' : (cityName ? `מרכז ${cityName}` : 'מרכז העיר'),
                        hasHotel ? hotelName : '',
                      )}
                      {distanceOrigins.map(o => row(o.id, <MapPin size={16} className="list-row-icon" />, o.name, ''))}
                    </div>
                  )}
                  <span style={sheetSectionLabel}>{at ? 'מקומות מהרשימה, הקרובים קודם' : 'מקומות מהרשימה'}</span>
                  {places.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, padding: '4px 2px 12px' }}>
                      {q ? 'אף מקום לא נמצא' : 'אין עוד מקומות ברשימה'}
                    </div>
                  ) : groups.map(({ cat, items }) => {
                    // A search shows every match, folded or not.
                    const folded = !q && originFolded.has(cat);
                    const color = getCategoryColor(cat);
                    return (
                      <section key={cat} className="origin-picker-group">
                        <SectionHeader
                          title={cat}
                          icon={getCategoryIcon(cat, 14)}
                          color={color}
                          count={items.length}
                          collapsed={folded}
                          onToggle={q ? undefined : () => toggleFold(cat)}
                          meta={folded && items.some(e => `${PLACE_ORIGIN}${e.plan.id}` === current) ? 'נבחר מכאן' : null}
                        />
                        {!folded && (
                          <div className="list-group" role="radiogroup" aria-label={cat}>
                            {items.map(({ plan: p, meters }) => row(
                              `${PLACE_ORIGIN}${p.id}`,
                              <span className="list-row-icon" style={{ color }}>
                                {getCategoryIcon(p.category, 16)}
                              </span>,
                              p.title,
                              meters != null ? fmtMeters(meters) : '',
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              );
            }}
          </Sheet>
        );
      })()}

      {locationsModal && (
        <Sheet title={locationsModal.title} onClose={() => setLocationsModal(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 8 }}>
              {getPlanLocations(locationsModal).map((loc, i) => (
                <a
                  key={i}
                  href={loc.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setLocationsModal(null)}
                  style={{ textDecoration: 'none' }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '13px 14px',
                    background: 'var(--p-4)',
                    borderRadius: 14,
                    border: '1px solid var(--p-12)',
                    transition: 'background 0.15s ease',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: 'var(--brand)', color: 'var(--brand-fg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Navigation size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {loc.label}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="ltr">
                        {loc.url}
                      </div>
                    </div>
                    <ExternalLink size={14} style={{ color: 'var(--accent)', flexShrink: 0, opacity: 0.7 }} />
                  </div>
                </a>
              ))}
            </div>
        </Sheet>
      )}

      {/* Category Settings Modal */}
      {showCategorySettings && (
        <Sheet title="התאמת קטגוריות" onClose={() => setShowCategorySettings(false)} style={{ maxHeight: '90vh' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 16 }}>
              {categories.map(cat => {
                const s = categorySettings[cat] || {};
                const color = s.color || getCategoryColor(cat);
                const isCustom = !defaultCategoryNames.includes(cat);
                return (
                  <div key={cat} style={{ background: 'var(--surface-2)', borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Category label with live preview + delete if custom */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CategoryDisc color={color} size={42} radius={14}>
                        {getCategoryIcon(cat, 20)}
                      </CategoryDisc>
                      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', flex: 1 }}>{cat}</span>
                      {isCustom && canEdit && (
                        <button
                          type="button"
                          title="מחק קטגוריה"
                          onClick={async () => {
                            const inUse = plans.filter(p => p.category === cat).length;
                            const ok = await confirm({
                              title: 'מחיקת קטגוריה',
                              message: inUse > 0
                                ? <>הקטגוריה <strong>{cat}</strong> בשימוש ב-{inUse} מקומות. מחיקתה תסיר את ההתאמה האישית (אייקון וצבע), אך המקומות עצמם יישארו. להמשיך?</>
                                : <>האם למחוק את הקטגוריה <strong>{cat}</strong>?</>,
                              confirmText: 'מחק',
                              cancelText: 'בטל',
                              danger: true,
                            });
                            if (!ok) return;
                            categoryWrite(() => removeCategory(db, tripId, cat));
                          }}
                          style={{ border: 'none', background: 'transparent', color: 'var(--c-red)', cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 6 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {/* Icon picker: an emoji from the keyboard first, then
                        the icons. Picking either replaces the other. */}
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>אייקון, או אימוג'י מהמקלדת</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <EmojiField
                          value={s.emoji || ''}
                          color={color}
                          label={`אימוג'י ל${cat}`}
                          disabled={!canEdit}
                          onPick={(e) => categoryWrite(() => setCategoryEmoji(db, tripId, cat, e))}
                        />
                        {ICON_OPTIONS.map(({ key, Icon }) => {
                          const selected = !s.emoji && s.iconKey === key;
                          return (
                            <button key={key} type="button"
                              onClick={() => {
                                categoryWrite(() => setCategoryIcon(db, tripId, cat, key));
                              }}
                              title={key}
                              style={{
                                width: 38, height: 38, borderRadius: '50%', border: 'none',
                                background: selected ? color : 'var(--card-bg-solid)',
                                color: selected ? '#fff' : 'var(--text)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background-color 0.15s ease, transform 0.22s var(--ease-spring)',
                                transform: selected ? 'scale(1.06)' : 'none',
                              }}>
                              <Icon size={16} />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Color picker */}
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>צבע</span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {COLOR_OPTIONS.map(c => (
                          <button key={c} type="button"
                            onClick={() => {
                              categoryWrite(() => saveCategory(db, tripId, cat, { color: c }));
                            }}
                            style={{
                              width: 28, height: 28, borderRadius: '50%', padding: 0,
                              border: color === c ? '3px solid var(--primary)' : '2px solid rgba(255,255,255,0.5)',
                              background: c, cursor: 'pointer',
                              boxShadow: '0 1px 4px var(--ink-22)',
                              transform: color === c ? 'scale(1.18)' : 'scale(1)',
                              transition: 'transform 0.15s ease',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add new category */}
              {canEdit && (
                <div style={{ borderTop: '1px solid var(--ink-6)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>הוסף קטגוריה חדשה</span>
                  {!addingCatInSettings ? (
                    <button
                      type="button"
                      onClick={() => setAddingCatInSettings(true)}
                      className="chip add"
                      style={{ alignSelf: 'flex-start' }}
                    >
                      <Plus size={14} />
                      <span>קטגוריה</span>
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="שם הקטגוריה החדשה"
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const name = newCatName.trim();
                            if (!name) return;
                            categoryWrite(() => addCategory(db, tripId, name));
                            setNewCatName('');
                            setAddingCatInSettings(false);
                          }
                          if (e.key === 'Escape') { setAddingCatInSettings(false); setNewCatName(''); }
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            const name = newCatName.trim();
                            if (!name) return;
                            categoryWrite(() => addCategory(db, tripId, name));
                            setNewCatName('');
                            setAddingCatInSettings(false);
                          }}
                          className="btn-primary"
                          style={{ flex: 1, minHeight: 40, fontSize: 13 }}
                        >
                          הוסף
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAddingCatInSettings(false); setNewCatName(''); }}
                          className="btn-secondary"
                          style={{ minHeight: 40, padding: '0 16px', fontSize: 13 }}
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
        </Sheet>
      )}

      {/* Add/Edit Activity Slide-Up Bottom Sheet Modal */}
      {showActivityForm && (() => {
        const usedPlaceIds = new Set(
          days.flatMap(day =>
            (day.activities || [])
              .filter(a => a.placeId && a.id !== editingActivityId)
              .map(a => a.placeId)
          )
        );
        return (
          <Sheet
            title={editingActivityId ? 'עריכת פעילות' : 'הוספת פעילות ליום'}
            onClose={closeActivityForm}
            dirty={activityFormDirty()}
            style={{ maxHeight: '85vh' }}
          >
            {({ cancel }) => (
              <form onSubmit={handleActivitySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* === SECTION 1: Saved Places === */}
                <div style={{
                  background: 'var(--surface-2)',
                  border: 'none',
                  borderRadius: 18,
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>מקומות שמורים</span>

                  {savedPlaceSelections.map((sel, idx) => {
                    const placesForSel = sel.categoryFilter
                      ? plans.filter(p => p.category === sel.categoryFilter)
                      : plans;
                    const unusedPlaces = placesForSel.filter(p => !usedPlaceIds.has(p.id));
                    const usedPlaces = placesForSel.filter(p => usedPlaceIds.has(p.id));

                    return (
                      <div key={idx} style={{
                        display: 'flex', flexDirection: 'column', gap: 10,
                        borderBottom: idx < savedPlaceSelections.length - 1 ? '1px solid var(--p-8)' : 'none',
                        paddingBottom: idx < savedPlaceSelections.length - 1 ? 12 : 0
                      }}>
                        {/* Category row (+ remove button) */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <CustomDropdown
                              value={sel.categoryFilter}
                              onChange={(v) => updateSavedPlaceSelection(idx, 'categoryFilter', v)}
                              options={[
                                { value: '', label: 'כל הקטגוריות' },
                                ...categories.map(cat => ({ value: cat, label: cat }))
                              ]}
                              placeholder="בחר קטגוריה"
                            />
                          </div>
                          {savedPlaceSelections.length > 1 && (
                            <button type="button" className="btn-x danger" aria-label="הסר מקום" title="הסר מקום" onClick={() => removeSavedPlaceSelection(idx)}>
                              <X size={16} />
                            </button>
                          )}
                        </div>
                        {/* Place selector — full width so name + travel times are readable */}
                        <CustomDropdown
                          value={sel.placeId}
                          onChange={(v) => updateSavedPlaceSelection(idx, 'placeId', v)}
                          options={[
                            { value: '', label: 'בחר מקום' },
                            ...[...unusedPlaces].sort((a, b) => {
                              const order = { must: 0, optional: 1 };
                              return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
                            }).map(p => {
                              const originKey = p.distanceOriginId || 'hotel';
                              const cache = distanceCache[`${p.id}_${originKey}`];
                              const meta = travelMeta(cache);
                              const icon = priorityIcon(p.priority);
                              const labelColor = p.priority === 'must' ? 'var(--c-orange)' : p.priority === 'optional' ? 'var(--text-muted)' : undefined;
                              return { value: p.id, label: p.title, icon, meta, labelColor, visited: p.visited };
                            }),
                            ...(usedPlaces.length > 0 ? [
                              ...[...usedPlaces].sort((a, b) => {
                                const order = { must: 0, optional: 1 };
                                return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
                              }).map(p => {
                                const originKey = p.distanceOriginId || 'hotel';
                                const cache = distanceCache[`${p.id}_${originKey}`];
                                const meta = travelMeta(cache);
                                const icon = priorityIcon(p.priority);
                                const labelColor = p.priority === 'must' ? 'var(--c-orange)' : p.priority === 'optional' ? 'var(--text-muted)' : undefined;
                                return { value: p.id, label: `✓ ${p.title}`, icon, meta, labelColor, visited: p.visited, inUse: true };
                              })
                            ] : [])
                          ]}
                          placeholder="-- בחר מקום --"
                        />
                        {/* Time chips per row — when no place selected, they drive activityTimeLabel directly */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {['בוקר', 'צהריים', 'ערב', 'לילה'].map(label => {
                            const activeLabel = sel.placeId ? sel.timeLabel : activityTimeLabel;
                            const isActive = activeLabel === label;
                            return (
                              <button
                                key={label}
                                type="button"
                                onClick={() => {
                                  if (sel.placeId) {
                                    updateSavedPlaceSelection(idx, 'timeLabel', isActive ? '' : label);
                                  } else {
                                    setActivityTimeLabel(isActive ? '' : label);
                                  }
                                }}
                                style={{
                                  border: 'none',
                                  background: isActive ? 'var(--brand)' : 'var(--card-bg-solid)',
                                  color: isActive ? 'var(--brand-fg)' : 'var(--text)',
                                  borderRadius: 999,
                                  padding: '6px 12px',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'background-color 0.15s ease'
                                }}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {!editingActivityId && (
                    <button
                      type="button"
                      onClick={addSavedPlaceSelection}
                      className="chip add"
                      style={{ alignSelf: 'flex-start' }}
                    >
                      <Plus size={14} />
                      מקום שמור
                    </button>
                  )}
                </div>

                {/* === DIVIDER === */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--ink-10)' }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>הזנה ידנית</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--ink-10)' }} />
                </div>

                {/* === SECTION 2: Manual Entry === */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>שם הפעילות{savedPlaceSelections.some(s => s.placeId) ? ' (אופציונלי)' : ' *'}</label>
                  <input
                    type="text"
                    className="form-control"
                    value={activityTitle}
                    onChange={(e) => setActivityTitle(e.target.value)}
                    required={!savedPlaceSelections.some(s => s.placeId)}
                    placeholder="למשל: נסיעה ברכבת, ארוחת צהריים, ביקור במוזיאון"
                    style={{ minHeight: 40, fontSize: 14 }}
                  />
                </div>

                <CustomDropdown
                  label="קטגוריה"
                  value={activityCategory}
                  onChange={setActivityCategory}
                  options={categories}
                  addable
                  addLabel="הוסף קטגוריה חדשה"
                  onCommit={(newCat) => {
                    categoryWrite(() => addCategory(db, tripId, newCat));
                  }}
                />

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>תיוג זמן (שדה חופשי / בחירה מהירה)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="למשל: בוקר, 10:30, צהריים, 19:00"
                    value={activityTimeLabel}
                    onChange={(e) => setActivityTimeLabel(e.target.value)}
                    style={{ minHeight: 40, fontSize: 14 }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {['בוקר', 'צהריים', 'ערב', 'לילה'].map(label => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setActivityTimeLabel(label)}
                        style={{
                          border: 'none',
                          background: activityTimeLabel === label ? 'var(--brand)' : 'var(--card-bg-solid)',
                          color: activityTimeLabel === label ? 'var(--brand-fg)' : 'var(--text)',
                          borderRadius: 999, padding: '6px 12px', fontSize: 13,
                          fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s ease'
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>כתובת / מיקום</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="כתובת או קישור למפה"
                    value={activityAddress}
                    onChange={(e) => setActivityAddress(e.target.value)}
                    style={{ minHeight: 40, fontSize: 14 }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>הערות לפעילות זו</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    placeholder="הערות מיוחדות, מספרי הזמנה, שעות פתיחה..."
                    value={activityDescription}
                    onChange={(e) => setActivityDescription(e.target.value)}
                    style={{ resize: 'none', fontFamily: 'inherit', fontSize: 14 }}
                  />
                </div>

                <div className="sheet-footer">
                  <button type="submit" className="btn-primary">שמור</button>
                  <button type="button" onClick={cancel} className="btn-secondary">ביטול</button>
                </div>

              </form>
            )}
          </Sheet>
        );
      })()}

      {/* Hourly weather popup */}
      {hourlyWeatherDate && (
        <Sheet label="מזג אוויר לפי שעה" onClose={() => setHourlyWeatherDate(null)} title={(
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
                  {(() => {
                    const d = localDay(hourlyWeatherDate) || new Date(hourlyWeatherDate);
                    const dow = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][d.getDay()];
                    return `יום ${dow} ${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`;
                  })()}
                </span>
                {weatherByDate[hourlyWeatherDate] && (
                  <Pill size="sm" tone="butter">
                    {weatherByDate[hourlyWeatherDate].max}° / {weatherByDate[hourlyWeatherDate].min}°
                  </Pill>
                )}
              </span>
        )}>
            <div className="hide-scroll" style={{
              overflowX: 'auto',
              marginInline: -16, padding: '0 16px 4px',
              display: 'flex', gap: 8,
              scrollSnapType: 'x proximity',
            }}>
              {(weather?.hourlyByDate?.[hourlyWeatherDate] || [])
                .filter((_, i) => i % 2 === 0)
                .map(h => (
                <div key={h.hour} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '10px 6px', minWidth: 62, flexShrink: 0,
                  borderRadius: 18, background: 'var(--surface-2)',
                  scrollSnapAlign: 'start',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                    {String(h.hour).padStart(2,'0')}:00
                  </span>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{getWeatherIcon(h.code)}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{h.temp}°</span>
                  {h.rain > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: h.rain >= 50 ? 'var(--c-blue)' : 'var(--text-muted)' }}>
                      💧{h.rain}%
                    </span>
                  )}
                </div>
              ))}
            </div>
        </Sheet>
      )}

      {/* Activity details — a bottom sheet like the place details: what it
          is, when, where, the place it comes from, and what you can do. */}
      {activityDetail && (
        (() => {
          const { __dayId: actDayId, ...act } = activityDetail;
          const linked = act.placeId ? plans.find(p => p.id === act.placeId) : null;
          const booked = linked && bookedPlaceIds.has(linked.id);
          const addressUrl = act.address
            ? (/^https?:\/\//i.test(act.address) ? act.address : `https://maps.google.com/?q=${encodeURIComponent(act.address)}`)
            : null;
          const navUrl = addressUrl || (linked ? getPlanLocations(linked)[0]?.url : null);
          const close = () => setActivityDetail(null);
          const actions = [];
          if (navUrl) actions.push({ key: 'nav', label: 'ניווט', Icon: Navigation, tone: 'mint', run: () => window.open(navUrl, '_blank', 'noreferrer') });
          if (linked) actions.push({ key: 'place', label: 'פרטי המקום', Icon: MapPin, tone: 'lavender', run: () => { close(); openPlanDetail(linked.id); } });
          if (actDayId && (canEdit || (canAdd && creatorOf(act) === currentUid))) actions.push({ key: 'edit', label: 'עריכה', Icon: Pencil, tone: '', run: () => { close(); handleStartEditActivity(actDayId, act); } });
          return (
            <Sheet label={act.title} onClose={close} header={({ close: closeSheet }) => (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <CategoryDisc color={getCategoryColor(act.category)} size={48} radius={16}>
                    {getCategoryIcon(act.category, 22)}
                  </CategoryDisc>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', margin: 0, lineHeight: 1.25, wordBreak: 'break-word' }}>
                      {act.title}
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {act.timeLabel && <Pill size="sm" tone="sky">{act.timeLabel}</Pill>}
                      {act.category && <Pill size="sm" style={{ background: `${getCategoryColor(act.category)}1F` }}>{act.category}</Pill>}
                      {linked?.priority === 'must' && <Pill size="sm" tone="butter" icon={<Star size={11} className="star-must" />}>חובה</Pill>}
                      {booked
                        ? <Pill size="sm" tone="mint" icon={<Check size={11} strokeWidth={3} />}>הוזמן</Pill>
                        : linked?.needsReservation && <Pill size="sm" tone="red" icon={<CalendarCheck size={11} />}>צריך לסגור מראש</Pill>}
                    </div>
                  </div>
                  <button type="button" aria-label="סגור" className="btn-close" onClick={closeSheet} style={{ flexShrink: 0 }}>✕</button>
                </div>
              )}>

                {act.description && (
                  <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.55, margin: 0, wordBreak: 'break-word' }}>
                    {act.description}
                  </p>
                )}

                {act.address && (
                  <a href={addressUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 16 }}>
                      <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, background: 'var(--mint)', color: 'var(--c-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <MapPin size={17} />
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', wordBreak: 'break-word' }}>
                        {/^https?:\/\//i.test(act.address) ? 'פתח בגוגל מפות' : act.address}
                      </span>
                    </div>
                  </a>
                )}

                {!act.description && !act.address && !linked && (
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
                    אין עוד פרטים לפעילות הזו.{actDayId && (canEdit || (canAdd && creatorOf(act) === currentUid)) ? ' אפשר להוסיף שעה, כתובת והערות בעריכה.' : ''}
                  </p>
                )}

                {actions.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${actions.length}, 1fr)`, gap: 8, marginTop: 2 }}>
                    {actions.map(({ key, label, Icon, tone, run }) => (
                      <button key={key} type="button" onClick={run} className="action-tile" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)',
                        fontFamily: 'var(--font-hebrew)', fontSize: 12.5, fontWeight: 700,
                      }}>
                        <span className={`round-btn ${tone}`} style={{ width: 50, height: 50, minWidth: 50 }}><Icon size={20} /></span>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
            </Sheet>
          );
        })()
      )}

    </div>
  );
}

/* ── Drag-and-drop helpers for day reordering ─────────────────────────── */

const DragHandleContext = React.createContext(null);

/* One day, memoized.
 *
 * Collapsing a day used to re-render every other day with it: the state
 * lives in PlanningTab, so React walked the whole list and re-applied the
 * inline style of every element in it. The profiler put `setValueForStyle`
 * at the top of a toggle — not the component's own logic, but React
 * writing styles back onto DOM nodes that had not changed. With this
 * memo the other days bail out and none of that work happens.
 *
 * Every prop below therefore has to be reference-stable across renders,
 * or the memo never holds: the handlers are useCallback'd in the parent
 * and the setters come from useState, which React keeps stable.
 */
const DayCard = React.memo(function DayCard({
  day, plans, bookedPlaceIds, canEdit, canAdd, currentUid,
  /* Booleans, not the Sets they come from. Passing `collapsedDays` itself
     meant every card got a brand-new Set on every toggle and the memo
     never held — which is exactly what the first attempt measured: no
     change at all. Only the toggled day's booleans move now. */
  isSummary, dayBodyShown, isEditing, editingDayTitle, isArrived,
  dayLayout, collapsedTimeGroups,
  weatherByDate, distanceCache, dayNodes,
  getCategoryColor, getCategoryIcon,
  setCollapsedDays, setOpenSummaryDays, setCollapsedTimeGroups,
  setEditingDayId, setEditingDayTitle, setActivityDetail, setHourlyWeatherDate,
  handleSaveDayTitle, handleDeleteDay, handleOpenAddActivity,
  handleStartEditActivity, handleDeleteActivity, moveActivity,
}) {
  // The activity whose ⋯ actions sheet is open (with its neighbours, for moving).
  const [actMenu, setActMenu] = useState(null);
  // "הוספה": adds activities, and changes only their own (firestore.rules).
  const mine = (act) => canEdit || (canAdd && creatorOf(act) === currentUid);
        return (
        <SortableDayCard
          key={day.id}
          id={day.id}
          compact={isSummary}
          className={isArrived ? 'highlight-pulse' : ''}
          innerRef={(node) => {
            if (node) dayNodes.current.set(day.id, node);
            else dayNodes.current.delete(day.id);
          }}
        >
          {/* Day Header — whole row toggles collapse (inner controls stop propagation) */}
          <div
            onClick={() => {
              if (isEditing) return;
              if (dayLayout === 'summary') {
                setOpenSummaryDays(prev => {
                  const next = new Set(prev);
                  next.has(day.id) ? next.delete(day.id) : next.add(day.id);
                  return next;
                });
                return;
              }
              setCollapsedDays(prev => {
                const next = new Set(prev);
                next.has(day.id) ? next.delete(day.id) : next.add(day.id);
                return next;
              });
            }}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              // A summary row is one line; a rule under it would
              // read as a divider between days, not part of one.
              paddingBottom: isSummary ? 0 : 2,
              minHeight: isSummary ? 28 : 36,
              cursor: isEditing ? 'default' : 'pointer',
            }}>
            {isEditing ? (
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSaveDayTitle(day.id, editingDayTitle); }} 
                style={{ display: 'flex', gap: 6, width: '100%' }}
                onClick={(e) => e.stopPropagation()}
              >
                <input 
                  className="form-control" 
                  style={{ padding: '4px 8px', fontSize: 14, minHeight: 32, flex: 1 }} 
                  value={editingDayTitle} 
                  onChange={e => setEditingDayTitle(e.target.value)} 
                  required 
                />
                <button type="submit" className="round-btn on" aria-label="שמור" title="שמור"><Check size={16} /></button>
                <button type="button" className="btn-x" aria-label="ביטול" title="ביטול" onClick={() => setEditingDayId(null)}><X size={16} /></button>
              </form>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  {canEdit && <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex' }}><DayDragHandle /></span>}
                  <h3 style={{ fontSize: isSummary ? 16 : 19, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>{day.title}</h3>
                  {day.date && (() => {
                    const [, mm, dd] = day.date.split('-');
                    const dowIdx = (localDay(day.date) || new Date(day.date)).getDay();
                    const dow = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'][dowIdx];
                    const dayW = weatherByDate[day.date];
                    return (<>
                      <Pill size="sm" tone="sky">{`${dow} ${dd}.${mm}`}</Pill>
                      {dayW && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setHourlyWeatherDate(day.date); }}
                          style={{
                            fontSize: 11.5, fontWeight: 700, flexShrink: 0,
                            background: 'var(--butter)',
                            border: 'none',
                            borderRadius: 999, padding: '3px 8px',
                            display: 'flex', alignItems: 'center', gap: 3,
                            color: 'var(--text)', cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          <span style={{ fontSize: 13, lineHeight: 1 }}>{getWeatherIcon(dayW.code)}</span>
                          <span>{dayW.max}°/{dayW.min}°</span>
                          {dayW.rain > 0 && <span style={{ color: 'var(--c-blue)' }}>💧{dayW.rain}%</span>}
                        </button>
                      )}
                    </>);
                  })()}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {canEdit && !isSummary && (<>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingDayId(day.id); setEditingDayTitle(day.title); }}
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                    title="ערוך כותרת יום"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteDay(day.id); }}
                    style={{ border: 'none', background: 'transparent', color: 'var(--c-red)', cursor: 'pointer', padding: 4 }}
                    title="מחק יום"
                  >
                    <Trash2 size={15} />
                  </button>
                  </>)}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const setter = dayLayout === 'summary' ? setOpenSummaryDays : setCollapsedDays;
                      setter(prev => {
                        const next = new Set(prev);
                        next.has(day.id) ? next.delete(day.id) : next.add(day.id);
                        return next;
                      });
                    }}
                    aria-label={dayBodyShown ? 'סגור יום' : 'פתח יום'}
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, transition: 'transform 0.2s', transform: dayBodyShown ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                    title={dayBodyShown ? 'סגור יום' : 'פתח יום'}
                  >
                    <ChevronDown size={18} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Summary layout: the whole day on one muted line —
              how many activities, and the first couple by time.
              Enough to answer "what is on Thursday?" without
              opening anything. */}
          {isSummary && (() => {
            const acts = day.activities || [];
            if (acts.length === 0) {
              return (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  אין פעילויות
                </span>
              );
            }
            const shown = acts.slice(0, 2);
            const rest = acts.length - shown.length;
            return (
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 6,
                fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                minWidth: 0,
              }}>
                <span style={{ fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
                  {acts.length} פעילויות
                </span>
                <span style={{ color: 'var(--ink-22)', flexShrink: 0 }}>·</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {shown.map(a => [a.timeLabel, a.title].filter(Boolean).join(' ')).join(' · ')}
                  {rest > 0 && ` +${rest}`}
                </span>
              </div>
            );
          })()}

          {/* Day Activities + Add Button (collapsed when toggled) */}
          {dayBodyShown && <>
          <div className="day-body" style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
            {(() => {
            const dayActs = day.activities || [];
            const timeGroups = groupActivitiesByTime(dayActs);
            const showTimeHeaders = dayActs.some(a => (a.timeLabel || '').trim());

            const renderActivityRow = (act, actIdx, groupList) => {
              const isFirst = actIdx === 0;
              const isLast = actIdx === groupList.length - 1;
              const prevActId = groupList[actIdx - 1]?.id ?? null;
              const nextActId = groupList[actIdx + 1]?.id ?? null;
              const linkedPlan = plans.find(p => act.placeId ? p.id === act.placeId : p.title === act.title);
              const isVisited = linkedPlan?.visited === true;

              return (
                <div key={act.id} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative',
                  // The timeline line already links the activities; a coloured
                  // rule between them read as a divider, so it is gone.
                  paddingTop: isFirst ? 0 : 6,
                  paddingBottom: isLast ? 0 : 6,
                }}>
                  {/* Timeline vertical node and line */}
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    flexShrink: 0, 
                    position: 'relative', 
                    height: '100%', 
                    alignSelf: 'stretch'
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: `${getCategoryColor(act.category)}1F`,
                      color: getCategoryColor(act.category),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      zIndex: 2,
                    }}>
                      {getCategoryIcon(act.category, 15)}
                    </div>
                    {!isLast && (
                      <div style={{
                        position: 'absolute',
                        top: 28,
                        bottom: -24,
                        width: 2,
                        background: 'var(--ink-6)',
                        zIndex: 1
                      }} />
                    )}
                  </div>

                  {/* Activity row — a quiet tile inside the day card */}
                  <div style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    padding: '11px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    borderRadius: 16,
                    background: 'var(--surface-2)',
                    opacity: isVisited ? 0.6 : 1,
                  }}>
                    {(() => {
                      // Compute travel-time chips once — reused below the title.
                      let chips = null;
                      if (act.placeId && hasGmapsKey()) {
                        const linkedPlan = plans.find(p => p.id === act.placeId);
                        const originKey = linkedPlan?.distanceOriginId || 'hotel';
                        const cache = distanceCache[`${act.placeId}_${originKey}`];
                        if (cache && !cache.loading && !cache.error && !cache.noLocation && (cache.walk || cache.transit)) {
                          chips = (
                            <>
                              {cache.walk && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-green)', background: 'var(--c-green-10)', padding: '3px 7px', borderRadius: 6, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                  <Footprints size={12} aria-hidden="true" /> {cache.walk.duration}
                                </span>
                              )}
                              {cache.transit && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--p-8)', padding: '3px 7px', borderRadius: 6, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                  <Bus size={12} aria-hidden="true" /> {cache.transit.duration}
                                </span>
                              )}
                            </>
                          );
                        }
                      }
                      const linkedPlace = act.placeId ? plans.find(pl => pl.id === act.placeId) : null;
                      const titleColor =
                        linkedPlace?.priority === 'optional' ? 'var(--text-muted)' : 'var(--text)';
                      return (
                        <>
                          {/* Row 1: time badge + title (single line, ellipsis) + controls */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {isVisited && <Pill size="sm" tone="muted">✓ בוצע</Pill>}
                              {!isVisited && act.timeLabel && !showTimeHeaders && (
                                <Pill size="sm" tone="sky" style={{ background: 'var(--card-bg-solid)' }}>{act.timeLabel}</Pill>
                              )}
                              {isVisited && act.timeLabel && !showTimeHeaders && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                                  flexShrink: 0,
                                }}>
                                  {act.timeLabel}
                                </span>
                              )}
                              {linkedPlace?.priority === 'must' && !isVisited && (
                                <Star size={13} className="star-must" style={{ flexShrink: 0 }} aria-label="חובה" />
                              )}
                              <h4
                                onClick={() => setActivityDetail({ ...act, __dayId: day.id })}
                                style={{
                                  fontSize: 15, fontWeight: 800, color: isVisited ? 'var(--text-muted)' : titleColor, margin: 0,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  minWidth: 0, cursor: 'pointer',
                                  textDecoration: 'none',
                                }}
                              >
                                {act.title}
                              </h4>
                              {linkedPlace && !isVisited && (bookedPlaceIds.has(linkedPlace.id) || linkedPlace.needsReservation) && (
                                <span title={bookedPlaceIds.has(linkedPlace.id) ? 'הוזמן' : 'צריך לסגור / להזמין מראש'} style={{
                                  display: 'flex', flexShrink: 0,
                                  color: bookedPlaceIds.has(linkedPlace.id) ? 'var(--c-green)' : 'var(--c-red)',
                                }}>
                                  <CalendarCheck size={13} />
                                </span>
                              )}
                            </div>

                            {/* One ⋯ instead of four small icons: the name gets the
                                row, and the actions open in a sheet (below). */}
                            {mine(act) && (
                              <button
                                type="button"
                                aria-label={`פעולות: ${act.title}`}
                                onClick={() => setActMenu({ act, prevActId, nextActId, isFirst, isLast })}
                                className="round-btn"
                                style={{ width: 32, height: 32, minWidth: 32, background: 'var(--card-bg-solid)', color: 'var(--text-muted)' }}
                              >
                                <MoreHorizontal size={17} />
                              </button>
                            )}
                          </div>

                          {act.description && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 3 }}>
                              <MessageSquare size={11} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }} />
                              <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.35, wordBreak: 'break-word' }}>
                                {act.description}
                              </span>
                            </div>
                          )}

                          {/* Row 2: address link + travel-time chips */}
                          {(act.address || chips) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                              {act.address && (
                                <a
                                  href={/^https?:\/\//i.test(act.address) ? act.address : `https://maps.google.com/?q=${encodeURIComponent(act.address)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    fontSize: 11, color: 'var(--accent)', fontWeight: 700,
                                    display: 'flex', alignItems: 'center', gap: 3,
                                    textDecoration: 'none', minWidth: 0,
                                  }}
                                >
                                  <MapPin size={11} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{act.address}</span>
                                  <ExternalLink size={10} />
                                </a>
                              )}
                              {chips}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            };

            // No time labels at all — keep the flat timeline as before
            if (!showTimeHeaders) {
              return dayActs.map((act, i) => renderActivityRow(act, i, dayActs));
            }

            // Grouped by time of day, each group collapsible as one unit
            return timeGroups.map(g => {
              const gKey = `${day.id}|${g.label}`;
              const isGroupCollapsed = collapsedTimeGroups.has(gKey);
              return (
                <div key={gKey} style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => setCollapsedTimeGroups(prev => {
                      const next = new Set(prev);
                      next.has(gKey) ? next.delete(gKey) : next.add(gKey);
                      return next;
                    })}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 4px', marginBottom: isGroupCollapsed ? 0 : 8,
                      borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: 'transparent', fontFamily: 'inherit',
                    }}
                  >
                    {(() => {
                      const GroupIcon = TIME_GROUP_ICONS[g.label] || (g.label ? Clock : Pin);
                      return <GroupIcon size={15} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />;
                    })()}
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                      {g.label || 'ללא תיוג זמן'}
                    </span>
                    {/* Pushed to the row's end so counts align across groups */}
                    <span style={{
                      fontSize: 11, fontWeight: 800, color: 'var(--text)',
                      background: 'var(--surface-2)', padding: '2px 0',
                      borderRadius: 999, lineHeight: 1.4,
                      marginInlineStart: 'auto', flexShrink: 0,
                      width: 26, textAlign: 'center',
                    }}>
                      {g.acts.length}
                    </span>
                    <ChevronDown
                      size={16}
                      style={{
                        color: 'var(--text-muted)', flexShrink: 0,
                        transition: 'transform 0.2s',
                        transform: isGroupCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      }}
                    />
                  </button>
                  {!isGroupCollapsed && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {g.acts.map((act, i) => renderActivityRow(act, i, g.acts))}
                    </div>
                  )}
                </div>
              );
            });
            })()}

            {(day.activities || []).length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0', margin: 0 }}>
                אין עדיין פעילויות ליום זה.
              </p>
            )}
          </div>

          {/* Add Activity Button */}
          {canAdd && (
          <button
            onClick={() => handleOpenAddActivity(day.id)}
            className="btn-secondary"
            style={{
              width: '100%',
              minHeight: 44,
              padding: 10,
              fontSize: 14,
              fontWeight: 800,
              border: 'none',
              borderRadius: 16,
              background: 'var(--surface-2)',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer'
            }}
          >
            <Plus size={14} />
            <span>הוסף פעילות</span>
          </button>
          )}
          </>}

          {actMenu && (
            <Sheet title={actMenu.act.title} onClose={() => setActMenu(null)}>
              <div className="list-group">
                {[
                  // Moving reorders the others too: an editor's.
                  ...(canEdit ? [
                  { key: 'up', label: 'הזז למעלה', Icon: ArrowUp, disabled: actMenu.isFirst,
                    run: () => moveActivity(day.id, actMenu.act.id, -1, actMenu.prevActId) },
                  { key: 'down', label: 'הזז למטה', Icon: ArrowDown, disabled: actMenu.isLast,
                    run: () => moveActivity(day.id, actMenu.act.id, 1, actMenu.nextActId) },
                  ] : []),
                  { key: 'edit', label: 'עריכה', Icon: Pencil,
                    run: () => handleStartEditActivity(day.id, actMenu.act) },
                  { key: 'del', label: 'מחיקה', Icon: Trash2, danger: true,
                    run: () => handleDeleteActivity(day.id, actMenu.act.id) },
                ].map(({ key, label, Icon, disabled, danger, run }) => (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    className={`list-row${danger ? ' danger' : ''}`}
                    onClick={() => { setActMenu(null); run(); }}
                  >
                    <Icon size={18} className="list-row-icon" />
                    <span className="list-row-label">{label}</span>
                  </button>
                ))}
              </div>
            </Sheet>
          )}
        </SortableDayCard>

  );
});

function SortableDayCard({ id, children, innerRef, className = '', compact = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  // dnd-kit owns one ref and the scroll-to-new-day needs another.
  const setRefs = (node) => {
    setNodeRef(node);
    innerRef?.(node);
  };
  return (
    <DragHandleContext.Provider value={listeners}>
      <div
        ref={setRefs}
        {...attributes}
        className={`glass-card day-card${className ? ' ' + className : ''}`}
        style={{
          padding: compact ? '12px 14px' : 16,
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? 6 : 12,
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.45 : 1,
          boxShadow: isDragging ? '0 8px 32px var(--ink-18)' : undefined,
          zIndex: isDragging ? 10 : undefined,
          position: 'relative',
        }}
      >
        {children}
      </div>
    </DragHandleContext.Provider>
  );
}

function DayDragHandle() {
  const listeners = React.useContext(DragHandleContext);
  return (
    <button
      type="button"
      {...listeners}
      style={{
        border: 'none',
        background: 'transparent',
        color: 'var(--text-muted)',
        cursor: 'grab',
        padding: '4px 2px',
        display: 'flex',
        alignItems: 'center',
        touchAction: 'none',
        flexShrink: 0,
        opacity: 0.5,
      }}
      title="גרור לשינוי סדר"
    >
      <GripVertical size={16} />
    </button>
  );
}
