import { DataSnapshot, Store } from '../database/contract';
import { DEFAULT_EXERCISES } from '../database/seedData';
import { Exercise, ExerciseGymScope, Gym, Routine, Workout, WorkoutSet } from '../types';
import { DEFAULT_GYM_COLOR, validateGymColor, validateGymName } from '../workout/gym-profile';
import { validateExerciseGymScope } from '../workout/gym-scope';
import { validateTargetReps } from '../workout/sets';

export const MAX_BACKUP_SIZE_BYTES = 50 * 1024 * 1024; // 50 MiB

export interface BackupV2 {
  version: 2;
  exportedAt: string;
  workouts: Workout[];
  routines: Routine[];
  exercises: Exercise[];
  drafts: import('../database/contract').WorkoutDraft[];
  settings: Record<string, string>;
}

export interface BackupV3 extends DataSnapshot {
  version: 3;
  exportedAt: string;
}

function validateGymId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !id.trim() || id !== id.trim()) {
    throw new Error(`Invalid gym ID: ${String(id)}`);
  }
}

function validateGyms(gyms: unknown): asserts gyms is Gym[] {
  if (!Array.isArray(gyms)) throw new Error('Invalid gyms format: expected array');
  const ids = new Set<string>();
  let defaultCount = 0;
  for (const gym of gyms) {
    if (!gym || typeof gym !== 'object') throw new Error('Invalid gym in backup: expected object');
    const candidate = gym as Gym;
    validateGymId(candidate.id);
    if (ids.has(candidate.id)) throw new Error(`Duplicate gym ID in backup: ${candidate.id}`);
    ids.add(candidate.id);
    if (typeof candidate.isDefault !== 'boolean') {
      throw new Error(`Invalid isDefault in gym: ${candidate.id}`);
    }
    validateGymName(candidate.name);
    validateGymColor(candidate.color);
    if (!candidate.createdAt || isNaN(Date.parse(candidate.createdAt))) {
      throw new Error(`Invalid createdAt timestamp in gym: ${candidate.id}`);
    }
    if (candidate.isDefault) defaultCount++;
  }
  if (defaultCount !== 1) throw new Error('Backup must contain exactly one default gym');
}

function validateScopes(scopes: unknown, gyms: readonly Gym[], knownExerciseIds: ReadonlySet<string>): void {
  if (!Array.isArray(scopes)) throw new Error('Invalid exerciseGymScopes format: expected array');
  const scopeExerciseIds = new Set<string>();
  const knownGymIds = new Set(gyms.map((gym) => gym.id));
  for (const scope of scopes) {
    if (!scope || typeof scope !== 'object') throw new Error('Invalid exercise gym scope in backup');
    const candidate = scope as ExerciseGymScope;
    if (scopeExerciseIds.has(candidate.exerciseId)) {
      throw new Error(`Duplicate exercise scope ID in backup: ${candidate.exerciseId}`);
    }
    scopeExerciseIds.add(candidate.exerciseId);
    if (!knownExerciseIds.has(candidate.exerciseId)) {
      throw new Error(`Missing exercise definition for scope: ${candidate.exerciseId}`);
    }
    if (candidate.linkedGymIds !== undefined) {
      if (!Array.isArray(candidate.linkedGymIds) || candidate.linkedGymIds.some((id) => typeof id !== 'string')) {
        throw new Error(`Invalid linked gym IDs in scope: ${candidate.exerciseId}`);
      }
      candidate.linkedGymIds.forEach(validateGymId);
    }
    validateExerciseGymScope(candidate, knownGymIds);
  }
}

