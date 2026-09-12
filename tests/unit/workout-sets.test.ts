import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  initialReps,
  RPE_CHIPS,
  resolveHistoricalTargetReps,
  resolveRestTimerSeconds,
  validateCompletedSet,
  validateTargetReps,
  sanitizeWeightInput,
  sanitizeRepsInput,
} from '../../src/workout/sets';
import { WorkoutSet } from '../../src/types';
import {
  resolveInitialAccordionState,
  applyPreviousSetStats,
  resolveAddedSetGhostStats,
  createWorkoutSetsFromSuggestions,
} from '../../src/workout/gym-session';

describe('initialReps', () => {
  it('parses single fixed numeric target', () => {
    assert.equal(initialReps('5', 0), 5);
    assert.equal(initialReps('12', 2), 12);
  });

  it('parses range target and takes lower bound over previous reps', () => {
    assert.equal(initialReps('6-8', 0, 12), 6);
    assert.equal(initialReps('8-12', 1, 15), 8);
    assert.equal(initialReps('10-12', 0), 10);
  });

  it('parses comma-separated per-set targets', () => {
    assert.equal(initialReps('10, 8, 6', 0), 10);
    assert.equal(initialReps('10, 8, 6', 1), 8);
    assert.equal(initialReps('10, 8, 6', 2), 6);
  });

  it('repeats the final target for extra sets beyond per-set list', () => {
    assert.equal(initialReps('10, 8, 6', 3), 6);
    assert.equal(initialReps('10, 8, 6', 4), 6);
  });

  it('handles AMRAP using previous reps or default 10', () => {
    assert.equal(initialReps('AMRAP', 0, 12), 12);
    assert.equal(initialReps('amrap', 1), 10);
  });

  it('handles unsupported free-form target falling back to previous reps or 10', () => {
    assert.equal(initialReps('to failure', 0, 8), 8);
    assert.equal(initialReps('drop set', 0), 10);
    assert.equal(initialReps('', 0, 15), 15);
    assert.equal(initialReps('', 0), 10);
  });
});

describe('workout defaults', () => {
  it('preserves an explicit rest timer value of zero as off', () => {
    assert.equal(resolveRestTimerSeconds(0), 0);
    assert.equal(resolveRestTimerSeconds(undefined), 0);
    assert.equal(resolveRestTimerSeconds(null), 0);
    assert.equal(resolveRestTimerSeconds(90), 90);
  });

  it('prefers the exercise target when reconstructing a historical workout', () => {
    assert.equal(resolveHistoricalTargetReps('8-12', undefined), '8-12');
    assert.equal(resolveHistoricalTargetReps(undefined, '6-8'), '6-8');
    assert.equal(resolveHistoricalTargetReps('', '6-8'), '6-8');
    assert.equal(resolveHistoricalTargetReps(undefined, undefined), '10');
  });

  it('offers the documented RPE range from 5 through 10 with null (None) first', () => {
    assert.deepEqual(RPE_CHIPS, [null, 5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]);
    assert.equal(RPE_CHIPS[0], null);
  });
});

describe('applyPreviousSetStats', () => {
  it('copies previous weight and reps into current set and marks weight edited', () => {
    const set: WorkoutSet = {
      id: 's-1',
      setNumber: 1,
      type: 'normal',
      weightKg: 0,
      reps: 0,
      isCompleted: false,
      isWeightEdited: false,
      previousWeightKg: 85,
      previousReps: 8,
    };
    const result = applyPreviousSetStats(set, 10);
    assert.equal(result.weightKg, 85);
    assert.equal(result.reps, 8);
    assert.equal(result.isWeightEdited, true);
    assert.equal(result.isCompleted, false);
  });

  it('leaves completed sets untouched', () => {
    const set: WorkoutSet = {
      id: 's-2',
      setNumber: 2,
      type: 'normal',
      weightKg: 60,
      reps: 10,
      isCompleted: true,
      isWeightEdited: true,
      previousWeightKg: 90,
      previousReps: 5,
    };
    const result = applyPreviousSetStats(set, 10);
    assert.equal(result.weightKg, 60);
    assert.equal(result.reps, 10);
  });

  it('handles 0 kg previous weight for bodyweight movements', () => {
    const set: WorkoutSet = {
      id: 's-3',
      setNumber: 1,
      type: 'normal',
      weightKg: 0,
      reps: 0,
      isCompleted: false,
      isWeightEdited: false,
      previousWeightKg: 0,
      previousReps: 15,
    };
    const result = applyPreviousSetStats(set, 10);
    assert.equal(result.weightKg, 0);
    assert.equal(result.reps, 15);
    assert.equal(result.isWeightEdited, true);
  });

  it('uses fallback reps when previous reps are absent', () => {
    const set: WorkoutSet = {
      id: 's-4',
      setNumber: 1,
      type: 'normal',
      weightKg: 0,
      reps: 0,
      isCompleted: false,
      isWeightEdited: false,
      previousWeightKg: 50,
      previousReps: undefined,
    };
    const result = applyPreviousSetStats(set, 12);
    assert.equal(result.weightKg, 50);
    assert.equal(result.reps, 12);
    assert.equal(result.isWeightEdited, true);
  });
});

