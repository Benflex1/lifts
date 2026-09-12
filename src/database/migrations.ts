import { SqliteDriver } from './nativeStore';
import { WorkoutDraft } from './contract';
import { ActiveExercise, WorkoutSet } from '../types';

export interface MigrationOptions {
  maxVersion?: number;
  failAtVersion?: number;
}

export async function applyMigrations(driver: SqliteDriver, options?: MigrationOptions): Promise<void> {
  await driver.execAsync('PRAGMA foreign_keys = ON;');

  await driver.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = await driver.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC'
  );
  const applied = new Set(appliedRows.map(r => r.version));

  // Migration 1: Base Schema
  if (!applied.has(1) && (options?.maxVersion === undefined || options.maxVersion >= 1)) {
    await driver.withTransactionAsync(async () => {
      await driver.execAsync(`
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
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
          notes TEXT,
          in_progress INTEGER DEFAULT 0
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

      if (options?.failAtVersion === 1) {
        throw new Error('Injected migration failure at version 1');
      }

      await driver.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)',
        new Date().toISOString()
      );
    });
  }

  // Migration 2: Dedicated Drafts Table & in_progress workouts migration
  if (!applied.has(2) && (options?.maxVersion === undefined || options.maxVersion >= 2)) {
    await driver.withTransactionAsync(async () => {
      await driver.execAsync(`
        CREATE TABLE IF NOT EXISTS workout_drafts (
          id TEXT PRIMARY KEY,
          revision INTEGER NOT NULL DEFAULT 1,
          saved_at TEXT NOT NULL,
          rest_timer_ends_at INTEGER,
          rest_timer_total_seconds INTEGER,
          data TEXT NOT NULL
        );
      `);

      const workoutColumns = await driver.getAllAsync<{ name: string }>(
        'PRAGMA table_info(workouts);'
      );
      if (!workoutColumns.some(column => column.name === 'in_progress')) {
        await driver.execAsync(
          'ALTER TABLE workouts ADD COLUMN in_progress INTEGER NOT NULL DEFAULT 0;'
        );
      }

      const inProgressWorkouts = await driver.getAllAsync<any>(
        'SELECT * FROM workouts WHERE in_progress = 1'
      );

      for (const w of inProgressWorkouts) {
        const weRows = await driver.getAllAsync<any>(
          `SELECT we.*, e.name as ex_name, e.category as ex_cat, e.equipment as ex_equip,
                  e.primary_muscles as ex_pm, e.secondary_muscles as ex_sm, e.instructions as ex_inst
           FROM workout_exercises we
           LEFT JOIN exercises e ON we.exercise_id = e.id
           WHERE we.workout_id = ?
           ORDER BY we.order_index ASC`,
          w.id
        );

        const exercises: ActiveExercise[] = [];
        for (const we of weRows) {
          const sRows = await driver.getAllAsync<any>(
            'SELECT * FROM exercise_sets WHERE workout_exercise_id = ? ORDER BY set_number ASC',
            we.id
          );

          exercises.push({
            id: we.id,
            exerciseId: we.exercise_id,
            notes: we.notes,
            restTimerSeconds: we.rest_timer_seconds ?? 0,
            exercise: {
              id: we.exercise_id,
              name: we.ex_name || 'Exercise',
              category: we.ex_cat || 'General',
              equipment: we.ex_equip || 'None',
              primaryMuscles: JSON.parse(we.ex_pm || '[]'),
              secondaryMuscles: JSON.parse(we.ex_sm || '[]'),
              instructions: JSON.parse(we.ex_inst || '[]'),
            },
            sets: sRows.map((s: any): WorkoutSet => ({
              id: s.id,
              setNumber: s.set_number,
              type: s.set_type as any,
              weightKg: s.weight_kg,
              reps: s.reps,
              rpe: s.rpe,
              isCompleted: Boolean(s.is_completed),
              completedAt: s.completed_at,
            })),
          });
        }

        const draft: WorkoutDraft = {
          version: 1,
          workout: {
            id: w.id,
            name: w.name,
            routineId: w.routine_id || undefined,
            gymId: 'gym-default',
            startTime: w.start_time,
            durationSeconds: w.duration_seconds || 0,
            totalVolumeKg: w.total_volume_kg || 0,
            notes: w.notes || undefined,
            exercises,
          },
          savedAt: w.start_time || new Date().toISOString(),
          revision: 1,
          restTimer: null,
        };

        await driver.runAsync(
          `INSERT INTO workout_drafts (id, revision, saved_at, rest_timer_ends_at, rest_timer_total_seconds, data)
           VALUES (?, ?, ?, ?, ?, ?)`,
          draft.workout.id,
          draft.revision,
          draft.savedAt,
          null,
          null,
          JSON.stringify(draft)
        );

        await driver.runAsync('DELETE FROM workouts WHERE id = ?', w.id);
      }

      if (options?.failAtVersion === 2) {
        throw new Error('Injected migration failure at version 2');
      }

      await driver.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)',
        new Date().toISOString()
      );
    });
  }

  // Migration 3: Add target_reps to workout_exercises
  if (!applied.has(3) && (options?.maxVersion === undefined || options.maxVersion >= 3)) {
    await driver.withTransactionAsync(async () => {
      const tableInfo = await driver.getAllAsync<{ name: string }>('PRAGMA table_info(workout_exercises);');
      const hasCol = tableInfo.some(c => c.name === 'target_reps');
      if (!hasCol) {
        await driver.execAsync('ALTER TABLE workout_exercises ADD COLUMN target_reps TEXT;');
      }

      if (options?.failAtVersion === 3) {
        throw new Error('Injected migration failure at version 3');
      }

      await driver.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)',
        new Date().toISOString()
      );
    });
  }

  // Migration 4: Repair in_progress for databases that already ran the old Migration 2
  if (!applied.has(4) && (options?.maxVersion === undefined || options.maxVersion >= 4)) {
    await driver.withTransactionAsync(async () => {
      const tableInfo = await driver.getAllAsync<{ name: string }>('PRAGMA table_info(workouts);');
      const hasInProgress = tableInfo.some(column => column.name === 'in_progress');
      if (!hasInProgress) {
        await driver.execAsync(
          'ALTER TABLE workouts ADD COLUMN in_progress INTEGER NOT NULL DEFAULT 0;'
        );
      }

      if (options?.failAtVersion === 4) {
        throw new Error('Injected migration failure at version 4');
      }

      await driver.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (4, ?)',
        new Date().toISOString()
      );
    });
  }

  // Migration 5: gym profiles, exercise scope overrides, and workout assignments
  if (!applied.has(5) && (options?.maxVersion === undefined || options.maxVersion >= 5)) {
    await driver.withTransactionAsync(async () => {
      await driver.execAsync(`
        CREATE TABLE IF NOT EXISTS gyms (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          color TEXT NOT NULL DEFAULT '#3B82F6',
          created_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS gyms_one_default
          ON gyms(is_default) WHERE is_default = 1;
        CREATE TABLE IF NOT EXISTS exercise_gym_scopes (
          exercise_id TEXT PRIMARY KEY,
          scope_type TEXT NOT NULL CHECK(scope_type IN ('global', 'gym_specific', 'linked_group')),
          linked_gym_ids TEXT,
          FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
        );
      `);
      await driver.runAsync(
        `INSERT OR IGNORE INTO gyms (id, name, is_default, color, created_at) VALUES (?, ?, 1, ?, ?)`,
        'gym-default', 'Default Gym', '#3B82F6', new Date().toISOString()
      );
      const defaultGym = await driver.getFirstAsync<{ id: string }>('SELECT id FROM gyms WHERE is_default = 1');
      if (!defaultGym) await driver.runAsync('UPDATE gyms SET is_default = 1 WHERE id = ?', 'gym-default');

      const workoutColumns = await driver.getAllAsync<{ name: string }>('PRAGMA table_info(workouts);');
      if (!workoutColumns.some(column => column.name === 'gym_id')) {
        await driver.execAsync('ALTER TABLE workouts ADD COLUMN gym_id TEXT REFERENCES gyms(id);');
      }
      await driver.runAsync('UPDATE workouts SET gym_id = ? WHERE gym_id IS NULL', 'gym-default');

      const draftRows = await driver.getAllAsync<{ id: string; data: string }>('SELECT id, data FROM workout_drafts');
      for (const row of draftRows) {
        try {
          const payload = JSON.parse(row.data) as WorkoutDraft;
          if (payload && payload.workout && !payload.workout.gymId) {
            payload.workout.gymId = 'gym-default';
            await driver.runAsync('UPDATE workout_drafts SET data = ? WHERE id = ?', JSON.stringify(payload), row.id);
          }
        } catch (_) {
          // Preserve malformed legacy payloads for the existing reader to ignore.
        }
      }
      if (options?.failAtVersion === 5) throw new Error('Injected migration failure at version 5');
      await driver.runAsync('INSERT INTO schema_migrations (version, applied_at) VALUES (5, ?)', new Date().toISOString());
    });
  }

  // Migration 6: superset support for workout and routine exercises
  if (!applied.has(6) && (options?.maxVersion === undefined || options.maxVersion >= 6)) {
    await driver.withTransactionAsync(async () => {
      const reCols = await driver.getAllAsync<{ name: string }>('PRAGMA table_info(routine_exercises);');
      if (!reCols.some(c => c.name === 'superset_id')) {
        await driver.execAsync('ALTER TABLE routine_exercises ADD COLUMN superset_id TEXT;');
      }
      const weCols = await driver.getAllAsync<{ name: string }>('PRAGMA table_info(workout_exercises);');
      if (!weCols.some(c => c.name === 'superset_id')) {
        await driver.execAsync('ALTER TABLE workout_exercises ADD COLUMN superset_id TEXT;');
      }
      if (options?.failAtVersion === 6) throw new Error('Injected migration failure at version 6');
      await driver.runAsync('INSERT INTO schema_migrations (version, applied_at) VALUES (6, ?)', new Date().toISOString());
    });
  }
}
