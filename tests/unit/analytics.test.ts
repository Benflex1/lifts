import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ActiveExercise, Workout } from '../../src/types';
import { buildMuscleFrequency, buildWeeklyVolume } from '../../src/workout/analytics';

const makeExercise = (
  id: string,
  primaryMuscles: string[],
  completed = true
): ActiveExercise => ({
  id: `active-${id}`,
  exerciseId: id,
  exercise: {
    id,
    name: id,
    category: 'strength',
    equipment: 'barbell',
    primaryMuscles,
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
      { muscle: 'chest', count: 2 },
      { muscle: 'glutes', count: 1 },
      { muscle: 'quadriceps', count: 1 },
      { muscle: 'triceps', count: 1 },
    ]);
  });
});
