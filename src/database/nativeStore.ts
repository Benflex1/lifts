import {
  ActiveExercise,
  DualExerciseStats,
  Exercise,
  ExerciseGymScope,
  Gym,
  PreviousSetSuggestion,
  Routine,
  Workout,
  WorkoutHistorySummary,
  WorkoutSet,
} from '../types';
import { DataSnapshot, Store, WorkoutDraft } from './contract';
import { applyMigrations } from './migrations';
import { createWriteQueue } from './writeQueue';
import { smartSearchExercises } from '../utils/search';
import { buildDefaultRoutines } from './seedData';
import { createScopedId } from '../utils/ids';
import { validateTargetReps } from '../workout/sets';
import { DEFAULT_GYM_COLOR, validateGymColor, validateGymDeletion, validateGymName, validateWorkoutGymId } from '../workout/gym-profile';
import { validateExerciseGymScope } from '../workout/gym-scope';
import { CompletedExerciseOccurrence, resolvePreviousSetsForExercise } from '../workout/gym-history';
import { calculateDualExerciseStats } from '../workout/gym-records';
import { validateSnapshotForMerge as validateSharedSnapshotForMerge } from './snapshot-validation';

const defaultExercisesData: Exercise[] = require('./defaultExercises.json');

export interface SqliteDriver {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: any[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

function mapExerciseRow(r: any): Exercise {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    equipment: r.equipment,
    primaryMuscles: JSON.parse(r.primary_muscles || '[]'),
    secondaryMuscles: JSON.parse(r.secondary_muscles || '[]'),
    instructions: JSON.parse(r.instructions || '[]'),
    isCustom: Boolean(r.is_custom),
  };
}

function mapSetRow(s: any): WorkoutSet {
  return {
    id: s.id,
    setNumber: s.set_number,
    type: s.set_type as any,
    weightKg: s.weight_kg,
    reps: s.reps,
    rpe: s.rpe,
    isCompleted: Boolean(s.is_completed),
    completedAt: s.completed_at,
  };
}

function mapGymRow(r: any): Gym {
  return { id: r.id, name: r.name, isDefault: Boolean(r.is_default), color: r.color, createdAt: r.created_at };
}

function mapScopeRow(r: any): ExerciseGymScope {
  const linkedGymIds = r.linked_gym_ids ? JSON.parse(r.linked_gym_ids) : undefined;
  return { exerciseId: r.exercise_id, scopeType: r.scope_type, ...(linkedGymIds ? { linkedGymIds } : {}) };
}

function normalizeDraftPayload(data: string): WorkoutDraft | null {
  try {
    const draft = JSON.parse(data) as WorkoutDraft;
    if (!draft || !draft.workout || typeof draft.workout !== 'object') return null;
    if (!draft.workout.gymId) draft.workout.gymId = 'gym-default';
    return draft;
  } catch (_) {
    return null;
  }
}

function scopesAreIdentical(a: ExerciseGymScope, b: ExerciseGymScope): boolean {
  return a.exerciseId === b.exerciseId && a.scopeType === b.scopeType
    && JSON.stringify([...(a.linkedGymIds || [])].sort()) === JSON.stringify([...(b.linkedGymIds || [])].sort());
}

function canonicalizeSnapshotGyms(snapshot: DataSnapshot): DataSnapshot {
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

function validateSnapshotMergeConflicts(snapshot: DataSnapshot, existing: DataSnapshot): void {
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

export function createNativeStore(driver: SqliteDriver): Store {
  const writeQueue = createWriteQueue();
  let cachedExercises: Exercise[] | null = null;

  async function init(): Promise<void> {
    await applyMigrations(driver);

    // Seed default exercises if not already seeded
    const exSeeded = await driver.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_meta WHERE key = ?',
      'exercises_seeded'
    );

    if (!exSeeded) {
      await seedDefaultExercises();
    }

    // Seed default routines if not already seeded
    const rtSeeded = await driver.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_meta WHERE key = ?',
      'routines_seeded'
    );

    if (!rtSeeded) {
      await seedDefaultRoutines();
    }
  }

  async function getGyms(): Promise<Gym[]> {
    return (await driver.getAllAsync<any>('SELECT * FROM gyms ORDER BY is_default DESC, name ASC')).map(mapGymRow);
  }

  async function getDefaultGym(): Promise<Gym> {
    const row = await driver.getFirstAsync<any>('SELECT * FROM gyms WHERE is_default = 1');
    if (!row) throw new Error('Default gym is missing');
    return mapGymRow(row);
  }

  async function createGym(name: string, color: string = DEFAULT_GYM_COLOR): Promise<Gym> {
    const validName = validateGymName(name);
    const validColor = validateGymColor(color);
    return writeQueue(async () => {
      const gym: Gym = { id: createScopedId('gym'), name: validName, isDefault: false, color: validColor, createdAt: new Date().toISOString() };
      await driver.runAsync('INSERT INTO gyms (id, name, is_default, color, created_at) VALUES (?, ?, 0, ?, ?)', gym.id, gym.name, gym.color, gym.createdAt);
      return gym;
    });
  }

  async function updateGym(id: string, updates: { name?: string; color?: string }): Promise<Gym> {
    const name = updates.name === undefined ? undefined : validateGymName(updates.name);
    const color = updates.color === undefined ? undefined : validateGymColor(updates.color);
    return writeQueue(async () => {
      const current = await driver.getFirstAsync<any>('SELECT * FROM gyms WHERE id = ?', id);
      if (!current) throw new Error(`unknown gym: ${id}`);
      await driver.runAsync('UPDATE gyms SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?', name ?? null, color ?? null, id);
      return mapGymRow(await driver.getFirstAsync<any>('SELECT * FROM gyms WHERE id = ?', id));
    });
  }

  async function setDefaultGym(id: string): Promise<void> {
    return writeQueue(() => driver.withTransactionAsync(async () => {
      if (!await driver.getFirstAsync<any>('SELECT id FROM gyms WHERE id = ?', id)) throw new Error(`unknown gym: ${id}`);
      await driver.runAsync('UPDATE gyms SET is_default = 0');
      await driver.runAsync('UPDATE gyms SET is_default = 1 WHERE id = ?', id);
    }));
  }

  async function deleteGym(id: string, replacementGymId: string, activeWorkoutGymId?: string | null): Promise<void> {
    return writeQueue(() => driver.withTransactionAsync(async () => {
      const gyms = await getGyms();
      validateGymDeletion(id, replacementGymId, gyms, activeWorkoutGymId);
      const deleted = gyms.find(gym => gym.id === id)!;
      if (!gyms.some(gym => gym.id === replacementGymId)) throw new Error(`unknown replacement gym: ${replacementGymId}`);
      await driver.runAsync('UPDATE workouts SET gym_id = ? WHERE gym_id = ?', replacementGymId, id);
      const drafts = await driver.getAllAsync<{ id: string; data: string }>('SELECT id, data FROM workout_drafts');
      for (const row of drafts) {
        const draft = normalizeDraftPayload(row.data);
        if (draft && draft.workout.gymId === id) {
          draft.workout.gymId = replacementGymId;
          await driver.runAsync('UPDATE workout_drafts SET data = ? WHERE id = ?', JSON.stringify(draft), row.id);
        }
      }
      const scopes = await driver.getAllAsync<any>('SELECT * FROM exercise_gym_scopes');
      for (const row of scopes) {
        if (row.scope_type !== 'linked_group') continue;
        const ids = (row.linked_gym_ids ? JSON.parse(row.linked_gym_ids) : []).filter((gymId: string) => gymId !== id);
        if (ids.length === 0) await driver.runAsync('DELETE FROM exercise_gym_scopes WHERE exercise_id = ?', row.exercise_id);
        else if (ids.length < 2) await driver.runAsync('UPDATE exercise_gym_scopes SET scope_type = ?, linked_gym_ids = NULL WHERE exercise_id = ?', 'gym_specific', row.exercise_id);
        else await driver.runAsync('UPDATE exercise_gym_scopes SET linked_gym_ids = ? WHERE exercise_id = ?', JSON.stringify(ids), row.exercise_id);
      }
      if (deleted.isDefault) {
        await driver.runAsync('UPDATE gyms SET is_default = 0');
        await driver.runAsync('UPDATE gyms SET is_default = 1 WHERE id = ?', replacementGymId);
      }
      await driver.runAsync('DELETE FROM gyms WHERE id = ?', id);
    }));
  }

  async function getExerciseGymScopes(): Promise<ExerciseGymScope[]> {
    return (await driver.getAllAsync<any>('SELECT * FROM exercise_gym_scopes ORDER BY exercise_id')).map(mapScopeRow);
  }
  async function getExerciseGymScope(exerciseId: string): Promise<ExerciseGymScope | null> {
    const row = await driver.getFirstAsync<any>('SELECT * FROM exercise_gym_scopes WHERE exercise_id = ?', exerciseId);
    return row ? mapScopeRow(row) : null;
  }
  async function saveExerciseGymScope(scope: ExerciseGymScope): Promise<void> {
    return writeQueue(() => driver.withTransactionAsync(async () => {
      if (!await driver.getFirstAsync<any>('SELECT id FROM exercises WHERE id = ?', scope.exerciseId)) throw new Error(`unknown exercise: ${scope.exerciseId}`);
      const gyms = new Set((await getGyms()).map(gym => gym.id));
      validateExerciseGymScope(scope, gyms);
      await driver.runAsync('INSERT OR REPLACE INTO exercise_gym_scopes (exercise_id, scope_type, linked_gym_ids) VALUES (?, ?, ?)', scope.exerciseId, scope.scopeType, scope.linkedGymIds ? JSON.stringify(scope.linkedGymIds) : null);
    }));
  }
  async function deleteExerciseGymScope(exerciseId: string): Promise<void> {
    return writeQueue(async () => { await driver.runAsync('DELETE FROM exercise_gym_scopes WHERE exercise_id = ?', exerciseId); });
  }

  async function seedDefaultExercises(): Promise<void> {
    const exercises = defaultExercisesData as Exercise[];
    await driver.withTransactionAsync(async () => {
      for (const ex of exercises) {
        await driver.runAsync(
          `INSERT OR IGNORE INTO exercises (id, name, category, equipment, primary_muscles, secondary_muscles, instructions, is_custom)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
          ex.id,
          ex.name,
          ex.category,
          ex.equipment,
          JSON.stringify(ex.primaryMuscles),
          JSON.stringify(ex.secondaryMuscles || []),
          JSON.stringify(ex.instructions || [])
        );
      }
      await driver.runAsync(
        'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
        'exercises_seeded',
        '1'
      );
    });
  }

  async function seedDefaultRoutines(): Promise<void> {
    const defaults = buildDefaultRoutines();

    await driver.withTransactionAsync(async () => {
      for (const r of defaults) {
        await driver.runAsync(
          'INSERT OR IGNORE INTO routines (id, name, folder_name, notes, created_at) VALUES (?, ?, ?, ?, ?)',
          r.id,
          r.name,
          r.folderName || null,
          r.notes || null,
          r.createdAt || new Date().toISOString()
        );

        let order = 0;
        for (const re of r.exercises) {
          await driver.runAsync(
            `INSERT OR IGNORE INTO routine_exercises (id, routine_id, exercise_id, order_index, target_sets, target_reps, rest_timer_seconds)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            re.id || `re-${r.id}-${order}`,
            r.id,
            re.exerciseId,
            order,
            re.targetSets,
            re.targetReps,
            re.restTimerSeconds
          );
          order++;
        }
      }

      await driver.runAsync(
        'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
        'routines_seeded',
        '1'
      );
    });
  }

