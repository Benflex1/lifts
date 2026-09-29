#!/usr/bin/env bash
# Builds Lifts the way F-Droid's build server does, from the in-repo recipe
# (.fdroid.yml). Runs as root inside registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie
# (see .github/workflows/fdroid.yml).
#
# Usage: scripts/fdroid-buildserver-check.sh <commit-sha>
# The recipe's `commit:` is replaced with <commit-sha>, so unreleased commits can be tested.
set -euo pipefail

APP_ID="com.benflex1.lifts"
SOURCE_REF="${1:?usage: $0 <commit-sha>}"
ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
WORK="$ROOT/.fdroid-check"
OUT="$ROOT/fdroid-check-output"

rm -rf "$WORK" "$OUT"
mkdir -p "$WORK" "$OUT"

VERSION_CODE=$(python3 -c 'import json; print(json.load(open("app.json"))["expo"]["android"]["versionCode"])')
BUILD_SPEC="$APP_ID:$VERSION_CODE"
echo "Checking $BUILD_SPEC at $SOURCE_REF"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates git sudo openjdk-21-jdk-headless python3

if [[ -f /etc/profile.d/bsenv.sh ]]; then
  # shellcheck disable=SC1091
  source /etc/profile.d/bsenv.sh
fi
home_vagrant="${home_vagrant:-/home/vagrant}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

sdkmanager="$(command -v sdkmanager || echo "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager")"
"$sdkmanager" "platform-tools" "build-tools;35.0.0" >/dev/null

git clone --quiet --depth 1 https://gitlab.com/fdroid/fdroidserver.git "$WORK/fdroidserver"
git clone --quiet --depth 1 https://gitlab.com/fdroid/fdroiddata.git "$WORK/fdroiddata"

# Effective recipe: the checked-in one, pinned to the commit under test.
sed -E "0,/^    commit: .*/s//    commit: $SOURCE_REF/" .fdroid.yml > "$WORK/$APP_ID.yml"
cp "$WORK/$APP_ID.yml" "$OUT/metadata-used.yml"

mkdir -p "$home_vagrant"/{build,logs,tmp,unsigned,metadata,.android,.gradle}
cp "$WORK/$APP_ID.yml" "$WORK/fdroiddata/metadata/$APP_ID.yml"
cp "$WORK/$APP_ID.yml" "$home_vagrant/metadata/$APP_ID.yml"
ln -sfn "$WORK/fdroiddata" "$home_vagrant/fdroiddata"
chown -R vagrant "$home_vagrant" "$WORK"

fdroid_as_vagrant() {
  sudo --preserve-env --user vagrant env \
    PATH="$WORK/fdroidserver:$PATH" \
    PYTHONPATH="$WORK/fdroidserver:$WORK/fdroidserver/examples" \
    PYTHONUNBUFFERED=true \
    HOME="$home_vagrant" \
    ANDROID_HOME="$ANDROID_HOME" \
    ANDROID_SDK_ROOT="$ANDROID_SDK_ROOT" \
    GRADLE_USER_HOME="$home_vagrant/.gradle" \
    fdroid "$@"
}

# Same metadata checks as the fdroiddata merge request pipeline.
pushd "$WORK/fdroiddata" >/dev/null
fdroid_as_vagrant lint "$APP_ID"
fdroid_as_vagrant rewritemeta "$APP_ID"
if ! diff -u "$WORK/$APP_ID.yml" "metadata/$APP_ID.yml"; then
  echo "::error::.fdroid.yml is not in canonical form; apply the diff above (fdroid rewritemeta)."
  exit 1
fi
popd >/dev/null

pushd "$home_vagrant" >/dev/null
# In --on-server mode `fdroid build` expects the app source (and any srclibs) to be
# checked out already; fetchsrclibs does that, as on F-Droid's own infrastructure.
fdroid_as_vagrant fetchsrclibs "$BUILD_SPEC" --verbose
set +e
(unset CI; fdroid_as_vagrant build --verbose --test --refresh-scanner --on-server --no-tarball "$BUILD_SPEC") \
  2>&1 | tee "$OUT/fdroid-build.log"
status=${PIPESTATUS[0]}
set -e
popd >/dev/null

for apk in "$home_vagrant/unsigned/${APP_ID}_${VERSION_CODE}.apk" \
           "$home_vagrant/tmp/${APP_ID}_${VERSION_CODE}.apk" \
           "$home_vagrant/build/$APP_ID/android/app/build/outputs/apk/release/app-release-unsigned.apk"; do
  if [[ -f "$apk" ]]; then
    cp "$apk" "$OUT/lifts-fdroid-unsigned.apk"
    break
  fi
done

if [[ "$status" -ne 0 ]]; then
  echo "::error::fdroid build failed for $BUILD_SPEC (see fdroid-build.log in the uploaded artifact)"
  exit "$status"
fi
echo "fdroid build succeeded for $BUILD_SPEC"
