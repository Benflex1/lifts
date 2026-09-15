import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Exercise } from '../../src/types';
import { DEFAULT_EXERCISES } from '../../src/database/seedData';
import {
  getExerciseFormGuideViewModel,
  getExerciseRowViewModel,
} from '../../src/utils/exercise-ui';

const exercise = (overrides: Partial<Exercise> = {}): Exercise => ({
  id: 'ui-test-exercise',
  name: 'Test Exercise',
  category: 'strength',
  equipment: 'body only',
  primaryMuscles: ['chest'],
  ...overrides,
});

describe('exercise UI view models', () => {
  it('exposes the curated website label for a form-guide action', () => {
    const viewModel = getExerciseFormGuideViewModel(exercise({
      instructionUrl: 'https://example.com/bench',
      instructionUrlType: 'website',
    }));

    assert.equal(viewModel.label, 'Open exercise guide');
    assert.equal(viewModel.link.isFallback, false);
  });

  it('exposes the direct YouTube label for a form-guide action', () => {
    const viewModel = getExerciseFormGuideViewModel(exercise({
      instructionUrl: 'https://www.youtube.com/watch?v=bench',
      instructionUrlType: 'youtube',
    }));

    assert.equal(viewModel.label, 'Watch form video');
    assert.equal(viewModel.link.isFallback, false);
  });

  it('exposes the fallback label for missing and invalid form-guide links', () => {
    for (const candidate of [
      exercise(),
      exercise({ instructionUrl: 'not a URL', instructionUrlType: 'website' }),
    ]) {
      const viewModel = getExerciseFormGuideViewModel(candidate);

      assert.equal(viewModel.label, 'Find form videos on YouTube');
      assert.equal(viewModel.link.isFallback, true);
    }
  });

  it('keeps an unknown visual mapping row-safe with a generated fallback', () => {
    const viewModel = getExerciseRowViewModel(exercise({
      id: 'unknown-ui-exercise',
      name: 'Unmapped Movement',
      category: 'unknown-category',
      primaryMuscles: ['unknown muscle'],
    }));

    assert.deepEqual(viewModel.visual, {
      kind: 'generated',
      template: 'general',
      alt: 'Unmapped Movement exercise illustration',
    });
    assert.equal(viewModel.visualAccessibilityLabel, 'Unmapped Movement exercise illustration');
  });

  it('exposes remote imagery for a bundled exercise row', () => {
    const viewModel = getExerciseRowViewModel(DEFAULT_EXERCISES[0]);

    assert.equal(viewModel.visual.kind, 'remote-image');
    assert.equal(viewModel.visualAccessibilityLabel, `${DEFAULT_EXERCISES[0].name} exercise illustration`);
  });
});
