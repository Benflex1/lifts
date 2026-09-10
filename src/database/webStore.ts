import { DualExerciseStats, Exercise, ExerciseGymScope, Gym, PreviousSetSuggestion, Routine, Workout, WorkoutHistorySummary } from '../types';
import { DataSnapshot, Store, WorkoutDraft } from './contract';
import { DEFAULT_EXERCISES, buildDefaultRoutines } from './seedData';
import { smartSearchExercises } from '../utils/search';
import { CompletedExerciseOccurrence, resolvePreviousSetsForExercise } from '../workout/gym-history';
import { calculateDualExerciseStats } from '../workout/gym-records';
import { createScopedId } from '../utils/ids';
import { validateTargetReps } from '../workout/sets';
import { DEFAULT_GYM_COLOR, validateGymColor, validateGymDeletion, validateGymName } from '../workout/gym-profile';
import { validateExerciseGymScope } from '../workout/gym-scope';

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

const DEFAULT_GYM: Gym = {
  id: 'gym-default', name: 'Default Gym', color: '#3B82F6', isDefault: true,
  createdAt: '2026-09-10T00:00:00.000Z',
};

function normalizeWorkout(workout: Workout): Workout {
  return workout.gymId ? workout : { ...workout, gymId: 'gym-default' };
}

function normalizeDraft(draft: WorkoutDraft): WorkoutDraft {
  const workout = normalizeWorkout(draft.workout);
  return workout === draft.workout ? draft : { ...draft, workout };
}

function scopesAreIdentical(a: ExerciseGymScope, b: ExerciseGymScope): boolean {
  return a.exerciseId === b.exerciseId && a.scopeType === b.scopeType
    && JSON.stringify([...(a.linkedGymIds || [])].sort()) === JSON.stringify([...(b.linkedGymIds || [])].sort());
}

