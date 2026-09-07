import { DataSnapshot, Store } from '../database/contract';
import { DEFAULT_EXERCISES } from '../database/seedData';
import { Exercise, Routine, Workout, WorkoutSet } from '../types';

export const MAX_BACKUP_SIZE_BYTES = 50 * 1024 * 1024; // 50 MiB

export interface BackupV2 extends DataSnapshot {
  version: 2;
  exportedAt: string;
}

export function parseBackup(json: string): BackupV2 {
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

  if (parsed.version !== 2) {
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
  if (!parsed.settings || typeof parsed.settings !== 'object') {
    throw new Error('Invalid settings format: expected object');
  }

  // Set of available exercise IDs: bundled seed exercises + backup exercises
  const knownExerciseIds = new Set<string>();
  for (const de of DEFAULT_EXERCISES) {
    knownExerciseIds.add(de.id);
  }
  const exerciseIdsInBackup = new Set<string>();
  for (const ex of parsed.exercises) {
    if (!ex.id || typeof ex.id !== 'string') {
      throw new Error('Invalid exercise in backup: missing or non-string id');
    }
    if (exerciseIdsInBackup.has(ex.id)) {
      throw new Error(`Duplicate exercise ID in backup: ${ex.id}`);
    }
    exerciseIdsInBackup.add(ex.id);
    knownExerciseIds.add(ex.id);
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

    if (Array.isArray(r.exercises)) {
      for (const re of r.exercises) {
        if (!knownExerciseIds.has(re.exerciseId)) {
          throw new Error(`Missing exercise definition for routine exercise: ${re.exerciseId}`);
        }
      }
    }
  }

  function validateWorkoutStructure(
    w: any,
    knownExerciseIds: Set<string>,
    entityLabel: string
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
      if (!knownExerciseIds.has(we.exerciseId)) {
        throw new Error(`Missing exercise definition for ${entityLabel} exercise: ${we.exerciseId}`);
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

    validateWorkoutStructure(w, knownExerciseIds, 'workout');
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

    validateWorkoutStructure(d.workout, knownExerciseIds, 'draft workout');
  }

  return parsed as BackupV2;
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

  const backup: BackupV2 = {
    version: 2,
    exportedAt: new Date().toISOString(),
    workouts: snapshot.workouts,
    routines: snapshot.routines,
    exercises: snapshot.exercises,
    drafts: snapshot.drafts,
    settings: safeSettings,
  };

  return JSON.stringify(backup, null, 2);
}
