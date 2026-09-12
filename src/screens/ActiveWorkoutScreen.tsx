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
  MoreVertical,
  MapPin,
  Dumbbell,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Repeat,
  Trophy,
  Info,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useWorkout } from '../context/WorkoutContext';
import { useSettings } from '../context/SettingsContext';
import { formatWeight, kgToDisplay } from '../utils/units';
import { formatTimer, formatDuration } from '../utils/calculator';
import { PlateCalculatorModal } from '../components/PlateCalculatorModal';
import { ExercisePickerModal } from '../components/ExercisePickerModal';
import { ExerciseDetailModal } from '../components/ExerciseDetailModal';
import { RestTimerOverlay } from '../components/RestTimerOverlay';
import { RestTimeWheelModal } from '../components/RestTimeWheelModal';
import { DraggableExerciseCard } from '../components/DraggableExerciseCard';
import { GymPickerModal } from '../components/GymPickerModal';
import { WeightInput } from '../components/WeightInput';
import { RepsInput } from '../components/RepsInput';
import { SwipeableSetRow } from '../components/SwipeableSetRow';
import { Exercise, SetType, Workout, WorkoutSet, ActiveExercise, ExerciseGymScope } from '../types';
import { useDialog } from '../context/DialogContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RPE_CHIPS } from '../workout/sets';
import { getExerciseDropIndex } from '../workout/active-exercises';
import type { ExerciseLayout } from '../workout/active-exercises';
import { formatPreviousMetric } from '../workout/gym-display';
import { getCompletedWorkoutsForExercise, getCompletedWorkoutsForExercises, getExerciseGymScope } from '../database/db';
import { evaluateWorkoutPRs, formatPRDescription, WorkoutPRSummary } from '../workout/pr';
import { PRBadge } from '../components/PRBadge';
import { applyPreviousSetStats } from '../workout/gym-session';

