import { DualExerciseStats, Exercise, ExerciseGymScope, Gym, PreviousSetSuggestion, Routine, Workout, WorkoutHistorySummary } from '../types';
import { DataSnapshot, Store, WorkoutDraft } from './contract';
import type { HealthProviderId, HealthSyncRecord, HealthSyncStatus } from '../health/contract';
import { BUNDLED_EXERCISE_CATALOG_VERSION, getDefaultExercises, buildDefaultRoutines } from './seedData';
import { smartSearchExercises } from '../utils/search';
import { CompletedExerciseOccurrence, resolvePreviousSetsForExercise } from '../workout/gym-history';
import { calculateDualExerciseStats } from '../workout/gym-records';
import { createScopedId } from '../utils/ids';
import { reportError } from '../utils/errorReporting';
import { validateTargetReps } from '../workout/sets';
import {
  DEFAULT_GYM_COLOR,
  validateGymColor,
  validateGymName,
  validateWorkoutGymId,
} from '../workout/gym-profile';
import { validateExerciseGymScope } from '../workout/gym-scope';
import {
  canonicalizeSnapshotGyms,
  compareBinaryStrings,
  normalizeDraftRecord,
  normalizeExerciseRecord,
  normalizeRoutineRecord,
  normalizeWorkoutRecord,
  planGymDeletion,
  planSnapshotMerge,
} from './storeCore';
import { asCompletedRecord, isInProgressRecord } from './workoutRecord';

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

