export type HealthProviderId = 'healthkit' | 'health-connect';

export type HealthSyncStatus = 'pending' | 'synced' | 'failed';

export interface HealthWorkoutPayload {
  workoutId: string;
  title: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
}

export interface HealthProvider {
  id: HealthProviderId;
  isAvailable(): Promise<boolean>;
  requestWriteAuthorization(): Promise<'granted' | 'denied' | 'unavailable'>;
  writeStrengthWorkout(payload: HealthWorkoutPayload): Promise<void>;
  openPermissionSettings?: () => void | Promise<void>;
}

export interface HealthSyncRecord {
  workoutId: string;
  provider: HealthProviderId;
  payloadFingerprint: string;
  status: HealthSyncStatus;
  attemptedAt: string;
  syncedAt?: string;
  lastError?: string;
}
