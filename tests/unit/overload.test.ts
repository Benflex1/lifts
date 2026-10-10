import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { SetType } from '../../src/types';
import {
  getOverloadIncrement,
  isOverloadFillTarget,
  parseProgressiveOverloadEnabled,
  parseRepGoal,
  suggestNextTarget,
} from '../../src/workout/overload';

const ghost = (weightKg: number, reps: number, type: SetType = 'normal', rpe?: number) => ({
  previousType: type,
  previousWeightKg: weightKg,
  previousReps: reps,
  ...(rpe !== undefined ? { previousRpe: rpe } : {}),
});

describe('progressive overload suggestions', () => {
  it('adds weight and drops to the bottom of the range once every set hits the top', () => {
    const suggestion = suggestNextTarget({
      sets: [ghost(60, 12), ghost(60, 12), ghost(60, 12)],
      targetReps: '8-12',
      trackingType: 'weight_reps',
      equipment: 'barbell',
      unit: 'kg',
    });
    assert.deepEqual(
      { kind: suggestion?.kind, weightKg: suggestion?.weightKg, reps: suggestion?.reps },
      { kind: 'add_weight', weightKg: 62.5, reps: 8 },
    );
    assert.match(suggestion!.reason, /Every set hit 12 reps at 60 kg/);
  });

  it('keeps the weight and adds a rep while inside the range', () => {
    const suggestion = suggestNextTarget({
      sets: [ghost(60, 12), ghost(60, 10), ghost(60, 9)],
      targetReps: '8-12',
      trackingType: 'weight_reps',
      unit: 'kg',
    });
    assert.equal(suggestion?.kind, 'add_reps');
    assert.equal(suggestion?.weightKg, 60);
    assert.equal(suggestion?.reps, 10);
    assert.match(suggestion!.reason, /12, 10, 9 reps at 60 kg/);
  });

  it('repeats a fixed target until every set reaches it', () => {
    const suggestion = suggestNextTarget({
      sets: [ghost(100, 5), ghost(100, 4), ghost(100, 4)],
      targetReps: '5',
      trackingType: 'weight_reps',
      unit: 'kg',
    });
    assert.equal(suggestion?.kind, 'repeat');
    assert.equal(suggestion?.weightKg, 100);
    assert.equal(suggestion?.reps, 5);
  });

  it('uses last session first top set as the goal without a routine target', () => {
    const hit = suggestNextTarget({
      sets: [ghost(80, 8), ghost(80, 8)],
      trackingType: 'weight_reps',
      equipment: 'dumbbell',
      unit: 'kg',
    });
    assert.equal(hit?.kind, 'add_weight');
    assert.equal(hit?.weightKg, 82);
    assert.equal(hit?.reps, 8);

    const missed = suggestNextTarget({ sets: [ghost(80, 8), ghost(80, 6)], trackingType: 'weight_reps', unit: 'kg' });
    assert.equal(missed?.kind, 'repeat');
    assert.equal(missed?.reps, 8);
  });

  it('ignores warmups and drop sets and only judges sets at the top weight', () => {
    const suggestion = suggestNextTarget({
      sets: [
        ghost(20, 10, 'warmup'),
        ghost(40, 5, 'warmup'),
        ghost(60, 12),
        ghost(55, 6),
        ghost(40, 15, 'drop'),
      ],
      targetReps: '8-12',
      trackingType: 'weight_reps',
      unit: 'kg',
    });
    assert.equal(suggestion?.kind, 'add_weight');
    assert.equal(suggestion?.weightKg, 62.5);
  });

  it('counts failure sets as working sets', () => {
    const suggestion = suggestNextTarget({
      sets: [ghost(60, 12), ghost(60, 9, 'failure')],
      targetReps: '8-12',
      trackingType: 'weight_reps',
      unit: 'kg',
    });
    assert.equal(suggestion?.kind, 'add_reps');
    assert.equal(suggestion?.reps, 10);
  });

  it('holds the weight when a top set was logged at RPE 9.5 or harder', () => {
    const suggestion = suggestNextTarget({
      sets: [ghost(60, 12, 'normal', 8), ghost(60, 12, 'normal', 10)],
      targetReps: '8-12',
      trackingType: 'weight_reps',
      unit: 'kg',
    });
    assert.equal(suggestion?.kind, 'repeat');
    assert.equal(suggestion?.weightKg, 60);
    assert.equal(suggestion?.reps, 12);
    assert.match(suggestion!.reason, /RPE 10/);
  });

  it('steps in pounds for lb users and stores the result in kg', () => {
    const suggestion = suggestNextTarget({
      sets: [ghost(61.23, 5)],
      targetReps: '5',
      trackingType: 'weight_reps',
      unit: 'lb',
    });
    assert.equal(suggestion?.kind, 'add_weight');
    // 61.23 kg is 135 lb; 140 lb is 63.5 kg.
    assert.equal(suggestion?.weightKg, 63.5);
    assert.match(suggestion!.reason, /135 lb/);
  });

  it('suggests added load for weighted bodyweight sets', () => {
    const suggestion = suggestNextTarget({
      sets: [ghost(10, 8)],
      targetReps: '6-8',
      trackingType: 'weighted_bodyweight',
      unit: 'kg',
    });
    assert.equal(suggestion?.weightKg, 12.5);
    assert.equal(suggestion?.reps, 6);
  });

  it('gives nothing without history, for unloaded sets, lists, AMRAP or other tracking types', () => {
    assert.equal(suggestNextTarget({ sets: [], trackingType: 'weight_reps', unit: 'kg' }), null);
    assert.equal(
      suggestNextTarget({ sets: [{ previousWeightKg: 60, previousReps: 10 }], trackingType: 'weight_reps', unit: 'kg' }),
      null,
      'sets from before set types were carried have no suggestion',
    );
    assert.equal(suggestNextTarget({ sets: [ghost(0, 10)], trackingType: 'weight_reps', unit: 'kg' }), null);
    assert.equal(suggestNextTarget({ sets: [ghost(60, 10)], targetReps: '12, 10, 8', trackingType: 'weight_reps', unit: 'kg' }), null);
    assert.equal(suggestNextTarget({ sets: [ghost(60, 10)], targetReps: 'AMRAP', trackingType: 'weight_reps', unit: 'kg' }), null);
    assert.equal(suggestNextTarget({ sets: [ghost(20, 10)], trackingType: 'assisted_bodyweight', unit: 'kg' }), null);
    assert.equal(suggestNextTarget({ sets: [ghost(0, 10)], trackingType: 'duration', unit: 'kg' }), null);
  });
});

