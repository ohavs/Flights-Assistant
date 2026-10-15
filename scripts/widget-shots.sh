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

open_widget() {   # <fixture|none> [widthDp heightDp] [provider]; AUTH64 set: a sign-in for the expense widget
  local b64=none now auth=()
  now=$(date +%s%3N)
  if [ "$1" != "none" ]; then b64=${B64[$1]}; now=${NOW[$1]}; fi
  if [ -n "${AUTH64:-}" ]; then auth=(--es auth64 "$AUTH64"); fi
  adb shell am force-stop "$PKG"
  sleep 2   # the system drops the killed host before a new one registers
  adb shell am start -W -n "$PKG/.widget.WidgetPreviewActivity" --es snapshot64 "$b64" --el nowMs "$now" \
    --ei widthDp "${2:-360}" --ei heightDp "${3:-190}" --es provider "${4:-TripWidget}" "${auth[@]}" >/dev/null
  sleep 3
}
texts() { adb shell uiautomator dump /sdcard/w.xml >/dev/null 2>&1; adb pull /sdcard/w.xml w.xml >/dev/null 2>&1; grep -o 'text="[^"]*"' w.xml | sed 's/^text="//; s/"$//' | grep -v '^$' || true; }
tap_text() {   # <text>: taps the view that shows exactly it
  texts >/dev/null
  local xy
  xy=$(python3 - "$1" <<'PY'
import html, re, sys
s = open('w.xml', encoding='utf8').read()
for m in re.finditer(r'text="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s):
    if html.unescape(m.group(1)) == sys.argv[1]:
        x1, y1, x2, y2 = map(int, m.groups()[1:])
        print((x1 + x2) // 2, (y1 + y2) // 2)
        break
PY
)
  if [ -z "$xy" ]; then echo "nothing shows \"$1\". On screen:"; texts | head -40; adb exec-out screencap -p > "widget-tap-FAILED.png"; exit 1; fi
  adb shell input tap $xy
  sleep 1.5
}
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

# The expense widget: a keypad, the trip's currencies, then the sheet over
# the home screen. In CI nobody is signed in, so the save waits for the app.
open_widget plan 360 300 ExpenseWidget; expect 22-expense "הוצאה · פריז עם הילדים" "0 €" "EUR" "המשך"
tap_text 4; tap_text 2; tap_text .; tap_text 5; tap_text 0; tap_text 1   # two decimals at most: the 1 is dropped
expect 23-expense-typed "42.50 €"
tap_text ⌫; tap_text EUR; expect 24-expense-usd "42.5 \$" "USD"
tap_text USD; tap_text ILS; expect 25-expense-eur "42.5 €" "EUR"
tap_text המשך; sleep 1
expect 26-expense-sheet "42.5 €" "≈ 172.13 ₪ · פריז עם הילדים" "קטגוריה" "אוכל ושתייה" "מוזיאונים" "מקום" "הלובר" "גני טווילרי" "שמירה"
tap_text "אוכל ושתייה"; tap_text הלובר
expect 27-expense-picked "אוכל ושתייה" "הלובר"
adb logcat -c
tap_text שמירה; sleep 2
expect 28-expense-queued "יישמר כשתפתחו את האפליקציה ✓" "0 €"
queue=$(adb shell cat "/data/data/$PKG/shared_prefs/expense_queue.xml")
for t in "exp-" "paris" "pl-louvre" "172.13" "EUR" "אוכל ושתייה" "42.5"; do
  grep -qF -- "$t" <<<"$queue" || { echo "the queued expense has no \"$t\":"; echo "$queue"; exit 1; }
done
echo "widget: the expense waits for the app, as the expenses tab writes it"
# Signed in (a sign-in Google refuses): the widget reaches Google with the
# app's key, and is told the sign-in is no good, not that the app is blocked.
KEY=$(node -e "const s=require('fs').readFileSync('src/firebase.js','utf8');const m=s.match(/apiKey:\s*((?:\"[^\"]*\"\s*\+?\s*)+)/);process.stdout.write(m[1].match(/\"([^\"]*)\"/g).map(x=>x.slice(1,-1)).join(''))")
AUTH64=$(printf '{"uid":"ci-user","refreshToken":"ci-not-a-token","apiKey":"%s","projectId":"listify-84018"}' "$KEY" | base64 -w0)
AUTH64=$AUTH64 open_widget plan 360 300 ExpenseWidget
tap_text 9; tap_text המשך; sleep 1; adb logcat -c
tap_text שמירה; sleep 6
log=$(adb logcat -d -s ExpenseWidget:* | tr -d '\r')
echo "$log" | tail -5
grep -q "INVALID_REFRESH_TOKEN" <<<"$log" || { echo "the widget did not reach Google's sign-in as the app"; exit 1; }
grep -q "save: SIGNED_OUT" <<<"$log" || { echo "a refused sign-in should queue the expense"; exit 1; }
expect 29-expense-refused "יישמר כשתפתחו את האפליקציה ✓"
adb shell cmd uimode night yes; sleep 3
open_widget plan 360 300 ExpenseWidget; tap_text 7; expect 30-expense-dark "7 €"
tap_text המשך; sleep 1; expect 31-expense-sheet-dark "שמירה"
adb shell input keyevent KEYCODE_BACK; sleep 1
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
