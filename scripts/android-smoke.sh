#!/usr/bin/env bash
# Installs the APK on the CI emulator, launches it and checks the web app
# booted to the sign-in screen (WebView text shows up in the UI dump).
set -euo pipefail
APK=$1
PKG=com.ohavs.flightsassistant
adb install -r "$APK"
adb shell dumpsys package "$PKG" | grep -E "versionCode|versionName" | head -2
adb logcat -c
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

# The hardware back button on the first screen leaves the app (nothing open).
adb shell input keyevent KEYCODE_BACK
sleep 3
if adb shell pidof "$PKG" >/dev/null && adb shell dumpsys activity activities | grep -q "topResumedActivity.*$PKG"; then
  echo "back on the first screen did not leave the app"; exit 1
fi
echo "back on the first screen leaves the app"
