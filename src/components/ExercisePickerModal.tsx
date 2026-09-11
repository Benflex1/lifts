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
import { Search, X, Dumbbell, Plus, Check, Edit2 } from 'lucide-react-native';
import { Exercise } from '../types';
import { searchExercises, createCustomExercise, updateCustomExercise } from '../database/db';

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

const QUICK_SUGGESTIONS = [
  'Bench',
  'Squat',
  'Deadlift',
  'Incline DB',
  'Pull-up',
  'Military Press',
  'Barbell Row',
  'Bicep Curl',
  'Triceps',
  'Leg Press',
  'Lateral Raise',
];

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

  const handleSuggestionPress = (suggestion: string) => {
    if (searchQuery.toLowerCase() === suggestion.toLowerCase()) {
      setSearchQuery('');
    } else {
      setSearchQuery(suggestion);
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

    const rawMuscle = exercise.primaryMuscles?.[0] || 'chest';
    const matchedMuscle = MUSCLE_GROUPS.find(
      m => m.toLowerCase() === rawMuscle.toLowerCase()
    ) || 'Chest';
    setCustomMuscle(matchedMuscle === 'All' ? 'Chest' : matchedMuscle);

    const rawEquip = exercise.equipment || 'barbell';
    const matchedEquip = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight'].find(
      eq => eq.toLowerCase() === rawEquip.toLowerCase() || (eq === 'Bodyweight' && rawEquip.toLowerCase().includes('body'))
    ) || 'Barbell';
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
          <View>
            <Text style={styles.headerTitle}>{title || 'Select Exercise'}</Text>
            {multiSelect && (
              <Text style={styles.headerSubtitle}>
                {selectedExercises.size === 0
                  ? 'Tap exercises to select multiple'
                  : `${selectedExercises.size} exercise${selectedExercises.size > 1 ? 's' : ''} selected`}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X color="#9CA3AF" size={24} />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchRow}>
          <Search size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search 800+ exercises..."
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Suggestion Chips */}
        <View style={styles.suggestionsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestionsScroll}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK_SUGGESTIONS.map(s => {
              const isActive = searchQuery.toLowerCase() === s.toLowerCase();
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.suggestionChip, isActive && styles.suggestionChipActive]}
                  onPress={() => handleSuggestionPress(s)}
                >
                  <Text style={[styles.suggestionText, isActive && styles.suggestionTextActive]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Muscle Filter Horizontal List */}
        <View style={styles.filterSection}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={MUSCLE_GROUPS}
            keyExtractor={item => item}
            contentContainerStyle={styles.filterScroll}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.filterChip, selectedMuscle === item && styles.filterChipActive]}
                onPress={() => setSelectedMuscle(item)}
              >
                <Text style={[styles.filterText, selectedMuscle === item && styles.filterTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Equipment Filter Horizontal List */}
        <View style={styles.filterSectionSmall}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={EQUIPMENT_LIST}
            keyExtractor={item => item}
            contentContainerStyle={styles.filterScroll}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.subFilterChip, selectedEquipment === item && styles.subFilterChipActive]}
                onPress={() => setSelectedEquipment(item)}
              >
                <Text
                  style={[
                    styles.subFilterText,
                    selectedEquipment === item && styles.subFilterTextActive,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Add Custom Exercise Bar */}
        <TouchableOpacity
          style={styles.createCustomBar}
          onPress={handleOpenAddCustom}
        >
          <Plus size={18} color="#3B82F6" />
          <Text style={styles.createCustomText}>Can't find it? Create Custom Exercise</Text>
        </TouchableOpacity>

        {/* Exercise List */}
        {initialLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : (
          <FlatList
            data={exercises}
            keyExtractor={item => item.id}
            contentContainerStyle={[styles.listContent, multiSelect && selectedExercises.size > 0 && { paddingBottom: 100 }]}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = selectedExercises.has(item.id);
              return (
                <TouchableOpacity
                  style={[styles.exerciseItem, isSelected && styles.exerciseItemSelected]}
                  onPress={() => handleItemPress(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconThumb, isSelected && styles.iconThumbSelected]}>
                    <Dumbbell size={20} color={isSelected ? '#10B981' : '#3B82F6'} />
                  </View>
                  <View style={styles.itemInfo}>
                    <View style={styles.itemNameRow}>
                      <Text style={[styles.itemName, isSelected && styles.itemNameSelected]}>{item.name}</Text>
                      {item.isCustom && (
                        <View style={styles.listCustomBadge}>
                          <Text style={styles.listCustomBadgeText}>CUSTOM</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.tagRow}>
                      <Text style={styles.tagMuscle}>{item.primaryMuscles.join(', ')}</Text>
                      <Text style={styles.tagDot}>•</Text>
                      <Text style={styles.tagEquipment}>{item.equipment}</Text>
                    </View>
                  </View>
                  {item.isCustom && (
                    <TouchableOpacity
                      style={styles.itemEditBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        handleOpenEditCustom(item);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${item.name}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Edit2 size={16} color="#3B82F6" />
                    </TouchableOpacity>
                  )}
                  {multiSelect && (
                    <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                      {isSelected && <Check size={16} color="#000000" strokeWidth={3} />}
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No exercises found.</Text>
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
              <Check size={20} color="#000000" strokeWidth={2.5} />
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
                  <X color="#9CA3AF" size={22} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Exercise Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Bulgarian Split Squat"
                placeholderTextColor="#6B7280"
                value={customName}
                onChangeText={setCustomName}
                autoFocus
              />

              <Text style={styles.fieldLabel}>Primary Muscle</Text>
              <View style={styles.modalPills}>
                {['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quadriceps', 'Hamstrings', 'Glutes', 'Abdominals'].map(m => (
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
                {['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight'].map(eq => (
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
    backgroundColor: '#0D0E12',
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A20',
    borderRadius: 14,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    height: 50,
    borderWidth: 1,
    borderColor: '#262A34',
    gap: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  suggestionsContainer: {
    marginBottom: 10,
  },
  suggestionsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1E232E',
    borderWidth: 1,
    borderColor: '#2F3748',
  },
  suggestionChipActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#3B82F6',
  },
  suggestionText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  suggestionTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterSection: {
    marginBottom: 8,
  },
  filterSectionSmall: {
    marginBottom: 12,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#181A20',
    borderWidth: 1,
    borderColor: '#262A34',
  },
  filterChipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  subFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#1E2129',
    borderWidth: 1,
    borderColor: '#2A303F',
  },
  subFilterChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },
  subFilterText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  subFilterTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  createCustomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A20',
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#2A3447',
    marginBottom: 12,
  },
  createCustomText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A20',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#20242E',
    gap: 14,
  },
  exerciseItemSelected: {
    borderColor: '#10B981',
    backgroundColor: '#132822',
  },
  iconThumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#1E2638',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconThumbSelected: {
    backgroundColor: '#10382E',
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
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  itemNameSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
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
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  itemEditBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1E2638',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#4B5563',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181A20',
  },
  checkCircleSelected: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  floatingBarWrap: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    zIndex: 99,
  },
  floatingAddBtn: {
    backgroundColor: '#10B981',
    minHeight: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingAddBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tagMuscle: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  tagDot: {
    color: '#6B7280',
    fontSize: 10,
  },
  tagEquipment: {
    color: '#9CA3AF',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 15,
  },
  customModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  customModalCard: {
    backgroundColor: '#181A20',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2F3442',
  },
  fieldLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#262A34',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    color: '#FFFFFF',
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
    backgroundColor: '#262A34',
    borderRadius: 12,
  },
  modalPillActive: {
    backgroundColor: '#3B82F6',
  },
  modalPillText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  modalPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  saveCustomBtn: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  saveCustomBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
});
