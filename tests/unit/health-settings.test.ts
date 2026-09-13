import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { HealthProvider } from '../../src/health/contract';
import {
  authorizeHealthSync,
  updateHealthSyncSetting,
  type HealthSyncSettingDependencies,
} from '../../src/health/settings';
import * as webHealth from '../../src/health/index.web';
import type { Workout } from '../../src/types';

function provider(overrides: Partial<HealthProvider> = {}): HealthProvider {
  return {
    id: 'healthkit',
    isAvailable: async () => true,
    requestWriteAuthorization: async () => 'granted',
    writeStrengthWorkout: async () => undefined,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<HealthSyncSettingDependencies> = {},
): HealthSyncSettingDependencies & { states: boolean[]; persisted: boolean[]; notifications: string[] } {
  const states: boolean[] = [];
  const persisted: boolean[] = [];
  const notifications: string[] = [];
  return {
    loadProvider: async () => provider(),
    persist: async (enabled) => { persisted.push(enabled); },
    setState: (enabled) => { states.push(enabled); },
    notify: async ({ message }) => { notifications.push(message); },
    states,
    persisted,
    notifications,
    ...overrides,
  };
}

type RetryableDependencies = HealthSyncSettingDependencies & {
  retryPendingHealthSyncs: () => Promise<unknown>;
  logRetryFailure: (error: unknown) => void;
};

function retryableDependencies(): RetryableDependencies {
  return dependencies() as RetryableDependencies;
}

describe('authorizeHealthSync', () => {
  it('rejects a missing provider with a user-readable unavailable error', async () => {
    await assert.rejects(
      () => authorizeHealthSync(null),
      (error: Error) => /health sync is unavailable/i.test(error.message),
    );
  });

  it('rejects an unavailable provider without requesting authorization', async () => {
    let requested = false;
    await assert.rejects(
      () => authorizeHealthSync(provider({
        isAvailable: async () => false,
        requestWriteAuthorization: async () => {
          requested = true;
          return 'granted';
        },
      })),
      /health sync is unavailable/i,
    );
    assert.equal(requested, false);
  });

  it('rejects denied and unavailable write authorization', async () => {
    await assert.rejects(
      () => authorizeHealthSync(provider({ requestWriteAuthorization: async () => 'denied' })),
      /health sync permission was denied or is unavailable/i,
    );
    await assert.rejects(
      () => authorizeHealthSync(provider({ requestWriteAuthorization: async () => 'unavailable' })),
      /health sync permission was denied or is unavailable/i,
    );
  });

  it('resolves only after write authorization is granted', async () => {
    await authorizeHealthSync(provider());
  });
});

describe('health sync setting transitions', () => {
  it('returns immediately without work when the requested value is unchanged', async () => {
    let loaded = false;
    const deps = dependencies({ loadProvider: async () => { loaded = true; return provider(); } });

    const result = await updateHealthSyncSetting(false, false, deps);

    assert.equal(result, false);
    assert.equal(loaded, false);
    assert.deepEqual(deps.persisted, []);
  });

  it('leaves the setting disabled and unpersisted when the provider is unavailable', async () => {
    const deps = dependencies({ loadProvider: async () => provider({ isAvailable: async () => false }) });

    await assert.rejects(() => updateHealthSyncSetting(true, false, deps), /unavailable/i);

    assert.deepEqual(deps.states, [false]);
    assert.deepEqual(deps.persisted, []);
    assert.equal(deps.notifications.length, 1);
  });

  it('leaves the setting disabled and unpersisted when authorization is denied', async () => {
    const deps = dependencies({ loadProvider: async () => provider({ requestWriteAuthorization: async () => 'denied' }) });

    await assert.rejects(() => updateHealthSyncSetting(true, false, deps), /denied/i);

    assert.deepEqual(deps.states, [false]);
    assert.deepEqual(deps.persisted, []);
    assert.equal(deps.notifications.length, 1);
  });

  it('persists and exposes the setting only after authorization is granted', async () => {
    const deps = dependencies();

    const result = await updateHealthSyncSetting(true, false, deps);

    assert.equal(result, true);
    assert.deepEqual(deps.states, [true]);
    assert.deepEqual(deps.persisted, [true]);
  });

  it('starts retrying after persistence without blocking a successful enable', async () => {
    const deps = retryableDependencies();
    const events: string[] = [];
    let releaseRetry: (() => void) | undefined;
    deps.persist = async () => { events.push('persist'); };
    deps.retryPendingHealthSyncs = () => {
      events.push('retry');
      return new Promise<void>((resolve) => { releaseRetry = resolve; });
    };

    const result = await updateHealthSyncSetting(true, false, deps);

    assert.equal(result, true);
    assert.deepEqual(events, ['persist', 'retry']);
    releaseRetry?.();
  });

  it('logs retry failures without changing the successful enable result', async () => {
    const deps = retryableDependencies();
    const logged: string[] = [];
    deps.retryPendingHealthSyncs = async () => { throw new Error('retry failed'); };
    deps.logRetryFailure = (error) => { logged.push((error as Error).message); };

    const result = await updateHealthSyncSetting(true, false, deps);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(result, true);
    assert.deepEqual(logged, ['retry failed']);
  });

  it('authorizes before persisting an enabled setting', async () => {
    const events: string[] = [];
    const deps = dependencies({
      loadProvider: async () => provider({
        isAvailable: async () => { events.push('availability'); return true; },
        requestWriteAuthorization: async () => { events.push('authorization'); return 'granted'; },
      }),
      persist: async () => { events.push('persist'); },
    });

    await updateHealthSyncSetting(true, false, deps);

    assert.deepEqual(events, ['availability', 'authorization', 'persist']);
  });

  it('disables without loading a provider or requesting authorization', async () => {
    let loaded = false;
    const deps = dependencies({ loadProvider: async () => { loaded = true; return provider(); } });

    const result = await updateHealthSyncSetting(false, true, deps);

    assert.equal(result, false);
    assert.equal(loaded, false);
    assert.deepEqual(deps.states, [false]);
    assert.deepEqual(deps.persisted, [false]);
  });

  it('rolls back and notifies when persistence fails', async () => {
    const deps = dependencies({
      persist: async () => { throw new Error('storage failed'); },
    });

    await assert.rejects(() => updateHealthSyncSetting(false, true, deps), /storage failed/);

    assert.deepEqual(deps.states, [false, true]);
    assert.deepEqual(deps.notifications, ['storage failed']);
  });

  it('rolls back and notifies when enabling cannot be persisted', async () => {
    const deps = dependencies({
      persist: async () => { throw new Error('enable storage failed'); },
    });

    await assert.rejects(() => updateHealthSyncSetting(true, false, deps), /enable storage failed/);

    assert.deepEqual(deps.states, [true, false]);
    assert.deepEqual(deps.notifications, ['enable storage failed']);
  });

  it('does nothing when the platform has no provider', async () => {
    const deps = retryableDependencies();
    let retries = 0;
    deps.loadProvider = async () => null;
    deps.retryPendingHealthSyncs = async () => { retries += 1; };

    const result = await updateHealthSyncSetting(true, false, deps);

    assert.equal(result, false);
    assert.deepEqual(deps.states, []);
    assert.deepEqual(deps.persisted, []);
    assert.deepEqual(deps.notifications, []);
    assert.equal(retries, 0);
  });

  it('rolls back and notifies when loading the platform provider fails', async () => {
    const deps = dependencies({
      loadProvider: async () => { throw new Error('provider load failed'); },
    });

    await assert.rejects(() => updateHealthSyncSetting(true, false, deps), /provider load failed/);

    assert.deepEqual(deps.states, [false]);
    assert.deepEqual(deps.persisted, []);
    assert.deepEqual(deps.notifications, ['provider load failed']);
  });
});

describe('web health API boundary', () => {
  it('exposes no-op sync APIs without requiring native modules', async () => {
    const workout = {} as Workout;

    assert.equal(typeof webHealth.syncCompletedWorkout, 'function');
    assert.equal(typeof webHealth.enqueueCompletedWorkoutSync, 'function');
    assert.equal(await webHealth.syncCompletedWorkout(workout), null);
    assert.deepEqual(await webHealth.retryPendingHealthSyncs(), []);
    assert.equal(webHealth.enqueueCompletedWorkoutSync(workout, true), undefined);
  });
});
