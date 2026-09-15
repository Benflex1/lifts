import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ActiveExercise, Workout } from '../../src/types';
import { buildMuscleFrequency, buildWeeklyVolume } from '../../src/workout/analytics';

const makeExercise = (
  id: string,
  primaryMuscles: string[],
  completed = true,
  secondaryMuscles: string[] = [],
): ActiveExercise => ({
  id: `active-${id}`,
  exerciseId: id,
  exercise: {
    id,
    name: id,
    category: 'strength',
    equipment: 'barbell',
    primaryMuscles,
    secondaryMuscles,
  },
  restTimerSeconds: 0,
  sets: [{
    id: `set-${id}`,
    setNumber: 1,
    type: 'normal',
    weightKg: 10,
    reps: 5,
    isCompleted: completed,
  }],
});

const makeWorkout = (
  id: string,
  startTime: string,
  totalVolumeKg: number,
  exercises: ActiveExercise[]
): Workout => ({
  id,
  name: id,
  gymId: 'gym-default',
  startTime,
  endTime: startTime,
  durationSeconds: 3600,
  totalVolumeKg,
  exercises,
});

describe('analytics aggregators', () => {
  it('groups volume by Monday-based week and fills missing weeks with zero', () => {
    const workouts = [
      makeWorkout('week-1', '2026-08-24T09:00:00.000Z', 20, []),
      makeWorkout('week-2a', '2026-08-31T09:00:00.000Z', 10, []),
      makeWorkout('week-2b', '2026-09-01T09:00:00.000Z', 5, []),
      makeWorkout('current-week', '2026-09-07T09:00:00.000Z', 15, []),
      makeWorkout('too-old', '2026-07-01T09:00:00.000Z', 999, []),
    ];

    const points = buildWeeklyVolume(workouts, new Date('2026-09-09T12:00:00.000Z'), 8);

    assert.equal(points.length, 8);
    assert.deepEqual(
      points.filter(point => point.volumeKg > 0).map(point => [point.key, point.volumeKg]),
      [
        ['2026-08-24', 20],
        ['2026-08-31', 15],
        ['2026-09-07', 15],
      ]
    );
    assert.ok(points.some(point => point.key === '2026-08-17' && point.volumeKg === 0));
  });

  it('counts each muscle once per workout and sorts the most frequent muscles first', () => {
    const workouts = [
      makeWorkout('push-1', '2026-09-01T09:00:00.000Z', 100, [
        makeExercise('bench', ['chest', 'triceps']),
        makeExercise('incline', ['chest']),
      ]),
      makeWorkout('full-body', '2026-09-03T09:00:00.000Z', 100, [
        makeExercise('squat', ['quadriceps', 'glutes']),
        makeExercise('bench-2', ['chest']),
      ]),
      makeWorkout('draft-like', '2026-09-04T09:00:00.000Z', 0, [
        makeExercise('unfinished', ['chest'], false),
      ]),
    ];

    assert.deepEqual(buildMuscleFrequency(workouts), [
      { muscle: 'chest', primaryCount: 2, secondaryCount: 0, count: 2 },
      { muscle: 'glutes', primaryCount: 1, secondaryCount: 0, count: 1 },
      { muscle: 'quadriceps', primaryCount: 1, secondaryCount: 0, count: 1 },
      { muscle: 'triceps', primaryCount: 1, secondaryCount: 0, count: 1 },
    ]);
  });

  it('uses current catalog metadata and counts each role once per workout', () => {
    const staleEmbeddedExercise = makeExercise('bench', ['chest'], true, ['shoulders']);
    const workouts = [
      makeWorkout('first', '2026-09-01T09:00:00.000Z', 100, [
        staleEmbeddedExercise,
        makeExercise('bench', ['chest'], true, ['shoulders']),
      ]),
      makeWorkout('second', '2026-09-02T09:00:00.000Z', 100, [
        makeExercise('bench', ['chest'], true, ['shoulders']),
      ]),
    ];
    const catalog = [{
      ...staleEmbeddedExercise.exercise,
      secondaryMuscles: ['triceps'],
    }];

    assert.deepEqual(buildMuscleFrequency(workouts, { exerciseCatalog: catalog }), [
      { muscle: 'chest', primaryCount: 2, secondaryCount: 0, count: 2 },
      { muscle: 'triceps', primaryCount: 0, secondaryCount: 2, count: 2 },
    ]);
  });

  it('counts a muscle in both roles without collapsing either role', () => {
    const workouts = [
      makeWorkout('overlap', '2026-09-01T09:00:00.000Z', 100, [
        makeExercise('first', ['Chest'], true, ['Shoulders']),
        makeExercise('second', ['shoulders'], true, ['chest']),
      ]),
    ];

    assert.deepEqual(buildMuscleFrequency(workouts), [
      { muscle: 'chest', primaryCount: 1, secondaryCount: 1, count: 2 },
      { muscle: 'shoulders', primaryCount: 1, secondaryCount: 1, count: 2 },
    ]);
  });

  it('applies the limit after sorting and retains the legacy numeric limit call', () => {
    const workouts = [
      makeWorkout('limited', '2026-09-01T09:00:00.000Z', 100, [
        makeExercise('one', ['back'], true, ['arms']),
        makeExercise('two', ['chest']),
        makeExercise('three', ['legs']),
      ]),
    ];

    assert.deepEqual(buildMuscleFrequency(workouts, { limit: 2 }), [
      { muscle: 'arms', primaryCount: 0, secondaryCount: 1, count: 1 },
      { muscle: 'back', primaryCount: 1, secondaryCount: 0, count: 1 },
    ]);
    assert.equal(buildMuscleFrequency(workouts, 1).length, 1);
  });
});
