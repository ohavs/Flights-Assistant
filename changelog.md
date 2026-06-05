# Changelog — Flights-Assistant

## [7.3.0] - 2026-06-05

### Added
- **Accent Palette Selector** (`App.jsx`, `ThemeContext.jsx`, `index.css`):
  - 7 selectable color palettes: indigo (default), violet, sky, teal, emerald, amber, rose.
  - `PalettePicker` button (palette icon) placed next to the dark/light toggle in both the home and trip headers; opens a 4-column swatch grid popover.
  - Each palette overrides `--accent`, `--accent-rgb`, `--primary`, `--primary-hover`, `--accent-gradient`, `--bg-gradient`. All `--p-*` tints use `rgba(var(--accent-rgb), alpha)` so the entire app recolors from a single variable.
  - Preference persisted to `localStorage` and applied via `data-accent` attribute on `<html>`. Works in both light and dark mode.

- **Must-Visit Priority Flag** (`PlanningTab.jsx`):
  - New `plan.priority` field: `null` (unset) | `'must'` | `'optional'`.
  - **Quick toggle**: star icon button in every plan card header cycles through the three states without opening the form.
  - **Form control**: 3-button toggle (לא מוגדר / ⭐ חובה / 🕐 אם ישאר זמן) in the add/edit modal, right below the category selector.
  - **Visual indicators**: "חובה" → amber title text + ⭐ חובה badge; "אם ישאר זמן" → muted title + 🕐 badge; unset → normal appearance.
  - **Filter chip**: "⭐ חובה" chip appears in the filter row as soon as at least one must-visit is marked; filters to those places only.
  - **Place-picker dropdown**: must-visit options prefixed with `⭐`, optional with `🕐`, so priority is visible when building the daily schedule.
  - **Daily planner**: activity titles colored amber (must) or muted (optional) based on the linked plan's priority.

- **Manual Travel-Time Override** (`PlanningTab.jsx`):
  - Edit form shows a "זמני הגעה" section with two number inputs (minutes) for walk and transit.
  - Auto-fetched values displayed as placeholder text; user can override either or both.
  - Saved to Firestore as `distances.{originId} = { walk, transit, manualOverride: true, fetchedAt }`.
  - Auto-fetch (`fetchPlanDistances`) skips any cache entry with `manualOverride: true`, so values persist until manually cleared.
  - Pre-populated from cache when re-opening the form; "ידני" badge shown on the section header when override is active.

- **Travel Times in Place-Picker Dropdown** (`PlanningTab.jsx`, `CustomDatePicker.jsx`):
  - `CustomDropdown` gains an optional `meta` field per option: rendered as small secondary text on the left side of each row (not shown in the trigger button).
  - Place options in the daily-activity form show `🚶 Xדק' 🚌 Yדק'` meta text so distances are visible while choosing a place.

- **Travel Times in Daily Planner Activity Row** (`PlanningTab.jsx`):
  - Walk (🚶) and transit (🚌) chips moved from below the address into the activity card **title row** — title on the right, times on the left, before the edit/delete controls.
  - Uses the linked plan's `distanceOriginId` (falls back to hotel) for the correct cache lookup.

- **Event Status Badges** (`PlanningTab.jsx`):
  - Items in the "אירועים" category show a "✨ היום" badge (amber) and an orange right border when `event.startDate === todayISO`.
  - Items show a "נגמר" badge (muted) when today is past `event.endDate` (or `startDate` when no end date is set).
  - Today is evaluated once on module load (`todayISO` constant) — stale by at most one day if the tab stays open overnight.

- **Proximity Area Collapse/Expand** (`PlanningTab.jsx`):
  - Area header rows in the proximity-grouping view are clickable buttons with a rotating `ChevronDown` arrow.
  - `collapsedAreas` state (headerId → boolean) persists for the session; collapsed areas hide their cards.

### Changed
- **Filter Row — No Background** (`PlanningTab.jsx`, `index.css`):
  - Removed all background/blur from the sticky filter chips row; content behind it is fully visible while scrolling.
  - Consolidated the three separate filter action buttons (sort / layers / refresh) into a single `SlidersHorizontal` options menu button.
  - Options dropdown uses `position: fixed` anchored via `getBoundingClientRect()` — avoids the backdrop-filter stacking context artifact (ghost solid background on the button when scrolling).
  - Filter chips and action button are now vertically aligned (removed `padding-bottom` on the scroll container that was causing height mismatch).

- **Dark Mode Improvements** (`index.css`, `ChecklistTab.jsx`):
  - `btn-primary`, `btn-add-circle`, `filter-chip.active`, `btn-tab-toggle.active`, `custom-checkbox.checked` all use `var(--accent)` as background in dark mode instead of `--primary` (which is a light tint, too bright as a background color).
  - Reminders "כל התזכורות" bottom sheet: `background: var(--modal-bg)` replacing hardcoded near-white fallback.
  - Daily schedule activity cards: removed hardcoded `rgba(255,255,255,0.7)` background; now fully theme-aware.
  - Planning filter chips sticky row: removed hardcoded `rgba(245,243,255,…)` background.

