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

open_widget() {   # <fixture|none> [widthDp heightDp] [provider]; AUTH64: a sign-in for the expense widget; TRIP: the trip it is set to
  local b64=none now auth=()
  now=$(date +%s%3N)
  if [ "$1" != "none" ]; then b64=${B64[$1]}; now=${NOW[$1]}; fi
  if [ -n "${AUTH64:-}" ]; then auth=(--es auth64 "$AUTH64"); fi
  if [ -n "${TRIP:-}" ]; then auth+=(--es trip "$TRIP"); fi
  adb shell am force-stop "$PKG"
  sleep 2   # the system drops the killed host before a new one registers
  adb shell am start -W -n "$PKG/.widget.WidgetPreviewActivity" --es snapshot64 "$b64" --el nowMs "$now" \
    --ei widthDp "${2:-360}" --ei heightDp "${3:-190}" --es provider "${4:-TripWidget}" "${auth[@]}" >/dev/null
  sleep 3
}
texts() { adb shell uiautomator dump /sdcard/w.xml >/dev/null 2>&1; adb pull /sdcard/w.xml w.xml >/dev/null 2>&1; grep -o 'text="[^"]*"' w.xml | sed 's/^text="//; s/"$//' | grep -v '^$' || true; }
descs() { texts >/dev/null; grep -o 'content-desc="[^"]*"' w.xml | sed 's/^content-desc="//; s/"$//' | grep -v '^$' || true; }
expect_desc() {   # <shot> <content description>...
  local shot=$1; shift
  local seen; seen=$(descs)
  for t in "$@"; do
    grep -qF -- "$t" <<<"$seen" || { echo "widget $shot: nothing described \"$t\". Described:"; echo "$seen" | head -20; adb exec-out screencap -p > "widget-$shot-FAILED.png"; exit 1; }
  done
  adb exec-out screencap -p > "widget-$shot.png"
  echo "widget $shot: ok"
}
tap_desc() {   # <content description>: taps the view it describes
  texts >/dev/null
  local xy
  xy=$(python3 - "$1" <<'PY'
import html, re, sys
s = open('w.xml', encoding='utf8').read()
for m in re.finditer(r'content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s):
    if html.unescape(m.group(1)) == sys.argv[1]:
        x1, y1, x2, y2 = map(int, m.groups()[1:])
        print((x1 + x2) // 2, (y1 + y2) // 2)
        break
PY
)
  if [ -z "$xy" ]; then echo "nothing described \"$1\""; descs | head -20; exit 1; fi
  adb shell input tap $xy
  sleep 2
}
scroll_list() {   # swipes the widget's list up by most of its height
  texts >/dev/null
  local box
  box=$(python3 - <<'PY'
import re
s = open('w.xml', encoding='utf8').read()
m = re.search(r'resource-id="com\.ohavs\.flightsassistant:id/list"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s)
x1, y1, x2, y2 = map(int, m.groups())
print((x1 + x2) // 2, y2 - 20, y1 + 20)
PY
)
  set -- $box
  adb shell input swipe "$1" "$2" "$1" "$3" 400
  sleep 1.5
}
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
shade() {   # light or dark: the widget card's own colour, inside its padding
  texts >/dev/null
  adb exec-out screencap > w.raw
  python3 - <<'PY'
import re, struct
s = open('w.xml', encoding='utf8').read()
# The widget's outermost view of ours (its card), or the largest one listed.
boxes = [tuple(map(int, m.groups())) for m in re.finditer(
    r'resource-id="com\.ohavs\.flightsassistant:id/\w+"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s)]
x1, y1, x2, y2 = max(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
raw = open('w.raw', 'rb').read()
w, h = struct.unpack('<II', raw[:8])
i = len(raw) - w * h * 4 + (((y1 + y2) // 2) * w + x1 + 12) * 4
print('dark' if sum(raw[i:i + 3]) < 384 else 'light')
PY
}
want_shade() {   # <shot> <light|dark>
  local got; got=$(shade)
  if [ "$got" != "$2" ]; then echo "widget $1: the card is $got, should be $2"; adb exec-out screencap -p > "widget-$1-FAILED.png"; exit 1; fi
  adb exec-out screencap -p > "widget-$1.png"
  echo "widget $1: $2 card ok"
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
open_widget flight;  expect 1-flight "פריז עם הילדים" "בעוד 5 ימים" "טיסת הלוך · LY 323" "TLV" "CDG" "יום ג׳ 3.11 · המראה 07:30 · נחיתה 10:45" "שער B12 · בזמן" "12/22" "תזכורות"
open_widget soon;    expect 2-soon "בעוד 3 שעות" "טיסת הלוך · LY 323" "TLV"
# After takeoff the widget follows the flight to its landing, by itself.
open_widget inair;   expect 2b-in-air "בטיסה" "נוחתת ב־10:45 שעון פריז" "עוד שעתיים ו־15 דק׳" "TLV" "CDG"
open_widget inair 170 190 CountdownWidget; expect 2c-countdown-in-air "בטיסה" "TLV → CDG"
open_widget plan;    expect 3-plan "יום 2 מתוך 4" "היום · מוזיאונים" "בוקר" "הלובר" "צהריים" "גני טווילרי" "ועוד 3 פעילויות" "12/22"
open_widget return;  expect 4-return "בעוד 9 שעות" "טיסת חזור · LY 326" "CDG" "TLV"
open_widget none;    expect 5-signed-out "התחברו באפליקציה"
open_widget plan 250 110; expect 6-plan-small "יום 2 מתוך 4" "הלובר" "12/22"
open_widget plan-violet 360 300; expect 7-plan-tall "היום · מוזיאונים" "מגדל אייפל בלילה" "גלידה ברטיון"
open_widget flight 170 190; expect 8-trip-narrow "5 ימים" "טיסת הלוך"
# The other widgets.
open_widget flight 170 190 CountdownWidget; expect 9-countdown "5 ימים" "טיסת הלוך" "TLV → CDG"
open_widget plan 170 190 CountdownWidget;   expect 10-countdown-trip "יום 2 מתוך 4" "בוקר · הלובר"
open_widget plan 360 290 PlanWidget;        expect 11-plan "היום · מוזיאונים" "פריז עם הילדים · יום 2 מתוך 4" "הלובר" "גני טווילרי"
# The plan scrolls, and a place is ticked as visited (queued: nobody is signed in).
scroll_list; expect 11b-plan-scrolled "מגדל אייפל בלילה"
open_widget plan 360 290 PlanWidget
tap_desc "סמן: הלובר"; expect_desc 11c-plan-ticked "בוצע: הלובר"
queue=$(adb shell cat "/data/data/$PKG/shared_prefs/expense_queue.xml")
# Android's JSON writes "/" as "\/": look for the parts.
for t in "planning" "pl-louvre" "visited"; do
  grep -qF -- "$t" <<<"$queue" || { echo "the tick is not queued (\"$t\"):"; echo "$queue"; exit 1; }
done
echo "widget: a ticked place is queued for Firestore"
open_widget flight 360 290 PlanWidget;      expect 12-plan-before "יום 1 · הגעה" "בעוד 5 ימים" "צ׳ק אין במלון"
open_widget flight 170 190 PackWidget;      expect 13-pack "12/22" "55%" "נארזו · פריז עם הילדים"
open_widget flight 360 190 RemindersWidget; expect 14-reminders "תזכורות" "5 פתוחות" "להזמין מונית לשדה" "היום 18:00"
scroll_list; scroll_list; expect 14b-reminders-scrolled "להשאיר מפתח לשכנים"
open_widget flight 360 190 RemindersWidget
tap_desc "סמן: להזמין מונית לשדה"; expect_desc 14c-reminder-ticked "בוצע: להזמין מונית לשדה"; expect 14d-reminders-count "4 פתוחות"
queue=$(adb shell cat "/data/data/$PKG/shared_prefs/expense_queue.xml")
grep -qF "reminders" <<<"$queue" && grep -qF "r1&quot;" <<<"$queue" && grep -qF "completed" <<<"$queue" || { echo "the done reminder is not queued:"; echo "$queue"; exit 1; }
echo "widget: a done reminder is queued for Firestore"
# "+" adds a reminder over the home screen: it is in the list at once, and
# waits for Firestore (in CI nobody is signed in).
open_widget flight 360 190 RemindersWidget
tap_desc "תזכורת חדשה"; sleep 1
expect 14e-reminder-sheet "תזכורת חדשה" "מה להזכיר?" "שמירה"
adb shell input text "Buy%sadapter"; sleep 1
tap_text שמירה; sleep 3
expect 14f-reminder-added "Buy adapter" "להזמין מונית לשדה"
queue=$(adb shell cat "/data/data/$PKG/shared_prefs/expense_queue.xml")
grep -qF "Buy adapter" <<<"$queue" && grep -qF "reminders" <<<"$queue" || { echo "the new reminder is not queued:"; echo "$queue"; exit 1; }
echo "widget: a reminder added on the widget is queued for Firestore"
# The app set to dark on a light phone.
open_widget plan-app-dark; want_shade 21a-app-dark dark
open_widget plan-app-dark 360 300 ExpenseWidget; want_shade 21b-expense-app-dark dark
open_widget plan; want_shade 21c-phone-light light
adb shell cmd uimode night yes; sleep 3
# The app set to light on a dark phone; set to follow the phone, dark.
open_widget plan-app-light; want_shade 21d-app-light light
open_widget plan; want_shade 21e-phone-dark dark
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
# Paris: shekels and euros (the destination's), nothing else used yet.
tap_text ⌫; tap_text EUR; expect 24-expense-ils "42.5 ₪" "ILS"
tap_text ILS; expect 25-expense-eur "42.5 €" "EUR"
tap_text המשך; sleep 1
expect 26-expense-sheet "42.5 €" "≈ 172.13 ₪ · פריז עם הילדים" "קטגוריה" "אוכל ושתייה" "מוזיאונים" "מקום" "הלובר" "גני טווילרי" "מוזיאון אורסיי" "מגדל אייפל" "שמירה"
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
# A tap beside the keys opens the trip's expenses.
open_widget plan 360 300 ExpenseWidget
tap_text "הוצאה · פריז עם הילדים"; sleep 3
top=$(adb shell dumpsys activity activities | grep -m1 "topResumedActivity" | tr -d '\r')
grep -q "$PKG/.AppActivity" <<<"$top" || { echo "a tap beside the keys did not open the app: $top"; exit 1; }
echo "widget: a tap beside the keys opens the app"
adb shell cmd uimode night yes; sleep 3
open_widget plan 360 300 ExpenseWidget; tap_text 7; expect 30-expense-dark "7 €"
tap_text המשך; sleep 1; expect 31-expense-sheet-dark "שמירה"
adb shell input keyevent KEYCODE_BACK; sleep 1
adb shell cmd uimode night no; sleep 2

# The expense widget's settings: its trip, and its keypad's currencies,
# removed or added from every one the app knows; saved, the keypad goes
# through those.
adb logcat -c; open_widget plan 360 300 ExpenseWidget
wid=$(adb logcat -d -s WidgetPreview:I | grep -o 'widget id [0-9]*' | tail -1 | awk '{print $3}')
adb shell am start -W -n "$PKG/.widget.WidgetTripActivity" --ei appWidgetId "$wid" >/dev/null; sleep 2
expect 32-expense-settings "הגדרות הווידג׳ט" "פריז עם הילדים" "מטבעות במקלדת" "ILS ₪  ✕" "EUR €  ✕" "+ הוספת מטבע"
tap_text "ILS ₪  ✕"; tap_text "+ הוספת מטבע"; tap_text "+ דולר אמריקאי · USD"
expect 33-expense-currencies "EUR €  ✕" "USD \$  ✕" "כמו בטיול"
tap_text שמירה; sleep 2
expect 34-expense-own "0 €" "EUR"
tap_text EUR; expect 35-expense-usd "0 \$" "USD"
tap_text USD; expect 36-expense-eur-again "0 €" "EUR"

# A widget set to a trip shows it, not the next one.
TRIP=rome open_widget flight; expect 21f-set-to-rome "רומא עם ההורים" "טיסת הלוך · LY 383" "FCO"
# Added from the home screen, a widget asks which trip (its configure screen).
adb logcat -c; open_widget flight
wid=$(adb logcat -d -s WidgetPreview:I | grep -o 'widget id [0-9]*' | tail -1 | awk '{print $3}')
adb shell am start -W -n "$PKG/.widget.WidgetTripActivity" --ei appWidgetId "$wid" >/dev/null; sleep 2
expect 21g-trip-picker "לאיזה טיול הווידג׳ט?" "הטיול הבא" "פריז עם הילדים" "רומא עם ההורים"
tap_text "רומא עם ההורים"; sleep 2
expect 21h-picked-rome "רומא עם ההורים" "FCO"

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
