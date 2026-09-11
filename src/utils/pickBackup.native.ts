import * as DocumentPicker from 'expo-document-picker';
import { MAX_BACKUP_SIZE_BYTES } from './backup';
import { readNativeFileAsString } from './readNativeFile';

export async function pickBackupJson(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  if (asset.size !== undefined && asset.size > MAX_BACKUP_SIZE_BYTES) {
    throw new Error('Backup file exceeds the 50 MiB size limit');
  }

  const content = await readNativeFileAsString(asset.uri, {
    maxSizeBytes: MAX_BACKUP_SIZE_BYTES,
  });

  return content;
}
