import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createStoreFixture } from '../helpers/storeFixture';
import { buildBackupJson } from '../../src/utils/backup';
import { restoreBackup } from '../../src/utils/restore';
import { Exercise, Routine, Workout } from '../../src/types';
import { WorkoutDraft } from '../../src/database/contract';

describe('Backup Roundtrip & Merge Safety', () => {
  async function populateSourceStore(store: any) {
    // 1. Create a custom exercise
    const customEx: Exercise = {
      id: 'custom-pause-squat',
      name: 'Pause Squat',
      category: 'legs',
      bodyPart: 'quads',
      equipment: 'barbell',
      targetMuscle: 'quadriceps',
      isCustom: true,
      instructions: ['Pause 2 seconds at the bottom'],
      primaryMuscles: ['quads'],
      secondaryMuscles: ['glutes'],
    };
    await store.createCustomExercise(customEx);

    // 2. Create routine with targets
    const routineId = await store.saveRoutine(
      'Upper Body Hypertrophy',
      'Upper / Lower',
      [
        {
          exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
          targetSets: 4,
          targetReps: '8-12',
          restTimerSeconds: 120,
        },
      ],
      'Focus on mind-muscle connection'
    );

    // 3. Create completed workout with:
    // - two occurrences of one exercise
    // - zero and fractional weights
    // - all set types ('normal', 'warmup', 'drop', 'failure')
    // - RPE
    // - notes
    const completedWorkout: Workout = {
      id: 'w-roundtrip-1',
      routineId,
      name: 'Upper Body Blast',
      startTime: '2026-09-07T08:00:00.000Z',
      endTime: '2026-09-07T09:15:00.000Z',
      durationSeconds: 4500,
      totalVolumeKg: 2500.5,
      notes: 'Great workout session',
      exercises: [
        {
          id: 'we-bench-occ0',
          exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
          orderIndex: 0,
          notes: 'Bench occurrence 1',
          restTimerSeconds: 120,
          targetReps: '8-12',
          exercise: {
            id: 'Barbell_Bench_Press_-_Medium_Grip',
            name: 'Bench Press (Barbell)',
            category: 'chest',
            bodyPart: 'chest',
            equipment: 'barbell',
            targetMuscle: 'pectorals',
          },
          sets: [
            { id: 's1', setNumber: 1, type: 'warmup', weightKg: 20, reps: 15, isCompleted: true, rpe: 5 },
            { id: 's2', setNumber: 2, type: 'normal', weightKg: 100, reps: 8, isCompleted: true, rpe: 8.5 },
            { id: 's3', setNumber: 3, type: 'drop', weightKg: 72.5, reps: 10, isCompleted: true, rpe: 9 },
            { id: 's4', setNumber: 4, type: 'failure', weightKg: 60, reps: 12, isCompleted: true, rpe: 10 },
          ],
        },
        {
          id: 'we-bench-occ1',
          exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
          orderIndex: 1,
          notes: 'Bench occurrence 2 (close grip variation)',
          restTimerSeconds: 90,
          exercise: {
            id: 'Barbell_Bench_Press_-_Medium_Grip',
            name: 'Bench Press (Barbell)',
            category: 'chest',
            bodyPart: 'chest',
            equipment: 'barbell',
            targetMuscle: 'pectorals',
          },
          sets: [
            { id: 's5', setNumber: 1, type: 'normal', weightKg: 0, reps: 20, isCompleted: true },
            { id: 's6', setNumber: 2, type: 'normal', weightKg: 12.25, reps: 15, isCompleted: true },
          ],
        },
      ],
    };
    await store.finishWorkout(completedWorkout);

    // 4. Save a draft
    const draft: WorkoutDraft = {
      version: 1,
      revision: 2,
      savedAt: '2026-09-07T09:30:00.000Z',
      restTimer: { endsAt: Date.now() + 60000, totalSeconds: 60 },
      workout: {
        id: 'draft-active-1',
        name: 'In-Progress Session',
        startTime: '2026-09-07T09:20:00.000Z',
        durationSeconds: 600,
        totalVolumeKg: 200,
        exercises: [
          {
            id: 'we-draft-1',
            exerciseId: 'custom-pause-squat',
            orderIndex: 0,
            exercise: customEx,
            sets: [
              { id: 'ds1', setNumber: 1, type: 'normal', weightKg: 100, reps: 2, isCompleted: true },
            ],
          },
        ],
      },
    };
    await store.saveDraft(draft);

    // 5. Settings
    await store.setSetting('unit', 'lb');
  }

  for (const [fromPlatform, toPlatform] of [
    ['native', 'native'],
    ['web', 'web'],
    ['native', 'web'],
    ['web', 'native'],
  ] as const) {
    it(`cross-platform roundtrip [${fromPlatform} -> ${toPlatform}] preserves semantic snapshot content`, async () => {
      const sourceFixture = await createStoreFixture(fromPlatform);
      const destFixture = await createStoreFixture(toPlatform);

      await populateSourceStore(sourceFixture.store);

      // Export snapshot
      const backupJson = await buildBackupJson(sourceFixture.store);

      // Restore into empty destination
      await restoreBackup(backupJson, destFixture.store);

      const sourceSnap = await sourceFixture.store.readSnapshot();
      const destSnap = await destFixture.store.readSnapshot();

      // Compare workouts
      assert.equal(destSnap.workouts.length, sourceSnap.workouts.length);
      const destW = destSnap.workouts[0];
      const srcW = sourceSnap.workouts[0];
      assert.equal(destW.id, srcW.id);
      assert.equal(destW.name, srcW.name);
      assert.equal(destW.totalVolumeKg, srcW.totalVolumeKg);
      assert.equal(destW.exercises.length, srcW.exercises.length);
      assert.equal(destW.exercises[0].sets.length, srcW.exercises[0].sets.length);
      assert.equal(destW.exercises[1].sets[0].weightKg, 0); // zero preserved!
      assert.equal(destW.exercises[1].sets[1].weightKg, 12.25); // fractional weight preserved!

      // Compare routines
      assert.equal(destSnap.routines.length, sourceSnap.routines.length);
      assert.equal(destSnap.routines[0].name, sourceSnap.routines[0].name);

      // Compare custom exercises
      const destCustom = destSnap.exercises.filter((e) => e.isCustom);
      const srcCustom = sourceSnap.exercises.filter((e) => e.isCustom);
      assert.equal(destCustom.length, srcCustom.length);
      assert.equal(destCustom[0].name, 'Pause Squat');

      // Compare drafts
      assert.equal(destSnap.drafts.length, sourceSnap.drafts.length);
      assert.equal(destSnap.drafts[0].workout.id, sourceSnap.drafts[0].workout.id);

      // Compare settings
      assert.equal(destSnap.settings.unit, 'lb');

      await sourceFixture.dispose();
      await destFixture.dispose();
    });
  }

  it('repeated import is idempotent and skips identical records without error', async () => {
    const fixture = await createStoreFixture('native');
    await populateSourceStore(fixture.store);

    const backupJson = await buildBackupJson(fixture.store);

    // Re-importing into the same store
    await restoreBackup(backupJson, fixture.store);

    const snap = await fixture.store.readSnapshot();
    assert.equal(snap.workouts.length, 1);
    assert.equal(snap.drafts.length, 1);

    await fixture.dispose();
  });

  it('conflicting record ID aborts restore without modifying destination', async () => {
    const fixture = await createStoreFixture('native');
    await populateSourceStore(fixture.store);

    const backupJson = await buildBackupJson(fixture.store);
    const parsed = JSON.parse(backupJson);

    // Create a conflict: same workout ID, but different name
    parsed.workouts[0].name = 'Conflicting Modified Name';
    const conflictingJson = JSON.stringify(parsed);

    // Attempting restore must reject with conflict error
    await assert.rejects(async () => {
      await restoreBackup(conflictingJson, fixture.store);
    }, /Conflicting/);

    // Destination remains unmodified
    const snap = await fixture.store.readSnapshot();
    assert.equal(snap.workouts[0].name, 'Upper Body Blast');

    await fixture.dispose();
  });
});
