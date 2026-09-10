import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { canDismissGymPicker } from '../../src/utils/gym-picker';

describe('gym picker dismissal', () => {
  it('blocks dismissal while an async gym selection is in flight', () => {
    assert.equal(canDismissGymPicker(null), true);
    assert.equal(canDismissGymPicker('gym-other'), false);
  });
});
