import { buildBackupJson } from './backup';

export type SaveBackupResult = 'saved' | 'cancelled';

export function getBackupFilename(date: Date = new Date()): string {
  return `lifts-backup-${date.toISOString().slice(0, 10)}.json`;
}

export async function saveBackupToFiles(): Promise<SaveBackupResult> {
  const json = await buildBackupJson();
  const filename = getBackupFilename();
  const { Platform } = await import('react-native');

  if (Platform.OS === 'web') {
    const { saveBackupJson } = await import('./saveBackup.web');
    return saveBackupJson(json, filename);
  }

  const { saveBackupJson } = await import('./saveBackup.native');
  return saveBackupJson(json, filename);
}
