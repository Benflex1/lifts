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
import { Search, X, Dumbbell, Plus } from 'lucide-react-native';
import { Exercise } from '../types';
import { searchExercises, createCustomExercise } from '../database/db';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectExercise: (exercise: Exercise) => void;
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
  onClose,
  onSelectExercise,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('All');
  const [selectedEquipment, setSelectedEquipment] = useState('All');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  // Custom exercise modal state
  const [showCustomModal, setShowCustomModal] = useState(false);
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

  const handleCreateCustom = async () => {
    if (!customName.trim()) return;
    const created = await createCustomExercise({
      name: customName.trim(),
      category: 'strength',
      equipment: customEquipment.toLowerCase(),
      primaryMuscles: [customMuscle.toLowerCase()],
    });
    setShowCustomModal(false);
    setCustomName('');
    onSelectExercise(created);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Select Exercise</Text>
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
          onPress={() => setShowCustomModal(true)}
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
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.exerciseItem}
                onPress={() => {
                  onSelectExercise(item);
                  onClose();
                }}
              >
                <View style={styles.iconThumb}>
                  <Dumbbell size={20} color="#3B82F6" />
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <View style={styles.tagRow}>
                    <Text style={styles.tagMuscle}>{item.primaryMuscles.join(', ')}</Text>
                    <Text style={styles.tagDot}>•</Text>
                    <Text style={styles.tagEquipment}>{item.equipment}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No exercises found.</Text>
              </View>
            }
          />
        )}

        {/* Custom Exercise Modal */}
        <Modal
          visible={showCustomModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCustomModal(false)}
        >
          <View style={styles.customModalOverlay}>
            <View style={styles.customModalCard}>
              <View style={styles.header}>
                <Text style={styles.headerTitle}>New Custom Exercise</Text>
                <TouchableOpacity onPress={() => setShowCustomModal(false)}>
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

              <TouchableOpacity style={styles.saveCustomBtn} onPress={handleCreateCustom}>
                <Text style={styles.saveCustomBtnText}>Save & Add Exercise</Text>
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
  iconThumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#1E2638',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
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
