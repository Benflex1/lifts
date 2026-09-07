import { Exercise, Routine, Workout, WorkoutHistorySummary, WorkoutSet } from '../types';
import { DataSnapshot, Store, WorkoutDraft } from './contract';
import { DEFAULT_EXERCISES, buildDefaultRoutines } from './seedData';
import { smartSearchExercises } from '../utils/search';
import { calculate1RM } from '../utils/calculator';

export interface WebStoreOptions {
  idbFactory?: IDBFactory;
  now?: () => number;
  leaseDurationMs?: number;
}

export interface WebStore extends Store {
  isReadOnly(): boolean;
  tryAcquireLease(): Promise<boolean>;
  onReadOnlyChange(listener: (isReadOnly: boolean) => void): () => void;
  close(): Promise<void>;
}

export async function createWebStore(name: string = 'lifts_web_db', options?: WebStoreOptions): Promise<WebStore> {
  const idb: IDBFactory = options?.idbFactory || (typeof indexedDB !== 'undefined' ? indexedDB : undefined as any);
  if (!idb) {
    throw new Error('IndexedDB is not available in this environment');
  }

  const getNow = options?.now || (() => Date.now());
  const leaseDurationMs = options?.leaseDurationMs || 10000;
  const tabOwnerId = `tab-${Math.random().toString(36).slice(2)}-${getNow()}`;
  let readOnlyMode = false;
  let db: IDBDatabase | null = null;
  let cachedExercises: Exercise[] | null = null;
  let heartbeatTimer: any = null;
  const readOnlyListeners = new Set<(isReadOnly: boolean) => void>();

  function setReadOnly(val: boolean): void {
    const changed = readOnlyMode !== val;
    readOnlyMode = val;
    if (readOnlyMode) {
      stopHeartbeat();
    } else {
      startHeartbeat();
    }
    if (changed) {
      for (const listener of readOnlyListeners) {
        try {
          listener(readOnlyMode);
        } catch (err) {
          console.error('Error notifying readOnly listener:', err);
        }
      }
    }
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function startHeartbeat(): void {
    if (heartbeatTimer || readOnlyMode) return;
    const intervalMs = Math.max(1000, Math.min(Math.floor(leaseDurationMs / 3), 3000));
    heartbeatTimer = setInterval(async () => {
      if (readOnlyMode || !db) return;
      try {
        await renewLeaseIfOwned();
      } catch (_) {}
    }, intervalMs);
    if (heartbeatTimer && typeof heartbeatTimer.unref === 'function') {
      heartbeatTimer.unref();
    }
  }

  async function renewLeaseIfOwned(): Promise<void> {
    if (!db || readOnlyMode) return;
    return new Promise((resolve) => {
      try {
        const tx = db!.transaction('metadata', 'readwrite');
        const store = tx.objectStore('metadata');
        const getReq = store.get('writer_lease');
        getReq.onsuccess = () => {
          const lease = getReq.result;
          const now = getNow();
          if (lease && lease.ownerId === tabOwnerId) {
            store.put({
              ...lease,
              heartbeat: now,
            });
            tx.oncomplete = () => resolve();
          } else {
            // Lease lost to another tab or cleared
            setReadOnly(true);
            tx.abort();
            resolve();
          }
        };
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch (_) {
        resolve();
      }
    });
  }

  async function openDb(): Promise<IDBDatabase> {
    if (db) return db;

    return new Promise((resolve, reject) => {
      const req = idb.open(name, 1);

      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('exercises')) {
          d.createObjectStore('exercises', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('routines')) {
          d.createObjectStore('routines', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('workouts')) {
          d.createObjectStore('workouts', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('workout_drafts')) {
          d.createObjectStore('workout_drafts', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!d.objectStoreNames.contains('metadata')) {
          d.createObjectStore('metadata', { keyPath: 'key' });
        }
      };

      req.onsuccess = () => {
        db = req.result;
        db.onversionchange = () => {
          db?.close();
          db = null;
        };
        resolve(db);
      };

      req.onerror = () => reject(req.error);
    });
  }

  async function tryAcquireLease(): Promise<boolean> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('metadata', 'readwrite');
      const store = tx.objectStore('metadata');
      const getReq = store.get('writer_lease');

      getReq.onsuccess = () => {
        const lease = getReq.result;
        const now = getNow();

        if (!lease || now - lease.heartbeat > lease.leaseDurationMs || lease.ownerId === tabOwnerId) {
          store.put({
            key: 'writer_lease',
            ownerId: tabOwnerId,
            acquiredAt: lease?.ownerId === tabOwnerId ? lease.acquiredAt : now,
            heartbeat: now,
            leaseDurationMs,
          });
          tx.oncomplete = () => {
            setReadOnly(false);
            resolve(true);
          };
        } else {
          tx.oncomplete = () => {
            setReadOnly(true);
            resolve(false);
          };
        }
      };

      tx.onerror = () => reject(tx.error);
    });
  }

  async function verifyAndRenewLease(database: IDBDatabase): Promise<void> {
    if (readOnlyMode) {
      throw new Error('Cannot write: store is in read-only mode');
    }

    return new Promise((resolve, reject) => {
      const tx = database.transaction('metadata', 'readwrite');
      const store = tx.objectStore('metadata');
      const getReq = store.get('writer_lease');

      getReq.onsuccess = () => {
        const lease = getReq.result;
        const now = getNow();

        if (lease && lease.ownerId === tabOwnerId) {
          store.put({
            ...lease,
            heartbeat: now,
          });
          tx.oncomplete = () => resolve();
        } else {
          setReadOnly(true);
          tx.abort();
          reject(new Error('Cannot write: lease has expired or was acquired by another tab'));
        }
      };

      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Cannot write: lease has expired or was acquired by another tab'));
    });
  }

  async function init(): Promise<void> {
    const database = await openDb();
    await tryAcquireLease();

    if (!readOnlyMode) {
      // Seed default exercises if needed
      const exSeeded = await new Promise<boolean>((resolve, reject) => {
        const tx = database.transaction('metadata', 'readonly');
        const req = tx.objectStore('metadata').get('exercises_seeded');
        req.onsuccess = () => resolve(Boolean(req.result));
        req.onerror = () => reject(req.error);
      });

      if (!exSeeded) {
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction(['exercises', 'metadata'], 'readwrite');
          const exStore = tx.objectStore('exercises');
          for (const ex of DEFAULT_EXERCISES) {
            exStore.put(ex);
          }
          tx.objectStore('metadata').put({ key: 'exercises_seeded', value: '1' });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }

      // Seed default routines if needed
      const rtSeeded = await new Promise<boolean>((resolve, reject) => {
        const tx = database.transaction('metadata', 'readonly');
        const req = tx.objectStore('metadata').get('routines_seeded');
        req.onsuccess = () => resolve(Boolean(req.result));
        req.onerror = () => reject(req.error);
      });

      if (!rtSeeded) {
        const defaults = buildDefaultRoutines();
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction(['routines', 'metadata'], 'readwrite');
          const rtStore = tx.objectStore('routines');
          for (const r of defaults) {
            rtStore.put(r);
          }
          tx.objectStore('metadata').put({ key: 'routines_seeded', value: '1' });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    }
  }

  async function getAllExercises(): Promise<Exercise[]> {
    if (cachedExercises) return cachedExercises;
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('exercises', 'readonly');
      const req = tx.objectStore('exercises').getAll();
      req.onsuccess = () => {
        const list = req.result as Exercise[];
        list.sort((a, b) => a.name.localeCompare(b.name));
        cachedExercises = list;
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function searchExercises(query: string = '', muscle: string = 'All', equipment: string = 'All'): Promise<Exercise[]> {
    const all = await getAllExercises();
    return smartSearchExercises(all, query, muscle, equipment);
  }

  async function getExerciseById(id: string): Promise<Exercise | null> {
    const all = await getAllExercises();
    const found = all.find(e => e.id === id);
    if (found) return found;

    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('exercises', 'readonly');
      const req = tx.objectStore('exercises').get(id);
      req.onsuccess = () => resolve((req.result as Exercise) || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function createCustomExercise(exercise: Omit<Exercise, 'id' | 'isCustom'>): Promise<Exercise> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    const custom: Exercise = {
      ...exercise,
      id: (exercise as any).id || `custom-${Date.now()}`,
      isCustom: true,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('exercises', 'readwrite');
      tx.objectStore('exercises').put(custom);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    cachedExercises = null;
    return custom;
  }

  async function getRoutines(): Promise<Routine[]> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('routines', 'readonly');
      const req = tx.objectStore('routines').getAll();
      req.onsuccess = () => {
        const routines = req.result as Routine[];
        routines.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        resolve(routines);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getRoutineById(id: string): Promise<Routine | null> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('routines', 'readonly');
      const req = tx.objectStore('routines').get(id);
      req.onsuccess = () => resolve((req.result as Routine) || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveRoutine(
    name: string,
    folderName: string,
    exercises: { exerciseId: string; targetSets: number; targetReps: string; restTimerSeconds: number }[],
    notes?: string,
    existingId?: string
  ): Promise<string> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    const allEx = await getAllExercises();
    const routineId = existingId || `routine-${Date.now()}`;
    const existing = existingId ? await getRoutineById(existingId) : null;

    const routine: Routine = {
      id: routineId,
      name,
      folderName: folderName || undefined,
      notes: notes || undefined,
      createdAt: existing?.createdAt || new Date().toISOString(),
      lastPerformedAt: existing?.lastPerformedAt,
      exercises: exercises.map((item, idx) => ({
        id: `re-${routineId}-${idx}`,
        exerciseId: item.exerciseId,
        exercise: allEx.find(e => e.id === item.exerciseId) || allEx[0],
        orderIndex: idx,
        targetSets: item.targetSets,
        targetReps: item.targetReps,
        restTimerSeconds: item.restTimerSeconds,
      })),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('routines', 'readwrite');
      tx.objectStore('routines').put(routine);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return routineId;
  }

  async function deleteRoutine(id: string): Promise<void> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('routines', 'readwrite');
      tx.objectStore('routines').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function duplicateRoutine(routineId: string): Promise<string> {
    const original = await getRoutineById(routineId);
    if (!original) throw new Error('Routine not found');

    const newId = `routine-${Date.now()}`;
    const copy: Routine = {
      ...original,
      id: newId,
      name: `${original.name} (Copy)`,
      createdAt: new Date().toISOString(),
      exercises: original.exercises.map((e, idx) => ({
        ...e,
        id: `re-${newId}-${idx}`,
      })),
    };

    const database = await openDb();
    await verifyAndRenewLease(database);

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('routines', 'readwrite');
      tx.objectStore('routines').put(copy);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return newId;
  }

  async function finishWorkout(workout: Workout): Promise<void> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['workouts', 'routines', 'workout_drafts'], 'readwrite');
      tx.objectStore('workouts').put(workout);

      if (workout.routineId) {
        const rtStore = tx.objectStore('routines');
        const getReq = rtStore.get(workout.routineId);
        getReq.onsuccess = () => {
          const r = getReq.result as Routine | undefined;
          if (r) {
            r.lastPerformedAt = workout.endTime || workout.startTime;
            rtStore.put(r);
          }
        };
      }

      // Remove from drafts in same transaction
      tx.objectStore('workout_drafts').delete(workout.id);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function saveCompletedWorkout(workout: Workout): Promise<void> {
    return finishWorkout(workout);
  }

  async function getWorkoutHistory(): Promise<WorkoutHistorySummary[]> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('workouts', 'readonly');
      const req = tx.objectStore('workouts').getAll();
      req.onsuccess = () => {
        const workouts = req.result as Workout[];
        workouts.sort((a, b) => b.startTime.localeCompare(a.startTime));
        resolve(workouts.map(w => ({
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
        })));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getWorkoutDetail(workoutId: string): Promise<Workout | null> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('workouts', 'readonly');
      const req = tx.objectStore('workouts').get(workoutId);
      req.onsuccess = () => resolve((req.result as Workout) || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteWorkout(workoutId: string): Promise<void> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('workouts', 'readwrite');
      tx.objectStore('workouts').delete(workoutId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getPreviousSetsForExercise(exerciseId: string, occurrenceIndex: number = 0): Promise<WorkoutSet[]> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('workouts', 'readonly');
      const req = tx.objectStore('workouts').getAll();
      req.onsuccess = () => {
        const workouts = req.result as Workout[];
        workouts.sort((a, b) => b.startTime.localeCompare(a.startTime));

        for (const w of workouts) {
          const occurrences = (w.exercises || []).filter(e => e.exerciseId === exerciseId);
          if (occurrences.length === 0) continue;

          const hasAnyCompleted = occurrences.some(occ => (occ.sets || []).some(s => s.isCompleted));
          if (!hasAnyCompleted) continue;

          const targetOcc = occurrences[occurrenceIndex] || occurrences[0];
          let completedSets = (targetOcc.sets || []).filter(s => s.isCompleted);
          if (completedSets.length === 0) {
            for (const occ of occurrences) {
              completedSets = (occ.sets || []).filter(s => s.isCompleted);
              if (completedSets.length > 0) break;
            }
          }
          return resolve(completedSets);
        }
        resolve([]);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getExerciseStats(exerciseId: string): Promise<{
    maxWeightKg: number;
    maxReps: number;
    estimated1RM: number;
    sessionCount: number;
  }> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('workouts', 'readonly');
      const req = tx.objectStore('workouts').getAll();
      req.onsuccess = () => {
        const workouts = req.result as Workout[];
        let maxWeightKg = 0;
        let maxReps = 0;
        let estimated1RM = 0;
        let sessionCount = 0;

        for (const w of workouts) {
          const occurrences = (w.exercises || []).filter(e => e.exerciseId === exerciseId);
          if (occurrences.length === 0) continue;

          let hadCompletedInThisWorkout = false;
          for (const occ of occurrences) {
            const completed = (occ.sets || []).filter(s => s.isCompleted);
            if (completed.length > 0) {
              hadCompletedInThisWorkout = true;
              for (const s of completed) {
                if (s.weightKg > maxWeightKg) maxWeightKg = s.weightKg;
                if (s.reps > maxReps) maxReps = s.reps;
                const oneRM = calculate1RM(s.weightKg, s.reps).average;
                if (oneRM > estimated1RM) estimated1RM = oneRM;
              }
            }
          }
          if (hadCompletedInThisWorkout) {
            sessionCount++;
          }
        }

        resolve({ maxWeightKg, maxReps, estimated1RM, sessionCount });
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function saveDraft(draft: WorkoutDraft): Promise<void> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('workout_drafts', 'readwrite');
      tx.objectStore('workout_drafts').put({
        ...draft,
        id: draft.workout.id,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getWorkoutDrafts(): Promise<WorkoutDraft[]> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('workout_drafts', 'readonly');
      const req = tx.objectStore('workout_drafts').getAll();
      req.onsuccess = () => {
        const drafts = req.result as WorkoutDraft[];
        drafts.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
        resolve(drafts);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getWorkoutDraft(id?: string): Promise<WorkoutDraft | null> {
    if (id) {
      const database = await openDb();
      return new Promise((resolve, reject) => {
        const tx = database.transaction('workout_drafts', 'readonly');
        const req = tx.objectStore('workout_drafts').get(id);
        req.onsuccess = () => resolve((req.result as WorkoutDraft) || null);
        req.onerror = () => reject(req.error);
      });
    }

    const drafts = await getWorkoutDrafts();
    return drafts.length > 0 ? drafts[0] : null;
  }

  async function discardDraft(id: string): Promise<void> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('workout_drafts', 'readwrite');
      tx.objectStore('workout_drafts').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getSetting(key: string): Promise<string | null> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  }

  async function setSetting(key: string, value: string): Promise<void> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function renameFolder(oldName: string, newName: string): Promise<void> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    const routines = await getRoutines();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('routines', 'readwrite');
      const store = tx.objectStore('routines');
      for (const r of routines) {
        if (r.folderName === oldName) {
          store.put({ ...r, folderName: newName });
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteFolder(name: string): Promise<void> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    const routines = await getRoutines();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('routines', 'readwrite');
      const store = tx.objectStore('routines');
      for (const r of routines) {
        if (r.folderName === name) {
          store.put({ ...r, folderName: undefined });
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function readSnapshot(): Promise<DataSnapshot> {
    const history = await getWorkoutHistory();
    const workouts: Workout[] = [];
    for (const h of history) {
      const w = await getWorkoutDetail(h.id);
      if (w) workouts.push(w);
    }
    const routines = await getRoutines();
    const exercises = await getAllExercises();
    const drafts = await getWorkoutDrafts();

    const database = await openDb();
    const settings: Record<string, string> = await new Promise((resolve, reject) => {
      const tx = database.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').getAll();
      req.onsuccess = () => {
        const rows = req.result as { key: string; value: string }[];
        const map: Record<string, string> = {};
        for (const r of rows) map[r.key] = r.value;
        resolve(map);
      };
      req.onerror = () => reject(req.error);
    });

    return {
      workouts,
      routines,
      exercises,
      drafts,
      settings,
    };
  }

  async function mergeSnapshot(snapshot: DataSnapshot): Promise<void> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['exercises', 'routines', 'workouts', 'workout_drafts', 'settings'], 'readwrite');

      const exStore = tx.objectStore('exercises');
      for (const ex of snapshot.exercises) {
        exStore.put(ex);
      }

      const rtStore = tx.objectStore('routines');
      for (const rt of snapshot.routines) {
        rtStore.put(rt);
      }

      const wStore = tx.objectStore('workouts');
      for (const w of snapshot.workouts) {
        wStore.put(w);
      }

      const dStore = tx.objectStore('workout_drafts');
      for (const d of snapshot.drafts) {
        dStore.put({
          ...d,
          id: d.workout.id,
        });
      }

      const sStore = tx.objectStore('settings');
      for (const [k, v] of Object.entries(snapshot.settings)) {
        const getReq = sStore.get(k);
        getReq.onsuccess = () => {
          if (!getReq.result) {
            sStore.put({ key: k, value: v });
          }
        };
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    cachedExercises = null;
  }

  async function releaseLease(): Promise<void> {
    if (!db || readOnlyMode) return;
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db!.transaction('metadata', 'readwrite');
        const store = tx.objectStore('metadata');
        const getReq = store.get('writer_lease');
        getReq.onsuccess = () => {
          const lease = getReq.result;
          if (lease && lease.ownerId === tabOwnerId) {
            store.delete('writer_lease');
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) {}
  }

  async function close(): Promise<void> {
    stopHeartbeat();
    await releaseLease();
    if (db) {
      db.close();
      db = null;
    }
  }

  return {
    isReadOnly: () => readOnlyMode,
    tryAcquireLease,
    onReadOnlyChange: (listener: (isReadOnly: boolean) => void) => {
      readOnlyListeners.add(listener);
      return () => {
        readOnlyListeners.delete(listener);
      };
    },
    close,
    init,
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
