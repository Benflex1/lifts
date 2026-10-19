import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  BackHandler,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  Dimensions,
  LayoutAnimation,
} from 'react-native';
import {
  Clock,
  Plus,
  Trash2,
  Calculator,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  Timer,
  MoreHorizontal,
  Gauge,
  MapPin,
  Dumbbell,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Repeat,
  Trophy,
  Info,
  Flame,
  Layers,
  GripVertical,
  SlidersHorizontal,
  TrendingUp,
  Feather,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { bestEffortHaptic } from '../utils/haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useIsRestTimerActive, useWorkout, useWorkoutClock } from '../context/WorkoutContext';
import { computeElapsedSeconds } from '../utils/timer';
import { useSettings } from '../context/SettingsContext';
import { formatWeight, kgToDisplay, displayToKg } from '../utils/units';
import { formatTimer } from '../utils/calculator';
import { PlateCalculatorModal } from '../components/PlateCalculatorModal';
import { ExercisePickerModal } from '../components/ExercisePickerModal';
import { ExerciseDetailModal } from '../components/ExerciseDetailModal';
import { RestTimerOverlay } from '../components/RestTimerOverlay';
import { RestTimeWheelModal } from '../components/RestTimeWheelModal';
import { ExerciseReorderModal } from '../components/ExerciseReorderModal';
import { GymPickerModal } from '../components/GymPickerModal';
import { ActiveExerciseCard } from '../components/ActiveExerciseCard';
import { Exercise, SetType, Workout, WorkoutSet, ActiveExercise, ExerciseGymScope } from '../types';
import { useDialog } from '../context/DialogContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RPE_CHIPS } from '../workout/sets';
import { formatPreviousMetric } from '../workout/gym-display';
import {
  getCompletedWorkoutsForExercise,
  getCompletedWorkoutsForExercises,
  getExerciseGymScope,
} from '../database/db';
import {
  buildActiveWorkoutRecordIndex,
  evaluateActiveWorkoutPRs,
  formatPRDescription,
  WorkoutPRSummary,
} from '../workout/pr';
import { PRBadge } from '../components/PRBadge';
import { PRCelebrationToast, PRCelebrationEvent } from '../components/PRCelebrationToast';
import { WarmupModal } from '../components/WarmupModal';
import { SupersetModal } from '../components/SupersetModal';
import { ExerciseVisual } from '../components/MemoizedExerciseVisual';
import { getExerciseRowViewModel } from '../utils/exercise-ui';
import { roundToIncrement, getDefaultIncrement, getDefaultBarWeight } from '../workout/warmup';
import { getSupersetMetadata, resolveNextSupersetTarget } from '../workout/supersets';
import { applyPreviousSetStats } from '../workout/gym-session';
import { isOverloadFillTarget, OverloadSuggestion, suggestNextTarget } from '../workout/overload';
import { WorkoutDurationModal } from '../components/WorkoutDurationModal';
import { isExcessiveDuration } from '../workout/duration';
import { colors } from '../theme';
import { styles } from './activeWorkoutStyles';
import {
  distanceUnitFor,
  formatSetDuration,
  countsLoad,
  getTrackingType,
  metersToDisplay,
  trackingTypeLabel,
  setVolumeKg,
  usesDistance,
  usesDuration,
  usesReps,
  usesWeight,
} from '../workout/tracking';
import { DistanceInput, DurationInput } from '../components/TrackedValueInput';
import { TrackingTypeModal } from '../components/TrackingTypeModal';

/** Renders the ticking workout duration without re-rendering the whole logger every second. */
const LiveWorkoutClock: React.FC = () => {
  const elapsedSeconds = useWorkoutClock();
  return <>{formatTimer(elapsedSeconds)}</>;
};

export const ActiveWorkoutScreen: React.FC<{ onFinish: (workout: Workout) => void }> = ({
  onFinish,
}) => {
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
    startRestTimer,
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
  const {
    unit,
    gymTrackingEnabled,
    trackingTypesEnabled,
    overloadEnabled,
    setExerciseTrackingType: saveExerciseTrackingType,
  } = useSettings();
  const [trackingTypeExercise, setTrackingTypeExercise] = useState<ActiveExercise | null>(null);
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

  const handleAddQuickWarmup = (activeEx: ActiveExercise) => {
    const defaultBar = getDefaultBarWeight(
      activeEx.exercise?.equipment,
      activeEx.exercise?.category,
      unit,
    );

    let targetWorkingWeight = 0;
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
  }, [activeWorkout?.exercises]);

  // Prior records are indexed once per loaded history, so re-ranking after each set change only
  // looks at this workout's sets instead of rescanning every past workout.
  const activeWorkoutId = activeWorkout?.id;
  const priorRecordIndex = useMemo(
    () => buildActiveWorkoutRecordIndex(exerciseWorkouts, activeWorkoutId),
    [exerciseWorkouts, activeWorkoutId],
  );

  const prSummary = useMemo(() => {
    if (!activeWorkout) return null;
    return evaluateActiveWorkoutPRs(
      activeWorkout,
      exerciseWorkouts,
      priorRecordIndex,
      gyms,
      gymTrackingEnabled,
      exerciseScopes,
    );
  }, [activeWorkout, exerciseWorkouts, priorRecordIndex, gyms, gymTrackingEnabled, exerciseScopes]);

  const previousCompletedSetIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!activeWorkout) {
      previousCompletedSetIdsRef.current = null;
      return;
    }

    const currentCompleted = new Set<string>();
    for (const ex of activeWorkout.exercises) {
      for (const s of ex.sets) {
        if (s.isCompleted) {
          currentCompleted.add(s.id);
        }
      }
    }

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
                durationSeconds: foundSet.durationSeconds,
                distanceM: foundSet.distanceM,
                trackingType: ex.trackingType,
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

  const handleApplyOverload = useCallback((activeEx: ActiveExercise, suggestion: OverloadSuggestion) => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.selectionAsync();
      } catch (_) {}
    }
    for (const set of activeEx.sets) {
      if (!isOverloadFillTarget(set)) continue;
      updateSet(activeEx.id, set.id, {
        weightKg: suggestion.weightKg,
        reps: suggestion.reps,
        isWeightEdited: true,
      });
    }
  }, [updateSet]);

  const handleExplainOverload = useCallback(
    (label: string, suggestion: OverloadSuggestion) =>
      void notify({ title: `Next target: ${label}`, message: suggestion.reason }),
    [notify],
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
  }, []);

  if (!activeWorkout) {
    return null;
  }

  // Memoize live volume and completed sets counts to prevent recomputation on 1-second clock ticks
  const { liveVolume, completedSetsCount, totalSetsCount } = useMemo(() => {
    let volume = 0;
    let completed = 0;
    let total = 0;

    for (const ex of activeWorkout.exercises) {
      const trackingType = getTrackingType(ex);
      for (const s of ex.sets) {
        total++;
        if (s.isCompleted) {
          volume += setVolumeKg(s, trackingType);
          completed++;
        }
      }
    }

    return { liveVolume: volume, completedSetsCount: completed, totalSetsCount: total };
  }, [activeWorkout.exercises]);

  const displayedActiveGym = activeGym || gyms.find(gym => gym.id === activeWorkout.gymId) || null;

  const menuHasLoad = countsLoad(getTrackingType(menuActiveExercise ?? undefined));

  const menuExerciseIndex = menuActiveExercise
    ? activeWorkout.exercises.findIndex(exercise => exercise.id === menuActiveExercise.id)
    : -1;

  const menuNextExercise =
    menuExerciseIndex >= 0 && menuExerciseIndex < activeWorkout.exercises.length - 1
      ? activeWorkout.exercises[menuExerciseIndex + 1]
      : null;

  const expandAll = () => {
    expandAllExercises();
    setShowWorkoutMenu(false);
  };

  const collapseAll = () => {
    collapseAllExercises();
    setShowWorkoutMenu(false);
  };

  const handleFinish = async () => {
    if (isFinishing) return;

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
    } catch (e: any) {
      await notify({
        title: 'Save Error',
        message: e?.message || 'An unexpected error occurred while saving.',
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
    } catch (error: any) {
      await notify({
        title: 'Gym Error',
        message: error?.message || 'Failed to switch gym.',
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
    const prevWorkingSet = modalEx?.sets
      .slice(0, setIdx)
      .reverse()
      .find(s => s.type !== 'warmup' && s.weightKg > 0);

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

  return (
    <KeyboardAvoidingView
      style={styles.screenContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top App Bar */}
      <View style={[styles.topBar, { paddingTop: Math.max(50, insets.top + 8) }]}>
        <TouchableOpacity
          onPress={minimizeWorkout}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Minimize workout"
          accessibilityRole="button"
        >
          <ChevronDown size={22} color={colors.textSoft} />
        </TouchableOpacity>

        <View style={styles.topBarTitleWrap}>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {activeWorkout.name}
          </Text>
          {activeWorkout.isDeload ? (
            <Text style={[styles.topBarSubtitle, styles.topBarDeload]} numberOfLines={1}>
              Deload week
              {gymTrackingEnabled && displayedActiveGym ? ` · ${displayedActiveGym.name}` : ''}
            </Text>
          ) : gymTrackingEnabled && displayedActiveGym ? (
            <Text style={styles.topBarSubtitle} numberOfLines={1}>
              {displayedActiveGym.name}
            </Text>
          ) : null}
        </View>

        <View style={styles.topRightWrap}>
          <TouchableOpacity
            onPress={() => setShowWorkoutMenu(true)}
            style={styles.moreBtn}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityLabel="Workout menu"
            accessibilityRole="button"
          >
            <MoreHorizontal size={20} color={colors.textSoft} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleFinish}
            style={[styles.finishBtn, isFinishing && styles.btnDisabled]}
            disabled={isFinishing}
            accessibilityRole="button"
            accessibilityLabel="Finish workout"
            accessibilityState={{ busy: isFinishing, disabled: isFinishing }}
          >
            <Text style={styles.finishBtnText}>{isFinishing ? 'Saving...' : 'Finish'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Live Metrics Strip */}
      <View style={styles.metricsContainer}>
        <TouchableOpacity
          style={styles.metricColumn}
          onPress={() => {
            setDurationModalSafetyMode(false);
            setShowDurationModal(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Adjust workout duration"
        >
          <Text style={[styles.metricColValue, { color: colors.primary }]}>
            <LiveWorkoutClock />
          </Text>
          <Text style={styles.metricColLabel}>Duration</Text>
        </TouchableOpacity>
        <View style={styles.metricColumn}>
          <Text style={styles.metricColValue}>{formatWeight(liveVolume, unit)}</Text>
          <Text style={styles.metricColLabel}>Volume</Text>
        </View>
        <View style={styles.metricColumn}>
          <Text style={styles.metricColValue}>
            {completedSetsCount}
            <Text style={styles.metricColValueMuted}> / {totalSetsCount}</Text>
          </Text>
          <Text style={styles.metricColLabel}>Sets</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${totalSetsCount > 0 ? Math.round((completedSetsCount / totalSetsCount) * 100) : 0}%`,
            },
          ]}
        />
      </View>

      {/* Exercises Stream */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 300 : 220 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={e => {
          currentScrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        scrollEnabled={true}
      >
        {activeWorkout.exercises.map(activeEx => {
          const ssMeta = supersetMetaMap.get(activeEx.id);

          return (
            <React.Fragment key={activeEx.id}>
              {ssMeta?.isFirst && (
                <View style={[styles.supersetGroupHeader, { borderLeftColor: ssMeta.color }]}>
                  <TouchableOpacity
                    style={[
                      styles.supersetPill,
                      { backgroundColor: ssMeta.color + '25', borderColor: ssMeta.color },
                    ]}
                    onPress={() => setSupersetModalExerciseId(activeEx.id)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${ssMeta.label}`}
                  >
                    <Layers size={13} color={ssMeta.color} />
                    <Text style={[styles.supersetPillText, { color: ssMeta.color }]}>
                      {ssMeta.label}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.supersetCountText}>
                    {ssMeta.totalInGroup} Exercises · Alternating Sets
                  </Text>
                </View>
              )}

              <ActiveExerciseCard
                exercise={activeEx}
                supersetMeta={ssMeta}
                isExpanded={expandedExercises[activeEx.id] ?? false}
                isNoteEditing={editingNoteExId === activeEx.id}
                unit={unit}
                showRpeColumn={showRpeColumn}
                gymTrackingEnabled={gymTrackingEnabled}
                prSummary={prSummary}
                overloadEnabled={overloadEnabled}
                isDeload={activeWorkout.isDeload === true}
                onApplyOverload={handleApplyOverload}
                onExplainOverload={handleExplainOverload}
                onToggleExpanded={toggleExerciseExpanded}
                onCommitNotes={updateExerciseNotes}
                onOpenDetail={setSelectedDetailExercise}
                onOpenMenu={setMenuActiveExercise}
                onOpenRestWheel={setRestWheelActiveExercise}
                onStartEditingNote={setEditingNoteExId}
                onUpdateSet={updateSet}
                onRemoveSet={removeSet}
                onAddSet={addSet}
                onToggleSet={handleToggleSetWithHaptics}
                onApplyPrevious={handleApplyPreviousStats}
                onOpenSetOptions={openSetOptions}
                onInputFocus={handleInputFocus}
              />

              {ssMeta && !ssMeta.isLast && (
                <View style={styles.supersetConnectorWrap}>
                  <View style={[styles.supersetConnectorLine, { backgroundColor: ssMeta.color }]} />
                  <Text style={[styles.supersetConnectorText, { color: ssMeta.color }]}>
                    NEXT IN {ssMeta.label}
                  </Text>
                  <View style={[styles.supersetConnectorLine, { backgroundColor: ssMeta.color }]} />
                </View>
              )}
            </React.Fragment>
          );
        })}

        {activeWorkout.exercises.length === 0 && (
          <View style={styles.emptyWorkout}>
            <View style={styles.emptyWorkoutIcon}>
              <Dumbbell size={26} color={colors.primary} />
            </View>
            <Text style={styles.emptyWorkoutTitle}>Let's get moving</Text>
            <Text style={styles.emptyWorkoutText}>
              Add your first exercise to start logging sets.
            </Text>
          </View>
        )}

        {/* Add Exercise Big Button */}
        <TouchableOpacity
          style={[
            styles.addExerciseMainBtn,
            activeWorkout.exercises.length === 0 && styles.addExerciseMainBtnSolid,
          ]}
          onPress={() => {
            setSwapExerciseId(null);
            setShowExercisePicker(true);
          }}
          accessibilityRole="button"
        >
          <Plus
            size={20}
            color={activeWorkout.exercises.length === 0 ? colors.onPrimary : colors.primaryLight}
          />
          <Text
            style={[
              styles.addExerciseMainBtnText,
              activeWorkout.exercises.length === 0 && { color: colors.onPrimary },
            ]}
          >
            Add Exercise
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Floating Rest Timer Overlay */}
      <RestTimerOverlay
        nextUpText={supersetNextUpCue}
        bottomOffset={keyboardHeight > 0 ? keyboardHeight + 16 : 24}
      />

      {/* Non-blocking Floating Superset Cue when timer is not active */}
      {!isRestTimerActive && supersetNextUpCue && (
        <View
          style={[
            styles.supersetFloatingCue,
            { bottom: keyboardHeight > 0 ? keyboardHeight + 16 : 24 },
          ]}
        >
          <View style={styles.supersetCueBadge}>
            <Text style={styles.supersetCueBadgeText}>NEXT UP</Text>
          </View>
          <Text style={styles.supersetCueText} numberOfLines={1}>
            {supersetNextUpCue}
          </Text>
          <TouchableOpacity
            onPress={() => setSupersetNextUpCue(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss next up cue"
          >
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Floating PR Celebration Toast */}
      <PRCelebrationToast
        event={prCelebrationEvent}
        unit={unit}
        onDismiss={() => setPrCelebrationEvent(null)}
      />

      {/* Warmup Progression Calculator Modal */}
      <WarmupModal
        visible={warmupModalExercise !== null}
        activeExercise={warmupModalExercise}
        unit={unit}
        onClose={() => setWarmupModalExercise(null)}
        onApplyWarmupSets={(warmupSets, replaceExisting) => {
          if (warmupModalExercise) {
            insertWarmupSets(warmupModalExercise.id, warmupSets, replaceExisting);
            setWarmupModalExercise(null);
          }
        }}
      />

      {/* Superset Selection Modal */}
      <SupersetModal
        visible={supersetModalExerciseId !== null}
        currentExerciseId={supersetModalExerciseId}
        exercises={supersetModalExercises}
        onClose={() => setSupersetModalExerciseId(null)}
        onSaveSuperset={selectedIds => {
          setSupersetGroup(selectedIds);
          setSupersetModalExerciseId(null);
        }}
        onUngroupSuperset={exId => {
          unlinkSuperset(exId);
          setSupersetModalExerciseId(null);
        }}
      />

      {/* Exercise Picker Modal */}
      <ExercisePickerModal
        visible={showExercisePicker}
        title={swapExerciseId ? 'Swap Exercise' : undefined}
        multiSelect={swapExerciseId === null}
        onClose={() => {
          setShowExercisePicker(false);
          setSwapExerciseId(null);
        }}
        onSelectExercise={(ex: Exercise) => {
          if (swapExerciseId) {
            swapExercise(swapExerciseId, ex);
            setSwapExerciseId(null);
          } else {
            addExerciseToWorkout(ex);
          }
        }}
        onSelectMultiple={(exs: Exercise[]) => {
          if (swapExerciseId === null) {
            addExercisesToWorkout(exs);
          }
        }}
      />

      {/* Exercise Detail Modal */}
      <ExerciseDetailModal
        visible={selectedDetailExercise !== null}
        exercise={selectedDetailExercise}
        currentGym={displayedActiveGym}
        onClose={() => setSelectedDetailExercise(null)}
      />

      {/* Active Workout Gym Picker */}
      <GymPickerModal
        visible={gymTrackingEnabled && showGymPicker}
        gyms={gyms}
        selectedGymId={displayedActiveGym?.id}
        title="Change Workout Gym"
        description="Unfinished sets stay intact. New previous-set suggestions will use the selected gym."
        onSelect={handleGymSelect}
        onClose={() => setShowGymPicker(false)}
      />

      {/* Plate Calculator Modal */}
      <PlateCalculatorModal
        visible={plateCalcWeight !== null}
        initialWeight={plateCalcWeight || 60}
        onClose={() => {
          setPlateCalcWeight(null);
          setActiveSetForPlateCalc(null);
        }}
        onApply={(w: number) => {
          if (activeSetForPlateCalc) {
            updateSet(activeSetForPlateCalc.exerciseId, activeSetForPlateCalc.setId, {
              weightKg: w,
              isWeightEdited: true,
            });
          }
        }}
      />

      {/* Rest Time Wheel Modal */}
      <TrackingTypeModal
        visible={trackingTypeExercise !== null}
        exerciseName={trackingTypeExercise?.exercise?.name}
        selectedType={getTrackingType(trackingTypeExercise ?? undefined)}
        onSelect={type => {
          if (!trackingTypeExercise) return;
          setExerciseTrackingType(trackingTypeExercise.id, type);
          saveExerciseTrackingType(trackingTypeExercise.exerciseId, type).catch(() => {});
        }}
        onClose={() => setTrackingTypeExercise(null)}
      />

      <RestTimeWheelModal
        visible={restWheelActiveExercise !== null}
        initialSeconds={restWheelActiveExercise?.restTimerSeconds ?? 0}
        exerciseName={restWheelActiveExercise?.exercise?.name}
        onClose={() => setRestWheelActiveExercise(null)}
        onSave={seconds => {
          if (restWheelActiveExercise) {
            updateExerciseRestTimer(restWheelActiveExercise.id, seconds);
          }
        }}
      />

      {/* Set Options & Fast 1-Tap RPE Modal */}
      <Modal
        visible={setOptionsModal !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSetOptionsModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.setOptionsSheet, { paddingBottom: Math.max(20, insets.bottom + 12) }]}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalHeaderTitle}>
                  Set {setOptionsModal?.set.setNumber} Details
                </Text>
                <Text style={styles.modalHeaderSubtitle}>{setOptionsModal?.exerciseName}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSetOptionsModal(null)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* PR Achievement Banner */}
            {setOptionsModal && prSummary?.setPRs.get(setOptionsModal.set.id) && (
              <View style={styles.prOptionsBanner}>
                <View style={styles.prOptionsBannerHeader}>
                  <Trophy size={16} color={colors.warning} />
                  <Text style={styles.prOptionsBannerTitle}>
                    {prSummary.setPRs.get(setOptionsModal.set.id)!.primary?.rank === 1
                      ? 'PERSONAL RECORD (1ST BEST)'
                      : prSummary.setPRs.get(setOptionsModal.set.id)!.primary?.rank === 2
                        ? 'SILVER RECORD (2ND BEST)'
                        : 'BRONZE RECORD (3RD BEST)'}
                  </Text>
                </View>
                {prSummary.setPRs.get(setOptionsModal.set.id)!.achievements.map((ach, idx) => (
                  <Text key={idx} style={styles.prOptionsDetailText}>
                    • {formatPRDescription(ach, unit)}
                  </Text>
                ))}
              </View>
            )}

            {/* Set Type Selector */}
            <View style={styles.optionsSection}>
              <Text style={styles.sectionLabel}>SET TYPE</Text>
              <View style={styles.typeChipsRow}>
                {(
                  [
                    { type: 'normal', label: 'Normal' },
                    { type: 'warmup', label: 'Warmup (W)' },
                    { type: 'drop', label: 'Drop (D)' },
                    { type: 'failure', label: 'Failure (F)' },
                  ] as const
                ).map(t => {
                  const isSelected = setOptionsModal?.set.type === t.type;
                  return (
                    <TouchableOpacity
                      key={t.type}
                      style={[styles.typeChip, isSelected && styles.typeChipActive]}
                      onPress={() => handleSelectSetType(t.type)}
                    >
                      <Text style={[styles.typeChipText, isSelected && styles.typeChipTextActive]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Quick Drop Set Load Reduction Helper */}
              {(() => {
                if (setOptionsModal?.set.type !== 'drop') return null;
                const modalEx = activeWorkout?.exercises.find(
                  e => e.id === setOptionsModal.activeExerciseId,
                );
                const setIdx = modalEx?.sets.findIndex(s => s.id === setOptionsModal.set.id) ?? -1;
                const prevWorkingSet = modalEx?.sets
                  .slice(0, setIdx)
                  .reverse()
                  .find(s => s.type !== 'warmup' && s.weightKg > 0);
                if (!prevWorkingSet || !prevWorkingSet.weightKg || prevWorkingSet.weightKg <= 0)
                  return null;

                const inc = getDefaultIncrement(unit);
                const prevDisplay = kgToDisplay(prevWorkingSet.weightKg, unit);
                const dropReductions = [
                  { pct: 20, kg: displayToKg(roundToIncrement(prevDisplay * 0.8, inc), unit) },
                  { pct: 25, kg: displayToKg(roundToIncrement(prevDisplay * 0.75, inc), unit) },
                  { pct: 30, kg: displayToKg(roundToIncrement(prevDisplay * 0.7, inc), unit) },
                ];

                return (
                  <View style={styles.dropHelperBox}>
                    <Text style={styles.dropHelperTitle}>DROP SET WEIGHT SUGGESTIONS</Text>
                    <Text style={styles.dropHelperDesc}>
                      Based on Set #{prevWorkingSet.setNumber} ({prevDisplay} {unit}):
                    </Text>
                    <View style={styles.dropChipsRow}>
                      {dropReductions.map(r => {
                        const isCurrent = Math.abs(setOptionsModal.set.weightKg - r.kg) < 0.05;
                        return (
                          <TouchableOpacity
                            key={r.pct}
                            style={[styles.dropChip, isCurrent && styles.dropChipActive]}
                            onPress={() => {
                              updateSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id, {
                                weightKg: r.kg,
                                isWeightEdited: true,
                              });
                              setSetOptionsModal(prev =>
                                prev
                                  ? {
                                      ...prev,
                                      set: { ...prev.set, weightKg: r.kg, isWeightEdited: true },
                                    }
                                  : null,
                              );
                            }}
                          >
                            <Text
                              style={[styles.dropChipPct, isCurrent && styles.dropChipPctActive]}
                            >
                              -{r.pct}%
                            </Text>
                            <Text
                              style={[
                                styles.dropChipWeight,
                                isCurrent && styles.dropChipWeightActive,
                              ]}
                            >
                              {kgToDisplay(r.kg, unit)} {unit}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })()}
            </View>

            {/* Fast 1-Tap RPE / Effort Grid */}
            <View style={styles.optionsSection}>
              <View style={styles.rpeSectionHeader}>
                <Text style={styles.sectionLabel}>RPE / EFFORT</Text>
                <Text style={styles.rpeSublabel}>(1-tap selection)</Text>
              </View>

              <View style={styles.rpeChipsGrid}>
                {RPE_CHIPS.map(val => {
                  const isSelected =
                    val === null
                      ? setOptionsModal?.set.rpe == null
                      : setOptionsModal?.set.rpe === val;
                  return (
                    <TouchableOpacity
                      key={val === null ? 'none' : val.toString()}
                      style={[styles.rpeChip, isSelected && styles.rpeChipActive]}
                      onPress={() => handleSelectRpe(val)}
                    >
                      <Text style={[styles.rpeChipText, isSelected && styles.rpeChipTextActive]}>
                        {val === null ? 'None' : val.toString()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* RPE Helper Legend */}
              <View style={styles.rpeLegend}>
                <Text style={styles.rpeLegendItem}>• RPE 10: Max Effort (0 RIR)</Text>
                <Text style={styles.rpeLegendItem}>• RPE 9: 1 Rep in Reserve</Text>
                <Text style={styles.rpeLegendItem}>• RPE 8: 2 Reps in Reserve</Text>
                <Text style={styles.rpeLegendItem}>• RPE 7: 3 Reps in Reserve</Text>
              </View>
            </View>

            {/* Quick Action Shortcuts: Reorder */}
            {(() => {
              const modalEx = activeWorkout?.exercises.find(
                e => e.id === setOptionsModal?.activeExerciseId,
              );
              const currentSetIndex =
                modalEx?.sets.findIndex(s => s.id === setOptionsModal?.set.id) ?? -1;
              const totalSets = modalEx?.sets.length ?? 0;
              const isFirstSet = currentSetIndex <= 0;
              const isLastSet = currentSetIndex >= totalSets - 1;

              return (
                <View style={styles.optionsSection}>
                  <View style={styles.rpeSectionHeader}>
                    <Text style={styles.sectionLabel}>REORDER SET</Text>
                    <Text style={styles.rpeSublabel}>
                      {currentSetIndex >= 0 ? `Set ${currentSetIndex + 1} of ${totalSets}` : ''}
                    </Text>
                  </View>
                  <View style={styles.setOptionsActions}>
                    <TouchableOpacity
                      style={[styles.shortcutBtn, isFirstSet && styles.btnDisabled]}
                      disabled={isFirstSet}
                      onPress={() => {
                        if (setOptionsModal && !isFirstSet) {
                          if (Platform.OS !== 'web') {
                            bestEffortHaptic(() =>
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
                            );
                          }
                          moveSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id, -1);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Move set up"
                    >
                      <ArrowUp
                        size={16}
                        color={isFirstSet ? colors.textFaint : colors.purpleLight}
                      />
                      <Text
                        style={[
                          styles.shortcutBtnText,
                          { color: isFirstSet ? colors.textFaint : colors.purpleLight },
                        ]}
                      >
                        Move Up {currentSetIndex > 0 ? `(to #${currentSetIndex})` : ''}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.shortcutBtn, isLastSet && styles.btnDisabled]}
                      disabled={isLastSet}
                      onPress={() => {
                        if (setOptionsModal && !isLastSet) {
                          if (Platform.OS !== 'web') {
                            bestEffortHaptic(() =>
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
                            );
                          }
                          moveSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id, 1);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Move set down"
                    >
                      <ArrowDown
                        size={16}
                        color={isLastSet ? colors.textFaint : colors.purpleLight}
                      />
                      <Text
                        style={[
                          styles.shortcutBtnText,
                          { color: isLastSet ? colors.textFaint : colors.purpleLight },
                        ]}
                      >
                        Move Down{' '}
                        {currentSetIndex >= 0 && currentSetIndex < totalSets - 1
                          ? `(to #${currentSetIndex + 2})`
                          : ''}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}

            {/* Quick Action Shortcuts: Tools */}
            <View style={styles.setOptionsActions}>
              <TouchableOpacity
                style={styles.shortcutBtn}
                onPress={() => {
                  if (setOptionsModal) {
                    setPlateCalcWeight(setOptionsModal.set.weightKg || 60);
                    setActiveSetForPlateCalc({
                      exerciseId: setOptionsModal.activeExerciseId,
                      setId: setOptionsModal.set.id,
                    });
                    setSetOptionsModal(null);
                  }
                }}
              >
                <Calculator size={16} color={colors.primary} />
                <Text style={styles.shortcutBtnText}>Plate Calculator</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.shortcutDeleteBtn}
                onPress={() => {
                  if (setOptionsModal) {
                    removeSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id);
                    setSetOptionsModal(null);
                  }
                }}
              >
                <Trash2 size={16} color={colors.danger} />
                <Text style={styles.shortcutDeleteText}>Delete Set</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.doneModalBtn} onPress={() => setSetOptionsModal(null)}>
              <Text style={styles.doneModalBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Exercise Options Menu Modal */}
      <Modal
        visible={menuActiveExercise !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuActiveExercise(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setMenuActiveExercise(null)}
        >
          <View
            style={[styles.sheetContainer, { paddingBottom: Math.max(20, insets.bottom + 12) }]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                {menuActiveExercise?.exercise?.name}
              </Text>
              <TouchableOpacity
                onPress={() => setMenuActiveExercise(null)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                if (menuActiveExercise?.exercise) {
                  const ex = menuActiveExercise.exercise;
                  setMenuActiveExercise(null);
                  setSelectedDetailExercise(ex);
                }
              }}
            >
              <Info size={18} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>View Exercise Details</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, menuExerciseIndex <= 0 && styles.menuItemDisabled]}
              disabled={menuExerciseIndex <= 0}
              onPress={() => {
                if (menuActiveExercise) {
                  if (Platform.OS !== 'web') {
                    bestEffortHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  }
                  moveExercise(menuActiveExercise.id, -1);
                  setMenuActiveExercise(null);
                }
              }}
            >
              <ArrowUp
                size={18}
                color={menuExerciseIndex <= 0 ? colors.textFaint : colors.textSecondary}
              />
              <Text style={styles.menuItemText}>Move Up</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.menuItem,
                (menuExerciseIndex < 0 ||
                  menuExerciseIndex >= activeWorkout.exercises.length - 1) &&
                  styles.menuItemDisabled,
              ]}
              disabled={
                menuExerciseIndex < 0 || menuExerciseIndex >= activeWorkout.exercises.length - 1
              }
              onPress={() => {
                if (menuActiveExercise) {
                  if (Platform.OS !== 'web') {
                    bestEffortHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  }
                  moveExercise(menuActiveExercise.id, 1);
                  setMenuActiveExercise(null);
                }
              }}
            >
              <ArrowDown
                size={18}
                color={
                  menuExerciseIndex < 0 || menuExerciseIndex >= activeWorkout.exercises.length - 1
                    ? colors.textFaint
                    : colors.textSecondary
                }
              />
              <Text style={styles.menuItemText}>Move Down</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuActiveExercise(null);
                setShowReorderModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Reorder all exercises"
            >
              <ArrowUpDown size={18} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>Reorder All Exercises</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                if (menuActiveExercise) {
                  setSwapExerciseId(menuActiveExercise.id);
                  setMenuActiveExercise(null);
                  setShowExercisePicker(true);
                }
              }}
            >
              <Repeat size={18} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>Swap Exercise</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                if (menuActiveExercise) {
                  const ex = menuActiveExercise;
                  setMenuActiveExercise(null);
                  setRestWheelActiveExercise(ex);
                }
              }}
            >
              <Timer size={18} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>Set Rest Timer</Text>
            </TouchableOpacity>

            {trackingTypesEnabled && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  if (menuActiveExercise) {
                    const ex = menuActiveExercise;
                    setMenuActiveExercise(null);
                    setTrackingTypeExercise(ex);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Change how sets are tracked"
              >
                <SlidersHorizontal size={18} color={colors.textSecondary} />
                <Text style={styles.menuItemText} numberOfLines={1}>
                  Track As: {trackingTypeLabel(getTrackingType(menuActiveExercise ?? undefined))}
                </Text>
              </TouchableOpacity>
            )}

            {menuHasLoad && (
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    if (menuActiveExercise) {
                      const firstSet = menuActiveExercise.sets[0];
                      setPlateCalcWeight(firstSet?.weightKg || 60);
                      setActiveSetForPlateCalc({
                        exerciseId: menuActiveExercise.id,
                        setId: firstSet?.id || '',
                      });
                      setMenuActiveExercise(null);
                    }
                  }}
                >
                  <Calculator size={18} color={colors.textSecondary} />
                  <Text style={styles.menuItemText}>Plate Calculator</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    if (menuActiveExercise) {
                      const ex = menuActiveExercise;
                      setMenuActiveExercise(null);
                      handleAddQuickWarmup(ex);
                    }
                  }}
                >
                  <Flame size={18} color="#F97316" />
                  <Text style={styles.menuItemText}>Add Warm-up Set</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    if (menuActiveExercise) {
                      const ex = menuActiveExercise;
                      setMenuActiveExercise(null);
                      setWarmupModalExercise(ex);
                    }
                  }}
                >
                  <Calculator size={18} color="#F97316" />
                  <Text style={styles.menuItemText}>Warm-up Calculator...</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                if (menuActiveExercise) {
                  const exId = menuActiveExercise.id;
                  setMenuActiveExercise(null);
                  setSupersetModalExerciseId(exId);
                }
              }}
            >
              <Layers size={18} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>
                {menuActiveExercise?.supersetId ? 'Edit Superset' : 'Create Superset'}
              </Text>
            </TouchableOpacity>

            {menuActiveExercise?.supersetId && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  if (menuActiveExercise) {
                    unlinkSuperset(menuActiveExercise.id);
                    setMenuActiveExercise(null);
                  }
                }}
              >
                <Layers size={18} color={colors.danger} />
                <Text style={[styles.menuItemText, { color: colors.danger }]}>
                  Ungroup Superset
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                if (menuActiveExercise) {
                  setEditingNoteExId(menuActiveExercise.id);
                  setExerciseExpanded(menuActiveExercise.id, true);
                  setMenuActiveExercise(null);
                }
              }}
            >
              <FileText size={18} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>Add / Edit Note</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDestructive]}
              onPress={async () => {
                if (menuActiveExercise) {
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
                }
              }}
            >
              <Trash2 size={18} color={colors.danger} />
              <Text style={styles.menuItemTextDestructive}>Remove Exercise</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Workout Options Menu Modal */}
      <Modal
        visible={showWorkoutMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowWorkoutMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowWorkoutMenu(false)}
        >
          <View
            style={[styles.sheetContainer, { paddingBottom: Math.max(20, insets.bottom + 12) }]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                {activeWorkout.name}
              </Text>
              <TouchableOpacity
                onPress={() => setShowWorkoutMenu(false)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.menuItem} onPress={expandAll}>
              <ChevronDown size={18} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>Expand All Exercises</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={collapseAll}>
              <ChevronUp size={18} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>Collapse All Exercises</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowWorkoutMenu(false);
                setShowReorderModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Reorder exercises"
            >
              <ArrowUpDown size={18} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>Reorder Exercises</Text>
            </TouchableOpacity>

            {gymTrackingEnabled && displayedActiveGym && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowWorkoutMenu(false);
                  setShowGymPicker(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Change workout gym, currently ${displayedActiveGym.name}`}
              >
                <MapPin size={18} color={colors.textSecondary} />
                <Text style={styles.menuItemText} numberOfLines={1}>
                  Change Gym · {displayedActiveGym.name}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowWorkoutMenu(false);
                setDurationModalSafetyMode(false);
                setShowDurationModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Adjust workout duration"
            >
              <Clock size={18} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>Adjust Workout Time</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowRpeColumn(prev => !prev);
                setShowWorkoutMenu(false);
              }}
            >
              <Gauge size={18} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>
                {showRpeColumn ? 'Hide RPE Column' : 'Show RPE Column'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDestructive]}
              onPress={handleDiscard}
            >
              <Trash2 size={18} color={colors.danger} />
              <Text style={styles.menuItemTextDestructive}>Discard Workout</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Workout Duration Adjustment & 4hr+ Safety Modal */}
      <WorkoutDurationModal
        visible={showDurationModal}
        initialDurationSeconds={
          showDurationModal ? computeElapsedSeconds(activeWorkout.startTime, Date.now()) : 0
        }
        workout={activeWorkout}
        showSafetyPrompt={durationModalSafetyMode}
        onSave={newSeconds => {
          setShowDurationModal(false);
          if (durationModalSafetyMode) {
            setDurationModalSafetyMode(false);
            void handleExecuteFinish(newSeconds);
          } else {
            updateWorkoutDuration(newSeconds);
          }
        }}
        onClose={() => {
          setShowDurationModal(false);
          setDurationModalSafetyMode(false);
        }}
      />

      {/* Dedicated Exercise Reorder Modal */}
      <ExerciseReorderModal
        visible={showReorderModal}
        exercises={activeWorkout.exercises}
        onMoveExercise={handleMoveExercise}
        onMoveExerciseToIndex={handleMoveExerciseToIndex}
        onClose={() => setShowReorderModal(false)}
      />
    </KeyboardAvoidingView>
  );
};
