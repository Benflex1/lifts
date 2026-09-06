import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import {
  Clock,
  Flame,
  Check,
  Plus,
  Trash2,
  Calculator,
  X,
  Trophy,
  Award,
} from 'lucide-react-native';
import { useWorkout } from '../context/WorkoutContext';
import { formatTimer, formatDuration } from '../utils/calculator';
import { PlateCalculatorModal } from '../components/PlateCalculatorModal';
import { ExercisePickerModal } from '../components/ExercisePickerModal';
import { RestTimerOverlay } from '../components/RestTimerOverlay';
import { Exercise, SetType, Workout, WorkoutSet } from '../types';

export const ActiveWorkoutScreen: React.FC<{ onFinish: () => void }> = ({ onFinish }) => {
  const {
    activeWorkout,
    elapsedSeconds,
    addExerciseToWorkout,
    removeExerciseFromWorkout,
    addSet,
    removeSet,
    updateSet,
    toggleSetComplete,
    finishWorkout,
    cancelWorkout,
  } = useWorkout();

  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [plateCalcWeight, setPlateCalcWeight] = useState<number | null>(null);
  const [activeSetForPlateCalc, setActiveSetForPlateCalc] = useState<{
    exerciseId: string;
    setId: string;
  } | null>(null);

  // Completed workout celebration modal
  const [completedSummary, setCompletedSummary] = useState<Workout | null>(null);

  if (!activeWorkout) {
    return null;
  }

  // Calculate live volume and completed sets
  let liveVolume = 0;
  let completedSetsCount = 0;
  let totalSetsCount = 0;

  for (const ex of activeWorkout.exercises) {
    for (const s of ex.sets) {
      totalSetsCount++;
      if (s.isCompleted) {
        liveVolume += s.weightKg * s.reps;
        completedSetsCount++;
      }
    }
  }

  const handleFinish = async () => {
    if (completedSetsCount === 0) {
      Alert.alert(
        'Finish Workout?',
        'You have not completed any sets. Do you still want to finish?',
        [
          { text: 'Keep Lifting', style: 'cancel' },
          {
            text: 'Finish',
            onPress: async () => {
              const summary = await finishWorkout();
              if (summary) setCompletedSummary(summary);
            },
          },
        ]
      );
      return;
    }

    const summary = await finishWorkout();
    if (summary) {
      setCompletedSummary(summary);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Discard Workout?',
      'Are you sure you want to discard this session? All logged sets will be lost.',
      [
        { text: 'Keep Lifting', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: cancelWorkout },
      ]
    );
  };

  const cycleSetType = (activeExerciseId: string, set: WorkoutSet) => {
    const types: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
    const nextIdx = (types.indexOf(set.type) + 1) % types.length;
    updateSet(activeExerciseId, set.id, { type: types[nextIdx] });
  };

  const getSetBadgeStyle = (type: SetType) => {
    switch (type) {
      case 'warmup':
        return { bg: '#372B10', text: '#F59E0B', label: 'W' };
      case 'drop':
        return { bg: '#291845', text: '#A855F7', label: 'D' };
      case 'failure':
        return { bg: '#3B1219', text: '#EF4444', label: 'F' };
      default:
        return { bg: '#20242E', text: '#9CA3AF', label: '' };
    }
  };

  return (
    <View style={styles.screenContainer}>
      {/* Top App Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleCancel} style={styles.discardBtn}>
          <Text style={styles.discardBtnText}>Discard</Text>
        </TouchableOpacity>

        <View style={styles.timerWrap}>
          <Clock size={16} color="#10B981" />
          <Text style={styles.timerText}>{formatTimer(elapsedSeconds)}</Text>
        </View>

        <TouchableOpacity onPress={handleFinish} style={styles.finishBtn}>
          <Text style={styles.finishBtnText}>Finish</Text>
        </TouchableOpacity>
      </View>

      {/* Metrics Strip */}
      <View style={styles.metricsStrip}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>WORKOUT</Text>
          <Text style={styles.metricTitle} numberOfLines={1}>
            {activeWorkout.name}
          </Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>VOLUME</Text>
          <Text style={styles.metricValue}>{liveVolume.toLocaleString()} kg</Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>SETS</Text>
          <Text style={styles.metricValue}>
            {completedSetsCount} / {totalSetsCount}
          </Text>
        </View>
      </View>

      {/* Exercise Cards Stream */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeWorkout.exercises.map(activeEx => {
          return (
            <View key={activeEx.id} style={styles.exerciseCard}>
              {/* Exercise Header */}
              <View style={styles.cardHeader}>
                <View style={styles.exerciseTitleGroup}>
                  <Text style={styles.exerciseName}>{activeEx.exercise.name}</Text>
                  <View style={styles.badgeRow}>
                    <Text style={styles.muscleBadge}>
                      {activeEx.exercise.primaryMuscles.join(', ')}
                    </Text>
                    <Text style={styles.equipmentBadge}>{activeEx.exercise.equipment}</Text>
                  </View>
                </View>

                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.iconAction}
                    onPress={() => {
                      const firstSet = activeEx.sets[0];
                      setPlateCalcWeight(firstSet?.weightKg || 60);
                      setActiveSetForPlateCalc({
                        exerciseId: activeEx.id,
                        setId: firstSet?.id || '',
                      });
                    }}
                  >
                    <Calculator size={18} color="#9CA3AF" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.iconAction}
                    onPress={() => removeExerciseFromWorkout(activeEx.id)}
                  >
                    <Trash2 size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Table Column Labels */}
              <View style={styles.tableHeader}>
                <Text style={[styles.colHeader, { width: 44, textAlign: 'center' }]}>SET</Text>
                <Text style={[styles.colHeader, { flex: 1 }]}>PREVIOUS</Text>
                <Text style={[styles.colHeader, { width: 76, textAlign: 'center' }]}>KG</Text>
                <Text style={[styles.colHeader, { width: 64, textAlign: 'center' }]}>REPS</Text>
                <Text style={[styles.colHeader, { width: 44, textAlign: 'center' }]}>✓</Text>
              </View>

              {/* Set Rows */}
              {activeEx.sets.map(set => {
                const badge = getSetBadgeStyle(set.type);

                return (
                  <View
                    key={set.id}
                    style={[styles.setRow, set.isCompleted && styles.setRowCompleted]}
                  >
                    {/* Set Type Toggle Badge */}
                    <TouchableOpacity
                      style={[styles.setBadge, { backgroundColor: badge.bg }]}
                      onPress={() => cycleSetType(activeEx.id, set)}
                    >
                      <Text style={[styles.setBadgeText, { color: badge.text }]}>
                        {badge.label || set.setNumber}
                      </Text>
                    </TouchableOpacity>

                    {/* Previous Ghost Comparison */}
                    <View style={styles.previousCell}>
                      {set.previousWeightKg !== undefined ? (
                        <Text style={styles.previousText}>
                          {set.previousWeightKg} kg × {set.previousReps}
                        </Text>
                      ) : (
                        <Text style={styles.previousPlaceholder}>—</Text>
                      )}
                    </View>

                    {/* Weight Input */}
                    <View style={styles.inputWrap}>
                      <TextInput
                        style={[styles.cellInput, set.isCompleted && styles.inputCompleted]}
                        keyboardType="decimal-pad"
                        value={set.weightKg > 0 ? set.weightKg.toString() : ''}
                        placeholder={
                          set.previousWeightKg ? set.previousWeightKg.toString() : '0'
                        }
                        placeholderTextColor="#6B7280"
                        onChangeText={txt => {
                          const val = parseFloat(txt) || 0;
                          updateSet(activeEx.id, set.id, { weightKg: val });
                        }}
                      />
                    </View>

                    {/* Reps Input */}
                    <View style={styles.inputWrapReps}>
                      <TextInput
                        style={[styles.cellInput, set.isCompleted && styles.inputCompleted]}
                        keyboardType="number-pad"
                        value={set.reps > 0 ? set.reps.toString() : ''}
                        placeholder={set.previousReps ? set.previousReps.toString() : '10'}
                        placeholderTextColor="#6B7280"
                        onChangeText={txt => {
                          const val = parseInt(txt, 10) || 0;
                          updateSet(activeEx.id, set.id, { reps: val });
                        }}
                      />
                    </View>

                    {/* Completion Checkbox */}
                    <TouchableOpacity
                      style={[
                        styles.checkBtn,
                        set.isCompleted ? styles.checkBtnActive : styles.checkBtnInactive,
                      ]}
                      onPress={() => toggleSetComplete(activeEx.id, set.id)}
                    >
                      <Check
                        size={18}
                        color={set.isCompleted ? '#000000' : '#4B5563'}
                        strokeWidth={set.isCompleted ? 3 : 2}
                      />
                    </TouchableOpacity>
                  </View>
                );
              })}

              {/* Bottom of Card Actions */}
              <View style={styles.cardFooter}>
                <TouchableOpacity
                  style={styles.addSetBtn}
                  onPress={() => addSet(activeEx.id, 'normal')}
                >
                  <Plus size={16} color="#3B82F6" />
                  <Text style={styles.addSetBtnText}>Add Set</Text>
                </TouchableOpacity>

                {activeEx.sets.length > 1 && (
                  <TouchableOpacity
                    style={styles.removeSetBtn}
                    onPress={() => {
                      const lastSet = activeEx.sets[activeEx.sets.length - 1];
                      removeSet(activeEx.id, lastSet.id);
                    }}
                  >
                    <Text style={styles.removeSetBtnText}>Delete Last Set</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {/* Add Exercise Big Button */}
        <TouchableOpacity
          style={styles.addExerciseMainBtn}
          onPress={() => setShowExercisePicker(true)}
        >
          <Plus size={20} color="#FFFFFF" />
          <Text style={styles.addExerciseMainBtnText}>Add Exercise</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Floating Rest Timer */}
      <RestTimerOverlay />

      {/* Exercise Picker Modal */}
      <ExercisePickerModal
        visible={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onSelectExercise={(ex: Exercise) => addExerciseToWorkout(ex)}
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
            });
          }
        }}
      />

      {/* Finished Summary Celebration Modal */}
      <Modal visible={completedSummary !== null} animationType="fade">
        <View style={styles.celebrationOverlay}>
          <View style={styles.celebrationCard}>
            <View style={styles.trophyCircle}>
              <Trophy size={48} color="#10B981" />
            </View>

            <Text style={styles.celebrationTitle}>Workout Complete!</Text>
            <Text style={styles.celebrationSubhead}>{completedSummary?.name}</Text>

            <View style={styles.summaryStatsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statBoxLabel}>DURATION</Text>
                <Text style={styles.statBoxValue}>
                  {formatDuration(completedSummary?.durationSeconds || 0)}
                </Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statBoxLabel}>TOTAL VOLUME</Text>
                <Text style={styles.statBoxValue}>
                  {completedSummary?.totalVolumeKg.toLocaleString()} kg
                </Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statBoxLabel}>EXERCISES</Text>
                <Text style={styles.statBoxValue}>
                  {completedSummary?.exercises.length || 0}
                </Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statBoxLabel}>SETS COMPLETED</Text>
                <Text style={styles.statBoxValue}>
                  {completedSummary?.exercises.reduce(
                    (sum, e) => sum + e.sets.filter(s => s.isCompleted).length,
                    0
                  )}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => {
                setCompletedSummary(null);
                onFinish();
              }}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#0D0E12',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#181A20',
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  discardBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  discardBtnText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
  timerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E232E',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  timerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  finishBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  finishBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },
  metricsStrip: {
    flexDirection: 'row',
    backgroundColor: '#13151B',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#20242E',
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metricTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  metricValue: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '700',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  exerciseCard: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#262A34',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  exerciseTitleGroup: {
    flex: 1,
    marginRight: 8,
  },
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  muscleBadge: {
    color: '#3B82F6',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  equipmentBadge: {
    color: '#6B7280',
    fontSize: 11,
    textTransform: 'capitalize',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconAction: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#20242E',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
    marginBottom: 6,
  },
  colHeader: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
  },
  setRowCompleted: {
    backgroundColor: '#142621',
  },
  setBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginLeft: 6,
  },
  setBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  previousCell: {
    flex: 1,
    paddingHorizontal: 4,
  },
  previousText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  previousPlaceholder: {
    color: '#4B5563',
    fontSize: 13,
  },
  inputWrap: {
    width: 76,
    paddingHorizontal: 4,
  },
  inputWrapReps: {
    width: 64,
    paddingHorizontal: 4,
  },
  cellInput: {
    backgroundColor: '#262A34',
    borderRadius: 8,
    height: 36,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputCompleted: {
    backgroundColor: '#1E3830',
    color: '#E5E7EB',
  },
  checkBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    marginLeft: 4,
  },
  checkBtnInactive: {
    backgroundColor: '#262A34',
  },
  checkBtnActive: {
    backgroundColor: '#10B981',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#20242E',
  },
  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  addSetBtnText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '600',
  },
  removeSetBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  removeSetBtnText: {
    color: '#6B7280',
    fontSize: 12,
  },
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
  celebrationOverlay: {
    flex: 1,
    backgroundColor: '#0D0E12',
    justifyContent: 'center',
    padding: 24,
  },
  celebrationCard: {
    backgroundColor: '#181A20',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2F3442',
  },
  trophyCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#132E27',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  celebrationTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  celebrationSubhead: {
    color: '#9CA3AF',
    fontSize: 16,
    marginBottom: 24,
  },
  summaryStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#20242E',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statBoxLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statBoxValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  doneBtn: {
    backgroundColor: '#10B981',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
});
