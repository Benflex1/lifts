import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shapeBackup } from '../../src/utils/export';

describe('shapeBackup', () => {
  it('produces valid JSON structure', () => {
    const result = shapeBackup(
      [{ id: 'w1', name: 'Push', startTime: '2026-01-01T00:00:00Z', durationSeconds: 3600, totalVolumeKg: 5000, totalSets: 12, exerciseNames: ['Bench'], endTime: '2026-01-01T01:00:00Z' }],
      [],
      [],
      { unit: 'kg' }
    );
    const parsed = JSON.parse(result);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.workouts.length, 1);
    assert.equal(parsed.settings.unit, 'kg');
    assert.ok(parsed.exportedAt);
  });

  it('handles empty data', () => {
    const result = shapeBackup([], [], [], {});
    const parsed = JSON.parse(result);
    assert.equal(parsed.workouts.length, 0);
    assert.equal(parsed.routines.length, 0);
  });
});
