import { SetType, Workout, type TrackingType } from '../types';
import { calculate1RM } from '../utils/calculator';
import { getTrackingType, setRecordValues, type SetRecordValues } from './tracking';
export interface ExerciseHistorySet {
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  type: SetType;
  /** Effective tracking type (defaults to weight × reps). */
  trackingType: TrackingType;
  /** Only set when the workout occurrence stores an explicit non-default type. */
  explicitTrackingType?: TrackingType;
  durationSeconds?: number;
  distanceM?: number;
  /** Precomputed record values for the tracking type; shared by stats and podiums. */
  values: SetRecordValues;
}

export interface ExerciseHistoryEntry {
  workoutId: string;
  workoutName: string;
  gymId: string;
  startedAt: string;
  sets: ExerciseHistorySet[];
}

/**
 * One pass over `workouts` collecting every completed set of `exerciseId`,
 * grouped by workout. Statistics, podium extraction, and the exercise detail
 * screen all derive from this single traversal so opening a detail view never
 * walks the history more than once. Sets keep their tracking type and record
 * values so time/distance/bodyweight handling stays identical to the
 * workout-level aggregation.
 */
export function collectExerciseHistory(
  workouts: Workout[],
  exerciseId: string,
): ExerciseHistoryEntry[] {
  const entries: ExerciseHistoryEntry[] = [];

  for (const workout of workouts) {
    let sets: ExerciseHistorySet[] | null = null;

    for (const occurrence of workout.exercises) {
      if (occurrence.exerciseId !== exerciseId) continue;
      const trackingType = getTrackingType(occurrence);
      for (const set of occurrence.sets) {
        if (!set.isCompleted) continue;
        if (sets === null) sets = [];
        sets.push({
          weightKg: set.weightKg,
          reps: set.reps,
          isWarmup: set.type === 'warmup',
          type: set.type,
          trackingType,
          ...(occurrence.trackingType ? { explicitTrackingType: occurrence.trackingType } : {}),
          ...(set.durationSeconds !== undefined ? { durationSeconds: set.durationSeconds } : {}),
          ...(set.distanceM !== undefined ? { distanceM: set.distanceM } : {}),
          values: setRecordValues(
            set,
            trackingType,
            (weightKg, reps) => calculate1RM(weightKg, reps).average,
          ),
        });
      }
    }

    if (sets === null) continue;
    entries.push({
      workoutId: workout.id,
      workoutName: workout.name,
      gymId: workout.gymId,
      startedAt: workout.startTime,
      sets,
    });
  }

  return entries;
}
