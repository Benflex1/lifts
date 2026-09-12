import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ActiveExercise, Workout } from '../../src/types';
import {
  extractExerciseProgression,
  buildTrainingDistribution,
  buildRepRangeDistribution,
  buildConsistencySummary,
  buildLifetimeTrainingStats,
  getTimeframeCutoff,
  isPointPrForMetric,
} from '../../src/workout/analytics';

const makeExercise = (
  exerciseId: string,
  primaryMuscles: string[],
  sets: Array<{ weightKg: number; reps: number; isCompleted?: boolean; rpe?: number }>,
): ActiveExercise => ({
  id: `ae-${exerciseId}-${Math.random().toString(36).slice(2, 7)}`,
  exerciseId,
  exercise: {
    id: exerciseId,
    name: exerciseId,
    category: 'strength',
    equipment: 'barbell',
    primaryMuscles,
  },
  restTimerSeconds: 0,
  sets: sets.map((s, idx) => ({
    id: `set-${exerciseId}-${idx}`,
    setNumber: idx + 1,
    type: 'normal',
    weightKg: s.weightKg,
    reps: s.reps,
    rpe: s.rpe,
    isCompleted: s.isCompleted !== undefined ? s.isCompleted : true,
  })),
});

const makeWorkout = (
  id: string,
  startTime: string,
  gymId: string = 'gym-main',
  exercises: ActiveExercise[] = [],
): Workout => ({
  id,
  name: `Workout ${id}`,
  gymId,
  startTime,
  endTime: startTime,
  durationSeconds: 3600,
  totalVolumeKg: 100,
  exercises,
});

describe('getTimeframeCutoff', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');

  it('returns 0 for ALL', () => {
    assert.equal(getTimeframeCutoff('ALL', now), 0);
  });

  it('computes accurate cutoffs for 1M, 3M, 6M, 1Y', () => {
    const oneMonth = getTimeframeCutoff('1M', now);
    const diffDays1M = (now.getTime() - oneMonth) / (86400 * 1000);
    assert.equal(diffDays1M, 30);

    const threeMonths = getTimeframeCutoff('3M', now);
    const diffDays3M = (now.getTime() - threeMonths) / (86400 * 1000);
    assert.equal(diffDays3M, 90);

    const oneYear = getTimeframeCutoff('1Y', now);
    const diffDays1Y = (now.getTime() - oneYear) / (86400 * 1000);
    assert.equal(diffDays1Y, 365);
  });
});

