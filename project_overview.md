# Flights-Assistant — Project Overview & Architecture

## Introduction
Flights-Assistant is a mobile-first, premium Progressive Web Application (PWA) designed to assist travelers in planning, tracking, and managing their flight and hotel bookings, packing checklists, trip itineraries, and travel expenses. The app is optimized for mobile screens, supports full offline capability, synchronizes with Firestore in real-time, and supports collaborative editing between users.

**Live URL:** https://listify-84018.web.app  
**Current Version:** 7.2.0

---

## Technical Stack & Architecture

### Frontend Layer
- **React 19 + Vite**: Modern React application with Vite for fast HMR and high-performance production builds.
- **RTL (Right-to-Left)**: Fully localized for Hebrew — all layouts, inputs, and flex directions adhere to RTL standards.
- **Lucide React**: Lightweight SVG icon library.

### Data & Synchronization Layer
- **Firebase Firestore** with `initializeFirestore` + `persistentLocalCache` + `persistentMultipleTabManager`:
  - Offline-first: writes queue locally across multiple browser tabs and auto-sync on reconnect.
  - Each trip: `/trips/{tripId}` (root doc)
  - Subcollections: `planning`, `checklist`, `days`, `expenses`, `info`
  - Settings subcollection: `trips/{tripId}/settings/categories` (category icon/color), `trips/{tripId}/settings/checklistSync` (deleted global IDs)
  - User profiles: `/users/{uid}` — stores `globalChecklist` template, `tripIds`, display info
- **Multi-User Collaboration**: Role-based access (owner / editor / viewer) enforced by Firestore security rules and mirrored in the UI via `TripContext`.
- **Currency Rates**: `src/services/currency.js` — fetches and caches exchange rates; exposes `convert()` and `refreshRatesIfStale()`.

### PWA Capabilities
- **vite-plugin-pwa** + Workbox `generateSW` mode: pre-caches all static assets.
- **Web App Manifest**: standalone window mode, themed splash, custom icons.

---

## Firestore Security Rules
- `/users/{uid}`: any signed-in user can read profiles (for sharing lookups); only the user themselves can write their own doc.
- `/trips/{tripId}`: role-based read/write. Owners have full control; editors can modify content but not membership; viewers are read-only; any member can self-remove.
- `/trips/{tripId}/{subcollection}/{docId}`: members can read; owners/editors/members can write.

---

## Styling & Design System (`index.css`)
Custom glassmorphic design system:
- **Colors**: Primary Navy `#0b0b30`, Accent Indigo `#4f46e5`, Success Green `#059669`, gradient background `#e0e7ff → #fae8ff`.
- **Glassmorphism**: `.glass-card` — `rgba` fills, white border, `backdrop-filter: blur(16px)`.
- **Micro-animations**: `.highlight-pulse` glow, FLIP card reorder animation (gated on order change only).

---

## Key Components

### `App.jsx`
Central state controller and shell. Handles Google Auth, trip list, multi-user sharing, and the `GlobalChecklistModal` for managing the permanent packing template (`globalChecklist` stored per user in Firestore). Passes `globalChecklist` prop to `ChecklistTab` so the tab can auto-sync missing items.

### `FlightTab.jsx`
Outbound + return flight cards with live status, aircraft details, gate info, and a Leaflet map showing the flight path. Auto-queries the local flight simulator when flight number + date are entered.

### `CustomDatePicker.jsx`
Custom Hebrew RTL calendar and datetime picker — replaces native OS pickers to preserve theme aesthetics. Exposes `CustomDatePicker`, `CustomDateTimePicker`, and `CustomDropdown`. RTL positioning bug fixed: uses `right: 'auto'` in inline styles to prevent popup misalignment.

