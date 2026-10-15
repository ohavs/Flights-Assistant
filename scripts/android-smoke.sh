#!/usr/bin/env bash
# Installs the APK on the CI emulator, launches it and checks the web app
# booted to the sign-in screen (WebView text shows up in the UI dump).
set -euo pipefail
APK=$1
PKG=com.ohavs.flightsassistant
adb install -r "$APK"
adb shell dumpsys package "$PKG" | grep -E "versionCode|versionName" | head -2
adb logcat -c
# One launcher entry, the classic icon's alias (the other icons' aliases
# are off until picked in settings), so the phone shows one app.
launchers=$(adb shell cmd package query-activities --components -a android.intent.action.MAIN -c android.intent.category.LAUNCHER "$PKG" | tr -d '\r' | grep "$PKG/" || true)
echo "launcher entries: $launchers"
if [ "$(echo "$launchers" | grep -c .)" != "1" ] || ! echo "$launchers" | grep -qE "$PKG/(\.|$PKG\.)MainActivity$"; then
  echo "expected one launcher entry, .MainActivity"; exit 1
fi
adb shell am start -W -n "$PKG/.MainActivity"
for i in $(seq 1 20); do
  sleep 3
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || continue
  adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1 || continue
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
adb shell input keyevent KEYCODE_BACK
sleep 3
if adb shell pidof "$PKG" >/dev/null && adb shell dumpsys activity activities | grep -q "topResumedActivity.*$PKG"; then
  echo "back on the first screen did not leave the app"; exit 1
fi
echo "back on the first screen leaves the app"
