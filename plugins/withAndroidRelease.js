// Expo config plugin: Android release versioning and upload-key signing.
//
// - versionCode is derived from the semver `expo.version` (1.2.3 -> 1002003) so it
//   always increases with the version. app.json also states it explicitly (F-Droid's
//   update checker reads it from there); prebuild fails if the two disagree.
// - Gradle's versionCode is that value × 10 plus an ABI digit: 0 for the universal APK,
//   and with -PliftsAbi=<abi> a single-ABI APK (armeabi-v7a 1, arm64-v8a 2, x86 3,
//   x86_64 4). F-Droid builds one APK per ABI this way.
// - Every Android library module is built with React Native's NDK. Modules that set no
//   ndkVersion (expo-sqlite) would otherwise fall back to the Android Gradle Plugin's
//   default NDK, which F-Droid would then have to download mid-build.
// - Release builds pin react_native_dev_server_ip, which the React Native Gradle plugin
//   otherwise fills with the build machine's IP address. Release APKs never use it, but it
//   made their bytes depend on the build host and broke F-Droid reproducibility. Debug
//   builds keep the detected IP so they still find Metro.
// - The release build type is signed with the upload key named by the
//   LIFTS_UPLOAD_* environment variables. Without them (local and preview builds)
//   it keeps Expo's debug signing, unless LIFTS_REQUIRE_RELEASE_SIGNING=true, in
//   which case Gradle refuses to build.
const { withAppBuildGradle, withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = '// lifts-release-signing';
const ABI_MARKER = '// lifts-abi-builds';
const NDK_MARKER = '// lifts-uniform-ndk';
const DEV_SERVER_MARKER = '// lifts-reproducible-dev-server-ip';

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

function applyReproducibleDevServerIp(gradle) {
  if (gradle.includes(DEV_SERVER_MARKER)) return gradle;

  const releaseBuildType = /(\n    buildTypes \{\n(?:[^\n]*\n)*?(\s+)release \{\n)/;
  if (!releaseBuildType.test(gradle)) {
    throw new Error(
      'withAndroidRelease: app/build.gradle no longer matches the expected Expo template; ' +
        'update plugins/withAndroidRelease.js before building a release'
    );
  }
  return gradle.replace(
    releaseBuildType,
    (match, _block, indent) =>
      `${match}${indent}    ${DEV_SERVER_MARKER}: release APKs must not embed the build host's IP.\n` +
      `${indent}    resValue "string", "react_native_dev_server_ip", "localhost"\n`
  );
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

const ABI_SETUP = `${ABI_MARKER}: -PliftsAbi=<abi> builds a single-ABI APK with versionCode base * 10 + digit.
def liftsAbiDigits = ['armeabi-v7a': 1, 'arm64-v8a': 2, 'x86': 3, 'x86_64': 4]
def liftsAbi = findProperty('liftsAbi')
if (liftsAbi != null && !liftsAbiDigits.containsKey(liftsAbi)) {
    throw new GradleException("liftsAbi must be one of \${liftsAbiDigits.keySet()}, got '\${liftsAbi}'")
}
def liftsAbiDigit = liftsAbi != null ? liftsAbiDigits[liftsAbi] : 0

`;

function applyAbiBuilds(gradle) {
  if (gradle.includes(ABI_MARKER)) return gradle;

  const androidBlock = /\nandroid \{\n/;
  const versionCode = /(\n(\s+)versionCode (\d+)\n)/;
  if (!androidBlock.test(gradle) || !versionCode.test(gradle)) {
    throw new Error(
      'withAndroidRelease: app/build.gradle no longer matches the expected Expo template; ' +
        'update plugins/withAndroidRelease.js before building a release'
    );
  }

  return gradle
    .replace(androidBlock, `\n${ABI_SETUP}android {\n`)
    .replace(
      versionCode,
      (_, _line, indent, code) =>
        `\n${indent}versionCode ${code} * 10 + liftsAbiDigit\n` +
        `${indent}if (liftsAbi != null) {\n${indent}    ndk { abiFilters liftsAbi }\n${indent}}\n`
    );
}

const UNIFORM_NDK = `
${NDK_MARKER}: build every native module with React Native's NDK (rootProject.ext.ndkVersion).
subprojects {
  plugins.withId('com.android.library') {
    android.ndkVersion = rootProject.ext.ndkVersion
  }
}
`;

function applyUniformNdk(rootGradle) {
  if (rootGradle.includes(NDK_MARKER)) return rootGradle;
  if (!/\napply plugin: "expo-root-project"\n/.test(rootGradle)) {
    throw new Error(
      'withAndroidRelease: android/build.gradle no longer matches the expected Expo template; ' +
        'update plugins/withAndroidRelease.js before building a release'
    );
  }
  return rootGradle.replace(/\n*$/, '\n') + UNIFORM_NDK;
}

function withAndroidRelease(config) {
  config.android = { ...config.android };
  config.android.versionCode = resolveVersionCode(config.version, config.android.versionCode);

  config = withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('withAndroidRelease: only a Groovy android/build.gradle is supported');
    }
    mod.modResults.contents = applyUniformNdk(mod.modResults.contents);
    return mod;
  });

  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('withAndroidRelease: only a Groovy app/build.gradle is supported');
    }
    mod.modResults.contents = applyReproducibleDevServerIp(
      applyAbiBuilds(applyReleaseSigning(mod.modResults.contents))
    );
    return mod;
  });
}

module.exports = withAndroidRelease;
module.exports.toVersionCode = toVersionCode;
module.exports.resolveVersionCode = resolveVersionCode;
module.exports.applyReleaseSigning = applyReleaseSigning;
module.exports.applyAbiBuilds = applyAbiBuilds;
module.exports.applyUniformNdk = applyUniformNdk;
module.exports.applyReproducibleDevServerIp = applyReproducibleDevServerIp;
