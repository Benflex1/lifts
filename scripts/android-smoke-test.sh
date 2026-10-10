#!/usr/bin/env bash
# Installs an APK on the running emulator/device, launches Lifts, and fails if the
# app is not running afterwards or anything crashed. Byte-level checks cannot catch a
# build that is reproducible but broken (v1.0.2-1.0.4 per-ABI APKs crashed on launch
# because F-Droid's scanner deleted react-native-svg's build.gradle).
#
# Usage: scripts/android-smoke-test.sh <apk> [screenshot.png]
# Unsigned APKs are signed with a throwaway key first. Needs adb, keytool, and
# apksigner (ANDROID_HOME/build-tools/*).
set -euo pipefail

APK="${1:?usage: $0 <apk> [screenshot.png]}"
SCREENSHOT="${2:-}"
PACKAGE=com.benflex1.lifts
WAIT_SECONDS=20

ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
adb() { command adb "$@" </dev/null; }
apksigner=$(command -v apksigner || ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -n 1 | sed 's|$|/apksigner|')

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if ! "$apksigner" verify "$APK" >/dev/null 2>&1; then
  keytool -genkeypair -keystore "$work/smoke.jks" -storepass smoketest -keypass smoketest \
    -alias smoke -keyalg RSA -keysize 2048 -validity 1 -dname CN=smoke-test >/dev/null 2>&1
  "$apksigner" sign --ks "$work/smoke.jks" --ks-pass pass:smoketest --out "$work/app.apk" "$APK"
  APK="$work/app.apk"
fi

adb uninstall "$PACKAGE" >/dev/null 2>&1 || true
adb install "$APK" >/dev/null
adb shell pm grant "$PACKAGE" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
adb logcat -c
adb logcat -b crash -c
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep "$WAIT_SECONDS"

[[ -n "$SCREENSHOT" ]] && adb exec-out screencap -p > "$SCREENSHOT"

pid=$(adb shell pidof "$PACKAGE" | tr -d '\r' || true)
crashes=$(adb logcat -d -b crash || true)
if [[ -z "$pid" || -n "$crashes" ]]; then
  echo "::error::Lifts is not running ${WAIT_SECONDS}s after launch (pid='${pid}')"
  echo "${crashes:-<no crash buffer entries>}" | head -n 40
  exit 1
fi
echo "Smoke test passed: Lifts running (pid $pid) ${WAIT_SECONDS}s after launch, no crashes"
