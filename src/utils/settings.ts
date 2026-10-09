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
