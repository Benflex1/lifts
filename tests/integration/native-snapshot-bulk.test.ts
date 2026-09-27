import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { NodeSqliteDriver } from '../helpers/storeFixture';
import { createNativeStore } from '../../src/database/nativeStore';
import { DEFAULT_EXERCISES } from '../../src/database/seedData';
import { Workout } from '../../src/types';

/** Counts read queries so the test can pin that history loads in bulk. */
class CountingDriver extends NodeSqliteDriver {
  reads = 0;
  async getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]> {
    this.reads++;
    return super.getAllAsync<T>(sql, ...params);
  }
  async getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null> {
    this.reads++;
    return super.getFirstAsync<T>(sql, ...params);
  }
}

function makeWorkout(i: number): Workout {
  const exercises = DEFAULT_EXERCISES.slice(i % 5, (i % 5) + 3);
  return {
    id: `bulk-${String(i).padStart(3, '0')}`,
    name: `Workout ${i}`,
    gymId: 'gym-default',
    startTime: new Date(Date.UTC(2026, 0, 1 + i, 8)).toISOString(),
    endTime: new Date(Date.UTC(2026, 0, 1 + i, 9)).toISOString(),
    durationSeconds: 3600,
    totalVolumeKg: 1000 + i,
    notes: i % 4 === 0 ? `note ${i}` : undefined,
    exercises: exercises.map((exercise, e) => ({
      id: `bulk-${i}-ex${e}`,
      exerciseId: exercise.id,
      exercise,
      restTimerSeconds: 90,
      targetReps: e === 0 ? '8-12' : undefined,
      notes: e === 1 ? 'seat 4' : undefined,
      sets: Array.from({ length: 3 + (e % 2) }, (_, s) => ({
        id: `bulk-${i}-ex${e}-s${s}`,
        setNumber: s + 1,
        type: s === 0 ? 'warmup' : 'normal',
        weightKg: 40 + i + s * 5,
        reps: 8 - s,
        isCompleted: s !== 3,
        completedAt: new Date(Date.UTC(2026, 0, 1 + i, 8, 10 + s)).toISOString(),
      })),
    })),
  } as Workout;
}

describe('native store snapshot loading', () => {
  it('returns the same workouts as per-workout detail loads, using a constant number of queries', async () => {
    const driver = new CountingDriver();
    const store = createNativeStore(driver);
    await store.init();
    for (let i = 0; i < 40; i++) await store.saveCompletedWorkout(makeWorkout(i));

    const history = await store.getWorkoutHistory();
    const expected: Workout[] = [];
    for (const item of history) expected.push((await store.getWorkoutDetail(item.id))!);

    driver.reads = 0;
    const snapshot = await store.readSnapshot();
    const snapshotReads = driver.reads;

    assert.deepStrictEqual(snapshot.workouts, expected);
    assert.equal(snapshot.workouts.length, 40);
    // Previously ~1 + 40 * (2 + 3) queries for the workouts alone; now a handful regardless of size.
    assert.ok(snapshotReads < 25, `readSnapshot issued ${snapshotReads} queries`);

    driver.close();
  });
});
