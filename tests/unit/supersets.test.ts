import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  getSupersetMetadata,
  resolveNextSupersetTarget,
  linkExercisesInGroup,
  unlinkExerciseFromGroup,
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

  it('skips superset round navigation when completed set is a warmup', () => {
    const workout: Workout = {
      id: 'w-warmup-test',
      name: 'Superset With Warmups',
      gymId: 'gym-default',
      startTime: '2026-09-12T10:00:00.000Z',
      durationSeconds: 600,
      totalVolumeKg: 100,
      exercises: [
        {
          id: 'ae-bench',
          exerciseId: 'ex-bench',
          supersetId: 'ss-warm',
          exercise: { id: 'ex-bench', name: 'Barbell Bench Press', category: 'Chest', equipment: 'Barbell', primaryMuscles: ['Chest'] },
          restTimerSeconds: 90,
          sets: [
            { id: 's-bench-w1', setNumber: 1, type: 'warmup', weightKg: 20, reps: 10, isCompleted: true },
            { id: 's-bench-w2', setNumber: 2, type: 'warmup', weightKg: 50, reps: 5, isCompleted: false },
            { id: 's-bench-work1', setNumber: 3, type: 'normal', weightKg: 80, reps: 8, isCompleted: false },
          ],
        },
        {
          id: 'ae-row',
          exerciseId: 'ex-row',
          supersetId: 'ss-warm',
          exercise: { id: 'ex-row', name: 'Barbell Row', category: 'Back', equipment: 'Barbell', primaryMuscles: ['Back'] },
          restTimerSeconds: 90,
          sets: [
            { id: 's-row-work1', setNumber: 1, type: 'normal', weightKg: 70, reps: 8, isCompleted: false },
          ],
        },
      ],
    };

    // Completing bench warmup 1 should NOT jump to the other exercise
    const target = resolveNextSupersetTarget(workout, 'ae-bench', 's-bench-w1');
    assert.equal(target, null);
  });

  it('aligns superset rounds by working-set index when exercises have uneven warmup sets', () => {
    const workout: Workout = {
      id: 'w-uneven',
      name: 'Uneven Warmups Workout',
      gymId: 'gym-default',
      startTime: '2026-09-12T10:00:00.000Z',
      durationSeconds: 900,
      totalVolumeKg: 400,
      exercises: [
        {
          id: 'ae-bench',
          exerciseId: 'ex-bench',
          supersetId: 'ss-uneven',
          exercise: { id: 'ex-bench', name: 'Barbell Bench Press', category: 'Chest', equipment: 'Barbell', primaryMuscles: ['Chest'] },
          restTimerSeconds: 90,
          sets: [
            { id: 's-bench-w1', setNumber: 1, type: 'warmup', weightKg: 20, reps: 10, isCompleted: true },
            { id: 's-bench-w2', setNumber: 2, type: 'warmup', weightKg: 50, reps: 5, isCompleted: true },
            { id: 's-bench-work1', setNumber: 3, type: 'normal', weightKg: 80, reps: 8, isCompleted: true },
            { id: 's-bench-work2', setNumber: 4, type: 'normal', weightKg: 80, reps: 8, isCompleted: false },
          ],
        },
        {
          id: 'ae-row',
          exerciseId: 'ex-row',
          supersetId: 'ss-uneven',
          exercise: { id: 'ex-row', name: 'Barbell Row', category: 'Back', equipment: 'Barbell', primaryMuscles: ['Back'] },
          restTimerSeconds: 90,
          sets: [
            // Row has NO warmups, directly starts with working sets
            { id: 's-row-work1', setNumber: 1, type: 'normal', weightKg: 70, reps: 8, isCompleted: false },
            { id: 's-row-work2', setNumber: 2, type: 'normal', weightKg: 70, reps: 8, isCompleted: false },
          ],
        },
      ],
    };

    // When bench Set 3 (its FIRST working set) completes:
    // It should map to Row's FIRST working set (setNumber 1, id s-row-work1), NOT row's 3rd set!
    const target1 = resolveNextSupersetTarget(workout, 'ae-bench', 's-bench-work1');
    assert.ok(target1);
    assert.equal(target1.nextExerciseId, 'ae-row');
    assert.equal(target1.nextSetId, 's-row-work1');
    assert.equal(target1.nextSetNumber, 1);
    assert.equal(target1.isRoundComplete, false);

    // When row Set 1 completes -> round 1 is done, target should be bench's SECOND working set (Set 4, id s-bench-work2)
    workout.exercises[1].sets[0].isCompleted = true;
    const target2 = resolveNextSupersetTarget(workout, 'ae-row', 's-row-work1');
    assert.ok(target2);
    assert.equal(target2.isRoundComplete, true);
    assert.equal(target2.nextExerciseId, 'ae-bench');
    assert.equal(target2.nextSetId, 's-bench-work2');
    assert.equal(target2.nextSetNumber, 4);
  });

  it('falls back to next uncompleted working set if matching rank was already finished out of order', () => {
    const workout: Workout = {
      id: 'w-ooo',
      name: 'Out of Order Workout',
      gymId: 'gym-default',
      startTime: '2026-09-12T10:00:00.000Z',
      durationSeconds: 600,
      totalVolumeKg: 200,
      exercises: [
        {
          id: 'ae-1',
          exerciseId: 'ex-1',
          supersetId: 'ss-ooo',
          exercise: { id: 'ex-1', name: 'Exercise 1', category: 'Chest', equipment: 'Barbell', primaryMuscles: ['Chest'] },
          restTimerSeconds: 60,
          sets: [
            { id: 's-1-1', setNumber: 1, type: 'normal', weightKg: 50, reps: 10, isCompleted: true },
            { id: 's-1-2', setNumber: 2, type: 'normal', weightKg: 50, reps: 10, isCompleted: false },
          ],
        },
        {
          id: 'ae-2',
          exerciseId: 'ex-2',
          supersetId: 'ss-ooo',
          exercise: { id: 'ex-2', name: 'Exercise 2', category: 'Back', equipment: 'Barbell', primaryMuscles: ['Back'] },
          restTimerSeconds: 60,
          sets: [
            // Exercise 2's first working set is already completed ahead of time!
            { id: 's-2-1', setNumber: 1, type: 'normal', weightKg: 50, reps: 10, isCompleted: true },
            { id: 's-2-2', setNumber: 2, type: 'normal', weightKg: 50, reps: 10, isCompleted: false },
          ],
        },
      ],
    };

    // When ae-1 Set 1 completes, ae-2's working set 0 is already done, so it should fall back to s-2-2
    const target = resolveNextSupersetTarget(workout, 'ae-1', 's-1-1');
    assert.ok(target);
    assert.equal(target.nextExerciseId, 'ae-2');
    assert.equal(target.nextSetId, 's-2-2');
    assert.equal(target.nextSetNumber, 2);
  });
});

