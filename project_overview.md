# Flights-Assistant — Project Overview & Architecture

## Introduction
Flights-Assistant is a mobile-first, premium Progressive Web Application (PWA) designed to assist travelers in planning, tracking, and managing their flight and hotel bookings, packing checklists, trip itineraries, and travel expenses. The app is optimized for mobile screens, supports full offline capability, synchronizes with Firestore in real-time, and supports collaborative editing between users.

**Live URL:** https://listify-84018.web.app  
**Current Version:** 7.4.0

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
- **Weather Data**: `src/hooks/useWeather.js` — fetches current + hourly + 16-day daily forecast from Open-Meteo (free, no API key). Cached in localStorage for 1 hour; service worker also caches (StaleWhileRevalidate). Exports `useWeather(lat, lon)`, `getWeatherIcon(code)`, `getWeatherLabel(code)`.

### PWA Capabilities
- **vite-plugin-pwa** + Workbox `generateSW` mode: pre-caches all static assets.
- **Web App Manifest**: standalone window mode, themed splash, custom icons. Shortcuts: "הטיולים שלי" and "המרת מטבעות" (long-press on Android).
- **Offline resilience**: Firestore writes are fire-and-forget (UI updates immediately, writes queue in local cache). `visibilitychange` + `online` events re-enable Firestore network and check for SW updates. Offline banner shown when connectivity is lost.
- **Runtime caching**: Google Fonts, Leaflet tiles, currency rates, Open-Meteo weather API all cached by the service worker.

---

## Firestore Security Rules
- `/users/{uid}`: any signed-in user can read profiles (for sharing lookups); only the user themselves can write their own doc.
- `/trips/{tripId}`: role-based read/write. Owners have full control; editors can modify content but not membership; viewers are read-only; any member can self-remove.
- `/trips/{tripId}/{subcollection}/{docId}`: members can read; owners/editors/members can write.

---

## Styling & Design System (`index.css`)
Custom glassmorphic design system:
- **Colors**: Primary Navy `#0b0b30`, Accent Indigo `#4f46e5` (default), Success Green `#059669`, gradient background `#e0e7ff → #fae8ff`.
- **Theme switching**: `data-theme="dark"` on `<html>` activates dark-mode overrides; `data-accent="X"` activates a palette block. 7 palettes: indigo (default), violet, sky, teal, emerald, amber, rose — each defines `--accent`, `--accent-rgb`, `--primary`, `--accent-gradient`.
- **`--accent-rgb`**: Single source for all `--p-*` tints (`rgba(var(--accent-rgb), alpha)`); swapping it recolors the entire app.
- **Glassmorphism**: `.glass-card` — `rgba` fills, white border, `backdrop-filter: blur(16px)`.
- **Type ladder**: 11 steps — 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 26 — documented at the top of `index.css`. Sizes are written literally at the ~475 call sites (almost all inline styles), so the ladder is the reference rather than a token set: a value that isn't on it is a mistake, not a nuance. Half-steps (9.5, 12.5, 14.5 …) are what an un-owned scale drifts into.
- **Micro-animations**: `.highlight-pulse` glow, FLIP card reorder animation (gated on order change only).
- **Nav geometry**: `--nav-height` / `--nav-gap` / `--nav-total` drive both the floating bar and every offset that has to clear it (content padding, the FAB). A custom property resolves its `var()`s where it is *declared*, so the desktop block redeclares `--nav-total` alongside `--nav-height` on `.app-container` — overriding only the height would leave the `:root` copy on the mobile value.

---

## Key Components

### `App.jsx`
Central state controller and shell. Handles Google Auth, trip list, multi-user sharing, and the `GlobalChecklistModal`. Contains `PalettePicker` component (palette selector popover) placed next to the dark/light toggle in both home and trip headers.

### `ThemeContext.jsx`
Provides `isDark` / `toggleTheme` / `accent` / `setAccent`. Persists both values to `localStorage` and sets `data-theme` / `data-accent` on `<html>`. Exports `PALETTES` array (7 entries with `key`, `label`, `swatch`).

### `FlightTab.jsx`
Outbound + return flight cards with live status, aircraft details, gate info, and a Leaflet map showing the flight path. Auto-queries the local flight simulator when flight number + date are entered. Map card includes a live weather section: current conditions at the destination + scrollable forecast strip for each trip day (icon, high/low, rain %). Currency converter positioned below hotel details.

### `CustomDatePicker.jsx`
Custom Hebrew RTL calendar and datetime picker. Exposes `CustomDatePicker`, `CustomDateTimePicker`, and `CustomDropdown`. `CustomDropdown` supports an optional `meta` string per option — rendered as small secondary text on the left of each dropdown row (not shown in the trigger button). RTL positioning: uses `right: 'auto'` in inline styles.

### `PlanningTab.jsx`
Two sub-tabs:

