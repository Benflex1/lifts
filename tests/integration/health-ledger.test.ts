import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { indexedDB } from 'fake-indexeddb';
import { NodeSqliteDriver } from '../helpers/storeFixture';
import { applyMigrations } from '../../src/database/migrations';
import { createNativeStore } from '../../src/database/nativeStore';
import { createWebStore } from '../../src/database/webStore';
import { HealthSyncRecord } from '../../src/health/contract';
import { Workout } from '../../src/types';
import { buildBackupJson } from '../../src/utils/backup';
import { restoreBackup } from '../../src/utils/restore';

const records: HealthSyncRecord[] = [
  {
    workoutId: 'ledger-pending',
    provider: 'healthkit',
    payloadFingerprint: 'fingerprint-pending',
    status: 'pending',
    attemptedAt: '2026-09-10T08:00:00.000Z',
  },
  {
    workoutId: 'ledger-synced',
    provider: 'health-connect',
    payloadFingerprint: 'fingerprint-synced',
    status: 'synced',
    attemptedAt: '2026-09-10T08:01:00.000Z',
    syncedAt: '2026-09-10T08:02:00.000Z',
  },
  {
    workoutId: 'ledger-failed',
    provider: 'healthkit',
    payloadFingerprint: 'fingerprint-failed',
    status: 'failed',
    attemptedAt: '2026-09-10T08:03:00.000Z',
    lastError: 'Permission was denied',
  },
];

function workout(id: string): Workout {
  return {
    id,
    name: 'Ledger workout',
    gymId: 'gym-default',
    startTime: '2026-09-10T07:00:00.000Z',
    endTime: '2026-09-10T08:00:00.000Z',
    durationSeconds: 3600,
    totalVolumeKg: 0,
    exercises: [],
  };
}

function openVersionTwoFixture(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [storeName, keyPath] of [
        ['exercises', 'id'], ['routines', 'id'], ['workouts', 'id'],
        ['workout_drafts', 'id'], ['settings', 'key'], ['metadata', 'key'],
        ['gyms', 'id'], ['exercise_gym_scopes', 'exerciseId'],
      ] as [string, string][]) {
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath });
      }
      const tx = request.transaction!;
      tx.objectStore('workouts').put({ ...workout('legacy-idb-workout') });
      tx.objectStore('settings').put({ key: 'legacy-setting', value: 'kept' });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

