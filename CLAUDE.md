# Flights-Assistant — working rules

This app is used almost daily for real trips, by the owner and the people they
share trips with. Correctness and data safety come before speed.

## Working with the owner

- Talk to the owner in **Hebrew**. Code, comments and docs stay in English.
- The owner wants as little involvement as possible: do the work end to end.
  Ask only for what only they can do (secrets, billing, actions on their phone,
  product decisions), and then say exactly what is needed and where.
- Standing instruction: **if you find a bug, fix it first**, before other work.
- Never claim something works without having run it. Say what was verified and how.

## Safety rules (do not break these)

1. **Never test against the real Firebase project** (`listify-84018`). Use the
   emulators: `npm run test:data` and `npm run test:e2e`. In emulator mode the
   app uses project ID `demo-flights`, which cannot reach real resources.
2. **Never replace a whole existing Firestore document.** Use `updateDoc`, or
   `setDoc(..., { merge: true })`, and field paths (`'outboundFlightDetails.date'`)
   for nested values. `setDoc` without merge is only for brand-new documents.
   The trip document holds `members`; losing it makes the trip unreadable for
   everyone (this happened — fixed in 6.1.1).
3. **Schema changes are additive only.** New fields are optional and readers
   tolerate them missing. Never rename, remove or change the type of a field
   that any client still in use reads or writes. The web app, the Android app
   and older installed APK versions all share the same data.
4. **Firestore access goes through `src/data/`** (later `packages/core`), with
   emulator tests in `tests/` for every new write path.
5. **Rules changes:** first check what is actually deployed (Inspect workflow),
   test the new rules in the emulator, then deploy them as a separate,
   deliberate step.
6. **Never push to `master` directly.** Branch → PR → CI green (build,
   `test:data`, `test:e2e`) → merge. Merging to `master` deploys the web app.
7. **Public repo:** workflow logs are public. Never print user data or
   credentials in logs, never commit secrets, never use `pull_request_target`.
8. **Android signing key:** never regenerate or replace it, never change the
   `applicationId` (`com.ohavs.flightsassistant`), and always increase
   `versionCode`. A different key means installed apps can no longer update.
9. **Over-the-air updates** must never ship a web bundle that needs native code
   the installed APK does not have (check `minNativeVersion`, see below).
10. **Only Android app releases are GitHub Releases** — the in-app updater reads
    `releases/latest`. Never publish any other kind of release.

## Current state

- One Vite + React 19 app in `src/`, Hebrew RTL, deployed to Firebase Hosting.
  The live site is built from `master`.
- Firebase project `listify-84018` (the name is historical; it belongs to this app).
- Data model:
  - `/users/{uid}`: `email, displayName, photoURL, tripIds[], globalChecklist[]`
  - `/trips/{tripId}`: `name, destination, dates, members{uid: 'owner'|'member'},
    createdAt, outboundFlightDetails, returnFlightDetails, hotelDetails`
  - Subcollections of a trip: `planning`, `checklist`, `days` (`days.activities[]`)
- Flight data is **simulated** (`src/services/flightSimulator.js`); there is no
  real flight API yet.
- `.npmrc` sets `legacy-peer-deps` because `lucide-react@0.378` does not list
  React 19 as a peer.
- `npm run lint` has 36 errors that predate this file. Lint does not gate CI;
  do not add new errors.
- The `apiKey` in `src/firebase.js` is split into two strings so that GitHub's
  secret scanner stops flagging it. Keep it split. (Firebase web API keys are
  public by design; security comes from `firestore.rules`.)

## Known issues (not fixed yet)

- **Next bug to fix — forms freeze while offline.** About 15 handlers `await`
  a Firestore write before closing a modal or clearing an input. Offline, the
  write promise only resolves once the server acknowledges it, so the UI looks
  stuck until the connection returns (verified for the flight form; the data
  is saved locally and syncs later). Creating a trip offline also does not add
  it to the list until back online, because the later steps wait for the first
  write. Fix: update the UI right away, handle write errors without blocking,
  and add an offline e2e test (`context.setOffline(true)`).

- **Sharing does not work under the repo's `firestore.rules`.** `ShareModal`
  lists `/users` by email (rules deny listing) and writes the invitee's
  `tripIds` (rules allow only your own profile). It is unknown whether the
  deployed rules differ — run the Inspect workflow before touching this.
  Planned fix: a `/userLookup/{email}` → `{uid}` collection (get only, no list)
  plus a rule that lets a trip member add that trip to another user's
  `tripIds`. There is a `test.todo` for it in `tests/data-safety.test.mjs`.
- **Array read-modify-write:** `days.activities` and `globalChecklist` are
  rewritten as whole arrays from local state, so concurrent or offline edits
  can overwrite each other. Do not add new code that does this. Prefer
  `arrayUnion`/`arrayRemove` or one document per item.
