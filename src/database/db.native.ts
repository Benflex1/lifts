import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import defaultExercisesData from './defaultExercises.json';
import { Exercise, Routine, Workout, WorkoutHistorySummary, WorkoutSet } from '../types';

let dbInstance: SQLite.SQLiteDatabase | null = null;

// In-memory fallback for web preview
const webStorage = {
  exercises: [] as Exercise[],
  routines: [] as Routine[],
  workouts: [] as Workout[],
};

export async function getDatabase(): Promise<SQLite.SQLiteDatabase | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('lifts.db');
  }
  return dbInstance;
}

export async function initDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    initWebStorage();
    return;
  }

  const db = await getDatabase();
  if (!db) return;

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      equipment TEXT NOT NULL,
      primary_muscles TEXT NOT NULL,
      secondary_muscles TEXT,
      instructions TEXT,
      is_custom INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder_name TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_performed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS routine_exercises (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      target_sets INTEGER DEFAULT 3,
      target_reps TEXT DEFAULT '8-12',
      rest_timer_seconds INTEGER DEFAULT 90,
      FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      routine_id TEXT,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_seconds INTEGER DEFAULT 0,
      total_volume_kg REAL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS workout_exercises (
      id TEXT PRIMARY KEY,
      workout_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      notes TEXT,
      rest_timer_seconds INTEGER DEFAULT 90,
      FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );

    CREATE TABLE IF NOT EXISTS exercise_sets (
      id TEXT PRIMARY KEY,
      workout_exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      set_type TEXT NOT NULL DEFAULT 'normal',
      weight_kg REAL NOT NULL DEFAULT 0,
      reps INTEGER NOT NULL DEFAULT 0,
      rpe REAL,
      is_completed INTEGER DEFAULT 0,
      completed_at TEXT,
      FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE
    );
  `);

  // Check if exercises need seeding
  const seeded = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    'exercises_seeded'
  );

  if (!seeded) {
    await seedDefaultData(db);
  }
}

async function seedDefaultData(db: SQLite.SQLiteDatabase) {
  // Batch insert exercises in transactions of 100
  const exercises = defaultExercisesData as Exercise[];
  
  await db.withTransactionAsync(async () => {
    for (const ex of exercises) {
      await db.runAsync(
        `INSERT OR REPLACE INTO exercises (id, name, category, equipment, primary_muscles, secondary_muscles, instructions, is_custom)
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

    // Seed default template routines (Push, Pull, Legs, StrongLifts)
    const pushId = 'routine-push';
    await db.runAsync(
      `INSERT OR REPLACE INTO routines (id, name, folder_name, notes) VALUES (?, ?, ?, ?)`,
      pushId,
      'Push Day (Chest / Shoulders / Triceps)',
      'Push Pull Legs',
      'Focus on progressive overload on bench press.'
    );

    // Add exercises to Push Day
    const pushExercises = [
      { id: 'Barbell_Bench_Press_-_Medium_Grip', sets: 4, reps: '6-8', rest: 120 },
      { id: 'Incline_Dumbbell_Press', sets: 3, reps: '8-10', rest: 90 },
      { id: 'Standing_Military_Press', sets: 3, reps: '8-10', rest: 120 },
      { id: 'Side_Lateral_Raise', sets: 3, reps: '12-15', rest: 60 },
      { id: 'Triceps_Pushdown', sets: 3, reps: '10-12', rest: 60 },
    ];

    let order = 0;
    for (const item of pushExercises) {
      // Find matching exercise or fallback to first matching name
      await db.runAsync(
        `INSERT OR REPLACE INTO routine_exercises (id, routine_id, exercise_id, order_index, target_sets, target_reps, rest_timer_seconds)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        `re-${pushId}-${order}`,
        pushId,
        item.id,
        order,
        item.sets,
        item.reps,
        item.rest
      );
      order++;
    }

    const pullId = 'routine-pull';
    await db.runAsync(
      `INSERT OR REPLACE INTO routines (id, name, folder_name, notes) VALUES (?, ?, ?, ?)`,
      pullId,
      'Pull Day (Back & Biceps)',
      'Push Pull Legs',
      'Focus on controlled back contraction and lat engagement.'
    );

    const pullExercises = [
      { id: 'Barbell_Deadlift', sets: 3, reps: '5', rest: 180 },
      { id: 'Pullups', sets: 3, reps: '8-10', rest: 90 },
      { id: 'Bent_Over_Barbell_Row', sets: 3, reps: '8-10', rest: 90 },
      { id: 'Dumbbell_Bicep_Curl', sets: 3, reps: '10-12', rest: 60 },
      { id: 'Face_Pull', sets: 3, reps: '12-15', rest: 60 },
    ];

    order = 0;
    for (const item of pullExercises) {
      await db.runAsync(
        `INSERT OR REPLACE INTO routine_exercises (id, routine_id, exercise_id, order_index, target_sets, target_reps, rest_timer_seconds)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        `re-${pullId}-${order}`,
        pullId,
        item.id,
        order,
        item.sets,
        item.reps,
        item.rest
      );
      order++;
    }

    const legsId = 'routine-legs';
    await db.runAsync(
      `INSERT OR REPLACE INTO routines (id, name, folder_name, notes) VALUES (?, ?, ?, ?)`,
      legsId,
      'Leg Day (Quads, Hamstrings & Calves)',
      'Push Pull Legs',
      'Keep core braced throughout squats.'
    );

    const legExercises = [
      { id: 'Barbell_Full_Squat', sets: 4, reps: '6-8', rest: 150 },
      { id: 'Romanian_Deadlift', sets: 3, reps: '8-10', rest: 90 },
      { id: 'Leg_Press', sets: 3, reps: '10-12', rest: 90 },
      { id: 'Standing_Calf_Raises', sets: 4, reps: '12-15', rest: 60 },
    ];

    order = 0;
    for (const item of legExercises) {
      await db.runAsync(
        `INSERT OR REPLACE INTO routine_exercises (id, routine_id, exercise_id, order_index, target_sets, target_reps, rest_timer_seconds)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        `re-${legsId}-${order}`,
        legsId,
        item.id,
        order,
        item.sets,
        item.reps,
        item.rest
      );
      order++;
    }

    // Mark as seeded
    await db.runAsync(
      `INSERT OR REPLACE INTO app_meta (key, value) VALUES ('exercises_seeded', '1')`
    );
  });
}

function initWebStorage() {
  webStorage.exercises = (defaultExercisesData as Exercise[]).slice(0, 300);
  webStorage.routines = [
    {
      id: 'routine-push',
      name: 'Push Day (Chest / Shoulders / Triceps)',
      folderName: 'Push Pull Legs',
      notes: 'Focus on progressive overload on bench press.',
      createdAt: new Date().toISOString(),
      exercises: [
        {
          id: 're-1',
          exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
          exercise: webStorage.exercises.find(e => e.id.includes('Bench')) || webStorage.exercises[0],
          orderIndex: 0,
          targetSets: 4,
          targetReps: '6-8',
          restTimerSeconds: 120,
        },
      ],
    },
    {
      id: 'routine-pull',
      name: 'Pull Day (Back & Biceps)',
      folderName: 'Push Pull Legs',
      notes: 'Focus on controlled back contraction.',
      createdAt: new Date().toISOString(),
      exercises: [],
    },
    {
      id: 'routine-legs',
      name: 'Leg Day (Quads, Hamstrings & Calves)',
      folderName: 'Push Pull Legs',
      notes: 'Keep core braced throughout squats.',
      createdAt: new Date().toISOString(),
      exercises: [],
    },
    {
      id: 'routine-upper',
      name: 'Upper Body Power',
      folderName: 'Upper / Lower',
      notes: 'Heavy compounds for upper torso.',
      createdAt: new Date().toISOString(),
      exercises: [],
    },
    {
      id: 'routine-lower',
      name: 'Lower Body Strength',
      folderName: 'Upper / Lower',
      notes: 'Squats and hip hinges.',
      createdAt: new Date().toISOString(),
      exercises: [],
    },
  ];
}

// ==========================================
// EXERCISE QUERIES
// ==========================================

export async function searchExercises(query: string, muscle?: string, equipment?: string): Promise<Exercise[]> {
  if (Platform.OS === 'web') {
    let list = webStorage.exercises;
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(q));
    }
    if (muscle && muscle !== 'All') {
      const m = muscle.toLowerCase();
      list = list.filter(e => e.primaryMuscles.some(pm => pm.toLowerCase().includes(m)));
    }
    if (equipment && equipment !== 'All') {
      const eq = equipment.toLowerCase();
      list = list.filter(e => e.equipment.toLowerCase().includes(eq));
    }
    return list.slice(0, 100);
  }

  const db = await getDatabase();
  if (!db) return [];

  let sql = 'SELECT * FROM exercises WHERE 1=1';
  const params: any[] = [];

  if (query.trim()) {
    sql += ' AND name LIKE ?';
    params.push(`%${query.trim()}%`);
  }
  if (muscle && muscle !== 'All') {
    sql += ' AND primary_muscles LIKE ?';
    params.push(`%${muscle.toLowerCase()}%`);
  }
  if (equipment && equipment !== 'All') {
    sql += ' AND equipment LIKE ?';
    params.push(`%${equipment.toLowerCase()}%`);
  }

  sql += ' ORDER BY name ASC LIMIT 100';

  const rows = await db.getAllAsync<any>(sql, params);
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    category: r.category,
    equipment: r.equipment,
    primaryMuscles: JSON.parse(r.primary_muscles || '[]'),
    secondaryMuscles: JSON.parse(r.secondary_muscles || '[]'),
    instructions: JSON.parse(r.instructions || '[]'),
    isCustom: Boolean(r.is_custom),
  }));
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  if (Platform.OS === 'web') {
    return webStorage.exercises.find(e => e.id === id) || null;
  }
  const db = await getDatabase();
  if (!db) return null;

  const r = await db.getFirstAsync<any>('SELECT * FROM exercises WHERE id = ?', id);
  if (!r) return null;

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

export async function createCustomExercise(exercise: Omit<Exercise, 'id' | 'isCustom'>): Promise<Exercise> {
  const newId = `custom-${Date.now()}`;
  const customExercise: Exercise = {
    ...exercise,
    id: newId,
    isCustom: true,
  };

  if (Platform.OS === 'web') {
    webStorage.exercises.unshift(customExercise);
    return customExercise;
  }

  const db = await getDatabase();
  if (db) {
    await db.runAsync(
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
  }
  return customExercise;
}

// ==========================================
// ROUTINE QUERIES (UNLIMITED ROUTINES)
// ==========================================

export async function getRoutines(): Promise<Routine[]> {
  if (Platform.OS === 'web') {
    return webStorage.routines;
  }

  const db = await getDatabase();
  if (!db) return [];

  const routines = await db.getAllAsync<any>('SELECT * FROM routines ORDER BY created_at DESC');
  const result: Routine[] = [];

  for (const r of routines) {
    const reRows = await db.getAllAsync<any>(
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

export async function saveRoutine(
  name: string,
  folderName: string,
  exercises: { exerciseId: string; targetSets: number; targetReps: string; restTimerSeconds: number }[],
  notes?: string,
  existingId?: string
): Promise<string> {
  const routineId = existingId || `routine-${Date.now()}`;

  if (Platform.OS === 'web') {
    const routine: Routine = {
      id: routineId,
      name,
      folderName,
      notes,
      createdAt: new Date().toISOString(),
      exercises: exercises.map((item, idx) => ({
        id: `re-${routineId}-${idx}`,
        exerciseId: item.exerciseId,
        exercise: webStorage.exercises.find(e => e.id === item.exerciseId) || webStorage.exercises[0],
        orderIndex: idx,
        targetSets: item.targetSets,
        targetReps: item.targetReps,
        restTimerSeconds: item.restTimerSeconds,
      })),
    };
    if (existingId) {
      const idx = webStorage.routines.findIndex(r => r.id === existingId);
      if (idx >= 0) webStorage.routines[idx] = routine;
      else webStorage.routines.unshift(routine);
    } else {
      webStorage.routines.unshift(routine);
    }
    return routineId;
  }

  const db = await getDatabase();
  if (!db) return routineId;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO routines (id, name, folder_name, notes) VALUES (?, ?, ?, ?)`,
      routineId,
      name,
      folderName || null,
      notes || null
    );

    // Clear existing exercises if updating
    await db.runAsync('DELETE FROM routine_exercises WHERE routine_id = ?', routineId);

    let order = 0;
    for (const item of exercises) {
      await db.runAsync(
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
}

export async function deleteRoutine(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage.routines = webStorage.routines.filter(r => r.id !== id);
    return;
  }
  const db = await getDatabase();
  if (!db) return;
  await db.runAsync('DELETE FROM routines WHERE id = ?', id);
}

// ==========================================
// WORKOUT LOGGING & HISTORY QUERIES
// ==========================================

export async function saveCompletedWorkout(workout: Workout): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage.workouts.unshift(workout);
    if (workout.routineId) {
      const r = webStorage.routines.find(rt => rt.id === workout.routineId);
      if (r) r.lastPerformedAt = workout.endTime || workout.startTime;
    }
    return;
  }

  const db = await getDatabase();
  if (!db) return;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO workouts (id, routine_id, name, start_time, end_time, duration_seconds, total_volume_kg, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      workout.id,
      workout.routineId || null,
      workout.name,
      workout.startTime,
      workout.endTime || new Date().toISOString(),
      workout.durationSeconds,
      workout.totalVolumeKg,
      workout.notes || null
    );

    if (workout.routineId) {
      await db.runAsync(
        `UPDATE routines SET last_performed_at = ? WHERE id = ?`,
        workout.endTime || workout.startTime,
        workout.routineId
      );
    }

    let exOrder = 0;
    for (const ex of workout.exercises) {
      const weId = `we-${workout.id}-${exOrder}`;
      await db.runAsync(
        `INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, notes, rest_timer_seconds)
         VALUES (?, ?, ?, ?, ?, ?)`,
        weId,
        workout.id,
        ex.exerciseId,
        exOrder,
        ex.notes || null,
        ex.restTimerSeconds || 90
      );

      for (const s of ex.sets) {
        if (s.isCompleted) {
          await db.runAsync(
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
  });
}

export async function getWorkoutHistory(): Promise<WorkoutHistorySummary[]> {
  if (Platform.OS === 'web') {
    return webStorage.workouts.map(w => ({
      id: w.id,
      name: w.name,
      routineId: w.routineId,
      startTime: w.startTime,
      endTime: w.endTime,
      durationSeconds: w.durationSeconds,
      totalVolumeKg: w.totalVolumeKg,
      totalSets: w.exercises.reduce((acc, e) => acc + e.sets.filter(s => s.isCompleted).length, 0),
      exerciseNames: w.exercises.map(e => e.exercise.name),
      notes: w.notes,
    }));
  }

  const db = await getDatabase();
  if (!db) return [];

  const rows = await db.getAllAsync<any>(
    `SELECT w.*, 
            COUNT(DISTINCT s.id) as total_sets,
            GROUP_CONCAT(DISTINCT e.name) as exercise_names
     FROM workouts w
     LEFT JOIN workout_exercises we ON w.id = we.workout_id
     LEFT JOIN exercises e ON we.exercise_id = e.id
     LEFT JOIN exercise_sets s ON we.id = s.workout_exercise_id AND s.is_completed = 1
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

export async function getPreviousSetsForExercise(exerciseId: string): Promise<WorkoutSet[]> {
  if (Platform.OS === 'web') {
    for (const w of webStorage.workouts) {
      const found = w.exercises.find(e => e.exerciseId === exerciseId);
      if (found) {
        return found.sets.filter(s => s.isCompleted);
      }
    }
    return [];
  }

  const db = await getDatabase();
  if (!db) return [];

  const rows = await db.getAllAsync<any>(
    `SELECT s.*
     FROM exercise_sets s
     JOIN workout_exercises we ON s.workout_exercise_id = we.id
     JOIN workouts w ON we.workout_id = w.id
     WHERE we.exercise_id = ? AND s.is_completed = 1
     ORDER BY w.start_time DESC, s.set_number ASC
     LIMIT 10`,
    exerciseId
  );

  return rows.map(r => ({
    id: r.id,
    setNumber: r.set_number,
    type: r.set_type as any,
    weightKg: r.weight_kg,
    reps: r.reps,
    rpe: r.rpe,
    isCompleted: true,
  }));
}