describe('overload helpers', () => {
  it('picks the smallest usual step per equipment', () => {
    assert.equal(getOverloadIncrement('barbell', 'kg'), 2.5);
    assert.equal(getOverloadIncrement('dumbbell', 'kg'), 2);
    assert.equal(getOverloadIncrement('kettlebells', 'kg'), 4);
    assert.equal(getOverloadIncrement('machine', 'kg'), 2.5);
    assert.equal(getOverloadIncrement('dumbbell', 'lb'), 5);
    assert.equal(getOverloadIncrement(undefined, 'kg'), 2.5);
  });

  it('parses numbers and ranges as rep goals', () => {
    assert.deepEqual(parseRepGoal('5'), { min: 5, max: 5 });
    assert.deepEqual(parseRepGoal(' 8 - 12 '), { min: 8, max: 12 });
    assert.equal(parseRepGoal(''), undefined);
    assert.equal(parseRepGoal(undefined), undefined);
    assert.equal(parseRepGoal('12, 10'), null);
    assert.equal(parseRepGoal('amrap'), null);
    assert.equal(parseRepGoal('12-8'), null);
  });

  it('fills only working sets still to do', () => {
    assert.equal(isOverloadFillTarget({ isCompleted: false, type: 'normal' }), true);
    assert.equal(isOverloadFillTarget({ isCompleted: false, type: 'failure' }), true);
    assert.equal(isOverloadFillTarget({ isCompleted: true, type: 'normal' }), false);
    assert.equal(isOverloadFillTarget({ isCompleted: false, type: 'warmup' }), false);
    assert.equal(isOverloadFillTarget({ isCompleted: false, type: 'drop' }), false);
  });

  it('is on unless turned off', () => {
    assert.equal(parseProgressiveOverloadEnabled(null), true);
    assert.equal(parseProgressiveOverloadEnabled('true'), true);
    assert.equal(parseProgressiveOverloadEnabled('false'), false);
  });
});

describe('last session set type and RPE reach the active workout', () => {
  it('carries type and RPE from history into suggestions and sets', async () => {
    const { resolvePreviousSetsForExercise } = await import('../../src/workout/gym-history');
    const { createWorkoutSetsFromSuggestions } = await import('../../src/workout/gym-session');
    const exercise = { id: 'bench', name: 'Bench', category: 'strength', equipment: 'barbell', primaryMuscles: ['chest'] };
    const suggestions = resolvePreviousSetsForExercise(exercise, [{
      workoutId: 'w1',
      startTime: '2026-10-01T10:00:00.000Z',
      gymId: 'gym-default',
      gymName: 'Default Gym',
      occurrenceIndex: 0,
      sets: [
        { weightKg: 40, reps: 8, type: 'warmup' },
        { weightKg: 60, reps: 12, type: 'normal', rpe: 8 },
      ],
    }], 'gym-default');
    assert.equal(suggestions[0].type, 'warmup');
    assert.equal(suggestions[1].rpe, 8);

    const sets = createWorkoutSetsFromSuggestions({ activeExerciseId: 'ae', targetSets: 3, suggestions, currentGymId: 'gym-default' });
    assert.deepEqual(sets.map((set) => set.previousType), ['warmup', 'normal', 'normal']);
    assert.deepEqual(sets.map((set) => set.previousRpe), [undefined, 8, 8]);
    assert.equal('previousDurationSeconds' in sets[0], false);

    const suggestion = suggestNextTarget({ sets, targetReps: '8-12', trackingType: 'weight_reps', equipment: 'barbell', unit: 'kg' });
    assert.equal(suggestion?.weightKg, 62.5);
  });

  it('accepts drafts with the new fields and rejects bad values', async () => {
    const { validateWorkoutSetRecord } = await import('../../src/database/snapshot-validation');
    const base = { id: 's1', setNumber: 1, type: 'normal', weightKg: 0, reps: 0, isCompleted: false };
    validateWorkoutSetRecord({ ...base, previousType: 'failure', previousRpe: 9 }, 'set');
    validateWorkoutSetRecord(base, 'set');
    assert.throws(() => validateWorkoutSetRecord({ ...base, previousType: 'heavy' }, 'set'));
    assert.throws(() => validateWorkoutSetRecord({ ...base, previousRpe: 'hard' }, 'set'));
  });
});
