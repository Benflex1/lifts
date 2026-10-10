import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
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
  Check,
  Plus,
  Trash2,
  Calculator,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  FileText,
  Timer,
  MoreHorizontal,
  Gauge,
  MapPin,
  Dumbbell,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Repeat,
  Trophy,
  Info,
  Flame,
  Layers,
  GripVertical,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useIsRestTimerActive, useWorkout, useWorkoutClock } from '../context/WorkoutContext';
import { computeElapsedSeconds } from '../utils/timer';
import { useSettings } from '../context/SettingsContext';
import { formatWeight, kgToDisplay, displayToKg } from '../utils/units';
import { formatTimer, formatDuration } from '../utils/calculator';
import { PlateCalculatorModal } from '../components/PlateCalculatorModal';
import { ExercisePickerModal } from '../components/ExercisePickerModal';
import { ExerciseDetailModal } from '../components/ExerciseDetailModal';
import { RestTimerOverlay } from '../components/RestTimerOverlay';
import { RestTimeWheelModal } from '../components/RestTimeWheelModal';
import { ExerciseReorderModal } from '../components/ExerciseReorderModal';
import { GymPickerModal } from '../components/GymPickerModal';
import { WeightInput } from '../components/WeightInput';
import { RepsInput } from '../components/RepsInput';
import { SwipeableSetRow } from '../components/SwipeableSetRow';
import { Exercise, SetType, Workout, WorkoutSet, ActiveExercise, ExerciseGymScope } from '../types';
import { useDialog } from '../context/DialogContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RPE_CHIPS } from '../workout/sets';
import { formatPreviousMetric } from '../workout/gym-display';
import { getCompletedWorkoutsForExercise, getCompletedWorkoutsForExercises, getExerciseGymScope } from '../database/db';
import { buildActiveWorkoutRecordIndex, evaluateActiveWorkoutPRs, formatPRDescription, WorkoutPRSummary } from '../workout/pr';
import { PRBadge } from '../components/PRBadge';
import { PRCelebrationToast, PRCelebrationEvent } from '../components/PRCelebrationToast';
import { WarmupModal } from '../components/WarmupModal';
import { SupersetModal } from '../components/SupersetModal';
import { ExerciseVisual } from '../components/MemoizedExerciseVisual';
import { getExerciseRowViewModel } from '../utils/exercise-ui';
import { roundToIncrement, getDefaultIncrement, getDefaultBarWeight } from '../workout/warmup';
import { getSupersetMetadata, resolveNextSupersetTarget } from '../workout/supersets';
import { applyPreviousSetStats } from '../workout/gym-session';
import { WorkoutDurationModal } from '../components/WorkoutDurationModal';
import { isExcessiveDuration } from '../workout/duration';
import { colors } from '../theme';
import { getTrackingType, setVolumeKg } from '../workout/tracking';

/** Renders the ticking workout duration without re-rendering the whole logger every second. */
const LiveWorkoutClock: React.FC = () => {
  const elapsedSeconds = useWorkoutClock();
  return <>{formatTimer(elapsedSeconds)}</>;
};

