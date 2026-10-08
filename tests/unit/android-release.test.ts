import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { toVersionCode, resolveVersionCode, applyReleaseSigning, applyAbiBuilds, applyUniformNdk, applyReproducibleDevServerIp } = require('../../plugins/withAndroidRelease') as {
  applyAbiBuilds: (gradle: string) => string;
  applyUniformNdk: (rootGradle: string) => string;
  applyReproducibleDevServerIp: (gradle: string) => string;
  toVersionCode: (version: unknown) => number;
  resolveVersionCode: (version: unknown, explicitVersionCode?: number) => number;
  applyReleaseSigning: (gradle: string) => string;
};

// Unmodified app/build.gradle from `expo prebuild --platform android` on Expo SDK 57.
const template = readFileSync(join(__dirname, '../fixtures/expo-57-app.build.gradle'), 'utf8');

function releaseBuildType(gradle: string): string {
  const start = gradle.indexOf('\n        release {', gradle.indexOf('buildTypes {'));
  return gradle.slice(start, gradle.indexOf('\n        }', start));
}

describe('toVersionCode', () => {
  it('encodes MAJOR.MINOR.PATCH so later versions always get larger codes', () => {
    assert.equal(toVersionCode('1.0.0'), 1_000_000);
    assert.equal(toVersionCode('1.2.3'), 1_002_003);
    assert.ok(toVersionCode('1.10.0') > toVersionCode('1.9.999'));
    assert.ok(toVersionCode('2.0.0') > toVersionCode('1.999.999'));
  });

  it('rejects versions that are not plain semver or overflow a component', () => {
    for (const bad of [undefined, '', '1.0', '1.0.0-beta.1', 'v1.0.0', '0.9.0', '1.1000.0', '1.0.1000']) {
      assert.throws(() => toVersionCode(bad), /withAndroidRelease/, String(bad));
    }
  });
});

describe('resolveVersionCode', () => {
  it('accepts an explicit versionCode only when it matches the version', () => {
    assert.equal(resolveVersionCode('1.0.1'), 1_000_001);
    assert.equal(resolveVersionCode('1.0.1', 1_000_001), 1_000_001);
    assert.throws(() => resolveVersionCode('1.0.2', 1_000_001), /does not match expo\.version 1\.0\.2 \(expected 1000002\)/);
  });

  it('matches the versionCode stated in app.json', () => {
    const { expo } = JSON.parse(readFileSync(join(__dirname, '../../app.json'), 'utf8'));
    assert.equal(expo.android.versionCode, toVersionCode(expo.version));
  });
});

