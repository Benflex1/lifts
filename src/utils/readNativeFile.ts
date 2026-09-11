export interface ReadNativeFileOptions {
  maxSizeBytes?: number;
  fileSystem?: {
    readAsStringAsync: (
      uri: string,
      options?: { encoding?: any }
    ) => Promise<string>;
    EncodingType?: { UTF8: any };
  };
  fetchFn?: typeof fetch;
  fileConstructor?: new (uri: string) => { text: () => Promise<string> };
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
  options: ReadNativeFileOptions = {}
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
        throw new Error(`File exceeds the ${Math.round(maxSizeBytes / (1024 * 1024))} MiB size limit`);
      }
      return content;
    }
  } catch (err: any) {
    if (err?.message?.includes('size limit')) {
      throw err;
    }
    lastError = err;
  }

  // Strategy 2: React Native fetch(uri) -> ContentResolver stream
  if (fetchFn) {
    try {
      const response = await fetchFn(uri);
      if (response.ok || (response as any).status === 0) {
        let content: string | null = null;

        if (typeof response.text === 'function') {
          content = await response.text();
        } else if (typeof (response as any).blob === 'function') {
          const blob = await (response as any).blob();
          if (typeof blob.text === 'function') {
            content = await blob.text();
          } else if (typeof FileReader !== 'undefined') {
            content = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
              reader.readAsText(blob);
            });
          }
        }

        if (typeof content === 'string') {
          if (maxSizeBytes !== undefined && content.length > maxSizeBytes) {
            throw new Error(`File exceeds the ${Math.round(maxSizeBytes / (1024 * 1024))} MiB size limit`);
          }
          return content;
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('size limit')) {
        throw err;
      }
      lastError = err;
    }
  }

  // Strategy 3: Modern expo-file-system File(uri).text()
  try {
    let TargetFile = fileConstructor;
    if (!TargetFile) {
      const modernFs = await import('expo-file-system');
      TargetFile = modernFs.File as any;
    }
    if (TargetFile) {
      const fileInstance = new TargetFile(uri);
      if (typeof fileInstance.text === 'function') {
        const content = await fileInstance.text();
        if (typeof content === 'string') {
          if (maxSizeBytes !== undefined && content.length > maxSizeBytes) {
            throw new Error(`File exceeds the ${Math.round(maxSizeBytes / (1024 * 1024))} MiB size limit`);
          }
          return content;
        }
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('size limit')) {
      throw err;
    }
    lastError = err;
  }

  throw new Error(
    lastError?.message
      ? `Unable to read file: ${lastError.message}`
      : `Unable to read file at ${uri}`
  );
}
