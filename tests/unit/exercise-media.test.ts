import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Exercise } from '../../src/types';
import { getExerciseVisual } from '../../src/utils/exercise-media';

const exercise = (overrides: Partial<Exercise> = {}): Exercise => ({
  id: 'test-exercise',
  name: 'Test Exercise',
  category: 'strength',
  equipment: 'body only',
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  instructions: ['Move with control.'],
  ...overrides,
});

describe('exercise visual resolver', () => {
  it('returns the reviewed local asset for an explicit exercise ID match', () => {
    assert.deepEqual(getExerciseVisual(exercise({
      id: 'Plank',
      name: 'Plank',
      primaryMuscles: ['abdominals'],
    })), {
      kind: 'open-asset',
      assetKey: 'workout-guide/plank/frame-1.svg',
      alt: 'Plank exercise illustration',
    });
  });

  it('returns a deterministic generated descriptor for an unknown exercise', () => {
    const unknown = exercise({ id: 'custom-unknown', name: 'Something New', primaryMuscles: ['unknown'] });

    assert.deepEqual(getExerciseVisual(unknown), {
      kind: 'generated',
      template: 'general',
      alt: 'Something New exercise illustration',
    });
    assert.deepEqual(getExerciseVisual(unknown), getExerciseVisual(unknown));
  });

  it('selects the movement template from representative exercise names and categories', () => {
    const cases: Array<[Exercise, string]> = [
      [exercise({ name: 'Bench Press' }), 'push'],
      [exercise({ name: 'Lat Pulldown', primaryMuscles: ['lats'] }), 'pull'],
      [exercise({ name: 'Back Squat', primaryMuscles: ['quadriceps'] }), 'squat'],
      [exercise({ name: 'Romanian Deadlift', primaryMuscles: ['hamstrings'] }), 'hinge'],
      [exercise({ name: 'Farmer Walk', equipment: 'other' }), 'carry'],
      [exercise({ name: 'Plank', primaryMuscles: ['abdominals'] }), 'core'],
      [exercise({ name: 'World’s Greatest Stretch', category: 'stretching' }), 'stretch'],
      [exercise({ name: 'Running', category: 'cardio', equipment: 'body only' }), 'cardio'],
      [exercise({ name: 'Unclassified Movement', category: 'unknown-category', primaryMuscles: ['unknown'] }), 'general'],
    ];

    for (const [candidate, expectedTemplate] of cases) {
      const descriptor = getExerciseVisual(candidate);
      assert.equal(descriptor.kind, 'generated', candidate.name);
      assert.equal(descriptor.kind === 'generated' ? descriptor.template : undefined, expectedTemplate);
    }
  });

  it('classifies crunch exercises as core instead of cardio', () => {
    const crunchNames = ['Crunch', 'Ab Crunch Machine'];

    for (const name of crunchNames) {
      const descriptor = getExerciseVisual(exercise({
        id: `test-${name.toLowerCase().replaceAll(' ', '-')}`,
        name,
        primaryMuscles: ['abdominals'],
      }));

      assert.equal(descriptor.kind, 'generated', name);
      assert.equal(descriptor.kind === 'generated' ? descriptor.template : undefined, 'core', name);
    }
  });

  it('does not throw for unknown equipment or muscle names', () => {
    assert.doesNotThrow(() => getExerciseVisual(exercise({
      name: 'Unusual Movement',
      category: 'mystery',
      equipment: 'invented apparatus',
      primaryMuscles: ['unknown muscle'],
      secondaryMuscles: ['another unknown muscle'],
    })));
  });
});
