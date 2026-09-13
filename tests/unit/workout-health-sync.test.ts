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
let settingsState = { healthSyncEnabled: false, loading: true };
let settingsReads = 0;
const providerEnqueueCalls: Array<{ workout: Workout; enabled: boolean }> = [];
let providerStore: {
  saveDraft: (draft: unknown) => Promise<void>;
  finishWorkout: (workout: Workout) => Promise<void>;
  getWorkoutDrafts: () => Promise<unknown[]>;
  getGyms: () => Promise<unknown[]>;
  getDefaultGym: () => Promise<unknown>;
};

type HookRenderer = {
  render: (component: () => unknown) => void;
  flushEffects: () => Promise<void>;
  useState: <T>(initial: T | (() => T)) => readonly [T, (next: T | ((previous: T) => T)) => void];
  useRef: <T>(initial: T) => { current: T };
  useCallback: <T extends (...args: any[]) => any>(callback: T, deps: unknown[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => void;
};

let activeRenderer: HookRenderer | null = null;

function sameDeps(left: unknown[] | undefined, right: unknown[] | undefined): boolean {
  return left !== undefined && right !== undefined &&
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

function createHookRenderer(): HookRenderer {
  const hookStates: unknown[] = [];
  const effectStates: Array<{ deps?: unknown[]; cleanup?: () => void }> = [];
  const pendingEffects: Array<() => void | (() => void)> = [];
  let hookIndex = 0;

  const renderer = {
    render(component: () => unknown): void {
      hookIndex = 0;
      activeRenderer = renderer;
      component();
      activeRenderer = null;
    },
    async flushEffects(): Promise<void> {
      const effects = pendingEffects.splice(0);
      for (const effect of effects) effect();
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
    useState<T>(initial: T | (() => T)) {
      const index = hookIndex++;
      if (!(index in hookStates)) {
        hookStates[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      }
      const setState = (next: T | ((previous: T) => T)) => {
        hookStates[index] = typeof next === 'function'
          ? (next as (previous: T) => T)(hookStates[index] as T)
          : next;
      };
      return [hookStates[index] as T, setState] as const;
    },
    useRef<T>(initial: T) {
      const index = hookIndex++;
      if (!(index in hookStates)) hookStates[index] = { current: initial };
      return hookStates[index] as { current: T };
    },
    useCallback<T extends (...args: any[]) => any>(callback: T, deps: unknown[]) {
      const index = hookIndex++;
      const previous = hookStates[index] as { callback: T; deps: unknown[] } | undefined;
      if (!previous || !sameDeps(previous.deps, deps)) {
        hookStates[index] = { callback, deps };
        return callback;
      }
      return previous.callback;
    },
    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      const index = hookIndex++;
      const previous = effectStates[index];
      if (!previous || !sameDeps(previous.deps, deps)) {
        previous?.cleanup?.();
        effectStates[index] = { deps };
        pendingEffects.push(() => {
          const cleanup = effect();
          effectStates[index].cleanup = cleanup || undefined;
          return cleanup;
        });
      }
    },
  };

  return renderer;
}

function loadWorkoutContext() {
  if (!contextModulePromise) {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    const component = () => null;
    const fakeReact = {
      createContext: (defaultValue: unknown) => {
        const context = { currentValue: defaultValue } as {
          currentValue: unknown;
          Provider: (props: { value: unknown; children?: unknown }) => unknown;
        };
        context.Provider = ({ value, children }) => {
          context.currentValue = value;
          return children;
        };
        return context;
      },
      useContext: (context: { currentValue: unknown }) => context.currentValue,
      useState: <T,>(initial: T | (() => T)) => activeRenderer!.useState(initial),
      useRef: <T,>(initial: T) => activeRenderer!.useRef(initial),
      useCallback: <T extends (...args: any[]) => any>(callback: T, deps: unknown[]) =>
        activeRenderer!.useCallback(callback, deps),
      useEffect: (effect: () => void | (() => void), deps?: unknown[]) =>
        activeRenderer!.useEffect(effect, deps),
      createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => {
        if (typeof type !== 'function') return null;
        return type({ ...(props || {}), children: children.length <= 1 ? children[0] : children });
      },
      Fragment: component,
      default: undefined,
    };
    fakeReact.default = fakeReact;
    mockModule('react/jsx-runtime', {
      Fragment: component,
      jsx: (type: unknown, props: Record<string, unknown>) => fakeReact.createElement(type, props),
      jsxs: (type: unknown, props: Record<string, unknown>) => fakeReact.createElement(type, props),
    });
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
    mockModule('react', fakeReact);
    mockModule('../../src/context/SettingsContext', {
      useSettings: () => {
        settingsReads += 1;
        return settingsState;
      },
    });
    mockModule('../../src/database/db', {
      getStore: async () => providerStore,
    });
    mockModule('../../src/health', {
      enqueueCompletedWorkoutSync: (workout: Workout, enabled: boolean) => {
        if (enabled) providerEnqueueCalls.push({ workout, enabled });
      },
    });
    contextModulePromise = import('../../src/context/WorkoutContext');
  }
  return contextModulePromise;
}

async function createProviderHarness(options: { healthSyncEnabled: boolean; loading: boolean; finishFails?: boolean }) {
  const context = await loadWorkoutContext();
  settingsState = { healthSyncEnabled: options.healthSyncEnabled, loading: options.loading };
  settingsReads = 0;
  providerEnqueueCalls.length = 0;
  const defaultGym = { id: 'gym-default', name: 'Default', isDefault: true };
  providerStore = {
    saveDraft: async () => {},
    finishWorkout: async () => {
      if (options.finishFails) throw new Error('local persistence failed');
    },
    getWorkoutDrafts: async () => [],
    getGyms: async () => [defaultGym],
    getDefaultGym: async () => defaultGym,
  };

  const renderer = createHookRenderer();
  const render = () => renderer.render(() => context.WorkoutProvider({ children: null }));
  render();
  await renderer.flushEffects();
  return {
    workout: context.useWorkout(),
    rerender: async () => {
      render();
      await renderer.flushEffects();
    },
  };
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

test('WorkoutProvider reads enabled settings and enqueues after real completion', async () => {
  const harness = await createProviderHarness({ healthSyncEnabled: true, loading: false });

  assert.ok(settingsReads > 0);
  await harness.workout.startWorkout(undefined, 'Provider workout');
  const completed = await harness.workout.finishWorkout();

  assert.ok(completed);
  assert.equal(providerEnqueueCalls.length, 1);
  assert.equal(providerEnqueueCalls[0].workout, completed);
  assert.equal(providerEnqueueCalls[0].enabled, true);
});

test('WorkoutProvider returns null and does not enqueue when local completion fails', async () => {
  const harness = await createProviderHarness({
    healthSyncEnabled: true,
    loading: false,
    finishFails: true,
  });

  await harness.workout.startWorkout(undefined, 'Failed provider workout');
  const completed = await harness.workout.finishWorkout();

  assert.equal(completed, null);
  assert.equal(providerEnqueueCalls.length, 0);
});

test('WorkoutProvider drains a completion after persisted settings resolve enabled', async () => {
  const harness = await createProviderHarness({ healthSyncEnabled: false, loading: true });

  await harness.workout.startWorkout(undefined, 'Racing provider workout');
  const completed = await harness.workout.finishWorkout();
  assert.ok(completed);
  assert.equal(providerEnqueueCalls.length, 0);

  settingsState = { healthSyncEnabled: true, loading: false };
  await harness.rerender();

  assert.deepEqual(providerEnqueueCalls, [{ workout: completed, enabled: true }]);
});

test('WorkoutProvider drops a completion when persisted settings resolve disabled', async () => {
  const harness = await createProviderHarness({ healthSyncEnabled: false, loading: true });

  await harness.workout.startWorkout(undefined, 'Disabled racing workout');
  const completed = await harness.workout.finishWorkout();
  assert.ok(completed);

  settingsState = { healthSyncEnabled: false, loading: false };
  await harness.rerender();

  assert.equal(providerEnqueueCalls.length, 0);
});
