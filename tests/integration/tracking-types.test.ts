import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createStoreFixture, NodeSqliteDriver } from '../helpers/storeFixture';
import { applyMigrations } from '../../src/database/migrations';
import { createNativeStore } from '../../src/database/nativeStore';
import { buildBackupJson, parseBackup } from '../../src/utils/backup';
import { computeRestorePlan, restoreBackup } from '../../src/utils/restore';
import { computeCsvImportPlan } from '../../src/utils/importer/import-planner';
import { parseWorkoutCsv } from '../../src/utils/importer/csv-parser';
import { EXERCISE_TRACKING_TYPES_KEY } from '../../src/workout/tracking';
import { Workout } from '../../src/types';

async function exerciseById(store: Awaited<ReturnType<typeof createStoreFixture>>['store'], id: string) {
  const exercise = await store.getExerciseById(id);
  assert.ok(exercise, `missing exercise ${id}`);
  return exercise!;
}

async function trackedWorkout(store: Awaited<ReturnType<typeof createStoreFixture>>['store']): Promise<Workout> {
  const plank = await exerciseById(store, 'Plank');
  const run = await exerciseById(store, 'Running_Treadmill');
  const bench = await exerciseById(store, 'Barbell_Bench_Press_-_Medium_Grip');
  return {
    id: 'wo-tracked',
    name: 'Mixed',
    gymId: 'gym-default',
    startTime: '2026-10-01T10:00:00.000Z',
    endTime: '2026-10-01T11:00:00.000Z',
    durationSeconds: 3600,
    totalVolumeKg: 500,
    exercises: [
      {
        id: 'ae-bench', exerciseId: bench.id, exercise: bench, restTimerSeconds: 90,
        sets: [{ id: 'set-bench', setNumber: 1, type: 'normal', weightKg: 100, reps: 5, isCompleted: true, completedAt: '2026-10-01T10:05:00.000Z' }],
      },
      {
        id: 'ae-plank', exerciseId: plank.id, exercise: plank, restTimerSeconds: 60, trackingType: 'duration',
        sets: [{ id: 'set-plank', setNumber: 1, type: 'normal', weightKg: 0, reps: 0, durationSeconds: 75, isCompleted: true, completedAt: '2026-10-01T10:20:00.000Z' }],
      },
      {
        id: 'ae-run', exerciseId: run.id, exercise: run, restTimerSeconds: 0, trackingType: 'distance_duration',
        sets: [{ id: 'set-run', setNumber: 1, type: 'normal', weightKg: 0, reps: 0, durationSeconds: 1500, distanceM: 5000, isCompleted: true, completedAt: '2026-10-01T10:50:00.000Z' }],
      },
    ],
  };
}

for (const platform of ['native', 'web'] as const) {
  describe(`tracking types on ${platform}`, () => {
    it('round-trips tracked sets through storage and previous-set suggestions', async () => {
      const fixture = await createStoreFixture(platform);
      try {
        await fixture.store.saveCompletedWorkout(await trackedWorkout(fixture.store));
        const detail = await fixture.store.getWorkoutDetail('wo-tracked');
        const byId = new Map(detail!.exercises.map((exercise) => [exercise.id, exercise]));
        assert.equal(byId.get('ae-bench')!.trackingType, undefined);
        assert.equal('durationSeconds' in byId.get('ae-bench')!.sets[0], false);
        assert.equal(byId.get('ae-plank')!.trackingType, 'duration');
        assert.equal(byId.get('ae-plank')!.sets[0].durationSeconds, 75);
        assert.equal(byId.get('ae-run')!.trackingType, 'distance_duration');
        assert.equal(byId.get('ae-run')!.sets[0].distanceM, 5000);

        const [previous] = await fixture.store.getPreviousSetsForExercise('Running_Treadmill', 0, 'gym-default');
        assert.equal(previous.durationSeconds, 1500);
        assert.equal(previous.distanceM, 5000);

        const history = await fixture.store.getCompletedWorkoutsForExercise('Plank');
        const plankOccurrence = history[0].exercises.find((exercise) => exercise.exerciseId === 'Plank')!;
        assert.equal(plankOccurrence.trackingType, 'duration');
        assert.equal(plankOccurrence.sets[0].durationSeconds, 75);
      } finally {
        await fixture.dispose();
      }
    });

    it('writes version 4 backups only when they hold tracked sets and restores them', async () => {
      const source = await createStoreFixture(platform);
      const target = await createStoreFixture(platform);
      try {
        assert.equal(JSON.parse(await buildBackupJson(source.store)).version, 3);

        await source.store.saveCompletedWorkout(await trackedWorkout(source.store));
        await source.store.setSetting(EXERCISE_TRACKING_TYPES_KEY, '{"Pushups":"weighted_bodyweight","Plank":"duration"}');
        await target.store.setSetting(EXERCISE_TRACKING_TYPES_KEY, '{"Plank":"bodyweight_reps"}');
        const json = await buildBackupJson(source.store);
        assert.equal(parseBackup(json).version, 4);

        await restoreBackup(json, target.store);
        const restored = await target.store.getWorkoutDetail('wo-tracked');
        const run = restored!.exercises.find((exercise) => exercise.id === 'ae-run')!;
        assert.equal(run.trackingType, 'distance_duration');
        assert.equal(run.sets[0].durationSeconds, 1500);
        assert.deepEqual(JSON.parse((await target.store.getSetting(EXERCISE_TRACKING_TYPES_KEY))!), {
          Plank: 'bodyweight_reps',
          Pushups: 'weighted_bodyweight',
        });

        // Restoring the same backup again finds the tracked workout identical and skips it.
        const { preview } = await computeRestorePlan(parseBackup(json), target.store);
        assert.equal(preview.skippedWorkoutsCount, 1);
      } finally {
        await source.dispose();
        await target.dispose();
      }
    });
  });
}

