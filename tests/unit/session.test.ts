import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createSessionController } from '../../src/workout/session';
import { Store, WorkoutDraft } from '../../src/database/contract';
import { Workout } from '../../src/types';
import { computeElapsedSeconds } from '../../src/utils/timer';

function createMockStore(): Store & {
  drafts: Map<string, WorkoutDraft>;
  workouts: Map<string, Workout>;
  failNextFinish: boolean;
  finishDelayMs: number;
} {
  const drafts = new Map<string, WorkoutDraft>();
  const workouts = new Map<string, Workout>();

  const res: any = {
    drafts,
    workouts,
    failNextFinish: false,
    finishDelayMs: 0,
    init: async () => {},
    isReadOnly: () => false,
    tryAcquireLease: async () => true,
    readSnapshot: async () => ({
      workouts: Array.from(workouts.values()),
      routines: [],
      exercises: [],
      drafts: Array.from(drafts.values()),
      settings: {},
      gyms: [{ id: 'gym-default', name: 'Default Gym', isDefault: true, color: '#3B82F6', createdAt: '2026-01-01T00:00:00.000Z' }],
      exerciseGymScopes: [],
    }),
    saveDraft: async (draft: WorkoutDraft) => {
      drafts.set(draft.workout.id, draft);
    },
    getWorkoutDrafts: async () => Array.from(drafts.values()),
    getWorkoutDraft: async (id?: string) => {
      if (id) return drafts.get(id) || null;
      const all = Array.from(drafts.values());
      return all.length > 0 ? all[0] : null;
    },
    finishWorkout: async (workout: Workout) => {
      if (res.finishDelayMs > 0) {
        await new Promise(r => setTimeout(r, res.finishDelayMs));
      }
      if (res.failNextFinish) {
        res.failNextFinish = false;
        throw new Error('Disk full on finish');
      }
      workouts.set(workout.id, workout);
      drafts.delete(workout.id);
    },
    discardDraft: async (id: string) => {
      drafts.delete(id);
    },
    mergeSnapshot: async () => {},
    getRoutines: async () => [],
    saveRoutine: async () => 'r1',
    deleteRoutine: async () => {},
    duplicateRoutine: async () => 'r2',
    getRoutineById: async () => null,
    saveCompletedWorkout: async (workout: Workout) => {
      workouts.set(workout.id, workout);
    },
    getWorkoutHistory: async () => [],
    getWorkoutDetail: async (id: string) => workouts.get(id) || null,
    deleteWorkout: async (id: string) => {
      workouts.delete(id);
    },
    getGyms: async () => [{ id: 'gym-default', name: 'Default Gym', isDefault: true, color: '#3B82F6', createdAt: '2026-01-01T00:00:00.000Z' }],
    getDefaultGym: async () => ({ id: 'gym-default', name: 'Default Gym', isDefault: true, color: '#3B82F6', createdAt: '2026-01-01T00:00:00.000Z' }),
    createGym: async () => ({ id: 'gym-new', name: 'New Gym', isDefault: false, color: '#3B82F6', createdAt: '2026-01-01T00:00:00.000Z' }),
    updateGym: async () => ({ id: 'gym-default', name: 'Default Gym', isDefault: true, color: '#3B82F6', createdAt: '2026-01-01T00:00:00.000Z' }),
    setDefaultGym: async () => {},
    deleteGym: async () => {},
    getExerciseGymScopes: async () => [],
    getExerciseGymScope: async () => null,
    saveExerciseGymScope: async () => {},
    deleteExerciseGymScope: async () => {},
    getPreviousSetsForExercise: async () => [],
    getExerciseStats: async () => ({ global: { maxWeightKg: 0, maxSetVolumeKg: 0, maxReps: 0, estimated1RM: 0, sessionCount: 0 }, gym: { maxWeightKg: 0, maxSetVolumeKg: 0, maxReps: 0, estimated1RM: 0, sessionCount: 0 } }),
    getAllExercises: async () => [],
    searchExercises: async () => [],
    getExerciseById: async () => null,
    createCustomExercise: async (e) => ({ ...e, id: 'c1' }),
    getSetting: async () => null,
    setSetting: async () => {},
    renameFolder: async () => {},
    deleteFolder: async () => {},
  };
  return res;
}

