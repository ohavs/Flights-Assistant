# Flights Assistant — Project Notes

This app is used almost daily for real trips, by the owner and the people they
share trips with. Correctness and data safety come before speed.

## Working with the owner

- Talk to the owner in **Hebrew**. Code, comments and this file stay in
  English; `changelog.md` entries are in Hebrew (existing style).
- The owner wants as little involvement as possible: do the work end to end.
  Ask only for what only they can do (secrets, billing, actions on their phone,
  product decisions), and then say exactly what is needed and where.
- Standing instruction: **if you find a bug, fix it first**, before other work.
- Never claim something works, or that a bug exists, without having checked it
  against the code that is actually live. Say what was verified and how.

## Branches — read this first

- **The main line is `master`** (the default branch). The live site is built
  from it: `.github/workflows/deploy.yml` deploys every push to `master`.
- Until 2026-10-14 the main line was `claude/place-closure-button-qj61y5`, and
  `master` had been left behind. Sessions start from `master`, so one session
  analysed stale code and "fixed" bugs the live code had long fixed. That
  branch is now retired: its `deploy.yml` triggers on `master`, so a push to it
  deploys nothing. Never work on it.
- Before investigating anything, confirm what is live: the newest successful
  "Deploy to Firebase Hosting" run names the deployed commit, and it should be
  the head of `master`.
- Old branches (`claude/place-closure-button-qj61y5`, `sweet-planck-g6kkC`,
  `fix-flight-date-range-d0WIv`, `zen-wozniak-rp2mrq`, `nice-gates-Qygl4`,
  `locations-links-ui-redesign-uazs41`) are history: their content is already in
  `master` or was dropped on purpose. Do not merge them.
- How to work: branch off `master`, open a PR into it, and merge. Merging
  deploys, so a PR must be ready for production when it is merged (see
  "Merge policy").

## Build & Deploy

Normal path: merge into `master`. `deploy.yml` then:
1. checks that the secrets `VITE_GOOGLE_MAPS_KEY`, `VITE_AERODATABOX_KEY` and
   `FIREBASE_TOKEN` are set,
2. rebuilds commit `80f12ed` and checks that it reproduces the live service
   worker, which proves the keys are right (it stops before deploying if not),
3. builds, checks that both keys are in the bundle, and deploys Hosting.

Manual fallback, from a machine that has the keys:
```bash
npm run build
# Deploy token stored in ~/.claude/CLAUDE.md (global memory)
npx firebase-tools@latest deploy --only hosting --token "<see ~/.claude/CLAUDE.md>"
```

## Environment Variables (`.env.local`)
`.env.local` is gitignored, so a fresh clone has **neither** key. Vite inlines
them at build time — a build made without this file silently ships an app with
those features switched off. Create it in the project root before building:
```
VITE_AERODATABOX_KEY=<RapidAPI key for aerodatabox.p.rapidapi.com — ask user>
VITE_GOOGLE_MAPS_KEY=<Google Cloud "Listify" project API key — ask user>
```
- **`VITE_AERODATABOX_KEY`** — live flight lookup (`services/flightApi.js`).
- **`VITE_GOOGLE_MAPS_KEY`** — everything distance-related (`services/distanceApi.js`).
  `hasGmapsKey()` gates it all, so without the key the app quietly loses the
  "חשב ושמור מרחקים" button, automatic travel times, and the "איזור" grouping —
  saved distances still *display*, which makes the absence easy to miss.
  Needs **Routes API** and **Places API (New)** enabled on the Google Cloud project.

Verify a Maps key before deploying:
```bash
curl -X POST "https://routes.googleapis.com/directions/v2:computeRoutes" \
  -H "Content-Type: application/json" -H "X-Goog-Api-Key: $VITE_GOOGLE_MAPS_KEY" \
  -H "X-Goog-FieldMask: routes.duration" \
  -d '{"origin":{"location":{"latLng":{"latitude":47.4979,"longitude":19.0402}}},"destination":{"location":{"latLng":{"latitude":47.5010,"longitude":19.0600}}},"travelMode":"WALK"}'
```
After building, confirm the keys actually made it in: `grep -c "$VITE_GOOGLE_MAPS_KEY" dist/assets/*.js`

