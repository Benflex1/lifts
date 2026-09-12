import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { X, Edit2, Trophy, Info, Calendar as CalendarIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Exercise, DualExerciseStats, Gym, ExerciseGymScope, Workout } from '../types';
import { useSettings } from '../context/SettingsContext';
import { formatWeight } from '../utils/units';
import {
  getExerciseStats,
  getExerciseGymScope,
  getGyms,
  getDefaultGym,
  getCompletedWorkoutsForExercise,
} from '../database/db';
import { getAllowedGymIds, resolveExerciseScope } from '../workout/gym-scope';
import { ExercisePodium, extractExercisePodium } from '../workout/pr';
import { ExercisePodiumView } from './ExercisePodiumView';

export interface ExerciseDetailModalProps {
  visible: boolean;
  exercise: Exercise | null;
  onClose: () => void;
  currentGym?: Gym | null;
  onEditCustom?: (exercise: Exercise) => void;
  onEditScope?: (exercise: Exercise) => void;
}

export const ExerciseDetailModal: React.FC<ExerciseDetailModalProps> = ({
  visible,
  exercise,
  onClose,
  currentGym: initialGym,
  onEditCustom,
  onEditScope,
}) => {
  const insets = useSafeAreaInsets();
  const { unit, gymTrackingEnabled } = useSettings();

  const [exerciseStats, setExerciseStats] = useState<DualExerciseStats | null>(null);
  const [exerciseScope, setExerciseScope] = useState<ExerciseGymScope | null>(null);
  const [exercisePodium, setExercisePodium] = useState<ExercisePodium | null>(null);
  const [resolvedGym, setResolvedGym] = useState<Gym | null>(initialGym ?? null);
  const [recentWorkouts, setRecentWorkouts] = useState<Workout[]>([]);
  const [gymNamesMap, setGymNamesMap] = useState<Map<string, string>>(new Map());
  const requestCounterRef = useRef(0);

  useEffect(() => {
    if (!visible || !exercise) {
      setExerciseStats(null);
      setExerciseScope(null);
      setRecentWorkouts([]);
      setExercisePodium(null);
      return;
    }

    const requestId = ++requestCounterRef.current;

    async function loadData() {
      try {
        let activeGym = initialGym;
        const [allGyms, defaultGym] = await Promise.all([getGyms(), getDefaultGym()]);
        if (!activeGym) {
          activeGym = allGyms.find((g) => g.id === defaultGym.id) || allGyms[0] || defaultGym;
        }
        if (requestId !== requestCounterRef.current) return;
        setResolvedGym(activeGym);

        const [stats, scope, historyWorkouts] = await Promise.all([
          getExerciseStats(exercise!.id, activeGym.id),
          getExerciseGymScope(exercise!.id),
          getCompletedWorkoutsForExercise(exercise!.id),
        ]);

        if (requestId !== requestCounterRef.current) return;
        const allowedGymIds = getAllowedGymIds(exercise!, scope || undefined, activeGym.id);
        const podium = extractExercisePodium(historyWorkouts, exercise!.id, allGyms, allowedGymIds);

        setExerciseStats(stats);
        setExerciseScope(scope);
        setExercisePodium(podium);
        setRecentWorkouts(historyWorkouts.slice(0, 5));
        setGymNamesMap(new Map(allGyms.map((g) => [g.id, g.name])));
      } catch (err) {
        if (requestId !== requestCounterRef.current) return;
        console.warn('Error loading exercise details modal data:', err);
      }
    }

    void loadData();
  }, [visible, exercise, initialGym]);

  if (!exercise) {
    return null;
  }

  const renderStatsCard = (label: string, stats: DualExerciseStats['global']) => (
    <View style={styles.statsCard}>
      <Text style={styles.statsTierTitle}>{label}</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statBoxLabel}>HEAVIEST LIFT</Text>
          <Text style={styles.statBoxValue}>
            {stats.maxWeightKg > 0 ? formatWeight(stats.maxWeightKg, unit) : '—'}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statBoxLabel}>MAX SET VOLUME</Text>
          <Text style={styles.statBoxValue}>
            {stats.maxSetVolumeKg > 0 ? formatWeight(stats.maxSetVolumeKg, unit) : '—'}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statBoxLabel}>ESTIMATED 1RM</Text>
          <Text style={styles.statBoxValue}>
            {stats.estimated1RM > 0 ? formatWeight(stats.estimated1RM, unit) : '—'}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statBoxLabel}>SESSIONS</Text>
          <Text style={styles.statBoxValue}>{stats.sessionCount}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.detailContainer, { paddingTop: Math.max(50, insets.top + 8) }]}>
        <View style={styles.detailHeader}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close exercise details"
          >
            <X size={24} color="#9CA3AF" />
          </TouchableOpacity>
          <Text style={styles.detailHeaderTitle}>Exercise Details</Text>
          {exercise.isCustom && onEditCustom ? (
            <TouchableOpacity
              style={styles.headerEditBtn}
              onPress={() => {
                onClose();
                onEditCustom(exercise);
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit custom exercise"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Edit2 size={16} color="#38BDF8" />
              <Text style={styles.headerEditBtnText}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>

        <ScrollView
          style={styles.detailContent}
          contentContainerStyle={{ paddingBottom: Math.max(40, insets.bottom + 20) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {exercise.isCustom && (
            <View style={styles.detailCustomBadge}>
              <Text style={styles.detailCustomBadgeText}>CUSTOM EXERCISE</Text>
            </View>
          )}
          <Text style={styles.detailName}>{exercise.name}</Text>

          {/* Badges */}
          <View style={styles.detailBadgeRow}>
            <View style={styles.badgePrimary}>
              <Text style={styles.badgePrimaryText}>
                Primary: {exercise.primaryMuscles.join(', ')}
              </Text>
            </View>
            <View style={styles.badgeSecondary}>
              <Text style={styles.badgeSecondaryText}>Equipment: {exercise.equipment}</Text>
            </View>
          </View>

          {exercise.secondaryMuscles && exercise.secondaryMuscles.length > 0 && (
            <Text style={styles.secondaryMusclesText}>
              Secondary: {exercise.secondaryMuscles.join(', ')}
            </Text>
          )}

          {/* All-Time Podium Showcase */}
          {exercisePodium && (
            <ExercisePodiumView
              podium={exercisePodium}
              unit={unit}
              isBodyweight={Boolean(exercise.equipment?.toLowerCase().includes('body'))}
              gymTrackingEnabled={gymTrackingEnabled}
            />
          )}

          {/* Personal Bests & Stats */}

          {exerciseStats && resolvedGym && (
            <>
              <View style={styles.statsHeader}>
                <Trophy size={16} color="#F59E0B" />
                <Text style={styles.statsHeaderTitle}>PERSONAL BESTS & STATS</Text>
              </View>
              {renderStatsCard('Global', exerciseStats.global)}
              {renderStatsCard(resolvedGym.name, exerciseStats.gym)}
            </>
          )}

          {/* Recent Workout History */}
          <View style={styles.historySection}>
            <View style={styles.historyHeader}>
              <CalendarIcon size={16} color="#38BDF8" />
              <Text style={styles.historyHeaderTitle}>RECENT SESSIONS</Text>
            </View>

            {recentWorkouts.length > 0 ? (
              recentWorkouts.map((w) => {
                const exerciseOccurrences = w.exercises.filter((e) => e.exerciseId === exercise.id);
                const allSets = exerciseOccurrences.flatMap((e) => e.sets).filter((s) => s.isCompleted);
                if (allSets.length === 0) return null;

                const dateStr = new Date(w.startTime).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
                const gymName = gymNamesMap.get(w.gymId);

                return (
                  <View key={w.id} style={styles.historyCard}>
                    <View style={styles.historyCardHeader}>
                      <View style={styles.historyCardMeta}>
                        <Text style={styles.historyDate}>{dateStr}</Text>
                        <Text style={styles.historyWorkoutName}>{w.name}</Text>
                      </View>
                      {gymTrackingEnabled && gymName && (
                        <View style={styles.historyGymBadge}>
                          <Text style={styles.historyGymBadgeText}>{gymName}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.historySetsRow}>
                      {allSets.map((s, sIdx) => (
                        <View key={s.id || sIdx} style={styles.historySetPill}>
                          <Text style={styles.historySetNum}>{sIdx + 1}</Text>
                          <Text style={styles.historySetMetric}>
                            {formatWeight(s.weightKg, unit)} × {s.reps}
                          </Text>
                          {s.rpe !== undefined && s.rpe !== null && (
                            <Text style={styles.historySetRpe}>@{s.rpe}</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.historyEmpty}>
                <Text style={styles.historyEmptyText}>No recorded workout sessions for this exercise yet.</Text>
              </View>
            )}
          </View>


          {/* Scope Card */}
          {gymTrackingEnabled && resolvedGym && (
            <View style={styles.scopeCard}>
              <View style={styles.scopeText}>
                <Text style={styles.scopeLabel}>EFFECTIVE SCOPE</Text>
                <Text style={styles.scopeValue}>
                  {exerciseScope ? (
                    exerciseScope.scopeType === 'linked_group'
                      ? `Linked gyms (${exerciseScope.linkedGymIds?.length ?? 0})`
                      : exerciseScope.scopeType === 'gym_specific'
                      ? 'Gym-specific'
                      : 'Global'
                  ) : `${resolveExerciseScope(exercise, undefined) === 'gym_specific' ? 'Gym-specific' : 'Global'} (equipment default)`}
                </Text>
              </View>
              {onEditScope && (
                <TouchableOpacity
                  style={styles.scopeButton}
                  onPress={() => onEditScope(exercise)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit exercise scope"
                >
                  <Text style={styles.scopeButtonText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Instructions */}
          <View style={styles.instructionsBox}>
            <View style={styles.instructionHeadRow}>
              <Info size={16} color="#38BDF8" />
              <Text style={styles.instructionsHeading}>HOW TO PERFORM</Text>
            </View>

            {exercise.instructions && exercise.instructions.length > 0 ? (
              exercise.instructions.map((step, idx) => (
                <View key={idx} style={styles.stepRow}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noInstructionsText}>
                Perform with controlled technique and full range of motion.
              </Text>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  detailContainer: {
    flex: 1,
    backgroundColor: '#0D0E12',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  detailHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  headerEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerEditBtnText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '600',
  },
  detailContent: {
    padding: 20,
  },
  detailCustomBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#38BDF820',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#38BDF840',
  },
  detailCustomBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  detailName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 14,
  },
  detailBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  badgePrimary: {
    backgroundColor: '#1E2638',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgePrimaryText: {
    color: '#38BDF8',
    fontWeight: '600',
    fontSize: 13,
    textTransform: 'capitalize',
  },
  badgeSecondary: {
    backgroundColor: '#20242E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeSecondaryText: {
    color: '#9CA3AF',
    fontSize: 13,
    textTransform: 'capitalize',
  },
  secondaryMusclesText: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 20,
    textTransform: 'capitalize',
  },
  statsCard: {
    backgroundColor: '#181A20',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#262A34',
    marginBottom: 14,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  statsHeaderTitle: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statsTierTitle: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  statBox: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 70,
    backgroundColor: '#13151B',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#20242E',
  },
  statBoxLabel: {
    color: '#6B7280',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  statBoxValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  scopeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#181A20',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#262A34',
    marginBottom: 14,
  },
  scopeText: {
    flex: 1,
    marginRight: 12,
  },
  scopeLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  scopeValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  scopeButton: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#0284C7',
  },
  scopeButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  instructionsBox: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#262A34',
    marginTop: 6,
  },
  instructionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  instructionsHeading: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 12,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#262A34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
  },
  noInstructionsText: {
    color: '#6B7280',
    fontSize: 14,
    fontStyle: 'italic',
  },
  historySection: {
    marginBottom: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  historyHeaderTitle: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  historyCard: {
    backgroundColor: '#181A20',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#262A34',
    marginBottom: 10,
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  historyCardMeta: {
    flex: 1,
    marginRight: 8,
  },
  historyDate: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  historyWorkoutName: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
  },
  historyGymBadge: {
    backgroundColor: '#20242E',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2B313E',
  },
  historyGymBadgeText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  historySetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  historySetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13151B',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#222734',
    gap: 5,
  },
  historySetNum: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
  },
  historySetMetric: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
  },
  historySetRpe: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '700',
  },
  historyEmpty: {
    backgroundColor: '#181A20',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262A34',
    alignItems: 'center',
  },
  historyEmptyText: {
    color: '#6B7280',
    fontSize: 13,
    fontStyle: 'italic',
  },
});