describe('SessionController Unit Tests', () => {
  it('starts a session and awaits initial durable draft write', async () => {
    let currentTime = new Date('2026-09-07T10:00:00.000Z').getTime();
    const mockStore = createMockStore();
    const controller = createSessionController(mockStore, () => currentTime);

    const workout: Workout = {
      id: 'w-1',
      name: 'Push Day',
      gymId: 'gym-default',
      startTime: new Date(currentTime).toISOString(),
      durationSeconds: 0,
      totalVolumeKg: 0,
      exercises: [],
    };

    assert.equal(controller.getState().phase, 'idle');
    await controller.start(workout);

    const state = controller.getState();
    assert.equal(state.phase, 'active');
    assert.equal(state.workout?.id, 'w-1');
    assert.equal(mockStore.drafts.size, 1);
    assert.equal(mockStore.drafts.get('w-1')?.workout.name, 'Push Day');
  });

  it('guards against starting when another session is active or starting', async () => {
    let currentTime = new Date('2026-09-07T10:00:00.000Z').getTime();
    const mockStore = createMockStore();
    const controller = createSessionController(mockStore, () => currentTime);

    const workout1: Workout = {
      id: 'w-1',
      name: 'Session 1',
      gymId: 'gym-default',
      startTime: new Date(currentTime).toISOString(),
      durationSeconds: 0,
      totalVolumeKg: 0,
      exercises: [],
    };
    const workout2: Workout = {
      id: 'w-2',
      name: 'Session 2',
      gymId: 'gym-default',
      startTime: new Date(currentTime).toISOString(),
      durationSeconds: 0,
      totalVolumeKg: 0,
      exercises: [],
    };

    await controller.start(workout1);

    // Second start must be rejected synchronously
    await assert.rejects(async () => {
      await controller.start(workout2);
    }, /Cannot start workout: a workout session is already in progress/);

    assert.equal(controller.getState().workout?.id, 'w-1');
  });

  it('drains and cancels pending autosaves on finish and saves atomically', async () => {
    let currentTime = new Date('2026-09-07T10:00:00.000Z').getTime();
    const mockStore = createMockStore();
    const controller = createSessionController(mockStore, () => currentTime);

    await controller.start({
      id: 'w-1',
      name: 'Chest & Arms',
      gymId: 'gym-default',
      startTime: new Date(currentTime).toISOString(),
      durationSeconds: 0,
      totalVolumeKg: 0,
      exercises: [],
    });

    // Update with dirty changes
    currentTime += 30_000;
    controller.update({
      id: 'w-1',
      name: 'Chest & Arms Edited',
      gymId: 'gym-default',
      startTime: new Date(currentTime - 30_000).toISOString(),
      durationSeconds: 30,
      totalVolumeKg: 50,
      exercises: [],
    });

    currentTime += 30_000;
    const completed = await controller.finish();

    assert.equal(completed.id, 'w-1');
    assert.equal(completed.durationSeconds, 60);
    assert.equal(completed.totalVolumeKg, 50);
    assert.equal(controller.getState().phase, 'idle');
    assert.equal(controller.getState().workout, null);
    assert.equal(mockStore.drafts.size, 0, 'Draft must be removed atomically');
    assert.equal(mockStore.workouts.size, 1, 'Workout must be in completed store');
  });

  it('restores active phase and retains state if finish fails', async () => {
    let currentTime = new Date('2026-09-07T10:00:00.000Z').getTime();
    const mockStore = createMockStore();
    mockStore.failNextFinish = true;
    const controller = createSessionController(mockStore, () => currentTime);

    await controller.start({
      id: 'w-err',
      name: 'Leg Day',
      gymId: 'gym-default',
      startTime: new Date(currentTime).toISOString(),
      durationSeconds: 0,
      totalVolumeKg: 0,
      exercises: [],
    });

    await assert.rejects(async () => {
      await controller.finish();
    }, /Disk full on finish/);

    const state = controller.getState();
    assert.equal(state.phase, 'active', 'Must restore active phase so user can retry');
    assert.equal(state.workout?.id, 'w-err', 'Workout must not be lost');
    assert.ok(state.persistenceError, 'Persistence error must be recorded');

    // Retry finish succeeds
    const finished = await controller.finish();
    assert.equal(finished.id, 'w-err');
    assert.equal(controller.getState().phase, 'idle');
  });

  it('recovers 20-minute draft without rebasing startTime and recomputes wall-clock elapsed duration', async () => {
    const started = '2026-09-07T10:00:00.000Z';
    const now20MinLater = new Date('2026-09-07T10:20:00.000Z').getTime();

    // Verify mathematical contract:
    assert.equal(computeElapsedSeconds(started, now20MinLater), 1200);

    const mockStore = createMockStore();
    const controller = createSessionController(mockStore, () => now20MinLater);

    const draft: WorkoutDraft = {
      version: 1,
      workout: {
        id: 'draft-20min',
        name: 'Interrupted Workout',
        gymId: 'gym-default',
        startTime: started,
        durationSeconds: 150, // old stale duration
        totalVolumeKg: 200,
        exercises: [],
      },
      savedAt: '2026-09-07T10:02:30.000Z',
      revision: 1,
      restTimer: {
        endsAt: now20MinLater + 30_000,
        totalSeconds: 60,
      },
    };

    controller.resume(draft);

    const state = controller.getState();
    assert.equal(state.phase, 'active');
    assert.equal(state.workout?.startTime, started, 'Resume must not rebase startTime');
    assert.equal(state.workout?.durationSeconds, 1200, 'Must recompute duration from wall clock');
    assert.ok(state.restTimer, 'Unexpired rest timer should be preserved');
    assert.equal(state.restTimer?.totalSeconds, 60);

    // Finish 5 minutes later
    const finishTime = now20MinLater + 300_000;
    const controllerFinish = createSessionController(mockStore, () => finishTime);
    controller.updateClock?.(() => finishTime);
    const finished = await controller.finish();
    assert.equal(finished.durationSeconds, 1500);
  });

  it('clears expired rest timers on draft resume', () => {
    const started = '2026-09-07T10:00:00.000Z';
    const now = new Date('2026-09-07T10:20:00.000Z').getTime();

    const mockStore = createMockStore();
    const controller = createSessionController(mockStore, () => now);

    const draft: WorkoutDraft = {
      version: 1,
      workout: {
        id: 'draft-expired-timer',
        name: 'Session',
        gymId: 'gym-default',
        startTime: started,
        durationSeconds: 100,
        totalVolumeKg: 0,
        exercises: [],
      },
      savedAt: '2026-09-07T10:05:00.000Z',
      revision: 1,
      restTimer: {
        endsAt: now - 5000, // expired 5 seconds ago
        totalSeconds: 60,
      },
    };

    controller.resume(draft);
    assert.equal(controller.getState().restTimer, null, 'Expired rest timer must be cleared on resume');
  });

  it('discard deletes draft and returns phase to idle', async () => {
    let currentTime = new Date('2026-09-07T10:00:00.000Z').getTime();
    const mockStore = createMockStore();
    const controller = createSessionController(mockStore, () => currentTime);

    await controller.start({
      id: 'w-discard',
      name: 'To Discard',
      gymId: 'gym-default',
      startTime: new Date(currentTime).toISOString(),
      durationSeconds: 0,
      totalVolumeKg: 0,
      exercises: [],
    });

    assert.equal(mockStore.drafts.size, 1);
    await controller.discard();

    assert.equal(controller.getState().phase, 'idle');
    assert.equal(controller.getState().workout, null);
    assert.equal(mockStore.drafts.size, 0);
  });

  it('publishes a fresh immutable state object on every update for React state change detection', async () => {
    let currentTime = new Date('2026-09-07T10:00:00.000Z').getTime();
    const mockStore = createMockStore();
    const controller = createSessionController(mockStore, () => currentTime);

    const receivedStates: any[] = [];
    controller.subscribe((state) => {
      receivedStates.push(state);
    });

    const initialWorkout: Workout = {
      id: 'w-immutability',
      name: 'Immutability Test',
      gymId: 'gym-default',
      startTime: new Date(currentTime).toISOString(),
      durationSeconds: 0,
      totalVolumeKg: 0,
      exercises: [
        {
          id: 'ae-1',
          exerciseId: 'ex-1',
          exercise: {
            id: 'ex-1',
            name: 'Bench Press',
            category: 'chest',
            equipment: 'barbell',
            primaryMuscles: ['chest'],
          },
          restTimerSeconds: 90,
          sets: [
            {
              id: 's-1',
              setNumber: 1,
              type: 'normal',
              weightKg: 60,
              reps: 20,
              isCompleted: false,
            },
          ],
        },
      ],
    };

    await controller.start(initialWorkout);

    // Rapid updates mimicking fast user typing: 20 -> 1 -> 12
    const prevCount = receivedStates.length;
    const typingSteps = [1, 12];

    for (const newReps of typingSteps) {
      const currentWorkout = controller.getState().workout!;
      const updatedWorkout: Workout = {
        ...currentWorkout,
        exercises: [
          {
            ...currentWorkout.exercises[0],
            sets: [
              {
                ...currentWorkout.exercises[0].sets[0],
                reps: newReps,
              },
            ],
          },
        ],
      };
      controller.update(updatedWorkout);
    }

    // Verify each update emitted a brand new state object reference (React state identity requirement)
    assert.equal(receivedStates.length, prevCount + 2);
    const stateA = receivedStates[receivedStates.length - 2];
    const stateB = receivedStates[receivedStates.length - 1];

    assert.notEqual(stateA, stateB, 'Consecutive state notifications must have distinct object identities');
    assert.equal(stateA.workout.exercises[0].sets[0].reps, 1);
    assert.equal(stateB.workout.exercises[0].sets[0].reps, 12);
    assert.equal(stateB.revision, stateA.revision + 1);
  });
});
