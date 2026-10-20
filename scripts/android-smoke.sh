#!/usr/bin/env bash
# Installs the APK on the CI emulator, launches it and checks the web app
# booted to the sign-in screen (WebView text shows up in the UI dump).
set -euo pipefail
APK=$1
PKG=com.ohavs.flightsassistant
# A slow emulator sometimes puts "<app> isn't responding" (the launcher's,
# not ours) over everything: answer "Wait", so the screen is the app's
# again. Reads the ui.xml just pulled; true when it dismissed one.
dismiss_anr() {
  grep -q "isn't responding" ui.xml || return 1
  local xy
  xy=$(python3 - <<'PY'
import re
s = open('ui.xml', encoding='utf8').read()
m = re.search(r'text="Wait"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s)
if m:
    x1, y1, x2, y2 = map(int, m.groups())
    print((x1 + x2) // 2, (y1 + y2) // 2)
PY
)
  if [ -n "$xy" ]; then adb shell input tap $xy; else adb shell input keyevent KEYCODE_BACK; fi
  echo "dismissed a system \"isn't responding\" dialog"
}
adb install -r "$APK"
adb shell dumpsys package "$PKG" | grep -E "versionCode|versionName" | head -2
adb logcat -c
# One launcher entry, the activity itself (since 8.40.0; the old
# .MainActivity alias is no longer one), so the phone shows one app.
launchers=$(adb shell cmd package query-activities --components -a android.intent.action.MAIN -c android.intent.category.LAUNCHER "$PKG" | tr -d '\r' | grep "$PKG/" || true)
echo "launcher entries: $launchers"
if [ "$(echo "$launchers" | grep -c .)" != "1" ] || ! echo "$launchers" | grep -qE "$PKG/(\.|$PKG\.)AppActivity$"; then
  echo "expected one launcher entry, .AppActivity"; exit 1
fi
# The old name still opens the app (an intent made before 8.40.0).
adb shell am start -W -n "$PKG/.MainActivity" | grep -q "Status: ok" || { echo ".MainActivity no longer opens the app"; exit 1; }
adb shell am force-stop "$PKG"
adb shell am start -W -n "$PKG/.AppActivity"
for i in $(seq 1 20); do
  sleep 3
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || continue
  adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1 || continue
  if dismiss_anr; then continue; fi
  if grep -q "התחבר עם Google" ui.xml; then
    echo "sign-in screen rendered after $((i * 3))s"
    adb exec-out screencap -p > android-smoke.png
    booted=1
    break
  fi
done
if [ -z "${booted:-}" ]; then
  echo "sign-in screen never appeared"; adb exec-out screencap -p > android-smoke.png || true
  adb logcat -d | grep -iE "chromium|console|capacitor|AndroidRuntime" | tail -120
  exit 1
fi

# Tapping "sign in" reaches Google: its account sheet opens, or (the CI
# emulator has no Google account) the attempt ends with a message. It must
# never sit on "מתחבר..." with nothing on screen, as 8.23.0 did.
read -r X Y < <(python3 - <<'PY'
import re
s = open('ui.xml', encoding='utf8').read()
m = re.search(r'text="[^"]*התחבר עם Google[^"]*"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s)
x1, y1, x2, y2 = map(int, m.groups())
print((x1 + x2) // 2, (y1 + y2) // 2)
PY
)
adb shell input tap "$X" "$Y"
for i in $(seq 1 15); do
  sleep 2
  focus=$(adb shell dumpsys window | grep -m1 mCurrentFocus || true)
  if echo "$focus" | grep -qE "com.google.android.gms|credentialmanager"; then
    echo "Google's account sheet opened after $((i * 2))s: $focus"
    adb exec-out screencap -p > android-signin.png
    adb shell input keyevent KEYCODE_BACK; sleep 2
    reached=1; break
  fi
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || continue
  adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1 || continue
  if dismiss_anr; then continue; fi
  if grep -qE "נכשלה|אין חשבון Google" ui.xml; then
    echo "sign-in ended with a message after $((i * 2))s:"
    grep -oE 'text="[^"]*(נכשלה|אין חשבון Google)[^"]*"' ui.xml | head -2
    adb exec-out screencap -p > android-signin.png
    reached=1; break
  fi
done
if [ -z "${reached:-}" ]; then
  echo "tapping sign in did nothing for 30s (focus: ${focus:-?})"
  adb exec-out screencap -p > android-signin.png || true
  adb logcat -d | grep -iE "chromium|console|capacitor|FirebaseAuth|credential" | tail -80
  exit 1
fi

# The hardware back button on the first screen leaves the app (nothing open).
# Polled, not a fixed wait: on a slow emulator 3 seconds were not always
# enough (2026-10-20, a run with nothing changed near this screen).
adb shell input keyevent KEYCODE_BACK
for i in $(seq 1 10); do
  sleep 1
  # grep without -q reads to the end, so dumpsys never dies of SIGPIPE
  # (pipefail would read that as "gone").
  if ! { adb shell pidof "$PKG" >/dev/null && adb shell dumpsys activity activities | grep "topResumedActivity.*$PKG" >/dev/null; }; then
    left=1; break
  fi
done
if [ -z "${left:-}" ]; then
  echo "back on the first screen did not leave the app in 10s"; exit 1
fi
echo "back on the first screen leaves the app"


# "Share" from Google Maps: the app is one of the share targets, and a
# shared place opens the trip picker with the place's name.
targets=$(adb shell cmd package query-activities --components -a android.intent.action.SEND -t text/plain | tr -d '\r' | grep "$PKG/" || true)
echo "share targets: $targets"
[ -n "$targets" ] || { echo "the app is not in the share sheet"; exit 1; }
adb shell "am start -W -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT 'Louvre Museum https://maps.app.goo.gl/smoke123' -n $PKG/.AppActivity" | grep -E "Status|Activity:" || true
for i in $(seq 1 15); do
  sleep 2
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || continue
  adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1 || continue
  if dismiss_anr; then continue; fi
  if grep -q "לאיזה טיול להוסיף" ui.xml && grep -q "Louvre Museum" ui.xml; then
    echo "a shared place opens the trip picker after $((i * 2))s"
    adb exec-out screencap -p > android-share.png
    shared=1; break
  fi
done
if [ -z "${shared:-}" ]; then
  echo "sharing a place did not open the trip picker"
  grep -o 'text="[^"]*"' ui.xml | head -20
  adb exec-out screencap -p > android-share.png || true
  exit 1
fi
