import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { canDismissExerciseScopeModal, canDismissGymPicker } from '../../src/utils/gym-picker';

describe('gym picker dismissal', () => {
  it('blocks dismissal while an async gym selection is in flight', () => {
    assert.equal(canDismissGymPicker(null), true);
    assert.equal(canDismissGymPicker('gym-other'), false);
  });

  it('blocks exercise scope dismissal while saving', () => {
    assert.equal(canDismissExerciseScopeModal(false), true);
    assert.equal(canDismissExerciseScopeModal(true), false);
  });
});
