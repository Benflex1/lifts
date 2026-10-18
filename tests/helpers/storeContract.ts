import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { DataSnapshot, Store, WorkoutDraft } from '../../src/database/contract';
import { DEFAULT_EXERCISES } from '../../src/database/seedData';
import { Exercise, Routine, Workout, WorkoutSet } from '../../src/types';
import { createStoreFixture, StoreFixture } from './storeFixture';

/**
 * ARCH-04 shared contract suite: identical scenarios run against the native
 * (SQLite) and web (IndexedDB) stores, so any behavioral drift between the
 * adapters fails the same test on both platforms.
 */

const BUNDLED_EXERCISE = DEFAULT_EXERCISES[0];

function buildSet(id: string, weightKg = 100, reps = 5): WorkoutSet {
  return { id, setNumber: 1, type: 'normal', weightKg, reps, isCompleted: true, completedAt: '2026-10-01T09:00:00.000Z' };
}

function buildWorkout(
  id: string,
  gymId: string,
  exercise: Exercise,
  options: { endTime?: string; setWeightKg?: number } = {},
): Workout {
  return {
    id,
    name: `Contract ${id}`,
    gymId,
    startTime: '2026-10-01T08:00:00.000Z',
    endTime: options.endTime,
    durationSeconds: 3600,
    totalVolumeKg: (options.setWeightKg ?? 100) * 5,
    exercises: [
      {
        id: `${id}-exercise-0`,
        exerciseId: exercise.id,
        exercise,
        sets: [buildSet(`${id}-set-0`, options.setWeightKg ?? 100)],
        restTimerSeconds: 90,
      },
    ],
  };
}

function buildDraft(workout: Workout): WorkoutDraft {
  return { version: 1, workout, savedAt: '2026-10-01T08:30:00.000Z', revision: 1, restTimer: null };
}

function buildCustomExercise(id: string): Exercise {
  return {
    id,
    name: `Contract Exercise ${id}`,
    category: 'strength',
    equipment: 'barbell',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps'],
    instructions: ['Contract step'],
    isCustom: true,
  };
}

function buildRoutine(id: string, exercise: Exercise): Routine {
  return {
    id,
    name: `Contract Routine ${id}`,
    createdAt: '2026-10-01T07:00:00.000Z',
    exercises: [
      {
        id: `${id}-exercise-0`,
        exerciseId: exercise.id,
        exercise,
        orderIndex: 0,
        targetSets: 3,
        targetReps: '8-10',
        restTimerSeconds: 90,
      },
    ],
  };
}

function emptySnapshot(overrides: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    workouts: [],
    routines: [],
    exercises: [],
    drafts: [],
    settings: {},
    gyms: [],
    exerciseGymScopes: [],
    ...overrides,
  };
}

async function withFixture(platform: 'native' | 'web', run: (fixture: StoreFixture, store: Store) => Promise<void>): Promise<void> {
  const fixture = await createStoreFixture(platform);
  try {
    await run(fixture, fixture.store);
  } finally {
    await fixture.dispose();
  }
}