function compareHealthSyncRecords(a: HealthSyncRecord, b: HealthSyncRecord): number {
  return compareBinaryStrings(a.attemptedAt, b.attemptedAt)
    || compareBinaryStrings(a.workoutId, b.workoutId)
    || compareBinaryStrings(a.provider, b.provider);
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
          reportError(err, { scope: 'webStore.read-only-listener' });
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
      } catch {
        // Best-effort heartbeat; lease loss is surfaced through onReadOnlyChange listeners.
      }
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
      } catch {
        // Intentional: a failed renewal resolves; the next heartbeat or focus check retries.
        resolve();
      }
    });
  }

  async function openDb(): Promise<IDBDatabase> {
    if (db) return db;

    return new Promise((resolve, reject) => {
      const req = idb.open(name, 4);

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
          gyms.put(DEFAULT_GYM);
        }
        if (!d.objectStoreNames.contains('exercise_gym_scopes')) {
          const scopes = d.createObjectStore('exercise_gym_scopes', { keyPath: 'exerciseId' });
          scopes.createIndex('scopeType', 'scopeType', { unique: false });
          scopes.createIndex('linkedGymIds', 'linkedGymIds', { unique: false, multiEntry: true });
        }
        if (!d.objectStoreNames.contains('health_sync_records')) {
          const health = d.createObjectStore('health_sync_records', {
            keyPath: ['workoutId', 'provider'],
          });
          health.createIndex('status', 'status', { unique: false });
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
            // Preserve the persisted write revision across lease handovers so
            // readers never observe it moving backwards.
            dataRevision: typeof lease?.dataRevision === 'number' ? lease.dataRevision : 0,
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
            // Every mutating operation funnels through here; bumping the
            // persisted revision in this same single write makes data changes
            // visible to every tab, not just the writer.
            dataRevision: (typeof lease.dataRevision === 'number' ? lease.dataRevision : 0) + 1,
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

  async function synchronizeDefaultExercises(database: IDBDatabase): Promise<void> {
    if (readOnlyMode) return;

    await new Promise<void>((resolve, reject) => {
      let lease: any;
      let catalogVersion: any;
      let exercises: Exercise[];
      let leaseReady = false;
      let catalogVersionReady = false;
      let exercisesReady = false;
      let synchronized = false;
      let skippedAfterLeaseLoss = false;

      const tx = database.transaction(['exercises', 'metadata'], 'readwrite');
      const exerciseStore = tx.objectStore('exercises');
      const metadataStore = tx.objectStore('metadata');

      const abortAfterLeaseLoss = () => {
        skippedAfterLeaseLoss = true;
        setReadOnly(true);
        try {
          tx.abort();
        } catch (_) {
          // The transaction may already be completing.
        }
      };

      const maybeSynchronize = () => {
        if (!leaseReady || !catalogVersionReady || !exercisesReady) return;
        if (!lease || lease.ownerId !== tabOwnerId) {
          abortAfterLeaseLoss();
          return;
        }
        if (catalogVersion?.value === String(BUNDLED_EXERCISE_CATALOG_VERSION)) return;

        // Only reaches here when the stored catalog version is stale, so warm
        // launches never parse the bundled JSON (PERF-06).
        const existingById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
        for (const exercise of getDefaultExercises()) {
          const existing = existingById.get(exercise.id);
          if (existing?.isCustom) continue;
          exerciseStore.put({ ...exercise, isCustom: false });
        }
        metadataStore.put({ key: 'exercise_catalog_version', value: String(BUNDLED_EXERCISE_CATALOG_VERSION) });
        metadataStore.put({ key: 'exercises_seeded', value: '1' });
        synchronized = true;
      };

      const leaseRequest = metadataStore.get('writer_lease');
      leaseRequest.onsuccess = () => {
        lease = leaseRequest.result;
        leaseReady = true;
        maybeSynchronize();
      };
      leaseRequest.onerror = () => reject(leaseRequest.error);

      const catalogVersionRequest = metadataStore.get('exercise_catalog_version');
      catalogVersionRequest.onsuccess = () => {
        catalogVersion = catalogVersionRequest.result;
        catalogVersionReady = true;
        maybeSynchronize();
      };
      catalogVersionRequest.onerror = () => reject(catalogVersionRequest.error);

      const exercisesRequest = exerciseStore.getAll();
      exercisesRequest.onsuccess = () => {
        exercises = exercisesRequest.result as Exercise[];
        exercisesReady = true;
        maybeSynchronize();
      };
      exercisesRequest.onerror = () => reject(exercisesRequest.error);

      tx.oncomplete = () => {
        if (synchronized) cachedExercises = null;
        resolve();
      };
      tx.onerror = () => {
        if (!skippedAfterLeaseLoss) reject(tx.error);
      };
      tx.onabort = () => {
        if (skippedAfterLeaseLoss) resolve();
        else reject(tx.error || new Error('Exercise catalog synchronization aborted'));
      };
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
            const normalized = normalizeWorkoutRecord(workout);
            if (normalized !== workout) workoutStore.put(normalized);
          }
        };
        draftsReq.onsuccess = () => {
          for (const draft of draftsReq.result as WorkoutDraft[]) {
            const normalized = normalizeDraftRecord(draft);
            if (normalized !== draft) draftStore.put(normalized);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      await synchronizeDefaultExercises(database);

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
        const normalized = list.map(normalizeExerciseRecord);
        normalized.sort((a, b) => a.name.localeCompare(b.name));
        cachedExercises = normalized;
        resolve(normalized);
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

  async function deleteGym(id: string, replacementGymId: string, activeWorkoutGymId?: string | null): Promise<void> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    const [gyms, drafts, scopes, rawWorkouts] = await Promise.all([
      getGyms(),
      getWorkoutDrafts(),
      getExerciseGymScopes(),
      new Promise<Workout[]>((resolve, reject) => {
        const tx = database.transaction('workouts', 'readonly');
        const req = tx.objectStore('workouts').getAll();
        req.onsuccess = () => resolve((req.result as Workout[]) || []);
        req.onerror = () => reject(req.error);
      }),
    ]);

    const plan = planGymDeletion({
      gymId: id,
      replacementGymId,
      gyms,
      activeWorkoutGymId,
      drafts,
      scopes,
      inProgressWorkoutIds: rawWorkouts
        .filter((record) => isInProgressRecord(record) && (record.gymId || 'gym-default') === id)
        .map((record) => record.id),
    });

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['gyms', 'workouts', 'workout_drafts', 'exercise_gym_scopes'], 'readwrite');
      const gymsStore = tx.objectStore('gyms');
      const workoutsStore = tx.objectStore('workouts');
      const draftsStore = tx.objectStore('workout_drafts');
      const scopesStore = tx.objectStore('exercise_gym_scopes');

      for (const record of rawWorkouts) {
        if ((record.gymId || 'gym-default') === id) workoutsStore.put({ ...record, gymId: replacementGymId });
      }
      for (const { id: draftId, draft } of plan.reassignDrafts) draftsStore.put({ ...draft, id: draftId });
      for (const { exerciseId, scope } of plan.scopeWrites) {
        if (scope) scopesStore.put(scope);
        else scopesStore.delete(exerciseId);
      }
      if (plan.makeDefault) {
        for (const gym of gyms) gymsStore.put({ ...gym, isDefault: gym.id === replacementGymId });
      }
      gymsStore.delete(id);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
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
      req.onsuccess = () => resolve(req.result ? normalizeExerciseRecord(req.result as Exercise) : null);
      req.onerror = () => reject(req.error);
    });
  }

  async function createCustomExercise(exercise: Omit<Exercise, 'id' | 'isCustom'>): Promise<Exercise> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    const custom = normalizeExerciseRecord({
      ...exercise,
      id: (exercise as any).id || createScopedId('custom'),
      isCustom: true,
    });

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('exercises', 'readwrite');
      tx.objectStore('exercises').put(custom);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    cachedExercises = null;
    return custom;
  }

  async function updateCustomExercise(
    id: string,
    updates: {
      name?: string;
      category?: string;
      equipment?: string;
      primaryMuscles?: string[];
      secondaryMuscles?: string[];
      instructions?: string[];
      instructionUrl?: string;
      instructionUrlType?: 'website' | 'youtube';
    }
  ): Promise<Exercise> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    const existing = await new Promise<Exercise | null>((resolve, reject) => {
      const tx = database.transaction('exercises', 'readonly');
      const req = tx.objectStore('exercises').get(id);
      req.onsuccess = () => resolve((req.result as Exercise) || null);
      req.onerror = () => reject(req.error);
    });

    if (!existing) {
      throw new Error(`Exercise with id "${id}" not found`);
    }
    if (!existing.isCustom) {
      throw new Error(`Cannot edit built-in exercise "${id}"`);
    }

    const updatedName = updates.name !== undefined ? updates.name.trim() : existing.name;
    if (!updatedName) {
      throw new Error('Exercise name cannot be empty');
    }

    const updated = normalizeExerciseRecord({
      ...existing,
      ...updates,
      name: updatedName,
      equipment: updates.equipment !== undefined ? updates.equipment.toLowerCase() : existing.equipment,
      id,
      isCustom: true,
    });

    // 1. Update exercises table
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('exercises', 'readwrite');
      tx.objectStore('exercises').put(updated);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // 2. Update embedded exercise in routines
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('routines', 'readwrite');
      const store = tx.objectStore('routines');
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const routines = (getAllReq.result as Routine[]) || [];
        for (const r of routines) {
          let touched = false;
          if (r.exercises) {
            for (const re of r.exercises) {
              if (re.exerciseId === id) {
                re.exercise = { ...re.exercise, ...updated };
                touched = true;
              }
            }
          }
          if (touched) {
            store.put(r);
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // 3. Update embedded exercise in workouts
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('workouts', 'readwrite');
      const store = tx.objectStore('workouts');
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const workouts = (getAllReq.result as Workout[]) || [];
        for (const w of workouts) {
          let touched = false;
          if (w.exercises) {
            for (const we of w.exercises) {
              if (we.exerciseId === id) {
                we.exercise = { ...we.exercise, ...updated };
                touched = true;
              }
            }
          }
          if (touched) {
            store.put(w);
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // 4. Update embedded exercise in workout_drafts
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('workout_drafts', 'readwrite');
      const store = tx.objectStore('workout_drafts');
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const drafts = (getAllReq.result as WorkoutDraft[]) || [];
        for (const d of drafts) {
          let touched = false;
          if (d.workout?.exercises) {
            for (const we of d.workout.exercises) {
              if (we.exerciseId === id) {
                we.exercise = { ...we.exercise, ...updated };
                touched = true;
              }
            }
          }
          if (touched) {
            store.put(d);
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    cachedExercises = null;
    return updated;
  }

  async function getRoutines(): Promise<Routine[]> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('routines', 'readonly');
      const req = tx.objectStore('routines').getAll();
      req.onsuccess = () => {
        const routines = req.result as Routine[];
        routines.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        resolve(routines.map(normalizeRoutineRecord));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getRoutineById(id: string): Promise<Routine | null> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('routines', 'readonly');
      const req = tx.objectStore('routines').get(id);
      req.onsuccess = () => resolve(req.result ? normalizeRoutineRecord(req.result as Routine) : null);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveRoutine(
    name: string,
    folderName: string,
    exercises: { exerciseId: string; targetSets: number; targetReps: string; restTimerSeconds: number; supersetId?: string }[],
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
        supersetId: item.supersetId,
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
    const supersetMap = new Map<string, string>();
    const copy: Routine = {
      ...original,
      id: newId,
      name: `${original.name} (Copy)`,
      createdAt: new Date().toISOString(),
      exercises: original.exercises.map((e, idx) => {
        let remappedSupersetId: string | undefined = undefined;
        if (e.supersetId) {
          if (!supersetMap.has(e.supersetId)) {
            supersetMap.set(e.supersetId, createScopedId('ss'));
          }
          remappedSupersetId = supersetMap.get(e.supersetId);
        }
        return {
          ...e,
          id: `re-${newId}-${idx}`,
          supersetId: remappedSupersetId,
        };
      }),
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
      const tx = database.transaction(['gyms', 'workouts', 'routines', 'workout_drafts'], 'readwrite');
      let validationError: unknown = null;
      let settled = false;
      const rejectOnce = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      tx.onerror = () => rejectOnce(tx.error);
      tx.onabort = () => rejectOnce(validationError || tx.error || new Error('Workout save aborted'));

      const gymRequest = tx.objectStore('gyms').getAll();
      gymRequest.onerror = () => {
        validationError = gymRequest.error;
        tx.abort();
      };
      gymRequest.onsuccess = () => {
        try {
          const gymId = validateWorkoutGymId(workout.gymId, gymRequest.result as Gym[]);
          const validatedWorkout = normalizeWorkoutRecord({ ...workout, gymId });
          // Only completed workouts belong in the workouts store; the explicit
          // marker mirrors native's `in_progress = 0` write and lets every read
          // path filter foreign records with the same rule.
          tx.objectStore('workouts').put(asCompletedRecord(validatedWorkout));

          if (validatedWorkout.routineId) {
            const rtStore = tx.objectStore('routines');
            const getReq = rtStore.get(validatedWorkout.routineId);
            getReq.onsuccess = () => {
              const r = getReq.result as Routine | undefined;
              if (r) {
                r.lastPerformedAt = validatedWorkout.endTime || validatedWorkout.startTime;
                rtStore.put(r);
              }
            };
          }

          // Remove from drafts in same transaction
          tx.objectStore('workout_drafts').delete(validatedWorkout.id);
        } catch (error) {
          validationError = error;
          tx.abort();
        }
      };
    });
  }

  async function saveCompletedWorkout(workout: Workout): Promise<void> {
    return finishWorkout(workout);
  }

  /** Reads every stored workout once, newest first. Shared by history and snapshot reads. */
  async function getAllWorkoutsSorted(): Promise<Workout[]> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('workouts', 'readonly');
      const req = tx.objectStore('workouts').getAll();
      req.onsuccess = () => {
        const workouts = (req.result as Workout[])
          .filter(record => !isInProgressRecord(record))
          .map(normalizeWorkoutRecord);
        workouts.sort((a, b) => b.startTime.localeCompare(a.startTime) || compareBinaryStrings(b.id, a.id));
        resolve(workouts);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getWorkoutHistory(): Promise<WorkoutHistorySummary[]> {
    const workouts = await getAllWorkoutsSorted();
    return workouts.map(w => ({
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
      hasSupersets: w.exercises.some(e => Boolean(e.supersetId)),
    }));
  }

  async function getWorkoutDetail(workoutId: string): Promise<Workout | null> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('workouts', 'readonly');
      const req = tx.objectStore('workouts').get(workoutId);
      req.onsuccess = () => {
        const record = req.result as Workout | undefined;
        // Mirrors native's `AND in_progress = 0` guard on the detail query.
        resolve(record && !isInProgressRecord(record) ? normalizeWorkoutRecord(record) : null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteWorkout(workoutId: string): Promise<void> {
    const database = await openDb();
    await verifyAndRenewLease(database);

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['workouts', 'health_sync_records'], 'readwrite');
      tx.objectStore('workouts').delete(workoutId);
      const healthStore = tx.objectStore('health_sync_records');
      const healthRows = healthStore.getAll();
      healthRows.onsuccess = () => {
        for (const row of healthRows.result as HealthSyncRecord[]) {
          if (row.workoutId === workoutId) healthStore.delete([row.workoutId, row.provider]);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getHealthSyncRecord(workoutId: string, provider: HealthProviderId): Promise<HealthSyncRecord | null> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('health_sync_records', 'readonly');
      const request = tx.objectStore('health_sync_records').get([workoutId, provider]);
      request.onsuccess = () => resolve((request.result as HealthSyncRecord) || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function getHealthSyncRecords(status?: HealthSyncStatus): Promise<HealthSyncRecord[]> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('health_sync_records', 'readonly');
      const request = tx.objectStore('health_sync_records').getAll();
      request.onsuccess = () => {
        const rows = (request.result as HealthSyncRecord[])
          .filter(record => status === undefined || record.status === status)
          .sort(compareHealthSyncRecords);
        resolve(rows);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function saveHealthSyncRecord(record: HealthSyncRecord): Promise<void> {
    const database = await openDb();
    await verifyAndRenewLease(database);
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('health_sync_records', 'readwrite');
      tx.objectStore('health_sync_records').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Health sync record save aborted'));
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
        const workouts = (req.result as Workout[])
          .filter(record => !isInProgressRecord(record))
          .map(normalizeWorkoutRecord)
          .filter(workout => workout.exercises.some(item => item.exerciseId === exerciseId));
        workouts.sort((a, b) => b.startTime.localeCompare(a.startTime) || compareBinaryStrings(b.id, a.id));
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
              .sort((a, b) => a.setNumber - b.setNumber || compareBinaryStrings(a.id, b.id))
              .map(set => ({ weightKg: set.weightKg, reps: set.reps })) || [],
          };
        });
        resolve(resolvePreviousSetsForExercise(exercise, occurrences, currentGymId || (gyms.find(gym => gym.isDefault) || DEFAULT_GYM).id, exerciseScope || undefined));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getCompletedWorkoutsForExercises(exerciseIds: string[]): Promise<Record<string, Workout[]>> {
    const database = await openDb();
    const idSet = new Set(exerciseIds);
    return new Promise((resolve, reject) => {
      const tx = database.transaction('workouts', 'readonly');
      const req = tx.objectStore('workouts').getAll();
      req.onsuccess = () => {
        const allWorkouts = (req.result as Workout[])
          .filter(record => !isInProgressRecord(record))
          .map(normalizeWorkoutRecord);
        allWorkouts.sort((a, b) => b.startTime.localeCompare(a.startTime) || compareBinaryStrings(b.id, a.id));
        const result: Record<string, Workout[]> = {};
        for (const id of idSet) {
          result[id] = allWorkouts.filter(workout => workout.exercises.some(item => item.exerciseId === id));
        }
        resolve(result);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getCompletedWorkoutsForExercise(exerciseId: string): Promise<Workout[]> {
    const results = await getCompletedWorkoutsForExercises([exerciseId]);
    return results[exerciseId] || [];
  }

  async function getExerciseStats(exerciseId: string, currentGymId?: string): Promise<DualExerciseStats> {
    const database = await openDb();
    const [scope] = await Promise.all([getExerciseGymScope(exerciseId)]);
    const gymId = currentGymId || (await getDefaultGym()).id;
    return new Promise((resolve, reject) => {
      const tx = database.transaction('workouts', 'readonly');
      const req = tx.objectStore('workouts').getAll();
      req.onsuccess = () => {
        const workouts = (req.result as Workout[])
          .filter(record => !isInProgressRecord(record))
          .map(normalizeWorkoutRecord)
          .filter(workout => workout.exercises.some(item => item.exerciseId === exerciseId));
        resolve(calculateDualExerciseStats(workouts, exerciseId, gymId, scope || undefined));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function reassignExerciseHistory(
    sourceExerciseId: string,
    targetExerciseId: string
  ): Promise<{ updatedWorkouts: number; updatedSets: number }> {
    if (!sourceExerciseId || !targetExerciseId || sourceExerciseId === targetExerciseId) {
      return { updatedWorkouts: 0, updatedSets: 0 };
    }

    const database = await openDb();
    await verifyAndRenewLease(database);

    const targetExercise = await getExerciseById(targetExerciseId);
    if (!targetExercise) {
      throw new Error(`Target exercise ${targetExerciseId} does not exist.`);
    }

    return new Promise((resolve, reject) => {
      const tx = database.transaction(['workouts', 'routines'], 'readwrite');
      const workoutStore = tx.objectStore('workouts');
      const routineStore = tx.objectStore('routines');

      let updatedWorkouts = 0;
      let updatedSets = 0;

      const workoutReq = workoutStore.getAll();
      workoutReq.onsuccess = () => {
        // In-progress records are excluded from every history read, so history
        // reassignment must not rewrite them either.
        const workouts = ((workoutReq.result as Workout[]) || [])
          .filter(record => !isInProgressRecord(record))
          .map(normalizeWorkoutRecord);
        for (const w of workouts) {
          let hasMatch = false;
          let workoutSetCount = 0;
          const updatedExercises = (w.exercises || []).map(we => {
            if (we.exerciseId === sourceExerciseId) {
              hasMatch = true;
              workoutSetCount += (we.sets || []).length;
              return {
                ...we,
                exerciseId: targetExerciseId,
                exercise: targetExercise,
              };
            }
            return we;
          });

          if (hasMatch) {
            updatedWorkouts++;
            updatedSets += workoutSetCount;
            workoutStore.put({
              ...w,
              exercises: updatedExercises,
            });
          }
        }
      };

      const routineReq = routineStore.getAll();
      routineReq.onsuccess = () => {
        const routines = (routineReq.result as Routine[]) || [];
        for (const r of routines) {
          let hasMatch = false;
          const updatedExercises = (r.exercises || []).map(re => {
            if (re.exerciseId === sourceExerciseId) {
              hasMatch = true;
              return {
                ...re,
                exerciseId: targetExerciseId,
                exercise: targetExercise,
              };
            }
            return re;
          });

          if (hasMatch) {
            routineStore.put({
              ...r,
              exercises: updatedExercises,
            });
          }
        }
      };

      tx.oncomplete = () => resolve({ updatedWorkouts, updatedSets });
      tx.onerror = () => reject(tx.error);
    });
  }

  async function saveDraft(draft: WorkoutDraft): Promise<void> {
    draft = normalizeDraftRecord(draft);
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
        const drafts = (req.result as WorkoutDraft[]).map(normalizeDraftRecord);
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
        req.onsuccess = () => resolve(req.result ? normalizeDraftRecord(req.result as WorkoutDraft) : null);
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

  /**
   * Persisted monotonic write revision, bumped inside the lease transaction by
   * every mutating operation. Because it lives in IndexedDB, a tab that was
   * read-only while another tab wrote sees the change immediately.
   */
  async function getDataRevision(): Promise<number> {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('metadata', 'readonly');
      const req = tx.objectStore('metadata').get('writer_lease');
      req.onsuccess = () => {
        const lease = req.result;
        resolve(typeof lease?.dataRevision === 'number' ? lease.dataRevision : 0);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function readSnapshot(): Promise<DataSnapshot> {
    // Full workout objects live in the `workouts` store, so one read replaces the former
    // per-history-row detail lookups (N+1 IndexedDB round trips).
    const workouts = await getAllWorkoutsSorted();
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

    const existing = await readSnapshot();
    const plan = planSnapshotMerge(snapshot, existing);

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['exercises', 'routines', 'workouts', 'workout_drafts', 'settings', 'gyms', 'exercise_gym_scopes'], 'readwrite');

      const gymStore = tx.objectStore('gyms');
      for (const gym of plan.gymsToInsert) gymStore.put(gym);

      const scopeStore = tx.objectStore('exercise_gym_scopes');
      for (const scope of plan.scopesToInsert) scopeStore.put(scope);

      const exStore = tx.objectStore('exercises');
      for (const exercise of plan.exercisesToUpsert) exStore.put(exercise);

      const rtStore = tx.objectStore('routines');
      for (const routine of plan.routinesToUpsert) rtStore.put(routine);

      // Imported workouts are stored as completed records, mirroring native's
      // `in_progress = 0` insert.
      const wStore = tx.objectStore('workouts');
      for (const workout of plan.workoutsToUpsert) wStore.put(workout);

      const dStore = tx.objectStore('workout_drafts');
      for (const { id, draft } of plan.draftsToUpsert) dStore.put({ ...draft, id });

      const sStore = tx.objectStore('settings');
      for (const { key, value } of plan.settingsToInsert) sStore.put({ key, value });

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
    } catch {
      // Best-effort lease release during shutdown; the lease expires on its own if this fails.
    }
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
    getDataRevision,
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
    getHealthSyncRecord,
    getHealthSyncRecords,
    saveHealthSyncRecord,
    getPreviousSetsForExercise,
    getCompletedWorkoutsForExercise,
    getCompletedWorkoutsForExercises,
    getExerciseStats,
    reassignExerciseHistory,
    getAllExercises,
    searchExercises,
    getExerciseById,
    createCustomExercise,
    updateCustomExercise,
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
