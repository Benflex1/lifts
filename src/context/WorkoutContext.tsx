import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Platform, AppState, AppStateStatus, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { ActiveExercise, Exercise, Gym, Routine, SetType, Workout, WorkoutSet } from '../types';
import { getSetting, getStore, setSetting } from '../database/db';
import { getExactAlarmStatus, openExactAlarmSettings } from '../utils/exactAlarms';
import { WorkoutDraft } from '../database/contract';
import { computeElapsedSeconds, computeRemaining } from '../utils/timer';
import { createSessionController, SessionController, SessionState } from '../workout/session';
import { initialReps, moveWorkoutSet, resolveRestTimerSeconds, validateCompletedSet } from '../workout/sets';
import {
  moveActiveExercise,
  moveActiveExerciseToIndex,
  replaceActiveExercise,
} from '../workout/active-exercises';
import {
  captureWorkoutVersion,
  appendExercisesToCurrentWorkout,
  loadSuggestionsForExercise,
  clearSameGymProvenance,
  copyPreviousSetProvenance,
  resolveStartGymId,
  StartWorkoutOptions,
  switchWorkoutGym,
  resolveInitialAccordionState,
  resolveAddedSetGhostStats,
  createWorkoutSetsFromSuggestions,
} from '../workout/gym-session';
import { resolveActiveGymAfterRefresh } from '../workout/gym-profile';
import { runAutomaticBackup } from '../utils/automaticBackup';
import { useDialog } from './DialogContext';
import { useSettings } from './SettingsContext';
import {
  PAUSED_WORKOUT_CONFIRM_LABEL,
  PAUSED_WORKOUT_DIALOG_MESSAGE,
  PAUSED_WORKOUT_DIALOG_TITLE,
} from '../workout/session-copy';
import {
  initRestNotifications,
  scheduleRestNotification,
  cancelRestNotification,
  isRestCueNative,
} from '../utils/restNotifications';
import {
  linkExercisesInGroup,
  unlinkExerciseFromGroup,
  setSupersetGroupInList,
} from '../workout/supersets';
import { enqueueCompletedWorkoutSync } from '../health';
import { RestCountdown, restAlarmForAppState, shiftRestCountdown } from '../utils/restTimer';

const EXACT_ALARM_PROMPTED_KEY = 'exact_alarm_prompted';

interface RestTimerState {
  isActive: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  endsAt: number | null;
  exerciseName?: string;
}

// Two taps 120ms apart, so each count reads as a pulse. Skipped off screen, where the rest alarm alerts instead,
// and where the native rest cue plays the countdown itself.
function pulseCountdown(style: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS === 'web' || AppState.currentState !== 'active' || isRestCueNative()) return;
  try {
    Haptics.impactAsync(style);
    setTimeout(() => {
      Haptics.impactAsync(style);
    }, 120);
  } catch (_) {}
}

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
  updateWorkoutDuration: (seconds: number) => void;
  toggleSetComplete: (activeExerciseId: string, setId: string) => void;
  startRestTimer: (seconds: number, exerciseName?: string) => void;
  adjustRestTimer: (deltaSeconds: number) => void;
  stopRestTimer: () => void;
  finishWorkout: (durationSecondsOverride?: number) => Promise<Workout | null>;
  cancelWorkout: () => void;
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
const IDLE_REST_TIMER: RestTimerState = { isActive: false, remainingSeconds: 0, totalSeconds: 0, endsAt: null };
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

