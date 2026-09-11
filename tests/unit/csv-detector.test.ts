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
});