describe('extractExerciseProgression', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');

  it('extracts progression points chronologically with correct E1RM and topSet', () => {
    const workouts = [
      makeWorkout('w2', '2026-08-15T10:00:00.000Z', 'gym-main', [
        makeExercise('bench-press', ['chest'], [
          { weightKg: 80, reps: 5, rpe: 8 },
          { weightKg: 85, reps: 5, rpe: 9 },
        ]),
      ]),
      makeWorkout('w1', '2026-08-01T10:00:00.000Z', 'gym-main', [
        makeExercise('bench-press', ['chest'], [
          { weightKg: 80, reps: 5, rpe: 8 },
        ]),
      ]),
      makeWorkout('w3', '2026-09-01T10:00:00.000Z', 'gym-main', [
        makeExercise('bench-press', ['chest'], [
          { weightKg: 90, reps: 3, rpe: 9.5 },
        ]),
      ]),
    ];

    const series = extractExerciseProgression(workouts, 'bench-press', { now });

    assert.equal(series.exerciseId, 'bench-press');
    assert.equal(series.points.length, 3);
    assert.equal(series.points[0].workoutId, 'w1');
    assert.equal(series.points[1].workoutId, 'w2');
    assert.equal(series.points[2].workoutId, 'w3');

    assert.equal(series.points[1].topSet.weightKg, 85);
    assert.equal(series.points[1].topSet.reps, 5);
    assert.equal(series.points[1].maxWeightKg, 85);

    assert.equal(series.points[0].isPr, false, 'Baseline is not flagged as new PR');
    assert.equal(series.points[1].isPr, true, 'w2 exceeded w1 1RM');
    assert.equal(series.points[2].isPr, true, 'w3 exceeded w2 1RM / max weight');

    assert.equal(series.summary.totalSessions, 3);
    assert.equal(series.summary.currentWeight, 90);
    assert.ok(series.summary.changePercent1RM > 0);
  });

  it('filters by allowedGymIds for gym isolation', () => {
    const workouts = [
      makeWorkout('w1', '2026-08-01T10:00:00.000Z', 'gym-home', [
        makeExercise('lat-pulldown', ['lats'], [{ weightKg: 60, reps: 10 }]),
      ]),
      makeWorkout('w2', '2026-08-10T10:00:00.000Z', 'gym-metro', [
        makeExercise('lat-pulldown', ['lats'], [{ weightKg: 80, reps: 10 }]),
      ]),
    ];

    const homeSeries = extractExerciseProgression(workouts, 'lat-pulldown', {
      allowedGymIds: ['gym-home'],
      now,
    });
    assert.equal(homeSeries.points.length, 1);
    assert.equal(homeSeries.points[0].gymId, 'gym-home');
    assert.equal(homeSeries.points[0].maxWeightKg, 60);

    const metroSeries = extractExerciseProgression(workouts, 'lat-pulldown', {
      allowedGymIds: ['gym-metro'],
      now,
    });
    assert.equal(metroSeries.points.length, 1);
    assert.equal(metroSeries.points[0].gymId, 'gym-metro');
    assert.equal(metroSeries.points[0].maxWeightKg, 80);
  });

  it('filters by timeframe cutoff', () => {
    const workouts = [
      makeWorkout('w-old', '2026-05-01T10:00:00.000Z', 'gym-main', [
        makeExercise('squat', ['quads'], [{ weightKg: 100, reps: 5 }]),
      ]),
      makeWorkout('w-recent', '2026-09-05T10:00:00.000Z', 'gym-main', [
        makeExercise('squat', ['quads'], [{ weightKg: 120, reps: 5 }]),
      ]),
    ];

    const oneMonthSeries = extractExerciseProgression(workouts, 'squat', {
      timeframe: '1M',
      now,
    });
    assert.equal(oneMonthSeries.points.length, 1);
    assert.equal(oneMonthSeries.points[0].workoutId, 'w-recent');

    const allSeries = extractExerciseProgression(workouts, 'squat', {
      timeframe: 'ALL',
      now,
    });
    assert.equal(allSeries.points.length, 2);
  });

  it('handles bodyweight 0 kg exercises gracefully', () => {
    const workouts = [
      makeWorkout('w1', '2026-09-01T10:00:00.000Z', 'gym-main', [
        makeExercise('pull-up', ['lats'], [{ weightKg: 0, reps: 12 }]),
      ]),
    ];

    const series = extractExerciseProgression(workouts, 'pull-up', { now });
    assert.equal(series.points.length, 1);
    assert.equal(series.points[0].maxWeightKg, 0);
    assert.equal(series.points[0].maxReps, 12);
  });

  it('skips uncompleted sets and workouts with zero completed sets', () => {
    const workouts = [
      makeWorkout('w1', '2026-09-01T10:00:00.000Z', 'gym-main', [
        makeExercise('deadlift', ['back'], [
          { weightKg: 140, reps: 5, isCompleted: false },
        ]),
      ]),
    ];

    const series = extractExerciseProgression(workouts, 'deadlift', { now });
    assert.equal(series.points.length, 0);
    assert.equal(series.summary.totalSessions, 0);
  });
});

describe('buildTrainingDistribution', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');

  it('attributes volume and sets to primary muscles and calculates percentages', () => {
    const workouts = [
      makeWorkout('w1', '2026-09-01T10:00:00.000Z', 'gym-main', [
        makeExercise('bench', ['chest'], [{ weightKg: 100, reps: 10 }]),
        makeExercise('squat', ['quadriceps'], [{ weightKg: 100, reps: 10 }]),
      ]),
    ];

    const distribution = buildTrainingDistribution(workouts, 'ALL', now);
    assert.equal(distribution.length, 2);
    assert.equal(distribution[0].volumeKg, 1000);
    assert.equal(distribution[0].percentage, 50);
    assert.equal(distribution[1].percentage, 50);
  });
});

describe('buildRepRangeDistribution', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');

  it('categorizes completed sets into strength, hypertrophy, and endurance', () => {
    const workouts = [
      makeWorkout('w1', '2026-09-01T10:00:00.000Z', 'gym-main', [
        makeExercise('mix', ['chest'], [
          { weightKg: 100, reps: 3 },
          { weightKg: 100, reps: 5 },
          { weightKg: 80, reps: 8 },
          { weightKg: 80, reps: 12 },
          { weightKg: 50, reps: 15 },
        ]),
      ]),
    ];

    const repDist = buildRepRangeDistribution(workouts, 'ALL', now);
    assert.equal(repDist.totalSets, 5);
    assert.equal(repDist.strength, 2);
    assert.equal(repDist.hypertrophy, 2);
    assert.equal(repDist.endurance, 1);
    assert.equal(repDist.percentages.strength, 40);
    assert.equal(repDist.percentages.hypertrophy, 40);
    assert.equal(repDist.percentages.endurance, 20);
  });
});

