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
        assert.equal(await store.getDataRevision!(), afterWrite, 'the new revision is stable across reads');
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
      assert.equal(await reader.getDataRevision(), afterWrite, 'follower tab observes the writer revision');
    } finally {
      await writer.close?.();
      await reader.close?.();
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(dbName);
        req.onsuccess = () => resolve();
        req.onblocked = () => resolve();
        req.onerror = () => resolve();
      });
    }
  });
});
