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
});
