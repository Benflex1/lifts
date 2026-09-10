import { Gym, PreviousSetSuggestion, Workout } from '../types';

export interface StartWorkoutOptions {
  gymId?: string;
}

export function resolveStartGymId(
  defaultGym: Gym,
  options?: StartWorkoutOptions,
): string {
  return options?.gymId || defaultGym.id;
}

export function rehydrateUntouchedSuggestions(
  workout: Workout,
  suggestionsByExercise: Record<string, PreviousSetSuggestion[]>,
): Workout {
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => {
      const suggestions = suggestionsByExercise[exercise.id]
        || suggestionsByExercise[exercise.exerciseId]
        || [];
      return {
        ...exercise,
        sets: exercise.sets.map((set, index) => {
          if (set.isCompleted || set.isWeightEdited) return set;

          const suggestion = suggestions[index];
          return {
            ...set,
            previousWeightKg: suggestion?.weightKg,
            previousReps: suggestion?.reps,
            previousGymId: suggestion?.sourceGymId,
            previousGymName: suggestion?.sourceGymName,
          };
        }),
      };
    }),
  };
}
