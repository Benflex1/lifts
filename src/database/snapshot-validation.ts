import { DataSnapshot, WorkoutDraft } from './contract';
import {
  ActiveExercise,
  Exercise,
  ExerciseGymScope,
  Gym,
  Routine,
  RoutineExercise,
  Workout,
  WorkoutSet,
} from '../types';
import { validateGymColor, validateGymName } from '../workout/gym-profile';
import { validateExerciseGymScope } from '../workout/gym-scope';

const SET_TYPES = new Set(['normal', 'warmup', 'drop', 'failure']);

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: unknown, label: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw new Error(`Invalid ${label}: expected non-empty string`);
  }
}

function requireOptionalString(value: unknown, label: string, allowEmpty = false): void {
  if (value !== undefined && value !== null) requireString(value, label, allowEmpty);
}

function requireFiniteNumber(value: unknown, label: string, minimum?: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (minimum !== undefined && value < minimum)) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
}

function requireInteger(value: unknown, label: string, minimum?: number): asserts value is number {
  requireFiniteNumber(value, label, minimum);
  if (!Number.isInteger(value)) throw new Error(`Invalid ${label}: expected integer`);
}

function requireOptionalFiniteNumber(value: unknown, label: string, minimum?: number): void {
  if (value !== undefined && value !== null) requireFiniteNumber(value, label, minimum);
}

