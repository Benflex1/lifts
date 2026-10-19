/**
 * Storage-agnostic store domain core (ARCH-04).
 *
 * Both persistence adapters — the SQLite `nativeStore` and the IndexedDB
 * `webStore` — delegate normalization, snapshot-merge planning, and gym
 * deletion policy here so a rule is implemented and tested once. Adapters
 * stay responsible only for reading and writing their own storage.
 */
import { Exercise, ExerciseGymScope, Gym, Routine, Workout } from '../types';
import { isDeviceLocalSetting, isMergedOnRestore } from '../utils/settings';
import {
  DEFAULT_GYM_ID,
  isActiveWorkoutForGym,
  validateGymColor,
  validateGymDeletion,
  validateGymName,
} from '../workout/gym-profile';
import { DataSnapshot, WorkoutDraft } from './contract';
import { validateSnapshotForMerge } from './snapshot-validation';
import { asCompletedRecord } from './workoutRecord';

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Fills in optional exercise arrays that older records may omit. */
export function normalizeExerciseRecord(exercise: Exercise): Exercise {
  const secondaryMuscles = Array.isArray(exercise.secondaryMuscles) ? exercise.secondaryMuscles : [];
  const instructions = Array.isArray(exercise.instructions) ? exercise.instructions : [];
  if (secondaryMuscles === exercise.secondaryMuscles && instructions === exercise.instructions) return exercise;
  return { ...exercise, secondaryMuscles, instructions };
}

/**
 * Normalizes a workout record: exercise payloads and a missing `gymId` default.
 * Preserves object identity when nothing needs to change so memoized readers
 * keep working.
 */
export function normalizeWorkoutRecord(workout: Workout): Workout {
  if (!Array.isArray(workout.exercises)) return workout;
  const exercises = workout.exercises.map((activeExercise) => {
    const exercise = normalizeExerciseRecord(activeExercise.exercise);
    return exercise === activeExercise.exercise ? activeExercise : { ...activeExercise, exercise };
  });
  const exercisesChanged = exercises.some((exercise, index) => exercise !== workout.exercises[index]);
  const withGym = workout.gymId ? workout : { ...workout, gymId: DEFAULT_GYM_ID };
  if (!exercisesChanged && withGym === workout) return workout;
  if (!exercisesChanged) return withGym;
  return { ...withGym, exercises };
}

export function normalizeRoutineRecord(routine: Routine): Routine {
  const exercises = routine.exercises.map((routineExercise) => {
    const exercise = normalizeExerciseRecord(routineExercise.exercise);
    return exercise === routineExercise.exercise ? routineExercise : { ...routineExercise, exercise };
  });
  if (exercises.every((exercise, index) => exercise === routine.exercises[index])) return routine;
  return { ...routine, exercises };
}

export function normalizeDraftRecord(draft: WorkoutDraft): WorkoutDraft {
  const workout = normalizeWorkoutRecord(draft.workout);
  return workout === draft.workout ? draft : { ...draft, workout };
}

// ---------------------------------------------------------------------------
// Comparisons
// ---------------------------------------------------------------------------

