import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createStoreFixture } from '../helpers/storeFixture';
import { computeCsvImportPlan } from '../../src/utils/importer/import-planner';
import { getBundledExercise } from '../../src/database/seedData';

const PLATFORMS = ['native', 'web'] as const;

describe('CSV Importer End-to-End Integration', () => {
  for (const platform of PLATFORMS) {
    it(`[${platform}] imports workout history, creates custom exercises, updates history and PR stats`, async () => {
      const fixture = await createStoreFixture(platform);
      const store = fixture.store;

      try {
        const defaultGym = await store.getDefaultGym();
        const initialSnapshot = await store.readSnapshot();

        // Realistic Hevy/Strong CSV containing a bundled exercise (Bench Press) and a custom movement
        const csv = `"title","start_time","end_time","description","exercise_title","set_index","set_type","weight_kg","reps","rpe"
"Heavy Push Day","2024-04-10T17:00:00.000Z","2024-04-10T18:15:00.000Z","Great workout","Bench Press (Barbell)",1,"warmup",60,10,
"Heavy Push Day","2024-04-10T17:00:00.000Z","2024-04-10T18:15:00.000Z","Great workout","Bench Press (Barbell)",2,"normal",100,8,8.5
"Heavy Push Day","2024-04-10T17:00:00.000Z","2024-04-10T18:15:00.000Z","Great workout","Bench Press (Barbell)",3,"normal",105,6,9.5
"Heavy Push Day","2024-04-10T17:00:00.000Z","2024-04-10T18:15:00.000Z","Great workout","Custom Belt Squat Machine",1,"normal",120,10,8
"Heavy Push Day","2024-04-10T17:00:00.000Z","2024-04-10T18:15:00.000Z","Great workout","Custom Belt Squat Machine",2,"normal",140,8,9`;

        // 1. Compute Plan
        const plan = computeCsvImportPlan(csv, initialSnapshot, {
          targetGymId: defaultGym.id,
          skipExistingWorkouts: true,
        });

        assert.equal(plan.detectedFormat, 'hevy');
        assert.equal(plan.totalWorkouts, 1);
        assert.equal(plan.totalSets, 5);
        assert.equal(plan.newWorkoutsCount, 1);
        assert.equal(plan.newCustomExercisesCount, 1);
        assert.equal(plan.snapshotToMerge.exercises[0].name, 'Custom Belt Squat Machine');

        // 2. Commit merge
        await store.mergeSnapshot(plan.snapshotToMerge);

        // 3. Verify history
        const history = await store.getWorkoutHistory();
        assert.equal(history.length, 1);
        assert.equal(history[0].name, 'Heavy Push Day');
        assert.equal(history[0].totalSets, 5);
        // Total Volume: (60*10) + (100*8) + (105*6) + (120*10) + (140*8) = 600 + 800 + 630 + 1200 + 1120 = 4350 kg
        assert.equal(history[0].totalVolumeKg, 4350);

        // 4. Verify workout details
        const detail = await store.getWorkoutDetail(history[0].id);
        assert.ok(detail);
        assert.equal(detail?.exercises.length, 2);

        const benchExercise = detail?.exercises[0];
        assert.equal(benchExercise?.exercise.id, 'Barbell_Bench_Press_-_Medium_Grip');
        assert.equal(benchExercise?.sets.length, 3);
        assert.equal(benchExercise?.sets[0].type, 'warmup');
        assert.equal(benchExercise?.sets[1].weightKg, 100);
        assert.equal(benchExercise?.sets[2].weightKg, 105);
        assert.equal(benchExercise?.sets[2].rpe, 9.5);

        const customExercise = detail?.exercises[1];
        assert.equal(customExercise?.exercise.name, 'Custom Belt Squat Machine');
        assert.equal(customExercise?.exercise.isCustom, true);
        assert.equal(customExercise?.sets.length, 2);
        assert.equal(customExercise?.sets[1].weightKg, 140);

        // 5. Verify PR / Stats calculation reflects imported workouts
        const benchStats = await store.getExerciseStats('Barbell_Bench_Press_-_Medium_Grip');
        assert.equal(benchStats.global.maxWeightKg, 105);
        assert.equal(benchStats.global.sessionCount, 1);

        // 6. Test duplicate prevention on re-import
        const secondSnapshot = await store.readSnapshot();
        const reimportPlan = computeCsvImportPlan(csv, secondSnapshot, {
          targetGymId: defaultGym.id,
          skipExistingWorkouts: true,
        });

        assert.equal(reimportPlan.totalWorkouts, 1);
        assert.equal(reimportPlan.duplicateWorkoutsCount, 1);
        assert.equal(reimportPlan.newWorkoutsCount, 0);
        assert.equal(reimportPlan.snapshotToMerge.workouts.length, 0);
      } finally {
        await fixture.dispose();
      }
    });

    it(`[${platform}] allows manual exercise reassignments during import planning and skips unnecessary custom exercise creation`, async () => {
      const fixture = await createStoreFixture(platform);
      const store = fixture.store;

      try {
        const defaultGym = await store.getDefaultGym();
        const initialSnapshot = await store.readSnapshot();

        const csv = `"title","start_time","end_time","description","exercise_title","set_index","set_type","weight_kg","reps","rpe"
"Leg Day","2024-06-15T10:00:00.000Z","2024-06-15T11:00:00.000Z","Quad focus","Custom Belt Squat Machine",1,"normal",150,10,8
"Leg Day","2024-06-15T10:00:00.000Z","2024-06-15T11:00:00.000Z","Quad focus","Custom Belt Squat Machine",2,"normal",170,8,9`;

        // User chooses to assign "Custom Belt Squat Machine" to standard "Leg Press"
        const legPress = getBundledExercise('Leg_Press');

        const plan = computeCsvImportPlan(csv, initialSnapshot, {
          targetGymId: defaultGym.id,
          exerciseOverrides: {
            'custom belt squat machine': legPress,
          },
        });

        assert.equal(plan.totalWorkouts, 1);
        assert.equal(plan.newWorkoutsCount, 1);
        assert.equal(plan.matchedExercisesCount, 1);
        assert.equal(plan.newCustomExercisesCount, 0);
        assert.equal(plan.snapshotToMerge.exercises.length, 0);

        const assignment = plan.exerciseAssignments.find(ea => ea.rawName === 'Custom Belt Squat Machine');
        assert.ok(assignment);
        assert.equal(assignment?.isCustom, false);
        assert.equal(assignment?.confidence, 'manual');
        assert.equal(assignment?.assignedExercise.id, 'Leg_Press');

        // Merge snapshot
        await store.mergeSnapshot(plan.snapshotToMerge);

        // Verify imported workout links to Leg Press
        const history = await store.getWorkoutHistory();
        assert.equal(history.length, 1);
        const detail = await store.getWorkoutDetail(history[0].id);
        assert.ok(detail);
        assert.equal(detail?.exercises.length, 1);
        assert.equal(detail?.exercises[0].exercise.id, 'Leg_Press');
        assert.equal(detail?.exercises[0].sets.length, 2);

        // Verify store has 0 custom exercises created
        const updatedSnapshot = await store.readSnapshot();
        const customCount = updatedSnapshot.exercises.filter(e => e.isCustom).length;
        assert.equal(customCount, 0);

        // Verify Leg Press exercise stats updated
        const stats = await store.getExerciseStats('Leg_Press');
        assert.equal(stats.global.maxWeightKg, 170);
        assert.equal(stats.global.sessionCount, 1);
      } finally {
        await fixture.dispose();
      }
    });
  }
});
