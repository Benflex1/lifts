import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { indexedDB, IDBObjectStore } from 'fake-indexeddb';
import { createWebStore } from '../../src/database/webStore';
import { DEFAULT_EXERCISES } from '../../src/database/seedData';
import { Workout } from '../../src/types';

function makeWorkout(index: number): Workout {
  const exercises = DEFAULT_EXERCISES.slice(index % 4, (index % 4) + 2).map((exercise, exerciseIndex) => ({
    id: `web-bulk-${index}-ex${exerciseIndex}`,
    exerciseId: exercise.id,
    exercise,
    restTimerSeconds: 90,
    targetReps: '8-12',
    sets: [0, 1].map((setIndex) => ({
      id: `web-bulk-${index}-ex${exerciseIndex}-s${setIndex}`,
      setNumber: setIndex + 1,
      type: 'normal' as const,
      weightKg: 50 + setIndex * 5,
      reps: 10 - setIndex,
      isCompleted: true,
      completedAt: new Date(Date.UTC(2026, 1, 1 + index, 8, 10 + setIndex)).toISOString(),
    })),
  }));

  return {
    id: `web-bulk-${String(index).padStart(3, '0')}`,
    name: `Web Bulk Workout ${index}`,
    gymId: 'gym-default',
    startTime: new Date(Date.UTC(2026, 1, 1 + index, 8)).toISOString(),
    endTime: new Date(Date.UTC(2026, 1, 1 + index, 9)).toISOString(),
    durationSeconds: 3600,
    totalVolumeKg: 900 + index,
    exercises,
  };
}

describe('web snapshot read performance guarantees', () => {
  it('reads full workouts with a single bulk read and no per-workout gets', async () => {
    const dbName = `lifts-test-web-bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const store = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();

    for (let index = 0; index < 4; index++) {
      await store.saveCompletedWorkout(makeWorkout(index));
    }

    const originalGet = IDBObjectStore.prototype.get;
    const originalGetAll = IDBObjectStore.prototype.getAll;
    const workoutGets: unknown[] = [];
    let workoutGetAlls = 0;

    IDBObjectStore.prototype.get = function (this: IDBObjectStore, key: unknown) {
      if (this.name === 'workouts') workoutGets.push(key);
      return originalGet.call(this, key as never);
    };
    IDBObjectStore.prototype.getAll = function (this: IDBObjectStore) {
      if (this.name === 'workouts') workoutGetAlls++;
      return originalGetAll.call(this);
    };

    try {
      const snapshot = await store.readSnapshot();

      assert.equal(snapshot.workouts.length, 4);
      assert.equal(
        workoutGets.length,
        0,
        `readSnapshot issued ${workoutGets.length} per-workout detail reads`,
      );
      assert.equal(workoutGetAlls, 1);
      assert.ok(snapshot.workouts.every(workout => workout.exercises.length > 0));
      assert.ok(
        snapshot.workouts.every(workout =>
          workout.exercises.every(exercise => exercise.sets.length > 0 && Boolean(exercise.exercise?.name)),
        ),
        'snapshot workouts must contain full exercise and set data',
      );
    } finally {
      IDBObjectStore.prototype.get = originalGet;
      IDBObjectStore.prototype.getAll = originalGetAll;
      await store.close();
    }
  });
});
