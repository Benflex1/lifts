import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Search, X, Plus, Check, Edit2 } from 'lucide-react-native';
import { Exercise } from '../types';
import { searchExercises, createCustomExercise, updateCustomExercise } from '../database/db';
import { ExerciseVisual } from './ExerciseVisual';
import { getExerciseRowViewModel } from '../utils/exercise-ui';
import { colors } from '../theme';
import { ExerciseFilterBar } from './ExerciseFilterBar';
import { IconButton } from './ui';

interface Props {
  visible: boolean;
  title?: string;
  multiSelect?: boolean;
  onClose: () => void;
  onSelectExercise: (exercise: Exercise) => void;
  onSelectMultiple?: (exercises: Exercise[]) => void;
}

const MUSCLE_GROUPS = [
  'All',
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Quadriceps',
  'Hamstrings',
  'Glutes',
  'Abdominals',
  'Calves',
];

const EQUIPMENT_LIST = [
  'All',
  'Barbell',
  'Dumbbell',
  'Machine',
  'Cable',
  'Body Only',
];

const CUSTOM_MUSCLE_OPTIONS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Quadriceps',
  'Hamstrings',
  'Glutes',
  'Abdominals',
  'Calves',
];

const CUSTOM_EQUIPMENT_OPTIONS = [
  'Barbell',
  'Dumbbell',
  'Machine',
  'Cable',
  'Bodyweight',
];

const MUSCLE_ALIAS_MAP: Record<string, string> = {
  lats: 'Back',
  lat: 'Back',
  traps: 'Back',
  trap: 'Back',
  rhomboids: 'Back',
  lower_back: 'Back',
  'lower back': 'Back',
  quads: 'Quadriceps',
  quad: 'Quadriceps',
  quadriceps: 'Quadriceps',
  hamstrings: 'Hamstrings',
  hamstring: 'Hamstrings',
  glutes: 'Glutes',
  glute: 'Glutes',
  abs: 'Abdominals',
  core: 'Abdominals',
  abdominals: 'Abdominals',
  calves: 'Calves',
  calf: 'Calves',
  chest: 'Chest',
  pectorals: 'Chest',
  shoulders: 'Shoulders',
  delts: 'Shoulders',
  deltoids: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
};

const EQUIPMENT_ALIAS_MAP: Record<string, string> = {
  barbell: 'Barbell',
  bb: 'Barbell',
  dumbbell: 'Dumbbell',
  db: 'Dumbbell',
  machine: 'Machine',
  'smith machine': 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  'body weight': 'Bodyweight',
  'body only': 'Bodyweight',
  body: 'Bodyweight',
  kettlebell: 'Dumbbell',
  bands: 'Cable',
  band: 'Cable',
};

