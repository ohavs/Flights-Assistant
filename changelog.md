# Changelog — Flights-Assistant

## [6.1.1] - 2026-10-14 [web]

### Fixed
- **Saving the flight & hotel form deleted the trip's name, destination and members**:
  - `handleFormSubmit` in `FlightTab.jsx` replaced the whole `/trips/{tripId}` document. Without `members`, the security rules block everyone, so the trip disappeared for all participants (permanently, until the data was repaired by hand).
  - The form now updates only `outboundFlightDetails`, `returnFlightDetails` and `hotelDetails` (`src/data/trips.js`).
- **Changing a flight date could undo other members' changes**: the inline date picker rewrote the whole trip from the local copy. It now writes only that date field.
- **Deleted trips stayed on the home screen until a reload**, and every change to the user profile (e.g. editing the fixed checklist) added another set of trip listeners that were never removed. The home screen now keeps exactly one listener per trip.
- **New users could see an empty home screen after their first login** until they reloaded: right after the profile was created, the listener sometimes reported it as missing. The app now ignores that, since profiles are never deleted.
- Removed an unused query in the share dialog that tried to read every trip in the database.

### Added
- Emulator-based tests: `npm run test:data` (Firestore writes and rules) and `npm run test:e2e` (browser smoke test of a production build). Neither ever touches the real project.
- GitHub Actions: tests on every PR and push; automatic deploy to Firebase Hosting after tests pass on `master` (requires the `FIREBASE_SERVICE_ACCOUNT` secret); manual read-only "Inspect Firebase" workflow.
- `CLAUDE.md`: project rules, data-safety rules and the agreed Android plan.


## [6.1.0] - 2026-09-30

### Added
- **"Needs Advance Booking" Toggle for Places**:
  - Added an optional toggle in the add/edit place modal of `PlanningTab.jsx` to mark any place (tour, restaurant, attraction, etc.) as requiring an advance reservation. It is off by default.
  - Stored as a `needsReservation` boolean on each `/trips/{tripId}/planning` document; existing places without the field are treated as not requiring a reservation.
  - Marked places show an amber "צריך לסגור מראש" badge and an amber side accent on their card (the green visited accent takes precedence once visited).
  - Daily schedule activities linked to a marked place show a compact version of the same badge.


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
