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
});
