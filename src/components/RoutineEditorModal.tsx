import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { X, Plus, Trash2, Dumbbell, Clock } from 'lucide-react-native';
import { Exercise, Routine } from '../types';
import { ExercisePickerModal } from './ExercisePickerModal';
import { saveRoutine } from '../database/db';

interface Props {
  visible: boolean;
  routineToEdit?: Routine | null;
  onClose: () => void;
  onSaved: () => void;
}

interface RoutineDraftExercise {
  exercise: Exercise;
  targetSets: number;
  targetReps: string;
  restTimerSeconds: number;
}

export const RoutineEditorModal: React.FC<Props> = ({
  visible,
  routineToEdit,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [notes, setNotes] = useState('');
  const [draftExercises, setDraftExercises] = useState<RoutineDraftExercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (routineToEdit) {
      setName(routineToEdit.name);
      setFolderName(routineToEdit.folderName || '');
      setNotes(routineToEdit.notes || '');
      setDraftExercises(
        routineToEdit.exercises.map(e => ({
          exercise: e.exercise,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          restTimerSeconds: e.restTimerSeconds,
        }))
      );
    } else {
      setName('');
      setFolderName('');
      setNotes('');
      setDraftExercises([]);
    }
  }, [routineToEdit, visible]);

  const handleAddExercise = (exercise: Exercise) => {
    setDraftExercises(prev => [
      ...prev,
      {
        exercise,
        targetSets: 3,
        targetReps: '8-12',
        restTimerSeconds: 90,
      },
    ]);
  };

  const handleRemoveExercise = (index: number) => {
    setDraftExercises(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a routine name.');
      return;
    }
    if (draftExercises.length === 0) {
      Alert.alert('Error', 'Please add at least one exercise.');
      return;
    }

    await saveRoutine(
      name.trim(),
      folderName.trim(),
      draftExercises.map(e => ({
        exerciseId: e.exercise.id,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        restTimerSeconds: e.restTimerSeconds,
      })),
      notes.trim(),
      routineToEdit?.id
    );

    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color="#9CA3AF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {routineToEdit ? 'Edit Routine' : 'Create Routine'}
          </Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveHeaderBtn}>
            <Text style={styles.saveHeaderBtnText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          {/* Routine Name & Folder */}
          <View style={styles.inputCard}>
            <Text style={styles.fieldLabel}>ROUTINE NAME</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Chest & Triceps Blast"
              placeholderTextColor="#6B7280"
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>FOLDER / CATEGORY (OPTIONAL)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Push Pull Legs"
              placeholderTextColor="#6B7280"
              value={folderName}
              onChangeText={setFolderName}
            />

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>NOTES</Text>
            <TextInput
              style={[styles.textInput, { height: 70, textAlignVertical: 'top' }]}
              placeholder="e.g. Focus on progressive overload, 2 min rest on compounds."
              placeholderTextColor="#6B7280"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>

          {/* Exercises Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Exercises ({draftExercises.length})</Text>
            <TouchableOpacity style={styles.addExBtn} onPress={() => setShowPicker(true)}>
              <Plus size={16} color="#3B82F6" />
              <Text style={styles.addExBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {draftExercises.map((item, idx) => (
            <View key={idx} style={styles.exerciseRow}>
              <View style={styles.iconWrap}>
                <Dumbbell size={18} color="#3B82F6" />
              </View>

              <View style={styles.exInfo}>
                <Text style={styles.exName}>{item.exercise.name}</Text>
                <View style={styles.exMetaRow}>
                  <Text style={styles.exMetaText}>{item.targetSets} sets</Text>
                  <Text style={styles.dot}>•</Text>
                  <Text style={styles.exMetaText}>{item.targetReps} reps</Text>
                  <Text style={styles.dot}>•</Text>
                  <Clock size={12} color="#9CA3AF" style={{ marginRight: 2 }} />
                  <Text style={styles.exMetaText}>{item.restTimerSeconds}s rest</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.deleteExBtn}
                onPress={() => handleRemoveExercise(idx)}
              >
                <Trash2 size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}

          {draftExercises.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No exercises added yet.</Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => setShowPicker(true)}
              >
                <Plus size={18} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>Add First Exercise</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <ExercisePickerModal
          visible={showPicker}
          onClose={() => setShowPicker(false)}
          onSelectExercise={handleAddExercise}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0E12',
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  saveHeaderBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  saveHeaderBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 60,
  },
  inputCard: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262A34',
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#262A34',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  addExBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addExBtnText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A20',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#262A34',
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#1E2638',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exInfo: {
    flex: 1,
  },
  exName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  exMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exMetaText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  dot: {
    color: '#6B7280',
    marginHorizontal: 6,
    fontSize: 10,
  },
  deleteExBtn: {
    padding: 6,
  },
  emptyCard: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262A34',
    borderStyle: 'dashed',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
    marginBottom: 16,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 6,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
