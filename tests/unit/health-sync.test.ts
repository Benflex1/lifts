import assert from 'node:assert/strict';
import test from 'node:test';

import type { Store } from '../../src/database/contract';
import type {
  HealthProvider,
  HealthProviderId,
  HealthSyncRecord,
} from '../../src/health/contract';
import { syncWorkoutWithProvider, retryHealthSyncs } from '../../src/health/sync';
import {
  enqueueCompletedWorkoutSync,
  retryPendingHealthSyncs,
  syncCompletedWorkout,
} from '../../src/health';
import { fingerprintHealthPayload } from '../../src/health/fingerprint';
import { toHealthWorkoutPayload } from '../../src/health/mapper';
import type { Workout } from '../../src/types';

const workout = (overrides: Partial<Workout> = {}): Workout => ({
  id: 'workout-1',
  name: 'Upper Body',
  gymId: 'gym-1',
  startTime: '2026-09-13T08:00:00.000Z',
  endTime: '2026-09-13T09:15:00.000Z',
  durationSeconds: 4500,
  totalVolumeKg: 100,
  exercises: [],
  ...overrides,
});

function createFakeStore(workouts: Workout[] = []) {
  const records = new Map<string, HealthSyncRecord>();
  const writes: HealthSyncRecord[] = [];
  const details = new Map(workouts.map((item) => [item.id, item]));
  const key = (workoutId: string, provider: HealthProviderId) => `${workoutId}:${provider}`;

  const store = {
    getHealthSyncRecord: async (workoutId: string, provider: HealthProviderId) =>
      records.get(key(workoutId, provider)) ?? null,
    getHealthSyncRecords: async (status?: HealthSyncRecord['status']) =>
      [...records.values()].filter((record) => !status || record.status === status),
    saveHealthSyncRecord: async (record: HealthSyncRecord) => {
      writes.push({ ...record });
      records.set(key(record.workoutId, record.provider), { ...record });
    },
    getWorkoutDetail: async (workoutId: string) => details.get(workoutId) ?? null,
  } as unknown as Store;

  return { store, records, writes, details };
}

function createProvider(
  id: HealthProviderId = 'healthkit',
  write: HealthProvider['writeStrengthWorkout'] = async () => undefined,
) {
  const payloads: Parameters<HealthProvider['writeStrengthWorkout']>[0][] = [];
  return {
    provider: {
      id,
      isAvailable: async () => true,
      requestWriteAuthorization: async () => 'granted' as const,
      writeStrengthWorkout: async (payload) => {
        payloads.push(payload);
        return write(payload);
      },
    } satisfies HealthProvider,
    payloads,
  };
}

const now = '2026-09-13T10:00:00.000Z';

test('does not write a ledger record when no provider is available', async () => {
  const { store, writes } = createFakeStore();

  assert.equal(await syncWorkoutWithProvider(store, workout(), null, now), null);
  assert.equal(writes.length, 0);
});

test('writes pending, exports once, then writes synced', async () => {
  const { store, writes } = createFakeStore();
  const { provider, payloads } = createProvider();

  const result = await syncWorkoutWithProvider(store, workout(), provider, now);

  assert.equal(payloads.length, 1);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].status, 'pending');
  assert.equal(writes[0].attemptedAt, now);
  assert.equal(writes[0].lastError, undefined);
  assert.equal(writes[1].status, 'synced');
  assert.equal(writes[1].syncedAt, now);
  assert.equal(result?.status, 'synced');
});

test('records a bounded readable provider failure without throwing', async () => {
  const { store, writes } = createFakeStore();
  const message = `provider failed: ${'x'.repeat(600)}`;
  const { provider } = createProvider('healthkit', async () => {
    throw new Error(message);
  });

  const result = await syncWorkoutWithProvider(store, workout(), provider, now);

  assert.equal(writes.length, 2);
  assert.equal(writes[0].status, 'pending');
  assert.equal(writes[1].status, 'failed');
  assert.equal(writes[1].lastError?.length, 500);
  assert.match(writes[1].lastError ?? '', /^provider failed:/);
  assert.equal(result?.status, 'failed');
});

test('skips an existing synced record for the same payload', async () => {
  const { store, records } = createFakeStore();
  const { provider, payloads } = createProvider();
  const first = await syncWorkoutWithProvider(store, workout(), provider, now);
  records.set('workout-1:healthkit', first!);

  await syncWorkoutWithProvider(store, workout(), provider, '2026-09-13T11:00:00.000Z');

  assert.equal(payloads.length, 1);
});

test('keeps the v1 no-update policy for a changed synced payload', async () => {
  const { store, records } = createFakeStore();
  const { provider, payloads } = createProvider();
  const first = await syncWorkoutWithProvider(store, workout(), provider, now);
  records.set('workout-1:healthkit', first!);

  await syncWorkoutWithProvider(
    store,
    workout({ name: 'Changed title' }),
    provider,
    '2026-09-13T11:00:00.000Z',
  );

  assert.equal(payloads.length, 1);
});

