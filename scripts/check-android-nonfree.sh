#!/usr/bin/env bash
# Fails when the Android release build contains non-free Google libraries (Firebase,
# Play Services, ...), which would keep Lifts out of F-Droid. Run from the repository
# root after `expo prebuild --platform android`; after a release build it also scans
# the merged manifest.
set -euo pipefail

pattern='com\.google\.firebase|com\.google\.android\.gms|com\.google\.android\.play|com\.google\.android\.datatransport|com\.google\.mlkit|com\.android\.billingclient'

deps=$(cd android && ./gradlew -q :app:dependencies --configuration releaseRuntimeClasspath --no-daemon)
if matches=$(grep -oE "($pattern)[^ ]*" <<<"$deps" | sort -u) && [ -n "$matches" ]; then
  echo "::error::Non-free Google dependencies in the Android release classpath:"
  echo "$matches"
  exit 1
fi
echo "releaseRuntimeClasspath: no Firebase or Play Services dependencies."

manifest=$(find android/app/build/intermediates -path '*release*' -name AndroidManifest.xml -print -quit 2>/dev/null || true)
if [ -n "$manifest" ]; then
  if grep -qiE 'firebase|com\.google\.android\.gms' "$manifest"; then
    echo "::error::Merged release manifest references Firebase or Play Services: $manifest"
    grep -niE 'firebase|com\.google\.android\.gms' "$manifest"
    exit 1
  fi
  echo "Merged release manifest: clean ($manifest)."
fi
