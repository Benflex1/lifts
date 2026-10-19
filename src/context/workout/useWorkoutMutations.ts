import { Platform } from 'react-native';
import { useRef } from 'react';
import type { RefObject } from 'react';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useDialog } from '../DialogContext';
import { useSettings } from '../SettingsContext';
import { ActiveExercise, Exercise, Routine, SetType, TrackingType, Workout, WorkoutSet } from '../../types';
import { getSetting, getStore, setSetting } from '../../database/db';
import { runAutomaticBackup } from '../../utils/automaticBackup';
import { addDeloadWorkoutId, DELOAD_WORKOUTS_KEY } from '../../workout/programs';
import {
  fillTrackedSetFromPrevious,
  getTrackingType,
  resolveTrackingTypeForExercise,
  usesWeight,
  validateTrackedSet,
  withTrackingType,
  workoutVolumeKg,
} from '../../workout/tracking';
import { initialReps, moveWorkoutSet, resolveRestTimerSeconds } from '../../workout/sets';
import {
  moveActiveExercise,
  moveActiveExerciseToIndex,
  replaceActiveExercise,
} from '../../workout/active-exercises';
import {
  captureWorkoutVersion,
  appendExercisesToCurrentWorkout,
  loadSuggestionsForExercise,
  clearSameGymProvenance,
  copyPreviousSetProvenance,
  resolveStartGymId,
  StartWorkoutOptions,
  resolveAddedSetGhostStats,
  createWorkoutSetsFromSuggestions,
} from '../../workout/gym-session';
import {
  PAUSED_WORKOUT_CONFIRM_LABEL,
  PAUSED_WORKOUT_DIALOG_MESSAGE,
  PAUSED_WORKOUT_DIALOG_TITLE,
} from '../../workout/session-copy';
import {
  linkExercisesInGroup,
  unlinkExerciseFromGroup,
  setSupersetGroupInList,
} from '../../workout/supersets';
import { reportError } from '../../utils/errorReporting';
import type { SessionController, SessionState } from '../../workout/session';
import type { DraftRecovery } from './useDraftRecovery';
import type { ExerciseAccordion } from './useExerciseAccordion';
import type { GymSwitcher } from './useGymSwitcher';
import type { HealthSyncBridge } from './useHealthSyncBridge';
import type { RestTimerEngine } from './useRestTimerEngine';

/**
 * ARCH-03: every mutation of the active workout — starting, resuming, structural exercise/set
 * edits, supersets, completing a set, duration, completion, and cancellation.
 */
export interface WorkoutMutations {
  startWorkout: (
    routine?: Routine,
    customName?: string,
    initialExercises?: ActiveExercise[],
    options?: StartWorkoutOptions,
  ) => Promise<boolean>;
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
  finishWorkout: (durationSecondsOverride?: number) => Promise<Workout | null>;
  cancelWorkout: () => void;
  /** Retries the failed draft write that produced `persistenceError`. Rejects if it fails again. */
  retryPersistence: () => Promise<void>;
}

function calculateTotalVolume(exercises: ActiveExercise[]): number {
  return workoutVolumeKg(exercises);
}

