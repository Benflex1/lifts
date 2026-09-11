import { buildBackupJson } from './backup';
import { getBackupFilename, type SaveBackupResult } from './saveBackupCommon';

export { getBackupFilename, type SaveBackupResult };

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

export async function saveBackupToFiles(): Promise<SaveBackupResult> {
  const json = await buildBackupJson();
  const filename = getBackupFilename();
  return saveBackupJson(json, filename);
}
