import type { Workout } from '../types';
import type { HealthProvider, HealthSyncRecord } from './contract';

export async function getPlatformHealthProvider(): Promise<HealthProvider | null> {
  return null;
}

export async function retryPendingHealthSyncs(): Promise<HealthSyncRecord[]> {
  return [];
}

export async function syncCompletedWorkout(_workout: Workout): Promise<HealthSyncRecord | null> {
  return null;
}

export function enqueueCompletedWorkoutSync(
  _workout: Workout,
  _enabled: boolean,
  _sync?: (workout: Workout) => Promise<unknown>,
): void {}
