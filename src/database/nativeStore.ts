import { ActiveExercise, Exercise, Routine, Workout, WorkoutHistorySummary, WorkoutSet } from '../types';
import { DataSnapshot, Store, WorkoutDraft } from './contract';
import { applyMigrations } from './migrations';
import { createWriteQueue } from './writeQueue';
import { smartSearchExercises } from '../utils/search';
import { buildDefaultRoutines } from './seedData';
import { calculate1RM } from '../utils/calculator';
import { createScopedId } from '../utils/ids';
import { validateTargetReps } from '../workout/sets';

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
      await driver.withTransactionAsync(async () => {
        await driver.runAsync(
          `INSERT OR REPLACE INTO workouts (id, routine_id, name, start_time, end_time, duration_seconds, total_volume_kg, notes, in_progress)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          workout.id,
          workout.routineId || null,
          workout.name,
          workout.startTime,
          workout.endTime || new Date().toISOString(),
          workout.durationSeconds,
          workout.totalVolumeKg,
          workout.notes || null
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
              COUNT(DISTINCT s.id) as total_sets,
              GROUP_CONCAT(DISTINCT e.name) as exercise_names
       FROM workouts w
       LEFT JOIN workout_exercises we ON w.id = we.workout_id
       LEFT JOIN exercises e ON we.exercise_id = e.id
       LEFT JOIN exercise_sets s ON we.id = s.workout_exercise_id AND s.is_completed = 1
       WHERE w.in_progress = 0
       GROUP BY w.id
       ORDER BY w.start_time DESC`
    );

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      routineId: r.routine_id,
      startTime: r.start_time,
      endTime: r.end_time,
      durationSeconds: r.duration_seconds || 0,
      totalVolumeKg: r.total_volume_kg || 0,
      totalSets: r.total_sets || 0,
      exerciseNames: r.exercise_names ? r.exercise_names.split(',') : [],
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
      exercises,
      notes: w.notes,
    };
  }

  async function deleteWorkout(workoutId: string): Promise<void> {
    return writeQueue(async () => {
      await driver.runAsync('DELETE FROM workouts WHERE id = ?', workoutId);
    });
  }

  async function getPreviousSetsForExercise(exerciseId: string, occurrenceIndex: number = 0): Promise<WorkoutSet[]> {
    const latestWorkout = await driver.getFirstAsync<{ id: string }>(
      `SELECT w.id FROM workouts w
       JOIN workout_exercises we ON we.workout_id = w.id
       JOIN exercise_sets s ON s.workout_exercise_id = we.id
       WHERE we.exercise_id = ? AND w.in_progress = 0 AND s.is_completed = 1
       ORDER BY w.start_time DESC
       LIMIT 1`,
      exerciseId
    );

    if (!latestWorkout) return [];

    const occurrences = await driver.getAllAsync<{ id: string }>(
      `SELECT id FROM workout_exercises
       WHERE workout_id = ? AND exercise_id = ?
       ORDER BY order_index ASC`,
      latestWorkout.id,
      exerciseId
    );

    if (occurrences.length === 0) return [];

    const targetWeId = occurrences[occurrenceIndex]?.id || occurrences[0].id;
    let rows = await driver.getAllAsync<any>(
      `SELECT * FROM exercise_sets
       WHERE workout_exercise_id = ? AND is_completed = 1
       ORDER BY set_number ASC`,
      targetWeId
    );

    if (rows.length === 0) {
      for (const occ of occurrences) {
        rows = await driver.getAllAsync<any>(
          `SELECT * FROM exercise_sets
           WHERE workout_exercise_id = ? AND is_completed = 1
           ORDER BY set_number ASC`,
          occ.id
        );
        if (rows.length > 0) break;
      }
    }

    return rows.map(mapSetRow);
  }

  async function getExerciseStats(exerciseId: string): Promise<{
    maxWeightKg: number;
    maxReps: number;
    estimated1RM: number;
    sessionCount: number;
  }> {
    const countRow = await driver.getFirstAsync<any>(
      `SELECT COUNT(DISTINCT we.workout_id) as count
       FROM workout_exercises we
       JOIN workouts w ON we.workout_id = w.id
       JOIN exercise_sets s ON s.workout_exercise_id = we.id
       WHERE we.exercise_id = ? AND w.in_progress = 0 AND s.is_completed = 1`,
      exerciseId
    );

    const setsRows = await driver.getAllAsync<any>(
      `SELECT s.weight_kg, s.reps
       FROM exercise_sets s
       JOIN workout_exercises we ON s.workout_exercise_id = we.id
       JOIN workouts w ON we.workout_id = w.id
       WHERE we.exercise_id = ? AND s.is_completed = 1 AND w.in_progress = 0`,
      exerciseId
    );

    let maxWeightKg = 0;
    let maxReps = 0;
    let estimated1RM = 0;

    for (const s of setsRows) {
      if (s.weight_kg > maxWeightKg) maxWeightKg = s.weight_kg;
      if (s.reps > maxReps) maxReps = s.reps;
      const oneRM = calculate1RM(s.weight_kg, s.reps).average;
      if (oneRM > estimated1RM) estimated1RM = oneRM;
    }

    return {
      maxWeightKg,
      maxReps,
      estimated1RM,
      sessionCount: countRow?.count || 0,
    };
  }

  async function saveDraft(draft: WorkoutDraft): Promise<void> {
    return writeQueue(async () => {
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
        drafts.push(JSON.parse(r.data));
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
        return JSON.parse(row.data);
      } catch (_) {
        return null;
      }
    }

    const row = await driver.getFirstAsync<{ data: string }>(
      'SELECT data FROM workout_drafts ORDER BY saved_at DESC LIMIT 1'
    );
    if (!row) return null;
    try {
      return JSON.parse(row.data);
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
    };
  }

  async function mergeSnapshot(snapshot: DataSnapshot): Promise<void> {
    return writeQueue(async () => {
      await driver.withTransactionAsync(async () => {
        // Merge exercises
        for (const ex of snapshot.exercises) {
          await driver.runAsync(
            `INSERT OR REPLACE INTO exercises (id, name, category, equipment, primary_muscles, secondary_muscles, instructions, is_custom)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
            `INSERT OR REPLACE INTO workouts (id, routine_id, name, start_time, end_time, duration_seconds, total_volume_kg, notes, in_progress)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            w.id,
            w.routineId || null,
            w.name,
            w.startTime,
            w.endTime || null,
            w.durationSeconds,
            w.totalVolumeKg,
            w.notes || null
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
            JSON.stringify(draft)
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
  };
}
