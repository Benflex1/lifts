import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createStoreFixture } from '../helpers/storeFixture';
import { getDefaultExercises } from '../../src/database/seedData';
import { Workout } from '../../src/types';

/**
 * COR-01 parity: an in-progress workout record — one a foreign writer or a
 * legacy backup could leave in storage — must be invisible on both platforms:
 * history, detail, snapshot reads, and the PR-input queries (completed
 * workouts for an exercise, previous-set suggestions, exercise stats).
 */

const EXERCISE = getDefaultExercises()[0];
const GYM_ID = 'gym-default';
const COMPLETED_ID = 'completed-probe';
const IN_PROGRESS_ID = 'in-progress-probe';

function makeWorkout(id: string, startTime: string, endTime: string, weightKg: number, reps: number): Workout {
  return {
    id,
    name: `Probe ${id}`,
    gymId: GYM_ID,
    startTime,
    endTime,
    durationSeconds: 3600,
    totalVolumeKg: weightKg * reps,
    exercises: [
      {
        id: `${id}-exercise-0`,
        exerciseId: EXERCISE.id,
        exercise: EXERCISE,
        sets: [
          {
            id: `${id}-set-0`,
            setNumber: 1,
            type: 'normal',
            weightKg,
            reps,
            isCompleted: true,
            completedAt: endTime,
          },
        ],
        restTimerSeconds: 90,
      },
    ],
  };
}

async function observe(platform: 'native' | 'web') {
  const fixture = await createStoreFixture(platform);
  try {
    const { store } = fixture;

    await store.finishWorkout(
      makeWorkout(COMPLETED_ID, '2026-10-01T08:00:00.000Z', '2026-10-01T09:00:00.000Z', 100, 5),
    );
    await fixture.insertRawWorkoutRecord({
      id: IN_PROGRESS_ID,
      startTime: '2026-10-02T08:00:00.000Z',
      endTime: '2026-10-02T09:00:00.000Z',
      inProgress: true,
      exercises: [{ exercise: EXERCISE, sets: [{ weightKg: 999, reps: 1 }] }],
    });

    const history = await store.getWorkoutHistory();
    const detailForInProgress = await store.getWorkoutDetail(IN_PROGRESS_ID);
    const detailForCompleted = await store.getWorkoutDetail(COMPLETED_ID);
    const snapshot = await store.readSnapshot();
    const completedForExercise = await store.getCompletedWorkoutsForExercise(EXERCISE.id);
    const previousSets = await store.getPreviousSetsForExercise(EXERCISE.id, 0, GYM_ID);
    const stats = await store.getExerciseStats(EXERCISE.id, GYM_ID);

    return {
      historyIds: history.map(workout => workout.id),
      detailForInProgress,
      detailForCompleted: detailForCompleted
        ? {
            id: detailForCompleted.id,
            totalVolumeKg: detailForCompleted.totalVolumeKg,
            exerciseIds: detailForCompleted.exercises.map(exercise => exercise.exerciseId),
          }
        : null,
      snapshotIds: snapshot.workouts.map(workout => workout.id),
      completedForExerciseIds: completedForExercise.map(workout => workout.id),
      previousSets: previousSets.map(set => ({ weightKg: set.weightKg, reps: set.reps })),
      gymStats: { ...stats.gym },
      globalStats: { ...stats.global },
    };
  } finally {
    await fixture.dispose();
  }
}

for (const platform of ['native', 'web'] as const) {
  describe(`COR-01 completion filter — ${platform}`, () => {
    it('excludes the in-progress record from every read path', async () => {
      const observed = await observe(platform);

      assert.deepEqual(observed.historyIds, [COMPLETED_ID], 'history lists only the completed workout');
      assert.equal(observed.detailForInProgress, null, 'detail lookup rejects in-progress records');
      assert.deepEqual(observed.detailForCompleted, {
        id: COMPLETED_ID,
        totalVolumeKg: 500,
        exerciseIds: [EXERCISE.id],
      });
      assert.deepEqual(observed.snapshotIds, [COMPLETED_ID], 'snapshots contain only completed workouts');
      assert.deepEqual(observed.completedForExerciseIds, [COMPLETED_ID], 'PR inputs contain only completed workouts');
      assert.deepEqual(observed.previousSets, [{ weightKg: 100, reps: 5 }], 'previous sets ignore in-progress records');
      assert.equal(observed.gymStats.maxWeightKg, 100, 'gym stats ignore in-progress records');
      assert.equal(observed.globalStats.maxWeightKg, 100, 'global stats ignore in-progress records');
    });
  });
}

describe('COR-01 completion filter — cross-platform parity', () => {
  it('returns identical observable records on native and web for the same fixture', async () => {
    const native = await observe('native');
    const web = await observe('web');
    assert.deepEqual(web, native);
  });
});
