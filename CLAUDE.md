# Flights Assistant — Project Notes

## Build & Deploy
```bash
npm run build
# Deploy token stored in ~/.claude/CLAUDE.md (global memory)
npx firebase-tools@latest deploy --only hosting --token "<see ~/.claude/CLAUDE.md>"
```

## Environment Variables (`.env.local`)
Required for live flight lookup — create `.env.local` in project root:
```
VITE_AERODATABOX_KEY=<RapidAPI key for aerodatabox.p.rapidapi.com — ask user>
```
This file is gitignored. Rebuild after creating it.

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
