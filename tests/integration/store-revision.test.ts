import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createStoreFixture } from '../helpers/storeFixture';

/**
 * PERF-07: AnalyticsScreen skips re-hydration when getDataRevision returns the
 * same value as the previous load. That optimization is only sound if reads
 * never advance the revision and every write does.
 */
describe('store.getDataRevision contract', () => {
  for (const platform of ['native', 'web'] as const) {
    it(`${platform}: revision is stable across reads and advances on writes`, async () => {
      const fixture = await createStoreFixture(platform);
      try {
        const { store } = fixture;
        assert.equal(typeof store.getDataRevision, 'function', 'store must expose getDataRevision');

        const initial = await store.getDataRevision!();
        assert.equal(typeof initial, 'number');

        // Reads must never advance the revision, or the analytics skip-check could
        // never produce a cache hit.
        await store.readSnapshot();
        await store.getAllExercises();
        await store.readSnapshot();
        assert.equal(await store.getDataRevision!(), initial, 'reads keep the revision stable');

        // A write advances it.
        await store.createGym('Revision Probe');
        const afterWrite = await store.getDataRevision!();
        assert.notEqual(afterWrite, initial, 'a write advances the revision');

        // Once written, the value stays stable across further reads.
        await store.readSnapshot();
        assert.equal(
          await store.getDataRevision!(),
          afterWrite,
          'the new revision is stable across reads',
        );
      } finally {
        await fixture.dispose();
      }
    });
  }

  it('web: another tab on the same database observes the persisted revision', async () => {
    const { indexedDB } = require('fake-indexeddb');
    const { createWebStore } = require('../../src/database/webStore');
    const dbName = `lifts-revision-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const writer = await createWebStore(dbName, { idbFactory: indexedDB });
    await writer.init();
    const reader = await createWebStore(dbName, { idbFactory: indexedDB });
    await reader.init();
    try {
      assert.equal(reader.isReadOnly?.(), true, 'second tab is the read-only follower');

      const before = await writer.getDataRevision();
      await writer.createGym('Cross Tab Gym', '#10B981');
      const afterWrite = await writer.getDataRevision();
      assert.ok(afterWrite > before, 'the writing tab advances the revision');

      // The follower must read the persisted value rather than a tab-local counter.
      assert.equal(
        await reader.getDataRevision(),
        afterWrite,
        'follower tab observes the writer revision',
      );
    } finally {
      await writer.close?.();
      await reader.close?.();
      await new Promise<void>(resolve => {
        const req = indexedDB.deleteDatabase(dbName);
        req.onsuccess = () => resolve();
        req.onblocked = () => resolve();
        req.onerror = () => resolve();
      });
    }
  });
});

describe('web revision lifecycle', () => {
  it('survives writer close, follower acquisition, and subsequent writes', async () => {
    const { IDBFactory } = await import('fake-indexeddb');
    const { createWebStore } = await import('../../src/database/webStore');
    const idbFactory = new IDBFactory();
    const writer = await createWebStore('revision-lifecycle', { idbFactory });
    await writer.init();
    const follower = await createWebStore('revision-lifecycle', { idbFactory });
    await follower.init();
    try {
      await writer.createGym('Before close');
      const revision = await follower.getDataRevision!();
      await writer.close();
      assert.equal(await follower.getDataRevision!(), revision, 'closing preserves revision');
      assert.equal(await follower.tryAcquireLease(), true);
      assert.equal(await follower.getDataRevision!(), revision, 'acquiring preserves revision');
      await follower.createGym('After close');
      assert.ok((await follower.getDataRevision!()) > revision);
    } finally {
      await writer.close();
      await follower.close();
    }
  });

  it('does not publish a revision for a rejected write', async () => {
    const { IDBFactory } = await import('fake-indexeddb');
    const { createWebStore } = await import('../../src/database/webStore');
    const store = await createWebStore('revision-rejected', { idbFactory: new IDBFactory() });
    await store.init();
    try {
      const revision = await store.getDataRevision!();
      await assert.rejects(store.createGym(''), /name/i);
      assert.equal(await store.getDataRevision!(), revision);
    } finally {
      await store.close();
    }
  });

  it('migrates legacy lease revisions before releasing the lease', async () => {
    const { IDBFactory } = await import('fake-indexeddb');
    const { createWebStore } = await import('../../src/database/webStore');
    const idbFactory = new IDBFactory();
    const store = await createWebStore('revision-legacy', { idbFactory });
    await store.init();
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = idbFactory.open('revision-legacy');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('metadata', 'readwrite');
        const metadata = tx.objectStore('metadata');
        metadata.delete('data_revision');
        const request = metadata.get('writer_lease');
        request.onsuccess = () => metadata.put({ ...request.result, dataRevision: 42 });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      assert.equal(await store.getDataRevision!(), 42, 'legacy revisions remain readable');
      await store.tryAcquireLease();
      await store.close();
      const reopened = await createWebStore('revision-legacy', { idbFactory });
      try {
        await reopened.init();
        assert.equal(await reopened.getDataRevision!(), 42);
        await reopened.createGym('Migrated');
        assert.ok((await reopened.getDataRevision!()) > 42);
      } finally {
        await reopened.close();
      }
    } finally {
      database.close();
      await store.close();
    }
  });

  it('rolls back the revision when a workout transaction aborts', async () => {
    const { IDBFactory } = await import('fake-indexeddb');
    const { createWebStore } = await import('../../src/database/webStore');
    const store = await createWebStore('revision-abort', { idbFactory: new IDBFactory() });
    await store.init();
    try {
      const revision = await store.getDataRevision!();
      await assert.rejects(
        store.finishWorkout({
          id: 'invalid-gym-workout',
          name: 'Invalid gym',
          gymId: 'missing',
          startTime: new Date().toISOString(),
          durationSeconds: 0,
          totalVolumeKg: 0,
          exercises: [],
        }),
        /gym/i,
      );
      assert.equal(await store.getDataRevision!(), revision);
      assert.equal(await store.getWorkoutDetail('invalid-gym-workout'), null);
    } finally {
      await store.close();
    }
  });
});