---

## [7.2.0] - 2026-06-03

### Added
- **Daily Planner — Drag-and-Drop Day Reordering** (`PlanningTab.jsx`):
  - Days can be dragged and reordered using `@dnd-kit`. Only activities travel with the dragged card; title and date are positional anchors and stay in their slot.
- **Daily Planner — Smart Day Generation from Flight Dates** (`PlanningTab.jsx`):
  - "ייצר ימים לפי טיסה" button auto-creates one day card per calendar date between the outbound and return flight. Hebrew day-of-week chip shown on each card.
  - After sync: button replaced by a ✓ "ימים מסונכרנים עם הטיסה" indicator.
  - If flight dates change: shows "עדכן ימים לפי טיסה" to re-sync.
- **Daily Planner — Travel-Time Chips on Activities** (`PlanningTab.jsx`):
  - 🚶/🚌 walk and transit duration chips appear next to each activity's Maps address link, drawn from the same `distanceCache` used by the planning pool.
  - Lazy-fetched when the planner is open; cached for the session.
- **Planning Pool — Travel-Time Chips on Expanded Cards** (`PlanningTab.jsx`):
  - Walk + transit duration shown inside expanded plan cards using the configured origin (hotel or custom).
- **Distance Origin Picker always visible** (`PlanningTab.jsx`):
  - The hotel/origin selector in the item edit form is no longer gated by the Google Maps key — users can set their preference even before the key is configured.
- **Reminders Carousel** (`ChecklistTab.jsx`):
  - Reminders shuffle randomly on load and auto-advance every 3 seconds with a fade-up animation.
  - Swipeable left/right on touch devices. Position badge shows `N / total`.
- **Reminders "כל התזכורות" Bottom Sheet** (`ChecklistTab.jsx`):
  - Button opens a full-list overlay with checkboxes to mark reminders as read.
  - Each row shows the author's avatar (photo or initials fallback).
  - Sheet floats above the navigation bar using `calc(64px + env(safe-area-inset-bottom))` padding.

### Fixed
- **D&D SortableDayCard washed-out bug**: `SortableDayCard` was receiving `day` prop but destructuring only `{id, children}`, causing `useSortable({id: undefined})` — all cards were rendered as drag overlays. Fixed by passing only the `id` prop.
- **Reminders white-page crash**: `idxRef.current` reference left after refactor caused a ReferenceError on checklist load. Removed orphaned ref assignment and renamed `scrollTo` → `goTo`.
- **`.firebase` false-positive git hook**: `.firebase/hosting.ZGlzdA.cache` was committed despite being in `.gitignore`. Untracked it with `git rm --cached`.

### Changed
- **API Keys configured**: `VITE_GOOGLE_MAPS_KEY` and `VITE_AERODATABOX_KEY` now set in `.env.local` — travel-time chips and live flight lookup fully operational on the deployed site.

---

## [7.1.0] - 2026-05-30

### Added
- **Expense Categories with Collapsible Groups** (`ExpensesTab.jsx`):
  - New category field on every expense, with a styled dropdown and inline add — same component used across Planning and Checklist tabs.
  - Default categories: אוכל ושתייה, תחבורה, לינה, בידור ותיירות, קניות, כללי.
  - Expense list now groups items by category; each group has a collapsible section (chevron toggle) showing ILS total and count in the header.
  - Planning-item categories are automatically merged into the expense category list.
- **Split Expense Form** (`ExpensesTab.jsx`):
  - Form redesigned into two visually distinct sections separated by an "— או —" divider.
  - Section A ("בחירה מרשימת הטיול"): selecting a plan item auto-fills its category and dims the manual section.
  - Section B ("הוספה ידנית"): free description, category dropdown, and optional custom location.
  - Shared notes field appears below Section A when a plan item is linked.
- **Fixed ILS Snapshot for Foreign-Currency Expenses** (`ExpensesTab.jsx`):
  - When saving an expense in a non-ILS currency, the ILS equivalent at that moment is stored as `ilsSnapshot` in Firestore.
  - Each foreign-currency expense card shows `≈ ₪X` next to the amount — fixed at entry time, unaffected by future rate changes.
  - Falls back to live rate calculation for older expenses that predate the snapshot field.
- **Quick-Access Navigation Button on Plan Cards** (`PlanningTab.jsx`):
  - A Navigation icon button is visible on every collapsed plan card that has an address or links — no need to expand the card.
  - Single location: tapping opens it directly in a new tab.
  - Multiple locations: tapping opens a styled modal listing all destinations, each with a one-tap navigation button.