### `PlanningTab.jsx`
Two sub-tabs:
- **אטרקציות ומקומות** (pool): collapsible plan cards with FLIP reorder animation, visited toggle, description preview in collapsed state, quick-access Navigation button (opens location directly or shows multi-location modal), category filter chips (only used categories shown). Expanded card shows 🚶/🚌 travel-time chips (walk + transit duration from the configured origin).
- **לוח זמנים יומי**: day-by-day timeline with drag-and-drop day reordering (`@dnd-kit`). Each activity row shows a 🚶/🚌 chip beside its Maps address. Smart day generation: "ייצר ימים לפי טיסה" button creates day cards from outbound→return dates; after sync shows a ✓ indicator; detects date drift and offers "עדכן ימים לפי טיסה". D&D semantics: only activities travel with the dragged day — title and date are positional anchors.
- **Distance origin picker**: always visible in item edit form (no API key required to set preference); travel-time fetches use Google Maps Routes API + Places API (`VITE_GOOGLE_MAPS_KEY`).
- **Category customization**: gear button opens a modal to set icon + color per category; settings stored in `trips/{tripId}/settings/categories`.

### `ChecklistTab.jsx`
Packing checklist synced with Firestore. Collapsible categories. Auto-syncs new items from the user's global template: on mount, any `globalChecklist` items missing from the trip's checklist are batch-written to Firestore. Intentionally deleted global items are tracked in `trips/{tripId}/settings/checklistSync.deletedGlobalIds`.

**Reminders carousel** (`RemindersCard`): randomly shuffled on load, auto-advances every 3 seconds with a fade-up animation. Swipeable (touch). Count badge shows current position. "כל התזכורות" button opens a bottom sheet with the full list as checkable items; each row shows the author's avatar. Bottom sheet floats above the navigation bar.

### `ExpensesTab.jsx`
Travel expense tracker:
- Expenses grouped by **category** in collapsible sections; category header shows count + ILS total estimate.
- **Expense form** split into two sections with "— או —" divider: "בחירה מרשימת הטיול" (auto-fills category from plan item) vs "הוספה ידנית" (free description + category dropdown + custom location).
- **ILS snapshot**: foreign-currency expenses store the ILS equivalent at the time of entry (`ilsSnapshot`); displayed as `≈ ₪X` on each card, fixed permanently.
- **Summary panel**: per-currency totals + total ILS estimate + per-person (÷2) row.
- Category dropdown includes planning-tab categories for cross-tab consistency.

### `InfoTab.jsx`
Important trip information and contacts. Each item supports **extra fields** (text, phone, address, URL, number types). Phone/address/URL fields render as tappable links. Number fields open numeric keyboard on mobile.

### `exportTrip.js`
Exports trip data to PDF (jsPDF), Word (docx), and Excel (ExcelJS). Price column removed; text size and color optimized for legibility.

### `TripContext.jsx`
React context exposing `tripId`, `canEdit`, `isOwner`, `role`, and `ownerProfile` to all tab components.

### `ConfirmContext.jsx`
App-wide styled confirm dialog via `useConfirm()` hook — replaces native `window.confirm` throughout the app.

---

## Firestore Data Model (summary)

```
/users/{uid}
  displayName, email, photoURL
  globalChecklist: [{id, text, category, completed}]
  tripIds: [...]          # legacy field, kept for migration

/trips/{tripId}
  name, destination, dates
  members: { uid: 'owner'|'editor'|'viewer' }
  memberIds: [uid, ...]
  outboundFlightDetails, returnFlightDetails, hotelDetails

  /planning/{planId}
    title, category, description, address, price, links, visited

  /days/{dayId}
    title, date, order
    activities: [{id, title, category, timeLabel, address, description, placeId}]

  /checklist/{itemId}
    text, category, completed

  /expenses/{expenseId}
    amount, currency, category, description
    linkedPlanId, customPlace
    ilsSnapshot          # ILS equivalent at time of entry (foreign currencies)
    createdAt

  /info/{infoId}
    title, value, type, category
    extraFields: [{id, label, type, value}]

  /settings/categories
    {[categoryName]: {iconKey, color}}

  /settings/checklistSync
    deletedGlobalIds: [id, ...]

  plannerDaysFromFlight: {out, ret}   # stored on trip root doc for sync indicator
```

---

## Environment Variables
| Variable | Purpose |
|---|---|
| `VITE_AERODATABOX_KEY` | RapidAPI key for AeroDataBox — live flight status |
| `VITE_GOOGLE_MAPS_KEY` | Google Cloud key — Routes API + Places API (travel times) |

Both are set in `.env.local` (gitignored). The app builds and runs without them but travel-time chips and live flight lookup will be disabled.