## Tech Stack
- React 19 + Vite PWA, Hebrew RTL
- Firebase Firestore (project: listify-84018)
- Hosted at: https://listify-84018.web.app
- Main branch: `master` (see "Branches")
- Data model: `project_overview.md` → "Firestore Data Model"
- npm needs `--legacy-peer-deps` (`lucide-react@0.378` does not list React 19 as a peer)

## Key Patterns
- `useTrip()` — provides `currentUid`, `canEdit`, `isOwner`, `memberProfiles`
- `useConfirm()` — async confirm dialog
- DnD: `@dnd-kit/core` + `@dnd-kit/sortable`
- Category order saved to Firestore: `trips/{tripId}/settings/checklistSync.categoryOrder` and `infoSync.categoryOrder`
- Writes are fire-and-forget (`.catch(...)`, no `await` before closing a form) so
  the app works offline; the Firestore cache queues them. Keep it that way.

## Tests

All tests run against the Firebase emulators (project `demo-flights`), never the
real project. CI (`.github/workflows/ci.yml`) runs them on every PR and push.
- `npm run test:data` — security-rules tests (`tests/*.test.mjs`). Needs Java 11+.
- `npm run test:e2e` — builds the app in emulator mode
  (`VITE_USE_FIREBASE_EMULATORS=true`) and runs a browser smoke test
  (`tests/e2e/smoke.e2e.mjs`): sign-in, create a trip, every tab, add a place,
  checklist item and expense, edit the hotel, reload, share with a second user.
  In the Claude cloud container, prefix it with
  `CHROMIUM_PATH=/opt/pw-browsers/chromium`. Screenshots go to `.e2e/`.
- The test browser blocks service workers: on a first visit the PWA worker
  installs and reloads the page, which would interrupt a test mid-step.

## Data-safety rules (do not break these)

1. **Never test against the real Firebase project.** Use the Firebase emulators
   with a `demo-` project ID. Never run scripts that write production data.
2. **Never replace a whole existing document.** Use `updateDoc`, or
   `setDoc(..., { merge: true })`, and field paths for nested values. `setDoc`
   without merge only creates brand-new documents. The trip document holds
   `members` and `memberIds`; the rules read both, so losing them locks every
   member out of the trip.
3. **Schema changes are additive only.** New fields are optional and readers
   tolerate them missing. Never rename, remove or change the type of a field
   that any client still in use reads or writes. Once the Android app exists,
   the web app, the Android app and older installed APK versions all share the
   same data.
4. **Rules changes** (`firestore.rules`) go in a PR of their own, with
   emulator tests. On that PR, `rules.yml` runs `check` and shows the live
   rules next to the PR's file: read it before merging. On merge, `rules.yml`
   runs the tests, deploys the rules and confirms the live rules match.
   `deploy.yml` deploys Hosting only. (Claude's GitHub access cannot start
   workflows by hand, so they trigger on PR and push.)
5. **Public repo:** workflow logs are public. Never print keys or user data,
   never commit secrets, never use `pull_request_target`.

### Known risks (audit of the live code, 2026-10-14 — not fixed yet)
- `days.activities` is rewritten as a whole array from local state
  (`PlanningTab.jsx`, add/edit/move/delete activity). Concurrent edits, or an
  offline edit synced later, can overwrite each other.
- `settings/categories` is replaced as a whole from local state
  (`saveCategorySettings`).
