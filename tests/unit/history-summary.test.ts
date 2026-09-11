import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Workout, WorkoutHistorySummary } from '../../src/types';
import { updateWorkoutHistorySummary } from '../../src/workout/history-summary';

const workoutFixture = (): Workout => ({
  id: 'workout-1',
  name: 'Completed Workout',
  gymId: 'gym-new',
  startTime: '2026-09-11T09:00:00.000Z',
  endTime: '2026-09-11T10:00:00.000Z',
  durationSeconds: 3600,
  totalVolumeKg: 100,
  notes: 'Updated after finishing',
  exercises: [{
    id: 'exercise-1',
    exerciseId: 'bench-press',
    exercise: {
      id: 'bench-press',
      name: 'Bench Press',
      category: 'strength',
      equipment: 'barbell',
      primaryMuscles: ['chest'],
    },
    restTimerSeconds: 90,
    sets: [{
      id: 'set-1',
      setNumber: 1,
      type: 'normal',
      weightKg: 50,
      reps: 2,
      isCompleted: true,
    }],
  }],
});

describe('workout history summary updates', () => {
  it('updates an already-loaded workout row when its gym changes', () => {
    const original: WorkoutHistorySummary = {
      id: 'workout-1',
      name: 'Completed Workout',
      gymId: 'gym-old',
      startTime: '2026-09-11T09:00:00.000Z',
      endTime: '2026-09-11T10:00:00.000Z',
      durationSeconds: 3000,
      totalVolumeKg: 80,
      totalSets: 1,
      exerciseNames: ['Bench Press'],
      notes: 'Original notes',
    };

    const updated = updateWorkoutHistorySummary([original], workoutFixture());

    assert.equal(updated[0].gymId, 'gym-new');
    assert.equal(updated[0].totalVolumeKg, 100);
    assert.equal(updated[0].notes, 'Updated after finishing');
    assert.equal(original.gymId, 'gym-old');
  });
});
