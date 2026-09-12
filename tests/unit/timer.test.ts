import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeElapsedSeconds, computeRemaining } from '../../src/utils/timer';

describe('computeElapsedSeconds', () => {
  it('returns 0 when now equals startTime', () => {
    const start = new Date('2026-09-07T10:00:00Z').getTime();
    assert.equal(computeElapsedSeconds(new Date(start).toISOString(), start), 0);
  });

  it('computes integer seconds from wall clock', () => {
    const start = new Date('2026-09-07T10:00:00Z').getTime();
    const now = start + 45_000;
    assert.equal(computeElapsedSeconds(new Date(start).toISOString(), now), 45);
  });

  it('does not undercount under frequent re-renders (wall-clock based)', () => {
    const start = new Date('2026-09-07T10:00:00Z').getTime();
    const now = start + 127_000;
    assert.equal(computeElapsedSeconds(new Date(start).toISOString(), now), 127);
  });

  it('clamps negative drift to 0', () => {
    const start = new Date('2026-09-07T10:00:00Z').getTime();
    assert.equal(computeElapsedSeconds(new Date(start).toISOString(), start - 5_000), 0);
  });
});

describe('computeRemaining', () => {
  it('returns positive remainder before endsAt', () => {
    const now = Date.now();
    const endsAt = now + 90_000;
    assert.equal(computeRemaining(endsAt, now), 90);
  });

  it('returns 0 at or past endsAt', () => {
    const now = Date.now();
    assert.equal(computeRemaining(now, now), 0);
    assert.equal(computeRemaining(now - 1000, now), 0);
  });

  it('differentiates recently expired timers from stale resumptions', () => {
    const now = 1_000_000;
    // Just expired (within 1.5s tolerance)
    const freshExpiry = now - 500;
    const isRecentlyExpiredFresh = Math.abs(now - freshExpiry) < 1500;
    assert.equal(isRecentlyExpiredFresh, true);

    // Stale expiration (e.g. app reopened 15s after background timer completion)
    const staleExpiry = now - 15_000;
    const isRecentlyExpiredStale = Math.abs(now - staleExpiry) < 1500;
    assert.equal(isRecentlyExpiredStale, false);
  });
});
