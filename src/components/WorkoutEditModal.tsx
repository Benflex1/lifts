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
import { Check, X } from 'lucide-react-native';
import { Workout } from '../types';
import { WeightUnit, displayToKg, kgToDisplay } from '../utils/units';
import { applyWorkoutEdits } from '../workout/workout-edit';

interface Props {
  visible: boolean;
  workout: Workout | null;
  unit: WeightUnit;
  onClose: () => void;
  onSave: (workout: Workout) => Promise<void>;
}

interface DraftSet {
  weight: string;
  reps: string;
}

const draftKey = (exerciseId: string, setId: string) => `${exerciseId}:${setId}`;

export const WorkoutEditModal: React.FC<Props> = ({
  visible,
  workout,
  unit,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [draftSets, setDraftSets] = useState<Record<string, DraftSet>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !workout) return;

    const nextDraftSets: Record<string, DraftSet> = {};
    for (const exercise of workout.exercises) {
      for (const set of exercise.sets) {
        if (!set.isCompleted) continue;
        nextDraftSets[draftKey(exercise.exerciseId, set.id)] = {
          weight: String(kgToDisplay(set.weightKg, unit)),
          reps: String(set.reps),
        };
      }
    }

    setName(workout.name);
    setNotes(workout.notes || '');
    setDraftSets(nextDraftSets);
    setError(null);
  }, [visible, workout, unit]);

  const updateSetDraft = (key: string, field: keyof DraftSet, value: string) => {
    setDraftSets(previous => ({
      ...previous,
      [key]: { ...previous[key], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!workout) return;

    setSaving(true);
    setError(null);
    try {
      const edits = workout.exercises.flatMap(exercise =>
        exercise.sets
          .filter(set => set.isCompleted)
          .map(set => {
            const draft = draftSets[draftKey(exercise.exerciseId, set.id)];
            return {
              exerciseId: exercise.exerciseId,
              setId: set.id,
              weightKg: displayToKg(
                draft?.weight.trim() ? Number(draft.weight) : Number.NaN,
                unit
              ),
              reps: draft?.reps.trim() ? Number(draft.reps) : Number.NaN,
            };
          })
      );

      const updated = applyWorkoutEdits(workout, {
        name,
        notes,
        sets: edits,
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
          <View style={styles.header}>
            <Text style={styles.title}>Edit Workout</Text>
            <TouchableOpacity onPress={onClose} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>WORKOUT NAME</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Workout name"
              placeholderTextColor="#6B7280"
              editable={!saving}
            />

            <Text style={styles.label}>NOTES</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes"
              placeholderTextColor="#6B7280"
              multiline
              editable={!saving}
            />

            <Text style={styles.sectionTitle}>COMPLETED SETS</Text>
            {workout?.exercises.map(exercise => {
              const completedSets = exercise.sets.filter(set => set.isCompleted);
              if (completedSets.length === 0) return null;

              return (
                <View key={exercise.id} style={styles.exerciseBlock}>
                  <Text style={styles.exerciseName}>{exercise.exercise.name}</Text>
                  {completedSets.map(set => {
                    const key = draftKey(exercise.exerciseId, set.id);
                    const draft = draftSets[key] || { weight: '', reps: '' };
                    return (
                      <View key={set.id} style={styles.setRow}>
                        <Text style={styles.setNumber}>#{set.setNumber}</Text>
                        <TextInput
                          style={styles.setInput}
                          value={draft.weight}
                          onChangeText={value => updateSetDraft(key, 'weight', value)}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                          editable={!saving}
                        />
                        <Text style={styles.unitText}>{unit}</Text>
                        <Text style={styles.timesText}>×</Text>
                        <TextInput
                          style={styles.repsInput}
                          value={draft.reps}
                          onChangeText={value => updateSetDraft(key, 'reps', value)}
                          keyboardType="number-pad"
                          selectTextOnFocus
                          editable={!saving}
                        />
                        <Text style={styles.unitText}>reps</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}

            {error && <Text style={styles.errorText}>{error}</Text>}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#000000" /> : <Check size={18} color="#000000" />}
              <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    maxHeight: '92%',
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
    paddingBottom: 12,
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
  notesInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  sectionTitle: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 8,
  },
  exerciseBlock: {
    backgroundColor: '#14161D',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#262A34',
    padding: 10,
    marginBottom: 10,
  },
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 5,
  },
  setNumber: {
    width: 28,
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  setInput: {
    flex: 1,
    minWidth: 56,
    backgroundColor: '#262A34',
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 14,
    paddingHorizontal: 8,
    paddingVertical: 7,
    textAlign: 'center',
  },
  repsInput: {
    width: 56,
    backgroundColor: '#262A34',
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 14,
    paddingHorizontal: 8,
    paddingVertical: 7,
    textAlign: 'center',
  },
  unitText: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  timesText: {
    color: '#6B7280',
    fontSize: 15,
    marginHorizontal: 2,
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
