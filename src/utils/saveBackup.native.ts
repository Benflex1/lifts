import type { SaveBackupResult } from './saveBackup';
import type { WritingOptions } from 'expo-file-system/legacy';

export interface AndroidBackupFileSystem {
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: () => Promise<{
      granted: boolean;
      directoryUri?: string;
    }>;
    createFileAsync: (parentUri: string, fileName: string, mimeType: string) => Promise<string>;
    writeAsStringAsync: (
      uri: string,
      contents: string,
      options?: WritingOptions
    ) => Promise<void>;
  };
  EncodingType: { UTF8: WritingOptions['encoding'] };
}

export interface IosBackupFileSystem {
  cacheDirectory: string | null;
  EncodingType: { UTF8: WritingOptions['encoding'] };
  writeAsStringAsync: (
    uri: string,
    contents: string,
    options?: WritingOptions
  ) => Promise<void>;
}

export interface IosSharing {
  isAvailableAsync: () => Promise<boolean>;
  shareAsync: (
    uri: string,
    options?: { mimeType?: string; dialogTitle?: string }
  ) => Promise<void>;
}

export async function saveBackupToAndroid(
  json: string,
  filename: string,
  fileSystem: AndroidBackupFileSystem
): Promise<SaveBackupResult> {
  const permission = await fileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted || !permission.directoryUri) {
    return 'cancelled';
  }

  const filenameWithoutExtension = filename.replace(/\.json$/i, '');
  const fileUri = await fileSystem.StorageAccessFramework.createFileAsync(
    permission.directoryUri,
    filenameWithoutExtension,
    'application/json'
  );
  await fileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, json, {
    encoding: fileSystem.EncodingType.UTF8,
  });
  return 'saved';
}

export async function saveBackupToIos(
  json: string,
  filename: string,
  fileSystem: IosBackupFileSystem,
  sharing: IosSharing
): Promise<SaveBackupResult> {
  if (!fileSystem.cacheDirectory) {
    throw new Error('Temporary file storage is unavailable');
  }
  if (!(await sharing.isAvailableAsync())) {
    throw new Error('File sharing is unavailable on this device');
  }

  const cacheDirectory = fileSystem.cacheDirectory.endsWith('/')
    ? fileSystem.cacheDirectory
    : `${fileSystem.cacheDirectory}/`;
  const fileUri = `${cacheDirectory}${filename}`;
  await fileSystem.writeAsStringAsync(fileUri, json, {
    encoding: fileSystem.EncodingType.UTF8,
  });
  await sharing.shareAsync(fileUri, {
    mimeType: 'application/json',
    dialogTitle: 'Save Lifts backup',
  });
  return 'saved';
}

export async function saveBackupJson(json: string, filename: string): Promise<SaveBackupResult> {
  const { Platform } = await import('react-native');
  const FileSystem = await import('expo-file-system/legacy');

  if (Platform.OS === 'android') {
    return saveBackupToAndroid(json, filename, FileSystem);
  }

  const Sharing = await import('expo-sharing');
  return saveBackupToIos(json, filename, FileSystem, Sharing);
}