describe('resolveInitialAccordionState', () => {
  it('expands first exercise if incomplete and collapses subsequent exercises', () => {
    const exercises = [
      { id: 'ex-1', sets: [{ isCompleted: false }, { isCompleted: false }] },
      { id: 'ex-2', sets: [{ isCompleted: false }] },
    ];
    const state = resolveInitialAccordionState(exercises);
    assert.deepEqual(state, {
      'ex-1': true,
      'ex-2': false,
    });
  });

  it('skips completed exercises and expands the first incomplete exercise', () => {
    const exercises = [
      { id: 'ex-1', sets: [{ isCompleted: true }, { isCompleted: true }] },
      { id: 'ex-2', sets: [{ isCompleted: false }, { isCompleted: false }] },
      { id: 'ex-3', sets: [{ isCompleted: false }] },
    ];
    const state = resolveInitialAccordionState(exercises);
    assert.deepEqual(state, {
      'ex-1': false,
      'ex-2': true,
      'ex-3': false,
    });
  });

  it('keeps all exercises collapsed if all are completed without randomly popping open', () => {
    const exercises = [
      { id: 'ex-1', sets: [{ isCompleted: true }, { isCompleted: true }] },
      { id: 'ex-2', sets: [{ isCompleted: true }] },
    ];
    const state = resolveInitialAccordionState(exercises);
    assert.deepEqual(state, {
      'ex-1': false,
      'ex-2': false,
    });
  });

  it('handles empty exercise list', () => {
    const state = resolveInitialAccordionState([]);
    assert.deepEqual(state, {});
  });
});

describe('validateCompletedSet', () => {
  it('accepts 0 kg as valid weight', () => {
    const set: WorkoutSet = {
      id: 's-1',
      setNumber: 1,
      type: 'normal',
      weightKg: 0,
      reps: 10,
      isCompleted: true,
    };
    assert.equal(validateCompletedSet(set), null);
  });

  it('accepts fractional weights (e.g. 2.5 kg, 12.25 kg)', () => {
    const set: WorkoutSet = {
      id: 's-2',
      setNumber: 1,
      type: 'normal',
      weightKg: 2.5,
      reps: 8,
      isCompleted: true,
    };
    assert.equal(validateCompletedSet(set), null);
  });

  it('rejects negative weights', () => {
    const set: WorkoutSet = {
      id: 's-3',
      setNumber: 1,
      type: 'normal',
      weightKg: -5,
      reps: 10,
      isCompleted: true,
    };
    assert.notEqual(validateCompletedSet(set), null);
  });

  it('rejects non-finite weights (NaN, Infinity)', () => {
    const setNaN: WorkoutSet = {
      id: 's-4',
      setNumber: 1,
      type: 'normal',
      weightKg: NaN,
      reps: 10,
      isCompleted: true,
    };
    assert.notEqual(validateCompletedSet(setNaN), null);

    const setInf: WorkoutSet = {
      id: 's-5',
      setNumber: 1,
      type: 'normal',
      weightKg: Infinity,
      reps: 10,
      isCompleted: true,
    };
    assert.notEqual(validateCompletedSet(setInf), null);
  });

  it('rejects non-positive reps (0 or negative)', () => {
    const setZero: WorkoutSet = {
      id: 's-6',
      setNumber: 1,
      type: 'normal',
      weightKg: 50,
      reps: 0,
      isCompleted: true,
    };
    assert.notEqual(validateCompletedSet(setZero), null);

    const setNeg: WorkoutSet = {
      id: 's-7',
      setNumber: 1,
      type: 'normal',
      weightKg: 50,
      reps: -2,
      isCompleted: true,
    };
    assert.notEqual(validateCompletedSet(setNeg), null);
  });

  it('rejects fractional reps', () => {
    const setFractional: WorkoutSet = {
      id: 's-8',
      setNumber: 1,
      type: 'normal',
      weightKg: 50,
      reps: 8.5,
      isCompleted: true,
    };
    assert.notEqual(validateCompletedSet(setFractional), null);
  });
});

