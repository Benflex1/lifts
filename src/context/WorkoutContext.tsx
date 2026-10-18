import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActiveExercise, Exercise, Gym, Routine, SetType, TrackingType, Workout, WorkoutSet } from '../types';
import { WorkoutDraft } from '../database/contract';
import { StartWorkoutOptions } from '../workout/gym-session';
import { enqueueCompletedWorkoutSync } from '../health';
import { reportError } from '../utils/errorReporting';
import { useSessionControllerBridge } from './workout/useSessionControllerBridge';
import { IDLE_REST_TIMER, RestTimerState, useRestTimerEngine } from './workout/useRestTimerEngine';
import { useGymSwitcher } from './workout/useGymSwitcher';
import { useExerciseAccordion } from './workout/useExerciseAccordion';
import { useDraftRecovery } from './workout/useDraftRecovery';
import { useHealthSyncBridge } from './workout/useHealthSyncBridge';
import { useWorkoutMutations } from './workout/useWorkoutMutations';

interface WorkoutContextType {
  activeWorkout: Workout | null;
  isWorkingOut: boolean;
  isMinimized: boolean;
  draftAvailable: Workout | null;
  availableDrafts: WorkoutDraft[];
  isDraftModalOpen: boolean;
  openDraftModal: () => void;
  closeDraftModal: () => void;
  resumeDraft: (draft?: WorkoutDraft) => void;
  discardDraft: (draftId?: string) => Promise<void>;
  startWorkout: (
    routine?: Routine,
    customName?: string,
    initialExercises?: ActiveExercise[],
    options?: StartWorkoutOptions,
  ) => Promise<boolean>;
  gyms: Gym[];
  activeGym: Gym | null;
  refreshGyms: () => Promise<void>;
  setActiveGym: (gymId: string) => Promise<void>;
  minimizeWorkout: () => void;
  maximizeWorkout: () => void;
  addExerciseToWorkout: (exercise: Exercise) => Promise<void>;
  addExercisesToWorkout: (exercises: Exercise[]) => Promise<void>;
  removeExerciseFromWorkout: (activeExerciseId: string) => void;
  moveExercise: (activeExerciseId: string, direction: -1 | 1) => void;
  moveExerciseToIndex: (activeExerciseId: string, targetIndex: number) => void;
  swapExercise: (activeExerciseId: string, exercise: Exercise) => void | Promise<void>;
  addSet: (activeExerciseId: string, setType?: SetType) => void;
  insertWarmupSets: (
    activeExerciseId: string,
    warmupSets: { weightKg: number; reps: number }[],
    replaceExisting?: boolean
  ) => void;
  linkSuperset: (firstExerciseId: string, secondExerciseId: string) => void;
  unlinkSuperset: (exerciseId: string) => void;
  setSupersetGroup: (selectedExerciseIds: string[]) => void;
  removeSet: (activeExerciseId: string, setId: string) => void;
  moveSet: (activeExerciseId: string, setId: string, direction: -1 | 1) => void;
  updateSet: (activeExerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  updateExerciseNotes: (activeExerciseId: string, notes: string) => void;
  updateExerciseRestTimer: (activeExerciseId: string, seconds: number) => void;
  /** Switches an active exercise's tracking type, un-completing sets that no longer validate. */
  setExerciseTrackingType: (activeExerciseId: string, type: TrackingType) => void;
  updateWorkoutDuration: (seconds: number) => void;
  toggleSetComplete: (activeExerciseId: string, setId: string) => void;
  startRestTimer: (seconds: number, exerciseName?: string) => void;
  adjustRestTimer: (deltaSeconds: number) => void;
  stopRestTimer: () => void;
  finishWorkout: (durationSecondsOverride?: number) => Promise<Workout | null>;
  cancelWorkout: () => void;
  /** Retries the failed draft write that produced `persistenceError`. Rejects if it fails again. */
  retryPersistence: () => Promise<void>;
  expandedExercises: Record<string, boolean>;
  toggleExerciseExpanded: (activeExerciseId: string) => void;
  setExerciseExpanded: (activeExerciseId: string, expanded: boolean) => void;
  expandAllExercises: () => void;
  collapseAllExercises: () => void;
}

type EnqueueWorkoutHealthSync = (workout: Workout, enabled: boolean) => void;

// Test seam for exercising completion ordering; production completion uses the context-aware
// finishWorkout implementation below, including the settings-loading buffer.
export async function finishWorkoutWithHealthSync(
  finish: () => Promise<Workout>,
  healthSyncEnabled: boolean,
  enqueueSync: EnqueueWorkoutHealthSync = enqueueCompletedWorkoutSync,
): Promise<Workout> {
  const completedWorkout = await finish();
  enqueueSync(completedWorkout, healthSyncEnabled);
  return completedWorkout;
}

const WorkoutContext = createContext<WorkoutContextType | undefined>(undefined);

// The workout clock and rest countdown tick several times per second. They live in their own
// contexts so that only the components displaying them re-render on each tick, instead of every
// consumer of the (large) workout context.
const WorkoutClockContext = createContext<number>(0);
const RestTimerContext = createContext<RestTimerState>(IDLE_REST_TIMER);
const RestTimerActiveContext = createContext<boolean>(false);

// Narrow slices for screens that only need a small part of the workout state. Subscribing to
// these instead of the full context keeps hidden tabs from re-rendering on every set change.
type WorkoutActions = Omit<
  WorkoutContextType,
  | 'activeWorkout'
  | 'isWorkingOut'
  | 'isMinimized'
  | 'draftAvailable'
  | 'availableDrafts'
  | 'gyms'
  | 'activeGym'
  | 'isDraftModalOpen'
  | 'expandedExercises'
>;
const WorkoutActionsContext = createContext<WorkoutActions | undefined>(undefined);
const WorkoutGymsContext = createContext<{ gyms: Gym[]; activeGym: Gym | null }>({ gyms: [], activeGym: null });
const IsWorkingOutContext = createContext<boolean>(false);
// Persistence failures are rare and urgent; a dedicated context keeps the whole app from
// re-rendering every time the autosave health changes.
const PersistenceErrorContext = createContext<Error | null>(null);

/**
 * ARCH-03: the provider is composition only — each concern lives in its own hook under
 * `src/context/workout/` and this file wires them into the context slices the app consumes.
 */
export const WorkoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { controllerRef, sessionState, elapsedSeconds } = useSessionControllerBridge();
  const restTimerEngine = useRestTimerEngine(controllerRef, sessionState.phase);
  const gymSwitcher = useGymSwitcher(controllerRef);
  const accordion = useExerciseAccordion(controllerRef);
  const [isMinimized, setIsMinimized] = useState(false);
  const drafts = useDraftRecovery({
    controllerRef,
    gyms: gymSwitcher.gyms,
    selectLoadedGym: gymSwitcher.selectLoadedGym,
    restTimer: restTimerEngine,
    accordion,
    setMinimized: setIsMinimized,
  });
  const healthSync = useHealthSyncBridge();
  const mutations = useWorkoutMutations({
    controllerRef,
    sessionState,
    restTimerEngine,
    drafts,
    gymSwitcher,
    accordion,
    health: healthSync,
    setMinimized: setIsMinimized,
  });

