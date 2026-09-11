import { Platform } from 'react-native';

export async function pickCsvFile(): Promise<{ name: string; content: string } | null> {
  if (Platform.OS === 'web') {
    const { pickCsvFile: pickWeb } = await import('./pickCsv.web');
    return pickWeb();
  }
  const { pickCsvFile: pickNative } = await import('./pickCsv.native');
  return pickNative();
}
