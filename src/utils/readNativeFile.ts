import type { EncodingType } from 'expo-file-system/legacy';
import { errorMessage, toError } from './invariant';

type FileConstructor = new (uri: string) => { text: () => Promise<string> };

export interface ReadNativeFileOptions {
  maxSizeBytes?: number;
  fileSystem?: {
    readAsStringAsync: (
      uri: string,
      options?: { encoding?: EncodingType | 'utf8' | 'base64' },
    ) => Promise<string>;
    EncodingType?: { UTF8: EncodingType };
  };
  fetchFn?: typeof fetch;
  fileConstructor?: FileConstructor;
}

/**
 * Reads text content from a local file URI or Android content:// URI.
 *
 * On Android, FileSystem.readAsStringAsync in expo-file-system/legacy throws:
 * "Location 'content://...' isn't readable"
 * when given single document URIs from external storage / downloads because of
 * strict SAF permission checks.
 *
 * This utility resolves this by:
 * 1. Trying FileSystem.readAsStringAsync first.
 * 2. Falling back to React Native's native fetch(uri), which delegates directly
 *    to Android's ContentResolver using the transient read permission granted by the picker.
 * 3. Falling back to modern expo-file-system File(uri).text().
 */
export async function readNativeFileAsString(
  uri: string,
  options: ReadNativeFileOptions = {},
): Promise<string> {
  const {
    maxSizeBytes,
    fileSystem,
    fetchFn = typeof fetch === 'function' ? fetch : undefined,
    fileConstructor,
  } = options;

  let lastError: Error | null = null;

  // Strategy 1: Standard FileSystem readAsStringAsync
  try {
    const fs = fileSystem || (await import('expo-file-system/legacy'));
    const encoding = fs.EncodingType?.UTF8 ?? 'utf8';
    const content = await fs.readAsStringAsync(uri, { encoding });
    if (typeof content === 'string') {
      if (maxSizeBytes !== undefined && content.length > maxSizeBytes) {
        throw new Error(
          `File exceeds the ${Math.round(maxSizeBytes / (1024 * 1024))} MiB size limit`,
        );
      }
      return content;
    }
  } catch (err: unknown) {
    if (errorMessage(err).includes('size limit')) {
      throw err;
    }
    lastError = toError(err);
  }

  // Strategy 2: React Native fetch(uri) -> ContentResolver stream
  if (fetchFn) {
    try {
      const response = await fetchFn(uri);
      const legacyResponse = response as unknown as {
        status?: number;
        blob?: () => Promise<{ text?: () => Promise<string> }>;
      };
      if (response.ok || legacyResponse.status === 0) {
        let content: string | null = null;

        if (typeof response.text === 'function') {
          content = await response.text();
        } else if (typeof legacyResponse.blob === 'function') {
          const blob = await legacyResponse.blob();
          if (typeof blob.text === 'function') {
            content = await blob.text();
          } else if (typeof FileReader !== 'undefined') {
            content = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
              reader.readAsText(blob as unknown as Blob);
            });
          }
        }

        if (typeof content === 'string') {
          if (maxSizeBytes !== undefined && content.length > maxSizeBytes) {
            throw new Error(
              `File exceeds the ${Math.round(maxSizeBytes / (1024 * 1024))} MiB size limit`,
            );
          }
          return content;
        }
      }
    } catch (err: unknown) {
      if (errorMessage(err).includes('size limit')) {
        throw err;
      }
      lastError = toError(err);
    }
  }

  // Strategy 3: Modern expo-file-system File(uri).text()
  try {
    let TargetFile = fileConstructor;
    if (!TargetFile) {
      const modernFs = await import('expo-file-system');
      TargetFile = modernFs.File as unknown as FileConstructor;
    }
    if (TargetFile) {
      const fileInstance = new TargetFile(uri);
      if (typeof fileInstance.text === 'function') {
        const content = await fileInstance.text();
        if (typeof content === 'string') {
          if (maxSizeBytes !== undefined && content.length > maxSizeBytes) {
            throw new Error(
              `File exceeds the ${Math.round(maxSizeBytes / (1024 * 1024))} MiB size limit`,
            );
          }
          return content;
        }
      }
    }
  } catch (err: unknown) {
    if (errorMessage(err).includes('size limit')) {
      throw err;
    }
    lastError = toError(err);
  }

  throw new Error(
    lastError?.message
      ? `Unable to read file: ${lastError.message}`
      : `Unable to read file at ${uri}`,
  );
}
