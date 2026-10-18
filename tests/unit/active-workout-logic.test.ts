import assert from 'node:assert/strict';
import test from 'node:test';
import { ActiveExercise, Gym, Workout, WorkoutSet } from '../../src/types';
import {
  buildPriorRecordIndex,
  collectPriorWorkouts,
  computeDropSetSuggestions,
  computeLiveSetStats,
  findPreviousWorkingSet,
  getCompletedSetIds,
  isMoveDownDisabled,
  isMoveUpDisabled,
  resolveDisplayedActiveGym,
} from '../../src/screens/activeWorkout/activeWorkoutLogic';

function makeSet(id: string, overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id,
    setNumber: 1,
    type: 'normal',
    weightKg: 100,
    reps: 5,
    isCompleted: false,
    ...overrides,
  };
}

function makeActiveExercise(id: string, sets: WorkoutSet[]): ActiveExercise {
  return {
    id,
    exerciseId: `ex-${id}`,
    exercise: {
      id: `ex-${id}`,
      name: `Exercise ${id}`,
      category: 'strength',
      equipment: 'barbell',
      primaryMuscles: ['chest'],
    },
    restTimerSeconds: 90,
    sets,
  };
}

function makeWorkout(id: string, startTime: string, exerciseId: string, set: Partial<WorkoutSet>): Workout {
  return {
    id,
    name: id,
    gymId: 'g1',
    startTime,
    durationSeconds: 3600,
    totalVolumeKg: 0,
    exercises: [
      {
        id: `ae-${id}`,
        exerciseId,
        exercise: {
          id: exerciseId,
          name: exerciseId,
          category: 'strength',
          equipment: 'barbell',
          primaryMuscles: ['chest'],
        },
        restTimerSeconds: 90,
        sets: [makeSet(`set-${id}`, { setNumber: 1, isCompleted: true, ...set })],
      },
    ],
  };
}

function makeGym(id: string): Gym {
  return { id, name: id, isDefault: false, color: '#ff0000', createdAt: '2024-01-01T00:00:00.000Z' };
}

test('computeLiveSetStats sums completed volume and counts completed sets', () => {
  const exercises = [
    makeActiveExercise('a', [
      makeSet('a1', { weightKg: 100, reps: 5, isCompleted: true }),
      makeSet('a2', { weightKg: 80, reps: 10, isCompleted: false }),
    ]),
    makeActiveExercise('b', [makeSet('b1', { weightKg: 60, reps: 8, isCompleted: true })]),
  ];

  assert.deepEqual(computeLiveSetStats(exercises), {
    liveVolume: 100 * 5 + 60 * 8,
    completedSetsCount: 2,
    totalSetsCount: 3,
  });
  assert.deepEqual(computeLiveSetStats([]), {
    liveVolume: 0,
    completedSetsCount: 0,
    totalSetsCount: 0,
  });
});

test('getCompletedSetIds collects only completed set IDs', () => {
  const exercises = [
    makeActiveExercise('a', [
      makeSet('a1', { isCompleted: true }),
      makeSet('a2', { isCompleted: false }),
    ]),
    makeActiveExercise('b', [makeSet('b1', { isCompleted: true })]),
  ];

  assert.deepEqual([...getCompletedSetIds(exercises)].sort(), ['a1', 'b1']);
});

test('collectPriorWorkouts deduplicates across exercise histories and excludes the active workout', () => {
  const w1 = makeWorkout('w1', '2024-01-01T10:00:00.000Z', 'ex1', {});
  const w2 = makeWorkout('w2', '2024-01-02T10:00:00.000Z', 'ex2', {});
  const active = makeWorkout('w3', '2024-01-03T10:00:00.000Z', 'ex1', {});

  const history = { ex1: [w1, active], ex2: [w2, active], ex3: [w1] };

  assert.deepEqual(
    collectPriorWorkouts(history, active.startTime).map((workout) => workout.id),
    ['w1', 'w2'],
  );
  assert.deepEqual(
    collectPriorWorkouts(history, undefined).map((workout) => workout.id),
    ['w1', 'w3', 'w2'],
  );
});

test('buildPriorRecordIndex indexes prior workouts and skips the active one', () => {
  const w1 = makeWorkout('w1', '2024-01-01T10:00:00.000Z', 'ex1', { weightKg: 100, reps: 5 });
  const active = makeWorkout('w2', '2024-01-02T10:00:00.000Z', 'ex2', { weightKg: 50, reps: 5 });
  const history = { ex1: [w1], ex2: [active] };

  const index = buildPriorRecordIndex(history, active.startTime);
  assert.deepEqual(index.leaderboard('ex1', null).weight, [100]);
  assert.deepEqual(index.leaderboard('ex2', null).weight, []);

  const fullIndex = buildPriorRecordIndex(history, undefined);
  assert.deepEqual(fullIndex.leaderboard('ex2', null).weight, [50]);
});

test('resolveDisplayedActiveGym prefers the active gym, then the workout gym', () => {
  const gyms = [makeGym('g1'), makeGym('g2')];
  const activeGym = makeGym('g2');

  assert.equal(resolveDisplayedActiveGym(activeGym, gyms, 'g1')?.id, 'g2');
  assert.equal(resolveDisplayedActiveGym(null, gyms, 'g1')?.id, 'g1');
  assert.equal(resolveDisplayedActiveGym(null, gyms, 'missing'), null);
  assert.equal(resolveDisplayedActiveGym(null, gyms, undefined), null);
});

test('findPreviousWorkingSet skips warmups, unweighted sets, and later sets', () => {
  const sets = [
    makeSet('s1', { setNumber: 1, type: 'warmup', weightKg: 50 }),
    makeSet('s2', { setNumber: 2, weightKg: 100 }),
    makeSet('s3', { setNumber: 3, weightKg: 0 }),
    makeSet('s4', { setNumber: 4, weightKg: 110 }),
  ];

  assert.equal(findPreviousWorkingSet(sets, 3)?.id, 's2');
  assert.equal(findPreviousWorkingSet(sets, 2)?.id, 's2');
  assert.equal(findPreviousWorkingSet(sets, 1), undefined);
  assert.equal(findPreviousWorkingSet(sets, 0), undefined);
});

test('computeDropSetSuggestions produces 20/25/30 percent reductions rounded to the increment', () => {
  assert.deepEqual(computeDropSetSuggestions(makeSet('s1', { weightKg: 100 }), 'kg'), [
    { pct: 20, kg: 80 },
    { pct: 25, kg: 75 },
    { pct: 30, kg: 70 },
  ]);
});

test('menu move guards reflect list boundaries', () => {
  assert.equal(isMoveUpDisabled(0), true);
  assert.equal(isMoveUpDisabled(-1), true);
  assert.equal(isMoveUpDisabled(1), false);

  assert.equal(isMoveDownDisabled(0, 3), false);
  assert.equal(isMoveDownDisabled(1, 3), false);
  assert.equal(isMoveDownDisabled(2, 3), true);
  assert.equal(isMoveDownDisabled(-1, 3), true);
  assert.equal(isMoveDownDisabled(0, 1), true);
});
