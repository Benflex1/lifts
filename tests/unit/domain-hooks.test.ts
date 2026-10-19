import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Gym, Workout } from '../../src/types';
import { WorkoutPRSummary } from '../../src/workout/pr';

function mockModule(specifier: string, exports: Record<string, unknown>): void {
  const filename = require.resolve(specifier);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  } as NodeJS.Module;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mockModule('react-native', {
  View: 'View',
  Text: 'Text',
  InteractionManager: {
    runAfterInteractions: (callback: () => void) => {
      callback();
      return { cancel: () => {} };
    },
  },
});

mockModule('../../src/context/SettingsContext', {
  useSettings: () => ({ gymTrackingEnabled: false, unit: 'kg' }),
});

const sentinelSummary = { workoutId: 'w1', totalCount: 1 } as unknown as WorkoutPRSummary;
const weekSentinel = { workoutsThisWeek: 2 };

const state = {
  revision: 10,
  history: [{ id: 'w1', name: 'Bench Day' }] as any[],
  gyms: [{ id: 'gym-default', name: 'Home', isDefault: true }] as Gym[],
  workouts: [{ id: 'w1', name: 'Bench Day', exercises: [] }] as unknown as Workout[],
  exercises: [{ id: 'e1', name: 'Bench Press' }] as any[],
  detail: { id: 'w2', name: 'Leg Day', exercises: [{ exerciseId: 'e1' }] } as unknown as Workout,
  routines: [{ id: 'r1', name: 'Push' }] as any[],
  catalogResults: [] as any[],
  lastSearch: { query: '', muscle: '', equipment: '' },
  calls: {
    history: 0,
    gyms: 0,
    detail: 0,
    completedForExercises: 0,
    scope: 0,
    snapshot: 0,
    search: 0,
    routines: 0,
    prAll: 0,
    prOne: 0,
    week: 0,
  },
};

function resetCalls(): void {
  for (const key of Object.keys(state.calls) as (keyof typeof state.calls)[]) {
    state.calls[key] = 0;
  }
  state.revision = 10;
  state.catalogResults = [];
  state.lastSearch = { query: '', muscle: '', equipment: '' };
}

mockModule('../../src/database/db', {
  getStore: async () => ({
    getDataRevision: async () => state.revision,
    readSnapshot: async () => {
      state.calls.snapshot += 1;
      return {
        workouts: state.workouts,
        gyms: state.gyms,
        exercises: state.exercises,
        exerciseGymScopes: [],
        routines: [],
        drafts: [],
        settings: {},
      };
    },
  }),
  getWorkoutHistory: async () => {
    state.calls.history += 1;
    return state.history;
  },
  getGyms: async () => {
    state.calls.gyms += 1;
    return state.gyms;
  },
  getWorkoutDetail: async (id: string) => {
    state.calls.detail += 1;
    return id === state.detail.id ? state.detail : null;
  },
  getCompletedWorkoutsForExercises: async () => {
    state.calls.completedForExercises += 1;
    return {};
  },
  getExerciseGymScope: async () => {
    state.calls.scope += 1;
    return null;
  },
  getRoutines: async () => {
    state.calls.routines += 1;
    return state.routines;
  },
  searchExercises: async (query: string, muscle: string, equipment: string) => {
    state.calls.search += 1;
    state.lastSearch = { query, muscle, equipment };
    return state.catalogResults;
  },
});

mockModule('../../src/workout/pr', {
  evaluateAllWorkoutPRs: () => {
    state.calls.prAll += 1;
    return { w1: sentinelSummary };
  },
  evaluateWorkoutPRs: () => {
    state.calls.prOne += 1;
    return sentinelSummary;
  },
});

mockModule('../../src/workout/analytics', {
  buildWeeklyVolume: () => [{ week: 'sentinel' }],
  buildMuscleFrequency: () => [],
});

mockModule('../../src/workout/week-summary', {
  buildWeekSnapshot: () => {
    state.calls.week += 1;
    return weekSentinel;
  },
});

interface Harness<T> {
  result: { current: T };
  emit: () => Promise<void>;
  update: (props: Record<string, unknown>) => Promise<void>;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

async function mountHook<T>(
  useHook: (props: any) => T,
  props: Record<string, unknown> = {},
): Promise<Harness<T>> {
  const { TabActivationContext, createActivationEmitter } = await import('../../src/hooks/useReloadOnActivate');
  const emitter = createActivationEmitter();
  const result = { current: undefined as unknown as T };
  const propsRef = { current: props };
  function Probe() {
    result.current = useHook(propsRef.current);
    return null;
  }
  const element = () =>
    React.createElement(
      TabActivationContext.Provider,
      { value: emitter },
      React.createElement(Probe),
    );
  let mounted!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    mounted = TestRenderer.create(element());
    await flush();
  });
  return {
    result,
    emit: async () => {
      await act(async () => {
        emitter.emit();
        await flush();
      });
    },
    update: async (next: Record<string, unknown>) => {
      propsRef.current = next;
      await act(async () => {
        mounted.update(element());
        await flush();
      });
    },
  };
}

