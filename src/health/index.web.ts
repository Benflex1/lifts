import type { HealthProvider, HealthSyncRecord } from './contract';

export async function getPlatformHealthProvider(): Promise<HealthProvider | null> {
  return null;
}

export async function retryPendingHealthSyncs(): Promise<HealthSyncRecord[]> {
  return [];
}
