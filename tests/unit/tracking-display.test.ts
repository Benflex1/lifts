import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkoutSet } from '../../src/types';
import {
  METERS_PER_MILE,
  TRACKING_TYPE_OPTIONS,
  distanceUnitFor,
  formatBestTrackedSet,
  formatDistance,
  hasTrackedValues,
  metersToDisplay,
  sanitizeDurationInput,
  serializeTrackingTypeOverrides,
} from '../../src/workout/tracking';

type TrackedSet = Pick<WorkoutSet, 'weightKg' | 'reps' | 'durationSeconds' | 'distanceM'>;

function trackedSet(overrides: Partial<TrackedSet>): TrackedSet {
  return { weightKg: 0, reps: 0, ...overrides };
}

describe('tracking type options', () => {
  it('offers a label and example for every type', () => {
    assert.ok(TRACKING_TYPE_OPTIONS.length >= 5);
    for (const option of TRACKING_TYPE_OPTIONS) {
      assert.ok(option.label.length > 0);
      assert.ok(option.example.length > 0);
    }
  });
});

describe('tracking type overrides serialization', () => {
  it('sorts keys so equal overrides compare as equal strings', () => {
    const serialized = serializeTrackingTypeOverrides({
      'Zottman Curl': 'weight_reps',
      'Bench Press': 'duration',
    });
    assert.equal(serialized, '{"Bench Press":"duration","Zottman Curl":"weight_reps"}');
  });
});

describe('distance display helpers', () => {
  it('follows the weight unit for the distance unit', () => {
    assert.equal(distanceUnitFor('kg'), 'km');
    assert.equal(distanceUnitFor('lb'), 'mi');
  });

  it('converts meters to the display unit with two decimals', () => {
    assert.equal(metersToDisplay(1500, 'km'), 1.5);
    assert.equal(metersToDisplay(1234, 'km'), 1.23);
    assert.equal(metersToDisplay(METERS_PER_MILE, 'mi'), 1);
    assert.equal(metersToDisplay(METERS_PER_MILE / 2, 'mi'), 0.5);
  });

  it('formats distances without trailing zeros', () => {
    assert.equal(formatDistance(1000, 'km'), '1 km');
    assert.equal(formatDistance(1500, 'km'), '1.5 km');
    assert.equal(formatDistance(1234, 'km'), '1.23 km');
    assert.equal(formatDistance(METERS_PER_MILE, 'mi'), '1 mi');
  });
});

describe('tracked value presence', () => {
  it('reports false for undefined and empty sets', () => {
    assert.equal(hasTrackedValues(undefined), false);
    assert.equal(hasTrackedValues(trackedSet({})), false);
  });

  it('reports true when any tracked value is positive', () => {
    assert.equal(hasTrackedValues(trackedSet({ weightKg: 40 })), true);
    assert.equal(hasTrackedValues(trackedSet({ reps: 5 })), true);
    assert.equal(hasTrackedValues(trackedSet({ durationSeconds: 30 })), true);
    assert.equal(hasTrackedValues(trackedSet({ distanceM: 400 })), true);
  });
});

describe('duration input sanitizing', () => {
  it('maps separators to colons and drops other characters', () => {
    assert.equal(sanitizeDurationInput('1,30'), '1:30');
    assert.equal(sanitizeDurationInput('1.30'), '1:30');
    assert.equal(sanitizeDurationInput('abo12:30!'), '12:30');
    assert.equal(sanitizeDurationInput('45'), '45');
  });
});

describe('best tracked set summaries', () => {
  it('returns null for load-bearing types and empty lists', () => {
    assert.equal(
      formatBestTrackedSet([trackedSet({ weightKg: 100, reps: 5 })], 'weight_reps', 'kg'),
      null,
    );
    assert.equal(formatBestTrackedSet([], 'duration', 'kg'), null);
  });

  it('picks the longest hold for duration exercises', () => {
    const sets = [trackedSet({ durationSeconds: 30 }), trackedSet({ durationSeconds: 45 })];
    assert.equal(formatBestTrackedSet(sets, 'duration', 'kg'), '0:45');
  });

  it('prefers distance, falling back to time, for distance exercises', () => {
    assert.equal(
      formatBestTrackedSet(
        [trackedSet({ distanceM: 1500 }), trackedSet({ durationSeconds: 600 })],
        'distance_duration',
        'kg',
      ),
      '1.5 km',
    );
    assert.equal(
      formatBestTrackedSet([trackedSet({ durationSeconds: 600 })], 'distance_duration', 'kg'),
      '10:00',
    );
  });

  it('reports the best rep count for bodyweight exercises', () => {
    const sets = [trackedSet({ reps: 8 }), trackedSet({ reps: 12 })];
    assert.equal(formatBestTrackedSet(sets, 'bodyweight_reps', 'kg'), '12 reps');
    assert.equal(formatBestTrackedSet([trackedSet({})], 'bodyweight_reps', 'kg'), null);
  });
});
