import { Workout } from '../types';

export interface ExerciseHistorySet {
  weightKg: number;
  reps: number;
  isWarmup: boolean;
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
 * walks the history more than once.
 */
export function collectExerciseHistory(
  workouts: Workout[],
  exerciseId: string
): ExerciseHistoryEntry[] {
  const entries: ExerciseHistoryEntry[] = [];

  for (const workout of workouts) {
    let sets: ExerciseHistorySet[] | null = null;

    for (const occurrence of workout.exercises) {
      if (occurrence.exerciseId !== exerciseId) continue;
      for (const set of occurrence.sets) {
        if (!set.isCompleted) continue;
        if (sets === null) sets = [];
        sets.push({
          weightKg: set.weightKg,
          reps: set.reps,
          isWarmup: set.type === 'warmup',
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
