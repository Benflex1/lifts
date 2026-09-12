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

export function resolveInitialStartGymId(gyms: readonly Gym[]): string | undefined {
  return gyms.find((gym) => gym.isDefault)?.id || gyms[0]?.id;
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

export function resolveInitialAccordionState(
  exercises: Array<{ id: string; sets: Array<{ isCompleted: boolean }> }>,
): Record<string, boolean> {
  const initial: Record<string, boolean> = {};
  let firstIncompleteFound = false;
  exercises.forEach((ex, idx) => {
    const isComplete = ex.sets.length > 0 && ex.sets.every((s) => s.isCompleted);
    if (!firstIncompleteFound && !isComplete) {
      initial[ex.id] = true;
      firstIncompleteFound = true;
    } else if (!firstIncompleteFound && idx === 0 && !isComplete) {
      initial[ex.id] = true;
    } else {
      initial[ex.id] = false;
    }
  });
  return initial;
}

export function applyPreviousSetStats<T extends {
  weightKg: number;
  reps: number;
  isWeightEdited?: boolean;
  isCompleted: boolean;
  previousWeightKg?: number;
  previousReps?: number;
}>(set: T, fallbackReps: number = 10): T {
  if (set.isCompleted) return set;
  if (set.previousWeightKg === undefined && set.previousReps === undefined) return set;
  return {
    ...set,
    weightKg: set.previousWeightKg !== undefined ? set.previousWeightKg : set.weightKg,
    reps: set.previousReps !== undefined ? set.previousReps : fallbackReps,
    isWeightEdited: true,
  };
}

export interface AddedSetGhostStats {
  previousWeightKg?: number;
  previousReps?: number;
  provenanceSet?: Pick<WorkoutSet, 'previousGymId' | 'previousGymName'>;
}

export function resolveAddedSetGhostStats(
  existingSets: WorkoutSet[],
): AddedSetGhostStats {
  // 1. Look for the most recent completed or edited set in reverse
  const lastCompletedOrEditedSet = [...existingSets].reverse().find(
    (s) => s.isCompleted || s.isWeightEdited || s.weightKg > 0 || s.reps > 0,
  );

  if (lastCompletedOrEditedSet) {
    const isEdited = lastCompletedOrEditedSet.isWeightEdited ?? (lastCompletedOrEditedSet.weightKg > 0 || lastCompletedOrEditedSet.isCompleted);
    const ghostWeight = isEdited ? lastCompletedOrEditedSet.weightKg : lastCompletedOrEditedSet.previousWeightKg;
    const ghostReps = lastCompletedOrEditedSet.reps > 0 ? lastCompletedOrEditedSet.reps : lastCompletedOrEditedSet.previousReps;
    return {
      previousWeightKg: ghostWeight,
      previousReps: ghostReps,
      provenanceSet: lastCompletedOrEditedSet.isCompleted ? undefined : lastCompletedOrEditedSet,
    };
  }

  // 2. Look for the most recent set with ghost suggestions if no set has been done/edited yet
  const lastGhostSet = [...existingSets].reverse().find(
    (s) => s.previousWeightKg !== undefined || s.previousReps !== undefined,
  );

  if (lastGhostSet) {
    return {
      previousWeightKg: lastGhostSet.previousWeightKg,
      previousReps: lastGhostSet.previousReps,
      provenanceSet: lastGhostSet,
    };
  }

  const lastSet = existingSets[existingSets.length - 1];
  return {
    previousWeightKg: lastSet?.previousWeightKg,
    previousReps: lastSet?.previousReps,
    provenanceSet: lastSet,
  };
}

export interface CreateWorkoutSetsOptions {
  activeExerciseId: string;
  targetSets: number;
  targetReps?: string;
  suggestions: PreviousSetSuggestion[];
  currentGymId?: string;
  idGenerator?: (setNumber: number) => string;
}

export function createWorkoutSetsFromSuggestions(options: CreateWorkoutSetsOptions): WorkoutSet[] {
  const { activeExerciseId, targetSets, targetReps, suggestions, currentGymId, idGenerator } = options;
  const count = Math.max(targetSets, suggestions.length);
  const sets: WorkoutSet[] = [];

  for (let i = 1; i <= count; i++) {
    const ghost = suggestions[i - 1] ?? (suggestions.length > 0 ? suggestions[suggestions.length - 1] : undefined);
    const isSameGym = Boolean(currentGymId && ghost?.sourceGymId === currentGymId);
    const setId = idGenerator
      ? idGenerator(i)
      : `set-${activeExerciseId}-${i}`;

    sets.push({
      id: setId,
      setNumber: i,
      type: 'normal',
      weightKg: 0,
      reps: 0,
      targetReps,
      rpe: undefined,
      isCompleted: false,
      isWeightEdited: false,
      previousWeightKg: ghost ? ghost.weightKg : undefined,
      previousReps: ghost ? ghost.reps : undefined,
      previousGymId: isSameGym ? undefined : ghost?.sourceGymId,
      previousGymName: isSameGym ? undefined : ghost?.sourceGymName,
    });
  }

  return sets;
}

