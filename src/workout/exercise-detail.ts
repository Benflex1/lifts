import type { Store } from '../database/contract';
import { DualExerciseStats, Exercise, ExerciseGymScope, Gym, Workout } from '../types';
import { collectExerciseHistory } from './exercise-history';
import { summarizeDualStatsForEntries } from './gym-records';
import { getAllowedGymIds } from './gym-scope';
import { buildExercisePodium, ExercisePodium } from './pr';

export interface ExerciseDetailData {
  stats: DualExerciseStats;
  scope: ExerciseGymScope | null;
  historyWorkouts: Workout[];
  podium: ExercisePodium;
  gyms: Gym[];
  resolvedGym: Gym;
  gymNamesMap: Map<string, string>;
}

export type ExerciseDetailStore = Pick<
  Store,
  'getGyms' | 'getDefaultGym' | 'getExerciseGymScope' | 'getCompletedWorkoutsForExercise'
>;

/**
 * Loads everything the exercise detail modal shows in a single history read:
 * the workout history is fetched once and one collection pass feeds both the
 * statistics and the podium.
 */
export async function loadExerciseDetailData(
  store: ExerciseDetailStore,
  exercise: Exercise,
  initialGym?: Gym | null
): Promise<ExerciseDetailData> {
  const [allGyms, defaultGym] = await Promise.all([store.getGyms(), store.getDefaultGym()]);
  const resolvedGym =
    initialGym || allGyms.find((g) => g.id === defaultGym.id) || allGyms[0] || defaultGym;

  const [scope, historyWorkouts] = await Promise.all([
    store.getExerciseGymScope(exercise.id),
    store.getCompletedWorkoutsForExercise(exercise.id),
  ]);

  const entries = collectExerciseHistory(historyWorkouts, exercise.id);

  // Stats use the definition stored in history (matching the previous stats
  // call); the podium uses the catalog definition for scope resolution.
  const historyExercise = historyWorkouts
    .flatMap((workout) => workout.exercises)
    .find((occurrence) => occurrence.exerciseId === exercise.id)?.exercise;
  const stats = summarizeDualStatsForEntries(entries, historyExercise, resolvedGym.id, scope || undefined);
  const podium = buildExercisePodium(
    entries,
    allGyms,
    getAllowedGymIds(exercise, scope || undefined, resolvedGym.id)
  );

  return {
    stats,
    scope,
    historyWorkouts,
    podium,
    gyms: allGyms,
    resolvedGym,
    gymNamesMap: new Map(allGyms.map((g) => [g.id, g.name])),
  };
}
