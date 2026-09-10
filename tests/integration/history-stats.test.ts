import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createStoreFixture } from '../helpers/storeFixture';
import { calculate1RM } from '../../src/utils/calculator';
import { Workout } from '../../src/types';
import { WorkoutDraft } from '../../src/database/contract';

describe('History-derived stats & previous set suggestions', () => {
  for (const platform of ['native', 'web'] as const) {
    it(`[${platform}] drafts never count toward PRs or session totals`, async () => {
      const fixture = await createStoreFixture(platform);

      const exId = 'Barbell_Bench_Press_-_Medium_Grip';

      // 1. Initial stats should be 0
      const initialStats = await fixture.store.getExerciseStats(exId);
      assert.equal(initialStats.sessionCount, 0);
      assert.equal(initialStats.maxWeightKg, 0);
      assert.equal(initialStats.estimated1RM, 0);

      // 2. Save an active draft with huge sets (should NEVER count)
      const draft: WorkoutDraft = {
        version: 1,
        revision: 1,
        savedAt: '2026-09-07T10:00:00.000Z',
        restTimer: null,
        workout: {
          id: 'draft-huge-1',
          name: 'Draft Workout',
          gymId: 'gym-default',
          startTime: '2026-09-07T09:00:00.000Z',
          durationSeconds: 1000,
          totalVolumeKg: 99999,
          exercises: [
            {
              id: 'we-draft-1',
              exerciseId: exId,
              orderIndex: 0,
              exercise: {
                id: exId,
                name: 'Bench Press',
                category: 'chest',
                bodyPart: 'chest',
                equipment: 'barbell',
                targetMuscle: 'pectorals',
              },
              sets: [
                { id: 'ds1', setNumber: 1, type: 'normal', weightKg: 300, reps: 10, isCompleted: true },
              ],
            },
          ],
        },
      };
      await fixture.store.saveDraft(draft);

      // Draft must not affect exercise stats or suggestions
      const statsAfterDraft = await fixture.store.getExerciseStats(exId);
      assert.equal(statsAfterDraft.sessionCount, 0, 'Draft should not increase sessionCount');
      assert.equal(statsAfterDraft.maxWeightKg, 0, 'Draft sets should not affect maxWeightKg');

      const prevSetsFromDraft = await fixture.store.getPreviousSetsForExercise(exId);
      assert.equal(prevSetsFromDraft.length, 0, 'Draft sets should not be returned as previous sets');

      await fixture.dispose();
    });

    it(`[${platform}] counts session once even when exercise appears twice, and skips empty recent sessions`, async () => {
      const fixture = await createStoreFixture(platform);
      const exId = 'Barbell_Bench_Press_-_Medium_Grip';

      // 1. First completed workout with 2 occurrences of the same exercise
      const workout1: Workout = {
        id: 'w-multi-occ',
        name: 'Bench Extravaganza',
        gymId: 'gym-default',
        startTime: '2026-09-01T10:00:00.000Z',
        durationSeconds: 3600,
        totalVolumeKg: 1500,
        exercises: [
          {
            id: 'we-occ-0',
            exerciseId: exId,
            orderIndex: 0,
            exercise: {
              id: exId,
              name: 'Bench Press',
              category: 'chest',
              bodyPart: 'chest',
              equipment: 'barbell',
              targetMuscle: 'pectorals',
            },
            sets: [
              { id: 's1', setNumber: 1, type: 'normal', weightKg: 100, reps: 5, isCompleted: true },
            ],
          },
          {
            id: 'we-occ-1',
            exerciseId: exId,
            orderIndex: 1,
            exercise: {
              id: exId,
              name: 'Bench Press',
              category: 'chest',
              bodyPart: 'chest',
              equipment: 'barbell',
              targetMuscle: 'pectorals',
            },
            sets: [
              { id: 's2', setNumber: 1, type: 'normal', weightKg: 80, reps: 8, isCompleted: true },
            ],
          },
        ],
      };
      await fixture.store.finishWorkout(workout1);

      // Session count should be 1, not 2!
      const stats1 = await fixture.store.getExerciseStats(exId);
      assert.equal(stats1.sessionCount, 1, 'Workout with 2 occurrences of same exercise counts as 1 session');
      assert.equal(stats1.maxWeightKg, 100);
      assert.equal(stats1.maxReps, 8);
      // 1RM consistent with calculate1RM average
      const expected1RM = Math.max(
        calculate1RM(100, 5).average,
        calculate1RM(80, 8).average
      );
      assert.equal(stats1.estimated1RM, expected1RM);

      // 2. Add a more recent workout with NO completed sets for this exercise
      const workout2: Workout = {
        id: 'w-empty-recent',
        name: 'Empty Bench Day',
        gymId: 'gym-default',
        startTime: '2026-09-05T10:00:00.000Z',
        durationSeconds: 1800,
        totalVolumeKg: 0,
        exercises: [
          {
            id: 'we-empty-0',
            exerciseId: exId,
            orderIndex: 0,
            exercise: {
              id: exId,
              name: 'Bench Press',
              category: 'chest',
              bodyPart: 'chest',
              equipment: 'barbell',
              targetMuscle: 'pectorals',
            },
            sets: [
              { id: 's3', setNumber: 1, type: 'normal', weightKg: 110, reps: 5, isCompleted: false },
            ],
          },
        ],
      };
      await fixture.store.finishWorkout(workout2);

      // Session count should still be 1 (empty session does not count)
      const stats2 = await fixture.store.getExerciseStats(exId);
      assert.equal(stats2.sessionCount, 1);
      assert.equal(stats2.maxWeightKg, 100);

      // Previous sets must skip workout2 and find workout1!
      const prevSetsOcc0 = await fixture.store.getPreviousSetsForExercise(exId, 0);
      assert.equal(prevSetsOcc0.length, 1);
      assert.equal(prevSetsOcc0[0].weightKg, 100);

      const prevSetsOcc1 = await fixture.store.getPreviousSetsForExercise(exId, 1);
      assert.equal(prevSetsOcc1.length, 1);
      assert.equal(prevSetsOcc1[0].weightKg, 80);

      // 3. Deleting workout1 refreshes derived stats back to 0
      await fixture.store.deleteWorkout(workout1.id);
      const stats3 = await fixture.store.getExerciseStats(exId);
      assert.equal(stats3.sessionCount, 0);
      assert.equal(stats3.maxWeightKg, 0);
      assert.equal(stats3.estimated1RM, 0);

      await fixture.dispose();
    });
  }
});
