import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ActiveExercise, Exercise } from '../../src/types';
import {
  ExerciseLayout,
  getExerciseDropIndex,
  moveActiveExercise,
  moveActiveExerciseToIndex,
  replaceActiveExercise,
} from '../../src/workout/active-exercises';

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
  it('moves an exercise directly to a target index without changing its data', () => {
    const exercises = ['a', 'b', 'c'].map(makeActiveExercise);

    const updated = moveActiveExerciseToIndex(exercises, 'active-a', 2);

    assert.deepEqual(updated.map(exercise => exercise.exerciseId), ['b', 'c', 'a']);
    assert.deepEqual(updated[2].sets, exercises[0].sets);
    assert.equal(updated[2].notes, exercises[0].notes);
    assert.deepEqual(exercises.map(exercise => exercise.exerciseId), ['a', 'b', 'c']);
  });

  it('leaves the exercise list unchanged for unknown or out-of-range targets', () => {
    const exercises = ['a', 'b', 'c'].map(makeActiveExercise);

    assert.equal(moveActiveExerciseToIndex(exercises, 'missing', 1), exercises);
    assert.equal(moveActiveExerciseToIndex(exercises, 'active-a', -1), exercises);
    assert.equal(moveActiveExerciseToIndex(exercises, 'active-a', 3), exercises);
  });

  it('calculates a drop index by comparing the dragged center with card centers', () => {
    const exerciseIds = ['active-a', 'active-b', 'active-c'];
    const layouts: Record<string, ExerciseLayout> = {
      'active-a': { y: 0, height: 100 },
      'active-b': { y: 120, height: 100 },
      'active-c': { y: 240, height: 100 },
    };

    assert.equal(getExerciseDropIndex(exerciseIds, layouts, 'active-a', 20), 0);
    assert.equal(getExerciseDropIndex(exerciseIds, layouts, 'active-a', 180), 1);
    assert.equal(getExerciseDropIndex(exerciseIds, layouts, 'active-a', 300), 2);
    assert.equal(getExerciseDropIndex(exerciseIds, layouts, 'active-c', -180), 1);
    assert.equal(getExerciseDropIndex(exerciseIds, layouts, 'active-b', 10), 1);
  });

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

  it('updates uncompleted sets with new suggestions while preserving completed sets', () => {
    const exercises = ['a', 'b'].map(makeActiveExercise);
    exercises[1].sets = [
      {
        id: 's-completed',
        setNumber: 1,
        type: 'normal',
        weightKg: 100,
        reps: 8,
        isCompleted: true,
        isWeightEdited: true,
        previousWeightKg: 95,
        previousReps: 8,
      },
      {
        id: 's-uncompleted',
        setNumber: 2,
        type: 'normal',
        weightKg: 50,
        reps: 6,
        isCompleted: false,
        isWeightEdited: true,
        previousWeightKg: 95,
        previousReps: 8,
      },
    ];

    const replacement = makeExercise('incline-db-press', 'Incline Dumbbell Press');
    const suggestions = [
      { weightKg: 32, reps: 10 },
      { weightKg: 32, reps: 10 },
    ];

    const updated = replaceActiveExercise(
      exercises,
      'active-b',
      replacement,
      suggestions,
      'gym-main',
    );

    assert.equal(updated[1].exerciseId, 'incline-db-press');
    assert.equal(updated[1].sets[0].isCompleted, true);
    assert.equal(updated[1].sets[0].weightKg, 100);
    assert.equal(updated[1].sets[0].previousWeightKg, 95);

    // Uncompleted set was reset and updated with replacement suggestions
    assert.equal(updated[1].sets[1].isCompleted, false);
    assert.equal(updated[1].sets[1].weightKg, 0);
    assert.equal(updated[1].sets[1].reps, 0);
    assert.equal(updated[1].sets[1].isWeightEdited, false);
    assert.equal(updated[1].sets[1].previousWeightKg, 32);
    assert.equal(updated[1].sets[1].previousReps, 10);
  });
});

