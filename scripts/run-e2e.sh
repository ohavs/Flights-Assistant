#!/usr/bin/env bash
# Builds the app in emulator mode, starts the Firebase emulators and a preview
# server, then runs the browser smoke test. Never touches the real project.
# Usage: npm run test:e2e   (or: bash scripts/run-e2e.sh <test file>)
set -u
set -m  # background jobs get their own process group, so cleanup stops their children too
cd "$(dirname "$0")/.."
OUT=.e2e
TEST=${1:-tests/e2e/smoke.e2e.mjs}
rm -rf "$OUT" && mkdir -p "$OUT"
FIREBASE="npx -y firebase-tools@14.27.0"

VITE_USE_FIREBASE_EMULATORS=true npx vite build --outDir "$OUT/dist" --emptyOutDir > "$OUT/build.log" 2>&1 \
  || { echo "build failed — see $OUT/build.log"; exit 1; }

$FIREBASE emulators:start --project demo-flights --only firestore,auth > "$OUT/emulators.log" 2>&1 &
EMULATORS_PID=$!
npx vite preview --outDir "$OUT/dist" --port 5173 --strictPort > "$OUT/preview.log" 2>&1 &
PREVIEW_PID=$!

cleanup() {
  kill -- -"$PREVIEW_PID" -"$EMULATORS_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT

for _ in $(seq 1 90); do
  curl -s 127.0.0.1:8080 > /dev/null && curl -s 127.0.0.1:9099 > /dev/null && curl -s localhost:5173 > /dev/null && break
  sleep 1
done

node "$TEST" "$OUT"
