import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, X, Plus, Trash2, Clock, Sparkles, Dumbbell } from 'lucide-react-native';
import { ActiveExercise, Exercise, Gym, SetType, Workout, WorkoutSet } from '../types';
import { WeightUnit, displayToKg, kgToDisplay } from '../utils/units';
import { applyWorkoutEdits } from '../workout/workout-edit';
import { ExercisePickerModal } from './ExercisePickerModal';
import {
  secondsToHoursMinutes,
  parseDurationInput,
  estimateWorkoutDuration,
} from '../workout/duration';
import { formatDuration } from '../utils/calculator';
import { sanitizeWeightInput, sanitizeRepsInput } from '../workout/sets';

interface Props {
  visible: boolean;
  workout: Workout | null;
  gyms: Gym[];
  gymTrackingEnabled: boolean;
  unit: WeightUnit;
  onClose: () => void;
  onSave: (workout: Workout) => Promise<void>;
}

interface SetDraftValues {
  weight: string;
  reps: string;
}

const draftKey = (activeExerciseId: string, setId: string) => `${activeExerciseId}:${setId}`;

const SET_TYPES: SetType[] = ['normal', 'warmup', 'drop', 'failure'];

export const WorkoutEditModal: React.FC<Props> = ({
  visible,
  workout,
  gyms,
  gymTrackingEnabled,
  unit,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedGymId, setSelectedGymId] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [exercises, setExercises] = useState<ActiveExercise[]>([]);
  const [draftValues, setDraftValues] = useState<Record<string, SetDraftValues>>({});
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !workout) return;

    setName(workout.name);
    setNotes(workout.notes || '');
    setSelectedGymId(workout.gymId);

    const { hours: h, minutes: m } = secondsToHoursMinutes(workout.durationSeconds);
    setHours(h > 0 ? String(h) : '');
    setMinutes(String(m));

    const clonedExercises: ActiveExercise[] = (workout.exercises || []).map((ex, exIdx) => ({
      ...ex,
      id: ex.id || `we-legacy-${exIdx}-${Date.now()}`,
      sets: (ex.sets || []).map((s) => ({ ...s })),
    }));
    setExercises(clonedExercises);

    const nextDrafts: Record<string, SetDraftValues> = {};
    for (const ex of clonedExercises) {
      for (const set of ex.sets) {
        nextDrafts[draftKey(ex.id, set.id)] = {
          weight: String(kgToDisplay(set.weightKg, unit)),
          reps: String(set.reps),
        };
      }
    }
    setDraftValues(nextDrafts);
    setError(null);
  }, [visible, workout, unit]);

  const updateDraft = (activeExerciseId: string, setId: string, field: 'weight' | 'reps', val: string) => {
    const key = draftKey(activeExerciseId, setId);
    const sanitized = field === 'weight' ? sanitizeWeightInput(val) : sanitizeRepsInput(val);
    setDraftValues((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { weight: '', reps: '' }),
        [field]: sanitized,
      },
    }));
  };

  const handleAddExercise = (newExercise: Exercise) => {
    setShowExercisePicker(false);
    const newActiveId = `we-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newSetId = `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-1`;

    const newSet: WorkoutSet = {
      id: newSetId,
      setNumber: 1,
      type: 'normal',
      weightKg: 0,
      reps: 10,
      isCompleted: true,
    };

    const newActiveExercise: ActiveExercise = {
      id: newActiveId,
      exerciseId: newExercise.id,
      exercise: newExercise,
      sets: [newSet],
      restTimerSeconds: 90,
    };

    setExercises((prev) => [...prev, newActiveExercise]);
    setDraftValues((prev) => ({
      ...prev,
      [draftKey(newActiveId, newSetId)]: {
        weight: '0',
        reps: '10',
      },
    }));
  };

  const handleRemoveExercise = (activeExerciseId: string) => {
    setExercises((prev) => prev.filter((ex) => ex.id !== activeExerciseId));
  };

  const handleAddSet = (activeExerciseId: string) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== activeExerciseId) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];
        const lastDraft = lastSet ? draftValues[draftKey(activeExerciseId, lastSet.id)] : null;
        const newSetId = `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${ex.sets.length + 1}`;
        const newSet: WorkoutSet = {
          id: newSetId,
          setNumber: ex.sets.length + 1,
          type: lastSet?.type || 'normal',
          weightKg: lastSet?.weightKg || 0,
          reps: lastSet?.reps || 10,
          isCompleted: true,
        };

        setDraftValues((dPrev) => ({
          ...dPrev,
          [draftKey(activeExerciseId, newSetId)]: {
            weight: lastDraft?.weight || String(kgToDisplay(newSet.weightKg, unit)),
            reps: lastDraft?.reps || String(newSet.reps),
          },
        }));

        return {
          ...ex,
          sets: [...ex.sets, newSet],
        };
      })
    );
  };

  const handleRemoveSet = (activeExerciseId: string, setId: string) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== activeExerciseId) return ex;
        const filtered = ex.sets.filter((s) => s.id !== setId);
        return {
          ...ex,
          sets: filtered.map((s, idx) => ({ ...s, setNumber: idx + 1 })),
        };
      })
    );
  };

  const handleToggleSetComplete = (activeExerciseId: string, setId: string) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== activeExerciseId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) => (s.id === setId ? { ...s, isCompleted: !s.isCompleted } : s)),
        };
      })
    );
  };

  const handleCycleSetType = (activeExerciseId: string, setId: string) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== activeExerciseId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) => {
            if (s.id !== setId) return s;
            const curIdx = SET_TYPES.indexOf(s.type);
            const nextType = SET_TYPES[(curIdx + 1) % SET_TYPES.length];
            return { ...s, type: nextType };
          }),
        };
      })
    );
  };

  const handleAutoEstimateDuration = () => {
    const estimated = estimateWorkoutDuration({ exercises });
    const { hours: eh, minutes: em } = secondsToHoursMinutes(estimated);
    setHours(eh > 0 ? String(eh) : '');
    setMinutes(String(em));
  };

  const handleSave = async () => {
    if (!workout) return;

    if (gymTrackingEnabled && !gyms.some((gym) => gym.id === selectedGymId)) {
      setError('Please select a valid gym.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Reconstitute exercises with latest draft values
      const finalizedExercises: ActiveExercise[] = exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => {
          const draft = draftValues[draftKey(ex.id, s.id)];
          const rawWeight = draft?.weight?.trim();
          const rawReps = draft?.reps?.trim();

          let weightNum: number;
          let repsNum: number;

          if (s.isCompleted) {
            weightNum = rawWeight !== undefined && rawWeight !== '' ? Number(rawWeight) : NaN;
            repsNum = rawReps !== undefined && rawReps !== '' ? Number(rawReps) : NaN;
          } else {
            // Incomplete sets must never become NaN; default empty or invalid fields to clean numbers
            if (rawWeight !== undefined && rawWeight !== '') {
              const parsed = Number(rawWeight);
              weightNum = Number.isFinite(parsed) && parsed >= 0 ? parsed : (Number.isFinite(s.weightKg) ? s.weightKg : 0);
            } else {
              weightNum = Number.isFinite(s.weightKg) ? s.weightKg : 0;
            }

            if (rawReps !== undefined && rawReps !== '') {
              const parsed = Number(rawReps);
              repsNum = Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0 ? parsed : (Number.isFinite(s.reps) ? s.reps : 0);
            } else {
              repsNum = Number.isFinite(s.reps) ? s.reps : 0;
            }
          }

          return {
            ...s,
            weightKg: displayToKg(weightNum, unit),
            reps: repsNum,
            isWeightEdited: true,
          };
        }),
      }));

      const totalDurationSeconds = parseDurationInput(hours, minutes);

      const updated = applyWorkoutEdits(workout, {
        name,
        notes,
        gymId: gymTrackingEnabled ? selectedGymId : workout.gymId,
        durationSeconds: totalDurationSeconds,
        exercises: finalizedExercises,
      });

      await onSave(updated);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save workout changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Edit Workout</Text>
            <TouchableOpacity
              onPress={onClose}
              disabled={saving}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* Workout Name */}
            <Text style={styles.label}>WORKOUT NAME</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Workout name"
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              editable={!saving}
            />

            {/* Duration Section */}
            <Text style={styles.label}>WORKOUT DURATION</Text>
            <View style={styles.durationCard}>
              <View style={styles.durationRow}>
                <Clock size={18} color="#38BDF8" />
                <View style={styles.durationInputGroup}>
                  <TextInput
                    style={styles.durationInput}
                    value={hours}
                    onChangeText={setHours}
                    placeholder="0"
                    placeholderTextColor="#6B7280"
                    keyboardType="number-pad"
                    maxLength={3}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    editable={!saving}
                  />
                  <Text style={styles.durationUnitLabel}>h</Text>
                </View>
                <Text style={styles.durationColon}>:</Text>
                <View style={styles.durationInputGroup}>
                  <TextInput
                    style={styles.durationInput}
                    value={minutes}
                    onChangeText={setMinutes}
                    placeholder="0"
                    placeholderTextColor="#6B7280"
                    keyboardType="number-pad"
                    maxLength={2}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    editable={!saving}
                  />
                  <Text style={styles.durationUnitLabel}>m</Text>
                </View>

                <TouchableOpacity
                  style={styles.autoEstimateBtn}
                  onPress={handleAutoEstimateDuration}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Auto-estimate duration based on sets"
                >
                  <Sparkles size={14} color="#F59E0B" />
                  <Text style={styles.autoEstimateBtnText}>Auto</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Notes */}
            <Text style={styles.label}>NOTES</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes"
              placeholderTextColor="#6B7280"
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              editable={!saving}
            />

            {/* Gym Selector */}
            {gymTrackingEnabled && (
              <>
                <Text style={styles.label}>GYM</Text>
                <View style={styles.gymOptions}>
                  {gyms.map((gym) => (
                    <TouchableOpacity
                      key={gym.id}
                      style={[styles.gymOption, selectedGymId === gym.id && styles.gymOptionSelected]}
                      onPress={() => setSelectedGymId(gym.id)}
                      disabled={saving}
                      accessibilityRole="button"
                      accessibilityLabel={`Assign workout to ${gym.name}`}
                      accessibilityState={{ selected: selectedGymId === gym.id }}
                    >
                      <View style={[styles.gymSwatch, { backgroundColor: gym.color }]} />
                      <Text
                        style={[
                          styles.gymOptionText,
                          selectedGymId === gym.id && styles.gymOptionTextSelected,
                        ]}
                      >
                        {gym.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Exercises Section */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>EXERCISES & SETS</Text>
              <TouchableOpacity
                style={styles.addExerciseHeaderBtn}
                onPress={() => setShowExercisePicker(true)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Add exercise to workout"
              >
                <Plus size={14} color="#38BDF8" />
                <Text style={styles.addExerciseHeaderBtnText}>Add Exercise</Text>
              </TouchableOpacity>
            </View>

            {exercises.length === 0 ? (
              <View style={styles.emptyExercisesBlock}>
                <Text style={styles.emptyExercisesText}>No exercises in this workout.</Text>
                <TouchableOpacity
                  style={styles.addExercisePrimaryBtn}
                  onPress={() => setShowExercisePicker(true)}
                  disabled={saving}
                >
                  <Plus size={16} color="#000000" />
                  <Text style={styles.addExercisePrimaryBtnText}>Add Exercise</Text>
                </TouchableOpacity>
              </View>
            ) : (
              exercises.map((exercise) => (
                <View key={exercise.id} style={styles.exerciseBlock}>
                  <View style={styles.exerciseBlockHeader}>
                    <View style={styles.exerciseNameWrap}>
                      <Text style={styles.exerciseName}>{exercise.exercise.name}</Text>
                      <Text style={styles.exerciseCategory}>
                        {exercise.exercise.equipment} · {exercise.exercise.category}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemoveExercise(exercise.id)}
                      disabled={saving}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${exercise.exercise.name} from workout`}
                    >
                      <Trash2 size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>

                  {/* Sets header */}
                  <View style={styles.setsTableHeader}>
                    <Text style={[styles.setsTableCol, { width: 34 }]}>SET</Text>
                    <Text style={[styles.setsTableCol, { width: 50 }]}>TYPE</Text>
                    <Text style={[styles.setsTableCol, { flex: 1, textAlign: 'center' }]}>
                      WEIGHT ({unit})
                    </Text>
                    <Text style={[styles.setsTableCol, { width: 64, textAlign: 'center' }]}>
                      REPS
                    </Text>
                    <Text style={[styles.setsTableCol, { width: 30, textAlign: 'center' }]}>DONE</Text>
                    <Text style={[styles.setsTableCol, { width: 24 }]} />
                  </View>

                  {/* Set rows */}
                  {exercise.sets.map((set) => {
                    const key = draftKey(exercise.id, set.id);
                    const draft = draftValues[key] || { weight: '', reps: '' };
                    return (
                      <View key={set.id} style={styles.setRow}>
                        <Text style={styles.setNumber}>#{set.setNumber}</Text>

                        {/* Set Type Pill */}
                        <TouchableOpacity
                          style={[
                            styles.setTypePill,
                            set.type === 'warmup' && styles.setTypeWarmup,
                            set.type === 'drop' && styles.setTypeDrop,
                            set.type === 'failure' && styles.setTypeFailure,
                          ]}
                          onPress={() => handleCycleSetType(exercise.id, set.id)}
                          disabled={saving}
                          accessibilityRole="button"
                          accessibilityLabel={`Change set type, currently ${set.type}`}
                        >
                          <Text style={styles.setTypePillText}>
                            {set.type === 'normal'
                              ? 'NORM'
                              : set.type === 'warmup'
                              ? 'WARM'
                              : set.type === 'drop'
                              ? 'DROP'
                              : 'FAIL'}
                          </Text>
                        </TouchableOpacity>

                        {/* Weight input */}
                        <TextInput
                          style={styles.setInput}
                          value={draft.weight}
                          onChangeText={(value) =>
                            updateDraft(exercise.id, set.id, 'weight', value)
                          }
                          keyboardType="decimal-pad"
                          autoCapitalize="none"
                          autoCorrect={false}
                          spellCheck={false}
                          editable={!saving}
                        />

                        <Text style={styles.timesText}>×</Text>

                        {/* Reps input */}
                        <TextInput
                          style={styles.repsInput}
                          value={draft.reps}
                          onChangeText={(value) =>
                            updateDraft(exercise.id, set.id, 'reps', value)
                          }
                          keyboardType="number-pad"
                          autoCapitalize="none"
                          autoCorrect={false}
                          spellCheck={false}
                          editable={!saving}
                        />

                        {/* Completed Toggle */}
                        <TouchableOpacity
                          style={[
                            styles.completeToggle,
                            set.isCompleted && styles.completeToggleActive,
                          ]}
                          onPress={() => handleToggleSetComplete(exercise.id, set.id)}
                          disabled={saving}
                          accessibilityRole="button"
                          accessibilityLabel="Toggle set completed"
                        >
                          <Check
                            size={14}
                            color={set.isCompleted ? '#000000' : '#6B7280'}
                          />
                        </TouchableOpacity>

                        {/* Delete Set */}
                        <TouchableOpacity
                          onPress={() => handleRemoveSet(exercise.id, set.id)}
                          disabled={saving}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete set ${set.setNumber}`}
                        >
                          <X size={16} color="#6B7280" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                  {/* Add Set Button */}
                  <TouchableOpacity
                    style={styles.addSetButton}
                    onPress={() => handleAddSet(exercise.id)}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={`Add set to ${exercise.exercise.name}`}
                  >
                    <Plus size={14} color="#38BDF8" />
                    <Text style={styles.addSetButtonText}>Add Set</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Check size={18} color="#000000" />
              )}
              <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ExercisePickerModal
          visible={showExercisePicker}
          title="Add Exercise to Workout"
          onClose={() => setShowExercisePicker(false)}
          onSelectExercise={handleAddExercise}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    maxHeight: '94%',
    backgroundColor: '#181A20',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: '#262A34',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  content: {
    padding: 20,
    paddingBottom: 16,
  },
  label: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#262A34',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  durationCard: {
    backgroundColor: '#262A34',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  durationInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A20',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  durationInput: {
    width: 32,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 2,
  },
  durationUnitLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  durationColon: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '800',
  },
  autoEstimateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  autoEstimateBtnText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '700',
  },
  notesInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  gymOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  gymOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262A34',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  gymOptionSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    borderColor: '#3B82F6',
  },
  gymSwatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 7,
  },
  gymOptionText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  gymOptionTextSelected: {
    color: '#FFFFFF',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  addExerciseHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  addExerciseHeaderBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyExercisesBlock: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  emptyExercisesText: {
    color: '#6B7280',
    fontSize: 13,
  },
  addExercisePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#38BDF8',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addExercisePrimaryBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
  exerciseBlock: {
    backgroundColor: '#14161D',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262A34',
    padding: 12,
    marginBottom: 12,
  },
  exerciseBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  exerciseNameWrap: {
    flex: 1,
    marginRight: 8,
  },
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  exerciseCategory: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  setsTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#20242E',
    marginBottom: 8,
    gap: 6,
  },
  setsTableCol: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  setNumber: {
    width: 30,
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  setTypePill: {
    width: 48,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#262A34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setTypeWarmup: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  setTypeDrop: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  setTypeFailure: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  setTypePillText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '800',
  },
  setInput: {
    flex: 1,
    minWidth: 52,
    backgroundColor: '#262A34',
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
  },
  repsInput: {
    width: 52,
    backgroundColor: '#262A34',
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
  },
  timesText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '700',
  },
  completeToggle: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#262A34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeToggleActive: {
    backgroundColor: '#10B981',
  },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1E232E',
    borderRadius: 8,
    paddingVertical: 8,
    marginTop: 4,
  },
  addSetButtonText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#262A34',
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    paddingVertical: 12,
  },
  cancelText: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '700',
  },
  saveButton: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    backgroundColor: '#10B981',
    paddingVertical: 12,
  },
  saveText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
});
