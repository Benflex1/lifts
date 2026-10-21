import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { NodeSqliteDriver } from '../helpers/storeFixture';
import { createNativeStore } from '../../src/database/nativeStore';
import { getDefaultExercises } from '../../src/database/seedData';
import { getAllowedGymIds } from '../../src/workout/gym-scope';
import { loadExerciseDetailData } from '../../src/workout/exercise-detail';
import { calculateDualExerciseStats } from '../../src/workout/gym-records';
import { extractExercisePodium } from '../../src/workout/pr';
import { Workout } from '../../src/types';

const HISTORY_SQL = 's.is_completed = 1';

/** Records every read query so tests can pin the query count. */
class RecordingDriver extends NodeSqliteDriver {
  reads: string[] = [];

  override async getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]> {
    this.reads.push(sql);
    return super.getAllAsync<T>(sql, ...params);
  }

  override async getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null> {
    this.reads.push(sql);
    return super.getFirstAsync<T>(sql, ...params);
  }
}

function makeWorkout(
  exerciseId: string,
  exercise: Workout['exercises'][number]['exercise'],
  gymId: string,
): Workout {
  return {
    id: 'detail-w1',
    name: 'Detail Performance Workout',
    gymId,
    startTime: '2026-03-01T08:00:00.000Z',
    endTime: '2026-03-01T09:00:00.000Z',
    durationSeconds: 3600,
    totalVolumeKg: 830,
    exercises: [
      {
        id: 'detail-w1-ex1',
        exerciseId,
        exercise,
        restTimerSeconds: 90,
        sets: [
          {
            id: 'detail-s1',
            setNumber: 1,
            type: 'normal',
            weightKg: 100,
            reps: 5,
            isCompleted: true,
          },
          {
            id: 'detail-s2',
            setNumber: 2,
            type: 'normal',
            weightKg: 110,
            reps: 3,
            isCompleted: true,
          },
          {
            id: 'detail-s3',
            setNumber: 3,
            type: 'warmup',
            weightKg: 40,
            reps: 8,
            isCompleted: true,
          },
        ],
      },
    ],
  };
}

describe('exercise detail data loading', () => {
  it('issues one history query and computes stats and podium from it', async () => {
    const driver = new RecordingDriver();
    const store = createNativeStore(driver);
    await store.init();

    const exercise = getDefaultExercises()[0];
    const gym = await store.getDefaultGym();
    await store.finishWorkout(makeWorkout(exercise.id, exercise, gym.id));

    driver.reads.length = 0;
    const data = await loadExerciseDetailData(store, exercise, gym);

    const historyQueries = driver.reads.filter(sql => sql.includes(HISTORY_SQL));
    assert.equal(historyQueries.length, 1, 'the history is read exactly once');

    assert.equal(data.historyWorkouts.length, 1);
    assert.equal(data.resolvedGym.id, gym.id);
    assert.equal(data.gymNamesMap.get(gym.id), gym.name);
    assert.equal(data.stats.global.sessionCount, 1);
    assert.equal(data.stats.global.maxWeightKg, 110, 'warmup sets do not block completed maxima');
    assert.equal(data.stats.global.maxReps, 8, 'all completed sets count toward rep maxima');
    assert.equal(data.podium.weight[0]?.value, 110, 'warmup sets are excluded from the podium');
  });

  it('replaces the two-query modal path without changing results', async () => {
    const driver = new RecordingDriver();
    const store = createNativeStore(driver);
    await store.init();

    const exercise = getDefaultExercises()[0];
    const gym = await store.getDefaultGym();
    await store.finishWorkout(makeWorkout(exercise.id, exercise, gym.id));

    driver.reads.length = 0;
    const data = await loadExerciseDetailData(store, exercise, gym);

    // The previous modal called getExerciseStats and
    // getCompletedWorkoutsForExercise in parallel, reading history twice.
    driver.reads.length = 0;
    const [legacyStats, legacyHistory] = await Promise.all([
      store.getExerciseStats(exercise.id, gym.id),
      store.getCompletedWorkoutsForExercise(exercise.id),
    ]);
    const legacyHistoryQueries = driver.reads.filter(sql => sql.includes(HISTORY_SQL));
    assert.equal(legacyHistoryQueries.length, 2, 'the old path duplicated the history query');

    assert.deepEqual(data.stats, legacyStats);
    assert.deepEqual(
      data.historyWorkouts.map(w => w.id),
      legacyHistory.map(w => w.id),
    );

    // Podium equivalence against the direct aggregation the modal used.
    const allowedGymIds = getAllowedGymIds(exercise, data.scope || undefined, gym.id);
    assert.deepEqual(
      data.podium,
      extractExercisePodium(data.historyWorkouts, exercise.id, data.gyms, allowedGymIds),
    );

    // And stats equivalence against the direct domain aggregation.
    assert.deepEqual(
      data.stats,
      calculateDualExerciseStats(
        data.historyWorkouts,
        exercise.id,
        gym.id,
        data.scope || undefined,
      ),
    );
  });
});