- The checklist auto-sync (`ChecklistTab.jsx`, "Auto-sync missing global
  items") `batch.set`s `{completed: false}` for global items missing from the
  local list. If that list is incomplete (for example, a stale offline cache),
  it could reset an item someone already ticked. Verify before relying on it.

## Plan agreed with the owner (October 2026): Android app

Goal: a real Android app **and** the existing web app, on the same Firestore
data. The two are independent (separate builds, versions and releases) but
connected (shared data and shared core logic). Not every app feature goes to
the web.

1. **Safety net first:** emulator-based data tests and a browser smoke test
   for the live code, run in CI on every PR.
2. **Restructure** into `packages/core` (Firebase, data access, hooks, logic),
   `apps/web` (current UI and design, deployed exactly as today) and
   `apps/mobile` (Capacitor Android). The web app must stay identical: compare
   screenshots of every screen before and after.
3. **Android shell:** Capacitor; native Google sign-in
   (`@capacitor-firebase/authentication`, then `signInWithCredential` —
   `signInWithPopup` does not work in a WebView); bundle the fonts and CSS
   locally; no service worker in the native app; keep the keys out of the repo
   (CI injects them, as `deploy.yml` does).
4. **Mobile design:** Material Design 3 (Ionic React in `md` mode is the
   recommendation), RTL. Same screens and structure, Android-native
   components. The web app keeps its current design.
5. **App-only features:** the first is native notifications for the existing
   reminders (`trips/{tripId}/reminders`) and flight times (local scheduled
   notifications, no server). Next is push (FCM + Cloud Functions, needs the
   Blaze plan) for flight changes from AeroDataBox and edits by other members.
   Later: home-screen widget, native share target, offline documents.
6. **Verify** with both apps on the same data that nothing is lost; then ship
   the first APK.
7. **After that:** features go to the app first and move to the web only when
   the owner wants and it does not break the web app. Track this in
   `FEATURES.md` (create it in step 2).

## Android distribution and updates

- **Not on Google Play.** The APK is published as a GitHub Release of this
  public repo, tag `app-vX.Y.Z`. **Only Android app releases are GitHub
  Releases** — the in-app updater reads `releases/latest`.
- In-app updates use two channels:
  - **Web bundle (over the air)** for JS/CSS/HTML-only changes: a zip in the
    release assets, applied on the next launch (`@capgo/capacitor-updater` in
    self-hosted/manual mode, with automatic rollback when a new bundle does not
    call `notifyAppReady()`). Never ship a bundle that needs native code the
    installed APK lacks: check `minNativeVersion`.
  - **Native APK** when a release changes native code (plugins, permissions,
    Capacitor version): the app downloads the APK and opens the system
    installer (`REQUEST_INSTALL_PACKAGES`; the user approves once).
  - A `latest.json` asset describes each release:
    `{version, nativeVersion, minNativeVersion, bundleUrl, apkUrl, sha256, notes}`.
    The app reads
    `https://github.com/ohavs/Flights-Assistant/releases/latest/download/latest.json`.
- **Signing:** never regenerate or replace the key, never change the
  `applicationId` (`com.ohavs.flightsassistant`), and always increase
  `versionCode`. A different key means installed apps can no longer update.
  The key is a PKCS12 keystore with alias `flights-assistant`; the owner keeps
  a backup. Certificate fingerprints (needed for the Firebase Android app and
  Google sign-in):
  - SHA-1 `BC:EF:52:E9:D8:9E:82:22:E7:62:40:0F:17:DA:EE:77:3F:E0:91:A7`
  - SHA-256 `A6:F4:20:DE:C1:7D:56:65:6C:31:CB:93:DF:67:D7:37:BE:CA:1A:30:19:B5:05:A0:5D:BC:9A:31:3B:47:43:3B`
- **Versions:** the web app keeps its version line in `changelog.md` (8.x).
  The Android app has its own semver starting at 1.0.0. Mark changelog
  entries `[web]`, `[app]` or `[both]` from the first app release on.

## GitHub secrets

| Secret | What it is | Used by |
|---|---|---|
| `VITE_GOOGLE_MAPS_KEY` | Google Maps key (Routes + Places) | web build |
| `VITE_AERODATABOX_KEY` | AeroDataBox (RapidAPI) key | web build |
| `FIREBASE_TOKEN` | Firebase CLI token | Hosting deploy |
| `ANDROID_KEYSTORE_BASE64` | Release keystore, base64-encoded | APK build (planned) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore and key password | APK build (planned) |

Secrets cannot be read back. To check that one exists, run a workflow that uses it.

## Merge policy

The owner has delegated merging and deploying to Claude: do everything, and
ask only for what only the owner can do. Every change is checked on its own:

1. **One change per PR.** Do not bundle unrelated changes.
2. **Before merging**, check that:
   - the PR is based on the current `master`, and nobody else has pushed in
     the meantime (fetch and compare);
   - the diff contains only the intended change, with nothing reverted or
     overwritten. Read `git diff origin/master...HEAD`, not just the stat;
   - the build passes, lint is not worse, and the tests pass once they exist.
3. **After merging**, watch the "Deploy to Firebase Hosting" run until it
   succeeds. If it fails, fixing it is the next task.
4. **Tell the owner first** before anything irreversible or costly: deleting
   data, data migrations, rules changes that tighten access, or anything that
   costs money.