test('retries pending and failed records with the same fingerprint', async () => {
  const { store, records, writes } = createFakeStore();
  const { provider, payloads } = createProvider();
  const initial = await syncWorkoutWithProvider(store, workout(), provider, now);
  records.set('workout-1:healthkit', { ...initial!, status: 'failed', syncedAt: undefined });
  writes.length = 0;

  const result = await syncWorkoutWithProvider(store, workout(), provider, '2026-09-13T11:00:00.000Z');

  assert.equal(payloads.length, 2);
  assert.equal(writes[0].status, 'pending');
  assert.equal(result?.status, 'synced');
});

test('retries pending and failed ledger rows, skipping missing workouts', async () => {
  const completed = workout({ id: 'completed' });
  const { store, records } = createFakeStore([completed]);
  const { provider, payloads } = createProvider();
  const pending = await syncWorkoutWithProvider(store, completed, provider, now);
  records.set('completed:healthkit', { ...pending!, status: 'pending', syncedAt: undefined });
  records.set('missing:healthkit', {
    ...pending!,
    workoutId: 'missing',
    status: 'failed',
  });

  await retryHealthSyncs(store, provider, '2026-09-13T11:00:00.000Z');

  assert.equal(payloads.length, 2);
  assert.equal(records.get('completed:healthkit')?.status, 'synced');
  assert.equal(records.get('missing:healthkit')?.status, 'failed');
});

test('retries only rows belonging to the selected provider', async () => {
  const completed = workout({ id: 'completed' });
  const { store, records } = createFakeStore([completed]);
  const { provider, payloads } = createProvider('healthkit');
  const initial = await syncWorkoutWithProvider(store, completed, provider, now);
  records.set('completed:healthkit', { ...initial!, status: 'pending', syncedAt: undefined });
  records.set('other:health-connect', {
    ...initial!,
    workoutId: 'other',
    provider: 'health-connect',
    status: 'failed',
  });

  await retryHealthSyncs(store, provider, '2026-09-13T11:00:00.000Z');

  assert.equal(payloads.length, 2);
  assert.equal(records.get('other:health-connect')?.status, 'failed');
});

test('continues retrying later rows when an eligible workout cannot be mapped', async () => {
  const invalid = workout({
    id: 'invalid',
    endTime: '2026-09-13T07:00:00.000Z',
  });
  const valid = workout({ id: 'valid' });
  const { store, records } = createFakeStore([invalid, valid]);
  const { provider, payloads } = createProvider();

  records.set('invalid:healthkit', {
    workoutId: 'invalid',
    provider: 'healthkit',
    payloadFingerprint: 'invalid-fingerprint',
    status: 'failed',
    attemptedAt: now,
  });
  records.set('valid:healthkit', {
    workoutId: 'valid',
    provider: 'healthkit',
    payloadFingerprint: fingerprintHealthPayload(toHealthWorkoutPayload(valid)),
    status: 'failed',
    attemptedAt: now,
  });

  const results = await retryHealthSyncs(store, provider, '2026-09-13T11:00:00.000Z');

  assert.equal(payloads.length, 1);
  assert.deepEqual(results.map((result) => [result.workoutId, result.status]), [['valid', 'synced']]);
  assert.equal(records.get('invalid:healthkit')?.status, 'failed');
  assert.equal(records.get('valid:healthkit')?.status, 'synced');
});

test('does not call the provider when the pending marker cannot be persisted', async () => {
  const { store } = createFakeStore();
  const { provider, payloads } = createProvider();
  store.saveHealthSyncRecord = async () => {
    throw new Error('storage unavailable');
  };

  const result = await syncWorkoutWithProvider(store, workout(), provider, now);

  assert.equal(result, null);
  assert.equal(payloads.length, 0);
});

test('keeps final ledger persistence best-effort after the provider writes', async () => {
  const { store, writes } = createFakeStore();
  const { provider, payloads } = createProvider();
  let saveCount = 0;
  store.saveHealthSyncRecord = async (record) => {
    saveCount += 1;
    if (saveCount === 2) throw new Error('final storage unavailable');
    writes.push({ ...record });
  };

  const result = await syncWorkoutWithProvider(store, workout(), provider, now);

  assert.equal(result?.status, 'synced');
  assert.equal(payloads.length, 1);
  assert.equal(writes.length, 1);
});

test('serializes concurrent calls for the same workout and provider', async () => {
  const { store } = createFakeStore();
  let active = 0;
  let maxActive = 0;
  const { provider, payloads } = createProvider('healthkit', async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
  });

  await Promise.all([
    syncWorkoutWithProvider(store, workout(), provider, now),
    syncWorkoutWithProvider(store, workout(), provider, now),
  ]);

  assert.equal(maxActive, 1);
  assert.equal(payloads.length, 1);
});

test('enqueue helper guards disabled sync and invokes enabled sync synchronously', () => {
  let calls = 0;
  const sync = async () => {
    calls += 1;
  };

  enqueueCompletedWorkoutSync(workout(), false, sync);
  assert.equal(calls, 0);
  enqueueCompletedWorkoutSync(workout(), true, sync);
  assert.equal(calls, 1);
});

test('public wrappers safely no-op without a native provider', async () => {
  assert.equal(await syncCompletedWorkout(workout()), null);
  assert.deepEqual(await retryPendingHealthSyncs(), []);
});
