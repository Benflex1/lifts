import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { isDeviceLocalSetting, parseGymTrackingEnabled, parseHealthSyncEnabled, parseRemoteExerciseImagesEnabled } from '../../src/utils/settings';

describe('gym tracking setting', () => {
  it('defaults to enabled and only disables for the persisted false value', () => {
    assert.equal(parseGymTrackingEnabled(null), true);
    assert.equal(parseGymTrackingEnabled('true'), true);
    assert.equal(parseGymTrackingEnabled('false'), false);
    assert.equal(parseGymTrackingEnabled('unexpected'), true);
  });
});

describe('health sync setting', () => {
  it('defaults to disabled and enables only for the exact persisted true value', () => {
    assert.equal(parseHealthSyncEnabled(null), false);
    assert.equal(parseHealthSyncEnabled(''), false);
    assert.equal(parseHealthSyncEnabled('false'), false);
    assert.equal(parseHealthSyncEnabled('true'), true);
    assert.equal(parseHealthSyncEnabled('true', 'web'), false);
    assert.equal(parseHealthSyncEnabled('TRUE'), false);
    assert.equal(parseHealthSyncEnabled('unexpected'), false);
  });
});

describe('remote exercise images setting', () => {
  it('defaults to enabled and only disables for the persisted false value', () => {
    assert.equal(parseRemoteExerciseImagesEnabled(null), true);
    assert.equal(parseRemoteExerciseImagesEnabled('true'), true);
    assert.equal(parseRemoteExerciseImagesEnabled('false'), false);
    assert.equal(parseRemoteExerciseImagesEnabled('unexpected'), true);
  });
});

describe('device-local settings', () => {
  it('keeps per-device health and image-network preferences out of backups and restores', () => {
    assert.equal(isDeviceLocalSetting('health_sync_enabled'), true);
    assert.equal(isDeviceLocalSetting('remote_exercise_images'), true);
    assert.equal(isDeviceLocalSetting('unit'), false);
    assert.equal(isDeviceLocalSetting('gym_tracking_enabled'), false);
  });
});
