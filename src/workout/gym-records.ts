import { DualExerciseStats, Exercise, ExerciseGymScope, ExerciseStats, Workout } from '../types';
import { calculate1RM } from '../utils/calculator';
import { ExerciseHistoryEntry, collectExerciseHistory } from './exercise-history';
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

/** Reduces one already-collected history pass into stat maxima. */
export function summarizeStatsForEntries(
  entries: ExerciseHistoryEntry[],
  gymFilter: Set<string> | null
): ExerciseStats {
  const stats = emptyStats();

  for (const entry of entries) {
    if (gymFilter !== null && !gymFilter.has(entry.gymId)) continue;

    for (const set of entry.sets) {
      stats.maxWeightKg = Math.max(stats.maxWeightKg, set.weightKg);
      stats.maxSetVolumeKg = Math.max(stats.maxSetVolumeKg, set.weightKg * set.reps);
      stats.maxReps = Math.max(stats.maxReps, set.reps);
      stats.estimated1RM = Math.max(stats.estimated1RM, calculate1RM(set.weightKg, set.reps).average);
    }
    stats.sessionCount += 1;
  }

  return stats;
}

export function calculateDualExerciseStats(
  workouts: Workout[],
  exerciseId: string,
  currentGymId: string,
  scope?: ExerciseGymScope
): DualExerciseStats {
  const entries = collectExerciseHistory(workouts, exerciseId);

  const exercise = workouts
    .flatMap((workout) => workout.exercises)
    .find((occurrence) => occurrence.exerciseId === exerciseId)?.exercise;

  return summarizeDualStatsForEntries(entries, exercise, currentGymId, scope);
}

/**
 * Derives global and gym-scoped stats from an already-collected history pass.
 * `exercise` is the definition found in the history; when absent, gym-scoped
 * stats stay empty because no scope can be resolved.
 */
export function summarizeDualStatsForEntries(
  entries: ExerciseHistoryEntry[],
  exercise: Exercise | undefined,
  currentGymId: string,
  scope?: ExerciseGymScope
): DualExerciseStats {
  const global = summarizeStatsForEntries(entries, null);
  const gym = exercise
    ? summarizeStatsForEntries(entries, getAllowedGymIds(exercise, scope, currentGymId))
    : emptyStats();

  return { global, gym };
}
