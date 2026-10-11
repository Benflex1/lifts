import { EXERCISE_TRACKING_TYPES_KEY } from '../workout/tracking';
import { DELOAD_WORKOUTS_KEY, ROUTINE_PROGRAMS_KEY } from '../workout/programs';

export function parseGymTrackingEnabled(value: string | null): boolean {
  return value !== 'false';
}

export function parseHealthSyncEnabled(value: string | null, platform: string = 'native'): boolean {
  return platform !== 'web' && value === 'true';
}

export function parseRemoteExerciseImagesEnabled(value: string | null): boolean {
  return value !== 'false';
}

// Per-device preferences: never exported in backups and never overwritten by a restore.
const DEVICE_LOCAL_SETTING_KEYS = new Set(['health_sync_enabled', 'remote_exercise_images']);

export function isDeviceLocalSetting(key: string): boolean {
  return DEVICE_LOCAL_SETTING_KEYS.has(key);
}

// Keys that never go into a backup file and are never imported from one: device-local preferences and app internals.
export function isBackupExcludedSetting(key: string): boolean {
  return (
    isDeviceLocalSetting(key) ||
    key.startsWith('schema_') ||
    key.startsWith('writer_') ||
    key.startsWith('migration_') ||
    key.startsWith('automatic_backup_')
  );
}

// Settings holding per-item maps: a restore merges them (see restore.ts) and writes the merged value.
const MERGED_ON_RESTORE_KEYS = new Set([EXERCISE_TRACKING_TYPES_KEY, ROUTINE_PROGRAMS_KEY, DELOAD_WORKOUTS_KEY]);

export function isMergedOnRestore(key: string): boolean {
  return MERGED_ON_RESTORE_KEYS.has(key);
}