function requireTimestamp(value: unknown, label: string): void {
  requireString(value, label);
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid ${label}: ${value}`);
}

function requireOptionalTimestamp(value: unknown, label: string): void {
  if (value !== undefined && value !== null) requireTimestamp(value, label);
}

export function validateExerciseRecord(value: unknown, label: string): asserts value is Exercise {
  if (!isRecord(value)) throw new Error(`Invalid ${label}: expected object`);
  requireString(value.id, `${label}.id`);
  requireString(value.name, `${label}.name`);
  requireString(value.category, `${label}.category`);
  requireString(value.equipment, `${label}.equipment`);
  if (!Array.isArray(value.primaryMuscles) || value.primaryMuscles.some((muscle: unknown) => typeof muscle !== 'string')) {
    throw new Error(`Invalid ${label}.primaryMuscles`);
  }
  if (value.secondaryMuscles !== undefined && value.secondaryMuscles !== null &&
      (!Array.isArray(value.secondaryMuscles) || value.secondaryMuscles.some((muscle: unknown) => typeof muscle !== 'string'))) {
    throw new Error(`Invalid ${label}.secondaryMuscles`);
  }
  if (value.instructions !== undefined && value.instructions !== null &&
      (!Array.isArray(value.instructions) || value.instructions.some((instruction: unknown) => typeof instruction !== 'string'))) {
    throw new Error(`Invalid ${label}.instructions`);
  }
  if (value.isCustom !== undefined && value.isCustom !== null && typeof value.isCustom !== 'boolean') {
    throw new Error(`Invalid ${label}.isCustom`);
  }
}

export function validateWorkoutSetRecord(value: unknown, label: string): asserts value is WorkoutSet {
  if (!isRecord(value)) throw new Error(`Invalid ${label}: expected object`);
  requireString(value.id, `${label}.id`);
  requireInteger(value.setNumber, `${label}.setNumber`, 1);
  if (typeof value.type !== 'string' || !SET_TYPES.has(value.type)) {
    throw new Error(`Invalid ${label}.type: ${String(value.type)}`);
  }
  requireFiniteNumber(value.weightKg, `${label}.weightKg`, 0);
  requireFiniteNumber(value.reps, `${label}.reps`, 0);
  if (typeof value.isCompleted !== 'boolean') throw new Error(`Invalid ${label}.isCompleted`);
  if (value.targetReps !== undefined && value.targetReps !== null) requireString(value.targetReps, `${label}.targetReps`, true);
  requireOptionalFiniteNumber(value.rpe, `${label}.rpe`);
  if (value.rpe !== undefined && value.rpe !== null && (value.rpe < 1 || value.rpe > 10)) {
    throw new Error(`Invalid ${label}.rpe: ${value.rpe}`);
  }
  requireOptionalTimestamp(value.completedAt, `${label}.completedAt`);
  requireOptionalFiniteNumber(value.previousWeightKg, `${label}.previousWeightKg`, 0);
  requireOptionalFiniteNumber(value.previousReps, `${label}.previousReps`, 0);
  requireOptionalString(value.previousGymId, `${label}.previousGymId`);
  requireOptionalString(value.previousGymName, `${label}.previousGymName`);
  if (value.isWeightEdited !== undefined && value.isWeightEdited !== null && typeof value.isWeightEdited !== 'boolean') {
    throw new Error(`Invalid ${label}.isWeightEdited`);
  }
}

function validateActiveExerciseRecord(
  value: unknown,
  label: string,
  knownExerciseIds: ReadonlySet<string>,
  nestedIds: NestedIdValidationContext,
): asserts value is ActiveExercise {
  if (!isRecord(value)) throw new Error(`Invalid ${label}: expected object`);
  requireString(value.id, `${label}.id`);
  requireString(value.exerciseId, `${label}.exerciseId`);
  if (!knownExerciseIds.has(value.exerciseId)) throw new Error(`Unknown exercise in ${label}: ${value.exerciseId}`);
  validateExerciseRecord(value.exercise, `${label}.exercise`);
  if (value.exercise.id !== value.exerciseId) throw new Error(`Invalid ${label}.exercise.id: must match exerciseId`);
  if (!Array.isArray(value.sets)) throw new Error(`Invalid ${label}.sets: expected array`);
  value.sets.forEach((set: unknown, index: number) => {
    validateWorkoutSetRecord(set, `${label}.sets[${index}]`);
    if (nestedIds.incomingSetIds.has(set.id)) throw new Error(`Duplicate set ID in ${label}: ${set.id}`);
    if (nestedIds.parentIsNew && nestedIds.existingSetIds.has(set.id)) {
      throw new Error(`Duplicate set ID already exists in destination: ${set.id}`);
    }
    nestedIds.incomingSetIds.add(set.id);
  });
  requireOptionalString(value.notes, `${label}.notes`, true);
  if (value.targetReps !== undefined && value.targetReps !== null) requireString(value.targetReps, `${label}.targetReps`, true);
  requireFiniteNumber(value.restTimerSeconds, `${label}.restTimerSeconds`, 0);
  if ('orderIndex' in value) requireInteger(value.orderIndex, `${label}.orderIndex`, 0);
  if (nestedIds.incomingWorkoutExerciseIds.has(value.id)) {
    throw new Error(`Duplicate workout exercise ID in ${label}: ${value.id}`);
  }
  if (nestedIds.parentIsNew && nestedIds.existingWorkoutExerciseIds.has(value.id)) {
    throw new Error(`Duplicate workout exercise ID already exists in destination: ${value.id}`);
  }
  nestedIds.incomingWorkoutExerciseIds.add(value.id);
}

function validateRoutineExerciseRecord(
  value: unknown,
  label: string,
  knownExerciseIds: ReadonlySet<string>,
  nestedIds: NestedIdValidationContext,
): asserts value is RoutineExercise {
  if (!isRecord(value)) throw new Error(`Invalid ${label}: expected object`);
  requireString(value.id, `${label}.id`);
  requireString(value.exerciseId, `${label}.exerciseId`);
  if (!knownExerciseIds.has(value.exerciseId)) throw new Error(`Unknown exercise in ${label}: ${value.exerciseId}`);
  validateExerciseRecord(value.exercise, `${label}.exercise`);
  if (value.exercise.id !== value.exerciseId) throw new Error(`Invalid ${label}.exercise.id: must match exerciseId`);
  requireInteger(value.orderIndex, `${label}.orderIndex`, 0);
  requireInteger(value.targetSets, `${label}.targetSets`, 0);
  requireString(value.targetReps, `${label}.targetReps`, true);
  requireFiniteNumber(value.restTimerSeconds, `${label}.restTimerSeconds`, 0);
  if (nestedIds.incomingRoutineExerciseIds.has(value.id)) {
    throw new Error(`Duplicate routine exercise ID in ${label}: ${value.id}`);
  }
  if (nestedIds.parentIsNew && nestedIds.existingRoutineExerciseIds.has(value.id)) {
    throw new Error(`Duplicate routine exercise ID already exists in destination: ${value.id}`);
  }
  nestedIds.incomingRoutineExerciseIds.add(value.id);
}

interface NestedIdValidationContext {
  incomingWorkoutExerciseIds: Set<string>;
  incomingSetIds: Set<string>;
  incomingRoutineExerciseIds: Set<string>;
  existingWorkoutExerciseIds: ReadonlySet<string>;
  existingSetIds: ReadonlySet<string>;
  existingRoutineExerciseIds: ReadonlySet<string>;
  parentIsNew: boolean;
}

function validateRoutineRecord(
  value: unknown,
  knownExerciseIds: ReadonlySet<string>,
  nestedIds: NestedIdValidationContext,
): asserts value is Routine {
  if (!isRecord(value)) throw new Error('Invalid routine: expected object');
  requireString(value.id, 'routine.id');
  requireString(value.name, `routine ${value.id}.name`);
  if (value.folderName !== undefined && value.folderName !== null) requireString(value.folderName, `routine ${value.id}.folderName`, true);
  requireOptionalString(value.notes, `routine ${value.id}.notes`, true);
  requireTimestamp(value.createdAt, `routine ${value.id}.createdAt`);
  requireOptionalTimestamp(value.lastPerformedAt, `routine ${value.id}.lastPerformedAt`);
  if (!Array.isArray(value.exercises)) throw new Error(`Invalid exercises in routine ${value.id}: expected array`);
  value.exercises.forEach((exercise: unknown, index: number) => {
    validateRoutineExerciseRecord(exercise, `routine ${value.id}.exercises[${index}]`, knownExerciseIds, nestedIds);
  });
}

function validateWorkoutRecord(
  value: unknown,
  label: string,
  knownExerciseIds: ReadonlySet<string>,
  knownGymIds: ReadonlySet<string>,
  nestedIds: NestedIdValidationContext,
): asserts value is Workout {
  if (!isRecord(value)) throw new Error(`Invalid ${label}: expected object`);
  requireString(value.id, `${label}.id`);
  requireString(value.name, `${label}.name`);
  requireString(value.gymId, `${label}.gymId`);
  if (!knownGymIds.has(value.gymId)) throw new Error(`Invalid gym ID in ${label}: ${value.gymId}`);
  requireOptionalString(value.routineId, `${label}.routineId`);
  requireTimestamp(value.startTime, `${label}.startTime`);
  requireOptionalTimestamp(value.endTime, `${label}.endTime`);
  requireFiniteNumber(value.durationSeconds, `${label}.durationSeconds`, 0);
  requireFiniteNumber(value.totalVolumeKg, `${label}.totalVolumeKg`, 0);
  requireOptionalString(value.notes, `${label}.notes`, true);
  if (!Array.isArray(value.exercises)) throw new Error(`Invalid exercises in ${label}: expected array`);
  value.exercises.forEach((exercise: unknown, index: number) => {
    validateActiveExerciseRecord(exercise, `${label}.exercises[${index}]`, knownExerciseIds, nestedIds);
  });
}

function validateDraftRecord(
  value: unknown,
  knownExerciseIds: ReadonlySet<string>,
  knownGymIds: ReadonlySet<string>,
  nestedIds: NestedIdValidationContext,
): asserts value is WorkoutDraft {
  if (!isRecord(value)) throw new Error('Invalid draft: expected object');
  if (value.version !== 1) throw new Error(`Invalid draft.version: ${String(value.version)}`);
  requireTimestamp(value.savedAt, 'draft.savedAt');
  requireInteger(value.revision, 'draft.revision', 0);
  if (value.restTimer !== null) {
    if (!isRecord(value.restTimer)) throw new Error('Invalid draft.restTimer');
    requireFiniteNumber(value.restTimer.endsAt, 'draft.restTimer.endsAt');
    requireFiniteNumber(value.restTimer.totalSeconds, 'draft.restTimer.totalSeconds', 0);
  }
  validateWorkoutRecord(value.workout, `draft ${value.workout?.id || ''}.workout`, knownExerciseIds, knownGymIds, nestedIds);
}

function validateGymRecord(value: unknown, label: string): asserts value is Gym {
  if (!isRecord(value)) throw new Error(`Invalid ${label}: expected object`);
  requireString(value.id, `${label}.id`);
  validateGymName(value.name);
  validateGymColor(value.color);
  if (typeof value.isDefault !== 'boolean') throw new Error(`Invalid ${label}.isDefault`);
  requireTimestamp(value.createdAt, `${label}.createdAt`);
}

function validateScopeRecord(value: unknown, knownExerciseIds: ReadonlySet<string>, knownGymIds: ReadonlySet<string>): asserts value is ExerciseGymScope {
  if (!isRecord(value)) throw new Error('Invalid exercise gym scope: expected object');
  requireString(value.exerciseId, 'exercise gym scope.exerciseId');
  if (!knownExerciseIds.has(value.exerciseId)) throw new Error(`Unknown exercise in scope: ${value.exerciseId}`);
  if (value.linkedGymIds !== undefined && value.linkedGymIds !== null &&
      (!Array.isArray(value.linkedGymIds) || value.linkedGymIds.some((id: unknown) => typeof id !== 'string'))) {
    throw new Error(`Invalid linked gym IDs in scope: ${value.exerciseId}`);
  }
  validateExerciseGymScope(value as ExerciseGymScope, knownGymIds);
}

function validateSettings(value: unknown): asserts value is Record<string, string> {
  if (!isRecord(value)) throw new Error('Invalid settings format: expected object');
  for (const [key, setting] of Object.entries(value)) {
    if (typeof key !== 'string' || typeof setting !== 'string') throw new Error(`Invalid setting: ${key}`);
  }
}

export interface SnapshotValidationOptions {
  knownExerciseIds?: ReadonlySet<string>;
  existingExercises?: readonly Exercise[];
  existingGyms?: readonly Gym[];
  existingWorkouts?: readonly Workout[];
  existingDrafts?: readonly WorkoutDraft[];
  existingRoutines?: readonly Routine[];
  requireDefaultGym?: boolean;
}

function collectNestedIds(
  workouts: readonly Workout[],
  drafts: readonly WorkoutDraft[],
  routines: readonly Routine[],
): Pick<NestedIdValidationContext, 'existingWorkoutExerciseIds' | 'existingSetIds' | 'existingRoutineExerciseIds'> {
  const workoutExerciseIds = new Set<string>();
  const setIds = new Set<string>();
  const routineExerciseIds = new Set<string>();
  for (const workout of [...workouts, ...drafts.map(draft => draft.workout)]) {
    for (const exercise of workout.exercises || []) {
      if (typeof exercise.id === 'string') workoutExerciseIds.add(exercise.id);
      for (const set of exercise.sets || []) {
        if (typeof set.id === 'string') setIds.add(set.id);
      }
    }
  }
  for (const routine of routines) {
    for (const exercise of routine.exercises || []) {
      if (typeof exercise.id === 'string') routineExerciseIds.add(exercise.id);
    }
  }
  return {
    existingWorkoutExerciseIds: workoutExerciseIds,
    existingSetIds: setIds,
    existingRoutineExerciseIds: routineExerciseIds,
  };
}

/** Validate the complete runtime shape shared by backup parsing and both stores. */
export function validateSnapshotStructure(value: unknown, options: SnapshotValidationOptions = {}): asserts value is DataSnapshot {
  if (!isRecord(value)) throw new Error('Invalid snapshot: expected object');
  for (const field of ['workouts', 'routines', 'exercises', 'drafts', 'gyms', 'exerciseGymScopes']) {
    if (!Array.isArray(value[field])) throw new Error(`Invalid ${field} format: expected array`);
  }
  validateSettings(value.settings);

  const gyms = value.gyms as unknown[];
  const gymIds = new Set((options.existingGyms || []).map(gym => gym.id));
  let defaultCount = 0;
  const incomingGymIds = new Set<string>();
  gyms.forEach((gym, index) => {
    validateGymRecord(gym, `gym[${index}]`);
    if (incomingGymIds.has(gym.id)) throw new Error(`Duplicate gym ID in snapshot: ${gym.id}`);
    incomingGymIds.add(gym.id);
    gymIds.add(gym.id);
    if (gym.isDefault) defaultCount++;
  });
  if (defaultCount > 1) throw new Error('Snapshot contains multiple default gyms');
  if (options.requireDefaultGym && defaultCount !== 1) throw new Error('Snapshot must contain exactly one default gym');

  const knownExerciseIds = new Set(options.knownExerciseIds || []);
  for (const exercise of options.existingExercises || []) knownExerciseIds.add(exercise.id);
  const existingWorkoutIds = new Set((options.existingWorkouts || []).map(workout => workout.id));
  const existingDraftIds = new Set((options.existingDrafts || []).map(draft => draft.workout.id));
  const existingRoutineIds = new Set((options.existingRoutines || []).map(routine => routine.id));
  const existingNestedIds = collectNestedIds(
    options.existingWorkouts || [],
    options.existingDrafts || [],
    options.existingRoutines || [],
  );
  const nestedIds: NestedIdValidationContext = {
    incomingWorkoutExerciseIds: new Set<string>(),
    incomingSetIds: new Set<string>(),
    incomingRoutineExerciseIds: new Set<string>(),
    ...existingNestedIds,
    parentIsNew: true,
  };
  const incomingExerciseIds = new Set<string>();
  (value.exercises as unknown[]).forEach((exercise, index) => {
    validateExerciseRecord(exercise, `exercise[${index}]`);
    if (incomingExerciseIds.has(exercise.id)) throw new Error(`Duplicate exercise ID in snapshot: ${exercise.id}`);
    incomingExerciseIds.add(exercise.id);
    knownExerciseIds.add(exercise.id);
  });

  const routineIds = new Set<string>();
  (value.routines as unknown[]).forEach((routine, index) => {
    const routineId = isRecord(routine) && typeof routine.id === 'string' ? routine.id : undefined;
    nestedIds.parentIsNew = routineId === undefined || !existingRoutineIds.has(routineId);
    validateRoutineRecord(routine, knownExerciseIds, nestedIds);
    if (routineIds.has(routine.id)) throw new Error(`Duplicate routine ID in snapshot: ${routine.id}`);
    routineIds.add(routine.id);
  });

  const workoutIds = new Set<string>();
  (value.workouts as unknown[]).forEach((workout, index) => {
    const workoutId = isRecord(workout) && typeof workout.id === 'string' ? workout.id : undefined;
    nestedIds.parentIsNew = workoutId === undefined || !existingWorkoutIds.has(workoutId);
    validateWorkoutRecord(workout, `workout[${index}]`, knownExerciseIds, gymIds, nestedIds);
    if (workoutIds.has(workout.id)) throw new Error(`Duplicate workout ID in snapshot: ${workout.id}`);
    workoutIds.add(workout.id);
  });

  const draftIds = new Set<string>();
  (value.drafts as unknown[]).forEach((draft, index) => {
    const draftWorkoutId = isRecord(draft) && isRecord(draft.workout) && typeof draft.workout.id === 'string'
      ? draft.workout.id
      : undefined;
    nestedIds.parentIsNew = draftWorkoutId === undefined || !existingDraftIds.has(draftWorkoutId);
    validateDraftRecord(draft, knownExerciseIds, gymIds, nestedIds);
    if (draftIds.has(draft.workout.id)) throw new Error(`Duplicate draft ID in snapshot: ${draft.workout.id}`);
    draftIds.add(draft.workout.id);
  });

  const scopeIds = new Set<string>();
  (value.exerciseGymScopes as unknown[]).forEach((scope, index) => {
    validateScopeRecord(scope, knownExerciseIds, gymIds);
    if (scopeIds.has(scope.exerciseId)) throw new Error(`Duplicate exercise scope ID in snapshot: ${scope.exerciseId}`);
    scopeIds.add(scope.exerciseId);
  });
}

/** Validate an incoming partial merge against destination IDs before opening a write transaction. */
export function validateSnapshotForMerge(
  value: unknown,
  existing: Pick<DataSnapshot, 'exercises' | 'gyms'> & Partial<Pick<DataSnapshot, 'workouts' | 'drafts' | 'routines'>>,
): asserts value is DataSnapshot {
  validateSnapshotStructure(value, {
    existingExercises: existing.exercises,
    existingGyms: existing.gyms,
    existingWorkouts: existing.workouts,
    existingDrafts: existing.drafts,
    existingRoutines: existing.routines,
    requireDefaultGym: false,
  });
}