  async function getAllExercises(): Promise<Exercise[]> {
    if (cachedExercises) return cachedExercises;
    const rows = await driver.getAllAsync<any>('SELECT * FROM exercises ORDER BY name ASC');
    cachedExercises = rows.map(mapExerciseRow);
    return cachedExercises;
  }

  async function searchExercises(query: string = '', muscle: string = 'All', equipment: string = 'All'): Promise<Exercise[]> {
    const all = await getAllExercises();
    return smartSearchExercises(all, query, muscle, equipment);
  }

  async function getExerciseById(id: string): Promise<Exercise | null> {
    const all = await getAllExercises();
    const found = all.find(e => e.id === id);
    if (found) return found;

    const r = await driver.getFirstAsync<any>('SELECT * FROM exercises WHERE id = ?', id);
    if (!r) return null;
    return mapExerciseRow(r);
  }

  async function createCustomExercise(exercise: Omit<Exercise, 'id' | 'isCustom'>): Promise<Exercise> {
    return writeQueue(async () => {
      const newId = (exercise as any).id || createScopedId('custom');
      const customExercise: Exercise = {
        ...exercise,
        id: newId,
        isCustom: true,
      };

      await driver.runAsync(
        `INSERT INTO exercises (id, name, category, equipment, primary_muscles, secondary_muscles, instructions, is_custom)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        customExercise.id,
        customExercise.name,
        customExercise.category,
        customExercise.equipment,
        JSON.stringify(customExercise.primaryMuscles),
        JSON.stringify(customExercise.secondaryMuscles || []),
        JSON.stringify(customExercise.instructions || [])
      );

      cachedExercises = null;
      return customExercise;
    });
  }

  async function getRoutines(): Promise<Routine[]> {
    const routines = await driver.getAllAsync<any>('SELECT * FROM routines ORDER BY created_at DESC');
    const result: Routine[] = [];

    for (const r of routines) {
      const reRows = await driver.getAllAsync<any>(
        `SELECT re.*, e.name as ex_name, e.category as ex_category, e.equipment as ex_equipment,
                e.primary_muscles as ex_primary, e.secondary_muscles as ex_secondary, e.instructions as ex_inst
         FROM routine_exercises re
         JOIN exercises e ON re.exercise_id = e.id
         WHERE re.routine_id = ?
         ORDER BY re.order_index ASC`,
        r.id
      );

      result.push({
        id: r.id,
        name: r.name,
        folderName: r.folder_name,
        notes: r.notes,
        createdAt: r.created_at,
        lastPerformedAt: r.last_performed_at,
        exercises: reRows.map(row => ({
          id: row.id,
          exerciseId: row.exercise_id,
          exercise: {
            id: row.exercise_id,
            name: row.ex_name,
            category: row.ex_category,
            equipment: row.ex_equipment,
            primaryMuscles: JSON.parse(row.ex_primary || '[]'),
            secondaryMuscles: JSON.parse(row.ex_secondary || '[]'),
            instructions: JSON.parse(row.ex_inst || '[]'),
          },
          orderIndex: row.order_index,
          targetSets: row.target_sets,
          targetReps: row.target_reps,
          restTimerSeconds: row.rest_timer_seconds,
        })),
      });
    }

    return result;
  }

  async function getRoutineById(id: string): Promise<Routine | null> {
    const r = await driver.getFirstAsync<any>('SELECT * FROM routines WHERE id = ?', id);
    if (!r) return null;

    const reRows = await driver.getAllAsync<any>(
      `SELECT re.*, e.name as ex_name, e.category as ex_category, e.equipment as ex_equipment,
              e.primary_muscles as ex_primary, e.secondary_muscles as ex_secondary, e.instructions as ex_inst
       FROM routine_exercises re
       JOIN exercises e ON re.exercise_id = e.id
       WHERE re.routine_id = ?
       ORDER BY re.order_index ASC`,
      r.id
    );

    return {
      id: r.id,
      name: r.name,
      folderName: r.folder_name,
      notes: r.notes,
      createdAt: r.created_at,
      lastPerformedAt: r.last_performed_at,
      exercises: reRows.map(row => ({
        id: row.id,
        exerciseId: row.exercise_id,
        exercise: {
          id: row.exercise_id,
          name: row.ex_name,
          category: row.ex_category,
          equipment: row.ex_equipment,
          primaryMuscles: JSON.parse(row.ex_primary || '[]'),
          secondaryMuscles: JSON.parse(row.ex_secondary || '[]'),
          instructions: JSON.parse(row.ex_inst || '[]'),
        },
        orderIndex: row.order_index,
        targetSets: row.target_sets,
        targetReps: row.target_reps,
        restTimerSeconds: row.rest_timer_seconds,
      })),
    };
  }

  async function saveRoutine(
    name: string,
    folderName: string,
    exercises: { exerciseId: string; targetSets: number; targetReps: string; restTimerSeconds: number }[],
    notes?: string,
    existingId?: string
  ): Promise<string> {
    for (const item of exercises) {
      const repVal = validateTargetReps(item.targetReps);
      if (!repVal.isValid) {
        throw new Error(`Invalid target reps for exercise ${item.exerciseId}: ${repVal.error}`);
      }
    }

    return writeQueue(async () => {
      const routineId = existingId || createScopedId('routine');

      await driver.withTransactionAsync(async () => {
        const existing = existingId
          ? await driver.getFirstAsync<{ id: string }>('SELECT id FROM routines WHERE id = ?', existingId)
          : null;

        if (existing) {
          await driver.runAsync(
            'UPDATE routines SET name = ?, folder_name = ?, notes = ? WHERE id = ?',
            name,
            folderName || null,
            notes || null,
            routineId
          );
        } else {
          await driver.runAsync(
            'INSERT INTO routines (id, name, folder_name, notes, created_at) VALUES (?, ?, ?, ?, ?)',
            routineId,
            name,
            folderName || null,
            notes || null,
            new Date().toISOString()
          );
        }

        // Clear existing exercises if updating
        await driver.runAsync('DELETE FROM routine_exercises WHERE routine_id = ?', routineId);

        let order = 0;
        for (const item of exercises) {
          await driver.runAsync(
            `INSERT INTO routine_exercises (id, routine_id, exercise_id, order_index, target_sets, target_reps, rest_timer_seconds)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            `re-${routineId}-${order}`,
            routineId,
            item.exerciseId,
            order,
            item.targetSets,
            item.targetReps,
            item.restTimerSeconds
          );
          order++;
        }
      });

