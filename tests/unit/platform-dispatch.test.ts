import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * ARCH-08: module selection is done by Metro platform extensions, not runtime
 * detection. Node cannot emulate Metro resolution, so these tests pin the two
 * properties that keep the matrix coherent: every variant exposes the same entry
 * points, and base files contain no runtime selection.
 */

const SRC = join(__dirname, '..', '..', 'src');

test('platform variants expose the same entry points (ARCH-08)', async () => {
  const pickBackup = await import('../../src/utils/pickBackup');
  const pickBackupWeb = await import('../../src/utils/pickBackup.web');
  for (const variant of [pickBackup, pickBackupWeb]) {
    assert.equal(typeof variant.pickBackupJson, 'function');
  }
  // pickBackup.native loads expo-document-picker at module scope, which Node cannot import.
  assert.match(
    readFileSync(join(SRC, 'utils/pickBackup.native.ts'), 'utf8'),
    /export async function pickBackupJson/,
  );

  const pickCsv = await import('../../src/utils/importer/pickCsv');
  const pickCsvWeb = await import('../../src/utils/importer/pickCsv.web');
  for (const variant of [pickCsv, pickCsvWeb]) {
    assert.equal(typeof variant.pickCsvFile, 'function');
  }
  // pickCsv.native loads expo-document-picker at module scope, which Node cannot import.
  assert.match(
    readFileSync(join(SRC, 'utils/importer/pickCsv.native.ts'), 'utf8'),
    /export async function pickCsvFile/,
  );

  const health = await import('../../src/health');
  const healthWeb = await import('../../src/health/index.web');
  for (const variant of [health, healthWeb]) {
    for (const name of [
      'getPlatformHealthProvider',
      'syncCompletedWorkout',
      'retryPendingHealthSyncs',
      'enqueueCompletedWorkoutSync',
    ] as const) {
      assert.equal(typeof variant[name], 'function', `health variant is missing ${name}`);
    }
  }

  const rest = await import('../../src/utils/restNotifications');
  const restWeb = await import('../../src/utils/restNotifications.web');
  for (const variant of [rest, restWeb]) {
    for (const name of [
      'initRestNotifications',
      'scheduleRestNotification',
      'cancelRestNotification',
    ] as const) {
      assert.equal(typeof variant[name], 'function', `rest variant is missing ${name}`);
    }
  }

  // The Android and iOS variants load native modules (rest-alarm / expo-notifications)
  // that Node cannot import, so assert their exported entry points from source.
  for (const relativePath of [
    'utils/restNotifications.android.ts',
    'utils/restNotifications.ios.ts',
  ]) {
    const source = readFileSync(join(SRC, relativePath), 'utf8');
    for (const name of [
      'initRestNotifications',
      'scheduleRestNotification',
      'cancelRestNotification',
    ]) {
      assert.ok(source.includes(name), `${relativePath} must expose ${name}`);
    }
  }
});

test('base dispatch modules contain no runtime platform selection (ARCH-08)', () => {
  const bases = [
    'database/db.ts',
    'health/index.ts',
    'utils/pickBackup.ts',
    'utils/saveBackup.ts',
    'utils/importer/pickCsv.ts',
    'utils/restNotifications.ts',
  ];

  for (const relativePath of bases) {
    const source = readFileSync(join(SRC, relativePath), 'utf8');
    assert.ok(
      !/typeof document/.test(source),
      `${relativePath} must not detect the DOM at runtime; use a *.web.ts module`,
    );
    assert.ok(
      !/await import\(['"]\.\/[^'"]+\.web['"]\)/.test(source),
      `${relativePath} must not dynamically select the web variant; Metro resolves it`,
    );
  }

  // restNotifications keeps an Expo Go runtime probe by design (behavior, not
  // module selection); the pure dispatch bases must not branch on Platform.OS.
  for (const relativePath of bases.filter(path => path !== 'utils/restNotifications.ts')) {
    const source = readFileSync(join(SRC, relativePath), 'utf8');
    assert.ok(
      !/Platform\.OS/.test(source),
      `${relativePath} must not branch on Platform.OS to choose an implementation`,
    );
  }
});