export const ActiveWorkoutScreen: React.FC<{ onFinish: (workout: Workout) => void }> = ({ onFinish }) => {
  useKeepAwake();
  const insets = useSafeAreaInsets();

  const {
    activeWorkout,
    elapsedSeconds,
    minimizeWorkout,
    addExerciseToWorkout,
    addExercisesToWorkout,
    removeExerciseFromWorkout,
    moveExercise,
    moveExerciseToIndex,
    swapExercise,
    addSet,
    removeSet,
    updateSet,
    updateExerciseNotes,
    updateExerciseRestTimer,
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
  const [menuActiveExercise, setMenuActiveExercise] = useState<ActiveExercise | null>(null);
  const [showRpeColumn, setShowRpeColumn] = useState(false);
  const [editingNoteExId, setEditingNoteExId] = useState<string | null>(null);
  const [isDraggingExercise, setIsDraggingExercise] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [selectedDetailExercise, setSelectedDetailExercise] = useState<Exercise | null>(null);
  const exerciseLayoutsRef = useRef<Record<string, ExerciseLayout>>({});

  const handleExerciseLayout = (itemId: string, layout: ExerciseLayout) => {
    exerciseLayoutsRef.current[itemId] = layout;
  };

  const handleExerciseDrop = (itemId: string, deltaY: number) => {
    if (!activeWorkout) return;
    const targetIndex = getExerciseDropIndex(
      activeWorkout.exercises.map((exercise) => exercise.id),
      exerciseLayoutsRef.current,
      itemId,
      deltaY
    );
    if (targetIndex >= 0) {
      moveExerciseToIndex(itemId, targetIndex);
    }
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

  const prSummary = useMemo(() => {
    if (!activeWorkout) return null;
    return evaluateWorkoutPRs(
      activeWorkout,
      exerciseWorkouts,
      gyms,
      gymTrackingEnabled,
      exerciseScopes
    );
  }, [activeWorkout, exerciseWorkouts, gyms, gymTrackingEnabled, exerciseScopes]);

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
        }
      }
    }

    previousCompletedSetIdsRef.current = currentCompleted;
  }, [activeWorkout, prSummary]);

  const handleToggleSetWithHaptics = (exerciseId: string, setId: string) => {
    toggleSetComplete(exerciseId, setId);
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

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates ? e.endCoordinates.height : 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

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
      for (const s of ex.sets) {
        total++;
        if (s.isCompleted) {
          volume += s.weightKg * s.reps;
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

    setIsFinishing(true);
    try {
      const summary = await finishWorkout();
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
        return { bg: '#372B10', border: '#78350F', text: '#F59E0B', label: 'W' };
      case 'drop':
        return { bg: '#291845', border: '#581C87', text: '#C084FC', label: 'D' };
      case 'failure':
        return { bg: '#3B1219', border: '#7F1D1D', text: '#EF4444', label: 'F' };
      default:
        return { bg: '#20242E', border: '#2D3342', text: '#38BDF8', label: '' };
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
    updateSet(setOptionsModal.activeExerciseId, setOptionsModal.set.id, { type });
    setSetOptionsModal((prev) => (prev ? { ...prev, set: { ...prev.set, type } } : null));
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
      {/* Top App Bar - Lyfta Inspired */}
      <View style={[styles.topBar, { paddingTop: Math.max(50, insets.top + 8) }]}>
        <TouchableOpacity
          onPress={minimizeWorkout}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Minimize workout"
          accessibilityRole="button"
        >
          <ChevronLeft size={24} color="#38BDF8" />
        </TouchableOpacity>

        {/* Centered Timer */}
        <View style={styles.timerWrap}>
          <Clock size={16} color="#38BDF8" />
          <Text style={styles.timerText}>{formatTimer(elapsedSeconds)}</Text>
        </View>

        {/* Top Right Actions */}
        <View style={styles.topRightWrap}>
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

          <TouchableOpacity
            onPress={() => setShowWorkoutMenu(true)}
            style={styles.moreBtn}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
            accessibilityLabel="Workout menu"
            accessibilityRole="button"
          >
            <MoreVertical size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Top Metrics Card - Lyfta Screenshot 2 Style */}
      <View style={styles.metricsContainer}>
        <View style={styles.metricsCard}>
          <View style={styles.metricColumn}>
            <Text style={styles.metricColLabel}>DURATION</Text>
            <Text style={[styles.metricColValue, { color: '#38BDF8' }]}>
              {formatTimer(elapsedSeconds)}
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricColumn}>
            <Text style={styles.metricColLabel}>VOLUME</Text>
            <Text style={styles.metricColValue}>{formatWeight(liveVolume, unit)}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricColumn}>
            <Text style={styles.metricColLabel}>SETS</Text>
            <Text style={styles.metricColValue}>
              {completedSetsCount} / {totalSetsCount}
            </Text>
          </View>
        </View>
      </View>

      {/* Exercises Stream */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(130, 130 + keyboardHeight) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEnabled={!isDraggingExercise}
      >
        {activeWorkout.exercises.map((activeEx) => {
          const isExpanded = expandedExercises[activeEx.id] ?? false;
          const completedCount = activeEx.sets.filter((s) => s.isCompleted).length;
          const totalCount = activeEx.sets.length;
          const isAllCompleted = totalCount > 0 && completedCount === totalCount;

          if (!isExpanded) {
            // Collapsed Accordion Row - Lyfta Screenshot 1
            return (
              <DraggableExerciseCard
                key={activeEx.id}
                itemId={activeEx.id}
                exerciseName={activeEx.exercise?.name || 'Exercise'}
                onLayout={handleExerciseLayout}
                onDrop={handleExerciseDrop}
                onDragActiveChange={setIsDraggingExercise}
              >
                <TouchableOpacity
                  style={styles.collapsedCard}
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
                    <Dumbbell size={20} color="#38BDF8" />
                  </TouchableOpacity>

                  <View style={styles.collapsedContent}>
                    <Text style={styles.collapsedTitle} numberOfLines={1}>
                      {activeEx.exercise?.name || 'Exercise'}
                    </Text>
                    <View style={styles.collapsedMetaRow}>
                      <Text
                        style={[
                          styles.collapsedSubtitle,
                          isAllCompleted && styles.completedSubtitleText,
                        ]}
                      >
                        {completedCount}/{totalCount} done
                      </Text>
                      {isAllCompleted && (
                        <CheckCircle2 size={13} color="#10B981" style={{ marginLeft: 4 }} />
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
                      <MoreVertical size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                    <ChevronDown size={18} color="#6B7280" />
                  </View>
                </TouchableOpacity>
              </DraggableExerciseCard>
            );
          }

          // Expanded Full Exercise Card
          return (
            <DraggableExerciseCard
              key={activeEx.id}
              itemId={activeEx.id}
              exerciseName={activeEx.exercise?.name || 'Exercise'}
              onLayout={handleExerciseLayout}
              onDrop={handleExerciseDrop}
              onDragActiveChange={setIsDraggingExercise}
            >
              <View style={styles.exerciseCard}>
              {/* Exercise Header */}
              <View style={styles.cardHeader}>
                <TouchableOpacity
                  style={styles.exerciseAvatar}
                  onPress={() => setSelectedDetailExercise(activeEx.exercise || null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${activeEx.exercise?.name || 'exercise'} details`}
                >
                  <Dumbbell size={20} color="#38BDF8" />
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
                    <Text style={styles.muscleBadge}>
                      {(Array.isArray(activeEx.exercise?.primaryMuscles)
                        ? activeEx.exercise.primaryMuscles
                        : []
                      ).join(', ')}
                    </Text>
                    {activeEx.exercise?.equipment ? (
                      <Text style={styles.equipmentBadge}>{activeEx.exercise.equipment}</Text>
                    ) : null}
                    {activeEx.targetReps ? (
                      <Text style={styles.targetBadge}>Target: {activeEx.targetReps}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>

                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => setMenuActiveExercise(activeEx)}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <MoreVertical size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => toggleExerciseExpanded(activeEx.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <ChevronUp size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Note Row - Lyfta Style */}
              {editingNoteExId === activeEx.id || (activeEx.notes && activeEx.notes.length > 0) ? (
                <View style={styles.exerciseNoteRow}>
                  <FileText size={13} color="#9CA3AF" />
                  <TextInput
                    style={styles.exerciseNoteInput}
                    placeholder="Add note (e.g. seat pin 4, slow tempo)..."
                    placeholderTextColor="#6B7280"
                    value={activeEx.notes || ''}
                    onChangeText={(txt) => updateExerciseNotes(activeEx.id, txt)}
                    autoFocus={editingNoteExId === activeEx.id && (!activeEx.notes || activeEx.notes.length === 0)}
                  />
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.addNotePrompt}
                  onPress={() => setEditingNoteExId(activeEx.id)}
                >
                  <FileText size={13} color="#6B7280" />
                  <Text style={styles.addNotePromptText}>Add note...</Text>
                </TouchableOpacity>
              )}

              {/* Rest Timer Row - Lyfta Style */}
              <TouchableOpacity
                style={styles.restTimerRow}
                onPress={() => setRestWheelActiveExercise(activeEx)}
              >
                <Timer size={14} color="#38BDF8" />
                <Text style={styles.restTimerRowText}>
                  Rest Timer:{' '}
                  {activeEx.restTimerSeconds ? formatDuration(activeEx.restTimerSeconds) : 'Off'}
                </Text>
              </TouchableOpacity>

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
                <Text style={[styles.colHeader, { width: 44, textAlign: 'center' }]}>✓</Text>
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
                      >
                        <Check
                          size={20}
                          color={set.isCompleted ? '#000000' : '#4B5563'}
                          strokeWidth={2.8}
                        />
                      </TouchableOpacity>
                    </View>
                  </SwipeableSetRow>
                );
              })}

              {/* Bottom of Card Actions - Wide Add Set Button (Lyfta Style) */}
              <TouchableOpacity
                style={styles.addSetBtnWide}
                onPress={() => addSet(activeEx.id, 'normal')}
              >
                <Plus size={16} color="#FFFFFF" />
                <Text style={styles.addSetBtnWideText}>Add Set</Text>
              </TouchableOpacity>
              </View>
            </DraggableExerciseCard>
          );
        })}

        {/* Add Exercise Big Button */}
        <TouchableOpacity
          style={styles.addExerciseMainBtn}
          onPress={() => {
            setSwapExerciseId(null);
            setShowExercisePicker(true);
          }}
        >
          <Plus size={20} color="#FFFFFF" />
          <Text style={styles.addExerciseMainBtnText}>Add Exercise</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Floating Rest Timer Overlay */}
      <RestTimerOverlay />

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
                <X size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* PR Achievement Banner */}
            {setOptionsModal && prSummary?.setPRs.get(setOptionsModal.set.id) && (
              <View style={styles.prOptionsBanner}>
                <View style={styles.prOptionsBannerHeader}>
                  <Trophy size={16} color="#F59E0B" />
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

            {/* Quick Action Shortcuts */}
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
                <Calculator size={16} color="#38BDF8" />
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
                <Trash2 size={16} color="#EF4444" />
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
                <X size={20} color="#9CA3AF" />
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
              <Info size={18} color="#38BDF8" />
              <Text style={styles.menuItemText}>View Exercise Details</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, menuExerciseIndex <= 0 && styles.menuItemDisabled]}
              disabled={menuExerciseIndex <= 0}
              onPress={() => {
                if (menuActiveExercise) {
                  moveExercise(menuActiveExercise.id, -1);
                  setMenuActiveExercise(null);
                }
              }}
            >
              <ArrowUp size={18} color={menuExerciseIndex <= 0 ? '#4B5563' : '#38BDF8'} />
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
                  moveExercise(menuActiveExercise.id, 1);
                  setMenuActiveExercise(null);
                }
              }}
            >
              <ArrowDown
                size={18}
                color={menuExerciseIndex < 0 || menuExerciseIndex >= activeWorkout.exercises.length - 1 ? '#4B5563' : '#38BDF8'}
              />
              <Text style={styles.menuItemText}>Move Down</Text>
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
              <Repeat size={18} color="#38BDF8" />
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
              <Timer size={18} color="#38BDF8" />
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
              <Calculator size={18} color="#38BDF8" />
              <Text style={styles.menuItemText}>Plate Calculator</Text>
            </TouchableOpacity>

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
              <FileText size={18} color="#38BDF8" />
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
              <Trash2 size={18} color="#EF4444" />
              <Text style={styles.menuItemTextDestructive}>Remove Exercise</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Workout Options Menu Modal (Top Bar ⋮) */}
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
                <X size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.menuItem} onPress={expandAll}>
              <ChevronDown size={18} color="#38BDF8" />
              <Text style={styles.menuItemText}>Expand All Exercises</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={collapseAll}>
              <ChevronUp size={18} color="#38BDF8" />
              <Text style={styles.menuItemText}>Collapse All Exercises</Text>
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
                <MapPin size={18} color="#38BDF8" />
                <Text style={styles.menuItemText} numberOfLines={1}>
                  Change Gym · {displayedActiveGym.name}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowRpeColumn((prev) => !prev);
                setShowWorkoutMenu(false);
              }}
            >
              <Clock size={18} color="#38BDF8" />
              <Text style={styles.menuItemText}>
                {showRpeColumn ? 'Hide RPE Column' : 'Show RPE Column'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDestructive]}
              onPress={handleDiscard}
            >
              <Trash2 size={18} color="#EF4444" />
              <Text style={styles.menuItemTextDestructive}>Discard Workout</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#0D0E12',
  },
  // Top App Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#14171F',
    borderBottomWidth: 1,
    borderBottomColor: '#20242E',
  },
  timerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A202C',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  timerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E232E',
  },
  topRightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  finishBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 18,
  },
  finishBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  moreBtn: {
    padding: 6,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Metrics Strip (Lyfta Screenshot 2)
  metricsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  metricsCard: {
    flexDirection: 'row',
    backgroundColor: '#181A20',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#262A34',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  metricColumn: {
    flex: 1,
    alignItems: 'center',
  },
  metricColLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  metricColValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#262A34',
  },

  // Scroll Content
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 130,
  },

  // Collapsed Card (Lyfta Screenshot 1)
  collapsedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A20',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#262A34',
    padding: 12,
    paddingLeft: 44,
    marginBottom: 10,
  },
  exerciseAvatar: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#20242E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2C3240',
  },
  collapsedContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  collapsedTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  collapsedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  collapsedSubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  completedSubtitleText: {
    color: '#10B981',
    fontWeight: '600',
  },
  collapsedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Expanded Exercise Card
  exerciseCard: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 14,
    paddingLeft: 44,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#262A34',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  exerciseTitleGroup: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
  },
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  muscleBadge: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  equipmentBadge: {
    color: '#6B7280',
    fontSize: 11,
    textTransform: 'capitalize',
  },
  targetBadge: {
    color: '#38BDF8',
    backgroundColor: '#0C4A6E',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 8,
  },

  // Note Row (Lyfta style)
  exerciseNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#14171F',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#222734',
  },
  exerciseNoteInput: {
    flex: 1,
    color: '#D1D5DB',
    fontSize: 13,
    padding: 0,
  },
  addNotePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    marginBottom: 8,
  },
  addNotePromptText: {
    color: '#6B7280',
    fontSize: 13,
  },

  // Rest Timer Row (Lyfta style)
  restTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    marginBottom: 12,
  },
  restTimerRowText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
  },

  // Table Header
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
    marginBottom: 8,
  },
  colHeader: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
  },

  // Set Rows
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: 8,
  },
  setRowCompleted: {
    backgroundColor: '#12241E',
  },
  setBadge: {
    width: 36,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    borderWidth: 1,
  },
  setBadgeText: {
    fontSize: 14,
    fontWeight: '800',
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
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  prOptionsDetailText: {
    color: '#FDE68A',
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
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  previousTextClickable: {
    color: '#CBD5E1',
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: '#64748B',
  },
  previousPlaceholder: {
    color: '#4B5563',
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
    backgroundColor: '#20242E',
    borderRadius: 8,
    height: 40,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#2D3342',
  },
  inputCompleted: {
    backgroundColor: '#133529',
    borderColor: '#10B981',
    color: '#FFFFFF',
  },
  compactRpeBadge: {
    position: 'absolute',
    top: -6,
    right: 0,
    backgroundColor: '#2D1E4A',
    borderColor: '#581C87',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  compactRpeText: {
    color: '#C084FC',
    fontSize: 9,
    fontWeight: '800',
  },
  rpeColCell: {
    width: 44,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#20242E',
    borderWidth: 1,
    borderColor: '#2D3342',
    marginRight: 4,
  },
  rpeColCellText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  checkBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  checkBtnInactive: {
    backgroundColor: '#20242E',
    borderWidth: 1,
    borderColor: '#2D3342',
  },
  checkBtnActive: {
    backgroundColor: '#10B981',
  },

  // Wide Add Set Button (Lyfta Style)
  addSetBtnWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#20242E',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2A303F',
  },
  addSetBtnWideText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Add Exercise Main Button
  addExerciseMainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 6,
  },
  addExerciseMainBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // Modals & Sheets
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#181A20',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#262A34',
  },
  setOptionsSheet: {
    backgroundColor: '#181A20',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#262A34',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  modalHeaderSubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  optionsSection: {
    marginBottom: 18,
  },
  sectionLabel: {
    color: '#6B7280',
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
    backgroundColor: '#20242E',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2D3342',
  },
  typeChipActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#3B82F6',
  },
  typeChipText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
  },

  // 1-Tap RPE Grid
  rpeSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rpeSublabel: {
    color: '#38BDF8',
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
    backgroundColor: '#20242E',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2D3342',
  },
  rpeChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#38BDF8',
  },
  rpeChipText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '700',
  },
  rpeChipTextActive: {
    color: '#FFFFFF',
  },
  rpeLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    backgroundColor: '#14171F',
    padding: 8,
    borderRadius: 8,
  },
  rpeLegendItem: {
    color: '#9CA3AF',
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
    backgroundColor: '#20242E',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2D3342',
  },
  shortcutBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
  },
  shortcutDeleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2A181C',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#581C23',
  },
  shortcutDeleteText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
  doneModalBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneModalBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // Menu items
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#20242E',
  },
  menuItemText: {
    color: '#FFFFFF',
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
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
});
