import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ActiveExercise, TrackingType, Workout } from '../../src/types';
import { extractExerciseProgression, isPointPrForMetric } from '../../src/workout/analytics';
import {
  formatTopSet,
  pointsWithMetric,
  PROGRESSION_METRICS,
  progressionMetricsFor,
  resolveProgressionMetric,
} from '../../src/workout/progression-metrics';

type SetInput = {
  durationSeconds?: number;
  distanceM?: number;
  weightKg?: number;
  reps?: number;
  isCompleted?: boolean;
};

const exercise = (
  id: string,
  trackingType: TrackingType | undefined,
  sets: SetInput[],
): ActiveExercise => ({
  id: `ae-${id}-${Math.random().toString(36).slice(2, 7)}`,
  exerciseId: id,
  exercise: { id, name: id, category: 'cardio', equipment: 'none', primaryMuscles: [] },
  restTimerSeconds: 0,
  ...(trackingType ? { trackingType } : {}),
  sets: sets.map((set, index) => ({
    id: `set-${id}-${index}`,
    setNumber: index + 1,
    type: 'normal',
    weightKg: set.weightKg ?? 0,
    reps: set.reps ?? 0,
    ...(set.durationSeconds !== undefined ? { durationSeconds: set.durationSeconds } : {}),
    ...(set.distanceM !== undefined ? { distanceM: set.distanceM } : {}),
    isCompleted: set.isCompleted ?? true,
  })),
});

const workout = (id: string, startTime: string, exercises: ActiveExercise[]): Workout => ({
  id,
  name: `Workout ${id}`,
  gymId: 'gym',
  startTime,
  endTime: startTime,
  durationSeconds: 3600,
  totalVolumeKg: 0,
  exercises,
});

