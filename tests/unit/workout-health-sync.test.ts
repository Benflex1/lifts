import assert from 'node:assert/strict';
import test from 'node:test';

import { enqueueCompletedWorkoutSync } from '../../src/health';
import type { Workout } from '../../src/types';

function mockModule(specifier: string, exports: Record<string, unknown>): void {
  const filename = require.resolve(specifier);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  } as NodeJS.Module;
}

let contextModulePromise: Promise<typeof import('../../src/context/WorkoutContext')> | null = null;

function loadWorkoutContext() {
  if (!contextModulePromise) {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    const component = () => null;
    mockModule('react-native', {
      AppState: { addEventListener: () => ({ remove: () => {} }) },
      Platform: { OS: 'web' },
      StyleSheet: { create: (styles: unknown) => styles },
      Modal: component,
      View: component,
      Text: component,
      TouchableOpacity: component,
    });
    mockModule('react-native-safe-area-context', { SafeAreaView: component });
    mockModule('expo-haptics', {
      impactAsync: async () => {},
      notificationAsync: async () => {},
      ImpactFeedbackStyle: { Heavy: 'heavy', Medium: 'medium' },
      NotificationFeedbackType: { Success: 'success' },
    });
    mockModule('expo-crypto', { randomUUID: () => 'generated-id' });
    mockModule('expo-sqlite', { openDatabaseAsync: async () => ({}) });
    contextModulePromise = import('../../src/context/WorkoutContext');
  }
  return contextModulePromise;
}

const completedWorkout: Workout = {
  id: 'completed-workout',
  name: 'Upper Body',
  gymId: 'gym-default',
  startTime: '2026-09-13T08:00:00.000Z',
  endTime: '2026-09-13T09:00:00.000Z',
  durationSeconds: 3600,
  totalVolumeKg: 100,
  exercises: [],
};

test('enqueues health sync only after local completion resolves', async () => {
  const { finishWorkoutWithHealthSync } = await loadWorkoutContext();
  const events: string[] = [];
  const enqueued: Workout[] = [];

  const result = await finishWorkoutWithHealthSync(
    async () => {
      events.push('finish-start');
      await Promise.resolve();
      events.push('finish-resolved');
      return completedWorkout;
    },
    true,
    (workout) => {
      events.push('sync-enqueued');
      enqueued.push(workout);
    },
  );

  assert.equal(result, completedWorkout);
  assert.deepEqual(events, ['finish-start', 'finish-resolved', 'sync-enqueued']);
  assert.deepEqual(enqueued, [completedWorkout]);
});

test('does not enqueue health sync when local completion rejects', async () => {
  const { finishWorkoutWithHealthSync } = await loadWorkoutContext();
  let enqueueCalls = 0;

  await assert.rejects(
    () => finishWorkoutWithHealthSync(
      async () => {
        throw new Error('local persistence failed');
      },
      true,
      () => {
        enqueueCalls += 1;
      },
    ),
    /local persistence failed/,
  );

  assert.equal(enqueueCalls, 0);
});

test('health sync rejection does not reject completion or block navigation', async () => {
  const { finishWorkoutWithHealthSync } = await loadWorkoutContext();
  let navigatedWith: Workout | null = null;

  const completed = await finishWorkoutWithHealthSync(
    async () => completedWorkout,
    true,
    (workout, enabled) => enqueueCompletedWorkoutSync(
      workout,
      enabled,
      async () => {
        throw new Error('health provider failed');
      },
    ),
  );

  navigatedWith = completed;

  assert.equal(navigatedWith, completedWorkout);
});

test('disabled setting does not call the injected health sync', () => {
  let syncCalls = 0;

  enqueueCompletedWorkoutSync(completedWorkout, false, async () => {
    syncCalls += 1;
  });

  assert.equal(syncCalls, 0);
});

test('enabled setting enqueues exactly once with the completed workout', () => {
  let syncCalls = 0;
  let syncedWorkout: Workout | null = null;

  enqueueCompletedWorkoutSync(completedWorkout, true, async (workout) => {
    syncCalls += 1;
    syncedWorkout = workout;
  });

  assert.equal(syncCalls, 1);
  assert.equal(syncedWorkout, completedWorkout);
});
