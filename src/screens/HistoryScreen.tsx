import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {
  Clock,
  Edit2,
  History,
  MoreHorizontal,
  Dumbbell,
  Repeat,
  Trophy,
  Trash2,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react-native';
import * as Crypto from 'expo-crypto';
import { Gym, Workout, WorkoutHistorySummary, Routine, ActiveExercise, ExerciseGymScope, WorkoutSet } from '../types';
import {
  getStore,
  getWorkoutHistory,
  getWorkoutDetail,
  deleteWorkout,
  getRoutineById,
  getGyms,
  saveCompletedWorkout,
  getCompletedWorkoutsForExercise,
  getCompletedWorkoutsForExercises,
  getExerciseGymScope,
} from '../database/db';
import { formatDuration } from '../utils/calculator';
import { useWorkoutActions } from '../context/WorkoutContext';
import { useSettings } from '../context/SettingsContext';
import { formatWeight } from '../utils/units';
import { useDialog } from '../context/DialogContext';
import { useReloadOnActivate } from '../hooks/useReloadOnActivate';
import { resolveHistoricalTargetReps } from '../workout/sets';
import { resolveInitialStartGymId, resolveRepeatSourceGym } from '../workout/gym-session';
import { updateWorkoutHistorySummary } from '../workout/history-summary';
import { WorkoutEditModal } from '../components/WorkoutEditModal';
import { WorkoutStartModal } from '../components/WorkoutStartModal';
import { PRBadge } from '../components/PRBadge';
import { evaluateAllWorkoutPRs, evaluateWorkoutPRs, formatPRDescription, WorkoutPRSummary } from '../workout/pr';
import { getSupersetMetadata } from '../workout/supersets';
import { colors, radii } from '../theme';
import { ActionSheet, Chip, IconButton, ScreenHeader } from '../components/ui';
import { formatTrackedSet, getTrackingType, withPreviousTracked } from '../workout/tracking';

interface HistoryScreenProps {
  workoutUpdate?: Workout | null;
}

interface PendingRepeatWorkout {
  routine?: Routine;
  name: string;
  initialExercises: ActiveExercise[];
}

const HistoryScreenInner: React.FC<HistoryScreenProps> = ({ workoutUpdate = null }) => {
  const { startWorkout } = useWorkoutActions();
  const { unit, gymTrackingEnabled } = useSettings();
  const { confirm, notify } = useDialog();
  const [history, setHistory] = useState<WorkoutHistorySummary[]>([]);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuWorkout, setMenuWorkout] = useState<WorkoutHistorySummary | null>(null);
  const [workoutDetails, setWorkoutDetails] = useState<Record<string, Workout>>({});
  const [workoutPRs, setWorkoutPRs] = useState<Record<string, WorkoutPRSummary>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [pendingRepeat, setPendingRepeat] = useState<PendingRepeatWorkout | null>(null);
  const historyLoadRequestRef = useRef(0);
  const hasLoadedHistoryRef = useRef(false);
  const historySignatureRef = useRef<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  useReloadOnActivate(() => void loadHistory({ skipIfUnchanged: true }));

  useEffect(() => {
    if (!gymTrackingEnabled) {
      setSelectedGymId(null);
      return;
    }
    if (selectedGymId && !gyms.some(gym => gym.id === selectedGymId)) {
      setSelectedGymId(null);
    }
  }, [gymTrackingEnabled, gyms, selectedGymId]);

  const loadWorkoutPRs = async (targetWorkout: Workout, currentGyms: Gym[]) => {
    try {
      const distinctExerciseIds = Array.from(
        new Set(targetWorkout.exercises.map((ex) => ex.exerciseId))
      );
      if (distinctExerciseIds.length === 0) return null;

      const [workoutsByEx, scopes] = await Promise.all([
        getCompletedWorkoutsForExercises(distinctExerciseIds),
        Promise.all(distinctExerciseIds.map((id) => getExerciseGymScope(id))),
      ]);

      const scopesByEx: Record<string, ExerciseGymScope | undefined> = {};
      distinctExerciseIds.forEach((id, idx) => {
        scopesByEx[id] = scopes[idx] || undefined;
      });

      const summary = evaluateWorkoutPRs(
        targetWorkout,
        workoutsByEx,
        currentGyms,
        gymTrackingEnabled,
        scopesByEx
      );
      setWorkoutPRs((prev) => ({ ...prev, [targetWorkout.id]: summary }));
      return summary;
    } catch (e) {
      console.error('Failed to load workout PRs:', e);
      return null;
    }
  };

  const loadHistory = async ({ skipIfUnchanged = false }: { skipIfUnchanged?: boolean } = {}) => {
    const requestId = ++historyLoadRequestRef.current;
    // Only show the spinner on the first load; later refreshes keep the current list on screen.
    if (!hasLoadedHistoryRef.current) setLoading(true);
    try {
      const [list, gymList] = await Promise.all([getWorkoutHistory(), getGyms()]);
      if (requestId !== historyLoadRequestRef.current) return;

      // Evaluating PRs across every logged workout is the expensive part, so a background refresh
      // skips it when nothing that feeds it has changed since the last load.
      const signature = JSON.stringify([
        gymTrackingEnabled,
        gymList.map(gym => [gym.id, gym.name, gym.color]),
        list.map(item => [
          item.id,
          item.name,
          item.startTime,
          item.endTime,
          item.gymId,
          item.totalSets,
          item.totalVolumeKg,
          item.durationSeconds,
          item.exerciseNames,
        ]),
      ]);
      if (skipIfUnchanged && signature === historySignatureRef.current) return;
      historySignatureRef.current = signature;

      hasLoadedHistoryRef.current = true;
      setHistory(list);
      setGyms(gymList);

      // Eagerly compute PRs for all historical workouts so PR badges always show
      const store = await getStore();
      const snapshot = await store.readSnapshot();
      if (requestId !== historyLoadRequestRef.current) return;

      const scopesByEx: Record<string, ExerciseGymScope | undefined> = {};
      (snapshot.exerciseGymScopes || []).forEach((s) => {
        scopesByEx[s.exerciseId] = s;
      });

      // One chronological pass over the whole history (linear), instead of re-scanning the
      // history for every workout.
      const prMap = evaluateAllWorkoutPRs(snapshot.workouts || [], gymList, gymTrackingEnabled, scopesByEx);
      const detailsMap: Record<string, Workout> = {};
      for (const w of snapshot.workouts || []) {
        detailsMap[w.id] = w;
      }

      setWorkoutDetails((prev) => ({ ...detailsMap, ...prev }));
      setWorkoutPRs(prMap);
    } catch (e) {
      console.error(e);
    } finally {
      if (requestId === historyLoadRequestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!workoutUpdate) return;

    setHistory(previous => updateWorkoutHistorySummary(previous, workoutUpdate));
    setWorkoutDetails(previous => ({ ...previous, [workoutUpdate.id]: workoutUpdate }));
    void loadWorkoutPRs(workoutUpdate, gyms);
    void loadHistory();
  }, [workoutUpdate]);

  const filteredHistory = useMemo(
    () => selectedGymId ? history.filter(item => item.gymId === selectedGymId) : history,
    [history, selectedGymId],
  );

  const gymById = useMemo(() => new Map(gyms.map(gym => [gym.id, gym])), [gyms]);

  const handleToggleExpand = async (workoutId: string) => {
    if (expandedId === workoutId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(workoutId);
    let detail: Workout | null = workoutDetails[workoutId] || null;
    if (!detail) {
      setLoadingDetailId(workoutId);
      try {
        const loaded = await getWorkoutDetail(workoutId);
        if (loaded) {
          detail = loaded;
          setWorkoutDetails(prev => ({ ...prev, [workoutId]: loaded }));
        }
      } catch (e) {
        console.error('Error fetching workout detail:', e);
      } finally {
        setLoadingDetailId(null);
      }
    }

    if (detail && !workoutPRs[workoutId]) {
      void loadWorkoutPRs(detail, gyms);
    }
  };

  const handleDelete = async (item: WorkoutHistorySummary) => {
    const shouldDelete = await confirm({
      title: 'Delete Workout',
      message: `Are you sure you want to delete "${item.name}" from your history? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!shouldDelete) return;

    try {
      await deleteWorkout(item.id);
      setExpandedId(null);
      loadHistory();
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to delete workout.' });
    }
  };

  const handlePerformAgain = async (item: WorkoutHistorySummary) => {
    try {
      const detail = await getWorkoutDetail(item.id);
      if (!detail || !detail.exercises || detail.exercises.length === 0) {
        await notify({ title: 'Workout Unavailable', message: 'Could not load details for this workout.' });
        return;
      }

      const newWorkoutPrefix = `wo-again-${Crypto.randomUUID().slice(0, 8)}`;
      const loadedGyms = await getGyms();
      setGyms(loadedGyms);
      const sourceGym = resolveRepeatSourceGym(detail, loadedGyms);
      const initialExercises: ActiveExercise[] = detail.exercises.map((ex, exIdx) => {
        const activeExId = `ae-${newWorkoutPrefix}-${ex.exerciseId}-occ${exIdx}-${Crypto.randomUUID().slice(0, 6)}`;
        return {
          id: activeExId,
          exerciseId: ex.exerciseId,
          exercise: ex.exercise,
          notes: '',
          targetReps: resolveHistoricalTargetReps(ex.targetReps, ex.sets[0]?.targetReps),
          restTimerSeconds: ex.restTimerSeconds ?? 90,
          supersetId: ex.supersetId,
          ...(ex.trackingType ? { trackingType: ex.trackingType } : {}),
          sets: ex.sets.map((s, sIdx) => withPreviousTracked<WorkoutSet>({
            id: `set-${activeExId}-${sIdx + 1}-${Crypto.randomUUID().slice(0, 6)}`,
            setNumber: sIdx + 1,
            type: s.type || 'normal',
            weightKg: s.weightKg,
            reps: s.reps,
            targetReps: resolveHistoricalTargetReps(ex.targetReps, s.targetReps),
            rpe: s.rpe,
            isCompleted: false,
            previousWeightKg: s.weightKg,
            previousReps: s.reps,
            previousGymId: sourceGym?.id,
            previousGymName: sourceGym?.name,
            ...(s.durationSeconds !== undefined ? { durationSeconds: s.durationSeconds } : {}),
            ...(s.distanceM !== undefined ? { distanceM: s.distanceM } : {}),
          }, s)),
        };
      });

      let routine: Routine | undefined;
      if (item.routineId) {
        const found = await getRoutineById(item.routineId);
        if (found) {
          routine = found;
        }
      }

      if (!gymTrackingEnabled) {
        await startWorkout(routine, item.name, initialExercises);
        return;
      }

      const repeat = { routine, name: item.name, initialExercises };
      // With a single gym there is nothing to choose, so start straight away.
      if (loadedGyms.length <= 1) {
        await startWorkout(repeat.routine, repeat.name, repeat.initialExercises, {
          gymId: resolveInitialStartGymId(loadedGyms),
        });
        return;
      }
      setPendingRepeat(repeat);
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to start workout.' });
    }
  };

  const handleStartRepeat = async (gymId: string) => {
    if (!pendingRepeat) return false;

    try {
      const started = await startWorkout(
        pendingRepeat.routine,
        pendingRepeat.name,
        pendingRepeat.initialExercises,
        { gymId },
      );
      if (started) setPendingRepeat(null);
      return started;
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to start workout.' });
      throw e;
    }
  };

  const handleSaveEditedWorkout = async (updated: Workout) => {
    try {
      if (!gyms.some(gym => gym.id === updated.gymId)) {
        throw new Error('Unknown gym selected for workout.');
      }
      await saveCompletedWorkout(updated);
      setWorkoutDetails(previous => ({ ...previous, [updated.id]: updated }));
      void loadWorkoutPRs(updated, gyms);
      await loadHistory();
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to save workout changes.' });
      throw e;
    }
  };

  // Calculate totals
  const totalWorkouts = filteredHistory.length;
  const totalVolume = filteredHistory.reduce((sum, w) => sum + w.totalVolumeKg, 0);

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="History"
        subtitle={
          totalWorkouts > 0
            ? `${totalWorkouts} ${totalWorkouts === 1 ? 'workout' : 'workouts'} · ${formatWeight(totalVolume, unit)} lifted`
            : undefined
        }
      />

      {gymTrackingEnabled && gyms.length > 1 && (
        <View style={styles.gymFilterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gymFilterScroll}
            keyboardShouldPersistTaps="handled"
          >
            <Chip
              label="All Gyms"
              selected={selectedGymId === null}
              onPress={() => setSelectedGymId(null)}
              accessibilityLabel="Show all gyms"
            />
            {gyms.map(gym => (
              <Chip
                key={gym.id}
                label={gym.name}
                selected={selectedGymId === gym.id}
                onPress={() => setSelectedGymId(gym.id)}
                accessibilityLabel={`Show ${gym.name} workouts`}
                leading={<View style={[styles.gymSwatch, { backgroundColor: gym.color }]} />}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          style={styles.scrollArea}
          contentContainerStyle={[styles.scrollContent, filteredHistory.length === 0 && styles.emptyListContent]}
          keyboardShouldPersistTaps="handled"
          data={filteredHistory}
          keyExtractor={item => item.id}
          // Cards are tall; render about a screen ahead rather than FlatList's default of ten.
          initialNumToRender={5}
          maxToRenderPerBatch={4}
          windowSize={5}
          renderItem={({ item }) => {
            const isExpanded = expandedId === item.id;
            const detail = workoutDetails[item.id];
            const prSummary = workoutPRs[item.id];
            const supersetMetaMap = detail?.exercises
              ? getSupersetMetadata(detail.exercises)
              : new Map();

            return (
              <View key={item.id} style={styles.historyCard}>
                <View style={styles.cardTop}>
                  <TouchableOpacity
                    style={styles.cardToggle}
                    onPress={() => handleToggleExpand(item.id)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}, ${isExpanded ? 'hide' : 'show'} details`}
                    accessibilityState={{ expanded: isExpanded }}
                  >
                    <Text style={styles.dateText}>{formatDate(item.startTime)}</Text>
                    <Text style={styles.workoutName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {gymTrackingEnabled && gymById.get(item.gymId) && (
                      <View style={styles.gymTag}>
                        <View style={[styles.gymSwatch, { backgroundColor: gymById.get(item.gymId)!.color }]} />
                        <Text style={styles.gymTagText}>{gymById.get(item.gymId)!.name}</Text>
                      </View>
                    )}

                    {/* Metrics Row */}
                    <View style={styles.metricsRow}>
                      <View style={styles.metric}>
                        <Clock size={14} color={colors.textMuted} />
                        <Text style={styles.metricText}>{formatDuration(item.durationSeconds)}</Text>
                      </View>
                      <View style={styles.metric}>
                        <Dumbbell size={14} color={colors.textMuted} />
                        <Text style={styles.metricText}>{formatWeight(item.totalVolumeKg, unit)}</Text>
                      </View>
                      <View style={styles.metric}>
                        <Layers size={14} color={colors.textMuted} />
                        <Text style={styles.metricText}>{item.totalSets} sets</Text>
                      </View>
                      {prSummary && prSummary.totalCount > 0 && (
                        <View style={[styles.metric, styles.prMetric]}>
                          <Trophy size={13} color={colors.gold} />
                          <Text style={styles.metricPRText}>
                            {prSummary.totalCount} PR{prSummary.totalCount > 1 ? 's' : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>

                  <View style={styles.cardSide}>
                    <IconButton
                      icon={MoreHorizontal}
                      tone="ghost"
                      size={34}
                      onPress={() => setMenuWorkout(item)}
                      accessibilityLabel={`${item.name} options`}
                    />
                    <TouchableOpacity
                      style={styles.expandIndicator}
                      onPress={() => handleToggleExpand(item.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={isExpanded ? 'Hide details' : 'Show details'}
                    >
                      {isExpanded ? (
                        <ChevronUp size={18} color={colors.textMuted} />
                      ) : (
                        <ChevronDown size={18} color={colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Expanded Set Details */}
                {isExpanded && (
                  <View style={styles.expandedSection}>
                    {loadingDetailId === item.id ? (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
                    ) : detail && detail.exercises.length > 0 ? (
                      <>
                        {detail.exercises.map((ex, exIdx) => {
                          const completedSets = ex.sets.filter(s => s.isCompleted);
                          if (completedSets.length === 0) return null;
                          const ssMeta = supersetMetaMap.get(ex.id);

                          return (
                            <React.Fragment key={exIdx}>
                              {ssMeta?.isFirst && (
                                <View style={[styles.historySupersetHeader, { borderLeftColor: ssMeta.color }]}>
                                  <View
                                    style={[
                                      styles.historySupersetBadge,
                                      { backgroundColor: ssMeta.color + '25', borderColor: ssMeta.color },
                                    ]}
                                  >
                                    <Layers size={12} color={ssMeta.color} />
                                    <Text style={[styles.historySupersetBadgeText, { color: ssMeta.color }]}>
                                      {ssMeta.label}
                                    </Text>
                                  </View>
                                  <Text style={styles.historySupersetSubtext}>
                                    {ssMeta.totalInGroup} Exercises · Alternating Sets
                                  </Text>
                                </View>
                              )}

                              <View
                                style={[
                                  styles.detailExBlock,
                                  ssMeta && {
                                    borderLeftWidth: 3,
                                    borderLeftColor: ssMeta.color,
                                  },
                                ]}
                              >
                                <View style={styles.detailExHeader}>
                                  <View style={styles.detailExTitleWrap}>
                                    <Text style={styles.detailExTitle}>{ex.exercise.name}</Text>
                                    {ssMeta && (
                                      <View
                                        style={[
                                          styles.historySupersetPosBadge,
                                          { borderColor: ssMeta.color + '60' },
                                        ]}
                                      >
                                        <Text style={[styles.historySupersetPosText, { color: ssMeta.color }]}>
                                          {ssMeta.positionInGroup}/{ssMeta.totalInGroup}
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                </View>
                                {ex.notes ? (
                                  <Text style={styles.detailExNotes}>Note: {ex.notes}</Text>
                                ) : null}
                                <View style={styles.detailSetsGrid}>
                                  {completedSets.map((s, sIdx) => {
                                    const setPR = prSummary?.setPRs.get(s.id);
                                    return (
                                      <View key={sIdx} style={styles.detailSetPill}>
                                        <Text style={styles.detailSetNum}>#{s.setNumber}</Text>
                                        <Text style={styles.detailSetWeight}>
                                          {formatTrackedSet(s, getTrackingType(ex), unit)}
                                        </Text>
                                        {setPR?.primary && (
                                          <PRBadge
                                            achievement={setPR.primary}
                                            compact
                                            showGym={gymTrackingEnabled}
                                            onPress={() => {
                                              const desc = setPR.achievements
                                                .map((a) => `• ${formatPRDescription(a, unit)}`)
                                                .join('\n');
                                              notify({
                                                title:
                                                  setPR.primary?.rank === 1
                                                    ? setPR.primary?.isTie
                                                      ? 'Tied Personal Record'
                                                      : 'Personal Record'
                                                    : setPR.primary?.rank === 2
                                                    ? 'Silver Record'
                                                    : 'Bronze Record',
                                                message: `${ex.exercise.name} (Set #${s.setNumber})\n\n${desc}`,
                                              });
                                            }}
                                          />
                                        )}
                                        {s.type !== 'normal' && (
                                          <View
                                            style={[
                                              styles.detailSetTypeBadge,
                                              s.type === 'warmup'
                                                ? styles.detailSetTypeWarmup
                                                : s.type === 'drop'
                                                ? styles.detailSetTypeDrop
                                                : styles.detailSetTypeFailure,
                                            ]}
                                          >
                                            <Text
                                              style={[
                                                styles.detailSetTypeBadgeText,
                                                s.type === 'warmup'
                                                  ? styles.detailSetTypeWarmupText
                                                  : s.type === 'drop'
                                                  ? styles.detailSetTypeDropText
                                                  : styles.detailSetTypeFailureText,
                                              ]}
                                            >
                                              {s.type === 'warmup' ? 'W' : s.type === 'drop' ? 'D' : 'F'}
                                            </Text>
                                          </View>
                                        )}
                                        {s.rpe != null && (
                                          <Text style={styles.detailRpe}>RPE {s.rpe}</Text>
                                        )}
                                      </View>
                                    );
                                  })}
                                </View>
                              </View>
                            </React.Fragment>
                          );
                        })}
                      </>
                    ) : (
                      <View style={styles.exerciseNamesBox}>
                        <Text style={styles.exerciseNamesText}>
                          {item.exerciseNames.join(' • ')}
                        </Text>
                      </View>
                    )}

                    {detail && (
                      <TouchableOpacity
                        style={styles.editWorkoutButton}
                        onPress={() => setEditingWorkout(detail)}
                        accessibilityRole="button"
                      >
                        <Edit2 size={15} color={colors.textSoft} />
                        <Text style={styles.editWorkoutButtonText}>Edit Workout</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Compact preview when collapsed */}
                {!isExpanded && item.exerciseNames.length > 0 && (
                  <View style={styles.exerciseNamesBox}>
                    <Text style={styles.exerciseNamesText} numberOfLines={2}>
                      {item.exerciseNames.join(' · ')}
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={(
            <View style={styles.emptyBox}>
              <View style={styles.emptyIcon}>
                <History size={26} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>
                {selectedGymId ? 'No workouts at this gym' : 'No workouts logged yet'}
              </Text>
              <Text style={styles.emptySub}>
                Finished workouts show up here with every set, PR and note.
              </Text>
            </View>
          )}
        />
      )}

      <ActionSheet
        visible={menuWorkout !== null}
        title={menuWorkout?.name}
        subtitle={menuWorkout ? formatDate(menuWorkout.startTime) : undefined}
        onClose={() => setMenuWorkout(null)}
        actions={
          menuWorkout
            ? [
                {
                  key: 'repeat',
                  label: 'Perform Again',
                  icon: Repeat,
                  onPress: () => handlePerformAgain(menuWorkout),
                },
                {
                  key: 'delete',
                  label: 'Delete Workout',
                  icon: Trash2,
                  destructive: true,
                  onPress: () => handleDelete(menuWorkout),
                },
              ]
            : []
        }
      />

      <WorkoutEditModal
        visible={editingWorkout !== null}
        workout={editingWorkout}
        gyms={gyms}
        gymTrackingEnabled={gymTrackingEnabled}
        unit={unit}
        onClose={() => setEditingWorkout(null)}
        onSave={handleSaveEditedWorkout}
      />

      <WorkoutStartModal
        visible={pendingRepeat !== null}
        workoutName={pendingRepeat?.name || 'Workout'}
        gyms={gyms}
        selectedGymId={resolveInitialStartGymId(gyms)}
        onStart={handleStartRepeat}
        onClose={() => setPendingRepeat(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  gymFilterSection: {
    paddingBottom: 12,
  },
  gymFilterScroll: {
    gap: 8,
    paddingHorizontal: 16,
  },
  gymSwatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gymTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  gymTagText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 120,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  workoutName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  dateText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 3,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 12,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metricText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  expandedSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    gap: 10,
  },
  editWorkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.md,
    marginTop: 4,
    paddingVertical: 12,
  },
  editWorkoutButtonText: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '700',
  },
  detailExBlock: {
    backgroundColor: colors.surfaceAlt,
    padding: 12,
    borderRadius: radii.md,
  },
  detailExTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  detailExNotes: {
    color: colors.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  detailSetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  detailSetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 6,
  },
  detailSetNum: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  detailSetWeight: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  detailRpe: {
    color: colors.purple,
    fontSize: 10,
    fontWeight: '700',
  },
  metricPRText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '800',
  },
  detailExHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  exerciseNamesBox: {
    marginTop: 12,
  },
  exerciseNamesText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 60,
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySub: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  historySupersetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 8,
    paddingVertical: 4,
    marginTop: 8,
    marginBottom: 4,
    borderLeftWidth: 3,
  },
  historySupersetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  historySupersetBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  historySupersetSubtext: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  detailExTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  historySupersetPosBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
  },
  historySupersetPosText: {
    fontSize: 9,
    fontWeight: '800',
  },
  detailSetTypeBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  detailSetTypeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  detailSetTypeWarmup: {
    backgroundColor: '#78350F30',
    borderColor: '#F59E0B60',
  },
  detailSetTypeWarmupText: {
    color: colors.warning,
  },
  detailSetTypeDrop: {
    backgroundColor: '#83184330',
    borderColor: '#EC489960',
  },
  detailSetTypeDropText: {
    color: '#F472B6',
  },
  detailSetTypeFailure: {
    backgroundColor: '#7F1D1D30',
    borderColor: '#EF444460',
  },
  detailSetTypeFailureText: {
    color: colors.danger,
  },
  prMetric: {
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  expandIndicator: {
    width: 34,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cardToggle: {
    flex: 1,
    marginRight: 8,
  },
  cardSide: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

/** Memoized so hidden (kept-alive) tabs skip re-rendering when the app shell updates. */
export const HistoryScreen = React.memo(HistoryScreenInner);