describe('applyReleaseSigning', () => {
  it('signs release builds with the upload key when it is provided, falling back to debug otherwise', () => {
    const patched = applyReleaseSigning(template);

    assert.match(patched, /storeFile file\(System\.getenv\('LIFTS_UPLOAD_STORE_FILE'\)\)/);
    assert.match(patched, /LIFTS_REQUIRE_RELEASE_SIGNING/);
    assert.match(
      releaseBuildType(patched),
      /signingConfig signingConfigs\.findByName\('release'\) \?: signingConfigs\.debug/
    );
    assert.doesNotMatch(releaseBuildType(patched), /signingConfig signingConfigs\.debug\n/);
  });

  it('leaves debug builds on the debug keystore', () => {
    const patched = applyReleaseSigning(template);
    const debugBuildType = patched.slice(patched.indexOf('buildTypes {'), patched.indexOf('\n        release {', patched.indexOf('buildTypes {')));

    assert.match(debugBuildType, /debug \{\n\s+signingConfig signingConfigs\.debug\n/);
    assert.match(patched, /storeFile file\('debug\.keystore'\)/);
  });

  it('is idempotent', () => {
    const once = applyReleaseSigning(template);
    assert.equal(applyReleaseSigning(once), once);
  });

  it('fails loudly when the Expo template no longer matches', () => {
    const drifted = template.replace(/\n        release \{/, '\n        releaseRenamed {');
    assert.throws(() => applyReleaseSigning(drifted), /no longer matches the expected Expo template/);
    assert.throws(() => applyReleaseSigning('android {}'), /no longer matches the expected Expo template/);
  });
});

describe('applyAbiBuilds', () => {
  const patched = applyAbiBuilds(template);

  it('multiplies the versionCode by 10 and adds the ABI digit', () => {
    assert.match(patched, /\n\s+versionCode 1 \* 10 \+ liftsAbiDigit\n/);
    assert.match(patched, /def liftsAbiDigits = \['armeabi-v7a': 1, 'arm64-v8a': 2, 'x86': 3, 'x86_64': 4\]/);
    assert.match(patched, /def liftsAbiDigit = liftsAbi != null \? liftsAbiDigits\[liftsAbi\] : 0/);
  });

  it('restricts packaged native libraries to the requested ABI', () => {
    const defaultConfig = patched.slice(patched.indexOf('defaultConfig {'), patched.indexOf('signingConfigs {'));
    assert.match(defaultConfig, /if \(liftsAbi != null\) \{\n\s+ndk \{ abiFilters liftsAbi \}\n\s+\}/);
  });

  it('rejects unknown ABIs instead of building a mislabeled APK', () => {
    assert.match(patched, /throw new GradleException\("liftsAbi must be one of/);
  });

  it('defines the ABI settings before the android block and is idempotent', () => {
    assert.ok(patched.indexOf('def liftsAbi =') < patched.indexOf('\nandroid {'));
    assert.equal(applyAbiBuilds(patched), patched);
  });

  it('composes with release signing', () => {
    const both = applyAbiBuilds(applyReleaseSigning(template));
    assert.match(both, /lifts-release-signing/);
    assert.match(both, /versionCode 1 \* 10 \+ liftsAbiDigit/);
  });

  it('fails loudly when the Expo template no longer matches', () => {
    assert.throws(() => applyAbiBuilds(template.replace(/versionCode 1\n/, 'versionCode = 1\n')), /no longer matches/);
  });
});

describe('applyUniformNdk', () => {
  // Unmodified android/build.gradle from `expo prebuild --platform android` on Expo SDK 57.
  const rootTemplate = readFileSync(join(__dirname, '../fixtures/expo-57-root.build.gradle'), 'utf8');

  it("sets every Android library module's NDK to React Native's", () => {
    const patched = applyUniformNdk(rootTemplate);
    assert.match(
      patched,
      /subprojects \{\n  plugins\.withId\('com\.android\.library'\) \{\n    android\.ndkVersion = rootProject\.ext\.ndkVersion\n  \}\n\}\n$/
    );
    assert.ok(patched.startsWith(rootTemplate.trimEnd()));
  });

  it('is idempotent', () => {
    const once = applyUniformNdk(rootTemplate);
    assert.equal(applyUniformNdk(once), once);
  });

  it('fails loudly when the Expo template no longer matches', () => {
    assert.throws(() => applyUniformNdk('buildscript {}\n'), /no longer matches the expected Expo template/);
  });
});

describe('applyReproducibleDevServerIp', () => {
  const patched = applyReproducibleDevServerIp(applyReleaseSigning(template));

  it("pins the dev server IP for release builds instead of the build host's address", () => {
    assert.match(releaseBuildType(patched), /resValue "string", "react_native_dev_server_ip", "localhost"\n/);
  });

  it('leaves debug builds on the detected IP so they still reach Metro', () => {
    const debugBuildType = patched.slice(patched.indexOf('buildTypes {'), patched.indexOf('\n        release {', patched.indexOf('buildTypes {')));
    assert.doesNotMatch(debugBuildType, /react_native_dev_server_ip/);
  });

  it('keeps release signing intact and is idempotent', () => {
    assert.match(releaseBuildType(patched), /signingConfig signingConfigs\.findByName\('release'\) \?: signingConfigs\.debug/);
    assert.equal(applyReproducibleDevServerIp(patched), patched);
  });

  it('fails loudly when the Expo template no longer matches', () => {
    assert.throws(() => applyReproducibleDevServerIp('android {}'), /no longer matches the expected Expo template/);
  });
});

describe('app.json permissions', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '../../app.json'), 'utf8')) as {
    expo: { android: { permissions?: string[]; blockedPermissions?: string[] } };
  };

  it('blocks the permissions the Expo template adds that Lifts does not use', () => {
    const blocked = app.expo.android.blockedPermissions ?? [];
    for (const permission of [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ]) {
      assert.ok(blocked.includes(permission), permission);
    }
  });

  it('never blocks a permission Lifts requests', () => {
    const blocked = app.expo.android.blockedPermissions ?? [];
    for (const permission of app.expo.android.permissions ?? []) {
      assert.ok(!blocked.includes(permission), permission);
    }
  });
});
