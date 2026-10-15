#!/usr/bin/env bash
# The home screen widget on the CI emulator: hosted by WidgetPreviewActivity
# (as a launcher would), fed the app's own snapshots at fixed moments
# (widget-fixtures.mjs), checked for what it says, and photographed light
# and dark. After android-smoke.sh, with the app installed. Learned from
# Payments (ohavs/payments-2026, scripts/widget-shots.sh).
set -euo pipefail
PKG=com.ohavs.flightsassistant
adb root >/dev/null; sleep 3; adb wait-for-device
adb shell appwidget grantbind --package "$PKG" --user 0
adb shell settings put system time_12_24 24 >/dev/null || true
# A phone-sized screen for the pictures.
adb shell wm size 1080x2400; adb shell wm density 420; sleep 2

declare -A NOW B64
while read -r name now b64; do NOW[$name]=$now; B64[$name]=$b64; done < <(TZ=UTC node scripts/widget-fixtures.mjs)

open_widget() {   # <fixture|none> [widthDp heightDp]
  local b64=none now
  now=$(date +%s%3N)
  if [ "$1" != "none" ]; then b64=${B64[$1]}; now=${NOW[$1]}; fi
  adb shell am force-stop "$PKG"
  sleep 2   # the system drops the killed host before a new one registers
  adb shell am start -W -n "$PKG/.widget.WidgetPreviewActivity" --es snapshot64 "$b64" --el nowMs "$now" \
    --ei widthDp "${2:-340}" --ei heightDp "${3:-170}" >/dev/null
  sleep 3
}
texts() { adb shell uiautomator dump /sdcard/w.xml >/dev/null 2>&1; adb pull /sdcard/w.xml w.xml >/dev/null 2>&1; grep -o 'text="[^"]*"' w.xml | sed 's/^text="//; s/"$//' | grep -v '^$' || true; }
expect() {   # <shot> <text>...
  local shot=$1; shift
  local seen; seen=$(texts)
  for t in "$@"; do
    if ! grep -qF -- "$t" <<<"$seen"; then
      echo "widget $shot: missing \"$t\". On screen:"; echo "$seen" | head -30
      adb exec-out screencap -p > "widget-$shot-FAILED.png"
      adb logcat -d | grep -E "TripWidget|AndroidRuntime|AppWidget" | tail -30
      exit 1
    fi
  done
  adb exec-out screencap -p > "widget-$shot.png"
  echo "widget $shot: ok"
}

adb shell cmd uimode night no; sleep 2
open_widget flight;  expect 1-flight "פריז עם הילדים" "בעוד 5 ימים" "טיסת הלוך · LY 323" "TLV → CDG" "יום ג׳ 3.11 · 07:30" "12/22 נארזו" "3 תזכורות"
open_widget soon;    expect 2-soon "בעוד 3 שעות" "טיסת הלוך · LY 323"
open_widget plan;    expect 3-plan "יום 2 מתוך 4" "היום · יום 2 · מוזיאונים" "•  בוקר · הלובר" "•  צהריים · גני טווילרי" "ועוד 3 פעילויות" "12/22 נארזו"
open_widget return;  expect 4-return "בעוד 9 שעות" "טיסת חזור · LY 326" "CDG → TLV"
open_widget none;    expect 5-signed-out "התחברו באפליקציה"
open_widget plan 250 110; expect 6-plan-small "יום 2 מתוך 4" "12/22 נארזו"
adb shell cmd uimode night yes; sleep 3
open_widget flight;  expect 7-flight-dark "בעוד 5 ימים"
open_widget plan;    expect 8-plan-dark "יום 2 מתוך 4"
adb shell cmd uimode night no; sleep 2

# Nothing ahead any more: the trip has ended.
open_widget ended;   expect 9-nothing-ahead "אין טיול קרוב"

# A tap opens the app.
open_widget flight
texts >/dev/null
read -r X Y < <(python3 - <<'PY'
import re
s = open('w.xml', encoding='utf8').read()
m = re.search(r'text="TLV → CDG"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s)
x1, y1, x2, y2 = map(int, m.groups())
print((x1 + x2) // 2, (y1 + y2) // 2)
PY
)
adb shell input tap "$X" "$Y"
sleep 4
top=$(adb shell dumpsys activity activities | grep -m1 "topResumedActivity" | tr -d '\r')
echo "after the tap: $top"
grep -q "$PKG/.AppActivity" <<<"$top" || { echo "tapping the widget did not open the app"; exit 1; }
echo "widget: a tap opens the app"
adb shell wm size reset; adb shell wm density reset
