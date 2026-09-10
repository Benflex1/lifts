import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseGymTrackingEnabled } from '../../src/utils/settings';

describe('gym tracking setting', () => {
  it('defaults to enabled and only disables for the persisted false value', () => {
    assert.equal(parseGymTrackingEnabled(null), true);
    assert.equal(parseGymTrackingEnabled('true'), true);
    assert.equal(parseGymTrackingEnabled('false'), false);
    assert.equal(parseGymTrackingEnabled('unexpected'), true);
  });
});
