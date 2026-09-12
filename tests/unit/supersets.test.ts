import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  getSupersetMetadata,
  resolveNextSupersetTarget,
  SUPERSET_PALETTE,
} from '../../src/workout/supersets';
import { Workout, ActiveExercise } from '../../src/types';

describe('Supersets and Giant Sets Engine', () => {
  it('ignores singleton exercises with supersetId (requires at least 2)', () => {
    const exercises = [
      { id: 'ex-1', supersetId: 'ss-solo' },
      { id: 'ex-2' },
    ];
    const meta = getSupersetMetadata(exercises);
    assert.equal(meta.size, 0);
  });

  it('correctly labels 2-exercise groups as SUPERSET A and assigns metadata', () => {
    const exercises = [
      { id: 'ex-bench', supersetId: 'ss-chest-back' },
      { id: 'ex-row', supersetId: 'ss-chest-back' },
      { id: 'ex-curls' },
    ];

    const meta = getSupersetMetadata(exercises);
    assert.equal(meta.size, 2);

    const bench = meta.get('ex-bench')!;
    assert.ok(bench);
    assert.equal(bench.label, 'SUPERSET A');
    assert.equal(bench.type, 'superset');
    assert.equal(bench.isFirst, true);
    assert.equal(bench.isLast, false);
    assert.equal(bench.positionInGroup, 1);
    assert.equal(bench.totalInGroup, 2);
    assert.equal(bench.color, SUPERSET_PALETTE[0]);

    const row = meta.get('ex-row')!;
    assert.ok(row);
    assert.equal(row.label, 'SUPERSET A');
    assert.equal(row.type, 'superset');
    assert.equal(row.isFirst, false);
    assert.equal(row.isLast, true);
    assert.equal(row.positionInGroup, 2);
    assert.equal(row.totalInGroup, 2);
  });

  it('correctly labels 3-exercise groups as GIANT SET and handles multiple groups', () => {
    const exercises = [
      { id: 'ex-1', supersetId: 'ss-1' },
      { id: 'ex-2', supersetId: 'ss-1' },
      { id: 'ex-3', supersetId: 'ss-1' },
      { id: 'ex-4' },
      { id: 'ex-5', supersetId: 'ss-2' },
      { id: 'ex-6', supersetId: 'ss-2' },
    ];

    const meta = getSupersetMetadata(exercises);
    assert.equal(meta.size, 5);

    // Group 1: Giant Set A
    assert.equal(meta.get('ex-1')!.label, 'GIANT SET A');
    assert.equal(meta.get('ex-1')!.type, 'giant_set');
    assert.equal(meta.get('ex-2')!.positionInGroup, 2);
    assert.equal(meta.get('ex-3')!.isLast, true);

    // Group 2: Superset B
    assert.equal(meta.get('ex-5')!.label, 'SUPERSET B');
    assert.equal(meta.get('ex-5')!.type, 'superset');
    assert.equal(meta.get('ex-5')!.color, SUPERSET_PALETTE[1]);
  });

  it('alternating set flow resolves next exercise in superset round', () => {
    const workout: Workout = {
      id: 'w-1',
      name: 'Superset Workout',
      gymId: 'gym-default',
      startTime: '2026-09-12T10:00:00.000Z',
      durationSeconds: 1200,
      totalVolumeKg: 500,
      exercises: [
        {
          id: 'ae-bench',
          exerciseId: 'ex-bench',
          supersetId: 'ss-1',
          exercise: { id: 'ex-bench', name: 'Barbell Bench Press', category: 'Chest', equipment: 'Barbell', primaryMuscles: ['Chest'] },
          restTimerSeconds: 90,
          sets: [
            { id: 's-bench-1', setNumber: 1, type: 'normal', weightKg: 80, reps: 8, isCompleted: true },
            { id: 's-bench-2', setNumber: 2, type: 'normal', weightKg: 80, reps: 8, isCompleted: false },
          ],
        },
        {
          id: 'ae-row',
          exerciseId: 'ex-row',
          supersetId: 'ss-1',
          exercise: { id: 'ex-row', name: 'Barbell Row', category: 'Back', equipment: 'Barbell', primaryMuscles: ['Back'] },
          restTimerSeconds: 90,
          sets: [
            { id: 's-row-1', setNumber: 1, type: 'normal', weightKg: 70, reps: 8, isCompleted: false },
            { id: 's-row-2', setNumber: 2, type: 'normal', weightKg: 70, reps: 8, isCompleted: false },
          ],
        },
      ],
    };

    // When bench Set 1 completes -> next target is row Set 1 (isRoundComplete: false)
    const target1 = resolveNextSupersetTarget(workout, 'ae-bench', 's-bench-1');
    assert.ok(target1);
    assert.equal(target1.nextExerciseId, 'ae-row');
    assert.equal(target1.nextExerciseName, 'Barbell Row');
    assert.equal(target1.nextSetId, 's-row-1');
    assert.equal(target1.isRoundComplete, false);

    // When row Set 1 completes -> round 1 is complete! Next is bench Set 2
    workout.exercises[1].sets[0].isCompleted = true;
    const target2 = resolveNextSupersetTarget(workout, 'ae-row', 's-row-1');
    assert.ok(target2);
    assert.equal(target2.isRoundComplete, true);
    assert.equal(target2.nextExerciseId, 'ae-bench');
    assert.equal(target2.nextSetId, 's-bench-2');
  });

  it('returns null for exercises without superset', () => {
    const workout: Workout = {
      id: 'w-2',
      name: 'Regular Workout',
      gymId: 'gym-default',
      startTime: '2026-09-12T10:00:00.000Z',
      durationSeconds: 600,
      totalVolumeKg: 100,
      exercises: [
        {
          id: 'ae-squat',
          exerciseId: 'ex-squat',
          exercise: { id: 'ex-squat', name: 'Squat', category: 'Legs', equipment: 'Barbell', primaryMuscles: ['Quads'] },
          restTimerSeconds: 120,
          sets: [{ id: 's-1', setNumber: 1, type: 'normal', weightKg: 100, reps: 5, isCompleted: true }],
        },
      ],
    };

    const target = resolveNextSupersetTarget(workout, 'ae-squat', 's-1');
    assert.equal(target, null);
  });
});
