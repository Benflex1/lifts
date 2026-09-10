import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Exercise, ExerciseGymScope, Workout } from '../../src/types';
import { calculate1RM } from '../../src/utils/calculator';
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

  it('aggregates full records, ignores incomplete sets, and counts duplicate occurrences once', () => {
    const workouts: Workout[] = [
      {
        ...completedWorkouts[0],
        exercises: [
          completedWorkouts[0].exercises[0],
          {
            ...completedWorkouts[0].exercises[0],
            id: 'occ-a-duplicate',
            sets: [
              { id: 'set-a-2', setNumber: 1, type: 'normal', weightKg: 50, reps: 5, isCompleted: true },
              { id: 'set-a-incomplete', setNumber: 2, type: 'normal', weightKg: 100, reps: 20, isCompleted: false },
            ],
          },
        ],
      },
      completedWorkouts[1],
    ];

    const stats = calculateDualExerciseStats(workouts, machine.id, 'gym-a');
    assert.equal(stats.global.maxWeightKg, 50);
    assert.equal(stats.global.maxSetVolumeKg, 360);
    assert.equal(stats.global.maxReps, 10);
    assert.equal(
      stats.global.estimated1RM,
      Math.max(calculate1RM(45, 8).average, calculate1RM(50, 5).average, calculate1RM(30, 10).average)
    );
    assert.equal(stats.global.sessionCount, 2);
    assert.equal(stats.gym.maxSetVolumeKg, 360);
    assert.equal(stats.gym.maxReps, 8);
    assert.equal(stats.gym.sessionCount, 1);
  });

  it('limits gym records to linked gyms while global scope includes every gym', () => {
    const gymCWorkout: Workout = {
      ...completedWorkouts[1],
      id: 'w-c',
      gymId: 'gym-c',
      exercises: [{
        ...completedWorkouts[1].exercises[0],
        sets: [{ id: 'set-c', setNumber: 1, type: 'normal', weightKg: 60, reps: 4, isCompleted: true }],
      }],
    };
    const workouts = [...completedWorkouts, gymCWorkout];
    const linked: ExerciseGymScope = {
      exerciseId: machine.id,
      scopeType: 'linked_group',
      linkedGymIds: ['gym-a', 'gym-b'],
    };
    const global: ExerciseGymScope = { exerciseId: machine.id, scopeType: 'global' };

    assert.equal(calculateDualExerciseStats(workouts, machine.id, 'gym-c', linked).gym.maxWeightKg, 45);
    assert.equal(calculateDualExerciseStats(workouts, machine.id, 'gym-c', linked).gym.sessionCount, 2);
    assert.equal(calculateDualExerciseStats(workouts, machine.id, 'gym-c', global).gym.maxWeightKg, 60);
    assert.equal(calculateDualExerciseStats(workouts, machine.id, 'gym-c', global).gym.sessionCount, 3);
  });

  it('returns zero-filled records when no completed set matches', () => {
    const incompleteWorkout: Workout = {
      ...completedWorkouts[0],
      id: 'w-incomplete',
      exercises: [{
        ...completedWorkouts[0].exercises[0],
        sets: [{ id: 'set-incomplete', setNumber: 1, type: 'normal', weightKg: 100, reps: 10, isCompleted: false }],
      }],
    };

    assert.deepEqual(
      calculateDualExerciseStats([incompleteWorkout], machine.id, 'gym-a'),
      {
        global: { maxWeightKg: 0, maxSetVolumeKg: 0, maxReps: 0, estimated1RM: 0, sessionCount: 0 },
        gym: { maxWeightKg: 0, maxSetVolumeKg: 0, maxReps: 0, estimated1RM: 0, sessionCount: 0 },
      }
    );
    assert.deepEqual(
      calculateDualExerciseStats([], machine.id, 'gym-a'),
      {
        global: { maxWeightKg: 0, maxSetVolumeKg: 0, maxReps: 0, estimated1RM: 0, sessionCount: 0 },
        gym: { maxWeightKg: 0, maxSetVolumeKg: 0, maxReps: 0, estimated1RM: 0, sessionCount: 0 },
      }
    );
  });
});
