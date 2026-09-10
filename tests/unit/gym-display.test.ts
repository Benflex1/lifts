import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { PreviousSetSuggestion } from '../../src/types';
import { formatPreviousMetric } from '../../src/workout/gym-display';

describe('previous set display', () => {
  it('formats local suggestions without a source label', () => {
    const suggestion: PreviousSetSuggestion = { weightKg: 45, reps: 10 };

    assert.equal(formatPreviousMetric(suggestion, 'kg'), '45 kg × 10');
  });

  it('labels suggestions that came from another gym', () => {
    const suggestion: PreviousSetSuggestion = {
      weightKg: 45,
      reps: 10,
      sourceGymName: 'FitX',
    };

    assert.equal(formatPreviousMetric(suggestion, 'kg'), '45 kg × 10 · from FitX');
  });

  it('does not add a source label to global suggestions', () => {
    const suggestion: PreviousSetSuggestion = {
      weightKg: 45,
      reps: 10,
      sourceGymId: 'gym-default',
    };

    assert.equal(formatPreviousMetric(suggestion, 'kg'), '45 kg × 10');
  });
});