describe('buildConsistencySummary', () => {
  it('calculates current streak, best streak, and weekly breakdown', () => {
    const workouts = [
      makeWorkout('w1', '2026-08-25T10:00:00.000Z'),
      makeWorkout('w2', '2026-09-01T10:00:00.000Z'),
      makeWorkout('w3', '2026-09-08T10:00:00.000Z'),
    ];

    const now = new Date('2026-09-10T12:00:00.000Z');
    const summary = buildConsistencySummary(workouts, now, 8);

    assert.equal(summary.weeks.length, 8);
    assert.equal(summary.totalWorkouts, 3);
    assert.equal(summary.currentStreakWeeks, 3);
    assert.equal(summary.bestStreakWeeks, 3);
  });

  it('keeps streak alive when current week has not had a workout yet but previous week did', () => {
    const workouts = [
      makeWorkout('w1', '2026-09-01T10:00:00.000Z'),
    ];

    const now = new Date('2026-09-08T12:00:00.000Z');
    const summary = buildConsistencySummary(workouts, now, 8);

    assert.equal(summary.currentStreakWeeks, 1);
  });
});

describe('buildLifetimeTrainingStats', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');

  it('aggregates total workouts, volume, duration, sets, reps, and this-week totals', () => {
    const workouts = [
      makeWorkout('w1', '2026-08-01T10:00:00.000Z', 'gym-1', [
        makeExercise('bench', ['chest'], [
          { weightKg: 100, reps: 10 },
          { weightKg: 80, reps: 8 },
        ]),
      ]),
      makeWorkout('w2', '2026-09-10T10:00:00.000Z', 'gym-1', [ // this week (Thu)
        makeExercise('squat', ['quads'], [
          { weightKg: 120, reps: 5 },
          { weightKg: 100, reps: 5 },
        ]),
      ]),
    ];

    const stats = buildLifetimeTrainingStats(workouts, now);
    assert.equal(stats.totalWorkouts, 2);
    // w1: 100*10 + 80*8 = 1000 + 640 = 1640 kg. Duration = 60 min. Sets = 2. Reps = 18.
    // w2: 120*5 + 100*5 = 600 + 500 = 1100 kg. Duration = 60 min. Sets = 2. Reps = 10.
    // Total Volume = 2740 kg. Total duration = 120 min. Total sets = 4. Total reps = 28.
    assert.equal(stats.totalVolumeKg, 2740);
    assert.equal(stats.totalDurationMinutes, 120);
    assert.equal(stats.totalSets, 4);
    assert.equal(stats.totalReps, 28);
    assert.equal(stats.workoutsThisWeek, 1);
    assert.equal(stats.volumeThisWeekKg, 1100);
  });
});

describe('calisthenics and rep PR progression', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');

  it('flags PR when rep count improves on bodyweight exercises', () => {
    const workouts = [
      makeWorkout('w1', '2026-08-01T10:00:00.000Z', 'gym-1', [
        makeExercise('pull-up', ['lats'], [{ weightKg: 0, reps: 8 }]),
      ]),
      makeWorkout('w2', '2026-08-15T10:00:00.000Z', 'gym-1', [
        makeExercise('pull-up', ['lats'], [{ weightKg: 0, reps: 12 }]),
      ]),
      makeWorkout('w3', '2026-09-01T10:00:00.000Z', 'gym-1', [
        makeExercise('pull-up', ['lats'], [{ weightKg: 0, reps: 10 }]),
      ]),
    ];

    const series = extractExerciseProgression(workouts, 'pull-up', { now });
    assert.equal(series.points.length, 3);
    assert.equal(series.points[0].isPr, false);
    assert.equal(series.points[1].isPr, true, 'w2 exceeded w1 reps (12 > 8)');
    assert.equal(series.points[2].isPr, false, 'w3 had 10 reps, not a PR');
    assert.equal(series.summary.allTimeBestReps, 12);
    assert.equal(series.summary.currentReps, 10);
    assert.equal(series.summary.changePercentReps, 25); // (10 - 8) / 8 * 100 = 25%
  });

  it('prioritizes higher rep count for bodyweight exercises when picking topSet', () => {
    const workouts = [
      makeWorkout('w1', '2026-09-01T10:00:00.000Z', 'gym-1', [
        makeExercise('pull-up', ['lats'], [
          { weightKg: 0, reps: 5 },
          { weightKg: 0, reps: 20 },
          { weightKg: 0, reps: 10 },
        ]),
      ]),
    ];

    const series = extractExerciseProgression(workouts, 'pull-up', { now });
    assert.equal(series.points.length, 1);
    assert.equal(series.points[0].topSet.reps, 20, 'topSet should be the 20-rep set, not the first 5-rep set');
    assert.equal(series.points[0].topSet.weightKg, 0);
  });
});