export function useWorkoutMutations({
  controllerRef,
  sessionState,
  restTimerEngine,
  drafts,
  gymSwitcher,
  accordion,
  health,
  setMinimized,
}: {
  controllerRef: RefObject<SessionController | null>;
  sessionState: SessionState;
  restTimerEngine: RestTimerEngine;
  drafts: DraftRecovery;
  gymSwitcher: GymSwitcher;
  accordion: ExerciseAccordion;
  health: HealthSyncBridge;
  setMinimized: (minimized: boolean) => void;
}): WorkoutMutations {
  const { confirm, notify } = useDialog();
  const { restTimer, startRestTimer } = restTimerEngine;
  const {
    trackingTypesEnabled,
    trackingTypeOverrides,
  } = useSettings();
  const trackingSettingsRef = useRef({
    enabled: trackingTypesEnabled,
    overrides: trackingTypeOverrides,
  });
  trackingSettingsRef.current = {
    enabled: trackingTypesEnabled,
    overrides: trackingTypeOverrides,
  };
  const trackingTypeFor = (exercise: Exercise): TrackingType =>
    resolveTrackingTypeForExercise(
      exercise,
      trackingSettingsRef.current.enabled,
      trackingSettingsRef.current.overrides,
    );

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

        exercises.push(
          withTrackingType<ActiveExercise>(
            {
              id: activeExId,
              exerciseId: item.exerciseId,
              exercise: item.exercise,
              sets,
              notes: '',
              targetReps: item.targetReps,
              restTimerSeconds: resolveRestTimerSeconds(item.restTimerSeconds),
              supersetId: item.supersetId,
            },
            trackingTypeFor(item.exercise),
          ),
        );
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
    accordion.applyInitialState(exercises);
    gymSwitcher.adoptGyms(loadedGyms, selectedGym);
    setMinimized(false);
    await drafts.refreshDrafts();
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
        setMinimized(false);
        return true;
      }
      return false;
    }

    if (drafts.availableDrafts.length > 0) {
      const shouldResume = await confirm({
        title: PAUSED_WORKOUT_DIALOG_TITLE,
        message: PAUSED_WORKOUT_DIALOG_MESSAGE,
        confirmLabel: PAUSED_WORKOUT_CONFIRM_LABEL,
        cancelLabel: 'Cancel',
      });
      if (shouldResume) {
        if (drafts.availableDrafts.length === 1) {
          drafts.resumeDraft(drafts.availableDrafts[0]);
        } else {
          drafts.openDraftModal();
        }
        return true;
      }
      return false;
    }

    await executeStartWorkout(routine, customName, initialExercises, options);
    return true;
  };

  const updateWorkoutDuration = (seconds: number) => {
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
  };

  const finishWorkout = async (durationSecondsOverride?: number): Promise<Workout | null> => {
    const ctrl = controllerRef.current;
    if (!ctrl) return null;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) {
      return null;
    }

    try {
      const finished = await ctrl.finish(durationSecondsOverride);
      if (finished.isDeload) {
        // Keep deload numbers out of "last time", so the next targets pick up where they left off.
        void getSetting(DELOAD_WORKOUTS_KEY)
          .then((stored) => setSetting(DELOAD_WORKOUTS_KEY, addDeloadWorkoutId(stored, finished.id)))
          .catch((error) => {
            reportError(error, { scope: 'workout.finish.deload-record' });
          });
      }
      void runAutomaticBackup().catch((error) => {
        reportError(error, { scope: 'workout.finish.automatic-backup' });
      });
      health.enqueueCompleted(finished);
      setMinimized(false);
      accordion.reset();
      restTimerEngine.stopRestTimer();
      await drafts.refreshDrafts();
      return finished;
    } catch (e: unknown) {
      reportError(e, { scope: 'workout.finish' });
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


      newActiveExercises.push(
        withTrackingType<ActiveExercise>(
          {
            id: activeExId,
            exerciseId: exercise.id,
            exercise,
            sets: initialSets,
            notes: '',
            targetReps: '10',
            restTimerSeconds: 0,
          },
          trackingTypeFor(exercise),
        ),
      );
    }

    appendExercisesToCurrentWorkout(ctrl, expectedVersion, newActiveExercises);
    accordion.expandExercises(newActiveExercises.map((ex) => ex.id));
  };

  const addExerciseToWorkout = async (exercise: Exercise) => {
    await addExercisesToWorkout([exercise]);
  };

  const removeExerciseFromWorkout = (activeExerciseId: string) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    accordion.removeExercise(activeExerciseId);

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

  const setExerciseTrackingType = (activeExerciseId: string, type: TrackingType) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    // Completed sets that don't hold the new type's values go back to unchecked, so the
    // workout never stores a completed set that later edits would reject.
    const updatedExercises = state.workout.exercises.map((ex) =>
      ex.id === activeExerciseId
        ? withTrackingType(
            {
              ...ex,
              sets: ex.sets.map((s) =>
                s.isCompleted && validateTrackedSet(s, type)
                  ? { ...s, isCompleted: false, completedAt: undefined }
                  : s
              ),
            },
            type
          )
        : ex
    );
    const updated: Workout = {
      ...state.workout,
      exercises: updatedExercises,
      totalVolumeKg: calculateTotalVolume(updatedExercises),
    };
    ctrl.update(
      updated,
      restTimer.isActive && restTimer.endsAt
        ? { endsAt: restTimer.endsAt, totalSeconds: restTimer.totalSeconds }
        : null
    );
  };

  const toggleSetComplete = (activeExerciseId: string, setId: string) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const state = ctrl.getState();
    if (state.phase !== 'active' || !state.workout) return;

    const targetEx = state.workout.exercises.find((e) => e.id === activeExerciseId);
    const targetSet = targetEx?.sets.find((s) => s.id === setId);
    if (!targetSet || !targetEx) return;

    const trackingType = getTrackingType(targetEx);
    let effectiveSet = targetSet;
    if (!targetSet.isCompleted) {
      const isWeightEdited = targetSet.isWeightEdited ?? (targetSet.weightKg > 0);
      const needsReps = targetSet.reps <= 0;
      const needsWeight =
        usesWeight(trackingType) &&
        !isWeightEdited &&
        targetSet.weightKg <= 0 &&
        (targetSet.previousWeightKg ?? 0) > 0;
      if (trackingType === 'duration' || trackingType === 'distance_duration') {
        effectiveSet = fillTrackedSetFromPrevious(targetSet, trackingType);
      } else if (needsReps || needsWeight) {
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

      const validationError = validateTrackedSet(effectiveSet, trackingType);
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
        } catch {
          // Best-effort completion haptic; failure must not interrupt set logging.
        }
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
    ctrl.flush().catch((error) => {
      reportError(error, { scope: 'workout.autosave.set-complete' });
    });
  };

  const cancelWorkout = () => {
    drafts.discardDraft().catch(console.error);
  };

  /** Retry the draft write that failed, driven by the persistence warning banner. */
  const retryPersistence = async (): Promise<void> => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    await ctrl.flush();
  };

  return {
    startWorkout,
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
    setExerciseTrackingType,
    updateWorkoutDuration,
    toggleSetComplete,
    finishWorkout,
    cancelWorkout,
    retryPersistence,
  };
}