describe('validateTargetReps', () => {
  it('accepts valid single numeric targets', () => {
    assert.equal(validateTargetReps('10').isValid, true);
    assert.equal(validateTargetReps('5').isValid, true);
    assert.equal(validateTargetReps(' 12 ').isValid, true);
    assert.equal(validateTargetReps('1').isValid, true);
  });

  it('rejects non-positive or excessive single numbers', () => {
    assert.equal(validateTargetReps('0').isValid, false);
    assert.equal(validateTargetReps('-5').isValid, false);
    assert.equal(validateTargetReps('101').isValid, false);
  });

  it('accepts valid rep ranges', () => {
    assert.equal(validateTargetReps('8-12').isValid, true);
    assert.equal(validateTargetReps('6 - 8').isValid, true);
    assert.equal(validateTargetReps('10-10').isValid, true);
  });

  it('rejects invalid rep ranges', () => {
    assert.equal(validateTargetReps('12-8').isValid, false);
    assert.equal(validateTargetReps('0-10').isValid, false);
    assert.equal(validateTargetReps('8-0').isValid, false);
    assert.equal(validateTargetReps('8-').isValid, false);
    assert.equal(validateTargetReps('-12').isValid, false);
    assert.equal(validateTargetReps('8-150').isValid, false);
  });

  it('accepts valid comma-separated lists', () => {
    assert.equal(validateTargetReps('12, 10, 8, 6').isValid, true);
    assert.equal(validateTargetReps('12,10,8').isValid, true);
  });

  it('rejects invalid comma-separated lists', () => {
    assert.equal(validateTargetReps('12, 0, 8').isValid, false);
    assert.equal(validateTargetReps('12, -5, 8').isValid, false);
    assert.equal(validateTargetReps('12, , 8').isValid, false);
    assert.equal(validateTargetReps('12,').isValid, false);
  });

  it('accepts AMRAP case-insensitively', () => {
    assert.equal(validateTargetReps('AMRAP').isValid, true);
    assert.equal(validateTargetReps('amrap').isValid, true);
    assert.equal(validateTargetReps(' Amrap ').isValid, true);
  });

  it('rejects malformed and random text inputs like 7&x-9', () => {
    assert.equal(validateTargetReps('7&x-9').isValid, false);
    assert.equal(validateTargetReps('to failure').isValid, false);
    assert.equal(validateTargetReps('10 reps').isValid, false);
    assert.equal(validateTargetReps('8~12').isValid, false);
    assert.equal(validateTargetReps('').isValid, false);
    assert.equal(validateTargetReps('   ').isValid, false);
    assert.equal(validateTargetReps(undefined).isValid, false);
  });
});

describe('numeric input sanitization', () => {
  it('sanitizes weight inputs by converting comma to dot', () => {
    assert.equal(sanitizeWeightInput('82,5'), '82.5');
    assert.equal(sanitizeWeightInput('100,25'), '100.25');
  });

  it('preserves valid decimal and integer weight inputs', () => {
    assert.equal(sanitizeWeightInput('100'), '100');
    assert.equal(sanitizeWeightInput('77.5'), '77.5');
    assert.equal(sanitizeWeightInput('0.5'), '0.5');
  });

  it('keeps only the first decimal dot and strips subsequent dots', () => {
    assert.equal(sanitizeWeightInput('80.5.2'), '80.52');
    assert.equal(sanitizeWeightInput('1..5'), '1.5');
    assert.equal(sanitizeWeightInput('..5'), '.5');
  });

  it('filters out non-numeric characters from weight input', () => {
    assert.equal(sanitizeWeightInput('100kg'), '100');
    assert.equal(sanitizeWeightInput('abc 82.5 lbs'), '82.5');
    assert.equal(sanitizeWeightInput(''), '');
    assert.equal(sanitizeWeightInput('   '), '');
  });

  it('sanitizes reps inputs to whole numbers only', () => {
    assert.equal(sanitizeRepsInput('12'), '12');
    assert.equal(sanitizeRepsInput('8'), '8');
    assert.equal(sanitizeRepsInput('12.5'), '125');
    assert.equal(sanitizeRepsInput('10 reps'), '10');
    assert.equal(sanitizeRepsInput(''), '');
    assert.equal(sanitizeRepsInput('abc'), '');
  });
});

