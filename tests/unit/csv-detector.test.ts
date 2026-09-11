import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { detectTrackerFormat } from '../../src/utils/importer/detector';

describe('CSV Tracker Format Detector', () => {
  it('detects Hevy format correctly', () => {
    const hevyHeader = [
      'title', 'start_time', 'end_time', 'description', 'exercise_title',
      'superset_id', 'exercise_notes', 'set_index', 'set_type', 'weight_kg',
      'reps', 'distance_miles', 'duration_seconds', 'rpe'
    ];
    const result = detectTrackerFormat(hevyHeader);
    assert.equal(result.format, 'hevy');
    assert.equal(result.label, 'Hevy');
  });

  it('detects Hevy with weight_lbs', () => {
    const hevyLbsHeader = [
      'title', 'start_time', 'end_time', 'description', 'exercise_title',
      'set_index', 'set_type', 'weight_lbs', 'reps', 'rpe'
    ];
    const result = detectTrackerFormat(hevyLbsHeader);
    assert.equal(result.format, 'hevy');
  });

  it('detects Strong format correctly', () => {
    const strongHeader = [
      'Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order',
      'Weight', 'Weight Unit', 'Reps', 'RPE', 'Distance', 'Distance Unit',
      'Seconds', 'Notes', 'Workout Notes'
    ];
    const result = detectTrackerFormat(strongHeader);
    assert.equal(result.format, 'strong');
    assert.equal(result.label, 'Strong');
  });

  it('detects FitNotes format correctly', () => {
    const fitNotesHeader = [
      'Date', 'Exercise', 'Category', 'Weight (kg)', 'Reps',
      'Distance', 'Distance Unit', 'Time', 'Notes', 'Kind'
    ];
    const result = detectTrackerFormat(fitNotesHeader);
    assert.equal(result.format, 'fitnotes');
    assert.equal(result.label, 'FitNotes');
  });

  it('detects Lyfta format correctly', () => {
    const lyftaHeader = [
      'Date', 'Workout Name', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Notes'
    ];
    const result = detectTrackerFormat(lyftaHeader);
    assert.equal(result.format, 'lyfta');
    assert.equal(result.label, 'Lyfta');
  });

  it('detects generic CSV with basic headers', () => {
    const genericHeader = ['Date', 'Exercise', 'Weight', 'Reps'];
    const result = detectTrackerFormat(genericHeader);
    assert.equal(result.format, 'generic');
  });

  it('normalizes set types without false positive drop classification on notes', async () => {
    const { normalizeSetType } = await import('../../src/utils/importer/csv-parser');
    assert.equal(normalizeSetType('warmup'), 'warmup');
    assert.equal(normalizeSetType('w'), 'warmup');
    assert.equal(normalizeSetType('dropset'), 'drop');
    assert.equal(normalizeSetType('d'), 'drop');
    assert.equal(normalizeSetType('failure'), 'failure');
    assert.equal(normalizeSetType('f'), 'failure');

    // Avoid false drops on common note phrases
    assert.equal(normalizeSetType(undefined, "Don't drop weights"), 'normal');
    assert.equal(normalizeSetType(undefined, 'Drop hips lower on setup'), 'normal');
    assert.equal(normalizeSetType(undefined, 'Slow descent on drop'), 'normal');

    // Valid drop set note detection
    assert.equal(normalizeSetType(undefined, 'last set drop set'), 'drop');
    assert.equal(normalizeSetType(undefined, 'warm up'), 'warmup');
    assert.equal(normalizeSetType(undefined, 'pushed until failure'), 'failure');
  });
});
