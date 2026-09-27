import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { toVersionCode, applyReleaseSigning } = require('../../plugins/withAndroidRelease') as {
  toVersionCode: (version: unknown) => number;
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