export function registerStoreContract(platform: 'native' | 'web'): void {
  describe(`Store contract — ${platform}`, () => {
    it('seeds the default gym and catalog idempotently across reopens', async () => {
      await withFixture(platform, async (fixture, store) => {
        const defaultGym = await store.getDefaultGym();
        assert.equal(defaultGym.id, 'gym-default');
        assert.equal(defaultGym.isDefault, true);

        const seededCount = (await store.getAllExercises()).length;
        assert.ok(seededCount > 0, 'catalog is seeded');
        const gymCount = (await store.getGyms()).length;

        const reopened = await fixture.reopen();
        assert.equal((await reopened.getAllExercises()).length, seededCount, 'reopen does not duplicate the catalog');
        assert.equal((await reopened.getGyms()).length, gymCount, 'reopen does not duplicate gyms');
      });
    });

    it('round-trips a finished workout through history, detail, snapshot, and deletion', async () => {
      await withFixture(platform, async (_fixture, store) => {
        const workout = buildWorkout('contract-workout', 'gym-default', BUNDLED_EXERCISE, { endTime: '2026-10-01T09:00:00.000Z' });
        await store.finishWorkout(workout);

        const history = await store.getWorkoutHistory();
        assert.deepEqual(history.map((row) => row.id), [workout.id]);

        const detail = await store.getWorkoutDetail(workout.id);
        assert.equal(detail?.totalVolumeKg, workout.totalVolumeKg);
        assert.equal(detail?.exercises[0].sets[0].weightKg, 100);

        const snapshot = await store.readSnapshot();
        assert.deepEqual(snapshot.workouts.map((row) => row.id), [workout.id]);

        await store.deleteWorkout(workout.id);
        assert.equal(await store.getWorkoutDetail(workout.id), null);
        assert.deepEqual((await store.getWorkoutHistory()).map((row) => row.id), []);
      });
    });

    it('round-trips a draft through save, read, and discard', async () => {
      await withFixture(platform, async (_fixture, store) => {
        const draft = buildDraft(buildWorkout('contract-draft', 'gym-default', BUNDLED_EXERCISE));

        await store.saveDraft(draft);
        const drafts = await store.getWorkoutDrafts();
        assert.deepEqual(drafts.map((row) => row.workout.id), [draft.workout.id]);
        assert.equal((await store.getWorkoutDraft(draft.workout.id))?.workout.id, draft.workout.id);

        await store.discardDraft(draft.workout.id);
        assert.deepEqual(await store.getWorkoutDrafts(), []);
        assert.equal(await store.getWorkoutDraft(draft.workout.id), null);
      });
    });

    it('rejects gym deletion while an active draft references the gym', async () => {
      await withFixture(platform, async (_fixture, store) => {
        const gym = await store.createGym('Draft Gym', '#10B981');
        await store.saveDraft(buildDraft(buildWorkout('contract-active-draft', gym.id, BUNDLED_EXERCISE)));

        await assert.rejects(
          () => store.deleteGym(gym.id, 'gym-default'),
          /cannot delete the gym used by an active workout draft/,
        );
      });
    });

    it('rejects gym deletion while an in-progress workout references the gym', async () => {
      await withFixture(platform, async (fixture, store) => {
        const gym = await store.createGym('In Progress Gym', '#10B981');
        await fixture.insertRawWorkoutRecord({
          id: 'contract-in-progress',
          startTime: '2026-10-02T08:00:00.000Z',
          inProgress: true,
          gymId: gym.id,
          exercises: [{ exercise: BUNDLED_EXERCISE, sets: [{ weightKg: 100, reps: 5 }] }],
        });

        await assert.rejects(
          () => store.deleteGym(gym.id, 'gym-default'),
          /cannot delete the gym used by an in-progress workout/,
        );
      });
    });

    it('deletes a gym and reassigns workouts, scope links, and default status', async () => {
      await withFixture(platform, async (_fixture, store) => {
        const doomed = await store.createGym('Doomed Gym', '#10B981');
        const keep = await store.createGym('Keep Gym', '#F59E0B');

        const workout = buildWorkout('contract-reassign', doomed.id, BUNDLED_EXERCISE, { endTime: '2026-10-01T09:00:00.000Z' });
        await store.finishWorkout(workout);
        await store.saveExerciseGymScope({ exerciseId: BUNDLED_EXERCISE.id, scopeType: 'linked_group', linkedGymIds: [doomed.id, keep.id] });
        await store.setDefaultGym(doomed.id);

        await store.deleteGym(doomed.id, 'gym-default');

        assert.ok(!(await store.getGyms()).some((gym) => gym.id === doomed.id), 'gym is removed');
        assert.equal((await store.getWorkoutDetail(workout.id))?.gymId, 'gym-default', 'workout history follows the replacement gym');
        assert.equal((await store.getDefaultGym()).id, 'gym-default', 'replacement inherits default status');

        const scope = await store.getExerciseGymScope(BUNDLED_EXERCISE.id);
        assert.equal(scope?.scopeType, 'gym_specific');
        assert.equal(scope?.linkedGymIds?.length ?? 0, 0);
      });
    });

    it('advances the data revision for scope and catalog writes', async () => {
      await withFixture(platform, async (_fixture, store) => {
        const initial = await store.getDataRevision!();

        // A scope change feeds PR evaluation and analytics.
        await store.saveExerciseGymScope({ exerciseId: BUNDLED_EXERCISE.id, scopeType: 'global' });
        const afterScope = await store.getDataRevision!();
        assert.ok(afterScope > initial, 'scope write advances the revision');

        // An exercise rename feeds analytics charts and catalog views.
        const custom = await store.createCustomExercise({
          name: 'Revision Custom',
          category: 'strength',
          equipment: 'barbell',
          primaryMuscles: ['chest'],
        });
        const beforeRename = await store.getDataRevision!();
        await store.updateCustomExercise(custom.id, { name: 'Revision Custom Renamed' });
        const afterRename = await store.getDataRevision!();
        assert.ok(afterRename > beforeRename, 'catalog rename advances the revision');
      });
    });

    it('merges a snapshot and rejects conflicting scopes', async () => {
      await withFixture(platform, async (_fixture, store) => {
        const gym = { id: 'contract-merge-gym', name: 'Merge Gym', isDefault: false, color: '#8B5CF6', createdAt: '2026-10-01T00:00:00.000Z' };
        const exercise = buildCustomExercise('contract-merge-exercise');
        const snapshot = emptySnapshot({
          gyms: [gym],
          exercises: [exercise],
          routines: [buildRoutine('contract-merge-routine', exercise)],
          workouts: [buildWorkout('contract-merge-workout', gym.id, exercise, { endTime: '2026-10-01T09:00:00.000Z' })],
          drafts: [buildDraft(buildWorkout('contract-merge-draft', gym.id, exercise))],
          exerciseGymScopes: [{ exerciseId: exercise.id, scopeType: 'gym_specific' }],
          settings: { contract_merge_setting: 'imported' },
        });

        await store.mergeSnapshot(snapshot);

        const merged = await store.readSnapshot();
        assert.ok(merged.gyms.some((row) => row.id === gym.id));
        assert.ok(merged.exercises.some((row) => row.id === exercise.id));
        assert.ok(merged.routines.some((row) => row.id === 'contract-merge-routine'));
        assert.ok(merged.workouts.some((row) => row.id === 'contract-merge-workout'));
        assert.ok(merged.drafts.some((row) => row.workout.id === 'contract-merge-draft'));
        assert.equal(merged.settings.contract_merge_setting, 'imported');
        assert.equal(merged.exerciseGymScopes.find((row) => row.exerciseId === exercise.id)?.scopeType, 'gym_specific');

        await assert.rejects(
          () => store.mergeSnapshot(emptySnapshot({
            exerciseGymScopes: [{ exerciseId: exercise.id, scopeType: 'global' }],
          })),
          /Conflicting exercise gym scope/,
        );

        await assert.rejects(
          () => store.mergeSnapshot(emptySnapshot({
            exerciseGymScopes: [
              { exerciseId: exercise.id, scopeType: 'gym_specific' },
              { exerciseId: exercise.id, scopeType: 'global' },
            ],
          })),
          /duplicate exercise scope id/i,
        );
      });
    });
  });
}
