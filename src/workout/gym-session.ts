import { Gym, PreviousSetSuggestion, Workout, WorkoutSet } from '../types';
import type { Store } from '../database/contract';

export interface StartWorkoutOptions {
  gymId?: string;
}

export interface GymSessionControllerState {
  phase: string;
  revision: number;
  workout: Workout | null;
  restTimer: { endsAt: number; totalSeconds: number } | null;
}

export interface GymSessionController {
  getState(): GymSessionControllerState;
  update(workout: Workout, restTimer?: { endsAt: number; totalSeconds: number } | null): void;
  flush(): Promise<void>;
}

type SuggestionStore = Pick<Store, 'getPreviousSetsForExercise'>;
type GymSuggestionStore = SuggestionStore & Pick<Store, 'getGyms'>;

export interface WorkoutVersion {
  workoutId: string;
  revision: number;
  gymId: string;
  exerciseIds: string[];
  exerciseDefinitionIds: string[];
}

export interface GymSwitchResult {
  gyms: Gym[];
  gym: Gym;
  applied: boolean;
  cancelled: boolean;
}

export function resolveStartGymId(
  defaultGym: Gym,
  options?: StartWorkoutOptions,
): string {
  return options?.gymId || defaultGym.id;
}

export async function loadSuggestionsForWorkout(
  store: SuggestionStore,
  workout: Workout,
  currentGymId: string,
): Promise<Record<string, PreviousSetSuggestion[]>> {
  const occurrenceCounts = new Map<string, number>();
  const suggestions = await Promise.all(
    workout.exercises.map(async (exercise) => {
      const occurrenceIndex = occurrenceCounts.get(exercise.exerciseId) || 0;
      occurrenceCounts.set(exercise.exerciseId, occurrenceIndex + 1);
      return [
        exercise.id,
        await loadSuggestionsForExercise(store, exercise.exerciseId, occurrenceIndex, currentGymId),
      ] as const;
    }),
  );
  return Object.fromEntries(suggestions);
}

export function loadSuggestionsForExercise(
  store: SuggestionStore,
  exerciseId: string,
  occurrenceIndex: number,
  currentGymId: string,
): Promise<PreviousSetSuggestion[]> {
  return store.getPreviousSetsForExercise(exerciseId, occurrenceIndex, currentGymId);
}

export function captureWorkoutVersion(state: GymSessionControllerState): WorkoutVersion | null {
  if (state.phase !== 'active' || !state.workout) return null;
  return {
    workoutId: state.workout.id,
    revision: state.revision,
    gymId: state.workout.gymId,
    exerciseIds: state.workout.exercises.map((exercise) => exercise.id),
    exerciseDefinitionIds: state.workout.exercises.map((exercise) => exercise.exerciseId),
  };
}

export function isCurrentWorkoutVersion(
  state: GymSessionControllerState,
  expected: WorkoutVersion,
): boolean {
  if (state.phase !== 'active' || !state.workout) return false;
  return state.revision === expected.revision
    && state.workout.id === expected.workoutId
    && state.workout.gymId === expected.gymId
    && state.workout.exercises.length === expected.exerciseIds.length
    && state.workout.exercises.every((exercise, index) => (
      exercise.id === expected.exerciseIds[index]
      && exercise.exerciseId === expected.exerciseDefinitionIds[index]
    ));
}

export function resolveRepeatSourceGym(
  workout: Pick<Workout, 'gymId'>,
  gyms: Gym[],
): Gym | undefined {
  return gyms.find((gym) => gym.id === workout.gymId);
}

export function clearSameGymProvenance<T extends Pick<WorkoutSet, 'previousGymId' | 'previousGymName'>>(
  set: T,
  targetGymId: string,
): T {
  if (set.previousGymId !== targetGymId) return set;
  return {
    ...set,
    previousGymId: undefined,
    previousGymName: undefined,
  };
}

export function copyPreviousSetProvenance(
  set?: Pick<WorkoutSet, 'previousGymId' | 'previousGymName'>,
): Pick<WorkoutSet, 'previousGymId' | 'previousGymName'> {
  return {
    previousGymId: set?.previousGymId,
    previousGymName: set?.previousGymName,
  };
}

export function appendExercisesToCurrentWorkout(
  controller: GymSessionController,
  expected: WorkoutVersion,
  exercises: Workout['exercises'],
): boolean {
  const latestState = controller.getState();
  if (!isCurrentWorkoutVersion(latestState, expected)) return false;

  controller.update(
    {
      ...latestState.workout!,
      exercises: [...latestState.workout!.exercises, ...exercises],
    },
    latestState.restTimer,
  );
  return true;
}

export async function switchWorkoutGym(
  controller: GymSessionController,
  store: GymSuggestionStore,
  gymId: string,
  isRequestCurrent: () => boolean = () => true,
): Promise<GymSwitchResult> {
  const gyms = await store.getGyms();
  const gym = gyms.find((candidate) => candidate.id === gymId);
  if (!gym) {
    throw new Error(`Cannot switch workout gym: unknown gym ${gymId}`);
  }
  if (!isRequestCurrent()) {
    return { gyms, gym, applied: false, cancelled: true };
  }

  const initialState = controller.getState();
  const expectedVersion = captureWorkoutVersion(initialState);
  if (!expectedVersion) {
    return { gyms, gym, applied: false, cancelled: false };
  }

  const suggestionsByExercise = await loadSuggestionsForWorkout(
    store,
    initialState.workout!,
    gymId,
  );
  if (!isRequestCurrent() || !isCurrentWorkoutVersion(controller.getState(), expectedVersion)) {
    return { gyms, gym, applied: false, cancelled: true };
  }

  const latestState = controller.getState();
  const updatedWorkout = rehydrateUntouchedSuggestions(
    { ...latestState.workout!, gymId },
    suggestionsByExercise,
  );
  controller.update(updatedWorkout, latestState.restTimer);
  await controller.flush();
  if (!isRequestCurrent()) {
    return { gyms, gym, applied: true, cancelled: true };
  }
  return { gyms, gym, applied: true, cancelled: false };
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
            ...clearSameGymProvenance(
              {
                previousGymId: suggestion?.sourceGymId,
                previousGymName: suggestion?.sourceGymName,
              },
              workout.gymId,
            ),
          };
        }),
      };
    }),
  };
}
