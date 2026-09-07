import { Platform } from 'react-native';

export async function pickBackupJson(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const { pickBackupJson: pickWeb } = await import('./pickBackup.web');
    return pickWeb();
  }
  const { pickBackupJson: pickNative } = await import('./pickBackup.native');
  return pickNative();
}