export function parseBackup(json: string): BackupV3 {
  if (typeof json !== 'string') {
    throw new Error('Invalid backup payload: expected string');
  }

  if (json.length > MAX_BACKUP_SIZE_BYTES) {
    throw new Error('Backup file exceeds the 50 MiB size limit');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch (e: any) {
    throw new Error(`Invalid JSON in backup file: ${e.message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup format: expected JSON object');
  }

  if (parsed.version === 1) {
    throw new Error(
      'Version 1 backups contain only summary data and cannot restore workout sets. Please use a complete v2 backup.'
    );
  }

  if (parsed.version !== 2 && parsed.version !== 3) {
    throw new Error(`Unsupported backup version: ${parsed.version}`);
  }

  if (!parsed.exportedAt || isNaN(Date.parse(parsed.exportedAt))) {
    throw new Error('Invalid exportedAt timestamp in backup file');
  }

  if (!Array.isArray(parsed.workouts)) {
    throw new Error('Invalid workouts format: expected array');
  }
  if (!Array.isArray(parsed.routines)) {
    throw new Error('Invalid routines format: expected array');
  }
  if (!Array.isArray(parsed.exercises)) {
    throw new Error('Invalid exercises format: expected array');
  }
  if (!Array.isArray(parsed.drafts)) {
    throw new Error('Invalid drafts format: expected array');
  }
  if (!parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) {
    throw new Error('Invalid settings format: expected object');
  }

  if (parsed.version === 2) {
    parsed.version = 3;
    parsed.gyms = [{
      id: 'gym-default',
      name: 'Default Gym',
      color: DEFAULT_GYM_COLOR,
      isDefault: true,
      createdAt: parsed.exportedAt,
    } satisfies Gym];
    parsed.exerciseGymScopes = [];
    parsed.workouts = parsed.workouts.map((workout: Workout) => ({ ...workout, gymId: 'gym-default' }));
    parsed.drafts = parsed.drafts.map((draft: import('../database/contract').WorkoutDraft) => ({
      ...draft,
      workout: { ...draft.workout, gymId: 'gym-default' },
    }));
  } else {
    if (!Array.isArray(parsed.gyms)) {
      throw new Error('Invalid gyms format: expected array');
    }
    if (!Array.isArray(parsed.exerciseGymScopes)) {
      throw new Error('Invalid exerciseGymScopes format: expected array');
    }
  }

  validateGyms(parsed.gyms);

  // Map of available exercises: bundled seed exercises + backup exercises
  const knownExercisesMap = new Map<string, Exercise>();
  for (const de of DEFAULT_EXERCISES) {
    knownExercisesMap.set(de.id, de);
  }
  const exerciseIdsInBackup = new Set<string>();
  for (const ex of parsed.exercises) {
    if (!ex.id || typeof ex.id !== 'string') {
      throw new Error('Invalid exercise in backup: missing or non-string id');
    }
    if (exerciseIdsInBackup.has(ex.id)) {
      throw new Error(`Duplicate exercise ID in backup: ${ex.id}`);
    }
    if (ex.primaryMuscles !== undefined) {
      if (!Array.isArray(ex.primaryMuscles) || ex.primaryMuscles.some((m: any) => typeof m !== 'string')) {
        throw new Error(`Invalid primaryMuscles in exercise: ${ex.id}`);
      }
    }
    const bundled = DEFAULT_EXERCISES.find((d) => d.id === ex.id);
    if (!ex.primaryMuscles) {
      if (bundled?.primaryMuscles && bundled.primaryMuscles.length > 0) {
        ex.primaryMuscles = [...bundled.primaryMuscles];
      } else if (ex.targetMuscle) {
        ex.primaryMuscles = [ex.targetMuscle];
      } else {
        ex.primaryMuscles = [];
      }
    }
    exerciseIdsInBackup.add(ex.id);
    knownExercisesMap.set(ex.id, ex);
  }

  // Validate routines
  const routineIds = new Set<string>();
  for (const r of parsed.routines) {
    if (!r.id || typeof r.id !== 'string') {
      throw new Error('Invalid routine in backup: missing or non-string id');
    }
    if (routineIds.has(r.id)) {
      throw new Error(`Duplicate routine ID in backup: ${r.id}`);
    }
    routineIds.add(r.id);

    if (!Array.isArray(r.exercises)) {
      throw new Error(`Invalid exercises in routine ${r.id}: expected array`);
    }

    for (const re of r.exercises) {
      if (!re || typeof re !== 'object' || typeof re.exerciseId !== 'string' || !re.exerciseId) {
        throw new Error(`Invalid exercise entry in routine ${r.id}`);
      }
      if (!knownExercisesMap.has(re.exerciseId)) {
        throw new Error(`Missing exercise definition for routine exercise: ${re.exerciseId}`);
      }
      const def = knownExercisesMap.get(re.exerciseId)!;
      const bundled = DEFAULT_EXERCISES.find((d) => d.id === re.exerciseId);
      if (!re.exercise || typeof re.exercise !== 'object') {
        const primaryMuscles = (Array.isArray(def.primaryMuscles) && def.primaryMuscles.length > 0)
          ? [...def.primaryMuscles]
          : ((def as any).targetMuscle ? [(def as any).targetMuscle] : (bundled?.primaryMuscles ? [...bundled.primaryMuscles] : []));
        const secondaryMuscles = (Array.isArray(def.secondaryMuscles) && def.secondaryMuscles.length > 0)
          ? [...def.secondaryMuscles]
          : (bundled?.secondaryMuscles ? [...bundled.secondaryMuscles] : []);
        const instructions = (Array.isArray(def.instructions) && def.instructions.length > 0)
          ? [...def.instructions]
          : (bundled?.instructions ? [...bundled.instructions] : []);

        re.exercise = {
          id: def.id,
          name: def.name || bundled?.name || re.exerciseId,
          category: def.category || bundled?.category || 'other',
          equipment: def.equipment || bundled?.equipment || 'other',
          primaryMuscles,
          secondaryMuscles,
          instructions,
          isCustom: Boolean(def.isCustom),
        };
      } else {
        if (re.exercise.name !== undefined && (typeof re.exercise.name !== 'string' || !re.exercise.name.trim())) {
          throw new Error(`Invalid exercise name in routine exercise: ${re.exerciseId}`);
        }
        if (re.exercise.primaryMuscles !== undefined) {
          if (!Array.isArray(re.exercise.primaryMuscles) || re.exercise.primaryMuscles.some((m: any) => typeof m !== 'string')) {
            throw new Error(`Invalid primaryMuscles in routine exercise: ${re.exerciseId}`);
          }
        } else {
          re.exercise.primaryMuscles = (Array.isArray(def.primaryMuscles) && def.primaryMuscles.length > 0)
            ? [...def.primaryMuscles]
            : ((re.exercise as any).targetMuscle ? [(re.exercise as any).targetMuscle] : (bundled?.primaryMuscles ? [...bundled.primaryMuscles] : []));
        }
        if (re.exercise.equipment !== undefined && typeof re.exercise.equipment !== 'string') {
          throw new Error(`Invalid equipment in routine exercise: ${re.exerciseId}`);
        }
        if (re.exercise.category !== undefined && typeof re.exercise.category !== 'string') {
          throw new Error(`Invalid category in routine exercise: ${re.exerciseId}`);
        }
        re.exercise.id = re.exercise.id || def.id;
        re.exercise.name = re.exercise.name || def.name || bundled?.name || re.exerciseId;
        re.exercise.category = re.exercise.category || def.category || bundled?.category || 'other';
        re.exercise.equipment = re.exercise.equipment || def.equipment || bundled?.equipment || 'other';
      }

      if (re.targetReps !== undefined && re.targetReps !== null) {
        if (typeof re.targetReps !== 'string') {
          throw new Error(`Invalid targetReps in routine exercise: ${re.exerciseId}`);
        }
        // Preserve legacy target reps text (e.g. "8 each side") during restore
      }
    }
  }

  function validateWorkoutStructure(
    w: any,
    knownExercisesMap: Map<string, Exercise>,
    entityLabel: string,
    knownGymIds: ReadonlySet<string>
  ): void {
    if (!w || typeof w !== 'object') {
      throw new Error(`Invalid ${entityLabel}: expected object`);
    }
    if (!w.id || typeof w.id !== 'string') {
      throw new Error(`Invalid ${entityLabel}: missing or non-string id`);
    }
    if (!w.name || typeof w.name !== 'string') {
      throw new Error(`Invalid name in ${entityLabel} ${w.id}`);
    }
    if (typeof w.gymId !== 'string' || !knownGymIds.has(w.gymId)) {
      throw new Error(`Invalid gym ID in ${entityLabel} ${w.id}: ${w.gymId}`);
    }
    if (!w.startTime || isNaN(Date.parse(w.startTime))) {
      throw new Error(`Invalid timestamp in ${entityLabel} ${w.id}: ${w.startTime}`);
    }
    if (w.endTime && isNaN(Date.parse(w.endTime))) {
      throw new Error(`Invalid timestamp in ${entityLabel} ${w.id}: ${w.endTime}`);
    }
    if (w.durationSeconds !== undefined && w.durationSeconds !== null) {
      if (typeof w.durationSeconds !== 'number' || !isFinite(w.durationSeconds) || w.durationSeconds < 0) {
        throw new Error(`Invalid durationSeconds in ${entityLabel} ${w.id}: ${w.durationSeconds}`);
      }
    }
    if (w.totalVolumeKg !== undefined && w.totalVolumeKg !== null) {
      if (typeof w.totalVolumeKg !== 'number' || !isFinite(w.totalVolumeKg) || w.totalVolumeKg < 0) {
        throw new Error(`Invalid totalVolumeKg in ${entityLabel} ${w.id}: ${w.totalVolumeKg}`);
      }
    }

    if (!Array.isArray(w.exercises)) {
      throw new Error(`Invalid exercises in ${entityLabel} ${w.id}: expected array`);
    }

    const setIds = new Set<string>();
    for (const we of w.exercises) {
      if (!we || typeof we !== 'object') {
        throw new Error(`Invalid exercise entry in ${entityLabel} ${w.id}`);
      }
      if (!we.exerciseId || typeof we.exerciseId !== 'string') {
        throw new Error(`Missing exercise definition for ${entityLabel} exercise: ${we?.exerciseId}`);
      }
      if (!knownExercisesMap.has(we.exerciseId)) {
        throw new Error(`Missing exercise definition for ${entityLabel} exercise: ${we.exerciseId}`);
      }

      const def = knownExercisesMap.get(we.exerciseId)!;
      const bundled = DEFAULT_EXERCISES.find((d) => d.id === we.exerciseId);

      // Reconstruct or validate embedded exercise object
      if (!we.exercise || typeof we.exercise !== 'object') {
        const primaryMuscles = (Array.isArray(def.primaryMuscles) && def.primaryMuscles.length > 0)
          ? [...def.primaryMuscles]
          : ((def as any).targetMuscle ? [(def as any).targetMuscle] : (bundled?.primaryMuscles ? [...bundled.primaryMuscles] : []));
        const secondaryMuscles = (Array.isArray(def.secondaryMuscles) && def.secondaryMuscles.length > 0)
          ? [...def.secondaryMuscles]
          : (bundled?.secondaryMuscles ? [...bundled.secondaryMuscles] : []);
        const instructions = (Array.isArray(def.instructions) && def.instructions.length > 0)
          ? [...def.instructions]
          : (bundled?.instructions ? [...bundled.instructions] : []);

        we.exercise = {
          id: def.id,
          name: def.name || bundled?.name || we.exerciseId,
          category: def.category || bundled?.category || 'other',
          equipment: def.equipment || bundled?.equipment || 'other',
          primaryMuscles,
          secondaryMuscles,
          instructions,
          isCustom: Boolean(def.isCustom),
        };
      } else {
        if (we.exercise.name !== undefined && (typeof we.exercise.name !== 'string' || !we.exercise.name.trim())) {
          throw new Error(`Invalid exercise name in ${entityLabel} exercise: ${we.exerciseId}`);
        }
        if (we.exercise.primaryMuscles !== undefined) {
          if (!Array.isArray(we.exercise.primaryMuscles) || we.exercise.primaryMuscles.some((m: any) => typeof m !== 'string')) {
            throw new Error(`Invalid primaryMuscles in ${entityLabel} exercise: ${we.exerciseId}`);
          }
        } else {
          we.exercise.primaryMuscles = (Array.isArray(def.primaryMuscles) && def.primaryMuscles.length > 0)
            ? [...def.primaryMuscles]
            : ((we.exercise as any).targetMuscle ? [(we.exercise as any).targetMuscle] : (bundled?.primaryMuscles ? [...bundled.primaryMuscles] : []));
        }
        if (we.exercise.equipment !== undefined && typeof we.exercise.equipment !== 'string') {
          throw new Error(`Invalid equipment in ${entityLabel} exercise: ${we.exerciseId}`);
        }
        if (we.exercise.category !== undefined && typeof we.exercise.category !== 'string') {
          throw new Error(`Invalid category in ${entityLabel} exercise: ${we.exerciseId}`);
        }
        we.exercise.id = we.exercise.id || def.id;
        we.exercise.name = we.exercise.name || def.name || bundled?.name || we.exerciseId;
        we.exercise.category = we.exercise.category || def.category || bundled?.category || 'other';
        we.exercise.equipment = we.exercise.equipment || def.equipment || bundled?.equipment || 'other';
        we.exercise.secondaryMuscles = Array.isArray(we.exercise.secondaryMuscles)
          ? we.exercise.secondaryMuscles
          : (Array.isArray(def.secondaryMuscles) ? [...def.secondaryMuscles] : (bundled?.secondaryMuscles ? [...bundled.secondaryMuscles] : []));
        we.exercise.instructions = Array.isArray(we.exercise.instructions)
          ? we.exercise.instructions
          : (Array.isArray(def.instructions) ? [...def.instructions] : (bundled?.instructions ? [...bundled.instructions] : []));
        we.exercise.isCustom = we.exercise.isCustom !== undefined ? Boolean(we.exercise.isCustom) : Boolean(def.isCustom);
      }

      if (we.targetReps !== undefined && we.targetReps !== null) {
        if (typeof we.targetReps !== 'string') {
          throw new Error(`Invalid targetReps in ${entityLabel} exercise: ${we.exerciseId}`);
        }
        // Preserve legacy target reps text (e.g. "8 each side") during restore
      }

      if (!Array.isArray(we.sets)) {
        throw new Error(`Invalid sets in ${entityLabel} ${w.id}: expected array`);
      }

      for (const s of we.sets) {
        if (!s || typeof s !== 'object') {
          throw new Error(`Invalid set entry in ${entityLabel} ${w.id}`);
        }
        if (s.id) {
          if (setIds.has(s.id)) {
            throw new Error(`Duplicate set ID in ${entityLabel} ${w.id}: ${s.id}`);
          }
          setIds.add(s.id);
        }

        if (typeof s.weightKg !== 'number' || !isFinite(s.weightKg) || s.weightKg < 0) {
          throw new Error(`Invalid weightKg: ${s.weightKg}`);
        }

        if (typeof s.reps !== 'number' || !isFinite(s.reps) || s.reps < 0) {
          throw new Error(`Invalid reps: ${s.reps}`);
        }

        const validTypes = ['normal', 'warmup', 'drop', 'failure'];
        if (!validTypes.includes(s.type)) {
          throw new Error(`Invalid set type: ${s.type}`);
        }

        if (s.rpe !== undefined && s.rpe !== null) {
          if (typeof s.rpe !== 'number' || !isFinite(s.rpe) || s.rpe < 1 || s.rpe > 10) {
            throw new Error(`Invalid RPE: ${s.rpe}`);
          }
        }
      }
    }
  }

  // Validate workouts
  const workoutIds = new Set<string>();
  for (const w of parsed.workouts) {
    if (!w || typeof w !== 'object' || !w.id || typeof w.id !== 'string') {
      throw new Error('Invalid workout in backup: missing or non-string id');
    }
    if (workoutIds.has(w.id)) {
      throw new Error(`Duplicate workout ID in backup: ${w.id}`);
    }
    workoutIds.add(w.id);

    validateWorkoutStructure(w, knownExercisesMap, 'workout', new Set(parsed.gyms.map((gym: Gym) => gym.id)));
  }

  // Validate drafts
  const draftIds = new Set<string>();
  for (const d of parsed.drafts) {
    if (!d || typeof d !== 'object') {
      throw new Error('Invalid draft in backup: expected object');
    }
    if (!d.workout || typeof d.workout !== 'object' || !d.workout.id || typeof d.workout.id !== 'string') {
      throw new Error('Invalid draft in backup: missing workout or workout.id');
    }
    if (draftIds.has(d.workout.id)) {
      throw new Error(`Duplicate draft ID in backup: ${d.workout.id}`);
    }
    draftIds.add(d.workout.id);

    if (!d.savedAt || isNaN(Date.parse(d.savedAt))) {
      throw new Error(`Invalid timestamp in draft ${d.workout.id}: ${d.savedAt}`);
    }

    if (d.revision !== undefined && d.revision !== null) {
      if (typeof d.revision !== 'number' || !isFinite(d.revision) || d.revision < 0) {
        throw new Error(`Invalid revision in draft ${d.workout.id}: ${d.revision}`);
      }
    }

    if (d.restTimer !== undefined && d.restTimer !== null) {
      if (
        typeof d.restTimer !== 'object' ||
        typeof d.restTimer.endsAt !== 'number' ||
        !isFinite(d.restTimer.endsAt) ||
        typeof d.restTimer.totalSeconds !== 'number' ||
        !isFinite(d.restTimer.totalSeconds) ||
        d.restTimer.totalSeconds < 0
      ) {
        throw new Error(`Invalid restTimer in draft ${d.workout.id}`);
      }
    }

    validateWorkoutStructure(d.workout, knownExercisesMap, 'draft workout', new Set(parsed.gyms.map((gym: Gym) => gym.id)));
  }

  validateScopes(parsed.exerciseGymScopes, parsed.gyms, new Set(knownExercisesMap.keys()));

  return parsed as BackupV3;
}

export async function buildBackupJson(store?: Store): Promise<string> {
  let targetStore = store;
  if (!targetStore) {
    const { getStore } = await import('../database/db');
    targetStore = await getStore();
  }
  const snapshot = await targetStore.readSnapshot();

  const safeSettings: Record<string, string> = {};
  for (const [k, v] of Object.entries(snapshot.settings || {})) {
    if (
      !k.startsWith('schema_') &&
      !k.startsWith('writer_') &&
      !k.startsWith('migration_') &&
      k !== 'writer_lease'
    ) {
      safeSettings[k] = v;
    }
  }

  const backup: BackupV3 = {
    version: 3,
    exportedAt: new Date().toISOString(),
    workouts: snapshot.workouts,
    routines: snapshot.routines,
    exercises: snapshot.exercises,
    drafts: snapshot.drafts,
    settings: safeSettings,
    gyms: snapshot.gyms,
    exerciseGymScopes: snapshot.exerciseGymScopes,
  };

  return JSON.stringify(backup, null, 2);
}
