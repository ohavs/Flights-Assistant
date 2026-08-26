# Flights Assistant — Project Notes

## Build & Deploy
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
- Branch: `claude/sweet-planck-g6kkC`

## Key Patterns
- `useTrip()` — provides `currentUid`, `canEdit`, `isOwner`, `memberProfiles`
- `useConfirm()` — async confirm dialog
- DnD: `@dnd-kit/core` + `@dnd-kit/sortable`
- Category order saved to Firestore: `trips/{tripId}/settings/checklistSync.categoryOrder` and `infoSync.categoryOrder`