describe('time and distance progression', () => {
  it('picks metrics by tracking type and falls back when the choice is missing', () => {
    assert.deepEqual(progressionMetricsFor('duration'), ['max_duration', 'total_duration']);
    assert.deepEqual(progressionMetricsFor('distance_duration'), [
      'max_distance',
      'best_pace',
      'total_duration',
    ]);
    assert.deepEqual(progressionMetricsFor('bodyweight_reps'), ['max_reps']);
    assert.deepEqual(progressionMetricsFor('weight_reps'), [
      'e1rm',
      'max_weight',
      'max_reps',
      'volume',
    ]);
    assert.equal(resolveProgressionMetric('e1rm', 'duration'), 'max_duration');
    assert.equal(resolveProgressionMetric('best_pace', 'distance_duration'), 'best_pace');
    assert.equal(resolveProgressionMetric('best_pace', 'weight_reps'), 'e1rm');
  });

  it('charts the longest and total time for timed exercises, with PRs', () => {
    const series = extractExerciseProgression(
      [
        workout('w1', '2026-09-01T10:00:00.000Z', [
          exercise('plank', 'duration', [{ durationSeconds: 60 }, { durationSeconds: 45 }]),
        ]),
        workout('w2', '2026-09-03T10:00:00.000Z', [
          exercise('plank', 'duration', [
            { durationSeconds: 90 },
            { durationSeconds: 30, isCompleted: false },
          ]),
        ]),
      ],
      'plank',
    );
    assert.equal(series.trackingType, 'duration');
    assert.deepEqual(
      series.points.map(p => [p.maxDurationSeconds, p.totalDurationSeconds]),
      [
        [60, 105],
        [90, 90],
      ],
    );
    assert.equal(isPointPrForMetric(series.points[1], 'max_duration'), true);
    assert.equal(isPointPrForMetric(series.points[1], 'total_duration'), false);
    assert.equal(formatTopSet(series.points[1], 'duration', 'kg'), '1:30');
  });

  it('charts distance and the fastest pace for runs, where a lower pace is the PR', () => {
    const series = extractExerciseProgression(
      [
        workout('w1', '2026-09-01T10:00:00.000Z', [
          exercise('run', 'distance_duration', [{ distanceM: 5000, durationSeconds: 1800 }]),
        ]),
        workout('w2', '2026-09-03T10:00:00.000Z', [
          exercise('run', 'distance_duration', [{ distanceM: 4000, durationSeconds: 1320 }]),
        ]),
        workout('w3', '2026-09-05T10:00:00.000Z', [
          exercise('run', 'distance_duration', [{ distanceM: 6000 }]),
        ]),
      ],
      'run',
    );
    assert.deepEqual(
      series.points.map(p => p.maxDistanceM),
      [5000, 4000, 6000],
    );
    assert.deepEqual(
      series.points.map(p => p.bestPaceSecondsPerKm),
      [360, 330, 0],
    );
    assert.equal(isPointPrForMetric(series.points[1], 'best_pace'), true);
    assert.equal(isPointPrForMetric(series.points[2], 'max_distance'), true);
    // A session without a time has no pace, so it is left off the pace chart.
    assert.equal(pointsWithMetric(series.points, 'best_pace', 'kg').length, 2);
    assert.equal(formatTopSet(series.points[0], 'distance_duration', 'kg'), '5 km in 30:00');
  });

  it('formats pace per km or per mile and plots it in display units', () => {
    const series = extractExerciseProgression(
      [
        workout('w1', '2026-09-01T10:00:00.000Z', [
          exercise('run', 'distance_duration', [{ distanceM: 5000, durationSeconds: 1500 }]),
        ]),
      ],
      'run',
    );
    const pace = PROGRESSION_METRICS.best_pace;
    assert.equal(pace.format(pace.value(series.points[0], 'kg'), 'kg'), '5:00 /km');
    assert.equal(pace.format(pace.value(series.points[0], 'lb'), 'lb'), '8:03 /mi');
    const distance = PROGRESSION_METRICS.max_distance;
    assert.equal(distance.format(distance.value(series.points[0], 'lb'), 'lb'), '3.11 mi');
  });

  it('uses the most recent tracking type and ignores time on weight sets', () => {
    const series = extractExerciseProgression(
      [
        workout('w1', '2026-09-01T10:00:00.000Z', [
          exercise('row', 'distance_duration', [{ distanceM: 2000, durationSeconds: 480 }]),
        ]),
        workout('w2', '2026-09-03T10:00:00.000Z', [
          exercise('row', undefined, [{ weightKg: 60, reps: 10, durationSeconds: 30 }]),
        ]),
      ],
      'row',
    );
    assert.equal(series.trackingType, 'weight_reps');
    assert.equal(series.points[1].maxDurationSeconds, 0);
    assert.equal(formatTopSet(series.points[1], 'weight_reps', 'kg'), '60 kg × 10');
  });

  it('formats and plots every metric in both unit systems', () => {
    const [point] = extractExerciseProgression(
      [
        workout('w1', '2026-09-01T10:00:00.000Z', [
          exercise('run', 'distance_duration', [
            { distanceM: 12000, durationSeconds: 3600, weightKg: 100, reps: 5 },
          ]),
        ]),
      ],
      'run',
    ).points;
    for (const unit of ['kg', 'lb'] as const) {
      for (const spec of Object.values(PROGRESSION_METRICS)) {
        const value = spec.value(point, unit);
        assert.equal(typeof spec.format(value, unit), 'string');
        assert.equal(typeof spec.axis(value, unit), 'string');
      }
    }
    assert.equal(PROGRESSION_METRICS.max_reps.axis(5, 'kg'), '5');
    assert.equal(PROGRESSION_METRICS.max_distance.axis(12, 'kg'), '12');
    assert.equal(PROGRESSION_METRICS.max_distance.axis(5.25, 'kg'), '5.3');
    assert.equal(PROGRESSION_METRICS.max_duration.axis(90, 'kg'), '1:30');
    assert.equal(PROGRESSION_METRICS.max_reps.format(5, 'kg'), '5 reps');
    assert.equal(PROGRESSION_METRICS.e1rm.format(100, 'kg'), '100 KG');
  });

  it('drops sessions without the chosen time or distance value, but keeps every weight session', () => {
    const { points } = extractExerciseProgression(
      [
        workout('w1', '2026-09-01T10:00:00.000Z', [
          exercise('run', 'distance_duration', [{ distanceM: 5000 }]),
        ]),
        workout('w2', '2026-09-03T10:00:00.000Z', [
          exercise('run', 'distance_duration', [{ distanceM: 5000, durationSeconds: 1500 }]),
        ]),
      ],
      'run',
    );
    assert.equal(pointsWithMetric(points, 'best_pace', 'kg').length, 1);
    assert.equal(pointsWithMetric(points, 'max_distance', 'kg').length, 2);
    assert.equal(pointsWithMetric(points, 'max_reps', 'kg').length, 2);
  });

  it('describes the best set for timed, distance and weight exercises', () => {
    const plank = extractExerciseProgression(
      [
        workout('w1', '2026-09-01T10:00:00.000Z', [
          exercise('plank', 'duration', [{ durationSeconds: 90 }]),
        ]),
      ],
      'plank',
    ).points[0];
    const run = extractExerciseProgression(
      [
        workout('w1', '2026-09-01T10:00:00.000Z', [
          exercise('run', 'distance_duration', [{ distanceM: 5000, durationSeconds: 1500 }]),
          exercise('walk', 'distance_duration', [{ distanceM: 3000 }]),
          exercise('jog', 'distance_duration', [{ durationSeconds: 600 }]),
        ]),
      ],
      'run',
    ).points[0];
    assert.equal(formatTopSet(plank, 'duration', 'kg'), '1:30');
    assert.equal(formatTopSet(run, 'distance_duration', 'kg'), '5 km in 25:00');
    const walk = extractExerciseProgression(
      [
        workout('w1', '2026-09-01T10:00:00.000Z', [
          exercise('walk', 'distance_duration', [{ distanceM: 3000 }]),
        ]),
      ],
      'walk',
    ).points[0];
    assert.equal(formatTopSet(walk, 'distance_duration', 'kg'), '3 km');
    const jog = extractExerciseProgression(
      [
        workout('w1', '2026-09-01T10:00:00.000Z', [
          exercise('jog', 'distance_duration', [{ durationSeconds: 600 }]),
        ]),
      ],
      'jog',
    ).points[0];
    assert.equal(formatTopSet(jog, 'distance_duration', 'kg'), '10:00');
  });
});