test('useWorkoutHistory loads once, skips identical revisions, and refreshes after a write', async () => {
  resetCalls();
  const { useWorkoutHistory } = await import('../../src/hooks/useWorkoutHistory');
  const harness = await mountHook(useWorkoutHistory);

  assert.equal(state.calls.history, 1);
  assert.equal(state.calls.gyms, 1);
  assert.equal(state.calls.prAll, 1);
  assert.deepEqual(harness.result.current.history, state.history);
  assert.deepEqual(harness.result.current.prs, { w1: sentinelSummary });

  await harness.emit();
  assert.equal(state.calls.history, 1, 'unchanged revision skips the reload');

  state.revision += 1;
  await harness.emit();
  assert.equal(state.calls.history, 2, 'a write advances the revision and reloads');
  assert.equal(state.calls.prAll, 2);
});

test('useWorkoutHistory caches lazily loaded details and PR summaries', async () => {
  resetCalls();
  const { useWorkoutHistory } = await import('../../src/hooks/useWorkoutHistory');
  const harness = await mountHook(useWorkoutHistory);

  const captured: { detail: Workout | null } = { detail: null };
  await act(async () => {
    captured.detail = await harness.result.current.loadDetail('w2');
    await flush();
  });
  assert.equal(captured.detail?.id, 'w2');
  assert.equal(state.calls.detail, 1);
  assert.equal(state.calls.prOne, 1, 'missing PR summary is computed once');
  assert.equal(harness.result.current.loadingDetailId, null);

  await act(async () => {
    await harness.result.current.loadDetail('w2');
    await flush();
  });
  assert.equal(state.calls.detail, 1, 'detail is served from the cache');
});

test('useExerciseCatalog requeries on filter changes and only refreshes after writes', async () => {
  resetCalls();
  const { useExerciseCatalog } = await import('../../src/hooks/useExerciseCatalog');
  const harness = await mountHook(useExerciseCatalog, { query: '', muscle: 'All', equipment: 'All' });

  assert.equal(state.calls.search, 1);
  assert.deepEqual(state.lastSearch, { query: '', muscle: 'All', equipment: 'All' });

  const firstResults = [{ id: 'e1', name: 'Bench Press', equipment: 'barbell', primaryMuscles: ['chest'] }];
  state.catalogResults = firstResults;
  await harness.update({ query: 'bench', muscle: 'All', equipment: 'All' });
  assert.equal(state.calls.search, 2);
  assert.deepEqual(state.lastSearch, { query: 'bench', muscle: 'All', equipment: 'All' });
  assert.equal(harness.result.current.exercises, firstResults);

  await harness.emit();
  assert.equal(state.calls.search, 2, 'unchanged revision skips the activation refresh');

  const stableArray = harness.result.current.exercises;
  state.revision += 1;
  await harness.emit();
  assert.equal(state.calls.search, 3, 'a write refreshes the catalog');
  assert.equal(harness.result.current.exercises, stableArray, 'identical results keep array identity');
});

test('useAnalyticsSnapshot hydrates once and refreshes only after writes', async () => {
  resetCalls();
  const { useAnalyticsSnapshot } = await import('../../src/hooks/useAnalyticsSnapshot');
  const harness = await mountHook(useAnalyticsSnapshot);

  assert.equal(state.calls.snapshot, 1);
  assert.equal(harness.result.current.hasWorkoutData, true);
  assert.deepEqual(harness.result.current.workouts, state.workouts);
  assert.deepEqual(harness.result.current.gyms, state.gyms);

  await harness.emit();
  assert.equal(state.calls.snapshot, 1, 'unchanged revision skips the hydration');

  state.revision += 1;
  await harness.emit();
  assert.equal(state.calls.snapshot, 2, 'a write triggers a full reload');
});

test('useRoutines loads the list and week snapshot and reloads after writes', async () => {
  resetCalls();
  const { useRoutines } = await import('../../src/hooks/useRoutines');
  const harness = await mountHook(useRoutines);

  assert.equal(state.calls.routines, 1);
  assert.equal(state.calls.week, 1);
  assert.deepEqual(harness.result.current.routines, state.routines);
  assert.deepEqual(harness.result.current.week, weekSentinel);

  state.revision += 1;
  await act(async () => {
    await harness.result.current.reload({ skipIfUnchanged: true });
    await flush();
  });
  assert.equal(state.calls.routines, 2);
});

test('useGymProfiles loads lazily and caches the list', async () => {
  resetCalls();
  const { useGymProfiles } = await import('../../src/hooks/useGymProfiles');
  const harness = await mountHook(useGymProfiles);

  assert.equal(state.calls.gyms, 0, 'nothing loads until reload is called');
  let list: Gym[] = [];
  await act(async () => {
    list = await harness.result.current.reload();
    await flush();
  });
  assert.equal(state.calls.gyms, 1);
  assert.deepEqual(list, state.gyms);
  assert.deepEqual(harness.result.current.gyms, state.gyms);
});
