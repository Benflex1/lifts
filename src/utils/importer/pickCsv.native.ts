import * as DocumentPicker from 'expo-document-picker';
import { readNativeFileAsString } from '../readNativeFile';

const MAX_CSV_SIZE_BYTES = 50 * 1024 * 1024; // 50 MiB

export async function pickCsvFile(): Promise<{ name: string; content: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  if (asset.size !== undefined && asset.size > MAX_CSV_SIZE_BYTES) {
    throw new Error('CSV file exceeds the 50 MiB size limit');
  }

  const content = await readNativeFileAsString(asset.uri, {
    maxSizeBytes: MAX_CSV_SIZE_BYTES,
  });

  return {
    name: asset.name || 'workout_data.csv',
    content,
  };
}
