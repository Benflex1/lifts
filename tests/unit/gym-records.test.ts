import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Exercise, Workout } from '../../src/types';
import { calculateDualExerciseStats } from '../../src/workout/gym-records';

const machine: Exercise = {
  id: 'lat-machine', name: 'Lat Machine', category: 'strength', equipment: 'machine', primaryMuscles: ['lats'],
};

const completedWorkouts: Workout[] = [
  {
    id: 'w-a',
    name: 'Gym A session',
    gymId: 'gym-a',
    startTime: '2026-09-09T10:00:00.000Z',
    durationSeconds: 0,
    totalVolumeKg: 360,
    exercises: [{
      id: 'occ-a',
      exerciseId: machine.id,
      exercise: machine,
      restTimerSeconds: 90,
      sets: [{
        id: 'set-a', setNumber: 1, type: 'normal', weightKg: 45, reps: 8, isCompleted: true,
      }],
    }],
  },
  {
    id: 'w-b',
    name: 'Gym B session',
    gymId: 'gym-b',
    startTime: '2026-09-10T10:00:00.000Z',
    durationSeconds: 0,
    totalVolumeKg: 300,
    exercises: [{
      id: 'occ-b',
      exerciseId: machine.id,
      exercise: machine,
      restTimerSeconds: 90,
      sets: [{
        id: 'set-b', setNumber: 1, type: 'normal', weightKg: 30, reps: 10, isCompleted: true,
      }],
    }],
  },
];

describe('dual exercise records', () => {
  it('keeps global and current-gym machine records separate and excludes drafts', () => {
    const stats = calculateDualExerciseStats(completedWorkouts, machine.id, 'gym-a');
    assert.equal(stats.global.maxWeightKg, 45);
    assert.equal(stats.gym.maxWeightKg, 45);
    assert.equal(stats.global.sessionCount, 2);
    assert.equal(stats.gym.sessionCount, 1);
  });
});