      return routineId;
    });
  }

  async function deleteRoutine(id: string): Promise<void> {
    return writeQueue(async () => {
      await driver.runAsync('DELETE FROM routines WHERE id = ?', id);
    });
  }

  async function duplicateRoutine(routineId: string): Promise<string> {
    return writeQueue(async () => {
      const original = await driver.getFirstAsync<any>('SELECT * FROM routines WHERE id = ?', routineId);
      if (!original) throw new Error('Routine not found');

      const exRows = await driver.getAllAsync<any>(
        'SELECT * FROM routine_exercises WHERE routine_id = ? ORDER BY order_index ASC',
        routineId
      );

      const newId = createScopedId('routine');
      await driver.withTransactionAsync(async () => {
        await driver.runAsync(
          'INSERT INTO routines (id, name, folder_name, notes, created_at) VALUES (?, ?, ?, ?, ?)',
          newId,
          `${original.name} (Copy)`,
          original.folder_name,
          original.notes,
          new Date().toISOString()
        );

        for (let i = 0; i < exRows.length; i++) {
          const e = exRows[i];
          await driver.runAsync(
            `INSERT INTO routine_exercises (id, routine_id, exercise_id, order_index, target_sets, target_reps, rest_timer_seconds)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            `re-${newId}-${i}`,
            newId,
            e.exercise_id,
            e.order_index,
            e.target_sets,
            e.target_reps,
            e.rest_timer_seconds
          );
        }
      });

      return newId;
    });
  }

  async function finishWorkout(workout: Workout): Promise<void> {
    return writeQueue(async () => {
      const gymId = validateWorkoutGymId(workout.gymId, await getGyms());
      await driver.withTransactionAsync(async () => {
        await driver.runAsync(
          `INSERT OR REPLACE INTO workouts (id, routine_id, name, start_time, end_time, duration_seconds, total_volume_kg, notes, in_progress, gym_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          workout.id,
          workout.routineId || null,
          workout.name,
          workout.startTime,
          workout.endTime || new Date().toISOString(),
          workout.durationSeconds,
          workout.totalVolumeKg,
          workout.notes || null,
          gymId
        );

        await driver.runAsync('DELETE FROM workout_exercises WHERE workout_id = ?', workout.id);

        if (workout.routineId) {
          await driver.runAsync(
            `UPDATE routines SET last_performed_at = ? WHERE id = ?`,
            workout.endTime || workout.startTime,
            workout.routineId
          );
        }

        let exOrder = 0;
        for (const ex of workout.exercises) {
          const weId = ex.id || `we-${workout.id}-${exOrder}`;
          await driver.runAsync(
            `INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, notes, rest_timer_seconds, target_reps)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            weId,
            workout.id,
            ex.exerciseId,
            exOrder,
            ex.notes || null,
            ex.restTimerSeconds ?? 0,
            ex.targetReps || null
          );

          for (const s of ex.sets) {
            if (s.isCompleted) {
              await driver.runAsync(
                `INSERT INTO exercise_sets (id, workout_exercise_id, set_number, set_type, weight_kg, reps, rpe, is_completed, completed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                s.id || `set-${weId}-${s.setNumber}`,
                weId,
                s.setNumber,
                s.type,
                s.weightKg,
                s.reps,
                s.rpe || null,
                s.completedAt || new Date().toISOString()
              );
            }
          }
          exOrder++;
        }

        // Delete from workout_drafts within the same transaction!
        await driver.runAsync('DELETE FROM workout_drafts WHERE id = ?', workout.id);
      });
    });
  }

  async function saveCompletedWorkout(workout: Workout): Promise<void> {
    return finishWorkout(workout);
  }

  async function getWorkoutHistory(): Promise<WorkoutHistorySummary[]> {
    const rows = await driver.getAllAsync<any>(
      `SELECT w.*, 
              COUNT(DISTINCT s.id) as total_sets
       FROM workouts w
       LEFT JOIN workout_exercises we ON w.id = we.workout_id
       LEFT JOIN exercise_sets s ON we.id = s.workout_exercise_id AND s.is_completed = 1
       WHERE w.in_progress = 0
       GROUP BY w.id
       ORDER BY w.start_time DESC`
    );

    const namesByWorkout = new Map<string, string[]>();
    const exerciseNameRows = await driver.getAllAsync<{
      workout_id: string;
      name: string;
      first_order: number;
    }>(
      `SELECT we.workout_id, e.name, MIN(we.order_index) AS first_order
       FROM workout_exercises we
       INNER JOIN workouts w ON w.id = we.workout_id AND w.in_progress = 0
       INNER JOIN exercises e ON we.exercise_id = e.id
       GROUP BY we.workout_id, e.name
       ORDER BY we.workout_id ASC, first_order ASC`
    );

    for (const row of exerciseNameRows) {
      const names = namesByWorkout.get(row.workout_id) || [];
      names.push(row.name);
      namesByWorkout.set(row.workout_id, names);
    }

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      routineId: r.routine_id,
      startTime: r.start_time,
      endTime: r.end_time,
      durationSeconds: r.duration_seconds || 0,
      totalVolumeKg: r.total_volume_kg || 0,
      totalSets: r.total_sets || 0,
      exerciseNames: namesByWorkout.get(r.id) || [],
      gymId: r.gym_id || 'gym-default',
      notes: r.notes,
    }));
  }

  async function getWorkoutDetail(workoutId: string): Promise<Workout | null> {
    const w = await driver.getFirstAsync<any>('SELECT * FROM workouts WHERE id = ? AND in_progress = 0', workoutId);
    if (!w) return null;

    const weRows = await driver.getAllAsync<any>(
      `SELECT we.*, e.name as ex_name, e.category as ex_cat, e.equipment as ex_equip, 
              e.primary_muscles as ex_pm, e.secondary_muscles as ex_sm, e.instructions as ex_inst
       FROM workout_exercises we
       JOIN exercises e ON we.exercise_id = e.id
       WHERE we.workout_id = ?
       ORDER BY we.order_index ASC`,
      workoutId
    );

    const exercises: ActiveExercise[] = [];
    for (const we of weRows) {
      const sRows = await driver.getAllAsync<any>(
        `SELECT * FROM exercise_sets WHERE workout_exercise_id = ? ORDER BY set_number ASC`,
        we.id
      );

      exercises.push({
        id: we.id,
        exerciseId: we.exercise_id,
        notes: we.notes,
        targetReps: we.target_reps || undefined,
        restTimerSeconds: we.rest_timer_seconds ?? 0,
        exercise: {
          id: we.exercise_id,
          name: we.ex_name,
          category: we.ex_cat,
          equipment: we.ex_equip,
          primaryMuscles: JSON.parse(we.ex_pm || '[]'),
          secondaryMuscles: JSON.parse(we.ex_sm || '[]'),
          instructions: JSON.parse(we.ex_inst || '[]'),
        },
        sets: sRows.map(mapSetRow),
      });
    }

    return {
      id: w.id,
      name: w.name,
      routineId: w.routine_id,
      startTime: w.start_time,
      endTime: w.end_time,
      durationSeconds: w.duration_seconds || 0,
      totalVolumeKg: w.total_volume_kg || 0,
      gymId: w.gym_id || 'gym-default',
      exercises,
      notes: w.notes,
    };
  }

  async function deleteWorkout(workoutId: string): Promise<void> {
    return writeQueue(async () => {
      await driver.runAsync('DELETE FROM workouts WHERE id = ?', workoutId);
    });
  }

  async function loadCompletedExerciseOccurrences(
    exerciseId: string,
    occurrenceIndex: number,
  ): Promise<CompletedExerciseOccurrence[]> {
    const rows = await driver.getAllAsync<any>(
      `SELECT w.id AS workout_id, w.start_time, w.gym_id, g.name AS gym_name,
              we.id AS occurrence_id, we.order_index, s.weight_kg, s.reps, s.set_number
       FROM workouts w
       JOIN workout_exercises we ON we.workout_id = w.id AND we.exercise_id = ?
       LEFT JOIN exercise_sets s ON s.workout_exercise_id = we.id AND s.is_completed = 1
       LEFT JOIN gyms g ON g.id = w.gym_id
       WHERE w.in_progress = 0
       ORDER BY w.start_time DESC, w.id DESC, we.order_index ASC, s.set_number ASC, s.id ASC`,
      exerciseId,
    );

    const byWorkout = new Map<string, {
      startTime: string;
      gymId: string;
      gymName: string;
      occurrences: Array<{ id: string; sets: Array<{ weightKg: number; reps: number }> }>;
    }>();
    for (const row of rows) {
      const workoutId = row.workout_id as string;
      let workout = byWorkout.get(workoutId);
      if (!workout) {
        workout = {
          startTime: row.start_time,
          gymId: row.gym_id || 'gym-default',
          gymName: row.gym_name || 'Default Gym',
          occurrences: [],
        };
        byWorkout.set(workoutId, workout);
      }
      let occurrence = workout.occurrences.find(item => item.id === row.occurrence_id);
      if (!occurrence) {
        occurrence = { id: row.occurrence_id, sets: [] };
        workout.occurrences.push(occurrence);
      }
      if (row.weight_kg !== null && row.reps !== null) occurrence.sets.push({ weightKg: row.weight_kg, reps: row.reps });
    }

    return Array.from(byWorkout.entries()).map(([workoutId, workout]) => {
      const requested = workout.occurrences[occurrenceIndex];
      const selected = requested?.sets.length ? requested : workout.occurrences.find(occurrence => occurrence.sets.length);
      return {
        workoutId,
        startTime: workout.startTime,
        gymId: workout.gymId,
        gymName: workout.gymName,
        occurrenceIndex: requested?.sets.length ? occurrenceIndex : Math.max(0, workout.occurrences.indexOf(selected!)),
        sets: selected?.sets || [],
      };
    });
  }

  async function getPreviousSetsForExercise(
    exerciseId: string,
    occurrenceIndex: number = 0,
    currentGymId?: string,
  ): Promise<PreviousSetSuggestion[]> {
    const exercise = await getExerciseById(exerciseId);
    if (!exercise) return [];
    const gymId = currentGymId || (await getDefaultGym()).id;
    const occurrences = await loadCompletedExerciseOccurrences(exerciseId, occurrenceIndex);
    const scope = await getExerciseGymScope(exerciseId);
    return resolvePreviousSetsForExercise(exercise, occurrences, gymId, scope || undefined);
  }

  async function loadCompletedWorkoutsForExercise(exerciseId: string): Promise<Workout[]> {
    const exercise = await getExerciseById(exerciseId);
    if (!exercise) return [];
    const rows = await driver.getAllAsync<any>(
      `SELECT w.id, w.name, w.routine_id, w.start_time, w.end_time, w.duration_seconds,
              w.total_volume_kg, w.notes, w.gym_id, g.name AS gym_name,
              we.id AS occurrence_id, we.order_index, we.notes AS occurrence_notes,
              we.rest_timer_seconds, we.target_reps, s.id AS set_id, s.set_number,
              s.set_type, s.weight_kg, s.reps, s.rpe, s.completed_at
       FROM workouts w
       JOIN workout_exercises we ON we.workout_id = w.id AND we.exercise_id = ?
       JOIN exercise_sets s ON s.workout_exercise_id = we.id AND s.is_completed = 1
       LEFT JOIN gyms g ON g.id = w.gym_id
       WHERE w.in_progress = 0
       ORDER BY w.start_time DESC, w.id DESC, we.order_index ASC, s.set_number ASC`,
      exerciseId,
    );
    const workouts = new Map<string, Workout>();
    for (const row of rows) {
      let workout = workouts.get(row.id);
      if (!workout) {
        workout = {
          id: row.id,
          name: row.name,
          routineId: row.routine_id || undefined,
          gymId: row.gym_id || 'gym-default',
          startTime: row.start_time,
          endTime: row.end_time || undefined,
          durationSeconds: row.duration_seconds || 0,
          totalVolumeKg: row.total_volume_kg || 0,
          exercises: [],
          notes: row.notes || undefined,
        };
        workouts.set(row.id, workout);
      }
      let occurrence = workout.exercises.find(item => item.id === row.occurrence_id);
      if (!occurrence) {
        occurrence = {
          id: row.occurrence_id,
          exerciseId,
          exercise,
          restTimerSeconds: row.rest_timer_seconds ?? 0,
          notes: row.occurrence_notes || undefined,
          targetReps: row.target_reps || undefined,
          sets: [],
        };
        workout.exercises.push(occurrence);
      }
      occurrence.sets.push({
        id: row.set_id,
        setNumber: row.set_number,
        type: row.set_type,
        weightKg: row.weight_kg,
        reps: row.reps,
        rpe: row.rpe,
        isCompleted: true,
        completedAt: row.completed_at,
      });
    }
    return Array.from(workouts.values());
  }

  async function getExerciseStats(exerciseId: string, currentGymId: string): Promise<DualExerciseStats> {
    const workouts = await loadCompletedWorkoutsForExercise(exerciseId);
    const scope = await getExerciseGymScope(exerciseId);
    return calculateDualExerciseStats(workouts, exerciseId, currentGymId, scope || undefined);
  }

  async function saveDraft(draft: WorkoutDraft): Promise<void> {
    return writeQueue(async () => {
      if (!draft.workout.gymId) draft.workout.gymId = (await getDefaultGym()).id;
      await driver.runAsync(
        `INSERT OR REPLACE INTO workout_drafts (id, revision, saved_at, rest_timer_ends_at, rest_timer_total_seconds, data)
         VALUES (?, ?, ?, ?, ?, ?)`,
        draft.workout.id,
        draft.revision,
        draft.savedAt,
        draft.restTimer ? draft.restTimer.endsAt : null,
        draft.restTimer ? draft.restTimer.totalSeconds : null,
        JSON.stringify(draft)
      );
    });
  }

  async function getWorkoutDrafts(): Promise<WorkoutDraft[]> {
    const rows = await driver.getAllAsync<{ data: string }>(
      'SELECT data FROM workout_drafts ORDER BY saved_at DESC'
    );
    const drafts: WorkoutDraft[] = [];
    for (const r of rows) {
      try {
        const draft = normalizeDraftPayload(r.data);
        if (draft) drafts.push(draft);
      } catch (_) {}
    }
    return drafts;
  }

  async function getWorkoutDraft(id?: string): Promise<WorkoutDraft | null> {
    if (id) {
      const row = await driver.getFirstAsync<{ data: string }>(
        'SELECT data FROM workout_drafts WHERE id = ?',
        id
      );
      if (!row) return null;
      try {
        return normalizeDraftPayload(row.data);
      } catch (_) {
        return null;
      }
    }

    const row = await driver.getFirstAsync<{ data: string }>(
      'SELECT data FROM workout_drafts ORDER BY saved_at DESC LIMIT 1'
    );
    if (!row) return null;
    try {
      return normalizeDraftPayload(row.data);
    } catch (_) {
      return null;
    }
  }

  async function discardDraft(id: string): Promise<void> {
    return writeQueue(async () => {
      await driver.runAsync('DELETE FROM workout_drafts WHERE id = ?', id);
    });
  }

  async function getSetting(key: string): Promise<string | null> {
    const row = await driver.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      key
    );
    return row?.value ?? null;
  }

  async function setSetting(key: string, value: string): Promise<void> {
    return writeQueue(async () => {
      await driver.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        key,
        value
      );
    });
  }

  async function renameFolder(oldName: string, newName: string): Promise<void> {
    return writeQueue(async () => {
      await driver.runAsync('UPDATE routines SET folder_name = ? WHERE folder_name = ?', newName, oldName);
    });
  }

  async function deleteFolder(name: string): Promise<void> {
    return writeQueue(async () => {
      await driver.runAsync('UPDATE routines SET folder_name = NULL WHERE folder_name = ?', name);
    });
  }

  async function readSnapshot(): Promise<DataSnapshot> {
    const history = await getWorkoutHistory();
    const workouts: Workout[] = [];
    for (const h of history) {
      const detail = await getWorkoutDetail(h.id);
      if (detail) workouts.push(detail);
    }

    const routines = await getRoutines();
    const exercises = await getAllExercises();
    const drafts = await getWorkoutDrafts();

    const settingRows = await driver.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
    const settings: Record<string, string> = {};
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }

    return {
      workouts,
      routines,
      exercises,
      drafts,
      settings,
      gyms: await getGyms(),
      exerciseGymScopes: await getExerciseGymScopes(),
    };
  }

  async function mergeSnapshot(snapshot: DataSnapshot): Promise<void> {
    return writeQueue(async () => {
      snapshot = canonicalizeSnapshotGyms(snapshot);
      const existing = await readSnapshot();
      validateSharedSnapshotForMerge(snapshot, existing);
      validateSnapshotMergeConflicts(snapshot, existing);
      await driver.withTransactionAsync(async () => {
        for (const gym of snapshot.gyms || []) {
          await driver.runAsync(
            `INSERT OR IGNORE INTO gyms (id, name, is_default, color, created_at) VALUES (?, ?, 0, ?, ?)`,
            gym.id, gym.name, gym.color, gym.createdAt
          );
        }

        // Exercises must precede scopes because scopes have an exercise foreign key.
        for (const ex of snapshot.exercises) {
          await driver.runAsync(
            `INSERT INTO exercises (id, name, category, equipment, primary_muscles, secondary_muscles, instructions, is_custom)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category,
               equipment = excluded.equipment, primary_muscles = excluded.primary_muscles,
               secondary_muscles = excluded.secondary_muscles, instructions = excluded.instructions,
               is_custom = excluded.is_custom`,
            ex.id,
            ex.name,
            ex.category,
            ex.equipment,
            JSON.stringify(ex.primaryMuscles),
            JSON.stringify(ex.secondaryMuscles || []),
            JSON.stringify(ex.instructions || []),
            ex.isCustom ? 1 : 0
          );
        }

        for (const scope of snapshot.exerciseGymScopes || []) {
          if ((await driver.getFirstAsync<any>('SELECT exercise_id FROM exercise_gym_scopes WHERE exercise_id = ?', scope.exerciseId))) {
            continue;
          }
          await driver.runAsync(
            'INSERT OR REPLACE INTO exercise_gym_scopes (exercise_id, scope_type, linked_gym_ids) VALUES (?, ?, ?)',
            scope.exerciseId, scope.scopeType, scope.linkedGymIds ? JSON.stringify(scope.linkedGymIds) : null
          );
        }

        // Merge routines
        for (const rt of snapshot.routines) {
          await driver.runAsync(
            `INSERT OR REPLACE INTO routines (id, name, folder_name, notes, created_at, last_performed_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            rt.id,
            rt.name,
            rt.folderName || null,
            rt.notes || null,
            rt.createdAt,
            rt.lastPerformedAt || null
          );
          await driver.runAsync('DELETE FROM routine_exercises WHERE routine_id = ?', rt.id);
          for (const re of rt.exercises) {
            await driver.runAsync(
              `INSERT INTO routine_exercises (id, routine_id, exercise_id, order_index, target_sets, target_reps, rest_timer_seconds)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              re.id,
              rt.id,
              re.exerciseId,
              re.orderIndex,
              re.targetSets,
              re.targetReps,
              re.restTimerSeconds
            );
          }
        }

        // Merge workouts
        for (const w of snapshot.workouts) {
          await driver.runAsync(
            `INSERT OR REPLACE INTO workouts (id, routine_id, name, start_time, end_time, duration_seconds, total_volume_kg, notes, in_progress, gym_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            w.id,
            w.routineId || null,
            w.name,
            w.startTime,
            w.endTime || null,
            w.durationSeconds,
            w.totalVolumeKg,
            w.notes || null,
            w.gymId || 'gym-default'
          );
          await driver.runAsync('DELETE FROM workout_exercises WHERE workout_id = ?', w.id);
          let ord = 0;
          for (const we of w.exercises) {
            const weId = we.id || `we-${w.id}-${ord}`;
            await driver.runAsync(
              `INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, notes, rest_timer_seconds, target_reps)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              weId,
              w.id,
              we.exerciseId,
              ord,
              we.notes || null,
              we.restTimerSeconds ?? 0,
              we.targetReps || null
            );
            for (const s of we.sets) {
              await driver.runAsync(
                `INSERT INTO exercise_sets (id, workout_exercise_id, set_number, set_type, weight_kg, reps, rpe, is_completed, completed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                s.id || `set-${weId}-${s.setNumber}`,
                weId,
                s.setNumber,
                s.type,
                s.weightKg,
                s.reps,
                s.rpe || null,
                s.isCompleted ? 1 : 0,
                s.completedAt || null
              );
            }
            ord++;
          }
        }

        // Merge drafts
        for (const draft of snapshot.drafts) {
          await driver.runAsync(
            `INSERT OR REPLACE INTO workout_drafts (id, revision, saved_at, rest_timer_ends_at, rest_timer_total_seconds, data)
             VALUES (?, ?, ?, ?, ?, ?)`,
            draft.workout.id,
            draft.revision,
            draft.savedAt,
            draft.restTimer ? draft.restTimer.endsAt : null,
            draft.restTimer ? draft.restTimer.totalSeconds : null,
            JSON.stringify({ ...draft, workout: { ...draft.workout, gymId: draft.workout.gymId || 'gym-default' } })
          );
        }

        // Merge settings (only missing keys)
        for (const [k, v] of Object.entries(snapshot.settings)) {
          await driver.runAsync(
            'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
            k,
            v
          );
        }
      });
      cachedExercises = null;
    });
  }

  return {
    init,
    isReadOnly: () => false,
    tryAcquireLease: async () => true,
    readSnapshot,
    saveDraft,
    getWorkoutDrafts,
    getWorkoutDraft,
    finishWorkout,
    discardDraft,
    mergeSnapshot,
    getRoutines,
    saveRoutine,
    deleteRoutine,
    duplicateRoutine,
    getRoutineById,
    saveCompletedWorkout,
    getWorkoutHistory,
    getWorkoutDetail,
    deleteWorkout,
    getGyms,
    getDefaultGym,
    createGym,
    updateGym,
    setDefaultGym,
    deleteGym,
    getExerciseGymScopes,
    getExerciseGymScope,
    saveExerciseGymScope,
    deleteExerciseGymScope,
    getPreviousSetsForExercise,
    getExerciseStats,
    getAllExercises,
    searchExercises,
    getExerciseById,
    createCustomExercise,
    getSetting,
    setSetting,
    renameFolder,
    deleteFolder,
  } as unknown as Store;
}
