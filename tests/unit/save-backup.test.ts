import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { getBackupFilename } from '../../src/utils/saveBackup';
import {
  AndroidBackupFileSystem,
  IosBackupFileSystem,
  IosSharing,
  saveBackupToAndroid,
  saveBackupToIos,
} from '../../src/utils/saveBackup.native';

const backupJson = '{"version":2,"workouts":[]}';

describe('backup file saving', () => {
  it('builds a predictable date-stamped backup filename', () => {
    assert.equal(
      getBackupFilename(new Date('2026-09-10T12:00:00.000Z')),
      'lifts-backup-2026-09-10.json'
    );
  });

  it('returns cancelled without creating a file when Android directory access is declined', async () => {
    let created = false;
    let written = false;
    const fileSystem: AndroidBackupFileSystem = {
      StorageAccessFramework: {
        requestDirectoryPermissionsAsync: async () => ({ granted: false, directoryUri: '' }),
        createFileAsync: async () => {
          created = true;
          return 'content://unused';
        },
        writeAsStringAsync: async () => {
          written = true;
        },
      },
      EncodingType: { UTF8: 'utf8' },
    };

    const result = await saveBackupToAndroid(
      backupJson,
      'lifts-backup-2026-09-10.json',
      fileSystem
    );

    assert.equal(result, 'cancelled');
    assert.equal(created, false);
    assert.equal(written, false);
  });

  it('creates and writes the backup inside the Android directory selected by the user', async () => {
    const calls: Array<{ type: string; args: unknown[] }> = [];
    const fileSystem: AndroidBackupFileSystem = {
      StorageAccessFramework: {
        requestDirectoryPermissionsAsync: async () => ({
          granted: true,
          directoryUri: 'content://tree/downloads',
        }),
        createFileAsync: async (...args) => {
          calls.push({ type: 'create', args });
          return 'content://document/backup.json';
        },
        writeAsStringAsync: async (...args) => {
          calls.push({ type: 'write', args });
        },
      },
      EncodingType: { UTF8: 'utf8' },
    };

    const result = await saveBackupToAndroid(
      backupJson,
      'lifts-backup-2026-09-10.json',
      fileSystem
    );

    assert.equal(result, 'saved');
    assert.deepEqual(calls, [
      {
        type: 'create',
        args: ['content://tree/downloads', 'lifts-backup-2026-09-10', 'application/json'],
      },
      {
        type: 'write',
        args: ['content://document/backup.json', backupJson, { encoding: 'utf8' }],
      },
    ]);
  });

  it('writes the iOS backup to cache and opens the Files-capable share destination', async () => {
    const writes: unknown[][] = [];
    const shares: unknown[][] = [];
    const fileSystem: IosBackupFileSystem = {
      cacheDirectory: 'file:///cache/',
      EncodingType: { UTF8: 'utf8' },
      writeAsStringAsync: async (...args) => {
        writes.push(args);
      },
    };
    const sharing: IosSharing = {
      isAvailableAsync: async () => true,
      shareAsync: async (...args) => {
        shares.push(args);
      },
    };

    const result = await saveBackupToIos(
      backupJson,
      'lifts-backup-2026-09-10.json',
      fileSystem,
      sharing
    );

    assert.equal(result, 'saved');
    assert.deepEqual(writes, [
      ['file:///cache/lifts-backup-2026-09-10.json', backupJson, { encoding: 'utf8' }],
    ]);
    assert.deepEqual(shares, [
      [
        'file:///cache/lifts-backup-2026-09-10.json',
        { mimeType: 'application/json', dialogTitle: 'Save Lifts backup' },
      ],
    ]);
  });
});
