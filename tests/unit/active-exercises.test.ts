import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ActiveExercise, Exercise } from '../../src/types';
import { moveActiveExercise, replaceActiveExercise } from '../../src/workout/active-exercises';

const makeExercise = (id: string, name: string): Exercise => ({
  id,
  name,
  category: 'strength',
  equipment: 'barbell',
  primaryMuscles: ['chest'],
});

const makeActiveExercise = (id: string): ActiveExercise => ({
  id: `active-${id}`,
  exerciseId: id,
  exercise: makeExercise(id, `Exercise ${id}`),
  restTimerSeconds: 90,
  targetReps: '8-12',
  notes: 'Keep shoulders packed',
  sets: [{
    id: `set-${id}`,
    setNumber: 1,
    type: 'normal',
    weightKg: 80,
    reps: 8,
    rpe: 8,
    isCompleted: true,
  }],
});

describe('active exercise operations', () => {
  it('moves an exercise up or down without changing the other entries', () => {
    const exercises = ['a', 'b', 'c'].map(makeActiveExercise);

    assert.deepEqual(
      moveActiveExercise(exercises, 'active-b', -1).map(exercise => exercise.exerciseId),
      ['b', 'a', 'c']
    );
    assert.deepEqual(
      moveActiveExercise(exercises, 'active-b', 1).map(exercise => exercise.exerciseId),
      ['a', 'c', 'b']
    );
    assert.deepEqual(
      moveActiveExercise(exercises, 'active-a', -1).map(exercise => exercise.exerciseId),
      ['a', 'b', 'c']
    );
    assert.deepEqual(
      moveActiveExercise(exercises, 'active-c', 1).map(exercise => exercise.exerciseId),
      ['a', 'b', 'c']
    );
  });

  it('replaces only the selected exercise while preserving workout data', () => {
    const exercises = ['a', 'b'].map(makeActiveExercise);
    const original = exercises[1];
    const replacement = makeExercise('replacement', 'Replacement Exercise');

    const updated = replaceActiveExercise(exercises, 'active-b', replacement);

    assert.equal(updated[1].exerciseId, 'replacement');
    assert.equal(updated[1].exercise, replacement);
    assert.deepEqual(updated[1].sets, original.sets);
    assert.equal(updated[1].sets, original.sets);
    assert.equal(updated[1].targetReps, original.targetReps);
    assert.equal(updated[1].notes, original.notes);
    assert.equal(updated[1].restTimerSeconds, original.restTimerSeconds);
    assert.equal(updated[0], exercises[0]);
    assert.notEqual(updated[1], original);
  });
});