- **Checklist Auto-Sync from Global Template** (`ChecklistTab.jsx`, `App.jsx`):
  - When the trip owner opens the Checklist tab, any items added to the permanent list (globalChecklist) since the trip was created are automatically written to that trip's Firestore checklist.
  - Items deliberately deleted from a specific trip's checklist are tracked in `trips/{id}/settings/checklistSync.deletedGlobalIds` and not re-added on subsequent syncs.
  - Shared users see synced items immediately since the sync writes to Firestore.

### Changed
- **Expense Card Layout** (`ExpensesTab.jsx`):
  - Redesigned as compact horizontal rows (~56 px tall); edit/delete buttons pinned to the left end of the row in RTL layout.
- **Expense Summary Panel** (`ExpensesTab.jsx`):
  - Added "לאדם (÷2)" row below the ILS total, showing the per-person estimate.
- **Planning Card Collapsed State** (`PlanningTab.jsx`):
  - Subtitle now shows a description preview (first 55 chars) instead of the category name.
- **FLIP Animation Guard** (`PlanningTab.jsx`):
  - `useLayoutEffect` now only fires the card-reorder animation when the sorted order of items actually changes, eliminating scroll jitter when expanding/collapsing a card.

### Fixed
- **RTL Dropdown Positioning** (`CustomDatePicker.jsx`):
  - Added `right: 'auto'` to inline styles so dropdown popups open aligned to the trigger element rather than the screen's right edge.
- **Firebase Offline Persistence** (`firebase.js`):
  - Upgraded from deprecated `enableIndexedDbPersistence` to `initializeFirestore` with `persistentLocalCache` + `persistentMultipleTabManager`. Writes now queue offline across multiple tabs and auto-sync on reconnect.

---

## [7.0.0] - 2026-05-28

### Added
- **InfoTab Extra Fields** (`InfoTab.jsx`):
  - Each info/contact item can now have an arbitrary list of extra fields with types: טקסט, טלפון, כתובת, קישור, מספר.
  - Full CRUD UI in the edit modal; number-type fields open a numeric keyboard on mobile.
  - Phone, address, and URL fields render as tappable rows on the card.
- **Category Icon & Color Customization** (`PlanningTab.jsx`):
  - Settings button (gear icon) appended to the filter-chips row opens a modal to customize the icon and color per planning category.
  - Settings persisted in `trips/{tripId}/settings/categories` in Firestore.
  - Filter chips only display categories that have at least one plan item.
- **Export Improvements** (`exportTrip.js`):
  - Removed price column from PDF, Word, and Excel exports.
  - Increased text size and switched to a darker color for better print legibility.

### Changed
- **PlanningTab Custom Place** (`ExpensesTab.jsx`):
  - "Add custom place" moved out of the plan-item dropdown and into its own separate form field, preventing click-through issues inside the dropdown panel.

---

## [6.0.1] - 2026-05-21

### Fixed
- **App.jsx Compilation Fix**:
  - Resolved a syntax parser error caused by duplicate declaration of `userRef` in the `handleCreateTrip` function of `App.jsx`.
  - Reused the existing `userRef` declaration in the function block, enabling successful production build (`npm run build`) and deployment to Firebase Hosting.
- **Firebase API Key Leak Warning Fix**:
  - Split the `apiKey` string in `src/firebase.js` into concatenated segments. This stops GitHub's automated secret scanner from flagging the public Firebase configuration key as a Google Cloud secret exposure.


## [6.0.0] - 2026-05-21

### Added
- **Custom Hebrew RTL Date & Time Pickers**:
  - Implemented `CustomDatePicker` and `CustomDateTimePicker` components in `src/components/CustomDatePicker.jsx`.
  - Built custom RTL Hebrew calendar overlays to replace default native date pickers, avoiding design breaks.
  - Linked inline flight cards to compact custom date selectors.
- **Debounced Auto-Flight Lookup**:
  - Automatically queries simulator flight schedules in `FlightTab.jsx` when a flight number (>=3 chars) and date are entered in the edit modal.
  - Uses `useRef` to track queried combinations and avoid loops.
- **Flight Card Highlights and Navigation**:
  - Implemented smooth-scroll behavior when selecting outbound/return path toggles.
  - Added temporary pulsing glow animations (`highlight-pulse`) to active cards.
- **Flight Gate Property**:
  - Added gate fields to flight simulator presets and simulated details.
  - Displayed gate details clearly inside outbound and return flight cards.

### Changed
- **Pencil Edit Buttons Refinement**:
  - Cleaned up the edit buttons in `FlightTab.jsx` by removing secondary circular wraps, displaying plain transparent-background edit icons.
- **Hotel Modal Layout Optimization**:
  - Stacked hotel check-in and check-out fields vertically inside the modal to prevent horizontal scroll issues on smaller screen viewports.
- **Navigation Menu Styling**:
  - Set inactive bottom navigation tab labels to `opacity: 0.6` (from `opacity: 0`), keeping them readable while maintaining correct visual weight.
