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

  // Validate workouts
  const workoutIds = new Set<string>();
  for (const w of parsed.workouts) {
    if (!w.id || typeof w.id !== 'string') {
      throw new Error('Invalid workout in backup: missing or non-string id');
    }
    if (workoutIds.has(w.id)) {
      throw new Error(`Duplicate workout ID in backup: ${w.id}`);
    }
    workoutIds.add(w.id);

    if (!w.startTime || isNaN(Date.parse(w.startTime))) {
      throw new Error(`Invalid timestamp in workout ${w.id}: ${w.startTime}`);
    }
    if (w.endTime && isNaN(Date.parse(w.endTime))) {
      throw new Error(`Invalid timestamp in workout ${w.id}: ${w.endTime}`);
    }

    const setIds = new Set<string>();
    if (Array.isArray(w.exercises)) {
      for (const we of w.exercises) {
        if (!knownExerciseIds.has(we.exerciseId)) {
          throw new Error(`Missing exercise definition for workout exercise: ${we.exerciseId}`);
        }

        if (Array.isArray(we.sets)) {
          for (const s of we.sets) {
            if (s.id) {
              if (setIds.has(s.id)) {
                throw new Error(`Duplicate set ID in workout ${w.id}: ${s.id}`);
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
    }
  }

  // Validate drafts
  const draftIds = new Set<string>();
  for (const d of parsed.drafts) {
    if (!d.workout || !d.workout.id) {
      throw new Error('Invalid draft in backup: missing workout or workout.id');
    }
    if (draftIds.has(d.workout.id)) {
      throw new Error(`Duplicate draft ID in backup: ${d.workout.id}`);
    }
    draftIds.add(d.workout.id);
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
