import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { DEFAULT_EXERCISES, buildDefaultRoutines, getBundledExercise } from '../../src/database/seedData';

describe('Seed Data Integrity', () => {
  it('contains exactly 876 unique bundled exercises with required fields', () => {
    assert.equal(DEFAULT_EXERCISES.length, 876);
    const idSet = new Set(DEFAULT_EXERCISES.map(e => e.id));
    assert.equal(idSet.size, 876, 'Every exercise ID must be unique');

    for (const ex of DEFAULT_EXERCISES) {
      assert.ok(ex.id, 'Exercise must have an ID');
      assert.ok(ex.name, `Exercise ${ex.id} must have a name`);
      assert.ok(ex.category, `Exercise ${ex.id} must have a category`);
      assert.ok(Array.isArray(ex.primaryMuscles), `Exercise ${ex.id} must have primaryMuscles array`);
      assert.ok(ex.primaryMuscles.length > 0, `Exercise ${ex.id} must have at least one primary muscle`);
    }
  });

  it('builds default routines with exact matching exercise identities and definitions', () => {
    const routines = buildDefaultRoutines();
    assert.equal(routines.length, 3, 'Must have 3 starter routines (Push, Pull, Legs)');

    for (const r of routines) {
      assert.ok(r.id);
      assert.ok(r.name);
      assert.ok(r.exercises.length > 0);

      for (const re of r.exercises) {
        assert.ok(re.exerciseId);
        assert.equal(re.exercise.id, re.exerciseId, 'Embedded exercise id must equal exerciseId');
        const fromLibrary = getBundledExercise(re.exerciseId);
        assert.deepEqual(re.exercise, fromLibrary, 'Embedded exercise must be identical to bundled definition');
      }
    }
  });

  it('throws an error if a non-existent exercise ID is requested', () => {
    assert.throws(() => {
      getBundledExercise('non-existent-id-12345');
    }, /Bundled exercise with id "non-existent-id-12345" not found/);
  });
});