export const ExercisePickerModal: React.FC<Props> = ({
  visible,
  title,
  multiSelect = false,
  onClose,
  onSelectExercise,
  onSelectMultiple,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('All');
  const [selectedEquipment, setSelectedEquipment] = useState('All');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [selectedExercises, setSelectedExercises] = useState<Map<string, Exercise>>(new Map());

  // Custom exercise modal state
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [customName, setCustomName] = useState('');
  const [customMuscle, setCustomMuscle] = useState('Chest');
  const [customEquipment, setCustomEquipment] = useState('Barbell');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (visible) {
      loadExercises();
      setSelectedExercises(new Map());
    }
  }, [visible, debouncedQuery, selectedMuscle, selectedEquipment]);

  const loadExercises = async () => {
    try {
      const results = await searchExercises(debouncedQuery, selectedMuscle, selectedEquipment);
      setExercises(results);
    } catch (err) {
      console.error(err);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleItemPress = (item: Exercise) => {
    if (multiSelect) {
      setSelectedExercises(prev => {
        const next = new Map(prev);
        if (next.has(item.id)) {
          next.delete(item.id);
        } else {
          next.set(item.id, item);
        }
        return next;
      });
    } else {
      onSelectExercise(item);
      onClose();
    }
  };

  const handleOpenAddCustom = () => {
    setEditingExercise(null);
    setCustomName('');
    setCustomMuscle('Chest');
    setCustomEquipment('Barbell');
    setShowCustomModal(true);
  };

  const handleOpenEditCustom = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setCustomName(exercise.name);

    const rawMuscle = (exercise.primaryMuscles?.[0] || '').toLowerCase().trim();
    const matchedMuscle =
      CUSTOM_MUSCLE_OPTIONS.find(m => m.toLowerCase() === rawMuscle) ||
      MUSCLE_ALIAS_MAP[rawMuscle] ||
      'Chest';
    setCustomMuscle(matchedMuscle);

    const rawEquip = (exercise.equipment || '').toLowerCase().trim();
    const matchedEquip =
      CUSTOM_EQUIPMENT_OPTIONS.find(eq => eq.toLowerCase() === rawEquip) ||
      EQUIPMENT_ALIAS_MAP[rawEquip] ||
      (['kettlebell', 'db'].some(k => rawEquip.includes(k)) ? 'Dumbbell' :
       rawEquip.includes('body') ? 'Bodyweight' :
       rawEquip.includes('cable') || rawEquip.includes('band') ? 'Cable' :
       rawEquip.includes('smith') || rawEquip.includes('machine') ? 'Machine' : 'Barbell');
    setCustomEquipment(matchedEquip);

    setShowCustomModal(true);
  };

  const handleSaveCustom = async () => {
    const trimmed = customName.trim();
    if (!trimmed) return;

    if (editingExercise) {
      const updated = await updateCustomExercise(editingExercise.id, {
        name: trimmed,
        category: editingExercise.category || 'strength',
        equipment: customEquipment.toLowerCase(),
        primaryMuscles: [customMuscle.toLowerCase()],
      });
      setShowCustomModal(false);
      setEditingExercise(null);
      setCustomName('');
      await loadExercises();
      if (selectedExercises.has(updated.id)) {
        setSelectedExercises(prev => new Map(prev).set(updated.id, updated));
      }
    } else {
      const created = await createCustomExercise({
        name: trimmed,
        category: 'strength',
        equipment: customEquipment.toLowerCase(),
        primaryMuscles: [customMuscle.toLowerCase()],
      });
      setShowCustomModal(false);
      setCustomName('');
      await loadExercises();
      if (multiSelect) {
        setSelectedExercises(prev => new Map(prev).set(created.id, created));
      } else {
        onSelectExercise(created);
        onClose();
      }
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{title || 'Select Exercise'}</Text>
            {multiSelect && (
              <Text style={styles.headerSubtitle}>
                {selectedExercises.size === 0
                  ? 'Tap exercises to select multiple'
                  : `${selectedExercises.size} exercise${selectedExercises.size > 1 ? 's' : ''} selected`}
              </Text>
            )}
          </View>
          <View style={styles.headerActions}>
            <IconButton
              icon={Plus}
              onPress={handleOpenAddCustom}
              accessibilityLabel="Create custom exercise"
            />
            <IconButton icon={X} onPress={onClose} accessibilityLabel="Close" />
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchRow}>
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <ExerciseFilterBar
          muscles={MUSCLE_GROUPS}
          equipment={EQUIPMENT_LIST}
          selectedMuscle={selectedMuscle}
          selectedEquipment={selectedEquipment}
          onSelectMuscle={setSelectedMuscle}
          onSelectEquipment={setSelectedEquipment}
        />

        {/* Exercise List */}
        {initialLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={exercises}
            keyExtractor={item => item.id}
            contentContainerStyle={[styles.listContent, multiSelect && selectedExercises.size > 0 && { paddingBottom: 100 }]}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = selectedExercises.has(item.id);
              const rowViewModel = getExerciseRowViewModel(item);
              return (
                <View style={[styles.exerciseItem, isSelected && styles.exerciseItemSelected]}>
                  <TouchableOpacity
                    style={styles.exerciseItemMain}
                    onPress={() => handleItemPress(item)}
                    activeOpacity={0.7}
                  >
                    <ExerciseVisual
                      exercise={item}
                      size="compact"
                      accessibilityLabel={rowViewModel.visualAccessibilityLabel}
                    />
                    <View style={styles.itemInfo}>
                      <View style={styles.itemNameRow}>
                        <Text style={[styles.itemName, isSelected && styles.itemNameSelected]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {item.isCustom && (
                          <View style={styles.listCustomBadge}>
                            <Text style={styles.listCustomBadgeText}>CUSTOM</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.tagRow}>
                        <Text style={styles.tagMuscle}>{item.primaryMuscles.join(', ')}</Text>
                        <Text style={styles.tagDot}>·</Text>
                        <Text style={styles.tagEquipment}>{item.equipment}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  {item.isCustom && (
                    <TouchableOpacity
                      style={styles.itemEditBtn}
                      onPress={() => handleOpenEditCustom(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${item.name}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Edit2 size={16} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                  {multiSelect && (
                    <TouchableOpacity
                      style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}
                      onPress={() => handleItemPress(item)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={`Select ${item.name}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {isSelected && <Check size={16} color={colors.onPrimary} strokeWidth={3} />}
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No exercises found.</Text>
                <TouchableOpacity
                  style={styles.createCustomBar}
                  onPress={handleOpenAddCustom}
                  accessibilityRole="button"
                >
                  <Plus size={16} color={colors.primaryLight} />
                  <Text style={styles.createCustomText}>
                    {searchQuery.trim() ? `Create "${searchQuery.trim()}"` : 'Create Custom Exercise'}
                  </Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}

        {/* Floating Batch Add Bar */}
        {multiSelect && selectedExercises.size > 0 && (
          <View style={styles.floatingBarWrap}>
            <TouchableOpacity
              style={styles.floatingAddBtn}
              onPress={() => {
                if (onSelectMultiple) {
                  onSelectMultiple(Array.from(selectedExercises.values()));
                } else {
                  selectedExercises.forEach(ex => onSelectExercise(ex));
                }
                onClose();
              }}
            >
              <Check size={20} color={colors.onPrimary} strokeWidth={2.5} />
              <Text style={styles.floatingAddBtnText}>
                Add {selectedExercises.size} Exercise{selectedExercises.size > 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Custom Exercise Modal */}
        <Modal
          visible={showCustomModal}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowCustomModal(false);
            setEditingExercise(null);
          }}
        >
          <View style={styles.customModalOverlay}>
            <View style={styles.customModalCard}>
              <View style={styles.header}>
                <Text style={styles.headerTitle}>
                  {editingExercise ? 'Edit Custom Exercise' : 'New Custom Exercise'}
                </Text>
                <TouchableOpacity onPress={() => {
                  setShowCustomModal(false);
                  setEditingExercise(null);
                }}>
                  <X color={colors.textSecondary} size={22} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Exercise Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Bulgarian Split Squat"
                placeholderTextColor={colors.textMuted}
                value={customName}
                onChangeText={setCustomName}
                autoFocus
              />

              <Text style={styles.fieldLabel}>Primary Muscle</Text>
              <View style={styles.modalPills}>
                {CUSTOM_MUSCLE_OPTIONS.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modalPill, customMuscle === m && styles.modalPillActive]}
                    onPress={() => setCustomMuscle(m)}
                  >
                    <Text style={[styles.modalPillText, customMuscle === m && styles.modalPillTextActive]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Equipment</Text>
              <View style={styles.modalPills}>
                {CUSTOM_EQUIPMENT_OPTIONS.map(eq => (
                  <TouchableOpacity
                    key={eq}
                    style={[styles.modalPill, customEquipment === eq && styles.modalPillActive]}
                    onPress={() => setCustomEquipment(eq)}
                  >
                    <Text style={[styles.modalPillText, customEquipment === eq && styles.modalPillTextActive]}>
                      {eq}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.saveCustomBtn} onPress={handleSaveCustom}>
                <Text style={styles.saveCustomBtnText}>
                  {editingExercise ? 'Save Changes' : 'Save & Add Exercise'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
    gap: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.text,
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 0,
  },
  createCustomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  createCustomText: {
    color: colors.primaryLight,
    fontSize: 14,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 40,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 16,
    marginBottom: 2,
  },
  exerciseItemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  exerciseItemSelected: {
    backgroundColor: colors.primarySoft,
  },
  itemInfo: {
    flex: 1,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  itemName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  itemNameSelected: {
    color: colors.white,
  },
  listCustomBadge: {
    backgroundColor: '#3B82F620',
    borderColor: '#3B82F640',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  listCustomBadgeText: {
    color: colors.primaryLight,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  itemEditBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  checkCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  floatingBarWrap: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    zIndex: 99,
  },
  floatingAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 18,
  },
  floatingAddBtnText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 5,
  },
  tagMuscle: {
    color: colors.textSecondary,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  tagDot: {
    color: colors.textFaint,
    fontSize: 13,
  },
  tagEquipment: {
    color: colors.textMuted,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  customModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  customModalCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
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
  modalInput: {
    backgroundColor: colors.border,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 16,
  },
  modalPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.border,
    borderRadius: 12,
  },
  modalPillActive: {
    backgroundColor: colors.primary,
  },
  modalPillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  modalPillTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  saveCustomBtn: {
    backgroundColor: colors.success,
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  saveCustomBtnText: {
    color: colors.black,
    fontSize: 16,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