/** Code-point string comparison, used for deterministic ID tie-breaks. */
export function compareBinaryStrings(a: string, b: string): number {
  const aCodePoints = Array.from(a);
  const bCodePoints = Array.from(b);
  const length = Math.min(aCodePoints.length, bCodePoints.length);
  for (let index = 0; index < length; index++) {
    const difference = aCodePoints[index].codePointAt(0)! - bCodePoints[index].codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return aCodePoints.length - bCodePoints.length;
}

export function scopesAreIdentical(a: ExerciseGymScope, b: ExerciseGymScope): boolean {
  return a.exerciseId === b.exerciseId && a.scopeType === b.scopeType
    && JSON.stringify([...(a.linkedGymIds || [])].sort()) === JSON.stringify([...(b.linkedGymIds || [])].sort());
}

// ---------------------------------------------------------------------------
// Snapshot canonicalization and validation
// ---------------------------------------------------------------------------

export function canonicalizeSnapshotGyms(snapshot: DataSnapshot): DataSnapshot {
  if (!Array.isArray(snapshot.gyms)) return snapshot;
  return {
    ...snapshot,
    gyms: snapshot.gyms.map((gym) => {
      if (typeof gym.id !== 'string' || !gym.id.trim() || gym.id !== gym.id.trim()) throw new Error(`Invalid gym ID: ${gym.id}`);
      if (typeof gym.createdAt !== 'string' || !gym.createdAt || isNaN(Date.parse(gym.createdAt))) {
        throw new Error(`Invalid createdAt timestamp in gym: ${gym.id}`);
      }
      return {
        ...gym,
        name: validateGymName(gym.name),
        color: validateGymColor(gym.color),
      };
    }),
  };
}

/** Rejects ambiguous or conflicting snapshot records before any write. */
export function validateSnapshotMergeConflicts(snapshot: DataSnapshot, existing: DataSnapshot): void {
  const incomingScopes = snapshot.exerciseGymScopes || [];
  const exerciseIds = new Set([
    ...existing.exercises.map((exercise) => exercise.id),
    ...snapshot.exercises.map((exercise) => exercise.id),
  ]);
  const existingScopes = new Map(existing.exerciseGymScopes.map((scope) => [scope.exerciseId, scope]));
  const seenScopeIds = new Set<string>();
  for (const scope of incomingScopes) {
    if (seenScopeIds.has(scope.exerciseId)) throw new Error(`Snapshot contains duplicate exercise scope IDs: ${scope.exerciseId}`);
    seenScopeIds.add(scope.exerciseId);
    if (!exerciseIds.has(scope.exerciseId)) throw new Error(`unknown exercise: ${scope.exerciseId}`);
    const existingScope = existingScopes.get(scope.exerciseId);
    if (existingScope && !scopesAreIdentical(scope, existingScope)) {
      throw new Error(`Conflicting exercise gym scope: ${scope.exerciseId}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Snapshot merge planning
// ---------------------------------------------------------------------------

export interface SnapshotMergePlan {
  /** Existing default gym whose name/colour the backup overrides. */
  gymsToUpdate: Gym[];
  /** Gyms that do not exist yet; imported gyms are never default. */
  gymsToInsert: Gym[];
  exercisesToUpsert: Exercise[];
  scopesToInsert: ExerciseGymScope[];
  routinesToUpsert: Routine[];
  /** Imported workouts are completed records, mirroring `finishWorkout`. */
  workoutsToUpsert: Workout[];
  /** Persisted by `workout.id` as the storage key. */
  draftsToUpsert: Array<{ id: string; draft: WorkoutDraft }>;
  /** `replace` marks per-item maps that `restore.ts` already merged with local values. */
  settingsToInsert: Array<{ key: string; value: string; replace: boolean }>;
}

/**
 * Validates an incoming snapshot against current state and computes every
 * record the adapters must persist, in dependency order (gyms, exercises,
 * scopes, routines, workouts, drafts, settings).
 */
export function planSnapshotMerge(snapshot: DataSnapshot, existing: DataSnapshot): SnapshotMergePlan {
  validateSnapshotForMerge(snapshot, existing);
  validateSnapshotMergeConflicts(snapshot, existing);

  const destinationGymIds = new Set(existing.gyms.map((gym) => gym.id));
  const existingDefaultGym = existing.gyms.find((gym) => gym.isDefault);
  const existingScopes = new Map(existing.exerciseGymScopes.map((scope) => [scope.exerciseId, scope]));

  // A backup may rename/recolour the current default gym; keep its identity and
  // the device's default flag, but adopt the backup's name and colour.
  const gymsToUpdate = existingDefaultGym
    ? (snapshot.gyms || [])
        .filter((gym) => gym.isDefault && gym.id === existingDefaultGym.id)
        .map((gym) => ({ ...existingDefaultGym, name: gym.name, color: gym.color }))
    : [];
  const updatedGymIds = new Set(gymsToUpdate.map((gym) => gym.id));

  return {
    gymsToUpdate,
    gymsToInsert: (snapshot.gyms || [])
      .filter((gym) => !destinationGymIds.has(gym.id) && !updatedGymIds.has(gym.id))
      .map((gym) => ({ ...gym, isDefault: false })),
    exercisesToUpsert: snapshot.exercises.map(normalizeExerciseRecord),
    scopesToInsert: (snapshot.exerciseGymScopes || []).filter((scope) => !existingScopes.has(scope.exerciseId)),
    routinesToUpsert: snapshot.routines.map(normalizeRoutineRecord),
    workoutsToUpsert: snapshot.workouts.map((workout) => asCompletedRecord(normalizeWorkoutRecord(workout))),
    draftsToUpsert: snapshot.drafts.map((draft) => ({ id: draft.workout.id, draft: normalizeDraftRecord(draft) })),
    settingsToInsert: Object.entries(snapshot.settings)
      .filter(
        ([key]) =>
          !isDeviceLocalSetting(key) && (isMergedOnRestore(key) || !(key in existing.settings)),
      )
      .map(([key, value]) => ({ key, value, replace: isMergedOnRestore(key) })),
  };
}

// ---------------------------------------------------------------------------
// Gym deletion policy
// ---------------------------------------------------------------------------

export interface GymDeletionInput {
  gymId: string;
  replacementGymId: string;
  gyms: readonly Gym[];
  activeWorkoutGymId?: string | null;
  /** Normalized drafts; a draft whose workout has no end time is active. */
  drafts: readonly WorkoutDraft[];
  /**
   * Ids of stored workout records that reference the gym and are marked as in
   * progress (native `in_progress = 1`, web `inProgress: true`).
   */
  inProgressWorkoutIds: readonly string[];
  scopes: readonly ExerciseGymScope[];
}

export interface GymDeletionPlan {
  gymId: string;
  replacementGymId: string;
  /** Drafts to rewrite with the replacement gym, keyed by their storage id. */
  reassignDrafts: Array<{ id: string; draft: WorkoutDraft }>;
  /** Scope mutations in import order; a null scope deletes the record. */
  scopeWrites: Array<{ exerciseId: string; scope: ExerciseGymScope | null }>;
  /** True when the deleted gym was the default and the replacement inherits it. */
  makeDefault: boolean;
}

/**
 * Single gym-deletion policy for both stores (resolves the COR-02 drift):
 * deletion is rejected while an active draft or an in-progress workout
 * references the gym; otherwise drafts and scopes are rewritten and the
 * replacement inherits default status. Workout history reassignment is a
 * storage-level rewrite every adapter performs for rows referencing the gym.
 */
export function planGymDeletion(input: GymDeletionInput): GymDeletionPlan {
  const { gymId, replacementGymId, gyms, activeWorkoutGymId, drafts, inProgressWorkoutIds, scopes } = input;

  validateGymDeletion(gymId, replacementGymId, gyms, activeWorkoutGymId);
  if (drafts.some((draft) => isActiveWorkoutForGym(draft.workout, gymId))) {
    throw new Error('cannot delete the gym used by an active workout draft');
  }
  if (inProgressWorkoutIds.length > 0) {
    throw new Error('cannot delete the gym used by an in-progress workout');
  }

  const deleted = gyms.find((gym) => gym.id === gymId)!;
  return {
    gymId,
    replacementGymId,
    reassignDrafts: drafts
      .filter((draft) => draft.workout.gymId === gymId)
      .map((draft) => ({ id: draft.workout.id, draft: { ...draft, workout: { ...draft.workout, gymId: replacementGymId } } })),
    scopeWrites: pruneGymFromScopes(scopes, gymId),
    makeDefault: Boolean(deleted.isDefault),
  };
}

/** Drops a deleted gym from linked-group scopes; empties collapse to gym_specific or deletion. */
export function pruneGymFromScopes(
  scopes: readonly ExerciseGymScope[],
  gymId: string,
): Array<{ exerciseId: string; scope: ExerciseGymScope | null }> {
  const writes: Array<{ exerciseId: string; scope: ExerciseGymScope | null }> = [];
  for (const scope of scopes) {
    if (!scope.linkedGymIds?.includes(gymId)) continue;
    const ids = scope.linkedGymIds.filter((id) => id !== gymId);
    if (ids.length === 0) {
      writes.push({ exerciseId: scope.exerciseId, scope: null });
    } else if (ids.length < 2) {
      writes.push({ exerciseId: scope.exerciseId, scope: { ...scope, scopeType: 'gym_specific', linkedGymIds: undefined } });
    } else {
      writes.push({ exerciseId: scope.exerciseId, scope: { ...scope, scopeType: 'linked_group', linkedGymIds: ids } });
    }
  }
  return writes;
}
