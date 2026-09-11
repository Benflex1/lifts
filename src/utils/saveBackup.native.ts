import { buildBackupJson } from './backup';
import { getBackupFilename, type SaveBackupResult } from './saveBackupCommon';
import type { WritingOptions } from 'expo-file-system/legacy';

export { getBackupFilename, type SaveBackupResult };

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

export async function saveBackupAndroidWithFallback(
  json: string,
  filename: string,
  fileSystem: Partial<AndroidBackupFileSystem> & IosBackupFileSystem,
  sharing: IosSharing
): Promise<SaveBackupResult> {
  try {
    if (
      fileSystem.StorageAccessFramework &&
      typeof fileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync === 'function'
    ) {
      return await saveBackupToAndroid(
        json,
        filename,
        fileSystem as AndroidBackupFileSystem
      );
    }
  } catch (safErr) {
    console.warn('StorageAccessFramework failed, falling back to share sheet:', safErr);
  }
  return saveBackupToIos(json, filename, fileSystem, sharing);
}

function getPlatformOS(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    return rn?.Platform?.OS || 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function saveBackupJson(json: string, filename: string): Promise<SaveBackupResult> {
  const FileSystem = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');

  if (getPlatformOS() === 'android') {
    return saveBackupAndroidWithFallback(json, filename, FileSystem as any, Sharing);
  }

  return saveBackupToIos(json, filename, FileSystem, Sharing);
}

export async function saveBackupToFiles(): Promise<SaveBackupResult> {
  const json = await buildBackupJson();
  const filename = getBackupFilename();
  return saveBackupJson(json, filename);
}
