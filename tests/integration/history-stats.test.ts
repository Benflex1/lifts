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
      const currentGymId = (await fixture.store.getDefaultGym()).id;

      // 1. Initial stats should be 0
      const initialStats = await fixture.store.getExerciseStats(exId, currentGymId);
      assert.equal(initialStats.global.sessionCount, 0);
      assert.equal(initialStats.global.maxWeightKg, 0);
      assert.equal(initialStats.global.estimated1RM, 0);

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
      const statsAfterDraft = await fixture.store.getExerciseStats(exId, currentGymId);
      assert.equal(statsAfterDraft.global.sessionCount, 0, 'Draft should not increase sessionCount');
      assert.equal(statsAfterDraft.global.maxWeightKg, 0, 'Draft sets should not affect maxWeightKg');

      const prevSetsFromDraft = await fixture.store.getPreviousSetsForExercise(exId);
      assert.equal(prevSetsFromDraft.length, 0, 'Draft sets should not be returned as previous sets');

      await fixture.dispose();
    });

    it(`[${platform}] counts session once even when exercise appears twice, and skips empty recent sessions`, async () => {
      const fixture = await createStoreFixture(platform);
      const exId = 'Barbell_Bench_Press_-_Medium_Grip';
      const currentGymId = (await fixture.store.getDefaultGym()).id;

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
      const stats1 = await fixture.store.getExerciseStats(exId, currentGymId);
      assert.equal(stats1.global.sessionCount, 1, 'Workout with 2 occurrences of same exercise counts as 1 session');
      assert.equal(stats1.global.maxWeightKg, 100);
      assert.equal(stats1.global.maxReps, 8);
      // 1RM consistent with calculate1RM average
      const expected1RM = Math.max(
        calculate1RM(100, 5).average,
        calculate1RM(80, 8).average
      );
      assert.equal(stats1.global.estimated1RM, expected1RM);

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
      const stats2 = await fixture.store.getExerciseStats(exId, currentGymId);
      assert.equal(stats2.global.sessionCount, 1);
      assert.equal(stats2.global.maxWeightKg, 100);

      // Previous sets must skip workout2 and find workout1!
      const prevSetsOcc0 = await fixture.store.getPreviousSetsForExercise(exId, 0);
      assert.equal(prevSetsOcc0.length, 1);
      assert.equal(prevSetsOcc0[0].weightKg, 100);

      const prevSetsOcc1 = await fixture.store.getPreviousSetsForExercise(exId, 1);
      assert.equal(prevSetsOcc1.length, 1);
      assert.equal(prevSetsOcc1[0].weightKg, 80);

      // 3. Deleting workout1 refreshes derived stats back to 0
      await fixture.store.deleteWorkout(workout1.id);
      const stats3 = await fixture.store.getExerciseStats(exId, currentGymId);
      assert.equal(stats3.global.sessionCount, 0);
      assert.equal(stats3.global.maxWeightKg, 0);
      assert.equal(stats3.global.estimated1RM, 0);

      await fixture.dispose();
    });
  }

  for (const platform of ['native', 'web'] as const) {
    it(`[${platform}] chooses gym-aware completed history and returns dual stats`, async () => {
      const fixture = await createStoreFixture(platform);
      try {
        const defaultGym = await fixture.store.getDefaultGym();
        const gymA = await fixture.store.createGym('FitX');
        const gymB = await fixture.store.createGym('McFit');
        const machine = await fixture.store.getExerciseById('Ab_Crunch_Machine');
        const barbell = await fixture.store.getExerciseById('Barbell_Bench_Press_-_Medium_Grip');
        assert.ok(machine);
        assert.ok(barbell);

        const workoutWith = (
          id: string,
          gymId: string,
          startTime: string,
          exercise: typeof machine,
          weightKg: number,
        ): Workout => ({
          id,
          name: id,
          gymId,
          startTime,
          durationSeconds: 600,
          totalVolumeKg: weightKg * 8,
          exercises: [{
            id: `${id}-occ-0`,
            exerciseId: exercise!.id,
            exercise: exercise!,
            restTimerSeconds: 90,
            sets: [{
              id: `${id}-set-0`,
              setNumber: 1,
              type: 'normal',
              weightKg,
              reps: 8,
              isCompleted: true,
            }],
          }],
        });

        await fixture.store.finishWorkout(workoutWith(
          'machine-local', gymA.id, '2026-09-09T10:00:00.000Z', machine, 45,
        ));
        await fixture.store.finishWorkout(workoutWith(
          'machine-foreign', gymB.id, '2026-09-10T10:00:00.000Z', machine, 35,
        ));
        await fixture.store.finishWorkout(workoutWith(
          'global-barbell', gymB.id, '2026-09-11T10:00:00.000Z', barbell, 100,
        ));
        await fixture.store.saveDraft({
          version: 1,
          revision: 1,
          savedAt: '2026-09-12T10:00:00.000Z',
          restTimer: null,
          workout: workoutWith(
            'machine-draft', defaultGym.id, '2026-09-12T09:00:00.000Z', machine, 300,
          ),
        });

        const local = await fixture.store.getPreviousSetsForExercise(machine.id, 0, gymA.id);
        assert.equal(local[0].weightKg, 45);
        assert.equal(local[0].sourceGymName, undefined);

        const foreign = await fixture.store.getPreviousSetsForExercise(machine.id, 0, defaultGym.id);
        assert.equal(foreign[0].weightKg, 35);
        assert.equal(foreign[0].sourceGymName, 'McFit');

        const globalSuggestion = await fixture.store.getPreviousSetsForExercise(barbell.id, 0, defaultGym.id);
        assert.equal(globalSuggestion[0].weightKg, 100);
        assert.equal(globalSuggestion[0].sourceGymName, undefined);

        const stats = await fixture.store.getExerciseStats(machine.id, gymA.id);
        assert.equal(stats.global.sessionCount, 2);
        assert.equal(stats.gym.sessionCount, 1);
        assert.equal(stats.global.maxWeightKg, 45);
        assert.equal(stats.global.maxSetVolumeKg, 360);

        await fixture.store.saveExerciseGymScope({
          exerciseId: machine.id,
          scopeType: 'linked_group',
          linkedGymIds: [gymA.id, gymB.id],
        });
        const linked = await fixture.store.getPreviousSetsForExercise(machine.id, 0, defaultGym.id);
        assert.equal(linked[0].weightKg, 35);
        assert.equal(linked[0].sourceGymName, undefined);
        const linkedFromA = await fixture.store.getPreviousSetsForExercise(machine.id, 0, gymA.id);
        assert.equal(linkedFromA[0].weightKg, 35);
        assert.equal(linkedFromA[0].sourceGymName, undefined);
        const linkedStats = await fixture.store.getExerciseStats(machine.id, defaultGym.id);
        assert.equal(linkedStats.global.sessionCount, 2);
        assert.equal(linkedStats.gym.sessionCount, 2);

        const history = await fixture.store.getWorkoutHistory();
        assert.equal(history.find(item => item.id === 'machine-local')?.gymId, gymA.id);
        assert.equal((await fixture.store.getWorkoutDetail('machine-foreign'))?.gymId, gymB.id);
      } finally {
        await fixture.dispose();
      }
    });

    it(`[${platform}] preserves occurrence selection and same-workout empty fallback`, async () => {
      const fixture = await createStoreFixture(platform);
      try {
        const gym = await fixture.store.createGym('FitX');
        const exercise = await fixture.store.getExerciseById('Ab_Crunch_Machine');
        assert.ok(exercise);
        const workout: Workout = {
          id: 'repeated-occurrences',
          name: 'Repeated occurrences',
          gymId: gym.id,
          startTime: '2026-09-10T10:00:00.000Z',
          durationSeconds: 600,
          totalVolumeKg: 480,
          exercises: [
            {
              id: 'repeated-occ-0',
              exerciseId: exercise.id,
              exercise,
              restTimerSeconds: 90,
              sets: [{ id: 'repeated-incomplete', setNumber: 1, type: 'normal', weightKg: 70, reps: 8, isCompleted: false }],
            },
            {
              id: 'repeated-occ-1',
              exerciseId: exercise.id,
              exercise,
              restTimerSeconds: 90,
              sets: [{ id: 'repeated-complete', setNumber: 1, type: 'normal', weightKg: 60, reps: 8, isCompleted: true }],
            },
          ],
        };
        await fixture.store.finishWorkout(workout);

        const requested = await fixture.store.getPreviousSetsForExercise(exercise.id, 1, gym.id);
        const emptyRequested = await fixture.store.getPreviousSetsForExercise(exercise.id, 0, gym.id);
        assert.equal(requested[0].weightKg, 60);
        assert.equal(emptyRequested[0].weightKg, 60);
      } finally {
        await fixture.dispose();
      }
    });

    it(`[${platform}] uses the compact repeated-exercise index when exercises are interleaved`, async () => {
      const fixture = await createStoreFixture(platform);
      try {
        const gym = await fixture.store.createGym('Interleaved Gym');
        const machine = await fixture.store.getExerciseById('Ab_Crunch_Machine');
        const barbell = await fixture.store.getExerciseById('Barbell_Bench_Press_-_Medium_Grip');
        assert.ok(machine);
        assert.ok(barbell);
        const workout: Workout = {
          id: 'interleaved-occurrences',
          name: 'Interleaved occurrences',
          gymId: gym.id,
          startTime: '2026-09-10T10:00:00.000Z',
          durationSeconds: 600,
          totalVolumeKg: 0,
          exercises: [
            {
              id: 'interleaved-machine-0',
              exerciseId: machine.id,
              exercise: machine,
              restTimerSeconds: 90,
              sets: [{ id: 'interleaved-set-0', setNumber: 1, type: 'normal', weightKg: 45, reps: 8, isCompleted: true }],
            },
            {
              id: 'interleaved-barbell-0',
              exerciseId: barbell.id,
              exercise: barbell,
              restTimerSeconds: 90,
              sets: [{ id: 'interleaved-barbell-set', setNumber: 1, type: 'normal', weightKg: 80, reps: 8, isCompleted: true }],
            },
            {
              id: 'interleaved-machine-1',
              exerciseId: machine.id,
              exercise: machine,
              restTimerSeconds: 90,
              sets: [{ id: 'interleaved-set-1', setNumber: 1, type: 'normal', weightKg: 65, reps: 8, isCompleted: true }],
            },
          ],
        };
        await fixture.store.finishWorkout(workout);

        const suggestions = await fixture.store.getPreviousSetsForExercise(machine.id, 1, gym.id);
        assert.deepEqual(suggestions.map(suggestion => suggestion.weightKg), [65]);
      } finally {
        await fixture.dispose();
      }
    });

    it(`[${platform}] breaks equal-time ties by descending workout ID`, async () => {
      const fixture = await createStoreFixture(platform);
      try {
        const gym = await fixture.store.createGym('Tie Break Gym');
        const machine = await fixture.store.getExerciseById('Ab_Crunch_Machine');
        assert.ok(machine);
        const makeWorkout = (id: string, weightKg: number): Workout => ({
          id,
          name: id,
          gymId: gym.id,
          startTime: '2026-09-10T10:00:00.000Z',
          durationSeconds: 600,
          totalVolumeKg: 0,
          exercises: [{
            id: `${id}-occurrence`,
            exerciseId: machine.id,
            exercise: machine,
            restTimerSeconds: 90,
            sets: [{ id: `${id}-set`, setNumber: 1, type: 'normal', weightKg, reps: 8, isCompleted: true }],
          }],
        });
        await fixture.store.finishWorkout(makeWorkout('tie-a', 40));
        await fixture.store.finishWorkout(makeWorkout('tie-b', 50));

        const suggestions = await fixture.store.getPreviousSetsForExercise(machine.id, 0, gym.id);
        assert.deepEqual(suggestions.map(suggestion => suggestion.weightKg), [50]);
      } finally {
        await fixture.dispose();
      }
    });

    it(`[${platform}] uses binary ordering for case-sensitive workout IDs`, async () => {
      const fixture = await createStoreFixture(platform);
      try {
        const gym = await fixture.store.createGym('Binary Workout ID Gym');
        const machine = await fixture.store.getExerciseById('Ab_Crunch_Machine');
        assert.ok(machine);
        const makeWorkout = (id: string, weightKg: number): Workout => ({
          id,
          name: id,
          gymId: gym.id,
          startTime: '2026-09-10T10:00:00.000Z',
          durationSeconds: 600,
          totalVolumeKg: 0,
          exercises: [{
            id: `${id}-occurrence`,
            exerciseId: machine.id,
            exercise: machine,
            restTimerSeconds: 90,
            sets: [{ id: `${id}-set`, setNumber: 1, type: 'normal', weightKg, reps: 8, isCompleted: true }],
          }],
        });
        await fixture.store.finishWorkout(makeWorkout('Z-workout', 40));
        await fixture.store.finishWorkout(makeWorkout('a-workout', 50));

        const suggestions = await fixture.store.getPreviousSetsForExercise(machine.id, 0, gym.id);
        assert.deepEqual(suggestions.map(suggestion => suggestion.weightKg), [50]);
      } finally {
        await fixture.dispose();
      }
    });

    it(`[${platform}] uses binary ordering for case-sensitive set IDs`, async () => {
      const fixture = await createStoreFixture(platform);
      try {
        const gym = await fixture.store.createGym('Binary Set ID Gym');
        const machine = await fixture.store.getExerciseById('Ab_Crunch_Machine');
        assert.ok(machine);
        await fixture.store.finishWorkout({
          id: 'binary-set-workout',
          name: 'Binary set IDs',
          gymId: gym.id,
          startTime: '2026-09-10T10:00:00.000Z',
          durationSeconds: 600,
          totalVolumeKg: 0,
          exercises: [{
            id: 'binary-set-occurrence',
            exerciseId: machine.id,
            exercise: machine,
            restTimerSeconds: 90,
            sets: [
              { id: 'a-set', setNumber: 1, type: 'normal', weightKg: 10, reps: 8, isCompleted: true },
              { id: 'Z-set', setNumber: 1, type: 'normal', weightKg: 20, reps: 8, isCompleted: true },
            ],
          }],
        });

        const suggestions = await fixture.store.getPreviousSetsForExercise(machine.id, 0, gym.id);
        assert.deepEqual(suggestions.map(suggestion => suggestion.weightKg), [20, 10]);
      } finally {
        await fixture.dispose();
      }
    });

    it(`[${platform}] uses UTF-8 binary ordering for supplementary workout IDs`, async () => {
      const fixture = await createStoreFixture(platform);
      try {
        const gym = await fixture.store.createGym('UTF-8 Workout ID Gym');
        const machine = await fixture.store.getExerciseById('Ab_Crunch_Machine');
        assert.ok(machine);
        const makeWorkout = (id: string, weightKg: number): Workout => ({
          id,
          name: id,
          gymId: gym.id,
          startTime: '2026-09-10T10:00:00.000Z',
          durationSeconds: 600,
          totalVolumeKg: 0,
          exercises: [{
            id: `${id}-occurrence`,
            exerciseId: machine.id,
            exercise: machine,
            restTimerSeconds: 90,
            sets: [{ id: `${id}-set`, setNumber: 1, type: 'normal', weightKg, reps: 8, isCompleted: true }],
          }],
        });
        await fixture.store.finishWorkout(makeWorkout('\uE000-workout', 40));
        await fixture.store.finishWorkout(makeWorkout('\u{10000}-workout', 50));

        const suggestions = await fixture.store.getPreviousSetsForExercise(machine.id, 0, gym.id);
        assert.deepEqual(suggestions.map(suggestion => suggestion.weightKg), [50]);
      } finally {
        await fixture.dispose();
      }
    });

    it(`[${platform}] uses UTF-8 binary ordering for supplementary set IDs`, async () => {
      const fixture = await createStoreFixture(platform);
      try {
        const gym = await fixture.store.createGym('UTF-8 Set ID Gym');
        const machine = await fixture.store.getExerciseById('Ab_Crunch_Machine');
        assert.ok(machine);
        await fixture.store.finishWorkout({
          id: 'utf8-set-workout',
          name: 'UTF-8 set IDs',
          gymId: gym.id,
          startTime: '2026-09-10T10:00:00.000Z',
          durationSeconds: 600,
          totalVolumeKg: 0,
          exercises: [{
            id: 'utf8-set-occurrence',
            exerciseId: machine.id,
            exercise: machine,
            restTimerSeconds: 90,
            sets: [
              { id: '\uE000-set', setNumber: 1, type: 'normal', weightKg: 10, reps: 8, isCompleted: true },
              { id: '\u{10000}-set', setNumber: 1, type: 'normal', weightKg: 20, reps: 8, isCompleted: true },
            ],
          }],
        });

        const suggestions = await fixture.store.getPreviousSetsForExercise(machine.id, 0, gym.id);
        assert.deepEqual(suggestions.map(suggestion => suggestion.weightKg), [10, 20]);
      } finally {
        await fixture.dispose();
      }
    });

    it(`[${platform}] orders completed suggestion sets by set number`, async () => {
      const fixture = await createStoreFixture(platform);
      try {
        const gym = await fixture.store.createGym('Set Order Gym');
        const machine = await fixture.store.getExerciseById('Ab_Crunch_Machine');
        assert.ok(machine);
        await fixture.store.finishWorkout({
          id: 'unsorted-sets',
          name: 'Unsorted sets',
          gymId: gym.id,
          startTime: '2026-09-10T10:00:00.000Z',
          durationSeconds: 600,
          totalVolumeKg: 0,
          exercises: [{
            id: 'unsorted-sets-occurrence',
            exerciseId: machine.id,
            exercise: machine,
            restTimerSeconds: 90,
            sets: [
              { id: 'set-2', setNumber: 2, type: 'normal', weightKg: 20, reps: 8, isCompleted: true },
              { id: 'set-1', setNumber: 1, type: 'normal', weightKg: 10, reps: 8, isCompleted: true },
            ],
          }],
        });

        const suggestions = await fixture.store.getPreviousSetsForExercise(machine.id, 0, gym.id);
        assert.deepEqual(suggestions.map(suggestion => suggestion.weightKg), [10, 20]);
      } finally {
        await fixture.dispose();
      }
    });
  }
});