**אטרקציות ומקומות (pool):**
- **Grid tiles (`רשת`)** get their own minimal layout: name (2-line clamp), a small category icon, and at most one tiny flag (amber star for "חובה", ✨ for an event today; a green check replaces the icon once visited). No checkbox, no chips, no badges — the details sheet holds every action. Grid rows use `alignItems: 'stretch'` so tiles line up.
- **Text-first place cards**: a list card is one row — visited toggle, category icon, title, a single quiet meta line (category / event date · travel time · link count) and a chevron. No action buttons on the card itself; tapping it opens the details sheet. FLIP reorder animation kept for the visited-sinks-to-bottom move.
- **Place details sheet** (`detailPlanId`): bottom sheet with the description, travel times, every location/link as a tappable row, who added the place, and a fixed action footer — ניווט / עריכה / עדיפות / מחיקה plus a full-width "סמן כנצפה". Reads the plan from the live `plans` array, so Firestore updates (and deletes) are reflected while it is open.
- **Grouping** (`groupBy`: `'none' | 'category' | 'area'`, persisted per trip in `localStorage`): category sections or proximity clusters render as collapsible sticky pill headers (icon + name + count) at `top: 64`, just under the sticky toolbar.
- **Hide visited** toggle + **active-view summary bar** ("N מתוך M מקומות" + the active filters + "הצג הכל") shown whenever anything is filtered out. The place open in the details sheet is never hidden mid-read.
- **Priority flag** (`plan.priority: 'must' | 'optional' | null`): set from the details sheet action or the 3-button selector in the edit/add form. Cards show at most one status pill (today's event > expired event > "חובה"); "אם ישאר זמן" and "נצפה" are shown in the sheet. "⭐ חובה" filter chip shown when at least one must-visit exists.
- **Event status badges**: "אירועים" category items show "✨ היום" (amber card border) when `startDate === todayISO`; "נגמר" (muted) when today is past the end date.
- **Manual travel-time override**: edit form has numeric minute inputs for walk/transit. Saves to Firestore as `distances.{originId} = { …, manualOverride: true }`. Auto-fetch skips entries flagged with `manualOverride`.
- **Proximity grouping**: haversine + greedy single-link clustering at 800 m; area headers collapsible via chevron.
- **Links**: `plan.links` entries keep `label` empty when the user does not name one — the URL is never copied into the name field. The add/edit rows are stacked and captioned ("שם הקישור (אופציונלי)" / "כתובת הקישור (URL)"); unnamed links display as "ללא שם" in the form and as `prettyUrl(url)` everywhere else.
- **Filter row**: sticky and frosted (`var(--header-bg)` + `backdrop-filter`), bled to the content edges so cards scroll under it — chips + single `SlidersHorizontal` options button. Both dropdowns are `position: fixed`, anchored via `getBoundingClientRect`, and **rendered through `createPortal` into `<body>`** — the frosted toolbar is a filtered ancestor, which would otherwise become their containing block and offset them down the page. The options menu holds card layout, sort, grouping, hide-visited, distance calculation and category settings.
- **Sort options**: default / walk asc-desc / transit asc-desc. Persisted per trip in `localStorage`.

**לוח זמנים יומי:**
- Day timeline with D&D reordering (`@dnd-kit`); smart day generation from flight dates.
- **Collapse/expand toggle**: chevron on each day header hides/shows activities.
- **Weather badge**: each day header shows forecast tag (icon + max°/min° + rain %). Clicking opens an hourly weather popup (centered modal, wrapping grid, every 2 hours).
- **Activity detail popup**: clicking an activity title opens a centered card with full title, time label, description, and Maps link.
- Activity card header shows 🚶/🚌 chips on the left side (same row as title).
- Activity title color reflects linked plan's priority (amber = must, muted = optional).
- **Place-picker dropdown**: options include distance `meta` text + priority prefix (⭐/🕐).
- Category customization persisted in `trips/{tripId}/settings/categories`.

### `ChecklistTab.jsx`
Packing checklist. Auto-syncs from global template. All Firestore writes are fire-and-forget for instant offline UX.

**Reminders (`RemindersCard`)** — a compact strip plus two bottom sheets:
- The strip cycles reminders (shuffled, auto-advance every 5 s, swipeable, dots). Auto-advance pauses while either sheet is open. Header carries the done/total count, "כל התזכורות" and "+"; the row itself is checkbox + text + owner avatar, and tapping the text opens the editor.
- **Editor sheet** — add and edit both happen here (textarea + "של מי התזכורת" member picker + delete when editing), so the strip is never replaced by an inline form and the layout never jumps.
- **All-reminders sheet** — one row per reminder (done checkbox, text, avatar, pencil), an explicit "בחירה" mode for multi-select delete (instead of two competing checkboxes per row), and a "תזכורת חדשה" footer button.
- `Avatar` and `Sheet` are declared at module level: a component defined inside another component is a new type on every render and would remount the sheet — dropping focus out of the textarea — on every keystroke.

**Top area**: reminders strip → progress card → member filter chips in a single scrollable row with per-member counts. Container gap is 14 px. The progress card is a read-out (ring + "X מתוך Y כבר נארזו") shown to viewers as well; adding and editing an item happen in a bottom sheet opened by the app-wide `Fab`.

### `EmptyState.jsx`
One shape for "there is nothing here yet": a quiet disc with an icon, a line naming the absence, a line saying what to do, and an optional `action` node (some empty states offer a button, some two, some none). Used by the homepage, both planner sub-tabs, the checklist, info and expenses.

The planner distinguishes two cases that used to share one message: an empty pool explains what the tab is for, while a filter that matched nothing reports how many places exist and offers **"נקה סינון"**, which resets search, category and hide-visited together — previously there was no way back from a filter combination that emptied the screen.

### `Fab.jsx`
The app's single "add" control — an extended floating button in the same corner of every tab that can add something (planner pool, checklist, info, expenses). The flight tab has none; adding an activity in the planner's daily sub-tab stays on its day's card, because it belongs to one specific day rather than to the tab.

- Portalled into `.app-container`, not `<body>`: `position: fixed` resolves against the nearest transformed ancestor and the tab wrappers animate with a transform, while `<body>` would put the button outside the container's `isolation: isolate` and therefore above every sheet inside it.
- While one is mounted `<body>` carries `data-fab`, and `.app-content` reserves extra bottom padding so the last row of a list stays reachable past the button.

### `ShareTargetScreen.jsx` + `services/shareTarget.js`
Entry point for places shared from Google Maps (Android, installed PWA only — iOS Safari has no Web Share Target).

- The manifest declares `share_target: { action: '/share', method: 'GET', params: { title, text, url } }`; Firebase hosting rewrites `**` → `index.html` and the SW's `navigateFallback` covers it offline, so `/share?…` boots the normal app.
- `readSharedPlace()` runs in a `useState` initializer in `AppInner`, parses the params, and mirrors the result into `sessionStorage`. That mirror matters: `main.jsx` reloads the page on `controllerchange`, so a service-worker update mid-share would otherwise drop the shared place. `clearShareUrl()` then takes the params out of the address bar; `clearSharedPlace()` drops the mirror once the place is placed or the user backs out.
- `parseSharedPlace()` handles every shape Maps sends — name + link inside `text`, a separate `title`, a bare `url`, and a full `/maps/place/<name>/` URL it can derive a name from. Leftover lines become the description.
- `cacheTripsForShare(trips, uid)` keeps `{id, name, destination, canEdit}` in `localStorage` on every trips snapshot, so the picker has something to show before auth and Firestore respond. The live list replaces it as soon as it arrives.
- The screen renders **before** the auth gate. Picking a trip while signed out stores the choice, triggers Google sign-in, and `AppInner` replays it once `user` appears. `PlanningTab` receives the place through `sharedPlace` / `onSharedPlaceHandled` and opens its add form pre-filled (name, Maps link as the address, extra lines as notes).

### `ExpensesTab.jsx`
Expense tracker with per-category collapsible groups, ILS snapshot for foreign currencies, split form, and per-person summary row.

### `InfoTab.jsx`
Trip information and contacts with extra fields (text, phone, address, URL, number).

### `exportTrip.js`
Exports to PDF (jsPDF), Word (docx), and Excel (ExcelJS).

### `TripContext.jsx`
Exposes `tripId`, `canEdit`, `isOwner`, `role`, `ownerProfile`, `memberProfiles`.

### `ConfirmContext.jsx`
App-wide styled confirm dialog via `useConfirm()` hook.

---

## Firestore Data Model (summary)

```
/users/{uid}
  displayName, email, photoURL
  globalChecklist: [{id, text, category, completed}]
  tripIds: [...]

/trips/{tripId}
  name, destination, dates
  members: { uid: 'owner'|'editor'|'viewer' }
  memberIds: [uid, ...]
  outboundFlightDetails, returnFlightDetails, hotelDetails
  distanceOrigins: [{id, name, mapsUrl}]
  plannerDaysFromFlight: {out, ret}

  /planning/{planId}
    title, category, description, address, price, links, visited
    priority: null | 'must' | 'optional'
    distanceOriginId: null | string
    distances: { [originId]: { walk, transit, manualOverride?, fetchedAt } }
    coords: { lat, lng } | null
    event: { startDate, endDate, startTime, endTime } | null

  /days/{dayId}
    title, date, order
    activities: [{id, title, category, timeLabel, address, description, placeId}]

  /checklist/{itemId}
    text, category, completed

  /expenses/{expenseId}
    amount, currency, category, description
    linkedPlanId, customPlace
    ilsSnapshot
    createdAt

  /info/{infoId}
    title, value, type, category
    extraFields: [{id, label, type, value}]

  /settings/categories
    {[categoryName]: {iconKey, color}}

  /settings/checklistSync
    deletedGlobalIds: [id, ...]
```

---

## Environment Variables
| Variable | Purpose |
|---|---|
| `VITE_AERODATABOX_KEY` | RapidAPI key for AeroDataBox — live flight status |
| `VITE_GOOGLE_MAPS_KEY` | Google Cloud key — Routes API + Places API (travel times) |

Both are set in `.env.local` (gitignored). The app builds and runs without them but travel-time chips and live flight lookup will be disabled.
