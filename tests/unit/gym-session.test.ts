import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { PreviousSetSuggestion, Workout } from '../../src/types';
import {
  rehydrateUntouchedSuggestions,
  resolveStartGymId,
} from '../../src/workout/gym-session';

const workout: Workout = {
  id: 'workout-1',
  name: 'Gym-aware workout',
  gymId: 'gym-default',
  startTime: '2026-09-10T10:00:00.000Z',
  durationSeconds: 120,
  totalVolumeKg: 240,
  exercises: [
    {
      id: 'active-exercise-1',
      exerciseId: 'machine-row',
      exercise: {
        id: 'machine-row',
        name: 'Machine Row',
        category: 'strength',
        equipment: 'machine',
        primaryMuscles: ['back'],
      },
      restTimerSeconds: 90,
      sets: [
        {
          id: 'set-completed',
          setNumber: 1,
          type: 'normal',
          weightKg: 50,
          reps: 8,
          isCompleted: true,
          isWeightEdited: true,
          previousWeightKg: 45,
          previousReps: 10,
          previousGymId: 'gym-old',
          previousGymName: 'Old Gym',
        },
        {
          id: 'set-edited',
          setNumber: 2,
          type: 'normal',
          weightKg: 42,
          reps: 6,
          isCompleted: false,
          isWeightEdited: true,
          previousWeightKg: 40,
          previousReps: 8,
          previousGymId: 'gym-old',
          previousGymName: 'Old Gym',
        },
        {
          id: 'set-untouched',
          setNumber: 3,
          type: 'normal',
          weightKg: 0,
          reps: 9,
          isCompleted: false,
          isWeightEdited: false,
          previousWeightKg: 35,
          previousReps: 10,
          previousGymId: 'gym-old',
          previousGymName: 'Old Gym',
        },
        {
          id: 'set-without-suggestion',
          setNumber: 4,
          type: 'normal',
          weightKg: 0,
          reps: 7,
          isCompleted: false,
          isWeightEdited: false,
          previousWeightKg: 30,
          previousReps: 8,
          previousGymId: 'gym-old',
          previousGymName: 'Old Gym',
        },
      ],
    },
  ],
};

describe('gym session helpers', () => {
  it('rehydrates only untouched suggestion metadata without mutating the workout', () => {
    const original = structuredClone(workout);
    const suggestionsByExercise: Record<string, PreviousSetSuggestion[]> = {
      'machine-row': [
        { weightKg: 55, reps: 5, sourceGymId: 'gym-new', sourceGymName: 'New Gym' },
        { weightKg: 47, reps: 7, sourceGymId: 'gym-new', sourceGymName: 'New Gym' },
        { weightKg: 39, reps: 9, sourceGymId: 'gym-new', sourceGymName: 'New Gym' },
      ],
    };

    const rehydrated = rehydrateUntouchedSuggestions(workout, suggestionsByExercise);
    const sets = rehydrated.exercises[0].sets;

    assert.deepEqual(sets[0], workout.exercises[0].sets[0], 'completed sets are untouched');
    assert.deepEqual(sets[1], workout.exercises[0].sets[1], 'edited sets are untouched');
    assert.equal(sets[2].weightKg, 0, 'user-entered weight remains untouched');
    assert.equal(sets[2].reps, 9, 'user-entered reps remain untouched');
    assert.deepEqual(
      {
        previousWeightKg: sets[2].previousWeightKg,
        previousReps: sets[2].previousReps,
        previousGymId: sets[2].previousGymId,
        previousGymName: sets[2].previousGymName,
      },
      {
        previousWeightKg: 39,
        previousReps: 9,
        previousGymId: 'gym-new',
        previousGymName: 'New Gym',
      },
    );
    assert.equal(sets[3].previousWeightKg, undefined, 'stale weight metadata is cleared');
    assert.equal(sets[3].previousReps, undefined, 'stale reps metadata is cleared');
    assert.equal(sets[3].previousGymId, undefined, 'stale gym ID metadata is cleared');
    assert.equal(sets[3].previousGymName, undefined, 'stale gym name metadata is cleared');
    assert.deepEqual(workout, original, 'the input workout is never mutated');
  });

  it('uses an explicit gym ID and otherwise falls back to the saved default', () => {
    const defaultGym = {
      id: 'gym-default',
      name: 'Default Gym',
      isDefault: true,
      color: '#3B82F6',
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    assert.equal(resolveStartGymId(defaultGym), 'gym-default');
    assert.equal(resolveStartGymId(defaultGym, {}), 'gym-default');
    assert.equal(resolveStartGymId(defaultGym, { gymId: 'gym-other' }), 'gym-other');
  });
});
