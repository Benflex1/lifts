import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, X } from 'lucide-react-native';
import { deleteExerciseGymScope, saveExerciseGymScope } from '../database/db';
import { Exercise, ExerciseGymScope, ExerciseScopeType, Gym } from '../types';
import { canDismissExerciseScopeModal } from '../utils/gym-picker';
import { defaultScopeForEquipment, validateExerciseGymScope } from '../workout/gym-scope';
import { colors } from '../theme';

interface Props {
  visible: boolean;
  exercise: Exercise | null;
  gyms: Gym[];
  scope: ExerciseGymScope | null;
  onClose: () => void;
  onSaved: (scope: ExerciseGymScope | null) => void | Promise<void>;
}

const SCOPE_OPTIONS: Array<{ type: ExerciseScopeType; label: string; description: string }> = [
  { type: 'global', label: 'Global', description: 'Use completed sets from every gym.' },
  { type: 'gym_specific', label: 'Gym-specific', description: 'Use completed sets from the current gym.' },
  { type: 'linked_group', label: 'Linked gyms', description: 'Use completed sets from selected gyms.' },
];

export const ExerciseScopeModal: React.FC<Props> = ({
  visible,
  exercise,
  gyms,
  scope,
  onClose,
  onSaved,
}) => {
  const [scopeType, setScopeType] = useState<ExerciseScopeType>('global');
  const [linkedGymIds, setLinkedGymIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !exercise) return;
    setScopeType(scope?.scopeType ?? defaultScopeForEquipment(exercise.equipment));
    setLinkedGymIds(scope?.linkedGymIds ?? []);
    setError(null);
  }, [visible, exercise, scope]);

  const toggleLinkedGym = (gymId: string) => {
    setLinkedGymIds(previous => previous.includes(gymId)
      ? previous.filter(id => id !== gymId)
      : [...previous, gymId]);
  };

  const handleSave = async () => {
    if (!exercise) return;
    setSaving(true);
    setError(null);
    try {
      const nextScope: ExerciseGymScope = {
        exerciseId: exercise.id,
        scopeType,
        ...(scopeType === 'linked_group' ? { linkedGymIds } : {}),
      };
      validateExerciseGymScope(nextScope, new Set(gyms.map(gym => gym.id)));
      await saveExerciseGymScope(nextScope);
      await onSaved(nextScope);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save exercise scope.');
    } finally {
      setSaving(false);
    }
  };

  const handleUseDefault = async () => {
    if (!exercise) return;
    setSaving(true);
    setError(null);
    try {
      await deleteExerciseGymScope(exercise.id);
      await onSaved(null);
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to remove exercise scope.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (canDismissExerciseScopeModal(saving)) onClose();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Exercise Scope</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{exercise?.name}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              disabled={saving}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close exercise scope"
              accessibilityState={{ disabled: saving }}
            >
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {SCOPE_OPTIONS.map(option => {
              const selected = scopeType === option.type;
              return (
                <TouchableOpacity
                  key={option.type}
                  style={[styles.scopeOption, selected && styles.scopeOptionSelected]}
                  onPress={() => setScopeType(option.type)}
                  disabled={saving}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                >
                  <View style={styles.scopeOptionText}>
                    <Text style={[styles.scopeLabel, selected && styles.scopeLabelSelected]}>{option.label}</Text>
                    <Text style={styles.scopeDescription}>{option.description}</Text>
                  </View>
                  {selected && <Check size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}

            {scopeType === 'linked_group' && (
              <View style={styles.linkedSection}>
                <Text style={styles.sectionLabel}>SELECT AT LEAST TWO GYMS</Text>
                {gyms.map(gym => {
                  const selected = linkedGymIds.includes(gym.id);
                  return (
                    <TouchableOpacity
                      key={gym.id}
                      style={[styles.gymOption, selected && styles.gymOptionSelected]}
                      onPress={() => toggleLinkedGym(gym.id)}
                      disabled={saving}
                      accessibilityRole="checkbox"
                      accessibilityLabel={`Link ${gym.name}`}
                      accessibilityState={{ checked: selected }}
                    >
                      <View style={[styles.swatch, { backgroundColor: gym.color }]} />
                      <Text style={[styles.gymName, selected && styles.gymNameSelected]}>{gym.name}</Text>
                      {selected && <Check size={18} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity
              style={styles.defaultButton}
              onPress={handleUseDefault}
              disabled={saving}
              accessibilityRole="button"
            >
              <Text style={styles.defaultButtonText}>Use equipment default</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
              {saving && <ActivityIndicator size="small" color={colors.black} />}
              <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Scope'}</Text>
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
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  container: {
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 19, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 3, maxWidth: 260 },
  content: { padding: 20, paddingBottom: 12 },
  scopeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    padding: 13,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.control,
    backgroundColor: colors.border,
  },
  scopeOptionSelected: { borderColor: colors.primary, backgroundColor: 'rgba(59, 130, 246, 0.12)' },
  scopeOptionText: { flex: 1 },
  scopeLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  scopeLabelSelected: { color: colors.text },
  scopeDescription: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  linkedSection: { marginTop: 8, marginBottom: 4 },
  sectionLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 7 },
  gymOption: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    padding: 11,
    marginBottom: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.control,
    backgroundColor: colors.surfaceAlt,
  },
  gymOptionSelected: { borderColor: colors.primary, backgroundColor: 'rgba(59, 130, 246, 0.12)' },
  swatch: { width: 12, height: 12, borderRadius: 6, marginRight: 9 },
  gymName: { flex: 1, color: colors.textSoft, fontSize: 14, fontWeight: '600' },
  gymNameSelected: { color: colors.text },
  error: { color: colors.dangerLight, fontSize: 13, marginTop: 5, marginBottom: 8 },
  defaultButton: { alignItems: 'center', paddingVertical: 12, marginTop: 8 },
  defaultButtonText: { color: colors.primaryLight, fontSize: 13, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.control, paddingVertical: 12 },
  cancelText: { color: colors.textSoft, fontSize: 14, fontWeight: '700' },
  saveButton: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: colors.success, paddingVertical: 12 },
  saveText: { color: colors.black, fontSize: 14, fontWeight: '800' },
});
