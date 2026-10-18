import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Dimensions, Keyboard, LayoutAnimation, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsRestTimerActive, useWorkout } from '../../context/WorkoutContext';
import { useSettings } from '../../context/SettingsContext';
import { useDialog } from '../../context/DialogContext';
import type { ScrollView } from 'react-native';
import {
  ActiveExercise,
  Exercise,
  ExerciseGymScope,
  SetType,
  Workout,
  WorkoutSet,
} from '../../types';
import { computeElapsedSeconds } from '../../utils/timer';
import { bestEffortHaptic } from '../../utils/haptics';
import { displayToKg, kgToDisplay } from '../../utils/units';
import { isExcessiveDuration } from '../../workout/duration';
import { applyPreviousSetStats } from '../../workout/gym-session';
import { getCompletedWorkoutsForExercises, getExerciseGymScope } from '../../database/db';
import { evaluateWorkoutPRsWithSource } from '../../workout/pr';
import { getSupersetMetadata, resolveNextSupersetTarget } from '../../workout/supersets';
import { getDefaultBarWeight, getDefaultIncrement, roundToIncrement } from '../../workout/warmup';
import { PRCelebrationEvent } from '../../components/PRCelebrationToast';
import {
  buildPriorRecordIndex,
  computeLiveSetStats,
  findPreviousWorkingSet,
  getCompletedSetIds,
  resolveDisplayedActiveGym,
} from './activeWorkoutLogic';
import { errorMessage } from '../../utils/invariant';

/**
 * ARCH-01: all state, derived data, effects, and handlers for the active-workout logger. The
 * screen is left as pure composition of the props returned here.
 */
