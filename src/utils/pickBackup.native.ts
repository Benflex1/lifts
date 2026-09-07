import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { MAX_BACKUP_SIZE_BYTES } from './backup';

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

  const content = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (content.length > MAX_BACKUP_SIZE_BYTES) {
    throw new Error('Backup file exceeds the 50 MiB size limit');
  }

  return content;
}