function canonicalizeSnapshotGyms(snapshot: DataSnapshot): DataSnapshot {
  return {
    ...snapshot,
    gyms: (snapshot.gyms || []).map((gym) => {
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
      const req = idb.open(name, 2);

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
        if (!d.objectStoreNames.contains('gyms')) {
          const gyms = d.createObjectStore('gyms', { keyPath: 'id' });
          gyms.createIndex('isDefault', 'isDefault', { unique: false });
        }
        if (!d.objectStoreNames.contains('exercise_gym_scopes')) {
          const scopes = d.createObjectStore('exercise_gym_scopes', { keyPath: 'exerciseId' });
          scopes.createIndex('scopeType', 'scopeType', { unique: false });
          scopes.createIndex('linkedGymIds', 'linkedGymIds', { unique: false, multiEntry: true });
        }
        const gyms = req.transaction!.objectStore('gyms');
        gyms.put(DEFAULT_GYM);
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
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(['gyms', 'workouts', 'workout_drafts'], 'readwrite');
        const gymStore = tx.objectStore('gyms');
        const workoutStore = tx.objectStore('workouts');
        const draftStore = tx.objectStore('workout_drafts');
        if (!gymStore) return reject(new Error('Missing gyms store'));
        const workoutsReq = workoutStore.getAll();
        const draftsReq = draftStore.getAll();
        workoutsReq.onsuccess = () => {
          for (const workout of workoutsReq.result as Workout[]) {
            const normalized = normalizeWorkout(workout);
            if (normalized !== workout) workoutStore.put(normalized);
          }
        };
        draftsReq.onsuccess = () => {
          for (const draft of draftsReq.result as WorkoutDraft[]) {
            const normalized = normalizeDraft(draft);
            if (normalized !== draft) draftStore.put(normalized);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
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

  async function getGyms(): Promise<Gym[]> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('gyms', 'readonly');
      const req = tx.objectStore('gyms').getAll();
      req.onsuccess = () => resolve((req.result as Gym[]).sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return a.name.localeCompare(b.name);
      }));
      req.onerror = () => reject(req.error);
    });
  }

  async function getDefaultGym(): Promise<Gym> {
    const gyms = await getGyms();
    const gym = gyms.find(g => g.isDefault) || gyms.find(g => g.id === 'gym-default');
    if (!gym) throw new Error('No default gym exists');
    return gym;
  }

  async function createGym(name: string, color: string = DEFAULT_GYM_COLOR): Promise<Gym> {
    const database = await openDb();
    await verifyAndRenewLease(database);
    const gym: Gym = { id: createScopedId('gym'), name: validateGymName(name), color: validateGymColor(color), isDefault: false, createdAt: new Date(getNow()).toISOString() };
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('gyms', 'readwrite'); tx.objectStore('gyms').add(gym);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    return gym;
  }

  async function updateGym(id: string, updates: { name?: string; color?: string }): Promise<Gym> {
    const database = await openDb(); await verifyAndRenewLease(database);
    const name = updates.name === undefined ? undefined : validateGymName(updates.name);
    const color = updates.color === undefined ? undefined : validateGymColor(updates.color);
    return new Promise((resolve, reject) => {
      const tx = database.transaction('gyms', 'readwrite'); const store = tx.objectStore('gyms'); const req = store.get(id);
      req.onsuccess = () => {
        const current = req.result as Gym | undefined;
        if (!current) return reject(new Error('Gym not found'));
        store.put({ ...current, ...(name === undefined ? {} : { name }), ...(color === undefined ? {} : { color }) });
      };
      tx.oncomplete = async () => resolve((await getGyms()).find(g => g.id === id)!);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function setDefaultGym(id: string): Promise<void> {
    const database = await openDb(); await verifyAndRenewLease(database);
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('gyms', 'readwrite'); const store = tx.objectStore('gyms'); const all = store.getAll();
      all.onsuccess = () => {
        const gyms = all.result as Gym[]; if (!gyms.some(g => g.id === id)) return reject(new Error('Gym not found'));
        gyms.forEach(g => store.put({ ...g, isDefault: g.id === id }));
      };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteGym(id: string, replacementGymId: string): Promise<void> {
    if (id === replacementGymId) throw new Error('Replacement gym must be different');
    const database = await openDb(); await verifyAndRenewLease(database);
    validateGymDeletion(id, replacementGymId, await getGyms());
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['gyms', 'workouts', 'workout_drafts', 'exercise_gym_scopes'], 'readwrite');
      const gyms = tx.objectStore('gyms'); const workouts = tx.objectStore('workouts'); const drafts = tx.objectStore('workout_drafts'); const scopes = tx.objectStore('exercise_gym_scopes');
      const all = gyms.getAll();
      all.onsuccess = () => {
        const rows = all.result as Gym[];
        validateGymDeletion(id, replacementGymId, rows);
        const removed = rows.find(g => g.id === id)!;
        for (const gym of rows) gyms.put({ ...gym, isDefault: removed.isDefault ? gym.id === replacementGymId : gym.isDefault });
        const wr = workouts.getAll(); wr.onsuccess = () => (wr.result as Workout[]).forEach(w => { if (w.gymId === id) workouts.put({ ...w, gymId: replacementGymId }); });
        const dr = drafts.getAll(); dr.onsuccess = () => (dr.result as WorkoutDraft[]).forEach(d => { const n = normalizeDraft(d); if (n.workout.gymId === id) drafts.put({ ...n, workout: { ...n.workout, gymId: replacementGymId } }); });
        const sr = scopes.getAll(); sr.onsuccess = () => {
          for (const scope of sr.result as ExerciseGymScope[]) {
            if (!scope.linkedGymIds?.includes(id)) continue;
            const ids = scope.linkedGymIds.filter(g => g !== id);
            if (ids.length === 0) scopes.delete(scope.exerciseId);
            else scopes.put({ ...scope, scopeType: ids.length < 2 ? 'gym_specific' : 'linked_group', linkedGymIds: ids.length < 2 ? undefined : ids });
          }
          gyms.delete(id);
        };
      };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Gym deletion aborted'));
    });
  }

  async function getExerciseGymScopes(): Promise<ExerciseGymScope[]> {
    const database = await openDb(); return new Promise((resolve, reject) => { const tx = database.transaction('exercise_gym_scopes', 'readonly'); const req = tx.objectStore('exercise_gym_scopes').getAll(); req.onsuccess = () => resolve(req.result as ExerciseGymScope[]); req.onerror = () => reject(req.error); });
  }
  async function getExerciseGymScope(exerciseId: string): Promise<ExerciseGymScope | null> {
    const database = await openDb(); return new Promise((resolve, reject) => { const tx = database.transaction('exercise_gym_scopes', 'readonly'); const req = tx.objectStore('exercise_gym_scopes').get(exerciseId); req.onsuccess = () => resolve((req.result as ExerciseGymScope) || null); req.onerror = () => reject(req.error); });
  }
  async function saveExerciseGymScope(scope: ExerciseGymScope): Promise<void> {
    const database = await openDb(); await verifyAndRenewLease(database);
    if (!(await getExerciseById(scope.exerciseId))) throw new Error('Exercise not found');
    const gyms = await getGyms(); const ids = scope.linkedGymIds || [];
    validateExerciseGymScope(scope, new Set(gyms.map(gym => gym.id)));
    const database2 = await openDb(); await new Promise<void>((resolve, reject) => { const tx = database2.transaction('exercise_gym_scopes', 'readwrite'); tx.objectStore('exercise_gym_scopes').put(scope); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  }
  async function deleteExerciseGymScope(exerciseId: string): Promise<void> { const database = await openDb(); await verifyAndRenewLease(database); await new Promise<void>((resolve, reject) => { const tx = database.transaction('exercise_gym_scopes', 'readwrite'); tx.objectStore('exercise_gym_scopes').delete(exerciseId); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }

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
      id: (exercise as any).id || createScopedId('custom'),
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
    for (const item of exercises) {
      const repVal = validateTargetReps(item.targetReps);
      if (!repVal.isValid) {
        throw new Error(`Invalid target reps for exercise ${item.exerciseId}: ${repVal.error}`);
      }
    }

    const database = await openDb();
    await verifyAndRenewLease(database);

    const allEx = await getAllExercises();
    const routineId = existingId || createScopedId('routine');
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

    const newId = createScopedId('routine');
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
    workout = normalizeWorkout(workout);
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
        const workouts = (req.result as Workout[]).map(normalizeWorkout);
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
          gymId: w.gymId,
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
      req.onsuccess = () => resolve(req.result ? normalizeWorkout(req.result as Workout) : null);
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

  async function getPreviousSetsForExercise(
    exerciseId: string,
    occurrenceIndex: number = 0,
    currentGymId?: string,
  ): Promise<PreviousSetSuggestion[]> {
    const database = await openDb();
    const [gyms, exerciseScope, exercise] = await Promise.all([
      getGyms(),
      getExerciseGymScope(exerciseId),
      getExerciseById(exerciseId),
    ]);
    if (!exercise) return [];
    const gymNames = new Map(gyms.map(gym => [gym.id, gym.name]));
    return new Promise((resolve, reject) => {
      const tx = database.transaction('workouts', 'readonly');
      const req = tx.objectStore('workouts').getAll();
      req.onsuccess = () => {
        const workouts = (req.result as Workout[]).map(normalizeWorkout)
          .filter(workout => workout.exercises.some(item => item.exerciseId === exerciseId));
        workouts.sort((a, b) => b.startTime.localeCompare(a.startTime) || b.id.localeCompare(a.id));
        const occurrences: CompletedExerciseOccurrence[] = workouts.map(workout => {
          const matching = workout.exercises.filter(item => item.exerciseId === exerciseId);
          const requested = matching[occurrenceIndex];
          const selected = requested?.sets.some(set => set.isCompleted)
            ? requested
            : matching.find(item => item.sets.some(set => set.isCompleted));
          return {
            workoutId: workout.id,
            startTime: workout.startTime,
            gymId: workout.gymId,
            gymName: gymNames.get(workout.gymId) || 'Default Gym',
            occurrenceIndex: requested?.sets.some(set => set.isCompleted)
              ? occurrenceIndex
              : Math.max(0, matching.indexOf(selected!)),
            sets: selected?.sets
              .filter(set => set.isCompleted)
              .sort((a, b) => a.setNumber - b.setNumber || a.id.localeCompare(b.id))
              .map(set => ({ weightKg: set.weightKg, reps: set.reps })) || [],
          };
        });
        resolve(resolvePreviousSetsForExercise(exercise, occurrences, currentGymId || (gyms.find(gym => gym.isDefault) || DEFAULT_GYM).id, exerciseScope || undefined));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getExerciseStats(exerciseId: string, currentGymId: string): Promise<DualExerciseStats> {
    const database = await openDb();
    const [scope] = await Promise.all([getExerciseGymScope(exerciseId)]);
    return new Promise((resolve, reject) => {
      const tx = database.transaction('workouts', 'readonly');
      const req = tx.objectStore('workouts').getAll();
      req.onsuccess = () => {
        const workouts = (req.result as Workout[]).map(normalizeWorkout)
          .filter(workout => workout.exercises.some(item => item.exerciseId === exerciseId));
        resolve(calculateDualExerciseStats(workouts, exerciseId, currentGymId, scope || undefined));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function saveDraft(draft: WorkoutDraft): Promise<void> {
    draft = normalizeDraft(draft);
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
        const drafts = (req.result as WorkoutDraft[]).map(normalizeDraft);
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
        req.onsuccess = () => resolve(req.result ? normalizeDraft(req.result as WorkoutDraft) : null);
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

    const gyms = await getGyms();
    const exerciseGymScopes = await getExerciseGymScopes();
    return {
      workouts,
      routines,
      exercises,
      drafts,
      settings,
      gyms,
      exerciseGymScopes,
    };
  }

  async function mergeSnapshot(snapshot: DataSnapshot): Promise<void> {
    const database = await openDb();
    await verifyAndRenewLease(database);
    snapshot = canonicalizeSnapshotGyms(snapshot);

    const destinationGyms = await getGyms();
    const incomingGyms = snapshot.gyms || [];
    const knownGymIds = new Set([...destinationGyms, ...incomingGyms].map(g => g.id));
    if (new Set(incomingGyms.map(g => g.id)).size !== incomingGyms.length) throw new Error('Snapshot contains duplicate gym IDs');
    if (new Set((snapshot.exerciseGymScopes || []).map(scope => scope.exerciseId)).size !== (snapshot.exerciseGymScopes || []).length) throw new Error('Snapshot contains duplicate exercise scope IDs');
    if (incomingGyms.filter(g => g.isDefault).length > 1) throw new Error('Snapshot contains multiple default gyms');
    for (const gym of incomingGyms) {
      if (typeof gym.id !== 'string' || !gym.id.trim() || gym.id !== gym.id.trim()) throw new Error(`Invalid gym ID: ${gym.id}`);
      if (typeof gym.isDefault !== 'boolean') throw new Error(`Invalid isDefault in gym: ${gym.id}`);
      validateGymName(gym.name);
      validateGymColor(gym.color);
      if (!gym.createdAt || isNaN(Date.parse(gym.createdAt))) throw new Error(`Invalid createdAt timestamp in gym: ${gym.id}`);
    }
    const knownExerciseIds = new Set([...(await getAllExercises()).map(exercise => exercise.id), ...snapshot.exercises.map(exercise => exercise.id)]);
    const existingScopes = new Map((await getExerciseGymScopes()).map(scope => [scope.exerciseId, scope]));
    for (const scope of snapshot.exerciseGymScopes || []) {
      if (!knownExerciseIds.has(scope.exerciseId)) throw new Error(`unknown exercise: ${scope.exerciseId}`);
      if (scope.linkedGymIds !== undefined && (!Array.isArray(scope.linkedGymIds) || scope.linkedGymIds.some((id) => typeof id !== 'string'))) {
        throw new Error(`Invalid linked gym IDs in scope: ${scope.exerciseId}`);
      }
      validateExerciseGymScope(scope, knownGymIds);
      const existingScope = existingScopes.get(scope.exerciseId);
      if (existingScope && !scopesAreIdentical(scope, existingScope)) throw new Error(`Conflicting exercise gym scope: ${scope.exerciseId}`);
    }
    for (const workout of snapshot.workouts) {
      if (typeof workout.gymId !== 'string' || !knownGymIds.has(workout.gymId)) throw new Error(`Workout references missing gym: ${workout.gymId}`);
    }
    for (const draft of snapshot.drafts) {
      if (typeof draft.workout.gymId !== 'string' || !knownGymIds.has(draft.workout.gymId)) throw new Error(`Draft references missing gym: ${draft.workout.gymId}`);
    }

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['exercises', 'routines', 'workouts', 'workout_drafts', 'settings', 'gyms', 'exercise_gym_scopes'], 'readwrite');

      const gymStore = tx.objectStore('gyms');
      const destinationGymIds = new Set(destinationGyms.map((gym) => gym.id));
      for (const gym of incomingGyms) {
        if (!destinationGymIds.has(gym.id)) gymStore.put({ ...gym, isDefault: false });
      }
      const scopeStore = tx.objectStore('exercise_gym_scopes');
      for (const scope of snapshot.exerciseGymScopes || []) {
        if (!existingScopes.has(scope.exerciseId)) scopeStore.put(scope);
      }

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
        wStore.put(normalizeWorkout(w));
      }

      const dStore = tx.objectStore('workout_drafts');
      for (const d of snapshot.drafts) {
        dStore.put({
          ...normalizeDraft(d),
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
    getSetting,
    setSetting,
    renameFolder,
    deleteFolder,
  };
}
