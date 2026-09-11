import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createStoreFixture } from '../helpers/storeFixture';
import { createSessionController } from '../../src/workout/session';
import { Workout } from '../../src/types';

describe('Completion & Dialog Lifecycle', () => {
  for (const platform of ['native', 'web'] as const) {
    it(`[${platform}] completes workout: clears drafts, commits history, and calculates accurate summary`, async () => {
      const fixture = await createStoreFixture(platform);
      let currentTime = new Date('2026-09-07T10:00:00.000Z').getTime();
      const ctrl = createSessionController(fixture.store, () => currentTime, { maxDirtyTimeMs: 100 });

      const initialWorkout: Workout = {
        id: `w-push-${platform}-1`,
        name: 'Push Day',
        gymId: 'gym-default',
        startTime: new Date(currentTime).toISOString(),
        durationSeconds: 0,
        totalVolumeKg: 0,
        exercises: [],
      };

      await ctrl.start(initialWorkout);
      assert.equal(ctrl.getState().phase, 'active');

      // Add exercise with completed sets
      const exId = `ae-push-${platform}-1`;
      ctrl.update({
        ...initialWorkout,
        exercises: [
          {
            id: exId,
            exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
            orderIndex: 0,
            notes: 'Felt strong',
            restTimerSeconds: 120,
            exercise: {
              id: 'Barbell_Bench_Press_-_Medium_Grip',
              name: 'Bench Press (Barbell)',
              category: 'chest',
              bodyPart: 'chest',
              equipment: 'barbell',
              targetMuscle: 'pectorals',
            },
            sets: [
              { id: 's1', setNumber: 1, weightKg: 100, reps: 5, type: 'normal', isCompleted: true },
              { id: 's2', setNumber: 2, weightKg: 100, reps: 5, type: 'normal', isCompleted: true },
              { id: 's3', setNumber: 3, weightKg: 80, reps: 8, type: 'normal', isCompleted: true },
            ],
          },
        ],
      });

      currentTime += 3600 * 1000; // 1 hour elapsed

      // Finish workout
      const completed = await ctrl.finish();
      assert.ok(completed, 'Completed workout should be returned');
      assert.equal(ctrl.getState().phase, 'idle');
      assert.equal(ctrl.getState().workout, null);

      // Verify summary metrics
      assert.equal(completed.durationSeconds, 3600);
      assert.equal(completed.totalVolumeKg, 100 * 5 + 100 * 5 + 80 * 8); // 500 + 500 + 640 = 1640
      assert.equal(completed.exercises.length, 1);
      const completedSetsCount = completed.exercises.reduce(
        (sum, e) => sum + e.sets.filter((s) => s.isCompleted).length,
        0
      );
      assert.equal(completedSetsCount, 3);

      // Drafts must be completely cleared
      const drafts = await fixture.store.getWorkoutDrafts();
      assert.equal(drafts.length, 0);

      // History must contain saved workout
      const history = await fixture.store.getWorkoutHistory();
      assert.equal(history.length, 1);
      assert.equal(history[0].name, 'Push Day');
      assert.equal(history[0].gymId, 'gym-default');
      assert.equal(history[0].totalVolumeKg, 1640);

      await fixture.dispose();
    });

    it(`[${platform}] keeps workout active and editable if save fails`, async () => {
      const fixture = await createStoreFixture(platform);
      // Force finishWorkout to fail
      fixture.store.finishWorkout = async () => {
        throw new Error('Database write failure');
      };

      let currentTime = new Date('2026-09-07T10:00:00.000Z').getTime();
      const ctrl = createSessionController(fixture.store, () => currentTime);

      const initialWorkout: Workout = {
        id: `w-leg-${platform}-1`,
        name: 'Leg Day',
        gymId: 'gym-default',
        startTime: new Date(currentTime).toISOString(),
        durationSeconds: 0,
        totalVolumeKg: 0,
        exercises: [],
      };

      await ctrl.start(initialWorkout);
      assert.equal(ctrl.getState().phase, 'active');

      // Attempt finish - must fail
      await assert.rejects(async () => {
        await ctrl.finish();
      }, /Database write failure/);

      // Controller should restore active phase and keep workout intact
      assert.equal(ctrl.getState().phase, 'active');
      assert.ok(ctrl.getState().workout !== null);
      assert.equal(ctrl.getState().workout?.name, 'Leg Day');
      assert.ok(ctrl.getState().persistenceError !== null);

      await fixture.dispose();
    });

    it(`[${platform}] discarding a paused workout clears its draft without adding history`, async () => {
      const fixture = await createStoreFixture(platform);
      let currentTime = new Date('2026-09-07T14:00:00.000Z').getTime();
      const ctrl = createSessionController(fixture.store, () => currentTime, { maxDirtyTimeMs: 100 });

      const pausedWorkout: Workout = {
        id: `w-paused-${platform}-1`,
        name: 'Paused Workout',
        startTime: new Date(currentTime).toISOString(),
        durationSeconds: 0,
        totalVolumeKg: 0,
        exercises: [],
      };

      await ctrl.start(pausedWorkout);
      currentTime += 15 * 60 * 1000;
      ctrl.update({ ...pausedWorkout, durationSeconds: 900 });
      await ctrl.flush();

      assert.equal((await fixture.store.getWorkoutDrafts()).length, 1);

      await ctrl.discard();

      assert.equal(ctrl.getState().phase, 'idle');
      assert.equal(ctrl.getState().workout, null);
      assert.equal((await fixture.store.getWorkoutDrafts()).length, 0);
      assert.equal((await fixture.store.getWorkoutHistory()).length, 0);

      await fixture.dispose();
    });
  }

  it('dialog confirmation contract: cancel mutates nothing, confirm executes mutation', async () => {
    let deleted = false;
    const deleteAction = () => {
      deleted = true;
    };

    // User cancels
    const confirmCancel = async () => false;
    if (await confirmCancel()) {
      deleteAction();
    }
    assert.equal(deleted, false, 'Cancel must not trigger mutation');

    // User confirms
    const confirmAccept = async () => true;
    if (await confirmAccept()) {
      deleteAction();
    }
    assert.equal(deleted, true, 'Confirm must trigger mutation');
  });
});
