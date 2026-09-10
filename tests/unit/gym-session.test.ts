import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { PreviousSetSuggestion, Workout } from '../../src/types';
import {
  loadSuggestionsForWorkout,
  captureWorkoutVersion,
  appendExercisesToCurrentWorkout,
  isCurrentWorkoutVersion,
  rehydrateUntouchedSuggestions,
  resolveRepeatSourceGym,
  resolveStartGymId,
  switchWorkoutGym,
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

  it('uses the loaded workout detail gym for repeat source metadata', () => {
    const detail = { gymId: 'gym-detail' } as Workout;
    const staleSummaryGym = { gymId: 'gym-summary' } as Workout;
    const gyms = [workoutGym('gym-summary'), workoutGym('gym-detail')];

    assert.equal(resolveRepeatSourceGym(detail, gyms)?.id, 'gym-detail');
    assert.notEqual(resolveRepeatSourceGym(staleSummaryGym, gyms)?.id, 'gym-detail');
  });

  it('rejects a current-state match when the active exercise graph changed', () => {
    const state = {
      phase: 'active' as const,
      revision: 4,
      workout,
      restTimer: null,
    };
    const expected = captureWorkoutVersion(state)!;
    const replacedExerciseState = {
      ...state,
      workout: {
        ...workout,
        exercises: [{ ...workout.exercises[0], id: 'replacement-exercise' }],
      },
    };

    assert.equal(isCurrentWorkoutVersion(state, expected), true);
    assert.equal(isCurrentWorkoutVersion(replacedExerciseState, expected), false);

    const swappedExerciseState = {
      ...state,
      workout: {
        ...workout,
        exercises: [{ ...workout.exercises[0], exerciseId: 'different-exercise' }],
      },
    };
    assert.equal(isCurrentWorkoutVersion(swappedExerciseState, expected), false);
  });

  it('routes every repeated exercise occurrence through the selected gym', async () => {
    const calls: Array<[string, number, string | undefined]> = [];
    const store = {
      getPreviousSetsForExercise: async (exerciseId: string, occurrenceIndex: number, gymId?: string) => {
        calls.push([exerciseId, occurrenceIndex, gymId]);
        return [{ weightKg: occurrenceIndex + 1, reps: 8 }];
      },
    };
    const repeatedWorkout: Workout = {
      ...workout,
      exercises: [workout.exercises[0], { ...workout.exercises[0], id: 'active-exercise-2' }],
    };

    const suggestions = await loadSuggestionsForWorkout(store, repeatedWorkout, 'gym-new');

    assert.deepEqual(calls, [
      ['machine-row', 0, 'gym-new'],
      ['machine-row', 1, 'gym-new'],
    ]);
    assert.equal(suggestions['active-exercise-1'][0].weightKg, 1);
    assert.equal(suggestions['active-exercise-2'][0].weightKg, 2);
  });

  it('ignores a switch result when the controller workout changes during lookup', async () => {
    let releaseLookup!: () => void;
    const lookupFinished = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });
    const selectedGym = {
      id: 'gym-new',
      name: 'New Gym',
      isDefault: false,
      color: '#10B981',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    let state = {
      phase: 'active' as const,
      revision: 4,
      workout,
      restTimer: { endsAt: 12345, totalSeconds: 90 },
    };
    const updates: Workout[] = [];
    const controller = {
      getState: () => state,
      update: (updated: Workout) => updates.push(updated),
      flush: async () => {},
    };
    const store = {
      getGyms: async () => [
        { ...workoutGym('gym-default'), isDefault: true },
        selectedGym,
      ],
      getPreviousSetsForExercise: async () => {
        lookupStartedResolve();
        await lookupFinished;
        return [{ weightKg: 60, reps: 6, sourceGymId: 'gym-new', sourceGymName: 'New Gym' }];
      },
    };

    let lookupStartedResolve!: () => void;
    const lookupStarted = new Promise<void>((resolve) => {
      lookupStartedResolve = resolve;
    });
    const pending = switchWorkoutGym(controller, store, 'gym-new');
    await lookupStarted;
    state = {
      ...state,
      revision: state.revision + 1,
      workout: { ...state.workout, exercises: [] },
    };
    releaseLookup();

    const result = await pending;
    assert.equal(result.applied, false);
    assert.equal(updates.length, 0);
  });

  it('updates the current workout with fresh ghosts, preserves the rest timer, and flushes', async () => {
    const selectedGym = workoutGym('gym-new');
    let state = {
      phase: 'active' as const,
      revision: 4,
      workout,
      restTimer: { endsAt: 12345, totalSeconds: 90 },
    };
    let updatedWorkout: Workout | null = null;
    let updatedTimer: { endsAt: number; totalSeconds: number } | null | undefined;
    let flushes = 0;
    const controller = {
      getState: () => state,
      update: (updated: Workout, timer?: { endsAt: number; totalSeconds: number } | null) => {
        updatedWorkout = updated;
        updatedTimer = timer;
        state = { ...state, revision: state.revision + 1, workout: updated };
      },
      flush: async () => {
        flushes += 1;
      },
    };
    const store = {
      getGyms: async () => [workoutGym('gym-default'), selectedGym],
      getPreviousSetsForExercise: async () => [
        {},
        {},
        { weightKg: 60, reps: 6, sourceGymId: 'gym-new', sourceGymName: 'New Gym' },
      ],
    };

    const result = await switchWorkoutGym(controller, store, 'gym-new');

    assert.equal(result.applied, true);
    assert.equal(updatedWorkout?.gymId, 'gym-new');
    assert.equal(updatedWorkout?.exercises[0].sets[2].previousWeightKg, 60);
    assert.deepEqual(updatedTimer, state.restTimer);
    assert.equal(flushes, 1);
  });

  it('appends exercises only to the captured current workout revision', () => {
    const state = {
      phase: 'active' as const,
      revision: 4,
      workout,
      restTimer: { endsAt: 12345, totalSeconds: 90 },
    };
    const expected = captureWorkoutVersion(state)!;
    const addedExercise = { ...workout.exercises[0], id: 'added-exercise' };
    const updates: Array<{ workout: Workout; timer: unknown }> = [];
    const controller = {
      getState: () => state,
      update: (updated: Workout, timer: unknown) => updates.push({ workout: updated, timer }),
      flush: async () => {},
    };

    assert.equal(appendExercisesToCurrentWorkout(controller, expected, [addedExercise]), true);
    assert.equal(updates[0].workout.exercises.at(-1)?.id, 'added-exercise');
    assert.deepEqual(updates[0].timer, state.restTimer);

    const staleState = { ...state, revision: 5 };
    const staleController = {
      getState: () => staleState,
      update: () => {
        throw new Error('stale update must not run');
      },
      flush: async () => {},
    };
    assert.equal(appendExercisesToCurrentWorkout(staleController, expected, [addedExercise]), false);
  });
});

function workoutGym(id: string) {
  return {
    id,
    name: id === 'gym-new' ? 'New Gym' : 'Default Gym',
    isDefault: id === 'gym-default',
    color: id === 'gym-new' ? '#10B981' : '#3B82F6',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}
