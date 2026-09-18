import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  BUNDLED_EXERCISE_CATALOG_VERSION,
  DEFAULT_EXERCISES,
  buildDefaultRoutines,
  getBundledExercise,
} from '../../src/database/seedData';
import { validateExerciseRecord } from '../../src/database/snapshot-validation';
import {
  FREE_EXERCISE_DB_REPOSITORY_URL,
  FREE_EXERCISE_DB_REVISION,
  getFreeExerciseDbImageUrls,
} from '../../src/database/exercise-source';

describe('Seed Data Integrity', () => {
  it('exports the current bundled exercise catalog version', () => {
    assert.equal(BUNDLED_EXERCISE_CATALOG_VERSION, 4);
  });

  it('constructs deterministic, encoded URLs for the pinned source revision', () => {
    const id = 'Exercise id/with spaces';
    assert.equal(FREE_EXERCISE_DB_REVISION, 'a859101d633a01c4a1a920d6a8ce41dabba0705f');
    assert.equal(FREE_EXERCISE_DB_REPOSITORY_URL, 'https://github.com/yuhonas/free-exercise-db');
    assert.deepEqual(getFreeExerciseDbImageUrls(id), [
      `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${FREE_EXERCISE_DB_REVISION}/exercises/Exercise%20id%2Fwith%20spaces/0.jpg`,
      `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${FREE_EXERCISE_DB_REVISION}/exercises/Exercise%20id%2Fwith%20spaces/1.jpg`,
    ]);
  });

  it('contains exactly 876 unique bundled exercises with required fields', () => {
    assert.equal(DEFAULT_EXERCISES.length, 876);
    const idSet = new Set(DEFAULT_EXERCISES.map(e => e.id));
    assert.equal(idSet.size, 876, 'Every exercise ID must be unique');

    for (const ex of DEFAULT_EXERCISES) {
      assert.ok(ex.id, 'Exercise must have an ID');
      assert.ok(ex.name, `Exercise ${ex.id} must have a name`);
      assert.ok(ex.category, `Exercise ${ex.id} must have a category`);
      assert.ok(ex.equipment, `Exercise ${ex.id} must have equipment`);
      assert.ok(Array.isArray(ex.primaryMuscles), `Exercise ${ex.id} must have primaryMuscles array`);
      assert.ok(ex.primaryMuscles.length > 0, `Exercise ${ex.id} must have at least one primary muscle`);
      assert.ok(ex.primaryMuscles.every(muscle => muscle.trim().length > 0), `Exercise ${ex.id} must have non-blank primary muscles`);
      assert.ok(Array.isArray(ex.secondaryMuscles), `Exercise ${ex.id} must have secondaryMuscles array`);
      assert.ok(ex.secondaryMuscles.every(muscle => muscle.trim().length > 0), `Exercise ${ex.id} must have non-blank secondary muscles`);
      assert.ok(Array.isArray(ex.instructions), `Exercise ${ex.id} must have instructions array`);
      assert.ok(ex.instructions.length > 0, `Exercise ${ex.id} must have instructions`);
      assert.ok(ex.instructions.every(instruction => instruction.trim().length > 0), `Exercise ${ex.id} must have non-blank instructions`);
      assert.doesNotMatch(ex.instructionUrl || '', /github\.com/i);
      if (ex.instructionUrl !== undefined) assert.equal(ex.instructionUrlType, 'website');
      assert.doesNotThrow(() => validateExerciseRecord(ex, `bundled exercise ${ex.id}`));
    }
  });

  it('contains only the explicitly verified MuscleWiki guide mappings', () => {
    const expected = new Map([
      ['Barbell_Bench_Press_-_Medium_Grip', 'https://musclewiki.com/exercise/barbell-bench-press'],
      ['Barbell_Deadlift', 'https://musclewiki.com/exercise/barbell-deadlift'],
      ['Barbell_Curl', 'https://musclewiki.com/exercise/barbell-curl'],
      ['Dumbbell_Bench_Press', 'https://musclewiki.com/exercise/dumbbell-bench-press'],
      ['Incline_Dumbbell_Press', 'https://musclewiki.com/exercise/dumbbell-incline-bench-press'],
      ['Pushups', 'https://musclewiki.com/exercise/push-up'],
    ]);

    assert.equal(DEFAULT_EXERCISES.filter(exercise => exercise.instructionUrl !== undefined).length, expected.size);
    for (const [id, url] of expected) {
      const record = DEFAULT_EXERCISES.find(exercise => exercise.id === id);
      assert.ok(record, `Missing bundled exercise ${id}`);
      assert.equal(record.instructionUrl, url);
      assert.equal(record.instructionUrlType, 'website');
    }
  });

  it('keeps the authored Iron Cross instructions aligned with dumbbell equipment', () => {
    const ironCross = getBundledExercise('Iron_Cross');
    assert.equal(ironCross.equipment, 'dumbbell');
    assert.ok(ironCross.instructions?.some(instruction => /dumbbell/i.test(instruction)));
    assert.ok(ironCross.instructions?.every(instruction => !/rings?/i.test(instruction)));
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