describe('resolveAddedSetGhostStats', () => {
  it('carries over straight-set progression from completed set', () => {
    const sets: WorkoutSet[] = [
      {
        id: 's-1',
        setNumber: 1,
        type: 'normal',
        weightKg: 80,
        reps: 10,
        isCompleted: true,
        isWeightEdited: true,
      },
    ];
    const ghost = resolveAddedSetGhostStats(sets);
    assert.equal(ghost.previousWeightKg, 80);
    assert.equal(ghost.previousReps, 10);
    assert.equal(ghost.provenanceSet, undefined);
  });

  it('preserves 0 kg bodyweight sets without dropping to undefined', () => {
    const sets: WorkoutSet[] = [
      {
        id: 's-1',
        setNumber: 1,
        type: 'normal',
        weightKg: 0,
        reps: 15,
        isCompleted: true,
        isWeightEdited: true,
      },
    ];
    const ghost = resolveAddedSetGhostStats(sets);
    assert.equal(ghost.previousWeightKg, 0);
    assert.equal(ghost.previousReps, 15);
  });

  it('skips uncompleted empty sets and finds the most recent completed or edited set', () => {
    const sets: WorkoutSet[] = [
      {
        id: 's-1',
        setNumber: 1,
        type: 'normal',
        weightKg: 100,
        reps: 6,
        isCompleted: true,
        isWeightEdited: true,
      },
      {
        id: 's-2',
        setNumber: 2,
        type: 'normal',
        weightKg: 0,
        reps: 0,
        isCompleted: false,
        isWeightEdited: false,
      },
    ];
    const ghost = resolveAddedSetGhostStats(sets);
    assert.equal(ghost.previousWeightKg, 100);
    assert.equal(ghost.previousReps, 6);
  });

  it('falls back to ghost suggestions from past workouts if no set completed yet', () => {
    const sets: WorkoutSet[] = [
      {
        id: 's-1',
        setNumber: 1,
        type: 'normal',
        weightKg: 0,
        reps: 0,
        isCompleted: false,
        isWeightEdited: false,
        previousWeightKg: 65,
        previousReps: 12,
        previousGymId: 'gym-east',
        previousGymName: 'East Gym',
      },
      {
        id: 's-2',
        setNumber: 2,
        type: 'normal',
        weightKg: 0,
        reps: 0,
        isCompleted: false,
        isWeightEdited: false,
        previousWeightKg: 65,
        previousReps: 10,
        previousGymId: 'gym-east',
        previousGymName: 'East Gym',
      },
    ];
    const ghost = resolveAddedSetGhostStats(sets);
    assert.equal(ghost.previousWeightKg, 65);
    assert.equal(ghost.previousReps, 10);
    assert.equal(ghost.provenanceSet?.previousGymId, 'gym-east');
  });

  it('handles empty sets array gracefully', () => {
    const ghost = resolveAddedSetGhostStats([]);
    assert.equal(ghost.previousWeightKg, undefined);
    assert.equal(ghost.previousReps, undefined);
  });
});

describe('createWorkoutSetsFromSuggestions', () => {
  it('creates sets matching suggestion count when history has more sets than targetSets', () => {
    const suggestions = [
      { weightKg: 80, reps: 10 },
      { weightKg: 80, reps: 10 },
      { weightKg: 80, reps: 8 },
      { weightKg: 75, reps: 8 },
    ];
    const sets = createWorkoutSetsFromSuggestions({
      activeExerciseId: 'ex-1',
      targetSets: 3,
      targetReps: '8-10',
      suggestions,
    });
    assert.equal(sets.length, 4);
    assert.equal(sets[0].previousWeightKg, 80);
    assert.equal(sets[3].previousWeightKg, 75);
    assert.equal(sets[3].previousReps, 8);
  });

  it('carries forward the last known suggestion to extra sets', () => {
    const suggestions = [
      { weightKg: 90, reps: 5 },
      { weightKg: 90, reps: 5 },
    ];
    const sets = createWorkoutSetsFromSuggestions({
      activeExerciseId: 'ex-2',
      targetSets: 4,
      targetReps: '5',
      suggestions,
    });
    assert.equal(sets.length, 4);
    assert.equal(sets[0].previousWeightKg, 90);
    assert.equal(sets[1].previousWeightKg, 90);
    assert.equal(sets[2].previousWeightKg, 90, 'Set 3 inherits last known suggestion');
    assert.equal(sets[3].previousWeightKg, 90, 'Set 4 inherits last known suggestion');
  });

  it('clears gym provenance when suggestion gym matches current gym', () => {
    const suggestions = [
      { weightKg: 100, reps: 8, sourceGymId: 'gym-metro', sourceGymName: 'Metro Gym' },
      { weightKg: 100, reps: 8, sourceGymId: 'gym-iron', sourceGymName: 'Iron Gym' },
    ];
    const sets = createWorkoutSetsFromSuggestions({
      activeExerciseId: 'ex-3',
      targetSets: 2,
      suggestions,
      currentGymId: 'gym-metro',
    });
    assert.equal(sets[0].previousGymId, undefined);
    assert.equal(sets[0].previousGymName, undefined);
    assert.equal(sets[1].previousGymId, 'gym-iron');
    assert.equal(sets[1].previousGymName, 'Iron Gym');
  });
});


