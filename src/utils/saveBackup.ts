import { buildBackupJson } from './backup';

import { getBackupFilename, type SaveBackupResult } from './saveBackupCommon';

export { getBackupFilename, type SaveBackupResult };

export async function saveBackupToFiles(): Promise<SaveBackupResult> {
  const json = await buildBackupJson();
  const filename = getBackupFilename();
  if (typeof document !== 'undefined') {
    const { saveBackupJson } = await import('./saveBackup.web');
    return saveBackupJson(json, filename);
  }

  const { saveBackupJson } = await import('./saveBackup.native');
  return saveBackupJson(json, filename);
}

// Node/test fallback; Metro resolves the native/web variants for the app.
export { saveBackupJson } from './saveBackup.web';
