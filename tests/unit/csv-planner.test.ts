import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { computeCsvImportPlan } from '../../src/utils/importer/import-planner';
import { DataSnapshot } from '../../src/database/contract';
import { DEFAULT_EXERCISES } from '../../src/database/seedData';

describe('CSV Import Planner', () => {
  const baseSnapshot: DataSnapshot = {
    workouts: [
      {
        id: 'existing-w-1',
        name: 'Existing Push Day',
        gymId: 'gym-default',
        startTime: '2024-05-20T18:00:00.000Z',
        durationSeconds: 3600,
        totalVolumeKg: 1000,
        exercises: [],
      },
    ],
    routines: [],
    exercises: DEFAULT_EXERCISES,
    drafts: [],
    settings: {},
    gyms: [
      {
        id: 'gym-default',
        name: 'Default Gym',
        isDefault: true,
        color: '#3B82F6',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'gym-secondary',
        name: 'Secondary Gym',
        isDefault: false,
        color: '#10B981',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    exerciseGymScopes: [],
  };

  const csv = `"title","start_time","end_time","description","exercise_title","set_index","set_type","weight_kg","reps","rpe"
"New Workout","2024-06-01T10:00:00.000Z","2024-06-01T11:00:00.000Z","","Bench Press (Barbell)",1,"normal",100,8,8
"Existing Workout","2024-05-20T18:00:00.000Z","2024-05-20T19:00:00.000Z","","Bench Press (Barbell)",1,"normal",90,8,8`;

  it('detects duplicate workouts and skips them when skipExistingWorkouts is true', () => {
    const plan = computeCsvImportPlan(csv, baseSnapshot, {
      targetGymId: 'gym-secondary',
      skipExistingWorkouts: true,
    });

    assert.equal(plan.totalWorkouts, 2);
    assert.equal(plan.duplicateWorkoutsCount, 1);
    assert.equal(plan.newWorkoutsCount, 1);
    assert.equal(plan.snapshotToMerge.workouts.length, 1);
    assert.equal(plan.snapshotToMerge.workouts[0].name, 'New Workout');
    assert.equal(plan.snapshotToMerge.workouts[0].gymId, 'gym-secondary');
  });

  it('imports duplicate workouts with new IDs when skipExistingWorkouts is false', () => {
    const plan = computeCsvImportPlan(csv, baseSnapshot, {
      targetGymId: 'gym-secondary',
      skipExistingWorkouts: false,
    });

    assert.equal(plan.totalWorkouts, 2);
    assert.equal(plan.duplicateWorkoutsCount, 1);
    assert.equal(plan.newWorkoutsCount, 2);
    assert.equal(plan.snapshotToMerge.workouts.length, 2);
  });

  it('computes correct date range and volume', () => {
    const plan = computeCsvImportPlan(csv, baseSnapshot, {
      targetGymId: 'gym-default',
      skipExistingWorkouts: false,
    });

    assert.ok(plan.dateRange);
    assert.equal(plan.dateRange?.start, '2024-05-20');
    assert.equal(plan.dateRange?.end, '2024-06-01');

    const firstWorkout = plan.snapshotToMerge.workouts.find(w => w.name === 'New Workout');
    assert.ok(firstWorkout);
    // 100 kg * 8 reps = 800 kg
    assert.equal(firstWorkout?.totalVolumeKg, 800);
  });
});
