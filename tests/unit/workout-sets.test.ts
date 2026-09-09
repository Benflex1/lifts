import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  initialReps,
  RPE_CHIPS,
  resolveHistoricalTargetReps,
  resolveRestTimerSeconds,
  validateCompletedSet,
  validateTargetReps,
} from '../../src/workout/sets';
import { WorkoutSet } from '../../src/types';

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

  it('offers the documented RPE range from 5 through 10', () => {
    assert.deepEqual(RPE_CHIPS, [null, 5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]);
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
