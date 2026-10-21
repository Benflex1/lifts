import assert from 'node:assert/strict';
import test from 'node:test';

function mockModule(specifier: string, exports: Record<string, unknown>): void {
  const filename = require.resolve(specifier);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  } as NodeJS.Module;
}

const platform = { OS: 'android' as string };

interface StorageMock {
  createFileAsyncCalls: Array<[string, string, string]>;
  writeCalls: Array<[string, string, unknown]>;
  deleteCalls: string[];
  directoryEntries: string[];
  failWrite: boolean;
  createdFileUri: string;
}

function createStorage(): StorageMock {
  return {
    createFileAsyncCalls: [],
    writeCalls: [],
    deleteCalls: [],
    directoryEntries: [],
    failWrite: false,
    createdFileUri: 'content://backups/lifts-backup-20260101000000000',
  };
}

const storage = createStorage();
const settings = new Map<string, string>();

const fakeFileSystem = {
  EncodingType: { UTF8: 'utf8' },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: async (initialUri?: string | null) => ({
      granted: settings.get('grant-folder') === 'yes',
      directoryUri: settings.get('granted-directory') ?? initialUri ?? null,
    }),
    createFileAsync: async (directoryUri: string, name: string, mime: string) => {
      storage.createFileAsyncCalls.push([directoryUri, name, mime]);
      return storage.createdFileUri;
    },
    writeAsStringAsync: async (uri: string, content: string, options: unknown) => {
      if (storage.failWrite) throw new Error('disk full');
      storage.writeCalls.push([uri, content, options]);
    },
    readDirectoryAsync: async () => storage.directoryEntries,
    deleteAsync: async (uri: string) => {
      storage.deleteCalls.push(uri);
    },
  },
};

mockModule('react-native', { Platform: platform });
mockModule('../../src/database/db', {
  getSetting: async (key: string) => settings.get(key) ?? null,
  setSetting: async (key: string, value: string) => {
    settings.set(key, value);
  },
});
mockModule('../../src/utils/backup', {
  buildBackupJson: async () => '{"version":3,"workouts":[]}',
  MAX_BACKUP_SIZE_BYTES: 50 * 1024 * 1024,
});

const withFileSystem = { fileSystem: fakeFileSystem as never };

test('automatic backup state reflects persisted settings (PROD-02)', async () => {
  const { getAutomaticBackupState } = await import('../../src/utils/automaticBackup');
  settings.clear();
  settings.set('automatic_backup_enabled', 'true');
  settings.set('automatic_backup_directory_uri', 'content://folder');
  settings.set('automatic_backup_last_success_at', '2026-10-18T10:00:00.000Z');
  settings.set('automatic_backup_last_error', 'previous failure');

  const state = await getAutomaticBackupState();
  assert.deepEqual(state, {
    directoryUri: 'content://folder',
    enabled: true,
    lastSuccessAt: '2026-10-18T10:00:00.000Z',
    lastError: 'previous failure',
  });
});

test('enabling automatic backups requires a chosen folder (PROD-02)', async () => {
  const { setAutomaticBackupEnabled } = await import('../../src/utils/automaticBackup');
  settings.clear();

  await assert.rejects(
    () => setAutomaticBackupEnabled(true),
    /Choose a backup folder before enabling automatic backups/,
  );

  settings.set('automatic_backup_directory_uri', 'content://folder');
  await setAutomaticBackupEnabled(true);
  assert.equal(settings.get('automatic_backup_enabled'), 'true');

  await setAutomaticBackupEnabled(false);
  assert.equal(settings.get('automatic_backup_enabled'), 'false');
});

test('folder picking is Android-only and persists the granted folder (PROD-02)', async () => {
  const { chooseAutomaticBackupFolder } = await import('../../src/utils/automaticBackup');
  settings.clear();

  platform.OS = 'ios';
  await assert.rejects(() => chooseAutomaticBackupFolder(undefined, withFileSystem), /Android/);

  platform.OS = 'android';
  assert.equal(
    await chooseAutomaticBackupFolder(undefined, withFileSystem),
    null,
    'denied permission returns null',
  );

  settings.set('grant-folder', 'yes');
  settings.set('granted-directory', 'content://granted');
  assert.equal(await chooseAutomaticBackupFolder(undefined, withFileSystem), 'content://granted');
  assert.equal(settings.get('automatic_backup_directory_uri'), 'content://granted');
  assert.equal(settings.get('automatic_backup_last_error'), '');
});

test('automatic backups write a backup and prune to the newest ten (PROD-02)', async () => {
  const { runAutomaticBackup } = await import('../../src/utils/automaticBackup');
  settings.clear();
  Object.assign(storage, createStorage());
  platform.OS = 'android';

  settings.set('automatic_backup_directory_uri', 'content://folder');
  settings.set('automatic_backup_enabled', 'true');

  const existing = Array.from({ length: 12 }, (_, index) => {
    const timestamp = `202601${String(index + 1).padStart(2, '0')}000000000`;
    return `content://folder/lifts-backup-${timestamp}.json`;
  });
  const junk = 'content://folder/not-a-backup.json';
  storage.directoryEntries = [junk, ...existing];

  const now = new Date('2026-10-18T12:00:00.000Z');
  assert.equal(await runAutomaticBackup({ now, ...withFileSystem }), true);

  assert.equal(storage.createFileAsyncCalls.length, 1);
  assert.equal(storage.createFileAsyncCalls[0][0], 'content://folder');
  assert.match(storage.createFileAsyncCalls[0][1], /^lifts-backup-\d{17}$/);
  assert.equal(storage.writeCalls.length, 1);
  assert.equal(storage.writeCalls[0][1], '{"version":3,"workouts":[]}');

  assert.equal(storage.deleteCalls.length, 2, 'only the two oldest canonical backups are removed');
  assert.deepEqual(
    [...storage.deleteCalls].sort(),
    [existing[0], existing[1]].sort(),
    'the two oldest canonical backups are removed',
  );
  assert.ok(!storage.deleteCalls.includes(junk), 'non-backup files are never deleted');

  assert.equal(settings.get('automatic_backup_last_success_at'), now.toISOString());
  assert.equal(settings.get('automatic_backup_last_error'), '');
});

test('automatic backups skip when disabled unless forced (PROD-02)', async () => {
  const { runAutomaticBackup } = await import('../../src/utils/automaticBackup');
  settings.clear();
  Object.assign(storage, createStorage());

  settings.set('automatic_backup_directory_uri', 'content://folder');
  assert.equal(await runAutomaticBackup(withFileSystem), false);
  assert.equal(storage.writeCalls.length, 0);

  assert.equal(await runAutomaticBackup({ force: true, ...withFileSystem }), true);
  assert.equal(storage.writeCalls.length, 1);
});

test('failed writes remove the partial file and record the error (PROD-02)', async () => {
  const { runAutomaticBackup } = await import('../../src/utils/automaticBackup');
  settings.clear();
  Object.assign(storage, createStorage());
  storage.failWrite = true;

  settings.set('automatic_backup_directory_uri', 'content://folder');
  settings.set('automatic_backup_enabled', 'true');

  await assert.rejects(() => runAutomaticBackup(withFileSystem), /disk full/);
  assert.deepEqual(storage.deleteCalls, [storage.createdFileUri]);
  assert.equal(settings.get('automatic_backup_last_error'), 'disk full');
});
