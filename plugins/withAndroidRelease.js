// Expo config plugin: Android release versioning and upload-key signing.
//
// - versionCode is derived from the semver `expo.version` (1.2.3 -> 1002003) so it
//   always increases with the version. app.json also states it explicitly (F-Droid's
//   update checker reads it from there); prebuild fails if the two disagree.
// - The release build type is signed with the upload key named by the
//   LIFTS_UPLOAD_* environment variables. Without them (local and preview builds)
//   it keeps Expo's debug signing, unless LIFTS_REQUIRE_RELEASE_SIGNING=true, in
//   which case Gradle refuses to build.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// lifts-release-signing';

function toVersionCode(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version ?? ''));
  if (!match) {
    throw new Error(`withAndroidRelease: expo.version must be MAJOR.MINOR.PATCH, got "${version}"`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major < 1 || major > 2000 || minor > 999 || patch > 999) {
    throw new Error(`withAndroidRelease: expo.version "${version}" is outside the versionCode range`);
  }
  return major * 1_000_000 + minor * 1_000 + patch;
}

const RELEASE_SIGNING_CONFIG = `        ${MARKER}
        if (System.getenv('LIFTS_UPLOAD_STORE_FILE')) {
            release {
                storeFile file(System.getenv('LIFTS_UPLOAD_STORE_FILE'))
                storePassword System.getenv('LIFTS_UPLOAD_STORE_PASSWORD')
                keyAlias System.getenv('LIFTS_UPLOAD_KEY_ALIAS')
                keyPassword System.getenv('LIFTS_UPLOAD_KEY_PASSWORD')
            }
        } else if (System.getenv('LIFTS_REQUIRE_RELEASE_SIGNING') == 'true') {
            throw new GradleException('LIFTS_REQUIRE_RELEASE_SIGNING is set but LIFTS_UPLOAD_STORE_FILE is missing')
        }
`;

function applyReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  const signingConfigs = /(\n    signingConfigs \{\n)/;
  const releaseSigning = /(\n        release \{\n(?:[^\n]*\n)*?\s+)signingConfig signingConfigs\.debug/;
  if (!signingConfigs.test(gradle) || !releaseSigning.test(gradle)) {
    throw new Error(
      'withAndroidRelease: app/build.gradle no longer matches the expected Expo template; ' +
        'update plugins/withAndroidRelease.js before building a release'
    );
  }

  return gradle
    .replace(signingConfigs, `$1${RELEASE_SIGNING_CONFIG}`)
    .replace(releaseSigning, '$1signingConfig signingConfigs.findByName(\'release\') ?: signingConfigs.debug');
}

function resolveVersionCode(version, explicitVersionCode) {
  const derived = toVersionCode(version);
  if (explicitVersionCode != null && explicitVersionCode !== derived) {
    throw new Error(
      `withAndroidRelease: android.versionCode ${explicitVersionCode} does not match ` +
        `expo.version ${version} (expected ${derived})`
    );
  }
  return derived;
}

function withAndroidRelease(config) {
  config.android = { ...config.android };
  config.android.versionCode = resolveVersionCode(config.version, config.android.versionCode);

  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('withAndroidRelease: only a Groovy app/build.gradle is supported');
    }
    mod.modResults.contents = applyReleaseSigning(mod.modResults.contents);
    return mod;
  });
}

module.exports = withAndroidRelease;
module.exports.toVersionCode = toVersionCode;
module.exports.resolveVersionCode = resolveVersionCode;
module.exports.applyReleaseSigning = applyReleaseSigning;
