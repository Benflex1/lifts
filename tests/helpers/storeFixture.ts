import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Store } from '../../src/database/contract';
import { Exercise } from '../../src/types';
import { SqliteDriver, createNativeStore } from '../../src/database/nativeStore';

export interface RawWorkoutRecordInput {
  id: string;
  startTime: string;
  inProgress: boolean;
  name?: string;
  endTime?: string;
  gymId?: string;
  exercises?: Array<{ exercise: Exercise; sets: Array<{ weightKg: number; reps: number }> }>;
}

export class NodeSqliteDriver implements SqliteDriver {
  private db: DatabaseSync;

  constructor(public readonly filePath: string = ':memory:') {
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(
    sql: string,
    ...params: any[]
  ): Promise<{ changes: number; lastInsertRowId: number }> {
    const stmt = this.db.prepare(sql);
    const safeParams = params.map(p => (p === undefined ? null : p));
    const result = stmt.run(...safeParams);
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const safeParams = params.map(p => (p === undefined ? null : p));
    const row = stmt.get(...safeParams);
    return (row as T) || null;
  }

  async getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const safeParams = params.map(p => (p === undefined ? null : p));
    const rows = stmt.all(...safeParams);
    return (rows as T[]) || [];
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      await task();
      this.db.exec('COMMIT;');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch (_) {
        // Rollback error if already rolled back
      }
      throw err;
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch (_) {
      // Ignore: closing the fixture database is best-effort.
    }
  }
}

export interface StoreFixture {
  store: Store;
  driver?: NodeSqliteDriver;
  reopen: () => Promise<Store>;
  dispose: () => Promise<void>;
  /**
   * Writes a workout record straight to the underlying storage, bypassing
   * store policy, so tests can simulate foreign or legacy in-progress records.
   */
  insertRawWorkoutRecord: (input: RawWorkoutRecordInput) => Promise<void>;
}

export async function createStoreFixture(platform: 'native' | 'web'): Promise<StoreFixture> {
  if (platform === 'native') {
    const tempDir = os.tmpdir();
    const tempFile = path.join(
      tempDir,
      `lifts-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    let driver = new NodeSqliteDriver(tempFile);
    let store = createNativeStore(driver);
    await store.init();

    return {
      store,
      driver,
      insertRawWorkoutRecord: async input => {
        await driver.runAsync(
          `INSERT INTO workouts (id, routine_id, name, start_time, end_time, duration_seconds, total_volume_kg, notes, in_progress, gym_id)
           VALUES (?, NULL, ?, ?, ?, 0, 0, NULL, ?, ?)`,
          input.id,
          input.name ?? `Raw ${input.id}`,
          input.startTime,
          input.endTime ?? null,
          input.inProgress ? 1 : 0,
          input.gymId ?? 'gym-default',
        );
        for (const [index, entry] of (input.exercises ?? []).entries()) {
          const workoutExerciseId = `${input.id}-exercise-${index}`;
          await driver.runAsync(
            `INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, notes, rest_timer_seconds, target_reps, superset_id)
             VALUES (?, ?, ?, ?, NULL, 90, NULL, NULL)`,
            workoutExerciseId,
            input.id,
            entry.exercise.id,
            index,
          );
          for (const [setIndex, set] of entry.sets.entries()) {
            await driver.runAsync(
              `INSERT INTO exercise_sets (id, workout_exercise_id, set_number, set_type, weight_kg, reps, rpe, is_completed, completed_at)
               VALUES (?, ?, ?, 'normal', ?, ?, NULL, 1, ?)`,
              `${workoutExerciseId}-set-${setIndex}`,
              workoutExerciseId,
              setIndex + 1,
              set.weightKg,
              set.reps,
              input.endTime ?? input.startTime,
            );
          }
        }
      },
      reopen: async () => {
        driver.close();
        driver = new NodeSqliteDriver(tempFile);
        store = createNativeStore(driver);
        await store.init();
        return store;
      },
      dispose: async () => {
        driver.close();
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch (_) {
            // Ignore: closing the fixture database is best-effort.
          }
        }
      },
    };
  }

  if (platform === 'web') {
    const { indexedDB } = require('fake-indexeddb');
    const { createWebStore } = require('../../src/database/webStore');
    const dbName = `lifts-test-web-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const openStores: any[] = [];
    let store = await createWebStore(dbName, { idbFactory: indexedDB });
    await store.init();
    openStores.push(store);

    return {
      store,
      insertRawWorkoutRecord: async input => {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const rawDb = request.result;
            const tx = rawDb.transaction('workouts', 'readwrite');
            tx.objectStore('workouts').put({
              id: input.id,
              name: input.name ?? `Raw ${input.id}`,
              gymId: input.gymId ?? 'gym-default',
              startTime: input.startTime,
              endTime: input.endTime ?? input.startTime,
              durationSeconds: 0,
              totalVolumeKg: 0,
              exercises: (input.exercises ?? []).map((entry, index) => ({
                id: `${input.id}-exercise-${index}`,
                exerciseId: entry.exercise.id,
                exercise: entry.exercise,
                sets: entry.sets.map((set, setIndex) => ({
                  id: `${input.id}-exercise-${index}-set-${setIndex}`,
                  setNumber: setIndex + 1,
                  type: 'normal',
                  weightKg: set.weightKg,
                  reps: set.reps,
                  isCompleted: true,
                  completedAt: input.endTime ?? input.startTime,
                })),
                restTimerSeconds: 90,
              })),
              ...(input.inProgress ? { inProgress: true } : {}),
            });
            tx.oncomplete = () => {
              rawDb.close();
              resolve();
            };
            tx.onerror = () => {
              rawDb.close();
              reject(tx.error);
            };
            tx.onabort = () => {
              rawDb.close();
              reject(tx.error);
            };
          };
          request.onerror = () => reject(request.error);
        });
      },
      reopen: async () => {
        if (store.close) {
          await store.close();
        }
        store = await createWebStore(dbName, { idbFactory: indexedDB });
        await store.init();
        openStores.push(store);
        return store;
      },
      dispose: async () => {
        for (const s of openStores) {
          if (s.close) {
            await s.close();
          }
        }
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase(dbName);
          req.onsuccess = () => resolve();
          req.onblocked = () => resolve();
          req.onerror = () => reject(req.error);
        });
      },
    };
  }

  throw new Error(`Platform ${platform} not yet implemented in fixture`);
}
