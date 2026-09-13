import type { Store } from "../database/contract";
import type { Workout } from "../types";
import type { HealthProvider } from "./contract";
import type { HealthSyncRecord } from "./contract";
import { syncWorkoutWithProvider, retryHealthSyncs } from "./sync";

export async function getPlatformHealthProvider(): Promise<HealthProvider | null> {
  if (typeof document !== "undefined") {
    const { getPlatformHealthProvider: getWebProvider } =
      await import("./provider.web");
    return getWebProvider();
  }

  const { getPlatformHealthProvider: getNativeProvider } =
    await import("./provider.native");
  return getNativeProvider();
}

async function getHealthStore(): Promise<Store> {
  if (typeof document !== "undefined") {
    const { getStore } = await import("../database/db.web");
    return getStore();
  }

  const { getStore } = await import("../database/db.native");
  return getStore();
}

async function getAvailableProvider(): Promise<HealthProvider | null> {
  const provider = await getPlatformHealthProvider();
  if (!provider) return null;

  try {
    return (await provider.isAvailable()) ? provider : null;
  } catch {
    return null;
  }
}

export async function syncCompletedWorkout(workout: Workout): Promise<HealthSyncRecord | null> {
  const provider = await getAvailableProvider();
  if (!provider) return null;
  const store = await getHealthStore();
  return syncWorkoutWithProvider(store, workout, provider);
}

export async function retryPendingHealthSyncs(): Promise<HealthSyncRecord[]> {
  const provider = await getAvailableProvider();
  if (!provider) return [];
  const store = await getHealthStore();
  return retryHealthSyncs(store, provider);
}

export function enqueueCompletedWorkoutSync(
  workout: Workout,
  enabled: boolean,
  sync: (workout: Workout) => Promise<unknown> = syncCompletedWorkout,
): void {
  if (!enabled) return;
  void sync(workout).catch((error) => {
    console.error("Unable to enqueue health workout sync", error);
  });
}