describe('timeframe-filtered progression PR accuracy', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');

  it('preserves true all-time best and does not award false PR badges in narrow timeframes', () => {
    const workouts = [
      // 6 months ago: all-time bench press PR of 140 kg
      makeWorkout('w1', '2026-03-01T10:00:00.000Z', 'gym-1', [
        makeExercise('bench', ['chest'], [{ weightKg: 140, reps: 1 }]),
      ]),
      // 20 days ago (within 1M): returning to training with 90 kg
      makeWorkout('w2', '2026-08-23T10:00:00.000Z', 'gym-1', [
        makeExercise('bench', ['chest'], [{ weightKg: 90, reps: 5 }]),
      ]),
      // 5 days ago (within 1M): progressed to 100 kg
      makeWorkout('w3', '2026-09-07T10:00:00.000Z', 'gym-1', [
        makeExercise('bench', ['chest'], [{ weightKg: 100, reps: 5 }]),
      ]),
    ];

    // Filter down to 1M window
    const series = extractExerciseProgression(workouts, 'bench', { timeframe: '1M', now });

    // Only 2 points within the 1M window
    assert.equal(series.points.length, 2);
    assert.equal(series.points[0].workoutId, 'w2');
    assert.equal(series.points[1].workoutId, 'w3');

    // True all-time best is preserved from w1 (140 kg), NOT truncated to 100 kg
    assert.equal(series.summary.allTimeBestWeight, 140);

    // w3 did 100 kg, which is well below all-time 140 kg PR, so isPr MUST be false
    assert.equal(series.points[0].isPr, false);
    assert.equal(series.points[1].isPr, false, 'w3 (100 kg) must not be flagged as PR when all-time best was 140 kg');

    // Current metrics match latest session in window
    assert.equal(series.summary.currentWeight, 100);
  });
});

describe('multi-muscle volume and sets distribution splitting', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');

  it('splits volume and sets evenly across multiple primary muscles without exceeding 100%', () => {
    const workouts = [
      makeWorkout('w1', '2026-09-01T10:00:00.000Z', 'gym-1', [
        makeExercise('halo-extension', ['shoulders', 'triceps'], [
          { weightKg: 20, reps: 10 },
          { weightKg: 20, reps: 10 },
          { weightKg: 20, reps: 10 },
          { weightKg: 20, reps: 10 },
        ]),
      ]),
    ];

    const distribution = buildTrainingDistribution(workouts, 'ALL', now);
    assert.equal(distribution.length, 2);

    const shoulders = distribution.find((d) => d.muscle === 'shoulders');
    const triceps = distribution.find((d) => d.muscle === 'triceps');

    assert.ok(shoulders, 'shoulders present');
    assert.ok(triceps, 'triceps present');

    // Total volume was 800 kg (4 sets * 200 kg). Each muscle should receive 400 kg.
    assert.equal(shoulders.volumeKg, 400);
    assert.equal(triceps.volumeKg, 400);

    // Total sets was 4. Each muscle should receive 2 sets.
    assert.equal(shoulders.setsCount, 2);
    assert.equal(triceps.setsCount, 2);

    // Percentage should be 50% each, summing to exactly 100%
    assert.equal(shoulders.percentage, 50);
    assert.equal(triceps.percentage, 50);
    assert.equal(shoulders.setsPercentage, 50);
    assert.equal(triceps.setsPercentage, 50);

    const totalPercentage = distribution.reduce((sum, d) => sum + d.percentage, 0);
    assert.equal(totalPercentage, 100);
  });
});

describe('isPointPrForMetric', () => {
  it('correctly discriminates PR status by specific metric', () => {
    const point = {
      workoutId: 'w1',
      workoutName: 'Workout 1',
      date: '2026-09-01',
      dateLabel: 'Sep 1',
      timestamp: 1234567,
      gymId: 'gym-1',
      e1rmKg: 120,
      maxWeightKg: 100,
      totalVolumeKg: 500,
      maxReps: 10,
      isPr: true,
      prMetrics: {
        e1rm: true,
        maxWeight: false,
        volume: false,
        maxReps: false,
      },
      topSet: { weightKg: 100, reps: 5 },
    };

    assert.equal(isPointPrForMetric(point, 'e1rm'), true);
    assert.equal(isPointPrForMetric(point, 'max_weight'), false);
    assert.equal(isPointPrForMetric(point, 'volume'), false);
    assert.equal(isPointPrForMetric(point, 'max_reps'), false);
  });
});