export function useActiveWorkoutController({ onFinish }: { onFinish: (workout: Workout) => void }) {
  useKeepAwake();
  const insets = useSafeAreaInsets();

  const {
    activeWorkout,
    minimizeWorkout,
    addExerciseToWorkout,
    addExercisesToWorkout,
    removeExerciseFromWorkout,
    moveExercise,
    moveExerciseToIndex,
    swapExercise,
    addSet,
    insertWarmupSets,
    unlinkSuperset,
    setSupersetGroup,
    removeSet,
    moveSet,
    updateSet,
    updateExerciseNotes,
    updateExerciseRestTimer,
    updateWorkoutDuration,
    toggleSetComplete,
    finishWorkout,
    cancelWorkout,
    expandedExercises,
    toggleExerciseExpanded,
    setExerciseExpanded,
    expandAllExercises,
    collapseAllExercises,
    gyms,
    activeGym,
    setActiveGym,
  } = useWorkout();
  const isRestTimerActive = useIsRestTimerActive();
  const { unit, gymTrackingEnabled } = useSettings();
  const { confirm, notify } = useDialog();

  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showGymPicker, setShowGymPicker] = useState(false);
  const [swapExerciseId, setSwapExerciseId] = useState<string | null>(null);
  const [restWheelActiveExercise, setRestWheelActiveExercise] = useState<ActiveExercise | null>(
    null,
  );
  const [plateCalcWeight, setPlateCalcWeight] = useState<number | null>(null);
  const [activeSetForPlateCalc, setActiveSetForPlateCalc] = useState<{
    exerciseId: string;
    setId: string;
  } | null>(null);

  const [isFinishing, setIsFinishing] = useState(false);
  const [showWorkoutMenu, setShowWorkoutMenu] = useState(false);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [durationModalSafetyMode, setDurationModalSafetyMode] = useState(false);
  const [menuActiveExercise, setMenuActiveExercise] = useState<ActiveExercise | null>(null);
  const [showRpeColumn, setShowRpeColumn] = useState(false);
  const [editingNoteExId, setEditingNoteExId] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [selectedDetailExercise, setSelectedDetailExercise] = useState<Exercise | null>(null);
  const [warmupModalExercise, setWarmupModalExercise] = useState<ActiveExercise | null>(null);
  const [supersetModalExerciseId, setSupersetModalExerciseId] = useState<string | null>(null);
  const [supersetNextUpCue, setSupersetNextUpCue] = useState<string | null>(null);

  // Set Options / Fast 1-Tap RPE Modal
  const [setOptionsModal, setSetOptionsModal] = useState<{
    activeExerciseId: string;
    exerciseName: string;
    set: WorkoutSet;
  } | null>(null);

  // PR Tracking & Historical baseline cache
  const [exerciseWorkouts, setExerciseWorkouts] = useState<Record<string, Workout[]>>({});
  const [exerciseScopes, setExerciseScopes] = useState<
    Record<string, ExerciseGymScope | undefined>
  >({});
  const [prCelebrationEvent, setPrCelebrationEvent] = useState<PRCelebrationEvent | null>(null);

  const supersetMetaMap = useMemo(() => {
    return getSupersetMetadata(activeWorkout?.exercises || []);
  }, [activeWorkout?.exercises]);

  // Latest workout data for callbacks that must keep a stable identity so the
  // memoized exercise cards only re-render when their own data changes.
  const activeWorkoutRef = useRef(activeWorkout);
  const supersetMetaMapRef = useRef(supersetMetaMap);
  useEffect(() => {
    activeWorkoutRef.current = activeWorkout;
    supersetMetaMapRef.current = supersetMetaMap;
  }, [activeWorkout, supersetMetaMap]);

  const supersetModalExercises = useMemo(() => {
    return (activeWorkout?.exercises || []).map(e => ({
      id: e.id,
      name: e.exercise?.name || 'Exercise',
      category: e.exercise?.category,
      equipment: e.exercise?.equipment,
      supersetId: e.supersetId,
      setsCount: e.sets.length,
    }));
  }, [activeWorkout?.exercises]);

  useEffect(() => {
    if (!activeWorkout) return;
    const missingIds = Array.from(new Set(activeWorkout.exercises.map(ex => ex.exerciseId))).filter(
      id => !(id in exerciseWorkouts),
    );

    if (missingIds.length === 0) return;

    let mounted = true;
    Promise.all([
      getCompletedWorkoutsForExercises(missingIds),
      Promise.all(missingIds.map(id => getExerciseGymScope(id))),
    ]).then(([workoutsByEx, scopes]) => {
      if (!mounted) return;
      setExerciseWorkouts(prev => ({
        ...prev,
        ...workoutsByEx,
      }));
      setExerciseScopes(prev => {
        const next = { ...prev };
        missingIds.forEach((id, idx) => {
          next[id] = scopes[idx] || undefined;
        });
        return next;
      });
    });

    return () => {
      mounted = false;
    };
    // Keyed to the exercise list identity; scopes are merged incrementally and must not reload per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkout?.exercises]);

  // Prior records are indexed once per loaded history, so re-ranking after each set change only
  // looks at this workout's sets instead of rescanning every past workout.
  const activeStartTime = activeWorkout?.startTime;
  const priorRecordIndex = useMemo(() => {
    return buildPriorRecordIndex(exerciseWorkouts, activeStartTime);
  }, [exerciseWorkouts, activeStartTime]);

  const prSummary = useMemo(() => {
    if (!activeWorkout) return null;
    return evaluateWorkoutPRsWithSource(
      activeWorkout,
      priorRecordIndex,
      gyms,
      gymTrackingEnabled,
      exerciseScopes,
    );
  }, [activeWorkout, priorRecordIndex, gyms, gymTrackingEnabled, exerciseScopes]);

  const previousCompletedSetIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!activeWorkout) {
      previousCompletedSetIdsRef.current = null;
      return;
    }

    const currentCompleted = getCompletedSetIds(activeWorkout.exercises);

    if (previousCompletedSetIdsRef.current === null) {
      // Seed initial set IDs without firing haptics (e.g. initial mount or resume)
      previousCompletedSetIdsRef.current = currentCompleted;
      return;
    }

    for (const setId of currentCompleted) {
      if (!previousCompletedSetIdsRef.current.has(setId)) {
        const pr = prSummary?.setPRs.get(setId);
        if (pr?.primary) {
          bestEffortHaptic(() =>
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
          );
          for (const ex of activeWorkout.exercises) {
            const foundSet = ex.sets.find(s => s.id === setId);
            if (foundSet) {
              setPrCelebrationEvent({
                exerciseName: ex.exercise?.name || 'Exercise',
                weightKg: foundSet.weightKg,
                reps: foundSet.reps,
                achievement: pr.primary,
                secondaryCount: Math.max(0, pr.achievements.length - 1),
              });
              break;
            }
          }
        }
      }
    }

    previousCompletedSetIdsRef.current = currentCompleted;
  }, [activeWorkout, prSummary]);

  const handleToggleSetWithHaptics = useCallback(
    (exerciseId: string, setId: string) => {
      const workout = activeWorkoutRef.current;
      const currentEx = workout?.exercises.find(e => e.id === exerciseId);
      const targetSet = currentEx?.sets.find(s => s.id === setId);
      const isBecomingCompleted = targetSet ? !targetSet.isCompleted : false;

      toggleSetComplete(exerciseId, setId);

      if (isBecomingCompleted && currentEx?.supersetId && workout) {
        const nextTarget = resolveNextSupersetTarget(workout, exerciseId, setId);
        if (nextTarget && !nextTarget.isRoundComplete) {
          setExerciseExpanded(nextTarget.nextExerciseId, true);
          const meta = supersetMetaMapRef.current.get(exerciseId);
          const groupLabel = meta?.label || 'SUPERSET';
          setSupersetNextUpCue(
            `${groupLabel}: ${nextTarget.nextExerciseName} · Set ${nextTarget.nextSetNumber}`,
          );
        } else {
          setSupersetNextUpCue(null);
        }
      } else if (!isBecomingCompleted) {
        setSupersetNextUpCue(null);
      }
    },
    [toggleSetComplete, setExerciseExpanded],
  );

  const handleApplyPreviousStats = useCallback(
    (exerciseId: string, set: WorkoutSet, targetReps?: string) => {
      if (set.isCompleted) return;
      if (set.previousWeightKg === undefined && set.previousReps === undefined) return;
      if (Platform.OS !== 'web') {
        bestEffortHaptic(() => Haptics.selectionAsync());
      }
      const fallbackReps = parseInt(targetReps || '10', 10) || 10;
      const applied = applyPreviousSetStats(set, fallbackReps);
      updateSet(exerciseId, set.id, {
        weightKg: applied.weightKg,
        reps: applied.reps,
        isWeightEdited: true,
      });
    },
    [updateSet],
  );

  // Handle hardware back press on Android to minimize instead of exiting
  useEffect(() => {
    const onBackPress = () => {
      minimizeWorkout();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [minimizeWorkout]);

  useEffect(() => {
    if (!gymTrackingEnabled) {
      setShowGymPicker(false);
    }
  }, [gymTrackingEnabled]);

  const keyboardHeightRef = useRef(0);
  const activeInputRef = useRef<any>(null);
  const currentScrollY = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  const ensureInputVisible = useCallback(() => {
    const node = activeInputRef.current;
    if (!node || !scrollRef.current) return;

    if (typeof node.measureInWindow === 'function') {
      node.measureInWindow((_x: number, y: number, _width: number, height: number) => {
        if (typeof y !== 'number' || isNaN(y)) return;
        const windowHeight = Dimensions.get('window').height;
        const kbH = keyboardHeightRef.current > 0 ? keyboardHeightRef.current : 280;
        // Visible bottom boundary of the view above the keyboard
        const safeBottom = windowHeight - kbH - 24;
        const inputBottom = y + height;

        // ONLY scroll if the input is actually obscured by or colliding with the keyboard
        if (inputBottom > safeBottom) {
          const distanceNeeded = inputBottom - safeBottom + 36;
          const nextY = Math.max(0, currentScrollY.current + distanceNeeded);
          scrollRef.current?.scrollTo({ y: nextY, animated: true });
        }
      });
    }
  }, []);

  const handleInputFocus = useCallback(
    (event: any, inputRef?: React.RefObject<any>) => {
      activeInputRef.current = inputRef?.current || event?.target;
      setTimeout(ensureInputVisible, 120);
    },
    [ensureInputVisible],
  );

  useEffect(() => {
    const onShow = (e: any) => {
      const h = e.endCoordinates ? e.endCoordinates.height : 0;
      setKeyboardHeight(h);
      keyboardHeightRef.current = h;
      ensureInputVisible();
    };

    const onHide = () => {
      setKeyboardHeight(0);
      keyboardHeightRef.current = 0;
    };

    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      onShow,
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      onHide,
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [ensureInputVisible]);

  // Memoize live volume and completed sets counts to prevent recomputation on 1-second clock ticks
  const { liveVolume, completedSetsCount, totalSetsCount } = useMemo(
    () => computeLiveSetStats(activeWorkout?.exercises ?? []),
    [activeWorkout?.exercises],
  );

  const displayedActiveGym = resolveDisplayedActiveGym(activeGym, gyms, activeWorkout?.gymId);

  const menuExerciseIndex = menuActiveExercise
    ? (activeWorkout?.exercises ?? []).findIndex(exercise => exercise.id === menuActiveExercise.id)
    : -1;

  const handleAddQuickWarmup = (activeEx: ActiveExercise) => {
    const defaultBar = getDefaultBarWeight(
      activeEx.exercise?.equipment,
      activeEx.exercise?.category,
      unit,
    );

    let targetWorkingWeight: number;
    const workingSet = activeEx.sets.find(s => s.type !== 'warmup' && s.weightKg > 0);
    if (workingSet) {
      targetWorkingWeight = workingSet.weightKg;
    } else {
      const ghostSet = activeEx.sets.find(s => (s.previousWeightKg || 0) > 0);
      targetWorkingWeight =
        ghostSet?.previousWeightKg ||
        (defaultBar > 0 ? (unit === 'lb' ? displayToKg(135, 'lb') : 60) : 0);
    }

    const inc = getDefaultIncrement(unit);
    const displayWorking = kgToDisplay(targetWorkingWeight, unit);
    const displayWarmup = Math.max(roundToIncrement(displayWorking * 0.5, inc), defaultBar);
    const warmupWeightKg = displayToKg(displayWarmup, unit);

    insertWarmupSets(activeEx.id, [{ weightKg: warmupWeightKg, reps: 8 }], false);

    if (Platform.OS !== 'web') {
      bestEffortHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    }
  };

  const handleMoveExercise = (activeExerciseId: string, direction: -1 | 1) => {
    if (Platform.OS !== 'web') {
      bestEffortHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    moveExercise(activeExerciseId, direction);
  };

  const handleMoveExerciseToIndex = (activeExerciseId: string, targetIndex: number) => {
    if (Platform.OS !== 'web') {
      bestEffortHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    moveExerciseToIndex(activeExerciseId, targetIndex);
  };

  const handleExpandAll = () => {
    expandAllExercises();
    setShowWorkoutMenu(false);
  };

  const handleCollapseAll = () => {
    collapseAllExercises();
    setShowWorkoutMenu(false);
  };

  const handleFinish = async () => {
    if (isFinishing || !activeWorkout) return;

    if (completedSetsCount === 0) {
      const shouldFinish = await confirm({
        title: 'Finish Workout?',
        message: 'You have not completed any sets. Do you still want to finish?',
        confirmLabel: 'Finish',
        cancelLabel: 'Keep Lifting',
      });
      if (!shouldFinish) return;
    }

    if (isExcessiveDuration(computeElapsedSeconds(activeWorkout.startTime, Date.now()))) {
      setDurationModalSafetyMode(true);
      setShowDurationModal(true);
      return;
    }

    await handleExecuteFinish();
  };

  const handleExecuteFinish = async (durationOverride?: number) => {
    setIsFinishing(true);
    try {
      const summary = await finishWorkout(durationOverride);
      if (summary) {
        onFinish(summary);
      } else {
        await notify({
          title: 'Save Failed',
          message: 'Could not save the workout session. Your session remains open.',
        });
      }
    } catch (e: unknown) {
      await notify({
        title: 'Save Error',
        message: errorMessage(e) || 'An unexpected error occurred while saving.',
      });
    } finally {
      setIsFinishing(false);
    }
  };

  const handleDiscard = async () => {
    setShowWorkoutMenu(false);
    if (isFinishing) return;
    const shouldDiscard = await confirm({
      title: 'Discard Workout?',
      message: 'Are you sure you want to discard this session? All logged sets will be lost.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep Lifting',
      destructive: true,
    });
    if (shouldDiscard) {
      cancelWorkout();
    }
  };

  const handleGymSelect = async (gymId: string) => {
    try {
      await setActiveGym(gymId);
    } catch (error: unknown) {
      await notify({
        title: 'Gym Error',
        message: errorMessage(error) || 'Failed to switch gym.',
      });
      throw error;
    }
  };

  // Open the instant Set Options / 1-Tap RPE modal
  const openSetOptions = useCallback(
    (activeExerciseId: string, exerciseName: string, set: WorkoutSet) => {
      setSetOptionsModal({
        activeExerciseId,
        exerciseName,
        set,
      });
    },
    [],
  );

  const handleSelectSetType = (type: SetType) => {
    if (!setOptionsModal) return;
    const modalEx = activeWorkout?.exercises.find(e => e.id === setOptionsModal.activeExerciseId);
    const setIdx = modalEx?.sets.findIndex(s => s.id === setOptionsModal.set.id) ?? -1;
    // Find the previous working set (ignoring warmups and unweighted sets)
    const prevWorkingSet = findPreviousWorkingSet(modalEx?.sets ?? [], setIdx);

    let updatedWeightKg = setOptionsModal.set.weightKg;
    let isWeightEdited = setOptionsModal.set.isWeightEdited;

    if (
      type === 'drop' &&
      (!updatedWeightKg || !isWeightEdited) &&
      prevWorkingSet &&
      prevWorkingSet.weightKg > 0
    ) {
      const inc = getDefaultIncrement(unit);
      const prevDisp = kgToDisplay(prevWorkingSet.weightKg, unit);
      updatedWeightKg = displayToKg(roundToIncrement(prevDisp * 0.8, inc), unit);
      isWeightEdited = true;
    }

    updateSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id, {
      type,
      ...(type === 'drop' && updatedWeightKg !== setOptionsModal.set.weightKg
        ? { weightKg: updatedWeightKg, isWeightEdited: true }
        : {}),
    });
    setSetOptionsModal(prev =>
      prev
        ? {
            ...prev,
            set: {
              ...prev.set,
              type,
              weightKg: updatedWeightKg,
              isWeightEdited,
            },
          }
        : null,
    );
  };

  const handleSelectRpe = (rpe: number | null) => {
    if (!setOptionsModal) return;
    const updatedRpe = rpe ?? undefined;
    updateSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id, { rpe: updatedRpe });
    setSetOptionsModal(prev => (prev ? { ...prev, set: { ...prev.set, rpe: updatedRpe } } : null));
  };

  const handleSetOptionsMoveSet = (direction: -1 | 1) => {
    if (!setOptionsModal) return;
    if (Platform.OS !== 'web') {
      bestEffortHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    }
    moveSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id, direction);
  };

  const handleSetOptionsDropWeight = (weightKg: number) => {
    if (!setOptionsModal) return;
    updateSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id, {
      weightKg,
      isWeightEdited: true,
    });
    setSetOptionsModal(prev =>
      prev
        ? {
            ...prev,
            set: { ...prev.set, weightKg, isWeightEdited: true },
          }
        : null,
    );
  };

  const handleSetOptionsPlateCalculator = () => {
    if (!setOptionsModal) return;
    setPlateCalcWeight(setOptionsModal.set.weightKg || 60);
    setActiveSetForPlateCalc({
      exerciseId: setOptionsModal.activeExerciseId,
      setId: setOptionsModal.set.id,
    });
    setSetOptionsModal(null);
  };

  const handleSetOptionsDelete = () => {
    if (!setOptionsModal) return;
    removeSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id);
    setSetOptionsModal(null);
  };

  const handleMenuViewDetails = () => {
    if (menuActiveExercise?.exercise) {
      setSelectedDetailExercise(menuActiveExercise.exercise);
    }
    setMenuActiveExercise(null);
  };

  const handleMenuMoveUp = () => {
    if (!menuActiveExercise) return;
    if (Platform.OS !== 'web') {
      bestEffortHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    moveExercise(menuActiveExercise.id, -1);
    setMenuActiveExercise(null);
  };

  const handleMenuMoveDown = () => {
    if (!menuActiveExercise) return;
    if (Platform.OS !== 'web') {
      bestEffortHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    moveExercise(menuActiveExercise.id, 1);
    setMenuActiveExercise(null);
  };

  const handleMenuReorderAll = () => {
    setMenuActiveExercise(null);
    setShowReorderModal(true);
  };

  const handleMenuSwap = () => {
    if (!menuActiveExercise) return;
    setSwapExerciseId(menuActiveExercise.id);
    setMenuActiveExercise(null);
    setShowExercisePicker(true);
  };

  const handleMenuSetRestTimer = () => {
    if (!menuActiveExercise) return;
    const ex = menuActiveExercise;
    setMenuActiveExercise(null);
    setRestWheelActiveExercise(ex);
  };

  const handleMenuPlateCalculator = () => {
    if (!menuActiveExercise) return;
    const firstSet = menuActiveExercise.sets[0];
    setPlateCalcWeight(firstSet?.weightKg || 60);
    setActiveSetForPlateCalc({
      exerciseId: menuActiveExercise.id,
      setId: firstSet?.id || '',
    });
    setMenuActiveExercise(null);
  };

  const handleMenuQuickWarmup = () => {
    if (!menuActiveExercise) return;
    const ex = menuActiveExercise;
    setMenuActiveExercise(null);
    handleAddQuickWarmup(ex);
  };

  const handleMenuWarmupCalculator = () => {
    if (!menuActiveExercise) return;
    const ex = menuActiveExercise;
    setMenuActiveExercise(null);
    setWarmupModalExercise(ex);
  };

  const handleMenuEditSuperset = () => {
    if (!menuActiveExercise) return;
    const exId = menuActiveExercise.id;
    setMenuActiveExercise(null);
    setSupersetModalExerciseId(exId);
  };

  const handleMenuUngroupSuperset = () => {
    if (!menuActiveExercise) return;
    unlinkSuperset(menuActiveExercise.id);
    setMenuActiveExercise(null);
  };

  const handleMenuEditNote = () => {
    if (!menuActiveExercise) return;
    setEditingNoteExId(menuActiveExercise.id);
    setExerciseExpanded(menuActiveExercise.id, true);
    setMenuActiveExercise(null);
  };

  const handleMenuRemoveExercise = async () => {
    if (!menuActiveExercise) return;
    const targetId = menuActiveExercise.id;
    setMenuActiveExercise(null);
    const shouldRemove = await confirm({
      title: 'Remove Exercise?',
      message: 'Are you sure you want to remove this exercise from the workout?',
      confirmLabel: 'Remove',
      cancelLabel: 'Keep',
      destructive: true,
    });
    if (shouldRemove) {
      removeExerciseFromWorkout(targetId);
    }
  };

  return {
    activeWorkout,
    header: {
      workoutName: activeWorkout?.name ?? '',
      gymName: displayedActiveGym?.name ?? null,
      showGym: gymTrackingEnabled && !!displayedActiveGym,
      isFinishing,
      unit,
      liveVolume,
      completedSetsCount,
      totalSetsCount,
      topInset: insets.top,
      onMinimize: minimizeWorkout,
      onOpenMenu: () => setShowWorkoutMenu(true),
      onFinish: handleFinish,
      onOpenDuration: () => {
        setDurationModalSafetyMode(false);
        setShowDurationModal(true);
      },
    },
    stream: {
      exercises: activeWorkout?.exercises ?? [],
      supersetMetaMap,
      expandedExercises,
      editingNoteExId,
      unit,
      showRpeColumn,
      gymTrackingEnabled,
      prSummary,
      keyboardHeight,
      scrollRef,
      onScroll: (event: any) => {
        currentScrollY.current = event.nativeEvent.contentOffset.y;
      },
      onAddExercise: () => {
        setSwapExerciseId(null);
        setShowExercisePicker(true);
      },
      onOpenSupersetEditor: setSupersetModalExerciseId,
      cardHandlers: {
        onToggleExpanded: toggleExerciseExpanded,
        onCommitNotes: updateExerciseNotes,
        onOpenDetail: setSelectedDetailExercise,
        onOpenMenu: setMenuActiveExercise,
        onOpenRestWheel: setRestWheelActiveExercise,
        onStartEditingNote: setEditingNoteExId,
        onUpdateSet: updateSet,
        onRemoveSet: removeSet,
        onAddSet: addSet,
        onToggleSet: handleToggleSetWithHaptics,
        onApplyPrevious: handleApplyPreviousStats,
        onOpenSetOptions: openSetOptions,
        onInputFocus: handleInputFocus,
      },
    },
    overlays: {
      isRestTimerActive,
      nextUpCue: supersetNextUpCue,
      bottomOffset: keyboardHeight > 0 ? keyboardHeight + 16 : 24,
      prCelebrationEvent,
      unit,
      onDismissNextUpCue: () => setSupersetNextUpCue(null),
      onDismissPR: () => setPrCelebrationEvent(null),
    },
    modals: {
      warmup: {
        visible: warmupModalExercise !== null,
        activeExercise: warmupModalExercise,
        unit,
        onClose: () => setWarmupModalExercise(null),
        onApplyWarmupSets: (
          warmupSets: { weightKg: number; reps: number }[],
          replaceExisting: boolean,
        ) => {
          if (warmupModalExercise) {
            insertWarmupSets(warmupModalExercise.id, warmupSets, replaceExisting);
            setWarmupModalExercise(null);
          }
        },
      },
      superset: {
        visible: supersetModalExerciseId !== null,
        currentExerciseId: supersetModalExerciseId,
        exercises: supersetModalExercises,
        onClose: () => setSupersetModalExerciseId(null),
        onSaveSuperset: (selectedIds: string[]) => {
          setSupersetGroup(selectedIds);
          setSupersetModalExerciseId(null);
        },
        onUngroupSuperset: (exId: string) => {
          unlinkSuperset(exId);
          setSupersetModalExerciseId(null);
        },
      },
      exercisePicker: {
        visible: showExercisePicker,
        title: swapExerciseId ? 'Swap Exercise' : undefined,
        multiSelect: swapExerciseId === null,
        onClose: () => {
          setShowExercisePicker(false);
          setSwapExerciseId(null);
        },
        onSelectExercise: (ex: Exercise) => {
          if (swapExerciseId) {
            swapExercise(swapExerciseId, ex);
            setSwapExerciseId(null);
          } else {
            addExerciseToWorkout(ex);
          }
        },
        onSelectMultiple: (exs: Exercise[]) => {
          if (swapExerciseId === null) {
            addExercisesToWorkout(exs);
          }
        },
      },
      detail: {
        visible: selectedDetailExercise !== null,
        exercise: selectedDetailExercise,
        currentGym: displayedActiveGym,
        onClose: () => setSelectedDetailExercise(null),
      },
      gymPicker: {
        visible: gymTrackingEnabled && showGymPicker,
        gyms,
        selectedGymId: displayedActiveGym?.id,
        title: 'Change Workout Gym',
        description:
          'Unfinished sets stay intact. New previous-set suggestions will use the selected gym.',
        onSelect: handleGymSelect,
        onClose: () => setShowGymPicker(false),
      },
      plateCalculator: {
        visible: plateCalcWeight !== null,
        initialWeight: plateCalcWeight || 60,
        onClose: () => {
          setPlateCalcWeight(null);
          setActiveSetForPlateCalc(null);
        },
        onApply: (w: number) => {
          if (activeSetForPlateCalc) {
            updateSet(activeSetForPlateCalc.exerciseId, activeSetForPlateCalc.setId, {
              weightKg: w,
              isWeightEdited: true,
            });
          }
        },
      },
      restWheel: {
        visible: restWheelActiveExercise !== null,
        initialSeconds: restWheelActiveExercise?.restTimerSeconds ?? 0,
        exerciseName: restWheelActiveExercise?.exercise?.name,
        onClose: () => setRestWheelActiveExercise(null),
        onSave: (seconds: number) => {
          if (restWheelActiveExercise) {
            updateExerciseRestTimer(restWheelActiveExercise.id, seconds);
          }
        },
      },
      setOptions: {
        target: setOptionsModal,
        exercises: activeWorkout?.exercises ?? [],
        prSummary,
        unit,
        bottomInset: insets.bottom,
        onClose: () => setSetOptionsModal(null),
        onSelectType: handleSelectSetType,
        onSelectRpe: handleSelectRpe,
        onMoveSet: handleSetOptionsMoveSet,
        onSetDropWeight: handleSetOptionsDropWeight,
        onOpenPlateCalculator: handleSetOptionsPlateCalculator,
        onDeleteSet: handleSetOptionsDelete,
      },
      exerciseMenu: {
        exercise: menuActiveExercise,
        exerciseIndex: menuExerciseIndex,
        exerciseCount: activeWorkout?.exercises.length ?? 0,
        bottomInset: insets.bottom,
        onClose: () => setMenuActiveExercise(null),
        onViewDetails: handleMenuViewDetails,
        onMoveUp: handleMenuMoveUp,
        onMoveDown: handleMenuMoveDown,
        onReorderAll: handleMenuReorderAll,
        onSwap: handleMenuSwap,
        onSetRestTimer: handleMenuSetRestTimer,
        onOpenPlateCalculator: handleMenuPlateCalculator,
        onQuickWarmup: handleMenuQuickWarmup,
        onWarmupCalculator: handleMenuWarmupCalculator,
        onEditSuperset: handleMenuEditSuperset,
        onUngroupSuperset: handleMenuUngroupSuperset,
        onEditNote: handleMenuEditNote,
        onRemoveExercise: handleMenuRemoveExercise,
      },
      workoutMenu: {
        visible: showWorkoutMenu,
        workoutName: activeWorkout?.name ?? '',
        gymTrackingEnabled,
        activeGymName: displayedActiveGym?.name ?? null,
        showRpeColumn,
        bottomInset: insets.bottom,
        onClose: () => setShowWorkoutMenu(false),
        onExpandAll: handleExpandAll,
        onCollapseAll: handleCollapseAll,
        onReorder: () => {
          setShowWorkoutMenu(false);
          setShowReorderModal(true);
        },
        onChangeGym: () => {
          setShowWorkoutMenu(false);
          setShowGymPicker(true);
        },
        onAdjustDuration: () => {
          setShowWorkoutMenu(false);
          setDurationModalSafetyMode(false);
          setShowDurationModal(true);
        },
        onToggleRpeColumn: () => {
          setShowRpeColumn(prev => !prev);
          setShowWorkoutMenu(false);
        },
        onDiscard: handleDiscard,
      },
      duration: {
        visible: showDurationModal,
        initialDurationSeconds:
          showDurationModal && activeWorkout
            ? computeElapsedSeconds(activeWorkout.startTime, Date.now())
            : 0,
        workout: activeWorkout,
        showSafetyPrompt: durationModalSafetyMode,
        onSave: (newSeconds: number) => {
          setShowDurationModal(false);
          if (durationModalSafetyMode) {
            setDurationModalSafetyMode(false);
            void handleExecuteFinish(newSeconds);
          } else {
            updateWorkoutDuration(newSeconds);
          }
        },
        onClose: () => {
          setShowDurationModal(false);
          setDurationModalSafetyMode(false);
        },
      },
      reorder: {
        visible: showReorderModal,
        exercises: activeWorkout?.exercises ?? [],
        onMoveExercise: handleMoveExercise,
        onMoveExerciseToIndex: handleMoveExerciseToIndex,
        onClose: () => setShowReorderModal(false),
      },
    },
  };
}
