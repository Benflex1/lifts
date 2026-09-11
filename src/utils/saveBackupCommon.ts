export type SaveBackupResult = 'saved' | 'cancelled';

export function getBackupFilename(date: Date = new Date()): string {
  return `lifts-backup-${date.toISOString().slice(0, 10)}.json`;
}
