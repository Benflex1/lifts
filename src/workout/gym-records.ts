import { DualExerciseStats, ExerciseGymScope, ExerciseStats, Workout } from '../types';
import { calculate1RM } from '../utils/calculator';
import { getAllowedGymIds } from './gym-scope';

function emptyStats(): ExerciseStats {
  return {
    maxWeightKg: 0,
    maxSetVolumeKg: 0,
    maxReps: 0,
    estimated1RM: 0,
    sessionCount: 0,
  };
}

function addWorkoutStats(stats: ExerciseStats, workouts: Workout[], exerciseId: string, gymFilter: Set<string> | null): void {
  for (const workout of workouts) {
    if (gymFilter !== null && !gymFilter.has(workout.gymId)) continue;

    let hasCompletedSet = false;
    for (const occurrence of workout.exercises) {
      if (occurrence.exerciseId !== exerciseId) continue;
      for (const set of occurrence.sets) {
        if (!set.isCompleted) continue;
        hasCompletedSet = true;
        stats.maxWeightKg = Math.max(stats.maxWeightKg, set.weightKg);
        stats.maxSetVolumeKg = Math.max(stats.maxSetVolumeKg, set.weightKg * set.reps);
        stats.maxReps = Math.max(stats.maxReps, set.reps);
        stats.estimated1RM = Math.max(stats.estimated1RM, calculate1RM(set.weightKg, set.reps).average);
      }
    }
    if (hasCompletedSet) stats.sessionCount += 1;
  }
}

export function calculateDualExerciseStats(
  workouts: Workout[],
  exerciseId: string,
  currentGymId: string,
  scope?: ExerciseGymScope
): DualExerciseStats {
  const global = emptyStats();
  const gym = emptyStats();
  addWorkoutStats(global, workouts, exerciseId, null);

  const exercise = workouts
    .flatMap((workout) => workout.exercises)
    .find((occurrence) => occurrence.exerciseId === exerciseId)?.exercise;
  if (exercise) {
    addWorkoutStats(gym, workouts, exerciseId, getAllowedGymIds(exercise, scope, currentGymId));
  }

  return { global, gym };
}
