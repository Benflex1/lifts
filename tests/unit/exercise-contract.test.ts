import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { validateExerciseRecord } from '../../src/database/snapshot-validation';

const validExercise = {
  id: 'example-exercise',
  name: 'Example Exercise',
  category: 'strength',
  equipment: 'body only',
  primaryMuscles: ['abdominals'],
  secondaryMuscles: [],
  instructions: ['Move with control.'],
};

describe('Exercise contract', () => {
  it('accepts legacy records that omit optional instruction links', () => {
    const legacyExercise = { ...validExercise };
    delete legacyExercise.secondaryMuscles;
    delete legacyExercise.instructions;

    assert.doesNotThrow(() => validateExerciseRecord(legacyExercise, 'exercise'));
  });

  it('accepts absolute HTTP and HTTPS instruction links with matching types', () => {
    assert.doesNotThrow(() => validateExerciseRecord({
      ...validExercise,
      instructionUrl: 'https://example.com/exercises/example',
      instructionUrlType: 'website',
    }, 'exercise'));
    assert.doesNotThrow(() => validateExerciseRecord({
      ...validExercise,
      instructionUrl: 'http://example.com/exercises/example',
      instructionUrlType: 'website',
    }, 'exercise'));
    assert.doesNotThrow(() => validateExerciseRecord({
      ...validExercise,
      instructionUrl: 'https://www.youtube.com/watch?v=example',
      instructionUrlType: 'youtube',
    }, 'exercise'));
    assert.doesNotThrow(() => validateExerciseRecord({
      ...validExercise,
      instructionUrl: 'https://youtu.be/example',
      instructionUrlType: 'youtube',
    }, 'exercise'));
  });

  it('rejects malformed or unsupported instruction links', () => {
    assert.throws(() => validateExerciseRecord({
      ...validExercise,
      instructionUrl: 42,
    }, 'exercise'), /Invalid exercise\.instructionUrl/);
    assert.throws(() => validateExerciseRecord({
      ...validExercise,
      instructionUrl: '/exercises/example',
    }, 'exercise'), /Invalid exercise\.instructionUrl/);
    assert.throws(() => validateExerciseRecord({
      ...validExercise,
      instructionUrl: 'https://',
    }, 'exercise'), /Invalid exercise\.instructionUrl/);
    assert.throws(() => validateExerciseRecord({
      ...validExercise,
      instructionUrl: 'ftp://example.com/exercises/example',
    }, 'exercise'), /Invalid exercise\.instructionUrl/);
  });

  it('rejects unsupported or contradictory instruction link types', () => {
    assert.throws(() => validateExerciseRecord({
      ...validExercise,
      instructionUrl: 'https://example.com/exercises/example',
      instructionUrlType: 'video',
    }, 'exercise'), /Invalid exercise\.instructionUrlType/);
    assert.throws(() => validateExerciseRecord({
      ...validExercise,
      instructionUrl: 'https://www.youtube.com/watch?v=example',
      instructionUrlType: 'website',
    }, 'exercise'), /Invalid exercise\.instructionUrlType/);
    assert.throws(() => validateExerciseRecord({
      ...validExercise,
      instructionUrl: 'https://example.com/exercises/example',
      instructionUrlType: 'youtube',
    }, 'exercise'), /Invalid exercise\.instructionUrlType/);
  });
});
