import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  getPausedWorkoutCountLabel,
  getPausedWorkoutModalSubtitle,
  PAUSED_WORKOUT_DIALOG_MESSAGE,
  PAUSED_WORKOUT_DIALOG_TITLE,
  PAUSED_WORKOUT_MODAL_TITLE,
  PAUSED_WORKOUT_CONFIRM_LABEL,
} from '../../src/workout/session-copy';

describe('paused workout copy', () => {
  it('uses paused-workout language for one or multiple saved sessions', () => {
    assert.equal(getPausedWorkoutCountLabel(1), 'Paused Workout');
    assert.equal(getPausedWorkoutCountLabel(2), 'Paused Workouts (2)');
    assert.equal(getPausedWorkoutModalSubtitle(1), 'You have 1 saved paused workout.');
    assert.equal(getPausedWorkoutModalSubtitle(3), 'You have 3 saved paused workouts.');
  });

  it('explains that the saved session can be continued', () => {
    assert.equal(PAUSED_WORKOUT_DIALOG_TITLE, 'Paused Workout Found');
    assert.equal(
      PAUSED_WORKOUT_DIALOG_MESSAGE,
      'You have a paused workout saved. Would you like to continue it?'
    );
    assert.equal(PAUSED_WORKOUT_CONFIRM_LABEL, 'Continue Saved');
    assert.equal(PAUSED_WORKOUT_MODAL_TITLE, 'Paused Workouts');
  });
});
