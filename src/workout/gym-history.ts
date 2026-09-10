import { Exercise, ExerciseGymScope, PreviousSetSuggestion } from '../types';
import { getAllowedGymIds } from './gym-scope';

export interface CompletedExerciseOccurrence {
  workoutId: string;
  startTime: string;
  gymId: string;
  gymName: string;
  occurrenceIndex: number;
  sets: Array<{ weightKg: number; reps: number }>;
}

export function resolvePreviousSetsForExercise(
  exercise: Exercise,
  occurrences: CompletedExerciseOccurrence[],
  currentGymId: string,
  scope?: ExerciseGymScope
): PreviousSetSuggestion[] {
  const allowedGymIds = getAllowedGymIds(exercise, scope, currentGymId);
  const selected = occurrences.find((occurrence) =>
    occurrence.sets.length > 0 && (allowedGymIds === null || allowedGymIds.has(occurrence.gymId))
  );
  const fallback = selected ?? (allowedGymIds === null
    ? undefined
    : occurrences.find((occurrence) => occurrence.sets.length > 0));
  if (!fallback || fallback.sets.length === 0) return [];

  const isForeignFallback = selected === undefined && allowedGymIds !== null;
  return fallback.sets.map(({ weightKg, reps }) => ({
    weightKg,
    reps,
    ...(isForeignFallback ? { sourceGymId: fallback.gymId, sourceGymName: fallback.gymName } : {}),
  }));
}