export const ActiveWorkoutScreen: React.FC<{ onFinish: (workout: Workout) => void }> = ({ onFinish }) => {
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
  const { unit, gymTrackingEnabled } = useSettings();
  const { confirm, notify } = useDialog();

  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showGymPicker, setShowGymPicker] = useState(false);
  const [swapExerciseId, setSwapExerciseId] = useState<string | null>(null);
  const [restWheelActiveExercise, setRestWheelActiveExercise] = useState<ActiveExercise | null>(null);
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

  const supersetModalExercises = useMemo(() => {
    return (activeWorkout?.exercises || []).map((e) => ({
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
      unit
    );

    let targetWorkingWeight = 0;
    const workingSet = activeEx.sets.find((s) => s.type !== 'warmup' && s.weightKg > 0);
    if (workingSet) {
      targetWorkingWeight = workingSet.weightKg;
    } else {
      const ghostSet = activeEx.sets.find((s) => (s.previousWeightKg || 0) > 0);
      targetWorkingWeight =
        ghostSet?.previousWeightKg ||
        (defaultBar > 0 ? (unit === 'lb' ? displayToKg(135, 'lb') : 60) : 0);
    }

    const inc = getDefaultIncrement(unit);
    const displayWorking = kgToDisplay(targetWorkingWeight, unit);
    const displayWarmup = Math.max(
      roundToIncrement(displayWorking * 0.5, inc),
      defaultBar
    );
    const warmupWeightKg = displayToKg(displayWarmup, unit);

    insertWarmupSets(
      activeEx.id,
      [{ weightKg: warmupWeightKg, reps: 8 }],
      false
    );

    if (Platform.OS !== 'web') {
      try {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    }
  };

  const handleMoveExercise = (activeExerciseId: string, direction: -1 | 1) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    moveExercise(activeExerciseId, direction);
  };

  const handleMoveExerciseToIndex = (activeExerciseId: string, targetIndex: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
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
  const [exerciseScopes, setExerciseScopes] = useState<Record<string, ExerciseGymScope | undefined>>({});
  const [prCelebrationEvent, setPrCelebrationEvent] = useState<PRCelebrationEvent | null>(null);

  useEffect(() => {
    if (!activeWorkout) return;
    const missingIds = Array.from(
      new Set(activeWorkout.exercises.map((ex) => ex.exerciseId))
    ).filter((id) => !(id in exerciseWorkouts));

    if (missingIds.length === 0) return;

    let mounted = true;
    Promise.all([
      getCompletedWorkoutsForExercises(missingIds),
      Promise.all(missingIds.map((id) => getExerciseGymScope(id))),
    ]).then(([workoutsByEx, scopes]) => {
      if (!mounted) return;
      setExerciseWorkouts((prev) => ({
        ...prev,
        ...workoutsByEx,
      }));
      setExerciseScopes((prev) => {
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
    [exerciseWorkouts, activeWorkoutId]
  );

  const prSummary = useMemo(() => {
    if (!activeWorkout) return null;
    return evaluateActiveWorkoutPRs(activeWorkout, exerciseWorkouts, priorRecordIndex, gyms, gymTrackingEnabled, exerciseScopes);
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
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (_) {}
          for (const ex of activeWorkout.exercises) {
            const foundSet = ex.sets.find((s) => s.id === setId);
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

  const handleToggleSetWithHaptics = (exerciseId: string, setId: string) => {
    const currentEx = activeWorkout?.exercises.find((e) => e.id === exerciseId);
    const targetSet = currentEx?.sets.find((s) => s.id === setId);
    const isBecomingCompleted = targetSet ? !targetSet.isCompleted : false;

    toggleSetComplete(exerciseId, setId);

    if (isBecomingCompleted && currentEx?.supersetId && activeWorkout) {
      const nextTarget = resolveNextSupersetTarget(activeWorkout, exerciseId, setId);
      if (nextTarget && !nextTarget.isRoundComplete) {
        setExerciseExpanded(nextTarget.nextExerciseId, true);
        const meta = supersetMetaMap.get(exerciseId);
        const groupLabel = meta?.label || 'SUPERSET';
        setSupersetNextUpCue(`${groupLabel}: ${nextTarget.nextExerciseName} · Set ${nextTarget.nextSetNumber}`);
      } else {
        setSupersetNextUpCue(null);
      }
    } else if (!isBecomingCompleted) {
      setSupersetNextUpCue(null);
    }
  };

  const handleApplyPreviousStats = (exerciseId: string, set: WorkoutSet, targetReps?: string) => {
    if (set.isCompleted) return;
    if (set.previousWeightKg === undefined && set.previousReps === undefined) return;
    if (Platform.OS !== 'web') {
      try {
        Haptics.selectionAsync();
      } catch (_) {}
    }
    const fallbackReps = parseInt(targetReps || '10', 10) || 10;
    const applied = applyPreviousSetStats(set, fallbackReps);
    updateSet(exerciseId, set.id, {
      weightKg: applied.weightKg,
      reps: applied.reps,
      isWeightEdited: true,
    });
  };

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

  const ensureInputVisible = () => {
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
  };

  const handleInputFocus = (event: any, inputRef?: React.RefObject<any>) => {
    activeInputRef.current = inputRef?.current || event?.target;
    setTimeout(ensureInputVisible, 120);
  };

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
      onShow
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      onHide
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

  const displayedActiveGym = activeGym || gyms.find((gym) => gym.id === activeWorkout.gymId) || null;

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

  const getSetBadgeStyle = (type: SetType) => {
    switch (type) {
      case 'warmup':
        return { bg: colors.warningSoft, border: 'transparent', text: colors.warning, label: 'W' };
      case 'drop':
        return { bg: colors.purpleSoft, border: 'transparent', text: colors.purpleLight, label: 'D' };
      case 'failure':
        return { bg: colors.dangerSoft, border: 'transparent', text: colors.danger, label: 'F' };
      default:
        return { bg: 'transparent', border: 'transparent', text: colors.textSoft, label: '' };
    }
  };

  // Open the instant Set Options / 1-Tap RPE modal
  const openSetOptions = (activeExerciseId: string, exerciseName: string, set: WorkoutSet) => {
    setSetOptionsModal({
      activeExerciseId,
      exerciseName,
      set,
    });
  };

  const handleSelectSetType = (type: SetType) => {
    if (!setOptionsModal) return;
    const modalEx = activeWorkout?.exercises.find((e) => e.id === setOptionsModal.activeExerciseId);
    const setIdx = modalEx?.sets.findIndex((s) => s.id === setOptionsModal.set.id) ?? -1;
    // Find the previous working set (ignoring warmups and unweighted sets)
    const prevWorkingSet = modalEx?.sets
      .slice(0, setIdx)
      .reverse()
      .find((s) => s.type !== 'warmup' && s.weightKg > 0);

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
      updatedWeightKg = displayToKg(roundToIncrement(prevDisp * 0.80, inc), unit);
      isWeightEdited = true;
    }

    updateSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id, {
      type,
      ...(type === 'drop' && updatedWeightKg !== setOptionsModal.set.weightKg
        ? { weightKg: updatedWeightKg, isWeightEdited: true }
        : {}),
    });
    setSetOptionsModal((prev) =>
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
        : null
    );
  };

  const handleSelectRpe = (rpe: number | null) => {
    if (!setOptionsModal) return;
    const updatedRpe = rpe ?? undefined;
    updateSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id, { rpe: updatedRpe });
    setSetOptionsModal((prev) => (prev ? { ...prev, set: { ...prev.set, rpe: updatedRpe } } : null));
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
          {gymTrackingEnabled && displayedActiveGym ? (
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
            { width: `${totalSetsCount > 0 ? Math.round((completedSetsCount / totalSetsCount) * 100) : 0}%` },
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
        onScroll={(e) => {
          currentScrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        scrollEnabled={true}
      >
        {activeWorkout.exercises.map((activeEx, exIndex) => {
          const isExpanded = expandedExercises[activeEx.id] ?? false;
          const completedCount = activeEx.sets.filter((s) => s.isCompleted).length;
          const totalCount = activeEx.sets.length;
          const isAllCompleted = totalCount > 0 && completedCount === totalCount;
          const ssMeta = supersetMetaMap.get(activeEx.id);
          const rowViewModel = activeEx.exercise ? getExerciseRowViewModel(activeEx.exercise) : null;

          const showNoteInput = editingNoteExId === activeEx.id || Boolean(activeEx.notes && activeEx.notes.length > 0);

          const cardElement = !isExpanded ? (
            // Collapsed Accordion Row - Lyfta Screenshot 1
            <TouchableOpacity
              key={activeEx.id}
              style={[
                styles.collapsedCard,
                ssMeta && { borderLeftColor: ssMeta.color, borderLeftWidth: 3.5 },
              ]}
              onPress={() => toggleExerciseExpanded(activeEx.id)}
              activeOpacity={0.7}
            >
              <TouchableOpacity
                style={styles.exerciseAvatar}
                onPress={(e) => {
                  e.stopPropagation();
                  setSelectedDetailExercise(activeEx.exercise || null);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`View ${activeEx.exercise?.name || 'exercise'} details`}
              >
                {activeEx.exercise ? (
                  <ExerciseVisual
                    exercise={activeEx.exercise}
                    size="compact"
                    accessibilityLabel={rowViewModel?.visualAccessibilityLabel || 'Exercise illustration'}
                  />
                ) : (
                  <Dumbbell size={20} color={colors.primary} />
                )}
              </TouchableOpacity>

              <View style={styles.collapsedContent}>
                <Text style={styles.collapsedTitle} numberOfLines={1}>
                  {activeEx.exercise?.name || 'Exercise'}
                </Text>
                <View style={styles.collapsedMetaRow}>
                  {ssMeta && (
                    <View style={[styles.ssPositionBadge, { borderColor: ssMeta.color, marginRight: 6 }]}>
                      <Text style={[styles.ssPositionText, { color: ssMeta.color }]}>
                        {ssMeta.positionInGroup}/{ssMeta.totalInGroup}
                      </Text>
                    </View>
                  )}
                  <Text
                    style={[
                      styles.collapsedSubtitle,
                      isAllCompleted && styles.completedSubtitleText,
                    ]}
                  >
                    {completedCount}/{totalCount} done
                  </Text>
                  {isAllCompleted && (
                    <CheckCircle2 size={13} color={colors.success} style={{ marginLeft: 4 }} />
                  )}
                </View>
              </View>

              <View style={styles.collapsedActions}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    setMenuActiveExercise(activeEx);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  accessibilityLabel="Exercise menu"
                  accessibilityRole="button"
                >
                  <MoreHorizontal size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                <ChevronDown size={18} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          ) : (
            // Expanded Full Exercise Card
            <View
              key={activeEx.id}
              style={[
                styles.exerciseCard,
                ssMeta && { borderLeftColor: ssMeta.color, borderLeftWidth: 3.5 },
              ]}
            >
              {/* Exercise Header */}
              <View style={styles.cardHeader}>
                <TouchableOpacity
                  style={styles.exerciseAvatar}
                  onPress={() => setSelectedDetailExercise(activeEx.exercise || null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${activeEx.exercise?.name || 'exercise'} details`}
                >
                  {activeEx.exercise ? (
                    <ExerciseVisual
                      exercise={activeEx.exercise}
                      size="compact"
                      accessibilityLabel={rowViewModel?.visualAccessibilityLabel || 'Exercise illustration'}
                    />
                  ) : (
                    <Dumbbell size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.exerciseTitleGroup}
                  onPress={() => setSelectedDetailExercise(activeEx.exercise || null)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${activeEx.exercise?.name || 'exercise'} details`}
                >
                  <Text style={styles.exerciseName}>{activeEx.exercise?.name || 'Exercise'}</Text>
                  <View style={styles.badgeRow}>
                    <Text style={styles.muscleBadge} numberOfLines={1}>
                      {[
                        (Array.isArray(activeEx.exercise?.primaryMuscles)
                          ? activeEx.exercise.primaryMuscles
                          : []
                        ).join(', '),
                        activeEx.exercise?.equipment,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {activeEx.targetReps ? (
                      <Text style={styles.targetBadge}>{activeEx.targetReps} reps</Text>
                    ) : null}
                    {ssMeta && (
                      <View style={[styles.ssPositionBadge, { borderColor: ssMeta.color }]}>
                        <Text style={[styles.ssPositionText, { color: ssMeta.color }]}>
                          {ssMeta.positionInGroup}/{ssMeta.totalInGroup}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>

                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => setMenuActiveExercise(activeEx)}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                        <MoreHorizontal size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => toggleExerciseExpanded(activeEx.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      >
                        <ChevronUp size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>

              {/* Rest timer + note pills */}
              <View style={styles.exerciseMetaRow}>
                <TouchableOpacity
                  style={styles.restTimerRow}
                  onPress={() => setRestWheelActiveExercise(activeEx)}
                  accessibilityRole="button"
                  accessibilityLabel="Set rest timer"
                >
                  <Timer size={13} color={colors.primaryLight} />
                  <Text style={styles.restTimerRowText}>
                    Rest {activeEx.restTimerSeconds ? formatDuration(activeEx.restTimerSeconds) : 'Off'}
                  </Text>
                </TouchableOpacity>
                {!showNoteInput && (
                  <TouchableOpacity
                    style={styles.addNotePrompt}
                    onPress={() => setEditingNoteExId(activeEx.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Add note"
                  >
                    <FileText size={13} color={colors.textSecondary} />
                    <Text style={styles.addNotePromptText}>Note</Text>
                  </TouchableOpacity>
                )}
              </View>

              {showNoteInput && (
                <View style={styles.exerciseNoteRow}>
                  <FileText size={13} color={colors.textSecondary} />
                  <TextInput
                    style={styles.exerciseNoteInput}
                    placeholder="Add note (e.g. seat pin 4, slow tempo)..."
                    placeholderTextColor={colors.textMuted}
                    value={activeEx.notes || ''}
                    onChangeText={(txt) => updateExerciseNotes(activeEx.id, txt)}
                    onFocus={handleInputFocus}
                    autoFocus={editingNoteExId === activeEx.id && (!activeEx.notes || activeEx.notes.length === 0)}
                  />
                </View>
              )}

              {/* Table Column Labels */}
              <View style={styles.tableHeader}>
                <Text style={[styles.colHeader, { width: 38, textAlign: 'center' }]}>SET</Text>
                <Text style={[styles.colHeader, { flex: 1, paddingLeft: 8 }]}>PREVIOUS</Text>
                <Text style={[styles.colHeader, { width: 78, textAlign: 'center' }]}>
                  {unit.toUpperCase()}
                </Text>
                <Text style={[styles.colHeader, { width: 70, textAlign: 'center' }]}>REPS</Text>
                {showRpeColumn && (
                  <Text style={[styles.colHeader, { width: 44, textAlign: 'center' }]}>RPE</Text>
                )}
                <View style={{ width: 46 }} />
              </View>

              {/* Set Rows */}
              {activeEx.sets.map((set) => {
                const badge = getSetBadgeStyle(set.type);

                return (
                  <SwipeableSetRow
                    key={set.id}
                    isCompleted={set.isCompleted}
                    onDelete={() => removeSet(activeEx.id, set.id)}
                  >
                    <View
                      style={[styles.setRow, set.isCompleted && styles.setRowCompleted]}
                    >
                      {/* Set Number / Type Toggle Badge */}
                      <TouchableOpacity
                        style={[
                          styles.setBadge,
                          { backgroundColor: badge.bg, borderColor: badge.border },
                        ]}
                        onPress={() =>
                          openSetOptions(activeEx.id, activeEx.exercise?.name || 'Exercise', set)
                        }
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                      >
                        <Text style={[styles.setBadgeText, { color: badge.text }]}>
                          {badge.label || set.setNumber}
                        </Text>
                      </TouchableOpacity>

                      {/* Previous Performance Comparison / PR Medal */}
                      <View style={styles.previousCell}>
                        {set.isCompleted && prSummary?.setPRs.get(set.id)?.primary ? (
                          <View style={styles.prBadgeWrap}>
                            <PRBadge
                              achievement={prSummary.setPRs.get(set.id)!.primary!}
                              compact
                              showGym={gymTrackingEnabled}
                              additionalCount={Math.max(0, (prSummary.setPRs.get(set.id)?.achievements.length || 0) - 1)}
                              onPress={() =>
                                openSetOptions(activeEx.id, activeEx.exercise?.name || 'Exercise', set)
                              }
                            />
                          </View>
                        ) : (set.previousWeightKg !== undefined || set.previousReps !== undefined) ? (
                          <TouchableOpacity
                            style={styles.previousButton}
                            onPress={() => handleApplyPreviousStats(activeEx.id, set, activeEx.targetReps)}
                            disabled={set.isCompleted}
                            activeOpacity={0.6}
                            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Apply previous stats: ${formatPreviousMetric(
                              {
                                weightKg: set.previousWeightKg ?? 0,
                                reps: set.previousReps ?? 0,
                                sourceGymId: set.previousGymId,
                                sourceGymName: gymTrackingEnabled ? set.previousGymName : undefined,
                              },
                              unit,
                            )}`}
                          >
                            <Text style={[styles.previousText, !set.isCompleted && styles.previousTextClickable]}>
                              {formatPreviousMetric(
                                {
                                  weightKg: set.previousWeightKg ?? 0,
                                  reps: set.previousReps ?? 0,
                                  sourceGymId: set.previousGymId,
                                  sourceGymName: gymTrackingEnabled ? set.previousGymName : undefined,
                                },
                                unit,
                              )}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={styles.previousPlaceholder}>—</Text>
                        )}
                      </View>

                      {/* Weight Input */}
                      <View style={styles.inputWrapWeight}>
                        <WeightInput
                          value={set.weightKg}
                          isEdited={set.isWeightEdited}
                          onCommit={(w, edited) =>
                            updateSet(activeEx.id, set.id, {
                              weightKg: w,
                              isWeightEdited: edited !== undefined ? edited : true,
                            })
                          }
                          placeholder={
                            set.previousWeightKg !== undefined && set.previousWeightKg > 0
                              ? kgToDisplay(set.previousWeightKg, unit).toString()
                              : '-'
                          }
                          completed={set.isCompleted}
                          style={[styles.cellInput, set.isCompleted && styles.inputCompleted]}
                          onFocus={handleInputFocus}
                        />
                      </View>

                      {/* Reps Input */}
                      <View style={styles.inputWrapReps}>
                        <RepsInput
                          value={set.reps}
                          onCommit={(r) => updateSet(activeEx.id, set.id, { reps: r })}
                          placeholder={
                            activeEx.targetReps || (set.previousReps ? set.previousReps.toString() : '10')
                          }
                          completed={set.isCompleted}
                          style={[styles.cellInput, set.isCompleted && styles.inputCompleted]}
                          onFocus={handleInputFocus}
                        />
                        {/* Compact RPE badge if defined and inline column is hidden */}
                        {!showRpeColumn && set.rpe != null && (
                          <TouchableOpacity
                            style={styles.compactRpeBadge}
                            onPress={() =>
                              openSetOptions(activeEx.id, activeEx.exercise?.name || 'Exercise', set)
                            }
                          >
                            <Text style={styles.compactRpeText}>@{set.rpe}</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Optional Inline RPE Column */}
                      {showRpeColumn && (
                        <TouchableOpacity
                          style={styles.rpeColCell}
                          onPress={() =>
                            openSetOptions(activeEx.id, activeEx.exercise?.name || 'Exercise', set)
                          }
                          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        >
                          <Text style={styles.rpeColCellText}>
                            {set.rpe != null ? set.rpe.toString() : '–'}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* Completion Checkbox */}
                      <TouchableOpacity
                        style={[
                          styles.checkBtn,
                          set.isCompleted ? styles.checkBtnActive : styles.checkBtnInactive,
                        ]}
                        onPress={() => handleToggleSetWithHaptics(activeEx.id, set.id)}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        accessibilityRole="checkbox"
                        accessibilityLabel={`Complete set ${set.setNumber}`}
                        accessibilityState={{ checked: set.isCompleted }}
                        aria-checked={set.isCompleted}
                      >
                        <Check
                          size={20}
                          color={set.isCompleted ? colors.black : colors.textFaint}
                          strokeWidth={2.8}
                        />
                      </TouchableOpacity>
                    </View>
                  </SwipeableSetRow>
                );
              })}

              {/* Add Set Button */}
              <TouchableOpacity
                style={styles.addSetBtnWide}
                onPress={() => addSet(activeEx.id, 'normal')}
                accessibilityRole="button"
                accessibilityLabel="Add set"
              >
                <Plus size={16} color={colors.text} />
                <Text style={styles.addSetBtnWideText}>Add Set</Text>
              </TouchableOpacity>
            </View>
          );

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

              {cardElement}

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
            <Text style={styles.emptyWorkoutText}>Add your first exercise to start logging sets.</Text>
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
        <View style={[styles.supersetFloatingCue, { bottom: keyboardHeight > 0 ? keyboardHeight + 16 : 24 }]}>
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
        onSaveSuperset={(selectedIds) => {
          setSupersetGroup(selectedIds);
          setSupersetModalExerciseId(null);
        }}
        onUngroupSuperset={(exId) => {
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
      <RestTimeWheelModal
        visible={restWheelActiveExercise !== null}
        initialSeconds={restWheelActiveExercise?.restTimerSeconds ?? 0}
        exerciseName={restWheelActiveExercise?.exercise?.name}
        onClose={() => setRestWheelActiveExercise(null)}
        onSave={(seconds) => {
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
          <View style={[styles.setOptionsSheet, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalHeaderTitle}>
                  Set {setOptionsModal?.set.setNumber} Details
                </Text>
                <Text style={styles.modalHeaderSubtitle}>
                  {setOptionsModal?.exerciseName}
                </Text>
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
                ).map((t) => {
                  const isSelected = setOptionsModal?.set.type === t.type;
                  return (
                    <TouchableOpacity
                      key={t.type}
                      style={[styles.typeChip, isSelected && styles.typeChipActive]}
                      onPress={() => handleSelectSetType(t.type)}
                    >
                      <Text
                        style={[styles.typeChipText, isSelected && styles.typeChipTextActive]}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Quick Drop Set Load Reduction Helper */}
              {(() => {
                if (setOptionsModal?.set.type !== 'drop') return null;
                const modalEx = activeWorkout?.exercises.find((e) => e.id === setOptionsModal.activeExerciseId);
                const setIdx = modalEx?.sets.findIndex((s) => s.id === setOptionsModal.set.id) ?? -1;
                const prevWorkingSet = modalEx?.sets
                  .slice(0, setIdx)
                  .reverse()
                  .find((s) => s.type !== 'warmup' && s.weightKg > 0);
                if (!prevWorkingSet || !prevWorkingSet.weightKg || prevWorkingSet.weightKg <= 0) return null;

                const inc = getDefaultIncrement(unit);
                const prevDisplay = kgToDisplay(prevWorkingSet.weightKg, unit);
                const dropReductions = [
                  { pct: 20, kg: displayToKg(roundToIncrement(prevDisplay * 0.80, inc), unit) },
                  { pct: 25, kg: displayToKg(roundToIncrement(prevDisplay * 0.75, inc), unit) },
                  { pct: 30, kg: displayToKg(roundToIncrement(prevDisplay * 0.70, inc), unit) },
                ];

                return (
                  <View style={styles.dropHelperBox}>
                    <Text style={styles.dropHelperTitle}>DROP SET WEIGHT SUGGESTIONS</Text>
                    <Text style={styles.dropHelperDesc}>
                      Based on Set #{prevWorkingSet.setNumber} ({prevDisplay} {unit}):
                    </Text>
                    <View style={styles.dropChipsRow}>
                      {dropReductions.map((r) => {
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
                              setSetOptionsModal((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      set: { ...prev.set, weightKg: r.kg, isWeightEdited: true },
                                    }
                                  : null
                              );
                            }}
                          >
                            <Text style={[styles.dropChipPct, isCurrent && styles.dropChipPctActive]}>
                              -{r.pct}%
                            </Text>
                            <Text style={[styles.dropChipWeight, isCurrent && styles.dropChipWeightActive]}>
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
                {RPE_CHIPS.map((val) => {
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
              const modalEx = activeWorkout?.exercises.find((e) => e.id === setOptionsModal?.activeExerciseId);
              const currentSetIndex = modalEx?.sets.findIndex((s) => s.id === setOptionsModal?.set.id) ?? -1;
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
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          }
                          moveSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id, -1);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Move set up"
                    >
                      <ArrowUp size={16} color={isFirstSet ? colors.textFaint : colors.purpleLight} />
                      <Text style={[styles.shortcutBtnText, { color: isFirstSet ? colors.textFaint : colors.purpleLight }]}>
                        Move Up {currentSetIndex > 0 ? `(to #${currentSetIndex})` : ''}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.shortcutBtn, isLastSet && styles.btnDisabled]}
                      disabled={isLastSet}
                      onPress={() => {
                        if (setOptionsModal && !isLastSet) {
                          if (Platform.OS !== 'web') {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          }
                          moveSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id, 1);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Move set down"
                    >
                      <ArrowDown size={16} color={isLastSet ? colors.textFaint : colors.purpleLight} />
                      <Text style={[styles.shortcutBtnText, { color: isLastSet ? colors.textFaint : colors.purpleLight }]}>
                        Move Down {currentSetIndex >= 0 && currentSetIndex < totalSets - 1 ? `(to #${currentSetIndex + 2})` : ''}
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

            <TouchableOpacity
              style={styles.doneModalBtn}
              onPress={() => setSetOptionsModal(null)}
            >
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
          <View style={[styles.sheetContainer, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
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
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  }
                  moveExercise(menuActiveExercise.id, -1);
                  setMenuActiveExercise(null);
                }
              }}
            >
              <ArrowUp size={18} color={menuExerciseIndex <= 0 ? colors.textFaint : colors.textSecondary} />
              <Text style={styles.menuItemText}>Move Up</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.menuItem,
                (menuExerciseIndex < 0 || menuExerciseIndex >= activeWorkout.exercises.length - 1) && styles.menuItemDisabled,
              ]}
              disabled={menuExerciseIndex < 0 || menuExerciseIndex >= activeWorkout.exercises.length - 1}
              onPress={() => {
                if (menuActiveExercise) {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  }
                  moveExercise(menuActiveExercise.id, 1);
                  setMenuActiveExercise(null);
                }
              }}
            >
              <ArrowDown
                size={18}
                color={menuExerciseIndex < 0 || menuExerciseIndex >= activeWorkout.exercises.length - 1 ? colors.textFaint : colors.textSecondary}
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
                <Text style={[styles.menuItemText, { color: colors.danger }]}>Ungroup Superset</Text>
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
          <View style={[styles.sheetContainer, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
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
                setShowRpeColumn((prev) => !prev);
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
        onSave={(newSeconds) => {
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

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // Top App Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: colors.bg,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  topRightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  finishBtn: {
    backgroundColor: colors.success,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 19,
  },
  finishBtnText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '800',
  },
  moreBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Metrics Strip (Lyfta Screenshot 2)
  metricsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
  },
  metricColumn: {
    flex: 1,
  },
  metricColLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  metricColValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },

  // Scroll Content
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 130,
  },

  // Collapsed Card (Lyfta Screenshot 1)
  collapsedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 8,
  },
  exerciseAvatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  collapsedContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  collapsedTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  collapsedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  collapsedSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  completedSubtitleText: {
    color: colors.success,
    fontWeight: '600',
  },
  collapsedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // Expanded Exercise Card
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  exerciseTitleGroup: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  muscleBadge: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
    flexShrink: 1,
  },
  targetBadge: {
    color: colors.primaryLight,
    backgroundColor: colors.primarySoft,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Note Row (Lyfta style)
  exerciseNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    marginHorizontal: 2,
  },
  exerciseNoteInput: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 13,
    padding: 0,
  },
  addNotePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
  },
  addNotePromptText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },

  // Rest Timer Row (Lyfta style)
  restTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  restTimerRowText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },

  // Table Header
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    marginBottom: 2,
  },
  colHeader: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // Set Rows
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 10,
  },
  setRowCompleted: {
    backgroundColor: colors.successSoft,
  },
  setBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    marginLeft: 2,
    borderWidth: 1,
  },
  setBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  previousCell: {
    flex: 1,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  prBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prOptionsBanner: {
    backgroundColor: '#78350F25',
    borderColor: '#F59E0B60',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 6,
  },
  prOptionsBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  prOptionsBannerTitle: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  prOptionsDetailText: {
    color: colors.goldLight,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  previousButton: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previousText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  previousTextClickable: {
    color: colors.textSoft,
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: colors.textMuted,
  },
  previousPlaceholder: {
    color: colors.textFaint,
    fontSize: 14,
  },
  inputWrapWeight: {
    width: 78,
    paddingHorizontal: 3,
  },
  inputWrapReps: {
    width: 70,
    paddingHorizontal: 3,
    position: 'relative',
  },
  cellInput: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: 10,
    height: 40,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    borderWidth: 0,
  },
  inputCompleted: {
    backgroundColor: 'transparent',
    color: colors.text,
  },
  compactRpeBadge: {
    position: 'absolute',
    top: -6,
    right: 0,
    backgroundColor: colors.purpleSoft,
    borderColor: colors.purpleBorder,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  compactRpeText: {
    color: colors.purpleLight,
    fontSize: 9,
    fontWeight: '800',
  },
  rpeColCell: {
    width: 44,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    marginRight: 4,
  },
  rpeColCellText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  checkBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    marginRight: 2,
  },
  checkBtnInactive: {
    backgroundColor: colors.surfaceHigh,
  },
  checkBtnActive: {
    backgroundColor: colors.success,
  },

  // Wide Add Set Button (Lyfta Style)
  addSetBtnWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 8,
    marginHorizontal: 2,
  },
  addSetBtnWideText: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '700',
  },

  // Add Exercise Main Button
  addExerciseMainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    paddingVertical: 15,
    borderRadius: 16,
    gap: 8,
    marginTop: 6,
  },
  addExerciseMainBtnText: {
    color: colors.primaryLight,
    fontSize: 15,
    fontWeight: '700',
  },

  // Modals & Sheets
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  setOptionsSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalHeaderTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    flexShrink: 1,
    marginRight: 12,
  },
  modalHeaderSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  optionsSection: {
    marginBottom: 18,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  typeChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  typeChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  typeChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  typeChipTextActive: {
    color: colors.text,
  },

  // 1-Tap RPE Grid
  rpeSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rpeSublabel: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  rpeChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rpeChip: {
    width: '18%',
    aspectRatio: 1.3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  rpeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rpeChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  rpeChipTextActive: {
    color: colors.text,
  },
  rpeLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    backgroundColor: colors.surfaceSunken,
    padding: 8,
    borderRadius: 8,
  },
  rpeLegendItem: {
    color: colors.textSecondary,
    fontSize: 11,
    marginRight: 6,
  },

  setOptionsActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  shortcutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  shortcutBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  shortcutDeleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.dangerSoft,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
  },
  shortcutDeleteText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  doneModalBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneModalBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },

  // Menu items
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  menuItemText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  menuItemDisabled: {
    opacity: 0.45,
  },
  menuItemDestructive: {
    borderBottomWidth: 0,
    marginTop: 4,
  },
  menuItemTextDestructive: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '600',
  },

  // Bottom of Card Actions Row (Add Set + Warmup)

  // Supersets & Giant Sets
  supersetGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    marginBottom: 6,
    marginTop: 4,
  },
  supersetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  supersetPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  supersetCountText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  supersetConnectorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 4,
  },
  supersetConnectorLine: {
    width: 20,
    height: 2,
    borderRadius: 1,
    opacity: 0.6,
  },
  supersetConnectorText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  ssPositionBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  ssPositionText: {
    fontSize: 10,
    fontWeight: '700',
  },
  supersetFloatingCue: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: '#8B5CF680',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 900,
  },
  supersetCueBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#8B5CF625',
    borderWidth: 1,
    borderColor: '#8B5CF680',
  },
  supersetCueBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.purpleLight,
    letterSpacing: 0.5,
  },
  supersetCueText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  dropHelperBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: '#EC489940',
    gap: 6,
  },
  dropHelperTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F472B6',
    letterSpacing: 0.5,
  },
  dropHelperDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  dropChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dropChip: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.control,
    alignItems: 'center',
  },
  dropChipActive: {
    backgroundColor: '#EC489925',
    borderColor: '#EC4899',
  },
  dropChipPct: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F472B6',
  },
  dropChipPctActive: {
    color: '#F472B6',
  },
  dropChipWeight: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  dropChipWeightActive: {
    color: colors.text,
  },
  topBarTitleWrap: {
    flex: 1,
  },
  topBarTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  topBarSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  metricColValueMuted: {
    color: colors.textMuted,
    fontWeight: '700',
  },
  progressTrack: {
    height: 2,
    backgroundColor: colors.border,
  },
  progressFill: {
    height: 2,
    backgroundColor: colors.success,
  },
  exerciseMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  addExerciseMainBtnSolid: {
    backgroundColor: colors.primary,
  },
  emptyWorkout: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 28,
  },
  emptyWorkoutIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyWorkoutTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptyWorkoutText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
});