describe('Superset Link & Unlink Membership Management', () => {
  it('links two unlinked exercises into a new superset', () => {
    const list = [
      { id: 'ex-1' },
      { id: 'ex-2' },
      { id: 'ex-3' },
    ];
    const linked = linkExercisesInGroup(list, 0, 1, 'ss-new');
    assert.equal(linked[0].supersetId, 'ss-new');
    assert.equal(linked[1].supersetId, 'ss-new');
    assert.equal(linked[2].supersetId, undefined);
  });

  it('merges an unlinked exercise into an existing superset group', () => {
    const list = [
      { id: 'ex-1', supersetId: 'ss-group1' },
      { id: 'ex-2', supersetId: 'ss-group1' },
      { id: 'ex-3' },
    ];
    const linked = linkExercisesInGroup(list, 1, 2, 'ss-fallback');
    assert.equal(linked[0].supersetId, 'ss-group1');
    assert.equal(linked[1].supersetId, 'ss-group1');
    assert.equal(linked[2].supersetId, 'ss-group1');
  });

  it('merges two distinct existing supersets without corrupting remaining members', () => {
    // Group 1: ex-1, ex-2 (ss-group1)
    // Group 2: ex-3, ex-4 (ss-group2)
    const list = [
      { id: 'ex-1', supersetId: 'ss-group1' },
      { id: 'ex-2', supersetId: 'ss-group1' },
      { id: 'ex-3', supersetId: 'ss-group2' },
      { id: 'ex-4', supersetId: 'ss-group2' },
    ];
    // Linking ex-2 and ex-3 should merge ALL four exercises into one superset ID
    const merged = linkExercisesInGroup(list, 1, 2, 'ss-fallback');
    const targetId = merged[1].supersetId;
    assert.ok(targetId);
    assert.equal(merged[0].supersetId, targetId);
    assert.equal(merged[1].supersetId, targetId);
    assert.equal(merged[2].supersetId, targetId);
    assert.equal(merged[3].supersetId, targetId);
  });

  it('unlinks an exercise from a 3-member group leaving a 2-member superset', () => {
    const list = [
      { id: 'ex-1', supersetId: 'ss-giant' },
      { id: 'ex-2', supersetId: 'ss-giant' },
      { id: 'ex-3', supersetId: 'ss-giant' },
    ];
    const unlinked = unlinkExerciseFromGroup(list, 1);
    assert.equal(unlinked[1].supersetId, undefined);
    // Remaining 2 retain their group
    assert.equal(unlinked[0].supersetId, 'ss-giant');
    assert.equal(unlinked[2].supersetId, 'ss-giant');
  });

  it('unlinking an exercise from a 2-member group dissolves the remaining singleton', () => {
    const list = [
      { id: 'ex-1', supersetId: 'ss-pair' },
      { id: 'ex-2', supersetId: 'ss-pair' },
      { id: 'ex-3' },
    ];
    const unlinked = unlinkExerciseFromGroup(list, 0);
    // Both ex-1 and ex-2 should now have undefined supersetId
    assert.equal(unlinked[0].supersetId, undefined);
    assert.equal(unlinked[1].supersetId, undefined);
    assert.equal(unlinked[2].supersetId, undefined);
  });
});
