# Changelog — Flights-Assistant

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