export const WorkoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const controllerRef = useRef<SessionController | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>({
    phase: 'idle',
    workout: null,
    restTimer: null,
    persistenceError: null,
    revision: 0,
  });

  const [availableDrafts, setAvailableDrafts] = useState<WorkoutDraft[]>([]);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [activeGym, setActiveGymState] = useState<Gym | null>(null);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const { confirm, notify } = useDialog();
  const { healthSyncEnabled, loading: settingsLoading } = useSettings();

  const [restTimer, setRestTimer] = useState<RestTimerState>({
    isActive: false,
    remainingSeconds: 0,
    totalSeconds: 0,
    endsAt: null,
  });

  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gymSwitchRequestRef = useRef(0);
  const lastBuzzedSecondRef = useRef<number | null>(null);
  // Read by AppState and adjust handlers, which must see the latest countdown without re-subscribing.
  const restCountdownRef = useRef<RestCountdown | null>(null);
  restCountdownRef.current = restTimer.isActive && restTimer.endsAt !== null
    ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds, exerciseName: restTimer.exerciseName }
    : null;
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});
  const pendingHealthSyncsRef = useRef<Workout[]>([]);
  const healthSyncSettingsRef = useRef({ enabled: healthSyncEnabled, loading: settingsLoading });
  healthSyncSettingsRef.current = { enabled: healthSyncEnabled, loading: settingsLoading };

  useEffect(() => {
    if (settingsLoading) return;

    const pendingWorkouts = pendingHealthSyncsRef.current.splice(0);
    for (const workout of pendingWorkouts) {
      enqueueCompletedWorkoutSync(workout, healthSyncEnabled);
    }
  }, [healthSyncEnabled, settingsLoading]);

  const toggleExerciseExpanded = useCallback((activeExerciseId: string) => {
    setExpandedExercises((prev) => ({
      ...prev,
      [activeExerciseId]: !(prev[activeExerciseId] ?? false),
    }));
  }, []);

  const setExerciseExpanded = useCallback((activeExerciseId: string, expanded: boolean) => {
    setExpandedExercises((prev) => ({
      ...prev,
      [activeExerciseId]: expanded,
    }));
  }, []);

  const expandAllExercises = useCallback(() => {
    const workout = controllerRef.current?.getState().workout;
    if (!workout) return;
    const all: Record<string, boolean> = {};
    workout.exercises.forEach((e) => {
      all[e.id] = true;
    });
    setExpandedExercises(all);
  }, []);

  const collapseAllExercises = useCallback(() => {
    const workout = controllerRef.current?.getState().workout;
    if (!workout) return;
    const all: Record<string, boolean> = {};
    workout.exercises.forEach((e) => {
      all[e.id] = false;
    });
    setExpandedExercises(all);
  }, []);

  const refreshDrafts = useCallback(async () => {
    try {
      const store = await getStore();
      const drafts = await store.getWorkoutDrafts();
      setAvailableDrafts(drafts);
    } catch (e) {
      console.error('Failed to load workout drafts:', e);
    }
  }, []);

  const refreshGyms = useCallback(async () => {
    const store = await getStore();
    const [loadedGyms, defaultGym] = await Promise.all([
      store.getGyms(),
      store.getDefaultGym(),
    ]);
    const currentWorkout = controllerRef.current?.getState().workout;
    setGyms(loadedGyms);
    setActiveGymState(resolveActiveGymAfterRefresh(loadedGyms, defaultGym, currentWorkout?.gymId));
  }, []);

  // Initialize controller and subscribe
  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        void initRestNotifications();
        const store = await getStore();
        const ctrl = createSessionController(store, () => Date.now(), { maxDirtyTimeMs: 3000 });
        controllerRef.current = ctrl;

        unsubscribe = ctrl.subscribe((newState) => {
          if (isMounted) {
            setSessionState(newState);
          }
        });

        const [loadedGyms, defaultGym] = await Promise.all([
          store.getGyms(),
          store.getDefaultGym(),
        ]);
        if (!isMounted) return;
        setGyms(loadedGyms);
        setActiveGymState(defaultGym);
        await refreshDrafts();
      } catch (err) {
        console.error('Failed to initialize session controller:', err);
      }
    })();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [refreshDrafts]);

  // Elapsed workout time ticker
  useEffect(() => {
    if (sessionState.phase === 'active' && sessionState.workout) {
      const startTime = sessionState.workout.startTime;
      setElapsedSeconds(computeElapsedSeconds(startTime, Date.now()));

      workoutTimerRef.current = setInterval(() => {
        setElapsedSeconds(computeElapsedSeconds(startTime, Date.now()));
      }, 1000);
    } else {
      if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);
      setElapsedSeconds(0);
    }

    return () => {
      if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);
    };
  }, [sessionState.phase, sessionState.workout?.startTime]);

  // AppState background flush, and the OS rest alarm: armed when the app leaves the screen, cancelled on return
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'background' && controllerRef.current && sessionState.phase === 'active') {
        controllerRef.current.flush().catch(console.error);
      }
      // The native rest cue is armed for the whole rest (see below), so it does not follow app visibility.
      if (isRestCueNative()) return;
      const alarm = restAlarmForAppState(state, restCountdownRef.current, Date.now());
      if (alarm.kind === 'arm') {
        void scheduleRestNotification(alarm.endsAt, alarm.exerciseName);
      } else if (alarm.kind === 'cancel') {
        void cancelRestNotification();
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [sessionState.phase]);

  // Rest countdown ticker
  useEffect(() => {
    if (restTimer.isActive && restTimer.endsAt !== null) {
      const tick = () => {
        const now = Date.now();
        const remaining = computeRemaining(restTimer.endsAt!, now);
        if (remaining <= 0) {
          const expiredRecently = restTimer.endsAt !== null && Math.abs(now - restTimer.endsAt) < 1500;
          setRestTimer((prev) => ({ ...prev, isActive: false, remainingSeconds: 0, endsAt: null }));
          const ctrl = controllerRef.current;
          if (ctrl) {
            const state = ctrl.getState();
            if (state.phase === 'active' && state.workout) {
              ctrl.update(state.workout, null);
            }
          }
          // No cancel here: a running OS alarm is only armed while the app is backgrounded, and cancelling
          // at expiry could dismiss the notification the alarm has just posted.

          // Intense countdown finish buzzer (triple pulse)
          // Only buzz if timer reached 0 in foreground / just now (< 1.5s), avoiding false alarm on app resume.
          // In the background the OS rest alarm alerts instead.
          if (
            lastBuzzedSecondRef.current !== 0 &&
            expiredRecently &&
            AppState.currentState === 'active' &&
            !isRestCueNative()
          ) {
            lastBuzzedSecondRef.current = 0;
            if (Platform.OS !== 'web') {
              try {
                Vibration.vibrate([0, 800, 400, 800, 400, 800]);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setTimeout(() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                }, 160);
                setTimeout(() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                }, 320);
              } catch (_) {}
            }
          } else {
            lastBuzzedSecondRef.current = 0;
          }
        } else {
          // Intense 3-2-1 countdown haptics: a double pulse on each of the last three seconds
          if (remaining <= 3 && lastBuzzedSecondRef.current !== remaining) {
            lastBuzzedSecondRef.current = remaining;
            pulseCountdown(remaining === 1 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium);
          } else if (remaining > 3) {
            lastBuzzedSecondRef.current = null;
          }

          setRestTimer((prev) => {
            if (prev.remainingSeconds === remaining) return prev;
            return { ...prev, remainingSeconds: remaining };
          });
        }
      };
      restTimerRef.current = setInterval(tick, 250);
      tick();
    } else {
      lastBuzzedSecondRef.current = null;
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    }

    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    };
  }, [restTimer.isActive, restTimer.endsAt, sessionState.phase]);

  // Android: the native rest cue (3-2-1 pulses, then a harder buzz at the end) is armed for every rest
  // start, adjustment and resumed draft, in and out of the app. It is only disarmed by stopRestTimer,
  // never at expiry, which would cut off the end buzz while it plays.
  useEffect(() => {
    if (!isRestCueNative() || !restTimer.isActive || restTimer.endsAt === null) return;
    void scheduleRestNotification(restTimer.endsAt, restTimer.exerciseName);
  }, [restTimer.isActive, restTimer.endsAt]);

  // Without exact alarms (denied by default from Android 14) the cue can fire seconds or minutes late,
  // so ask once, on the first rest. Settings keeps a button for later.
  const exactAlarmPromptedRef = useRef(false);
  useEffect(() => {
    if (!restTimer.isActive || exactAlarmPromptedRef.current || !isRestCueNative()) return;
    if (getExactAlarmStatus() !== 'denied') return;
    exactAlarmPromptedRef.current = true;
    (async () => {
      if ((await getSetting(EXACT_ALARM_PROMPTED_KEY)) === 'true') return;
      await setSetting(EXACT_ALARM_PROMPTED_KEY, 'true');
      const allow = await confirm({
        title: 'On-time rest buzz',
        message:
          'To buzz 3, 2, 1 exactly when your rest ends, even with the phone locked, Lifts needs permission to set alarms. Android may delay the buzz without it.',
        confirmLabel: 'Allow',
        cancelLabel: 'Not now',
      });
      if (allow) openExactAlarmSettings();
    })().catch(console.error);
  }, [restTimer.isActive]);

  const startRestTimer = (seconds: number, exerciseName?: string) => {
    if (seconds <= 0) return;
    const endsAt = Date.now() + seconds * 1000;
    lastBuzzedSecondRef.current = null;
    // The OS alarm is armed by the native cue effect above on Android, elsewhere when the app leaves the screen.
    setRestTimer({
      isActive: true,
      remainingSeconds: seconds,
      totalSeconds: seconds,
      endsAt,
      exerciseName,
    });
    const ctrl = controllerRef.current;
    if (ctrl) {
      const state = ctrl.getState();
      if (state.phase === 'active' && state.workout) {
        ctrl.update(state.workout, { endsAt, totalSeconds: seconds });
      }
    }
  };

  const adjustRestTimer = (deltaSeconds: number) => {
    const countdown = restCountdownRef.current;
    if (!countdown) return;
    const shifted = shiftRestCountdown(countdown, deltaSeconds, Date.now());
    if (!shifted) {
      stopRestTimer();
      return;
    }
    setRestTimer({
      isActive: true,
      remainingSeconds: computeRemaining(shifted.endsAt, Date.now()),
      totalSeconds: shifted.totalSeconds,
      endsAt: shifted.endsAt,
      exerciseName: shifted.exerciseName,
    });
    const ctrl = controllerRef.current;
    if (ctrl) {
      const state = ctrl.getState();
      if (state.phase === 'active' && state.workout) {
        ctrl.update(state.workout, { endsAt: shifted.endsAt, totalSeconds: shifted.totalSeconds });
      }
    }
  };

  const stopRestTimer = () => {
    lastBuzzedSecondRef.current = null;
    void cancelRestNotification();
    setRestTimer({
      isActive: false,
      remainingSeconds: 0,
      totalSeconds: 0,
      endsAt: null,
    });
    const ctrl = controllerRef.current;
    if (ctrl) {
      const state = ctrl.getState();
      if (state.phase === 'active' && state.workout) {
        ctrl.update(state.workout, null);
      }
    }
  };

  const minimizeWorkout = () => setIsMinimized(true);
  const maximizeWorkout = () => setIsMinimized(false);

  const executeStartWorkout = async (
    routine?: Routine,
    customName?: string,
    initialExercises?: ActiveExercise[],
    options?: StartWorkoutOptions,
  ) => {
    const ctrl = controllerRef.current;
    if (!ctrl) {
      throw new Error('Controller not initialized');
    }

    const workoutId = `wo-${Crypto.randomUUID()}`;
    const name = customName || (routine ? routine.name : 'Quick Workout');
    const store = await getStore();
    const [loadedGyms, defaultGym] = await Promise.all([
      store.getGyms(),
      store.getDefaultGym(),
    ]);
    const gymId = resolveStartGymId(defaultGym, options);
    const selectedGym = loadedGyms.find((gym) => gym.id === gymId);
    if (!selectedGym) {
      throw new Error(`Cannot start workout: unknown gym ${gymId}`);
    }
    const gymNames = new Map(loadedGyms.map((gym) => [gym.id, gym.name]));

    let exercises: ActiveExercise[] = [];

    if (initialExercises && initialExercises.length > 0) {
      exercises = initialExercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => {
          const normalizedSet = clearSameGymProvenance(set, gymId);
          return {
            ...normalizedSet,
            previousGymName: normalizedSet.previousGymId
              ? (normalizedSet.previousGymName || gymNames.get(normalizedSet.previousGymId))
              : normalizedSet.previousGymName,
          };
        }),
      }));
    } else if (routine && routine.exercises.length > 0) {
      const occurrenceCounts: Record<string, number> = {};
      for (let ord = 0; ord < routine.exercises.length; ord++) {
        const item = routine.exercises[ord];
        const occ = occurrenceCounts[item.exerciseId] || 0;
        occurrenceCounts[item.exerciseId] = occ + 1;
        const prevSets = await loadSuggestionsForExercise(store, item.exerciseId, occ, gymId);
        const activeExId = `ae-${workoutId}-${item.exerciseId}-occ${occ}-${Crypto.randomUUID().slice(0, 6)}`;
        const sets = createWorkoutSetsFromSuggestions({
          activeExerciseId: activeExId,
          targetSets: item.targetSets || 3,
          targetReps: item.targetReps,
          suggestions: prevSets,
          currentGymId: gymId,
          idGenerator: (i) => `set-${activeExId}-${i}-${Crypto.randomUUID().slice(0, 6)}`,
        });

        exercises.push({
          id: activeExId,
          exerciseId: item.exerciseId,
          exercise: item.exercise,
          sets,
          notes: '',
          targetReps: item.targetReps,
          restTimerSeconds: resolveRestTimerSeconds(item.restTimerSeconds),
          supersetId: item.supersetId,
        });
      }
    }

    const newWorkout: Workout = {
      id: workoutId,
      name,
      routineId: routine?.id,
      gymId,
      startTime: new Date().toISOString(),
      durationSeconds: 0,
      totalVolumeKg: 0,
      exercises,
    };

    await ctrl.start(newWorkout);
    setExpandedExercises(resolveInitialAccordionState(exercises));
    setGyms(loadedGyms);
    setActiveGymState(selectedGym);
    setIsMinimized(false);
    await refreshDrafts();
  };

  const startWorkout = async (
    routine?: Routine,
    customName?: string,
    initialExercises?: ActiveExercise[],
    options?: StartWorkoutOptions,
  ) => {
    const ctrl = controllerRef.current;
    const currentState = ctrl ? ctrl.getState() : sessionState;
    if (currentState.phase === 'active' && currentState.workout) {
      const shouldResume = await confirm({
        title: 'Workout In Progress',
        message: 'You already have an active workout in progress. Would you like to continue it?',
        confirmLabel: 'Resume',
        cancelLabel: 'Cancel',
      });
      if (shouldResume) {
        maximizeWorkout();
        return true;
      }
      return false;
    }

    if (availableDrafts.length > 0) {
      const shouldResume = await confirm({
        title: PAUSED_WORKOUT_DIALOG_TITLE,
        message: PAUSED_WORKOUT_DIALOG_MESSAGE,
        confirmLabel: PAUSED_WORKOUT_CONFIRM_LABEL,
        cancelLabel: 'Cancel',
      });
      if (shouldResume) {
        if (availableDrafts.length === 1) {
          resumeDraft(availableDrafts[0]);
        } else {
          setIsDraftModalOpen(true);
        }
        return true;
      }
      return false;
    }

    await executeStartWorkout(routine, customName, initialExercises, options);
    return true;
  };

  const resumeDraft = (draft?: WorkoutDraft) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    const targetDraft = draft || (availableDrafts.length > 0 ? availableDrafts[0] : null);
    if (!targetDraft) return;

    ctrl.resume(targetDraft);
    setActiveGymState(gyms.find((gym) => gym.id === targetDraft.workout.gymId) || null);
    setIsMinimized(false);
    setIsDraftModalOpen(false);

    setExpandedExercises((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return resolveInitialAccordionState(targetDraft.workout.exercises);
    });

    if (targetDraft.restTimer && targetDraft.restTimer.endsAt > Date.now()) {
      setRestTimer({
        isActive: true,
        endsAt: targetDraft.restTimer.endsAt,
        totalSeconds: targetDraft.restTimer.totalSeconds,
        remainingSeconds: computeRemaining(targetDraft.restTimer.endsAt, Date.now()),
      });
    } else {
      stopRestTimer();
    }

    refreshDrafts().catch(console.error);
  };

  const setActiveGym = async (gymId: string): Promise<void> => {
    const ctrl = controllerRef.current;
    if (!ctrl) {
      throw new Error('Controller not initialized');
    }

    const requestId = ++gymSwitchRequestRef.current;
    const store = await getStore();
    const result = await switchWorkoutGym(
      ctrl,
      store,
      gymId,
      () => requestId === gymSwitchRequestRef.current,
    );
    if (result.cancelled) return;
    setGyms(result.gyms);
    setActiveGymState(result.gym);
  };

  const discardDraft = async (draftId?: string) => {
    const ctrl = controllerRef.current;
    if (draftId) {
      const store = await getStore();
      await store.discardDraft(draftId);
      await refreshDrafts();
      return;
    }

    if (ctrl) {
      const state = ctrl.getState();
      if (state.phase === 'active') {
        await ctrl.discard();
        setIsMinimized(false);
        setExpandedExercises({});
        stopRestTimer();
        await refreshDrafts();
        return;
      }
    }
    
    if (availableDrafts.length > 0) {
      const store = await getStore();
      await store.discardDraft(availableDrafts[0].workout.id);
      await refreshDrafts();
    }
  };

  const cancelWorkout = () => {
    discardDraft().catch(console.error);
  };

  const updateWorkoutDuration = useCallback((seconds: number) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;
    const validSeconds = Math.max(0, Math.floor(seconds));
    const newStartTime = new Date(Date.now() - validSeconds * 1000).toISOString();
    const updated: Workout = {
      ...state.workout,
      startTime: newStartTime,
      durationSeconds: validSeconds,
    };
    ctrl.update(
      updated,
      restTimer.isActive && restTimer.endsAt
        ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds }
        : null
    );
    setElapsedSeconds(validSeconds);
  }, [restTimer]);

  const finishWorkout = async (durationSecondsOverride?: number): Promise<Workout | null> => {
    const ctrl = controllerRef.current;
    if (!ctrl) return null;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) {
      return null;
    }

    try {
      const finished = await ctrl.finish(durationSecondsOverride);
      void runAutomaticBackup().catch((error) => {
        console.warn('Automatic workout backup failed', error);
      });
      const settings = healthSyncSettingsRef.current;
      if (settings.loading) {
        pendingHealthSyncsRef.current.push(finished);
      } else {
        enqueueCompletedWorkoutSync(finished, settings.enabled);
      }
      setIsMinimized(false);
      setExpandedExercises({});
      stopRestTimer();
      await refreshDrafts();
      return finished;
    } catch (e: any) {
      console.error('Failed to finish workout:', e);
      notify({
        title: 'Save Error',
        message: 'Failed to save workout. Please try again.',
      });
      return null;
    }
  };

  const addExercisesToWorkout = async (exercises: Exercise[]) => {
    const ctrl = controllerRef.current;
    if (!ctrl || exercises.length === 0) return;
    const currentState = ctrl.getState();
    if (currentState.phase !== 'active' || !currentState.workout) return;
    const expectedVersion = captureWorkoutVersion(currentState);
    if (!expectedVersion) return;
    const store = await getStore();

    // Track occurrences across existing exercises and the batch
    const currentWorkout = currentState.workout;
    const exerciseCounts = new Map<string, number>();
    for (const ex of currentWorkout.exercises) {
      exerciseCounts.set(ex.exerciseId, (exerciseCounts.get(ex.exerciseId) || 0) + 1);
    }

    const newActiveExercises: ActiveExercise[] = [];
    for (const exercise of exercises) {
      const occurrenceIndex = exerciseCounts.get(exercise.id) || 0;
      exerciseCounts.set(exercise.id, occurrenceIndex + 1);

      const activeExId = `ae-${currentWorkout.id}-${exercise.id}-occ${occurrenceIndex}-${Crypto.randomUUID().slice(0, 6)}`;
      const prevSets = await loadSuggestionsForExercise(
        store,
        exercise.id,
        occurrenceIndex,
        currentWorkout.gymId,
      );
      const initialSets = createWorkoutSetsFromSuggestions({
        activeExerciseId: activeExId,
        targetSets: 3,
        targetReps: '10',
        suggestions: prevSets,
        currentGymId: currentWorkout.gymId,
        idGenerator: (i) => `set-${activeExId}-${i}-${Crypto.randomUUID().slice(0, 6)}`,
      });


      newActiveExercises.push({
        id: activeExId,
        exerciseId: exercise.id,
        exercise,
        sets: initialSets,
        notes: '',
        targetReps: '10',
        restTimerSeconds: 0,
      });
    }

    appendExercisesToCurrentWorkout(ctrl, expectedVersion, newActiveExercises);
    setExpandedExercises((prev) => {
      const next = { ...prev };
      for (const ex of newActiveExercises) {
        next[ex.id] = true;
      }
      return next;
    });
  };

  const addExerciseToWorkout = async (exercise: Exercise) => {
    await addExercisesToWorkout([exercise]);
  };

  const removeExerciseFromWorkout = (activeExerciseId: string) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    setExpandedExercises((prev) => {
      const next = { ...prev };
      delete next[activeExerciseId];
      return next;
    });

    const updatedExercises = state.workout.exercises.filter((e) => e.id !== activeExerciseId);
    const totalVol = calculateTotalVolume(updatedExercises);
    const updated: Workout = {
      ...state.workout,
      exercises: updatedExercises,
      totalVolumeKg: totalVol,
    };
    ctrl.update(updated, restTimer.isActive && restTimer.endsAt ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds } : null);
  };

  const moveExercise = (activeExerciseId: string, direction: -1 | 1) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const updatedExercises = moveActiveExercise(state.workout.exercises, activeExerciseId, direction);
    if (updatedExercises === state.workout.exercises) return;

    const updated: Workout = {
      ...state.workout,
      exercises: updatedExercises,
    };
    ctrl.update(
      updated,
      restTimer.isActive && restTimer.endsAt
        ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds }
        : null
    );
  };

  const moveExerciseToIndex = (activeExerciseId: string, targetIndex: number) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const updatedExercises = moveActiveExerciseToIndex(
      state.workout.exercises,
      activeExerciseId,
      targetIndex
    );
    if (updatedExercises === state.workout.exercises) return;

    const updated: Workout = {
      ...state.workout,
      exercises: updatedExercises,
    };
    ctrl.update(
      updated,
      restTimer.isActive && restTimer.endsAt
        ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds }
        : null
    );
  };

  const swapExercise = async (activeExerciseId: string, exercise: Exercise) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const currentWorkout = state.workout;
    const store = await getStore();

    let occurrenceIndex = 0;
    for (const ex of currentWorkout.exercises) {
      if (ex.id !== activeExerciseId && ex.exerciseId === exercise.id) {
        occurrenceIndex++;
      }
    }

    const prevSets = await loadSuggestionsForExercise(
      store,
      exercise.id,
      occurrenceIndex,
      currentWorkout.gymId,
    );

    const latestState = ctrl.getState();
    if (latestState.phase !== 'active' || !latestState.workout) return;

    const updatedExercises = replaceActiveExercise(
      latestState.workout.exercises,
      activeExerciseId,
      exercise,
      prevSets,
      currentWorkout.gymId,
    );

    const totalVol = calculateTotalVolume(updatedExercises);
    const updated: Workout = {
      ...latestState.workout,
      exercises: updatedExercises,
      totalVolumeKg: totalVol,
    };
    ctrl.update(
      updated,
      restTimer.isActive && restTimer.endsAt
        ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds }
        : null
    );
  };

  const addSet = (activeExerciseId: string, setType: SetType = 'normal') => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const updatedExercises = state.workout.exercises.map((ex) => {
      if (ex.id !== activeExerciseId) return ex;
      const nextNum = ex.sets.length + 1;
      const ghostStats = resolveAddedSetGhostStats(ex.sets);

      const newSet: WorkoutSet = {
        id: `set-${ex.id}-${nextNum}-${Crypto.randomUUID().slice(0, 6)}`,
        setNumber: nextNum,
        type: setType,
        weightKg: 0,
        reps: 0,
        targetReps: ex.targetReps,
        rpe: undefined,
        isCompleted: false,
        isWeightEdited: false,
        previousWeightKg: ghostStats.previousWeightKg,
        previousReps: ghostStats.previousReps,
        ...copyPreviousSetProvenance(ghostStats.provenanceSet),
      };
      return { ...ex, sets: [...ex.sets, newSet] };
    });

    const totalVol = calculateTotalVolume(updatedExercises);
    const updated: Workout = {
      ...state.workout,
      exercises: updatedExercises,
      totalVolumeKg: totalVol,
    };
    ctrl.update(updated, restTimer.isActive && restTimer.endsAt ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds } : null);
  };

  const insertWarmupSets = (
    activeExerciseId: string,
    warmupSets: { weightKg: number; reps: number }[],
    replaceExisting: boolean = true
  ) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const updatedExercises = state.workout.exercises.map((ex) => {
      if (ex.id !== activeExerciseId) return ex;

      const completedWarmupSets = ex.sets.filter((s) => s.type === 'warmup' && s.isCompleted);
      const nonWarmupSets = ex.sets.filter((s) => s.type !== 'warmup');

      const newWarmupSets: WorkoutSet[] = warmupSets.map((ws, i) => ({
        id: `set-${ex.id}-w${i + 1}-${Crypto.randomUUID().slice(0, 6)}`,
        setNumber: i + 1,
        type: 'warmup',
        weightKg: ws.weightKg,
        reps: ws.reps,
        targetReps: ws.reps.toString(),
        rpe: undefined,
        isCompleted: false,
        isWeightEdited: true,
      }));

      const combinedSets = replaceExisting
        ? [...completedWarmupSets, ...newWarmupSets, ...nonWarmupSets]
        : [...newWarmupSets, ...ex.sets];

      const renumbered = combinedSets.map((s, idx) => ({ ...s, setNumber: idx + 1 }));
      return { ...ex, sets: renumbered };
    });

    const totalVol = calculateTotalVolume(updatedExercises);
    const updated: Workout = {
      ...state.workout,
      exercises: updatedExercises,
      totalVolumeKg: totalVol,
    };
    ctrl.update(updated, restTimer.isActive && restTimer.endsAt ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds } : null);
  };

  const linkSuperset = (firstExerciseId: string, secondExerciseId: string) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const idx1 = state.workout.exercises.findIndex((e) => e.id === firstExerciseId);
    const idx2 = state.workout.exercises.findIndex((e) => e.id === secondExerciseId);
    if (idx1 === -1 || idx2 === -1) return;

    const fallbackId = `ss-${Crypto.randomUUID().slice(0, 8)}`;
    const updatedExercises = linkExercisesInGroup(state.workout.exercises, idx1, idx2, fallbackId);

    const updated: Workout = {
      ...state.workout,
      exercises: updatedExercises,
    };
    ctrl.update(updated, restTimer.isActive && restTimer.endsAt ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds } : null);
  };

  const unlinkSuperset = (exerciseId: string) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const targetIdx = state.workout.exercises.findIndex((e) => e.id === exerciseId);
    if (targetIdx === -1) return;

    const updatedExercises = unlinkExerciseFromGroup(state.workout.exercises, targetIdx);

    const updated: Workout = {
      ...state.workout,
      exercises: updatedExercises,
    };
    ctrl.update(updated, restTimer.isActive && restTimer.endsAt ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds } : null);
  };

  const setSupersetGroup = (selectedExerciseIds: string[]) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const fallbackId = `ss-${Crypto.randomUUID().slice(0, 8)}`;
    const updatedExercises = setSupersetGroupInList(
      state.workout.exercises,
      selectedExerciseIds,
      fallbackId
    );

    const updated: Workout = {
      ...state.workout,
      exercises: updatedExercises,
    };
    ctrl.update(
      updated,
      restTimer.isActive && restTimer.endsAt
        ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds }
        : null
    );
  };

  const removeSet = (activeExerciseId: string, setId: string) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const updatedExercises = state.workout.exercises.map((ex) => {
      if (ex.id !== activeExerciseId) return ex;
      const filtered = ex.sets.filter((s) => s.id !== setId);
      const renumbered = filtered.map((s, idx) => ({ ...s, setNumber: idx + 1 }));
      return { ...ex, sets: renumbered };
    });

    const totalVol = calculateTotalVolume(updatedExercises);
    const updated: Workout = {
      ...state.workout,
      exercises: updatedExercises,
      totalVolumeKg: totalVol,
    };
    ctrl.update(updated, restTimer.isActive && restTimer.endsAt ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds } : null);
  };

  const moveSet = (activeExerciseId: string, setId: string, direction: -1 | 1) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const updatedExercises = state.workout.exercises.map((ex) => {
      if (ex.id !== activeExerciseId) return ex;
      return {
        ...ex,
        sets: moveWorkoutSet(ex.sets, setId, direction),
      };
    });

    const updated: Workout = {
      ...state.workout,
      exercises: updatedExercises,
    };
    ctrl.update(
      updated,
      restTimer.isActive && restTimer.endsAt
        ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds }
        : null
    );
  };

  const updateSet = (activeExerciseId: string, setId: string, updates: Partial<WorkoutSet>) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const updatedExercises = state.workout.exercises.map((ex) => {
      if (ex.id !== activeExerciseId) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s) => (s.id === setId ? { ...s, ...updates } : s)),
      };
    });

    const totalVol = calculateTotalVolume(updatedExercises);
    const updated: Workout = {
      ...state.workout,
      exercises: updatedExercises,
      totalVolumeKg: totalVol,
    };
    ctrl.update(updated, restTimer.isActive && restTimer.endsAt ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds } : null);
  };

  const updateExerciseNotes = (activeExerciseId: string, notes: string) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const updatedExercises = state.workout.exercises.map((ex) =>
      ex.id === activeExerciseId ? { ...ex, notes } : ex
    );
    const updated: Workout = { ...state.workout, exercises: updatedExercises };
    ctrl.update(updated, restTimer.isActive && restTimer.endsAt ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds } : null);
  };

  const updateExerciseRestTimer = (activeExerciseId: string, seconds: number) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const updatedExercises = state.workout.exercises.map((ex) =>
      ex.id === activeExerciseId ? { ...ex, restTimerSeconds: seconds } : ex
    );
    const updated: Workout = { ...state.workout, exercises: updatedExercises };
    ctrl.update(updated, restTimer.isActive && restTimer.endsAt ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds } : null);
  };

  const toggleSetComplete = (activeExerciseId: string, setId: string) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const targetEx = state.workout.exercises.find((e) => e.id === activeExerciseId);
    const targetSet = targetEx?.sets.find((s) => s.id === setId);
    if (!targetSet || !targetEx) return;

    let effectiveSet = targetSet;
    if (!targetSet.isCompleted) {
      const isWeightEdited = targetSet.isWeightEdited ?? (targetSet.weightKg > 0);
      const needsReps = targetSet.reps <= 0;
      const needsWeight = !isWeightEdited && targetSet.weightKg <= 0 && (targetSet.previousWeightKg ?? 0) > 0;
      if (needsReps || needsWeight) {
        const setIdx = targetEx.sets.findIndex((s) => s.id === setId);
        const fallbackReps = needsReps
          ? initialReps(targetEx.targetReps, setIdx >= 0 ? setIdx : 0, targetSet.previousReps)
          : targetSet.reps;
        const fallbackWeight = needsWeight
          ? (targetSet.previousWeightKg ?? 0)
          : targetSet.weightKg;
        effectiveSet = {
          ...targetSet,
          reps: fallbackReps,
          weightKg: fallbackWeight,
          isWeightEdited: true,
        };
      }

      const validationError = validateCompletedSet(effectiveSet);
      if (validationError) {
        notify({
          title: 'Invalid Set',
          message: validationError,
        });
        return;
      }
    }

    let targetRestSeconds: number | null = null;
    let justCompleted = false;
    let completedExerciseName: string | undefined;

    const updatedExercises = state.workout.exercises.map((ex) => {
      if (ex.id !== activeExerciseId) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s) => {
          if (s.id !== setId) return s;
          const nextCompleted = !s.isCompleted;
          if (nextCompleted) {
            justCompleted = true;
            targetRestSeconds = resolveRestTimerSeconds(ex.restTimerSeconds);
            completedExerciseName = ex.exercise?.name;
          }
          return {
            ...s,
            reps: nextCompleted ? effectiveSet.reps : s.reps,
            weightKg: nextCompleted ? effectiveSet.weightKg : s.weightKg,
            isWeightEdited: nextCompleted ? true : s.isWeightEdited,
            isCompleted: nextCompleted,
            completedAt: nextCompleted ? new Date().toISOString() : undefined,
          };
        }),
      };
    });

    const totalVol = calculateTotalVolume(updatedExercises);
    const updated: Workout = {
      ...state.workout,
      exercises: updatedExercises,
      totalVolumeKg: totalVol,
    };

    let timerMeta: { endsAt: number; totalSeconds: number } | null = null;
    if (justCompleted) {
      if (Platform.OS !== 'web') {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch (_) {}
      }
      if (targetRestSeconds) {
        startRestTimer(targetRestSeconds, completedExerciseName);
        timerMeta = { endsAt: Date.now() + targetRestSeconds * 1000, totalSeconds: targetRestSeconds };
      }
    } else {
      timerMeta = restTimer.isActive && restTimer.endsAt ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds } : null;
    }

    ctrl.update(updated, timerMeta);
    // Flush immediately on completed-set changes as required by spec
    ctrl.flush().catch(console.error);
  };

  const calculateTotalVolume = (exercises: ActiveExercise[]): number => {
    return exercises.reduce((sum, ex) => {
      return (
        sum +
        ex.sets
          .filter((s) => s.isCompleted)
          .reduce((sSum, s) => sSum + s.weightKg * s.reps, 0)
      );
    }, 0);
  };

  const actions = {
    refreshGyms,
    openDraftModal: () => setIsDraftModalOpen(true),
    closeDraftModal: () => setIsDraftModalOpen(false),
    resumeDraft,
    discardDraft,
    startWorkout,
    setActiveGym,
    minimizeWorkout,
    maximizeWorkout,
    addExerciseToWorkout,
    addExercisesToWorkout,
    removeExerciseFromWorkout,
    moveExercise,
    moveExerciseToIndex,
    swapExercise,
    addSet,
    insertWarmupSets,
    linkSuperset,
    unlinkSuperset,
    setSupersetGroup,
    removeSet,
    moveSet,
    updateSet,
    updateExerciseNotes,
    updateExerciseRestTimer,
    updateWorkoutDuration,
    toggleSetComplete,
    startRestTimer,
    adjustRestTimer,
    stopRestTimer,
    finishWorkout,
    cancelWorkout,
    toggleExerciseExpanded,
    setExerciseExpanded,
    expandAllExercises,
    collapseAllExercises,
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
  const draftAvailable = availableDrafts.length > 0 ? availableDrafts[0].workout : null;

  const gymsValue = useMemo(() => ({ gyms, activeGym }), [gyms, activeGym]);

  const contextValue = useMemo<WorkoutContextType>(
    () => ({
      activeWorkout: sessionState.workout,
      isWorkingOut,
      isMinimized,
      draftAvailable,
      availableDrafts,
      gyms,
      activeGym,
      isDraftModalOpen,
      expandedExercises,
      ...stableActions,
    }),
    [
      sessionState.workout,
      isWorkingOut,
      isMinimized,
      draftAvailable,
      availableDrafts,
      gyms,
      activeGym,
      isDraftModalOpen,
      expandedExercises,
      stableActions,
    ],
  );

  return (
    <WorkoutContext.Provider value={contextValue}>
      <WorkoutActionsContext.Provider value={stableActions}>
        <WorkoutGymsContext.Provider value={gymsValue}>
          <IsWorkingOutContext.Provider value={isWorkingOut}>
            <WorkoutClockContext.Provider value={elapsedSeconds}>
              <RestTimerContext.Provider value={restTimer}>
                <RestTimerActiveContext.Provider value={restTimer.isActive}>
                  {children}
                </RestTimerActiveContext.Provider>
              </RestTimerContext.Provider>
            </WorkoutClockContext.Provider>
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
