import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { readNativeFileAsString } from '../../src/utils/readNativeFile';

describe('readNativeFileAsString', () => {
  it('reads content using FileSystem legacy when available', async () => {
    const mockFs = {
      readAsStringAsync: async (uri: string) => `content-from-fs-${uri}`,
      EncodingType: { UTF8: 'utf8' },
    };

    const content = await readNativeFileAsString('file:///path/to/workout.csv', {
      fileSystem: mockFs,
    });

    assert.equal(content, 'content-from-fs-file:///path/to/workout.csv');
  });

  it('falls back to fetch when FileSystem throws "Location ... isn\'t readable" on Android content:// URI', async () => {
    const contentUri = 'content://com.android.externalstorage.documents/document/primary:Download/lyfta.csv';

    const mockFs = {
      readAsStringAsync: async () => {
        throw new Error(`Location '${contentUri}' isn't readable.`);
      },
      EncodingType: { UTF8: 'utf8' },
    };

    const mockFetch: typeof fetch = async (input: any) => {
      assert.equal(input, contentUri);
      return {
        ok: true,
        status: 200,
        text: async () => 'Date,Workout Name,Exercise Name,Set Order,Weight,Reps\n"2024-06-10","Leg Day","Squat",1,100,5',
      } as any;
    };

    const content = await readNativeFileAsString(contentUri, {
      fileSystem: mockFs,
      fetchFn: mockFetch,
    });

    assert.ok(content.includes('Leg Day'));
    assert.ok(content.includes('Squat'));
  });

  it('falls back to modern expo-file-system File constructor when both FS legacy and fetch fail', async () => {
    const mockFs = {
      readAsStringAsync: async () => {
        throw new Error('legacy fs failed');
      },
      EncodingType: { UTF8: 'utf8' },
    };

    const mockFetch: typeof fetch = async () => {
      throw new Error('fetch failed');
    };

    class MockModernFile {
      uri: string;
      constructor(uri: string) {
        this.uri = uri;
      }
      async text() {
        return 'modern-file-content';
      }
    }

    const content = await readNativeFileAsString('content://example', {
      fileSystem: mockFs,
      fetchFn: mockFetch,
      fileConstructor: MockModernFile as any,
    });

    assert.equal(content, 'modern-file-content');
  });

  it('enforces maximum size limit', async () => {
    const mockFs = {
      readAsStringAsync: async () => 'x'.repeat(100),
      EncodingType: { UTF8: 'utf8' },
    };

    await assert.rejects(
      async () => {
        await readNativeFileAsString('file:///large.csv', {
          fileSystem: mockFs,
          maxSizeBytes: 50,
        });
      },
      /size limit/
    );
  });

  it('throws descriptive error when all read strategies fail', async () => {
    const mockFs = {
      readAsStringAsync: async () => {
        throw new Error("Location 'test.csv' isn't readable.");
      },
      EncodingType: { UTF8: 'utf8' },
    };

    const mockFetch: typeof fetch = async () => {
      throw new Error('Network error');
    };

    await assert.rejects(
      async () => {
        await readNativeFileAsString('test.csv', {
          fileSystem: mockFs,
          fetchFn: mockFetch,
          fileConstructor: class {
            async text() {
              throw new Error('File api error');
            }
          } as any,
        });
      },
      /Unable to read file/
    );
  });
});
