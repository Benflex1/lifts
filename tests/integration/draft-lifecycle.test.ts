import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createStoreFixture } from '../helpers/storeFixture';
import { createSessionController } from '../../src/workout/session';
import { Workout } from '../../src/types';

describe('Draft Lifecycle Integration', () => {
  for (const platform of ['native', 'web'] as const) {
    it(`[${platform}] full session lifecycle: start, update, reload, resume, finish leaves zero drafts`, async () => {
      let currentTime = new Date('2026-09-07T10:00:00.000Z').getTime();
      const fixture = await createStoreFixture(platform);
      const alternateGym = await fixture.store.createGym('Garage Gym');

      const controller = createSessionController(fixture.store, () => currentTime);

      const workout: Workout = {
        id: `session-${platform}-1`,
        name: 'Full Body A',
        gymId: alternateGym.id,
        startTime: new Date(currentTime).toISOString(),
        durationSeconds: 0,
        totalVolumeKg: 0,
        exercises: [],
      };

      // 1. Start workout
      await controller.start(workout);

      // Verify draft persisted immediately in store
      const draftsAfterStart = await fixture.store.getWorkoutDrafts();
      assert.equal(draftsAfterStart.length, 1);
      assert.equal(draftsAfterStart[0].workout.id, workout.id);
      assert.equal(draftsAfterStart[0].workout.gymId, alternateGym.id);

      // 2. Add an exercise and sets, update controller and flush
      currentTime += 60_000;
      const updatedWorkout: Workout = {
        ...workout,
        durationSeconds: 60,
        totalVolumeKg: 1000,
        exercises: [
          {
            id: 'we-1',
            exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
            exercise: {
              id: 'Barbell_Bench_Press_-_Medium_Grip',
              name: 'Barbell Bench Press',
              category: 'Chest',
              equipment: 'Barbell',
              primaryMuscles: ['Chest'],
            },
            sets: [
              {
                id: 's-1',
                setNumber: 1,
                type: 'normal',
                weightKg: 100,
                reps: 10,
                isCompleted: true,
                completedAt: new Date(currentTime).toISOString(),
              },
            ],
          },
        ],
      };
      controller.update(updatedWorkout);
      await controller.flush();

      // 3. Simulate app kill/reload by reopening the store
      const reopenedStore = await fixture.reopen();
      const loadedDrafts = await reopenedStore.getWorkoutDrafts();
      assert.equal(loadedDrafts.length, 1);
      assert.equal(loadedDrafts[0].workout.name, 'Full Body A');
      assert.equal(loadedDrafts[0].workout.gymId, alternateGym.id);
      assert.equal(loadedDrafts[0].workout.exercises.length, 1);
      assert.equal(loadedDrafts[0].workout.exercises[0].sets.length, 1);

      // 4. Resume draft with new controller connected to reopened store
      currentTime += 600_000; // 10 minutes later
      const controller2 = createSessionController(reopenedStore, () => currentTime);
      controller2.resume(loadedDrafts[0]);

      assert.equal(controller2.getState().phase, 'active');
      assert.equal(controller2.getState().workout?.id, workout.id);
      assert.equal(controller2.getState().workout?.startTime, workout.startTime);
      assert.equal(controller2.getState().workout?.gymId, alternateGym.id);
      // Duration should be total wall clock time: 660 seconds
      assert.equal(controller2.getState().workout?.durationSeconds, 660);

      // 5. Finish workout
      currentTime += 120_000; // 2 minutes later
      const finished = await controller2.finish();
      assert.equal(finished.id, workout.id);
      assert.equal(finished.durationSeconds, 780);

      // 6. Verify durable state: draft is deleted, completed workout is in history
      const draftsAfterFinish = await reopenedStore.getWorkoutDrafts();
      assert.equal(draftsAfterFinish.length, 0, 'No drafts must remain after finish');

      const history = await reopenedStore.getWorkoutHistory();
      assert.equal(history.length, 1);
      assert.equal(history[0].id, workout.id);
      assert.equal(history[0].gymId, alternateGym.id);

      const detail = await reopenedStore.getWorkoutDetail(workout.id);
      assert.ok(detail);
      assert.equal(detail?.exercises[0].sets[0].weightKg, 100);

      // 7. Second reload must NOT resurrect any draft
      const reloadedStoreAgain = await fixture.reopen();
      const draftsAfterSecondReload = await reloadedStoreAgain.getWorkoutDrafts();
      assert.equal(draftsAfterSecondReload.length, 0);

      await fixture.dispose();
    });

    it(`[${platform}] resuming one draft preserves other drafts in store`, async () => {
      const fixture = await createStoreFixture(platform);

      // Save two drafts manually
      await fixture.store.saveDraft({
        version: 1,
        workout: {
          id: `draft-A-${platform}`,
          name: 'Draft A',
          gymId: 'gym-default',
          startTime: '2026-09-07T08:00:00.000Z',
          durationSeconds: 300,
          totalVolumeKg: 100,
          exercises: [],
        },
        savedAt: '2026-09-07T08:05:00.000Z',
        revision: 1,
        restTimer: null,
      });

      await fixture.store.saveDraft({
        version: 1,
        workout: {
          id: `draft-B-${platform}`,
          name: 'Draft B',
          gymId: 'gym-default',
          startTime: '2026-09-07T09:00:00.000Z',
          durationSeconds: 600,
          totalVolumeKg: 200,
          exercises: [],
        },
        savedAt: '2026-09-07T09:10:00.000Z',
        revision: 1,
        restTimer: null,
      });

      const allDrafts = await fixture.store.getWorkoutDrafts();
      assert.equal(allDrafts.length, 2);

      // Resume Draft B
      const draftB = allDrafts.find(d => d.workout.id === `draft-B-${platform}`)!;
      const controller = createSessionController(fixture.store, () => Date.now());
      controller.resume(draftB);

      // Finish Draft B
      await controller.finish();

      // Draft A must still exist in the store!
      const remainingDrafts = await fixture.store.getWorkoutDrafts();
      assert.equal(remainingDrafts.length, 1);
      assert.equal(remainingDrafts[0].workout.id, `draft-A-${platform}`);

      await fixture.dispose();
    });

    it(`[${platform}] preserves 0 kg weight, target labels, and repeated exercise occurrences`, async () => {
      const fixture = await createStoreFixture(platform);

      const workout: Workout = {
        id: `workout-zero-${platform}`,
        name: 'Zero Kg and Repeated Occurrences',
        gymId: 'gym-default',
        startTime: '2026-09-07T11:00:00.000Z',
        endTime: '2026-09-07T11:30:00.000Z',
        durationSeconds: 1800,
        totalVolumeKg: 640,
        exercises: [
          {
            id: `ae-occ-0-${platform}`,
            exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
            targetReps: '6-8',
            restTimerSeconds: 120,
            exercise: {
              id: 'Barbell_Bench_Press_-_Medium_Grip',
              name: 'Barbell Bench Press',
              category: 'Chest',
              equipment: 'Barbell',
              primaryMuscles: ['Chest'],
            },
            sets: [
              {
                id: `s-zero-1-${platform}`,
                setNumber: 1,
                type: 'normal',
                weightKg: 0,
                reps: 8,
                targetReps: '6-8',
                isCompleted: true,
                completedAt: '2026-09-07T11:05:00.000Z',
              },
            ],
          },
          {
            id: `ae-occ-1-${platform}`,
            exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
            targetReps: 'AMRAP',
            restTimerSeconds: 90,
            exercise: {
              id: 'Barbell_Bench_Press_-_Medium_Grip',
              name: 'Barbell Bench Press',
              category: 'Chest',
              equipment: 'Barbell',
              primaryMuscles: ['Chest'],
            },
            sets: [
              {
                id: `s-amrap-1-${platform}`,
                setNumber: 1,
                type: 'normal',
                weightKg: 80,
                reps: 8,
                targetReps: 'AMRAP',
                isCompleted: true,
                completedAt: '2026-09-07T11:20:00.000Z',
              },
            ],
          },
        ],
      };

      await fixture.store.saveCompletedWorkout(workout);

      const reopened = await fixture.reopen();
      const detail = await reopened.getWorkoutDetail(workout.id);
      assert.ok(detail);
      assert.equal(detail?.exercises.length, 2, 'Both occurrences of same exercise must be preserved');
      assert.equal(detail?.exercises[0].targetReps, '6-8');
      assert.equal(detail?.exercises[0].sets[0].weightKg, 0, '0 kg must be preserved as 0, not null/empty/default');
      assert.equal(detail?.exercises[1].targetReps, 'AMRAP');
      assert.equal(detail?.exercises[1].sets[0].weightKg, 80);

      await fixture.dispose();
    });

    it(`[${platform}] restores draft with omitted embedded exercise, reconstructs it, and resumes safely`, async () => {
      const fixture = await createStoreFixture(platform);

      const backupWithOmittedExercise = JSON.stringify({
        version: 2,
        exportedAt: '2026-09-07T10:00:00.000Z',
        workouts: [],
        routines: [],
        exercises: [],
        drafts: [
          {
            version: 1,
            savedAt: '2026-09-07T10:05:00.000Z',
            revision: 1,
            workout: {
              id: `draft-reconstruct-${platform}`,
              name: 'Draft With Omitted Exercise',
              gymId: 'gym-default',
              startTime: '2026-09-07T10:00:00.000Z',
              durationSeconds: 300,
              totalVolumeKg: 1000,
              exercises: [
                {
                  id: `we-recon-1`,
                  exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
                  orderIndex: 0,
                  sets: [
                    { id: 's1', setNumber: 1, type: 'normal', weightKg: 100, reps: 10, isCompleted: true },
                  ],
                },
              ],
            },
          },
        ],
        settings: {},
        gyms: [{ id: 'gym-default', name: 'Default Gym', isDefault: true, color: '#3B82F6', createdAt: '2026-01-01T00:00:00.000Z' }],
        exerciseGymScopes: [],
      });

      const { restoreBackup } = await import('../../src/utils/restore');
      await restoreBackup(backupWithOmittedExercise, fixture.store);

      // Reopen store to simulate fresh launch
      const reopened = await fixture.reopen();
      const drafts = await reopened.getWorkoutDrafts();
      assert.equal(drafts.length, 1);
      const recoveredEx = drafts[0].workout.exercises[0];

      // Embedded exercise must be present with valid name and primaryMuscles
      assert.ok(recoveredEx.exercise, 'Exercise object must be reconstructed');
      assert.equal(recoveredEx.exercise.name, 'Barbell Bench Press - Medium Grip');
      assert.ok(Array.isArray(recoveredEx.exercise.primaryMuscles));
      assert.ok(recoveredEx.exercise.primaryMuscles.length > 0);

      // Resume draft in session controller and verify no crashes accessing exercise fields
      const controller = createSessionController(reopened);
      controller.resume(drafts[0]);
      const state = controller.getState();
      assert.equal(state.phase, 'active');

      const activeEx = state.workout?.exercises[0];
      assert.ok(activeEx);
      assert.equal(activeEx.exercise.name, 'Barbell Bench Press - Medium Grip');
      assert.equal(activeEx.exercise.primaryMuscles.join(', '), 'chest');
      assert.equal(typeof activeEx.exercise.equipment, 'string');

      await fixture.dispose();
    });
  }
});
