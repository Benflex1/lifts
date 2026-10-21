import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, StyleSheet } from 'react-native';
import { AppTouchable } from './ui';
import { X } from 'lucide-react-native';
import { Exercise } from '../types';
import { createCustomExercise, updateCustomExercise } from '../database/db';
import {
  customExerciseDefaults,
  CUSTOM_EQUIPMENT_OPTIONS,
  CUSTOM_MUSCLE_OPTIONS,
} from '../workout/exercise-options';
import { reportError } from '../utils/errorReporting';
import { colors } from '../theme';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

export type CustomExerciseSaveMode = 'created' | 'updated';

interface Props {
  visible: boolean;
  /** When set, the modal edits this exercise instead of creating one. */
  exercise?: Exercise | null;
  onClose: () => void;
  onSaved?: (exercise: Exercise, mode: CustomExerciseSaveMode) => void | Promise<void>;
}

/**
 * Shared create/edit form for custom exercises (ARCH-05). Both the Exercises
 * screen and the exercise picker mount this instead of duplicating the form,
 * validation, and persistence logic.
 */
export const CustomExerciseModal: React.FC<Props> = ({
  visible,
  exercise = null,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState('Chest');
  const [equipment, setEquipment] = useState('Barbell');
  const [saving, setSaving] = useState(false);

  // Re-seed the form on every open (and when the edit target changes).
  useEffect(() => {
    if (!visible) return;
    const defaults = customExerciseDefaults(exercise);
    setName(defaults.name);
    setMuscle(defaults.muscle);
    setEquipment(defaults.equipment);
  }, [visible, exercise]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    try {
      let saved: Exercise;
      if (exercise) {
        saved = await updateCustomExercise(exercise.id, {
          name: trimmed,
          category: exercise.category || 'strength',
          equipment: equipment.toLowerCase(),
          primaryMuscles: [muscle.toLowerCase()],
        });
      } else {
        saved = await createCustomExercise({
          name: trimmed,
          category: 'strength',
          equipment: equipment.toLowerCase(),
          primaryMuscles: [muscle.toLowerCase()],
        });
      }
      await onSaved?.(saved, exercise ? 'updated' : 'created');
      onClose();
    } catch (error) {
      reportError(error, { scope: 'exercise.custom-save' });
    } finally {
      setSaving(false);
    }
  };

  // A11Y-04: modal container traps screen-reader focus and takes iOS focus on open.

  const modalA11yRef = useModalAccessibility(visible);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View ref={modalA11yRef} accessibilityViewIsModal style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {exercise ? 'Edit Custom Exercise' : 'New Custom Exercise'}
            </Text>
            <AppTouchable onPress={onClose} accessibilityLabel="Close custom exercise form">
              <X color={colors.textSecondary} size={22} />
            </AppTouchable>
          </View>

          <Text style={styles.fieldLabel}>Exercise Name</Text>
          <TextInput
            testID="custom-exercise-name"
            style={styles.input}
            placeholder="e.g. Bulgarian Split Squat"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={styles.fieldLabel}>Primary Muscle</Text>
          <View style={styles.pills}>
            {CUSTOM_MUSCLE_OPTIONS.map(m => (
              <AppTouchable
                key={m}
                testID={`custom-muscle-${m.toLowerCase()}`}
                style={[styles.pill, muscle === m && styles.pillActive]}
                onPress={() => setMuscle(m)}
                accessibilityRole="button"
                accessibilityLabel={`Muscle group ${m}`}
                accessibilityState={{ selected: muscle === m }}
              >
                <Text style={[styles.pillText, muscle === m && styles.pillTextActive]}>{m}</Text>
              </AppTouchable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Equipment</Text>
          <View style={styles.pills}>
            {CUSTOM_EQUIPMENT_OPTIONS.map(eq => (
              <AppTouchable
                key={eq}
                testID={`custom-equipment-${eq.toLowerCase()}`}
                style={[styles.pill, equipment === eq && styles.pillActive]}
                onPress={() => setEquipment(eq)}
                accessibilityRole="button"
                accessibilityLabel={`Equipment ${eq}`}
                accessibilityState={{ selected: equipment === eq }}
              >
                <Text style={[styles.pillText, equipment === eq && styles.pillTextActive]}>
                  {eq}
                </Text>
              </AppTouchable>
            ))}
          </View>

          <AppTouchable
            testID="custom-exercise-save"
            style={styles.saveButton}
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel={exercise ? 'Save exercise changes' : 'Create exercise'}
          >
            <Text style={styles.saveButtonText}>{exercise ? 'Save Changes' : 'Save Exercise'}</Text>
          </AppTouchable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.border,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 16,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.border,
    borderRadius: 12,
  },
  pillActive: {
    backgroundColor: colors.primary,
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  pillTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  saveButton: {
    backgroundColor: colors.success,
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: colors.black,
    fontSize: 16,
    fontWeight: '700',
  },
});