describe('tracking type storage migration', () => {
  it('adds empty columns and leaves existing sets reading as weight and reps', async () => {
    const driver = new NodeSqliteDriver();
    await applyMigrations(driver, { maxVersion: 8 });
    await driver.runAsync(
      `INSERT INTO exercises (id, name, category, equipment, primary_muscles) VALUES ('Bench', 'Bench', 'strength', 'barbell', '["chest"]')`,
    );
    await driver.runAsync(
      `INSERT INTO workouts (id, name, start_time, gym_id, in_progress) VALUES ('w1', 'Old', '2026-01-01T10:00:00.000Z', 'gym-default', 0)`,
    );
    await driver.runAsync(`INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index) VALUES ('we1', 'w1', 'Bench', 0)`);
    await driver.runAsync(
      `INSERT INTO exercise_sets (id, workout_exercise_id, set_number, weight_kg, reps, is_completed) VALUES ('s1', 'we1', 1, 80, 8, 1)`,
    );

    const store = createNativeStore(driver);
    await store.init();
    const detail = await store.getWorkoutDetail('w1');
    assert.equal(detail!.exercises[0].trackingType, undefined);
    assert.deepEqual(
      { weightKg: detail!.exercises[0].sets[0].weightKg, reps: detail!.exercises[0].sets[0].reps },
      { weightKg: 80, reps: 8 },
    );
    assert.equal('durationSeconds' in detail!.exercises[0].sets[0], false);
    driver.close();
  });

  it('rolls back migration 9 when it fails', async () => {
    const driver = new NodeSqliteDriver();
    await applyMigrations(driver, { maxVersion: 8 });
    await assert.rejects(applyMigrations(driver, { failAtVersion: 9 }), /version 9/);
    const columns = await driver.getAllAsync<{ name: string }>('PRAGMA table_info(exercise_sets);');
    assert.equal(columns.some((column) => column.name === 'duration_seconds'), false);
    driver.close();
  });
});

describe('CSV import of time and distance', () => {
  it('reads Strong seconds and distance columns onto sets', () => {
    const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Weight Unit,Reps,RPE,Distance,Distance Unit,Seconds,Notes,Workout Notes
2024-07-01 08:00:00,Cardio,45m,Plank,1,0,kg,0,,,,60,,
2024-07-01 08:00:00,Cardio,45m,Running (Treadmill),1,0,kg,0,,5,km,1500,,
2024-07-01 08:00:00,Cardio,45m,Bench Press (Barbell),1,100,kg,5,,,,,,`;
    const { sessions } = parseWorkoutCsv(csv);
    assert.equal(sessions[0].durationSeconds, 2700);
    const [plank, run, bench] = sessions[0].exerciseGroups;
    assert.equal(plank.sets[0].durationSeconds, 60);
    assert.equal(run.sets[0].distanceM, 5000);
    assert.equal(run.sets[0].durationSeconds, 1500);
    assert.equal('durationSeconds' in bench.sets[0], false);
  });

  it('treats Hevy duration_seconds as set time, not workout duration', () => {
    const csv = `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
"Core","15 Jul 2024, 09:30","15 Jul 2024, 10:00","","Plank",,,1,"normal",,,,90,`;
    const { sessions } = parseWorkoutCsv(csv);
    assert.equal(sessions[0].exerciseGroups[0].sets[0].durationSeconds, 90);
    assert.notEqual(sessions[0].durationSeconds, 90 * 60);
  });

  it('imports time-only and distance exercises with matching tracking types', async () => {
    const fixture = await createStoreFixture('native');
    try {
      const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Weight Unit,Reps,RPE,Distance,Distance Unit,Seconds,Notes,Workout Notes
2024-07-01 08:00:00,Cardio,45m,Plank,1,0,kg,0,,,,60,,
2024-07-01 08:00:00,Cardio,45m,Running (Treadmill),1,0,kg,0,,5,km,1500,,
2024-07-01 08:00:00,Cardio,45m,Bench Press (Barbell),1,100,kg,5,,,,,,`;
      const plan = computeCsvImportPlan(csv, await fixture.store.readSnapshot(), { targetGymId: 'gym-default' });
      const [workout] = plan.snapshotToMerge.workouts;
      assert.deepEqual(workout.exercises.map((exercise) => exercise.trackingType), ['duration', 'distance_duration', undefined]);
      assert.equal(workout.totalVolumeKg, 500);
    } finally {
      await fixture.dispose();
    }
  });
});
