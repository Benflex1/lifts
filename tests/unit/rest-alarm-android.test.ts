import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createAndroidRestNotifications } from '../../src/utils/restNotificationsAndroid';
import type { RestAlarmNativeModule } from '../../modules/rest-alarm/RestAlarm.types';

const NOW = 1_700_000_000_000;

function fakeNative(overrides: Partial<RestAlarmNativeModule> = {}) {
  const calls: string[] = [];
  const scheduled: Array<{
    triggerAtMs: number;
    title: string;
    body: string;
    countdownTitle: string;
    countdownBody: string;
  }> = [];
  const native: RestAlarmNativeModule = {
    areNotificationsEnabled: () => {
      calls.push('areNotificationsEnabled');
      return false;
    },
    requestNotificationPermission: async () => {
      calls.push('requestNotificationPermission');
      return true;
    },
    canScheduleExactAlarms: () => true,
    openExactAlarmSettings: () => {
      calls.push('openExactAlarmSettings');
      return true;
    },
    schedule: async (triggerAtMs, title, body, countdownTitle, countdownBody) => {
      calls.push('schedule');
      scheduled.push({ triggerAtMs, title, body, countdownTitle, countdownBody });
      return true;
    },
    cancel: async () => {
      calls.push('cancel');
    },
    ...overrides,
  };
  return { native, calls, scheduled };
}

describe('Android rest notifications', () => {
  it('cancels the previous alarm, then schedules the new one with the exercise name', async () => {
    const { native, calls, scheduled } = fakeNative();
    const notifications = createAndroidRestNotifications(native, () => NOW);

    const id = await notifications.scheduleRestNotification(NOW + 90_000, 'Bench Press');

    assert.equal(id, 'rest-alarm');
    assert.deepEqual(calls.slice(-2), ['cancel', 'schedule']);
    assert.deepEqual(scheduled, [
      {
        triggerAtMs: NOW + 90_000,
        title: 'Rest Finished!',
        body: 'Time for your next set of Bench Press.',
        countdownTitle: 'Resting',
        countdownBody: 'Up next: Bench Press',
      },
    ]);
  });

  it('passes a countdown that names the next set when no exercise is known', async () => {
    const { native, scheduled } = fakeNative();
    await createAndroidRestNotifications(native, () => NOW).scheduleRestNotification(NOW + 60_000);

    assert.equal(scheduled[0].countdownTitle, 'Resting');
    assert.equal(scheduled[0].countdownBody, 'Up next: your next set');
  });

  it('only cancels when the rest ends within a second', async () => {
    const { native, calls, scheduled } = fakeNative();
    const notifications = createAndroidRestNotifications(native, () => NOW);

    assert.equal(await notifications.scheduleRestNotification(NOW + 1_000), null);
    assert.equal(await notifications.scheduleRestNotification(NOW - 5_000), null);
    assert.equal(scheduled.length, 0);
    assert.ok(calls.includes('cancel'));
  });

  it('asks for notification permission once, and only when notifications are off', async () => {
    const off = fakeNative();
    const notifications = createAndroidRestNotifications(off.native, () => NOW);
    await notifications.initRestNotifications();
    await notifications.scheduleRestNotification(NOW + 60_000);
    assert.equal(off.calls.filter((c) => c === 'requestNotificationPermission').length, 1);

    const on = fakeNative({ areNotificationsEnabled: () => true });
    await createAndroidRestNotifications(on.native, () => NOW).initRestNotifications();
    assert.equal(on.calls.includes('requestNotificationPermission'), false);
  });

  it('never rejects when the native module throws', async () => {
    const failing = fakeNative({
      areNotificationsEnabled: () => {
        throw new Error('boom');
      },
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