  // Initial load of gyms and paused drafts; the controller comes up in parallel in the bridge.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await gymSwitcher.initializeGyms();
        if (cancelled) return;
        await drafts.refreshDrafts();
      } catch (err) {
        reportError(err, { scope: 'workout.session.init' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const actions = {
    refreshGyms: gymSwitcher.refreshGyms,
    openDraftModal: drafts.openDraftModal,
    closeDraftModal: drafts.closeDraftModal,
    resumeDraft: drafts.resumeDraft,
    discardDraft: drafts.discardDraft,
    setActiveGym: gymSwitcher.setActiveGym,
    minimizeWorkout: () => setIsMinimized(true),
    maximizeWorkout: () => setIsMinimized(false),
    ...mutations,
    startRestTimer: restTimerEngine.startRestTimer,
    adjustRestTimer: restTimerEngine.adjustRestTimer,
    stopRestTimer: restTimerEngine.stopRestTimer,
    toggleExerciseExpanded: accordion.toggleExerciseExpanded,
    setExerciseExpanded: accordion.setExerciseExpanded,
    expandAllExercises: accordion.expandAllExercises,
    collapseAllExercises: accordion.collapseAllExercises,
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // Stable proxies: consumers get function identities that never change, while each call still
  // reaches the latest implementation (and therefore the latest state it closes over).
  const stableActions = useMemo(() => {
    const proxies = {} as typeof actions;
    (Object.keys(actionsRef.current) as (keyof typeof actions)[]).forEach((key) => {
      (proxies as Record<string, unknown>)[key] = (...args: unknown[]) =>
        (actionsRef.current[key] as (...a: unknown[]) => unknown)(...args);
    });
    return proxies;
  }, []);

  const isWorkingOut = sessionState.phase === 'active' && sessionState.workout !== null;
  const draftAvailable = drafts.draftAvailable;

  const gymsValue = useMemo(
    () => ({ gyms: gymSwitcher.gyms, activeGym: gymSwitcher.activeGym }),
    [gymSwitcher.gyms, gymSwitcher.activeGym],
  );

  const contextValue = useMemo<WorkoutContextType>(
    () => ({
      activeWorkout: sessionState.workout,
      isWorkingOut,
      isMinimized,
      draftAvailable,
      availableDrafts: drafts.availableDrafts,
      gyms: gymSwitcher.gyms,
      activeGym: gymSwitcher.activeGym,
      isDraftModalOpen: drafts.isDraftModalOpen,
      expandedExercises: accordion.expandedExercises,
      ...stableActions,
    }),
    [
      sessionState.workout,
      isWorkingOut,
      isMinimized,
      draftAvailable,
      drafts.availableDrafts,
      gymSwitcher.gyms,
      gymSwitcher.activeGym,
      drafts.isDraftModalOpen,
      accordion.expandedExercises,
      stableActions,
    ],
  );

  return (
    <WorkoutContext.Provider value={contextValue}>
      <WorkoutActionsContext.Provider value={stableActions}>
        <WorkoutGymsContext.Provider value={gymsValue}>
          <IsWorkingOutContext.Provider value={isWorkingOut}>
            <PersistenceErrorContext.Provider value={sessionState.persistenceError}>
              <WorkoutClockContext.Provider value={elapsedSeconds}>
                <RestTimerContext.Provider value={restTimerEngine.restTimer}>
                  <RestTimerActiveContext.Provider value={restTimerEngine.restTimer.isActive}>
                    {children}
                  </RestTimerActiveContext.Provider>
                </RestTimerContext.Provider>
              </WorkoutClockContext.Provider>
            </PersistenceErrorContext.Provider>
          </IsWorkingOutContext.Provider>
        </WorkoutGymsContext.Provider>
      </WorkoutActionsContext.Provider>
    </WorkoutContext.Provider>
  );
};

export const useWorkout = () => {
  const context = useContext(WorkoutContext);
  if (!context) {
    throw new Error('useWorkout must be used within a WorkoutProvider');
  }
  return context;
};

/** Seconds elapsed in the active workout. Re-renders the caller once per second. */
export const useWorkoutClock = () => useContext(WorkoutClockContext);

/** Current rest countdown state. Re-renders the caller on every countdown tick. */
export const useRestTimer = () => useContext(RestTimerContext);

/** Whether a rest countdown is running. Only re-renders the caller when the timer starts or stops. */
export const useIsRestTimerActive = () => useContext(RestTimerActiveContext);

/** Workout actions only. The returned object never changes, so callers never re-render from it. */
export const useWorkoutActions = () => {
  const context = useContext(WorkoutActionsContext);
  if (!context) {
    throw new Error('useWorkoutActions must be used within a WorkoutProvider');
  }
  return context;
};

/** Configured gyms and the active one. Re-renders only when the gym list or selection changes. */
export const useWorkoutGyms = () => useContext(WorkoutGymsContext);

/** Whether a workout is in progress. Re-renders only when a workout starts or ends. */
export const useIsWorkingOut = () => useContext(IsWorkingOutContext);

/** The last silent autosave failure, or null while persistence is healthy. */
export const usePersistenceError = () => useContext(PersistenceErrorContext);
