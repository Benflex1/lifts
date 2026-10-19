import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { NodeSqliteDriver } from '../helpers/storeFixture';
import { createNativeStore } from '../../src/database/nativeStore';
import { getDefaultExercises } from '../../src/database/seedData';
import { Workout } from '../../src/types';

/** Counts read queries so tests can pin constant-query behavior. */
class CountingDriver extends NodeSqliteDriver {
  reads = 0;

  override async getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]> {
    this.reads++;
    return super.getAllAsync<T>(sql, ...params);
  }

  override async getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null> {
    this.reads++;
    return super.getFirstAsync<T>(sql, ...params);
  }
}

function makeWorkout(index: number, exerciseOffset: number): Workout {
  const exercises = [0, 1, 2].map(slot => getDefaultExercises()[(exerciseOffset + slot) % 20]);

  return {
    id: `perf-${String(index).padStart(3, '0')}`,
    name: `Performance Workout ${index}`,
    gymId: 'gym-default',
    startTime: new Date(Date.UTC(2026, 1, 1 + index, 8)).toISOString(),
    endTime: new Date(Date.UTC(2026, 1, 1 + index, 9)).toISOString(),
    durationSeconds: 3600,
    totalVolumeKg: 1200 + index,
    exercises: exercises.map((exercise, exerciseIndex) => ({
      id: `perf-${index}-ex${exerciseIndex}`,
      exerciseId: exercise.id,
      exercise,
      restTimerSeconds: 90,
      targetReps: '8-12',
      sets: [0, 1, 2].map(setIndex => ({
        id: `perf-${index}-ex${exerciseIndex}-s${setIndex}`,
        setNumber: setIndex + 1,
        type: 'normal' as const,
        weightKg: 60 + setIndex * 5,
        reps: 10 - setIndex,
        isCompleted: true,
        completedAt: new Date(Date.UTC(2026, 1, 1 + index, 8, 10 + setIndex)).toISOString(),
      })),
    })),
  };
}

describe('native query performance guarantees', () => {
  it('creates the history and exercise-sheet indexes', async () => {
    const driver = new NodeSqliteDriver();
    const store = createNativeStore(driver);
    await store.init();

    const expectedIndexes = [
      ['workouts', 'idx_workouts_in_progress_start'],
      ['workout_exercises', 'idx_workout_exercises_workout'],
      ['workout_exercises', 'idx_workout_exercises_exercise'],
      ['exercise_sets', 'idx_exercise_sets_workout_exercise'],
    ] as const;

    for (const [table, indexName] of expectedIndexes) {
      const indexes = await driver.getAllAsync<{ name: string }>(`PRAGMA index_list(${table})`);
      assert.ok(
        indexes.some(index => index.name === indexName),
        `${table} is missing ${indexName}`,
      );
    }

    const queryPlans: Array<{ label: string; sql: string; params: any[]; index: string }> = [
      {
        label: 'workout history',
        sql: 'EXPLAIN QUERY PLAN SELECT w.id FROM workouts w WHERE w.in_progress = 0 ORDER BY w.start_time DESC',
        params: [],
        index: 'idx_workouts_in_progress_start',
      },
      {
        label: 'exercise history join',
        sql: 'EXPLAIN QUERY PLAN SELECT w.id FROM workouts w JOIN workout_exercises we ON we.workout_id = w.id WHERE we.exercise_id = ?',
        params: [getDefaultExercises()[0].id],
        index: 'idx_workout_exercises_exercise',
      },
      {
        label: 'exercise set lookup',
        sql: 'EXPLAIN QUERY PLAN SELECT * FROM exercise_sets WHERE workout_exercise_id = ?',
        params: ['perf-occurrence'],
        index: 'idx_exercise_sets_workout_exercise',
      },
    ];

    for (const { label, sql, params, index } of queryPlans) {
      const rows = await driver.getAllAsync<{ detail: string }>(sql, ...params);
      assert.ok(
        rows.some(row => row.detail.includes(index)),
        `${label} should use ${index}, got: ${rows.map(row => row.detail).join(' | ')}`,
      );
    }

    driver.close();
  });

  it('loads history for many exercises with a constant number of queries', async () => {
    const driver = new CountingDriver();
    const store = createNativeStore(driver);
    await store.init();

    for (let i = 0; i < 6; i++) {
      await store.saveCompletedWorkout(makeWorkout(i, i));
    }

    const exerciseIds = Array.from({ length: 6 }, (_, index) => getDefaultExercises()[index].id);

    // Warm the exercise catalog cache so the test measures only history reads.
    await store.getAllExercises();
    driver.reads = 0;

    const result = await store.getCompletedWorkoutsForExercises(exerciseIds);

    for (const exerciseId of exerciseIds) {
      assert.ok(Array.isArray(result[exerciseId]));
    }
    assert.ok(result[exerciseIds[0]].length > 0);

    // Before batching this issued one join query per exercise (six+ reads).
    assert.ok(
      driver.reads <= 3,
      `batched exercise history issued ${driver.reads} reads for ${exerciseIds.length} exercises`,
    );

    driver.close();
  });
});
