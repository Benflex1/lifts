import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Exercise } from '../../src/types';
import { DEFAULT_EXERCISES } from '../../src/database/seedData';
import { FREE_EXERCISE_DB_REVISION, getFreeExerciseDbImageUrls } from '../../src/database/exercise-source';
import { REVIEWED_EXERCISE_ASSETS, getExerciseVisual } from '../../src/utils/exercise-media';

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
  it('keeps the reviewed local Plank asset available as provenance fallback', () => {
    assert.equal(REVIEWED_EXERCISE_ASSETS.Plank, 'workout-guide/plank/frame-1.svg');
  });

  it('returns remote images for representative bundled exercises', () => {
    const expectedFallbackTemplates = ['core', 'hinge', 'core'] as const;
    for (const [index, bundled] of DEFAULT_EXERCISES.slice(0, 3).entries()) {
      const descriptor = getExerciseVisual(bundled);
      assert.equal(descriptor.kind, 'remote-image', bundled.id);
      if (descriptor.kind !== 'remote-image') continue;
      assert.equal(descriptor.imageUrl, getFreeExerciseDbImageUrls(bundled.id)[0]);
      assert.deepEqual(descriptor.imageUrls, getFreeExerciseDbImageUrls(bundled.id));
      assert.equal(descriptor.fallbackTemplate, expectedFallbackTemplates[index]);
    }
  });

  it('returns remote images for every bundled exercise at the pinned revision', () => {
    for (const bundled of DEFAULT_EXERCISES) {
      const descriptor = getExerciseVisual(bundled);
      assert.equal(descriptor.kind, 'remote-image', bundled.id);
      if (descriptor.kind !== 'remote-image') continue;
      assert.ok(descriptor.imageUrls.every(url => url.includes(`/${FREE_EXERCISE_DB_REVISION}/`)), bundled.id);
      assert.deepEqual(descriptor.imageUrls, getFreeExerciseDbImageUrls(bundled.id));
    }
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

  it('does not use bundled remote media for a custom exercise with a colliding ID', () => {
    const bundled = DEFAULT_EXERCISES[0];
    const descriptor = getExerciseVisual({
      ...bundled,
      isCustom: true,
      name: 'My Custom Exercise',
    });

    assert.equal(descriptor.kind, 'generated');
  });

  it('returns generated media for a custom Plank instead of the reviewed local asset', () => {
    const descriptor = getExerciseVisual(exercise({
      id: 'Plank',
      name: 'Plank',
      isCustom: true,
      primaryMuscles: ['abdominals'],
    }));

    assert.equal(descriptor.kind, 'generated');
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
