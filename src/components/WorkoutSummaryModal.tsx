import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Award, Check, Clock, Dumbbell, Flame, MapPin, Trophy } from 'lucide-react-native';
import { ExerciseGymScope, Gym, Workout } from '../types';
import { formatDuration } from '../utils/calculator';
import { useSettings } from '../context/SettingsContext';
import { formatWeight } from '../utils/units';
import { GymPickerModal } from './GymPickerModal';
import { useDialog } from '../context/DialogContext';
import { reassignWorkoutGym } from '../workout/workout-edit';
import { getCompletedWorkoutsForExercise, getExerciseGymScope } from '../database/db';
import { evaluateWorkoutPRs, formatPRDescription, WorkoutPRSummary } from '../workout/pr';
import { PRBadge } from './PRBadge';

interface WorkoutSummaryModalProps {
  workout: Workout | null;
  visible: boolean;
  gyms: Gym[];
  onUpdate: (workout: Workout) => Promise<void>;
  onDismiss: () => void;
}

export function WorkoutSummaryModal({
  workout,
  visible,
  gyms,
  onUpdate,
  onDismiss,
}: WorkoutSummaryModalProps) {
  const { unit, gymTrackingEnabled } = useSettings();
  const { notify } = useDialog();
  const [showGymPicker, setShowGymPicker] = useState(false);
  const [prSummary, setPrSummary] = useState<WorkoutPRSummary | null>(null);

  useEffect(() => {
    if (!workout) {
      setPrSummary(null);
      return;
    }

    let mounted = true;
    Promise.all(
      workout.exercises.map(async (ex) => {
        const [workouts, scope] = await Promise.all([
          getCompletedWorkoutsForExercise(ex.exerciseId),
          getExerciseGymScope(ex.exerciseId),
        ]);
        return { exerciseId: ex.exerciseId, workouts, scope };
      })
    ).then((results) => {
      if (!mounted) return;
      const workoutsByEx: Record<string, Workout[]> = {};
      const scopesByEx: Record<string, ExerciseGymScope | undefined> = {};
      results.forEach((r) => {
        workoutsByEx[r.exerciseId] = r.workouts;
        scopesByEx[r.exerciseId] = r.scope || undefined;
      });

      const summary = evaluateWorkoutPRs(
        workout,
        workoutsByEx,
        gyms,
        gymTrackingEnabled,
        scopesByEx
      );
      setPrSummary(summary);
    });

    return () => {
      mounted = false;
    };
  }, [workout?.id, workout?.gymId, gyms, gymTrackingEnabled]);

  const currentGym = workout ? gyms.find((gym) => gym.id === workout.gymId) : null;

  const handleGymSelect = async (gymId: string) => {
    if (!workout) return;

    try {
      await onUpdate(reassignWorkoutGym(workout, gymId));
    } catch (error: any) {
      await notify({
        title: 'Gym Error',
        message: error?.message || 'Failed to update the workout gym.',
      });
      throw error;
    }
  };

  if (!visible || !workout) return null;

  const totalCompletedSets = workout.exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.isCompleted).length,
    0
  );

  const totalCompletedReps = workout.exercises.reduce(
    (acc, ex) =>
      acc +
      ex.sets
        .filter((s) => s.isCompleted)
        .reduce((sAcc, s) => sAcc + s.reps, 0),
    0
  );

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onDismiss}
      >
      <SafeAreaView style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Award size={36} color="#10B981" />
            </View>
            <Text style={styles.title}>Workout Complete!</Text>
            <Text style={styles.workoutName}>{workout.name}</Text>
          </View>

          {/* Key Metrics Grid */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Clock size={18} color="#3B82F6" />
              <Text style={styles.metricValue}>
                {formatDuration(workout.durationSeconds)}
              </Text>
              <Text style={styles.metricLabel}>Duration</Text>
            </View>

            <View style={styles.metricCard}>
              <Dumbbell size={18} color="#F59E0B" />
              <Text style={styles.metricValue}>
                {formatWeight(workout.totalVolumeKg, unit)}
              </Text>
              <Text style={styles.metricLabel}>Volume</Text>
            </View>

            <View style={styles.metricCard}>
              <Flame size={18} color="#EF4444" />
              <Text style={styles.metricValue}>{totalCompletedSets}</Text>
              <Text style={styles.metricLabel}>Sets ({totalCompletedReps} reps)</Text>
            </View>
          </View>

          {gymTrackingEnabled && currentGym && (
            <View style={styles.gymRow}>
              <View style={styles.gymRowInfo}>
                <View style={[styles.gymIcon, { backgroundColor: `${currentGym.color}22` }]}>
                  <MapPin size={16} color={currentGym.color} />
                </View>
                <View style={styles.gymCopy}>
                  <Text style={styles.gymLabel}>Gym</Text>
                  <Text style={styles.gymName} numberOfLines={1}>{currentGym.name}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.changeGymButton}
                onPress={() => setShowGymPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Change workout gym, currently ${currentGym.name}`}
              >
                <Text style={styles.changeGymText}>Change</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Personal Records Section */}
          {prSummary && prSummary.totalCount > 0 && (
            <View style={styles.prSection}>
              <View style={styles.prSectionHeader}>
                <Trophy size={18} color="#F59E0B" />
                <Text style={styles.prSectionTitle}>
                  {prSummary.totalCount} PERSONAL RECORD{prSummary.totalCount > 1 ? 'S' : ''} BROKEN!
                </Text>
              </View>
              <ScrollView style={styles.prList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {prSummary.achievements.map((item, idx) => (
                  <View key={idx} style={styles.prCard}>
                    <Text style={styles.prCardEmoji}>
                      {item.achievement.rank === 1 ? '🥇' : item.achievement.rank === 2 ? '🥈' : '🥉'}
                    </Text>
                    <View style={styles.prCardContent}>
                      <Text style={styles.prCardExercise}>{item.exerciseName}</Text>
                      <Text style={styles.prCardMetric}>
                        {item.weightKg > 0 ? `${formatWeight(item.weightKg, unit)} × ${item.reps} · ` : `${item.reps} reps · `}
                        {formatPRDescription(item.achievement, unit)}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Exercise Breakdown */}
          <Text style={styles.breakdownTitle}>Exercise Summary</Text>
          <ScrollView style={styles.exerciseList} showsVerticalScrollIndicator={false}>
            {workout.exercises.map((ex, idx) => {
              const completedSets = ex.sets.filter((s) => s.isCompleted);
              const maxWeight = completedSets.reduce(
                (max, s) => (s.weightKg > max ? s.weightKg : max),
                0
              );
              const exercisePRs = prSummary?.achievements.filter((a) => a.exerciseId === ex.exerciseId);

              return (
                <View key={ex.id || idx} style={styles.exerciseItem}>
                  <View style={styles.exerciseInfo}>
                    <View style={styles.exerciseNameRow}>
                      <Text style={styles.exerciseNameText}>{ex.exercise.name}</Text>
                      {exercisePRs && exercisePRs.length > 0 && (
                        <View style={styles.exercisePRBadge}>
                          <Text style={styles.exercisePRBadgeText}>
                            {exercisePRs.some((a) => a.achievement.rank === 1)
                              ? '🥇 PR'
                              : exercisePRs.some((a) => a.achievement.rank === 2)
                              ? '🥈 2nd'
                              : '🥉 3rd'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.exerciseMetaText}>
                      {completedSets.length} {completedSets.length === 1 ? 'set' : 'sets'}
                      {maxWeight > 0 ? ` • Top: ${formatWeight(maxWeight, unit)}` : ''}
                    </Text>
                  </View>
                  <View style={styles.checkIcon}>
                    <Check size={16} color="#10B981" />
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Done Button */}
          <TouchableOpacity
            style={styles.doneButton}
            onPress={onDismiss}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
        </SafeAreaView>
      </Modal>

      <GymPickerModal
        visible={gymTrackingEnabled && showGymPicker}
        gyms={gyms}
        selectedGymId={workout.gymId}
        title="Change Workout Gym"
        description="Update where this completed workout is recorded."
        onSelect={handleGymSelect}
        onClose={() => setShowGymPicker(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#181A20',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    borderWidth: 1,
    borderColor: '#262A34',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  workoutName: {
    fontSize: 15,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#1E232E',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#2D3442',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  gymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2D3442',
    borderRadius: 12,
    backgroundColor: '#1E232E',
  },
  gymRowInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  gymIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 9,
  },
  gymCopy: {
    flex: 1,
  },
  gymLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  gymName: {
    marginTop: 3,
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '700',
  },
  changeGymButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: '#263B67',
  },
  changeGymText: {
    color: '#7DD3FC',
    fontSize: 13,
    fontWeight: '700',
  },
  prSection: {
    backgroundColor: '#1E1912',
    borderColor: '#F59E0B50',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    maxHeight: 180,
  },
  prSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  prSectionTitle: {
    color: '#FBBF24',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  prList: {
    maxHeight: 130,
  },
  prCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2B2317',
  },
  prCardEmoji: {
    fontSize: 18,
  },
  prCardContent: {
    flex: 1,
  },
  prCardExercise: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  prCardMetric: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  exerciseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exercisePRBadge: {
    backgroundColor: '#78350F30',
    borderColor: '#F59E0B50',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  exercisePRBadgeText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D1D5DB',
    marginBottom: 10,
  },
  exerciseList: {
    maxHeight: 220,
    marginBottom: 20,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F3F4F6',
  },
  exerciseMetaText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  checkIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
