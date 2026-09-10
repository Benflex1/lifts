import type { SaveBackupResult } from './saveBackup';

export function saveBackupJson(json: string, filename: string): SaveBackupResult {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('Browser file downloads are unavailable');
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return 'saved';
}
