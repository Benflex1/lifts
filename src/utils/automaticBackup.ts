import { Platform } from 'react-native';
import { getSetting, setSetting } from '../database/db';
import { buildBackupJson, MAX_BACKUP_SIZE_BYTES } from './backup';
import { backupTimestampFromUri } from './automaticBackupNames';

const DIRECTORY_KEY = 'automatic_backup_directory_uri';
const ENABLED_KEY = 'automatic_backup_enabled';
const LAST_SUCCESS_KEY = 'automatic_backup_last_success_at';
const LAST_ERROR_KEY = 'automatic_backup_last_error';
const RETAINED_BACKUPS = 10;

export interface AutomaticBackupState {
  directoryUri: string | null;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export async function getAutomaticBackupState(): Promise<AutomaticBackupState> {
  const [directoryUri, enabled, lastSuccessAt, lastError] = await Promise.all([
    getSetting(DIRECTORY_KEY),
    getSetting(ENABLED_KEY),
    getSetting(LAST_SUCCESS_KEY),
    getSetting(LAST_ERROR_KEY),
  ]);

  return {
    directoryUri,
    enabled: enabled === 'true',
    lastSuccessAt,
    lastError,
  };
}

export async function chooseAutomaticBackupFolder(initialUri?: string | null): Promise<string | null> {
  if (Platform.OS !== 'android') {
    throw new Error('Automatic folder backups are currently available on Android.');
  }

  const fileSystem = await import('expo-file-system/legacy');
  const result = await fileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
  if (!result.granted || !result.directoryUri) return null;

  await setSetting(DIRECTORY_KEY, result.directoryUri);
  await setSetting(LAST_ERROR_KEY, '');
  return result.directoryUri;
}

export async function setAutomaticBackupEnabled(enabled: boolean): Promise<void> {
  if (enabled && !(await getSetting(DIRECTORY_KEY))) {
    throw new Error('Choose a backup folder before enabling automatic backups.');
  }
  await setSetting(ENABLED_KEY, enabled ? 'true' : 'false');
}

function getTimestamp(now: Date): string {
  return now.toISOString().replace(/\D/g, '');
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

async function performAutomaticBackup(force: boolean, now: Date): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const state = await getAutomaticBackupState();
  if (!state.directoryUri || (!force && !state.enabled)) return false;

  let createdFileUri: string | null = null;
  let fileWritten = false;
  try {
    const fileSystem = await import('expo-file-system/legacy');
    const storage = fileSystem.StorageAccessFramework;
    const timestamp = getTimestamp(now);
    const fileUri = await storage.createFileAsync(
      state.directoryUri,
      `lifts-backup-${timestamp}`,
      'application/json',
    );
    createdFileUri = fileUri;

    const json = await buildBackupJson();
    if (json.length > MAX_BACKUP_SIZE_BYTES) {
      throw new Error('Backup exceeds the 50 MiB restore limit.');
    }
    await storage.writeAsStringAsync(fileUri, json, {
      encoding: fileSystem.EncodingType.UTF8,
    });
    fileWritten = true;
    await setSetting(LAST_SUCCESS_KEY, now.toISOString());

    const backupUris = (await storage.readDirectoryAsync(state.directoryUri))
      .map((uri) => ({ uri, timestamp: backupTimestampFromUri(uri) }))
      .filter((item): item is { uri: string; timestamp: string } => item.timestamp !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    for (const backup of backupUris.slice(RETAINED_BACKUPS)) {
      await storage.deleteAsync(backup.uri);
    }

    await setSetting(LAST_ERROR_KEY, '');
    return true;
  } catch (error) {
    if (createdFileUri && !fileWritten) {
      try {
        const fileSystem = await import('expo-file-system/legacy');
        await fileSystem.StorageAccessFramework.deleteAsync(createdFileUri);
      } catch (cleanupError) {
        console.warn('Unable to remove incomplete automatic backup', cleanupError);
      }
    }

    try {
      await setSetting(LAST_ERROR_KEY, errorMessage(error));
    } catch (settingError) {
      console.warn('Unable to save automatic backup error status', settingError);
    }
    throw error;
  }
}

export function runAutomaticBackup(options: { force?: boolean; now?: Date } = {}): Promise<boolean> {
  return performAutomaticBackup(Boolean(options.force), options.now ?? new Date());
}
