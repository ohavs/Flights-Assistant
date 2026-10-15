#!/usr/bin/env bash
# The home screen widgets on the CI emulator: hosted by WidgetPreviewActivity
# (as a launcher would), fed the app's own snapshots at fixed moments
# (widget-fixtures.mjs), checked for what they say, and photographed light
# and dark. 360x190 dp is Samsung's 4x2. After android-smoke.sh, with the app installed. Learned from
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

open_widget() {   # <fixture|none> [widthDp heightDp] [provider]
  local b64=none now
  now=$(date +%s%3N)
  if [ "$1" != "none" ]; then b64=${B64[$1]}; now=${NOW[$1]}; fi
  adb shell am force-stop "$PKG"
  sleep 2   # the system drops the killed host before a new one registers
  adb shell am start -W -n "$PKG/.widget.WidgetPreviewActivity" --es snapshot64 "$b64" --el nowMs "$now" \
    --ei widthDp "${2:-360}" --ei heightDp "${3:-190}" --es provider "${4:-TripWidget}" >/dev/null
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
# The trip widget: the flight, then the plan, at every size.
open_widget flight;  expect 1-flight "פריז עם הילדים" "בעוד 5 ימים" "טיסת הלוך · LY 323" "TLV" "CDG" "יום ג׳ 3.11 · 07:30" "12/22" "נארזו" "תזכורות" "להזמין מונית לשדה"
open_widget soon;    expect 2-soon "בעוד 3 שעות" "טיסת הלוך · LY 323" "TLV"
open_widget plan;    expect 3-plan "יום 2 מתוך 4" "היום · מוזיאונים" "בוקר" "הלובר" "צהריים" "גני טווילרי" "ועוד 3 פעילויות" "12/22"
open_widget return;  expect 4-return "בעוד 9 שעות" "טיסת חזור · LY 326" "CDG" "TLV"
open_widget none;    expect 5-signed-out "התחברו באפליקציה"
open_widget plan 250 110; expect 6-plan-small "יום 2 מתוך 4" "הלובר" "12/22"
open_widget plan-violet 360 300; expect 7-plan-tall "היום · מוזיאונים" "מגדל אייפל בלילה" "גלידה ברטיון"
open_widget flight 170 190; expect 8-trip-narrow "5 ימים" "טיסת הלוך"
# The other widgets.
open_widget flight 170 190 CountdownWidget; expect 9-countdown "5 ימים" "טיסת הלוך" "TLV → CDG"
open_widget plan 170 190 CountdownWidget;   expect 10-countdown-trip "יום 2 מתוך 4" "בוקר · הלובר"
open_widget plan 360 290 PlanWidget;        expect 11-plan "היום · מוזיאונים" "פריז עם הילדים · יום 2 מתוך 4" "הלובר" "מגדל אייפל בלילה"
open_widget flight 360 290 PlanWidget;      expect 12-plan-before "יום 1 · הגעה" "בעוד 5 ימים" "צ׳ק אין במלון"
open_widget flight 170 190 PackWidget;      expect 13-pack "12/22" "55%" "נארזו · פריז עם הילדים"
open_widget flight 360 190 RemindersWidget; expect 14-reminders "תזכורות" "3 פתוחות" "להזמין מונית לשדה" "היום 18:00" "מטען נייד"
adb shell cmd uimode night yes; sleep 3
open_widget flight;  expect 15-flight-dark "בעוד 5 ימים" "TLV"
open_widget plan;    expect 16-plan-dark "יום 2 מתוך 4"
open_widget plan-violet 360 290 PlanWidget; expect 17-plan-widget-dark "הלובר"
open_widget flight 170 190 PackWidget;      expect 18-pack-dark "12/22"
open_widget soon 170 190 CountdownWidget;   expect 19-countdown-dark "3 שעות"
open_widget flight 360 190 RemindersWidget; expect 20-reminders-dark "להדפיס כרטיסים"
adb shell cmd uimode night no; sleep 2

# Nothing ahead any more: the trip has ended.
open_widget ended;   expect 21-nothing-ahead "אין טיול קרוב"

# A tap opens the app.
open_widget flight
texts >/dev/null
read -r X Y < <(python3 - <<'PY'
import re
s = open('w.xml', encoding='utf8').read()
m = re.search(r'text="TLV"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s)
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
