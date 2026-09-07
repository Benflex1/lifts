import type { WorkoutHistorySummary, Routine, Exercise } from '../types';
import { buildBackupJson as buildV2BackupJson } from './backup';

export interface BackupData {
  version: number;
  exportedAt: string;
  workouts: WorkoutHistorySummary[];
  routines: Routine[];
  exercises: Exercise[];
  settings: Record<string, string>;
}

export function shapeBackup(
  workouts: WorkoutHistorySummary[],
  routines: Routine[],
  exercises: Exercise[],
  settings: Record<string, string>
): string {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts,
    routines,
    exercises,
    settings,
  }, null, 2);
}

export async function buildBackupJson(): Promise<string> {
  return buildV2BackupJson();
}

export async function exportBackup(): Promise<void> {
  const json = await buildBackupJson();
  const { Platform } = await import('react-native');
  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifts-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const FileSystem = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');
  const uri = (FileSystem.documentDirectory || '') + `lifts-backup-${new Date().toISOString().slice(0, 10)}.json`;
  await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri);
}
