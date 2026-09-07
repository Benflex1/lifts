import { Store, WorkoutDraft } from '../database/contract';
import { Workout } from '../types';

export type SessionPhase = 'idle' | 'starting' | 'active' | 'finishing' | 'discarding';

export interface SessionState {
  phase: SessionPhase;
  workout: Workout | null;
  restTimer: { endsAt: number; totalSeconds: number } | null;
  persistenceError: Error | null;
  revision: number;
}

export interface SessionControllerOptions {
  maxDirtyTimeMs?: number;
}

export interface SessionController {
  start(workout: Workout): Promise<void>;
  update(workout: Workout, restTimer?: { endsAt: number; totalSeconds: number } | null): void;
  flush(): Promise<void>;
  resume(draft: WorkoutDraft): void;
  finish(): Promise<Workout>;
  discard(): Promise<void>;
  getState(): SessionState;
  subscribe(listener: (state: SessionState) => void): () => void;
  updateClock?(clock: () => number): void;
}

export function createSessionController(
  store: Store,
  nowFn: () => number = () => Date.now(),
  options?: SessionControllerOptions
): SessionController {
  let getNow = nowFn;
  const maxDirtyTimeMs = options?.maxDirtyTimeMs || 3000;

  let state: SessionState = {
    phase: 'idle',
    workout: null,
    restTimer: null,
    persistenceError: null,
    revision: 0,
  };

  const listeners = new Set<(s: SessionState) => void>();
  let saveTimer: any = null;
  let isDirty = false;
  let firstDirtyTime: number | null = null;
  let inFlightWrite: Promise<void> | null = null;

  function notify(): void {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (_) {}
    }
  }

  function clearAutosave(): void {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    isDirty = false;
    firstDirtyTime = null;
  }

  async function drainInFlightWrite(): Promise<void> {
    if (inFlightWrite) {
      try {
        await inFlightWrite;
      } catch (_) {}
    }
  }

  async function start(workout: Workout): Promise<void> {
    if (state.phase !== 'idle') {
      throw new Error('Cannot start workout: a workout session is already in progress');
    }

    state.phase = 'starting';
    state.persistenceError = null;
    notify();

    const currentNow = getNow();
    const durationSeconds = Math.max(0, Math.floor((currentNow - new Date(workout.startTime).getTime()) / 1000));
    const activeWorkout: Workout = {
      ...workout,
      durationSeconds,
    };

    const draft: WorkoutDraft = {
      version: 1,
      workout: activeWorkout,
      savedAt: new Date(currentNow).toISOString(),
      revision: 1,
      restTimer: null,
    };

    try {
      await store.saveDraft(draft);
      state = {
        phase: 'active',
        workout: activeWorkout,
        restTimer: null,
        persistenceError: null,
        revision: 1,
      };
      notify();
    } catch (err: any) {
      state = {
        phase: 'idle',
        workout: null,
        restTimer: null,
        persistenceError: err,
        revision: 0,
      };
      notify();
      throw err;
    }
  }

  function update(workout: Workout, restTimer?: { endsAt: number; totalSeconds: number } | null): void {
    if (state.phase !== 'active' || !state.workout) {
      return;
    }

    const currentNow = getNow();
    const durationSeconds = Math.max(0, Math.floor((currentNow - new Date(workout.startTime).getTime()) / 1000));

    state.workout = {
      ...workout,
      durationSeconds,
    };
    if (restTimer !== undefined) {
      state.restTimer = restTimer;
    }
    state.revision += 1;
    notify();

    isDirty = true;
    if (firstDirtyTime === null) {
      firstDirtyTime = currentNow;
    }

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    const elapsedDirty = currentNow - firstDirtyTime;
    if (elapsedDirty >= maxDirtyTimeMs) {
      flush().catch(() => {});
    } else {
      const waitTime = Math.min(1000, maxDirtyTimeMs - elapsedDirty);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        flush().catch(() => {});
      }, waitTime);
    }
  }

  async function flush(): Promise<void> {
    if (state.phase !== 'active' || !state.workout) {
      return;
    }

    clearAutosave();
    await drainInFlightWrite();

    if (state.phase !== 'active' || !state.workout) {
      return;
    }

    const targetRevision = state.revision;
    const currentNow = getNow();
    const durationSeconds = Math.max(0, Math.floor((currentNow - new Date(state.workout.startTime).getTime()) / 1000));
    const draftWorkout: Workout = {
      ...state.workout,
      durationSeconds,
    };

    const draft: WorkoutDraft = {
      version: 1,
      workout: draftWorkout,
      savedAt: new Date(currentNow).toISOString(),
      revision: targetRevision,
      restTimer: state.restTimer,
    };

    const writePromise = store.saveDraft(draft);
    inFlightWrite = writePromise;

    try {
      await writePromise;
      if (state.revision === targetRevision) {
        state.persistenceError = null;
      }
    } catch (err: any) {
      state.persistenceError = err;
      notify();
      throw err;
    } finally {
      if (inFlightWrite === writePromise) {
        inFlightWrite = null;
      }
    }
  }

  function resume(draft: WorkoutDraft): void {
    if (state.phase !== 'idle') {
      throw new Error('Cannot resume workout: another session is in progress');
    }

    clearAutosave();

    const currentNow = getNow();
    const durationSeconds = Math.max(0, Math.floor((currentNow - new Date(draft.workout.startTime).getTime()) / 1000));

    let restTimer = draft.restTimer;
    if (restTimer && restTimer.endsAt <= currentNow) {
      restTimer = null;
    }

    state = {
      phase: 'active',
      workout: {
        ...draft.workout,
        durationSeconds,
      },
      restTimer,
      persistenceError: null,
      revision: draft.revision || 1,
    };
    notify();
  }

  async function finish(): Promise<Workout> {
    if (state.phase !== 'active' || !state.workout) {
      throw new Error('Cannot finish workout: no active workout');
    }

    clearAutosave();
    state.phase = 'finishing';
    notify();

    await drainInFlightWrite();

    const finalNow = getNow();
    const finalDuration = Math.max(0, Math.floor((finalNow - new Date(state.workout.startTime).getTime()) / 1000));
    const calculatedVolume = (state.workout.exercises || []).reduce(
      (sum, ex) =>
        sum +
        (ex.sets || [])
          .filter((s) => s.isCompleted)
          .reduce((sSum, s) => sSum + s.weightKg * s.reps, 0),
      0
    );

    const completedWorkout: Workout = {
      ...state.workout,
      endTime: new Date(finalNow).toISOString(),
      durationSeconds: finalDuration,
      totalVolumeKg: state.workout.totalVolumeKg || calculatedVolume,
    };

    try {
      await store.finishWorkout(completedWorkout);
      state = {
        phase: 'idle',
        workout: null,
        restTimer: null,
        persistenceError: null,
        revision: 0,
      };
      notify();
      return completedWorkout;
    } catch (err: any) {
      state.phase = 'active';
      state.persistenceError = err;
      notify();
      throw err;
    }
  }

  async function discard(): Promise<void> {
    if (state.phase !== 'active' || !state.workout) {
      throw new Error('Cannot discard workout: no active workout');
    }

    clearAutosave();
    const workoutId = state.workout.id;
    state.phase = 'discarding';
    notify();

    await drainInFlightWrite();

    try {
      await store.discardDraft(workoutId);
      state = {
        phase: 'idle',
        workout: null,
        restTimer: null,
        persistenceError: null,
        revision: 0,
      };
      notify();
    } catch (err: any) {
      state.phase = 'active';
      state.persistenceError = err;
      notify();
      throw err;
    }
  }

  return {
    start,
    update,
    flush,
    resume,
    finish,
    discard,
    getState: () => state,
    subscribe: (listener: (s: SessionState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateClock: (clock: () => number) => {
      getNow = clock;
    },
  };
}