describe('health sync ledger persistence', () => {
  it('creates migration 7 after version 6 and rolls back migration 7 failures', async () => {
    const driver = new NodeSqliteDriver();
    try {
      await applyMigrations(driver, { maxVersion: 6 });
      assert.equal(await driver.getFirstAsync<any>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'health_sync_records'"), null);

      await assert.rejects(() => applyMigrations(driver, { failAtVersion: 7 }), /Injected migration failure at version 7/);
      assert.equal(await driver.getFirstAsync<any>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'health_sync_records'"), null);
      assert.equal(await driver.getFirstAsync<any>('SELECT version FROM schema_migrations WHERE version = 7'), null);

      await applyMigrations(driver);
      assert.ok(await driver.getFirstAsync<any>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'health_sync_records'"));
      assert.ok(await driver.getFirstAsync<any>('SELECT version FROM schema_migrations WHERE version = 7'));
      const columns = await driver.getAllAsync<{ name: string; pk: number }>('PRAGMA table_info(health_sync_records)');
      assert.deepEqual(columns.filter(column => column.pk > 0).map(column => column.name), ['workout_id', 'provider']);
      assert.equal((await driver.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys, 1);

      const indexes = await driver.getAllAsync<{ name: string }>('PRAGMA index_list(health_sync_records)');
      assert.ok(indexes.some(index => index.name === 'health_sync_records_status_idx'));

      const foreignKeys = await driver.getAllAsync<{
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
        on_update: string;
        on_delete: string;
        match: string;
      }>('PRAGMA foreign_key_list(health_sync_records)');
      assert.deepEqual(foreignKeys.map(({ table, from, to, on_delete }) => ({ table, from, to, on_delete })), [{
        table: 'workouts',
        from: 'workout_id',
        to: 'id',
        on_delete: 'CASCADE',
      }]);

      const schema = await driver.getFirstAsync<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'health_sync_records'"
      );
      const normalizedSchema = schema!.sql.replace(/\s+/g, ' ');
      assert.match(normalizedSchema, /CHECK\s*\(provider IN \('healthkit', 'health-connect'\)\)/);
      assert.match(normalizedSchema, /CHECK\s*\(status IN \('pending', 'synced', 'failed'\)\)/);

      await driver.runAsync(
        'INSERT INTO workouts (id, name, start_time, in_progress) VALUES (?, ?, ?, 0)',
        'schema-workout', 'Schema workout', '2026-09-10T07:00:00.000Z'
      );
      const insertLedger = (provider: string, status: string) => driver.runAsync(
        `INSERT INTO health_sync_records
         (workout_id, provider, payload_fingerprint, status, attempted_at)
         VALUES (?, ?, ?, ?, ?)`,
        'schema-workout', provider, 'schema-fingerprint', status, '2026-09-10T08:00:00.000Z'
      );
      await assert.rejects(() => insertLedger('invalid-provider', 'pending'), /CHECK constraint failed/);
      await assert.rejects(() => insertLedger('healthkit', 'invalid-status'), /CHECK constraint failed/);
    } finally {
      driver.close();
    }
  });

  it('persists native records, filters statuses, and cascades deletion', async () => {
    const driver = new NodeSqliteDriver();
    const store = createNativeStore(driver);
    try {
      await store.init();
      for (const record of records) await store.saveCompletedWorkout(workout(record.workoutId));
      for (const record of records) await store.saveHealthSyncRecord(record);
      assert.deepEqual(await store.getHealthSyncRecords(), records);
      assert.deepEqual(await store.getHealthSyncRecords('failed'), [records[2]]);
      assert.deepEqual(await store.getHealthSyncRecord(records[1].workoutId, records[1].provider), records[1]);
      assert.equal(await store.getHealthSyncRecord('missing', 'healthkit'), null);

      await store.deleteWorkout('ledger-pending');
      assert.equal(await store.getHealthSyncRecord('ledger-pending', 'healthkit'), null);
    } finally {
      driver.close();
    }
  });

  it('reopens native records with optional values preserved', async () => {
    const tempFile = path.join(os.tmpdir(), `health-ledger-reopen-${Date.now()}-${Math.random()}.db`);
    const driver = new NodeSqliteDriver(tempFile);
    const store = createNativeStore(driver);
    try {
      await store.init();
      for (const record of records) await store.saveCompletedWorkout(workout(record.workoutId));
      for (const record of records) await store.saveHealthSyncRecord(record);
      driver.close();

      const reopenedDriver = new NodeSqliteDriver(tempFile);
      const reopened = createNativeStore(reopenedDriver);
      try {
        await reopened.init();
        assert.deepEqual(await reopened.getHealthSyncRecords(), records);
      } finally {
        reopenedDriver.close();
      }
    } finally {
      try { driver.close(); } catch (_) {}
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it('upgrades IndexedDB version 2 without losing existing stores or records', async () => {
    const name = `health-ledger-idb-upgrade-${Date.now()}-${Math.random()}`;
    await openVersionTwoFixture(name);
    const store = await createWebStore(name, { idbFactory: indexedDB });
    try {
      await store.init();
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        assert.equal(database.objectStoreNames.contains('health_sync_records'), true);
        const transaction = database.transaction('health_sync_records', 'readonly');
        const healthStore = transaction.objectStore('health_sync_records');
        assert.deepEqual(healthStore.keyPath, ['workoutId', 'provider']);
        assert.equal(healthStore.indexNames.contains('status'), true);
      } finally {
        database.close();
      }
      assert.equal((await store.getWorkoutDetail('legacy-idb-workout'))?.name, 'Ledger workout');
      assert.equal(await store.getSetting('legacy-setting'), 'kept');
      await store.saveHealthSyncRecord(records[0]);
      assert.deepEqual(await store.getHealthSyncRecord(records[0].workoutId, records[0].provider), records[0]);
      assert.deepEqual(await store.getHealthSyncRecords('pending'), [records[0]]);
    } finally {
      await store.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  });

  it('deletes web ledger rows with workouts and excludes ledger data from backups', async () => {
    const name = `health-ledger-backup-${Date.now()}-${Math.random()}`;
    const store = await createWebStore(name, { idbFactory: indexedDB });
    try {
      await store.init();
      await store.saveCompletedWorkout(workout('ledger-backup'));
      await store.saveHealthSyncRecord({ ...records[0], workoutId: 'ledger-backup' });
      const snapshot = await store.readSnapshot();
      assert.equal('healthSyncRecords' in snapshot, false);
      const backup = JSON.parse(await buildBackupJson(store));
      assert.equal('healthSyncRecords' in backup, false);

      const destinationName = `${name}-destination`;
      const destination = await createWebStore(destinationName, { idbFactory: indexedDB });
      try {
        await destination.init();
        await destination.saveCompletedWorkout(workout('ledger-backup'));
        const existingDestinationRecord = {
          ...records[0],
          workoutId: 'ledger-backup',
          status: 'failed' as const,
          lastError: 'Existing local ledger state',
        };
        await destination.saveHealthSyncRecord(existingDestinationRecord);
        await restoreBackup(JSON.stringify(backup), destination);
        assert.deepEqual(
          await destination.getHealthSyncRecord('ledger-backup', 'healthkit'),
          existingDestinationRecord,
        );
      } finally {
        await destination.close();
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(destinationName);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }

      await store.deleteWorkout('ledger-backup');
      assert.equal(await store.getHealthSyncRecord('ledger-backup', 'healthkit'), null);
    } finally {
      await store.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  });
});
