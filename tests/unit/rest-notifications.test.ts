import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  initRestNotifications,
  scheduleRestNotification,
  cancelRestNotification,
  isExpoGoAndroid,
} from '../../src/utils/restNotifications';

describe('restNotifications', () => {
  it('initializes safely without throwing in node test environment', async () => {
    await assert.doesNotReject(async () => {
      await initRestNotifications();
    });
  });

  it('cancels safely without throwing when no notification is active', async () => {
    await assert.doesNotReject(async () => {
      await cancelRestNotification();
    });
  });

  it('returns null when scheduling a notification in test environment or past time', async () => {
    const pastTimestamp = Date.now() - 5000;
    const res = await scheduleRestNotification(pastTimestamp, 'Bench Press');
    assert.equal(res, null);
  });

  it('detects isExpoGoAndroid as false in standard Node/test environments', () => {
    assert.equal(isExpoGoAndroid(), false);
  });

  it('does not reject when scheduling with future timestamp in non-native environment', async () => {
    const futureTimestamp = Date.now() + 60000;
    const res = await scheduleRestNotification(futureTimestamp, 'Squat');
    assert.equal(res, null);
  });
});

