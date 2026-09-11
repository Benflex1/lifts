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
  Calendar as CalendarIcon,
  Clock,
  Dumbbell,
  Repeat,
  Trophy,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import * as Crypto from 'expo-crypto';
import { Gym, Workout, WorkoutHistorySummary, Routine, ActiveExercise } from '../types';
import {
  getWorkoutHistory,
  getWorkoutDetail,
  deleteWorkout,
  getRoutineById,
  getGyms,
  saveCompletedWorkout,
} from '../database/db';
import { formatDuration } from '../utils/calculator';
import { useWorkout } from '../context/WorkoutContext';
import { useSettings } from '../context/SettingsContext';
import { formatWeight } from '../utils/units';
import { useDialog } from '../context/DialogContext';
import { resolveHistoricalTargetReps } from '../workout/sets';
import { resolveInitialStartGymId, resolveRepeatSourceGym } from '../workout/gym-session';
import { updateWorkoutHistorySummary } from '../workout/history-summary';
import { WorkoutEditModal } from '../components/WorkoutEditModal';
import { WorkoutStartModal } from '../components/WorkoutStartModal';

interface HistoryScreenProps {
  workoutUpdate?: Workout | null;
}

interface PendingRepeatWorkout {
  routine?: Routine;
  name: string;
  initialExercises: ActiveExercise[];
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({ workoutUpdate = null }) => {
  const { startWorkout } = useWorkout();
  const { unit, gymTrackingEnabled } = useSettings();
  const { confirm, notify } = useDialog();
  const [history, setHistory] = useState<WorkoutHistorySummary[]>([]);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [workoutDetails, setWorkoutDetails] = useState<Record<string, Workout>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [pendingRepeat, setPendingRepeat] = useState<PendingRepeatWorkout | null>(null);
  const historyLoadRequestRef = useRef(0);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (!gymTrackingEnabled) {
      setSelectedGymId(null);
      return;
    }
    if (selectedGymId && !gyms.some(gym => gym.id === selectedGymId)) {
      setSelectedGymId(null);
    }
  }, [gymTrackingEnabled, gyms, selectedGymId]);

  const loadHistory = async () => {
    const requestId = ++historyLoadRequestRef.current;
    setLoading(true);
    try {
      const [list, gymList] = await Promise.all([getWorkoutHistory(), getGyms()]);
      if (requestId !== historyLoadRequestRef.current) return;
      setHistory(list);
      setGyms(gymList);
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
    if (!workoutDetails[workoutId]) {
      setLoadingDetailId(workoutId);
      try {
        const detail = await getWorkoutDetail(workoutId);
        if (detail) {
          setWorkoutDetails(prev => ({ ...prev, [workoutId]: detail }));
        }
      } catch (e) {
        console.error('Error fetching workout detail:', e);
      } finally {
        setLoadingDetailId(null);
      }
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
          sets: ex.sets.map((s, sIdx) => ({
            id: `set-${activeExId}-${sIdx + 1}-${Crypto.randomUUID().slice(0, 6)}`,
            setNumber: sIdx + 1,
            type: s.type || 'normal',
            weightKg: s.weightKg,
            reps: s.reps,
            targetReps: resolveHistoricalTargetReps(ex.targetReps, s.targetReps),
            rpe: s.rpe ?? 8,
            isCompleted: false,
            previousWeightKg: s.weightKg,
            previousReps: s.reps,
            previousGymId: sourceGym?.id,
            previousGymName: sourceGym?.name,
          })),
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

      setPendingRepeat({
        routine,
        name: item.name,
        initialExercises,
      });
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
      </View>

      {/* Stats Summary Strip */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>WORKOUTS</Text>
          <Text style={styles.summaryValue}>{totalWorkouts}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>ALL-TIME VOLUME</Text>
          <Text style={styles.summaryValue}>{formatWeight(totalVolume, unit)}</Text>
        </View>
      </View>

      {gymTrackingEnabled && (
        <View style={styles.gymFilterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gymFilterScroll}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity
              style={[styles.gymFilterChip, selectedGymId === null && styles.gymFilterChipActive]}
              onPress={() => setSelectedGymId(null)}
              accessibilityRole="button"
              accessibilityLabel="Show all gyms"
              accessibilityState={{ selected: selectedGymId === null }}
            >
              <Text style={[styles.gymFilterText, selectedGymId === null && styles.gymFilterTextActive]}>All Gyms</Text>
            </TouchableOpacity>
            {gyms.map(gym => {
              const selected = selectedGymId === gym.id;
              return (
                <TouchableOpacity
                  key={gym.id}
                  style={[styles.gymFilterChip, selected && styles.gymFilterChipActive]}
                  onPress={() => setSelectedGymId(gym.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${gym.name} workouts`}
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.gymSwatch, { backgroundColor: gym.color }]} />
                  <Text style={[styles.gymFilterText, selected && styles.gymFilterTextActive]}>{gym.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <FlatList
          style={styles.scrollArea}
          contentContainerStyle={[styles.scrollContent, filteredHistory.length === 0 && styles.emptyListContent]}
          keyboardShouldPersistTaps="handled"
          data={filteredHistory}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const isExpanded = expandedId === item.id;
            const detail = workoutDetails[item.id];

            return (
              <View key={item.id} style={styles.historyCard}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.workoutName}>{item.name}</Text>
                    <View style={styles.dateRow}>
                      <CalendarIcon size={13} color="#9CA3AF" />
                      <Text style={styles.dateText}>{formatDate(item.startTime)}</Text>
                    </View>
                    {gymTrackingEnabled && gymById.get(item.gymId) && (
                      <View style={styles.gymTag}>
                        <View style={[styles.gymSwatch, { backgroundColor: gymById.get(item.gymId)!.color }]} />
                        <Text style={styles.gymTagText}>{gymById.get(item.gymId)!.name}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.headerRightActions}>
                    <TouchableOpacity
                      style={styles.repeatBtn}
                      onPress={() => handlePerformAgain(item)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Repeat size={14} color="#10B981" />
                      <Text style={styles.repeatBtnText}>Repeat</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDelete(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Metrics Row */}
                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <Clock size={15} color="#9CA3AF" />
                    <Text style={styles.metricText}>
                      {formatDuration(item.durationSeconds)}
                    </Text>
                  </View>

                  <View style={styles.metric}>
                    <Dumbbell size={15} color="#9CA3AF" />
                    <Text style={styles.metricText}>
                      {formatWeight(item.totalVolumeKg, unit)}
                    </Text>
                  </View>

                  <View style={styles.metric}>
                    <Trophy size={15} color="#9CA3AF" />
                    <Text style={styles.metricText}>{item.totalSets} sets</Text>
                  </View>
                </View>

                {/* Toggle Detail Button */}
                <TouchableOpacity
                  style={styles.toggleDetailBar}
                  onPress={() => handleToggleExpand(item.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.toggleDetailText}>
                    {isExpanded ? 'Hide Details' : 'View Set Breakdown'}
                  </Text>
                  {isExpanded ? (
                    <ChevronUp size={16} color="#3B82F6" />
                  ) : (
                    <ChevronDown size={16} color="#3B82F6" />
                  )}
                </TouchableOpacity>

                {/* Expanded Set Details */}
                {isExpanded && (
                  <View style={styles.expandedSection}>
                    {loadingDetailId === item.id ? (
                      <ActivityIndicator size="small" color="#3B82F6" style={{ marginVertical: 12 }} />
                    ) : detail && detail.exercises.length > 0 ? (
                      detail.exercises.map((ex, exIdx) => {
                        const completedSets = ex.sets.filter(s => s.isCompleted);
                        if (completedSets.length === 0) return null;

                        return (
                          <View key={exIdx} style={styles.detailExBlock}>
                            <Text style={styles.detailExTitle}>{ex.exercise.name}</Text>
                            {ex.notes && (
                              <Text style={styles.detailExNotes}>Note: {ex.notes}</Text>
                            )}
                            <View style={styles.detailSetsGrid}>
                              {completedSets.map((s, sIdx) => (
                                <View key={sIdx} style={styles.detailSetPill}>
                                  <Text style={styles.detailSetNum}>#{s.setNumber}</Text>
                                  <Text style={styles.detailSetWeight}>
                                    {formatWeight(s.weightKg, unit)} × {s.reps}
                                  </Text>
                                  {s.type !== 'normal' && (
                                    <Text style={styles.detailSetType}>{s.type.toUpperCase()}</Text>
                                  )}
                                  {s.rpe != null && (
                                    <Text style={styles.detailRpe}>RPE {s.rpe}</Text>
                                  )}
                                </View>
                              ))}
                            </View>
                          </View>
                        );
                      })
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
                      >
                        <Text style={styles.editWorkoutButtonText}>Edit Workout</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Compact preview when collapsed */}
                {!isExpanded && item.exerciseNames.length > 0 && (
                  <View style={styles.exerciseNamesBox}>
                    <Text style={styles.exerciseNamesText} numberOfLines={2}>
                      {item.exerciseNames.join(' • ')}
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={(
            <View style={styles.emptyBox}>
              <Dumbbell size={48} color="#2A2E3B" />
              <Text style={styles.emptyTitle}>
                {selectedGymId ? 'No workouts at this gym' : 'No workouts logged yet'}
              </Text>
              <Text style={styles.emptySub}>
                Start your first workout to view your history and progression!
              </Text>
            </View>
          )}
        />
      )}

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
    backgroundColor: '#0D0E12',
  },
  header: {
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#181A20',
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#13151B',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#20242E',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#262A34',
  },
  summaryLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  gymFilterSection: {
    backgroundColor: '#13151B',
    borderBottomWidth: 1,
    borderBottomColor: '#20242E',
  },
  gymFilterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  gymFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#181A20',
    borderWidth: 1,
    borderColor: '#2F3748',
  },
  gymFilterChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },
  gymFilterText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  gymFilterTextActive: {
    color: '#FFFFFF',
  },
  gymSwatch: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 6,
  },
  gymTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#20242E',
  },
  gymTagText: {
    color: '#D1D5DB',
    fontSize: 11,
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  historyCard: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262A34',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  workoutName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  repeatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#132E27',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  repeatBtnText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#2A171B',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '500',
  },
  toggleDetailBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#20242E',
    marginTop: 4,
  },
  toggleDetailText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '600',
  },
  expandedSection: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#20242E',
    gap: 10,
  },
  editWorkoutButton: {
    alignItems: 'center',
    backgroundColor: '#1D4ED8',
    borderRadius: 8,
    marginTop: 2,
    paddingVertical: 10,
  },
  editWorkoutButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  detailExBlock: {
    backgroundColor: '#14161D',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#20242E',
  },
  detailExTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  detailExNotes: {
    color: '#9CA3AF',
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
    backgroundColor: '#1E232E',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 6,
  },
  detailSetNum: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
  },
  detailSetWeight: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  detailSetType: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '700',
  },
  detailRpe: {
    color: '#A855F7',
    fontSize: 10,
    fontWeight: '700',
  },
  exerciseNamesBox: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#20242E',
  },
  exerciseNamesText: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 18,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    paddingVertical: 60,
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySub: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
  },
});
