import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseGymTrackingEnabled, parseHealthSyncEnabled } from '../../src/utils/settings';

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
    assert.equal(parseHealthSyncEnabled('TRUE'), false);
    assert.equal(parseHealthSyncEnabled('unexpected'), false);
  });
});
