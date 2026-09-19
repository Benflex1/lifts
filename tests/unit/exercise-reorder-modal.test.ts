import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ActiveExercise, Exercise, WorkoutSet } from '../../src/types';
import {
  moveActiveExercise,
  moveActiveExerciseToIndex,
} from '../../src/workout/active-exercises';
import { moveWorkoutSet } from '../../src/workout/sets';

const makeExercise = (id: string, name: string): Exercise => ({
  id,
  name,
  category: 'strength',
  equipment: 'barbell',
  primaryMuscles: ['chest'],
});

const makeActiveExercise = (id: string, name: string, setCount = 3): ActiveExercise => ({
  id: `active-${id}`,
  exerciseId: id,
  exercise: makeExercise(id, name),
  restTimerSeconds: 90,
  targetReps: '8-12',
  notes: 'Note for ' + name,
  sets: Array.from({ length: setCount }, (_, idx): WorkoutSet => ({
    id: `set-${id}-${idx + 1}`,
    setNumber: idx + 1,
    type: 'normal',
    weightKg: 60 + idx * 10,
    reps: 10 - idx,
    isCompleted: idx === 0,
  })),
});

describe('exercise and set reordering overhaul', () => {
  it('moves active exercise up and down correctly in active workout list', () => {
    const list: ActiveExercise[] = [
      makeActiveExercise('ex1', 'Bench Press'),
      makeActiveExercise('ex2', 'Incline Dumbbell Press'),
      makeActiveExercise('ex3', 'Cable Fly'),
    ];

    // Move second exercise up to first position
    const movedUp = moveActiveExercise(list, 'active-ex2', -1);
    assert.equal(movedUp[0].id, 'active-ex2');
    assert.equal(movedUp[1].id, 'active-ex1');
    assert.equal(movedUp[2].id, 'active-ex3');

    // Move first exercise down to middle position
    const movedDown = moveActiveExercise(movedUp, 'active-ex2', 1);
    assert.equal(movedDown[0].id, 'active-ex1');
    assert.equal(movedDown[1].id, 'active-ex2');
    assert.equal(movedDown[2].id, 'active-ex3');

    // Cannot move first exercise up
    const noopUp = moveActiveExercise(list, 'active-ex1', -1);
    assert.deepEqual(noopUp, list);

    // Cannot move last exercise down
    const noopDown = moveActiveExercise(list, 'active-ex3', 1);
    assert.deepEqual(noopDown, list);
  });

  it('moves sets up and down and updates set numbers sequentially', () => {
    const ex = makeActiveExercise('ex1', 'Squat', 4);
    assert.deepEqual(ex.sets.map(s => s.setNumber), [1, 2, 3, 4]);
    assert.deepEqual(ex.sets.map(s => s.weightKg), [60, 70, 80, 90]);

    // Move set 3 up to position 2
    const movedUp = moveWorkoutSet(ex.sets, 'set-ex1-3', -1);
    assert.deepEqual(movedUp.map(s => s.id), [
      'set-ex1-1',
      'set-ex1-3',
      'set-ex1-2',
      'set-ex1-4',
    ]);
    // Set numbers should be re-indexed 1, 2, 3, 4
    assert.deepEqual(movedUp.map(s => s.setNumber), [1, 2, 3, 4]);
    assert.deepEqual(movedUp.map(s => s.weightKg), [60, 80, 70, 90]);

    // Move set 1 down to position 2
    const movedDown = moveWorkoutSet(movedUp, 'set-ex1-1', 1);
    assert.deepEqual(movedDown.map(s => s.id), [
      'set-ex1-3',
      'set-ex1-1',
      'set-ex1-2',
      'set-ex1-4',
    ]);
    assert.deepEqual(movedDown.map(s => s.setNumber), [1, 2, 3, 4]);

    // Boundary conditions: first set cannot move up, last set cannot move down
    assert.deepEqual(moveWorkoutSet(ex.sets, 'set-ex1-1', -1), ex.sets);
    assert.deepEqual(moveWorkoutSet(ex.sets, 'set-ex1-4', 1), ex.sets);
  });

  it('preserves all exercise metadata and completion states when reordering', () => {
    const ex1 = makeActiveExercise('ex1', 'Deadlift');
    const ex2 = makeActiveExercise('ex2', 'Barbell Row');
    ex1.notes = 'Seat pin 3';
    ex1.targetReps = '5';
    ex1.supersetId = 'ss-1';

    const reordered = moveActiveExerciseToIndex([ex1, ex2], 'active-ex1', 1);
    assert.equal(reordered[0].id, 'active-ex2');
    assert.equal(reordered[1].id, 'active-ex1');
    assert.equal(reordered[1].notes, 'Seat pin 3');
    assert.equal(reordered[1].targetReps, '5');
    assert.equal(reordered[1].supersetId, 'ss-1');
    assert.equal(reordered[1].sets.length, 3);
  });
});
