import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Exercise, ExerciseGymScope } from '../../src/types';
import {
  CompletedExerciseOccurrence,
  resolvePreviousSetsForExercise,
} from '../../src/workout/gym-history';

const machine: Exercise = {
  id: 'lat-machine', name: 'Lat Machine', category: 'strength', equipment: 'machine', primaryMuscles: ['lats'],
};
const barbell: Exercise = {
  id: 'barbell-row', name: 'Barbell Row', category: 'strength', equipment: 'barbell', primaryMuscles: ['back'],
};
const occurrence = (
  workoutId: string,
  startTime: string,
  gymId: string,
  gymName: string,
  weightKg: number,
  reps: number
): CompletedExerciseOccurrence => ({
  workoutId,
  startTime,
  gymId,
  gymName,
  occurrenceIndex: 0,
  sets: [{ weightKg, reps }],
});

describe('gym-aware previous-set resolution', () => {
  const history = [
    occurrence('w-b', '2026-09-10T10:00:00.000Z', 'gym-b', 'McFit', 35, 10),
    occurrence('w-a', '2026-09-09T10:00:00.000Z', 'gym-a', 'FitX', 45, 8),
  ];

  it('uses matching gym history for a machine', () => {
    const [suggestion] = resolvePreviousSetsForExercise(machine, history, 'gym-a');
    assert.equal(suggestion.weightKg, 45);
    assert.equal(suggestion.sourceGymName, undefined);
  });

  it('labels the latest foreign fallback when the current gym has no history', () => {
    const [suggestion] = resolvePreviousSetsForExercise(machine, history, 'gym-c');
    assert.equal(suggestion.weightKg, 35);
    assert.equal(suggestion.sourceGymId, 'gym-b');
    assert.equal(suggestion.sourceGymName, 'McFit');
  });

  it('uses all gyms without a source label for global equipment', () => {
    const [suggestion] = resolvePreviousSetsForExercise(barbell, history, 'gym-c');
    assert.equal(suggestion.weightKg, 35);
    assert.equal(suggestion.sourceGymName, undefined);
  });

  it('restricts linked groups to their allowed gyms before falling back', () => {
    const scope: ExerciseGymScope = {
      exerciseId: machine.id,
      scopeType: 'linked_group',
      linkedGymIds: ['gym-a', 'gym-b'],
    };
    const [suggestion] = resolvePreviousSetsForExercise(machine, history, 'gym-c', scope);
    assert.equal(suggestion.sourceGymName, undefined);
  });

  it('falls back to the first completed occurrence when the newest occurrence is empty', () => {
    const emptyNewest = occurrence('w-new', '2026-09-11T10:00:00.000Z', 'gym-c', 'Other', 0, 0);
    emptyNewest.sets = [];

    const [suggestion] = resolvePreviousSetsForExercise(
      machine,
      [emptyNewest, history[1]],
      'gym-c'
    );

    assert.equal(suggestion.weightKg, 45);
    assert.equal(suggestion.reps, 8);
    assert.equal(suggestion.sourceGymId, 'gym-a');
    assert.equal(suggestion.sourceGymName, 'FitX');
  });
});
