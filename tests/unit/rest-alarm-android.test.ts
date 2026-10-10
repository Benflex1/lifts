import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createAndroidRestNotifications } from '../../src/utils/restNotificationsAndroid';
import type { RestAlarmNativeModule } from '../../modules/rest-alarm/RestAlarm.types';

const NOW = 1_700_000_000_000;

function fakeNative(overrides: Partial<RestAlarmNativeModule> = {}) {
  const calls: string[] = [];
  const scheduled: number[] = [];
  const native: RestAlarmNativeModule = {
    canScheduleExactAlarms: () => true,
    openExactAlarmSettings: () => {
      calls.push('openExactAlarmSettings');
      return true;
    },
    schedule: async (endsAtMs) => {
      calls.push('schedule');
      scheduled.push(endsAtMs);
      return true;
    },
    cancel: async () => {
      calls.push('cancel');
    },
    ...overrides,
  };
  return { native, calls, scheduled };
}

describe('Android rest cue', () => {
  it('arms the native cue for the rest end without cancelling first, so a later cancel always wins', async () => {
    const { native, calls, scheduled } = fakeNative();
    const notifications = createAndroidRestNotifications(native, () => NOW);

    const id = await notifications.scheduleRestNotification(NOW + 90_000, 'Bench Press');

    assert.equal(id, 'rest-alarm');
    assert.deepEqual(calls, ['schedule']);
    assert.deepEqual(scheduled, [NOW + 90_000]);
  });

  it('arms short rests too, so the end buzz still plays; skips rests already over', async () => {
    const { native, scheduled } = fakeNative();
    const notifications = createAndroidRestNotifications(native, () => NOW);

    assert.equal(await notifications.scheduleRestNotification(NOW + 1_000), 'rest-alarm');
    assert.equal(await notifications.scheduleRestNotification(NOW), null);
    assert.equal(await notifications.scheduleRestNotification(NOW - 5_000), null);
    assert.deepEqual(scheduled, [NOW + 1_000]);
  });

  it('never asks for notification permission', async () => {
    const { native, calls } = fakeNative();
    const notifications = createAndroidRestNotifications(native, () => NOW);
    await notifications.initRestNotifications();
    await notifications.scheduleRestNotification(NOW + 60_000);
    assert.deepEqual(calls, ['schedule']);
  });

  it('never rejects when the native module throws', async () => {
    const failing = fakeNative({
      schedule: async () => {
        throw new Error('boom');
      },
      cancel: async () => {
        throw new Error('boom');
      },
      canScheduleExactAlarms: () => {
        throw new Error('boom');
      },
    });
    const notifications = createAndroidRestNotifications(failing.native, () => NOW);
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.equal(await notifications.scheduleRestNotification(NOW + 60_000), null);
      await assert.doesNotReject(notifications.cancelRestNotification());
      assert.equal(notifications.getExactAlarmStatus(), 'unsupported');
    } finally {
      console.warn = warn;
    }
  });

  it('is a no-op without the native module (Expo Go)', async () => {
    const notifications = createAndroidRestNotifications(null, () => NOW);
    await assert.doesNotReject(notifications.initRestNotifications());
    assert.equal(await notifications.scheduleRestNotification(NOW + 60_000), null);
    await assert.doesNotReject(notifications.cancelRestNotification());
    assert.equal(notifications.getExactAlarmStatus(), 'unsupported');
    assert.equal(notifications.openExactAlarmSettings(), false);
  });

  it('reports exact-alarm permission and opens its settings page', () => {
    const granted = fakeNative();
    assert.equal(createAndroidRestNotifications(granted.native).getExactAlarmStatus(), 'granted');

    const denied = fakeNative({ canScheduleExactAlarms: () => false });
    const notifications = createAndroidRestNotifications(denied.native);
    assert.equal(notifications.getExactAlarmStatus(), 'denied');
    assert.equal(notifications.openExactAlarmSettings(), true);
    assert.deepEqual(denied.calls, ['openExactAlarmSettings']);
  });
});

describe('Rest alarm native bridge', () => {
  // The Kotlin module cannot be compiled in this repo's test run, so check that its schedule
  // parameters line up with the TypeScript signature the JS side calls.
  const root = join(__dirname, '../..');

  it('takes the same schedule arguments in Kotlin as in the TypeScript interface', () => {
    const kotlin = readFileSync(
      join(root, 'modules/rest-alarm/android/src/main/java/expo/modules/restalarm/RestAlarmModule.kt'),
      'utf8'
    );
    const types = readFileSync(join(root, 'modules/rest-alarm/RestAlarm.types.ts'), 'utf8');

    const kotlinParams = kotlin.match(/AsyncFunction\("schedule"\)\s*\{([^]*?)->/)?.[1] ?? '';
    const tsParams = types.match(/schedule\(([^)]*)\)\s*:\s*Promise/)?.[1] ?? '';
    const names = (params: string) => [...params.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);

    assert.ok(names(kotlinParams).length > 0, 'Kotlin schedule parameters not found');
    assert.deepEqual(names(kotlinParams).slice(1), names(tsParams).slice(1));
    assert.equal(names(kotlinParams).length, names(tsParams).length);
  });
});

describe('Firebase-free Android build', () => {
  const root = join(__dirname, '../..');

  it('excludes expo-notifications from Android autolinking', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.deepEqual(pkg.expo?.autolinking?.android?.exclude, ['expo-notifications']);
  });

  it('imports expo-notifications only from the iOS implementation', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(join(root, 'src'));
    walk(join(root, 'modules'));
    files.push(join(root, 'App.tsx'));

    const importers = files
      .filter((file) => /['"]expo-notifications['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file));
    assert.deepEqual(importers, ['src/utils/restNotifications.ios.ts']);
  });
});
