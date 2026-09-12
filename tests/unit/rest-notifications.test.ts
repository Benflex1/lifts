import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  initRestNotifications,
  scheduleRestNotification,
  cancelRestNotification,
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
});
