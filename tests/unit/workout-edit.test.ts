import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Workout } from '../../src/types';
import { applyWorkoutEdits, reassignWorkoutGym } from '../../src/workout/workout-edit';

const workoutFixture = (): Workout => ({
  id: 'workout-1',
  name: 'Original Workout',
  gymId: 'gym-default',
  startTime: '2026-09-08T09:00:00.000Z',
  endTime: '2026-09-08T10:00:00.000Z',
  durationSeconds: 3600,
  totalVolumeKg: 80 * 5 + 50 * 10,
  notes: 'Original notes',
  exercises: [{
    id: 'active-exercise-1',
    exerciseId: 'exercise-1',
    exercise: {
      id: 'exercise-1',
      name: 'Bench Press',
      category: 'strength',
      equipment: 'barbell',
      primaryMuscles: ['chest'],
    },
    restTimerSeconds: 90,
    sets: [
      {
        id: 'set-1',
        setNumber: 1,
        type: 'normal',
        weightKg: 80,
        reps: 5,
        rpe: 8,
        isCompleted: true,
      },
      {
        id: 'set-2',
        setNumber: 2,
        type: 'drop',
        weightKg: 50,
        reps: 10,
        rpe: 9,
        isCompleted: true,
      },
    ],
  }],
});

describe('applyWorkoutEdits', () => {
  it('reassigns a completed workout gym without changing its recorded work', () => {
    const original = workoutFixture();

    const updated = reassignWorkoutGym(original, 'gym-b');

    assert.equal(updated.id, original.id);
    assert.equal(updated.gymId, 'gym-b');
    assert.equal(updated.totalVolumeKg, original.totalVolumeKg);
    assert.deepEqual(updated.exercises, original.exercises);
    assert.equal(original.gymId, 'gym-default');
  });

  it('reassigns only the workout gym while preserving the completed workout ID', () => {
    const original = workoutFixture();

    const updated = applyWorkoutEdits(original, {
      gymId: 'gym-b',
      sets: [],
    });

    assert.equal(updated.id, original.id);
    assert.equal(updated.gymId, 'gym-b');
    assert.equal(updated.name, original.name);
    assert.equal(updated.totalVolumeKg, original.totalVolumeKg);
    assert.deepEqual(updated.exercises, original.exercises);
    assert.equal(original.gymId, 'gym-default');
  });

  it('rejects an empty gym reassignment', () => {
    assert.throws(() => applyWorkoutEdits(workoutFixture(), {
      gymId: '  ',
      sets: [],
    }), /Gym ID cannot be empty/);
  });

  it('updates selected sets, keeps IDs and metadata, and recalculates volume', () => {
    const original = workoutFixture();

    const updated = applyWorkoutEdits(original, {
      name: 'Corrected Workout',
      notes: 'Updated notes',
      sets: [{
        exerciseId: 'exercise-1',
        setId: 'set-1',
        weightKg: 100,
        reps: 4,
      }],
    });

    assert.equal(updated.id, original.id);
    assert.equal(updated.name, 'Corrected Workout');
    assert.equal(updated.notes, 'Updated notes');
    assert.equal(updated.totalVolumeKg, 100 * 4 + 50 * 10);
    assert.equal(updated.exercises[0].sets[0].id, 'set-1');
    assert.equal(updated.exercises[0].sets[0].weightKg, 100);
    assert.equal(updated.exercises[0].sets[0].reps, 4);
    assert.equal(updated.exercises[0].sets[0].rpe, 8);
    assert.equal(updated.exercises[0].sets[0].type, 'normal');
    assert.equal(updated.exercises[0].sets[1].weightKg, 50);
    assert.equal(original.exercises[0].sets[0].weightKg, 80);
  });

  it('rejects invalid weights, reps, and unknown set references', () => {
    const workout = workoutFixture();
    const edit = (weightKg: number, reps: number) => applyWorkoutEdits(workout, {
      sets: [{ exerciseId: 'exercise-1', setId: 'set-1', weightKg, reps }],
    });

    assert.throws(() => edit(-1, 5), /Weight cannot be negative/);
    assert.throws(() => edit(Number.NaN, 5), /Weight must be a valid number/);
    assert.throws(() => edit(Number.POSITIVE_INFINITY, 5), /Weight must be a valid number/);
    assert.throws(() => edit(80, 0), /Reps must be greater than 0/);
    assert.throws(() => edit(80, -2), /Reps must be greater than 0/);
    assert.throws(() => edit(80, 5.5), /Reps must be a whole number/);
    assert.throws(() => applyWorkoutEdits(workout, {
      sets: [{ exerciseId: 'exercise-1', setId: 'missing-set', weightKg: 80, reps: 5 }],
    }), /Set exercise-1\/missing-set was not found/);
  });

  it('updates duration, startTime and automatically adjusts endTime', () => {
    const original = workoutFixture();
    const startTime = '2026-09-08T09:00:00.000Z';
    const updated = applyWorkoutEdits(original, {
      durationSeconds: 1800, // 30 minutes
      startTime,
      sets: [],
    });

    assert.equal(updated.durationSeconds, 1800);
    assert.equal(updated.startTime, startTime);
    assert.equal(updated.endTime, '2026-09-08T09:30:00.000Z');
  });

  it('updates with full exercises list and recalculates volume', () => {
    const original = workoutFixture();
    const updated = applyWorkoutEdits(original, {
      exercises: [
        {
          id: 'active-ex-2',
          exerciseId: 'exercise-squat',
          exercise: {
            id: 'exercise-squat',
            name: 'Squat',
            category: 'strength',
            equipment: 'barbell',
            primaryMuscles: ['quads'],
          },
          restTimerSeconds: 120,
          sets: [
            { id: 'sq-1', setNumber: 1, type: 'normal', weightKg: 100, reps: 5, isCompleted: true },
            { id: 'sq-2', setNumber: 2, type: 'normal', weightKg: 110, reps: 5, isCompleted: true },
            { id: 'sq-3', setNumber: 3, type: 'normal', weightKg: 120, reps: 3, isCompleted: false },
          ],
        },
      ],
    });

    assert.equal(updated.exercises.length, 1);
    assert.equal(updated.exercises[0].exerciseId, 'exercise-squat');
    // Completed sets: 100*5 + 110*5 = 1050 kg (uncompleted sq-3 ignored)
    assert.equal(updated.totalVolumeKg, 1050);
  });

  it('rejects invalid duration or malformed dates', () => {
    const workout = workoutFixture();
    assert.throws(() => applyWorkoutEdits(workout, { durationSeconds: -10, sets: [] }), /Duration must be a positive number/);
    assert.throws(() => applyWorkoutEdits(workout, { startTime: 'invalid-date', sets: [] }), /Start time must be a valid date/);
    assert.throws(() => applyWorkoutEdits(workout, { endTime: 'invalid-date', sets: [] }), /End time must be a valid date/);
  });

  it('sanitizes NaN and invalid numbers on incomplete sets to safe values', () => {
    const original = workoutFixture();
    const updated = applyWorkoutEdits(original, {
      exercises: [
        {
          id: 'active-ex-nan',
          exerciseId: 'exercise-bench',
          exercise: {
            id: 'exercise-bench',
            name: 'Bench Press',
            category: 'strength',
            equipment: 'barbell',
            primaryMuscles: ['chest'],
          },
          restTimerSeconds: 90,
          sets: [
            { id: 'set-1', setNumber: 1, type: 'normal', weightKg: 80, reps: 8, isCompleted: true },
            { id: 'set-2', setNumber: 2, type: 'normal', weightKg: NaN, reps: NaN, isCompleted: false },
            { id: 'set-3', setNumber: 3, type: 'normal', weightKg: -5, reps: 3.5, isCompleted: false },
          ],
        },
      ],
    });

    const sets = updated.exercises[0].sets;
    assert.equal(sets[0].weightKg, 80);
    assert.equal(sets[0].reps, 8);
    // Incomplete sets should be sanitized to 0 instead of NaN or negative/fractional numbers
    assert.equal(sets[1].weightKg, 0);
    assert.equal(sets[1].reps, 0);
    assert.equal(Number.isNaN(sets[1].weightKg), false);
    assert.equal(Number.isNaN(sets[1].reps), false);
    assert.equal(sets[2].weightKg, 0);
    assert.equal(sets[2].reps, 0);
  });

  it('preserves distinct instances of the same exercise independently', () => {
    const original = workoutFixture();
    const exDef = {
      id: 'exercise-bench',
      name: 'Bench Press',
      category: 'strength' as const,
      equipment: 'barbell' as const,
      primaryMuscles: ['chest'],
    };

    const updated = applyWorkoutEdits(original, {
      exercises: [
        {
          id: 'active-bench-1',
          exerciseId: 'exercise-bench',
          exercise: exDef,
          restTimerSeconds: 90,
          sets: [
            { id: 'b1-set-1', setNumber: 1, type: 'normal', weightKg: 100, reps: 5, isCompleted: true },
          ],
        },
        {
          id: 'active-bench-2',
          exerciseId: 'exercise-bench',
          exercise: exDef,
          restTimerSeconds: 120,
          sets: [
            { id: 'b2-set-1', setNumber: 1, type: 'drop', weightKg: 60, reps: 12, isCompleted: true },
          ],
        },
      ],
    });

    assert.equal(updated.exercises.length, 2);
    assert.equal(updated.exercises[0].id, 'active-bench-1');
    assert.equal(updated.exercises[1].id, 'active-bench-2');
    assert.equal(updated.exercises[0].sets[0].id, 'b1-set-1');
    assert.equal(updated.exercises[1].sets[0].id, 'b2-set-1');
    assert.equal(updated.totalVolumeKg, 100 * 5 + 60 * 12);
  });
});