- **Profile listener flicker (handled):** right after first login creates
  `/users/{uid}`, the listener can briefly report the document as missing
  again (seen with the emulator, with and without persistence). `App.jsx`
  ignores "missing" once the profile has been seen, because the app never
  deletes profiles. The e2e test checks that the demo trip stays listed.

## Plan agreed with the owner (October 2026)

Goal: a real Android app **and** the existing web app, reading and writing the
same Firestore data. The two are independent (separate builds, versions and
releases) but connected (shared data and shared core logic).

- **Phase 0 — done (6.1.1):** data-loss fixes, emulator tests, CI, automatic
  web deploy.
- **Phase 1 — on a branch; `master` and the live site stay untouched:**
  1. Restructure into `packages/core` (Firebase, data access, hooks, logic),
     `apps/web` (current UI and design) and `apps/mobile` (Capacitor Android).
     The web app must stay identical: compare screenshots of every screen
     before and after.
  2. Android shell: Capacitor; native Google sign-in
     (`@capacitor-firebase/authentication`, then `signInWithCredential` —
     `signInWithPopup` does not work in a WebView); bundle the fonts and the
     Leaflet CSS locally; no service worker in the native app.
  3. Mobile design: Material Design 3 (Ionic React in `md` mode is the
     recommendation), RTL. Same screens and structure, Android-native
     components. The web app keeps its current design.
  4. App-only features, in this order: local scheduled reminders (no server);
     push notifications (FCM + Cloud Functions, needs the Blaze plan); a real
     flight-status API. Later: home-screen widget, share-to-app, offline
     documents, calendar.
- **Phase 2:** run both apps against the same data and verify that nothing is lost.
- **Phase 3:** merge, deploy the unchanged web app, publish the first APK.
- **After that:** new features go to the app first. They move to the web only
  when the owner wants it and it does not break the web app. Track this in
  `FEATURES.md` (create it in phase 1).

## Android distribution and updates

- **Not on Google Play.** The APK is published as a GitHub Release of this
  public repo, tag `app-vX.Y.Z`.
- In-app updates use two channels:
  - **Web bundle (over the air)** for JS/CSS/HTML-only changes: a zip in the
    release assets, downloaded and applied on the next launch. Planned:
    `@capgo/capacitor-updater` in self-hosted/manual mode, with automatic rollback
    when a new bundle does not call `notifyAppReady()`.
  - **Native APK** when a release changes native code (plugins, permissions,
    Capacitor version): the app downloads the APK and opens the system
    installer (`REQUEST_INSTALL_PACKAGES`; the user approves once).
  - A `latest.json` asset describes each release:
    `{version, nativeVersion, minNativeVersion, bundleUrl, apkUrl, sha256, notes}`.
    The app reads
    `https://github.com/ohavs/Flights-Assistant/releases/latest/download/latest.json`.
- Signing: PKCS12 keystore, alias `flights-assistant`. Certificate fingerprints
  (needed when registering the Android app in Firebase for Google sign-in):
  - SHA-1 `BC:EF:52:E9:D8:9E:82:22:E7:62:40:0F:17:DA:EE:77:3F:E0:91:A7`
  - SHA-256 `A6:F4:20:DE:C1:7D:56:65:6C:31:CB:93:DF:67:D7:37:BE:CA:1A:30:19:B5:05:A0:5D:BC:9A:31:3B:47:43:3B`

  The owner keeps a backup of the keystore and its password.

## Versions and changelog

- Web: the existing version line in `changelog.md` (6.x).
- Android app: its own semver starting at 1.0.0, tag `app-vX.Y.Z`, `versionCode`
  always increasing.
- `changelog.md` is one file; mark each entry `[web]`, `[app]` or `[both]`.

## GitHub secrets

| Secret | What it is | Used by |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON key of the `github-deploy` service account (role Editor) in `listify-84018` | web deploy, Inspect workflow, Android app registration |
| `ANDROID_KEYSTORE_BASE64` | Release keystore, base64-encoded | APK build |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore and key password | APK build |

Secrets cannot be read back. To check that they exist, run a workflow that uses them.

## Commands and workflows

- `npm run dev` / `npm run build` / `npm run lint`
- `npm run test:data` — data-safety tests against the Firestore and Auth
  emulators (needs Java 11+).
- `npm run test:e2e` — production build in emulator mode plus a browser smoke
  test. In the Claude cloud container, prefix it with
  `CHROMIUM_PATH=/opt/pw-browsers/chromium`. Screenshots go to `.e2e/`.
- `.github/workflows/ci.yml` runs the build and both test suites on every PR
  and push. On a push to `master` it then deploys Hosting. The deploy is
  skipped when the secret is missing, and refused when emulator code ends up
  in the production bundle.
- `.github/workflows/inspect-firebase.yml` is manual and read-only: it diffs
  the deployed Firestore rules against the repo and lists the registered apps.

## Merge policy

Waiting for the owner's answer. Until they answer, open a PR and ask before
merging to `master`.
