import type { Store } from '../database/contract';
import type { Workout } from '../types';
import type { HealthProvider, HealthSyncRecord } from './contract';
import { fingerprintHealthPayload } from './fingerprint';
import { toHealthWorkoutPayload } from './mapper';

const inFlight = new Map<string, Promise<HealthSyncRecord | null>>();

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, 500);
}

function logError(message: string, error: unknown): void {
  console.error(message, error);
}

async function saveRecord(store: Store, record: HealthSyncRecord): Promise<boolean> {
  try {
    await store.saveHealthSyncRecord(record);
    return true;
  } catch (error) {
    logError('Unable to persist health sync record', error);
    return false;
  }
}

async function syncOnce(
  store: Store,
  workout: Workout,
  provider: HealthProvider,
  now: string,
): Promise<HealthSyncRecord | null> {
  const payload = toHealthWorkoutPayload(workout);
  const payloadFingerprint = fingerprintHealthPayload(payload);

  let existing: HealthSyncRecord | null;
  try {
    existing = await store.getHealthSyncRecord(workout.id, provider.id);
  } catch (error) {
    logError('Unable to read health sync record', error);
    return null;
  }

  if (existing?.status === 'synced') return existing;
  if (existing && existing.payloadFingerprint !== payloadFingerprint) return existing;

  const pending: HealthSyncRecord = {
    workoutId: workout.id,
    provider: provider.id,
    payloadFingerprint,
    status: 'pending',
    attemptedAt: now,
  };
  await saveRecord(store, pending);

  try {
    await provider.writeStrengthWorkout(payload);
  } catch (error) {
    const failed: HealthSyncRecord = {
      ...pending,
      status: 'failed',
      lastError: errorText(error),
    };
    await saveRecord(store, failed);
    return failed;
  }

  const synced: HealthSyncRecord = {
    ...pending,
    status: 'synced',
    syncedAt: now,
  };
  await saveRecord(store, synced);
  return synced;
}

export function syncWorkoutWithProvider(
  store: Store,
  workout: Workout,
  provider: HealthProvider | null,
  now: string = new Date().toISOString(),
): Promise<HealthSyncRecord | null> {
  if (!provider) return Promise.resolve(null);

  const key = `${provider.id}:${workout.id}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const current = syncOnce(store, workout, provider, now);
  const tracked = current.finally(() => {
    if (inFlight.get(key) === tracked) inFlight.delete(key);
  });
  inFlight.set(key, tracked);

  return tracked;
}

export async function retryHealthSyncs(
  store: Store,
  provider: HealthProvider,
  now: string = new Date().toISOString(),
): Promise<HealthSyncRecord[]> {
  let records: HealthSyncRecord[];
  try {
    const [pending, failed] = await Promise.all([
      store.getHealthSyncRecords('pending'),
      store.getHealthSyncRecords('failed'),
    ]);
    records = [...pending, ...failed];
  } catch (error) {
    logError('Unable to list health sync records', error);
    return [];
  }

  const results: HealthSyncRecord[] = [];
  for (const record of records.filter((item) => item.provider === provider.id)) {
    let workout: Workout | null;
    try {
      workout = await store.getWorkoutDetail(record.workoutId);
    } catch (error) {
      logError('Unable to load workout for health sync retry', error);
      continue;
    }
    if (!workout) continue;

    try {
      const result = await syncWorkoutWithProvider(store, workout, provider, now);
      if (result) results.push(result);
    } catch (error) {
      logError('Unable to retry health sync', error);
    }
  }

  return results;
}
