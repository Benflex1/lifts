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
import { colors } from '../theme';
import { useSettings } from '../context/SettingsContext';
import {
  displayToMeters,
  distanceUnitFor,
  formatSetDuration,
  getTrackingType,
  metersToDisplay,
  parseSetDuration,
  resolveTrackingTypeForExercise,
  sanitizeDurationInput,
  usesDistance,
  usesDuration,
  usesReps,
  usesWeight,
  withTrackingType,
} from '../workout/tracking';

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
  duration?: string;
  distance?: string;
}

function trackedDrafts(set: WorkoutSet, unit: WeightUnit): Pick<SetDraftValues, 'duration' | 'distance'> {
  return {
    ...(set.durationSeconds !== undefined ? { duration: formatSetDuration(set.durationSeconds) } : {}),
    ...(set.distanceM !== undefined
      ? { distance: String(metersToDisplay(set.distanceM, distanceUnitFor(unit))) }
      : {}),
  };
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
  const { trackingTypesEnabled, trackingTypeOverrides } = useSettings();
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
          ...trackedDrafts(set, unit),
        };
      }
    }
    setDraftValues(nextDrafts);
    setError(null);
  }, [visible, workout, unit]);

  const updateDraft = (activeExerciseId: string, setId: string, field: keyof SetDraftValues, val: string) => {
    const key = draftKey(activeExerciseId, setId);
    const sanitized =
      field === 'reps'
        ? sanitizeRepsInput(val)
        : field === 'duration'
          ? sanitizeDurationInput(val)
          : sanitizeWeightInput(val);
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

    const trackingType = resolveTrackingTypeForExercise(newExercise, trackingTypesEnabled, trackingTypeOverrides);
    const newSet: WorkoutSet = {
      id: newSetId,
      setNumber: 1,
      type: 'normal',
      weightKg: 0,
      reps: usesReps(trackingType) ? 10 : 0,
      isCompleted: true,
    };

    const newActiveExercise: ActiveExercise = withTrackingType<ActiveExercise>({
      id: newActiveId,
      exerciseId: newExercise.id,
      exercise: newExercise,
      sets: [newSet],
      restTimerSeconds: 90,
    }, trackingType);

    setExercises((prev) => [...prev, newActiveExercise]);
    setDraftValues((prev) => ({
      ...prev,
      [draftKey(newActiveId, newSetId)]: {
        weight: '0',
        reps: String(newSet.reps),
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
          reps: lastSet ? lastSet.reps : 10,
          ...(lastSet?.durationSeconds !== undefined ? { durationSeconds: lastSet.durationSeconds } : {}),
          ...(lastSet?.distanceM !== undefined ? { distanceM: lastSet.distanceM } : {}),
          isCompleted: true,
        };

        setDraftValues((dPrev) => ({
          ...dPrev,
          [draftKey(activeExerciseId, newSetId)]: {
            weight: lastDraft?.weight || String(kgToDisplay(newSet.weightKg, unit)),
            reps: lastDraft?.reps || String(newSet.reps),
            ...(lastDraft?.duration !== undefined ? { duration: lastDraft.duration } : {}),
            ...(lastDraft?.distance !== undefined ? { distance: lastDraft.distance } : {}),
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

          const trackingType = getTrackingType(ex);
          if (!usesReps(trackingType) && (rawReps === undefined || rawReps === '')) repsNum = 0;
          if (!usesWeight(trackingType) && (rawWeight === undefined || rawWeight === '')) weightNum = 0;
          const durationSeconds = draft?.duration !== undefined ? parseSetDuration(draft.duration) : s.durationSeconds;
          const parsedDistance = draft?.distance !== undefined && draft.distance.trim() !== ''
            ? Number(draft.distance)
            : undefined;
          const distanceM = draft?.distance === undefined
            ? s.distanceM
            : parsedDistance !== undefined && Number.isFinite(parsedDistance)
              ? displayToMeters(parsedDistance, distanceUnitFor(unit))
              : undefined;
          const { durationSeconds: _duration, distanceM: _distance, ...rest } = s;

          return {
            ...rest,
            weightKg: displayToKg(weightNum, unit),
            reps: repsNum,
            ...(durationSeconds !== undefined ? { durationSeconds } : {}),
            ...(distanceM !== undefined ? { distanceM } : {}),
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
              <X size={24} color={colors.textSecondary} />
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
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              editable={!saving}
            />

            {/* Duration Section */}
            <Text style={styles.label}>WORKOUT DURATION</Text>
            <View style={styles.durationCard}>
              <View style={styles.durationRow}>
                <Clock size={18} color={colors.primary} />
                <View style={styles.durationInputGroup}>
                  <TextInput
                    style={styles.durationInput}
                    value={hours}
                    onChangeText={setHours}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
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
                    placeholderTextColor={colors.textMuted}
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
                  <Sparkles size={14} color={colors.warning} />
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
              placeholderTextColor={colors.textMuted}
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
                <Plus size={14} color={colors.primary} />
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
                  <Plus size={16} color={colors.black} />
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
                      <Trash2 size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>

                  {/* Sets header */}
                  <View style={styles.setsTableHeader}>
                    <Text style={[styles.setsTableCol, { width: 34 }]}>SET</Text>
                    <Text style={[styles.setsTableCol, { width: 50 }]}>TYPE</Text>
                    {usesWeight(getTrackingType(exercise)) && (
                      <Text style={[styles.setsTableCol, { flex: 1, textAlign: 'center' }]}>
                        {getTrackingType(exercise) === 'weighted_bodyweight'
                          ? `ADDED (${unit})`
                          : getTrackingType(exercise) === 'assisted_bodyweight'
                            ? `ASSIST (${unit})`
                            : `WEIGHT (${unit})`}
                      </Text>
                    )}
                    {usesReps(getTrackingType(exercise)) && (
                      <Text style={[styles.setsTableCol, { width: 64, textAlign: 'center' }]}>
                        REPS
                      </Text>
                    )}
                    {usesDistance(getTrackingType(exercise)) && (
                      <Text style={[styles.setsTableCol, { flex: 1, textAlign: 'center' }]}>
                        DISTANCE ({distanceUnitFor(unit)})
                      </Text>
                    )}
                    {usesDuration(getTrackingType(exercise)) && (
                      <Text style={[styles.setsTableCol, { flex: 1, textAlign: 'center' }]}>TIME</Text>
                    )}
                    <View style={{ width: 30 }} />
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
                        {usesWeight(getTrackingType(exercise)) && (
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
                        )}

                        {usesWeight(getTrackingType(exercise)) && <Text style={styles.timesText}>×</Text>}

                        {/* Reps input */}
                        {usesReps(getTrackingType(exercise)) && (
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
                        )}

                        {usesDistance(getTrackingType(exercise)) && (
                          <TextInput
                            style={styles.setInput}
                            value={draft.distance ?? ''}
                            onChangeText={(value) => updateDraft(exercise.id, set.id, 'distance', value)}
                            keyboardType="decimal-pad"
                            placeholder="-"
                            placeholderTextColor={colors.textMuted}
                            accessibilityLabel={`Set ${set.setNumber} distance`}
                            editable={!saving}
                          />
                        )}

                        {usesDuration(getTrackingType(exercise)) && (
                          <TextInput
                            style={styles.setInput}
                            value={draft.duration ?? ''}
                            onChangeText={(value) => updateDraft(exercise.id, set.id, 'duration', value)}
                            keyboardType="numbers-and-punctuation"
                            placeholder="0:00"
                            placeholderTextColor={colors.textMuted}
                            accessibilityLabel={`Set ${set.setNumber} time`}
                            editable={!saving}
                          />
                        )}

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
                            color={set.isCompleted ? colors.black : colors.textMuted}
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
                          <X size={16} color={colors.textMuted} />
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
                    <Plus size={14} color={colors.primary} />
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
                <ActivityIndicator size="small" color={colors.black} />
              ) : (
                <Check size={18} color={colors.black} />
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
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  content: {
    padding: 20,
    paddingBottom: 16,
  },
  label: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  durationCard: {
    backgroundColor: colors.border,
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
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.control,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  durationInput: {
    width: 32,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 2,
  },
  durationUnitLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  durationColon: {
    color: colors.textMuted,
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
    color: colors.gold,
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
    backgroundColor: colors.border,
    borderWidth: 1,
    borderColor: colors.control,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  gymOptionSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    borderColor: colors.primary,
  },
  gymSwatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 7,
  },
  gymOptionText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  gymOptionTextSelected: {
    color: colors.text,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    color: colors.textSecondary,
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
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyExercisesBlock: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  emptyExercisesText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  addExercisePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addExercisePrimaryBtnText: {
    color: colors.black,
    fontSize: 13,
    fontWeight: '700',
  },
  exerciseBlock: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  exerciseCategory: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  setsTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
    marginBottom: 8,
    gap: 6,
  },
  setsTableCol: {
    color: colors.textMuted,
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
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  setTypePill: {
    width: 48,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.border,
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
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  setInput: {
    flex: 1,
    minWidth: 52,
    backgroundColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
  },
  repsInput: {
    width: 52,
    backgroundColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
  },
  timesText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  completeToggle: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeToggleActive: {
    backgroundColor: colors.success,
  },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingVertical: 8,
    marginTop: 4,
  },
  addSetButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  errorText: {
    color: colors.dangerLight,
    fontSize: 13,
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.control,
    paddingVertical: 12,
  },
  cancelText: {
    color: colors.textSoft,
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
    backgroundColor: colors.success,
    paddingVertical: 12,
  },
  saveText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '800',
  },
});
