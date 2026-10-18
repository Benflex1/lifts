import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AppTouchable } from './ui';
import { Search, X, Plus, Check } from 'lucide-react-native';
import { Exercise } from '../types';
import { searchExercises } from '../database/db';

import { colors } from '../theme';
import { MUSCLE_GROUPS, EQUIPMENT_LIST } from '../workout/exercise-options';
import { CustomExerciseModal, CustomExerciseSaveMode } from './CustomExerciseModal';
import { ExerciseFilterBar } from './ExerciseFilterBar';
import { IconButton } from './ui';
import { EXERCISE_LIST_PERFORMANCE_PROPS, ExerciseListRow } from './ExerciseListRow';
import { useStableCallback } from '../hooks/useStableCallback';

interface Props {
  visible: boolean;
  title?: string;
  multiSelect?: boolean;
  onClose: () => void;
  onSelectExercise: (exercise: Exercise) => void;
  onSelectMultiple?: (exercises: Exercise[]) => void;
}

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadExercises = useCallback(async () => {
    try {
      const results = await searchExercises(debouncedQuery, selectedMuscle, selectedEquipment);
      setExercises(results);
    } catch (err) {
      console.error(err);
    } finally {
      setInitialLoading(false);
    }
  }, [debouncedQuery, selectedMuscle, selectedEquipment]);

  useEffect(() => {
    if (visible) {
      loadExercises();
      setSelectedExercises(new Map());
    }
  }, [visible, loadExercises]);

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
    setShowCustomModal(true);
  };

  const onRowPress = useStableCallback((item: Exercise) => handleItemPress(item));
  const onRowEdit = useStableCallback((item: Exercise) => handleOpenEditCustom(item));

  const handleOpenEditCustom = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setShowCustomModal(true);
  };

  const closeCustomModal = () => {
    setShowCustomModal(false);
    setEditingExercise(null);
  };

  const handleCustomSaved = async (saved: Exercise, mode: CustomExerciseSaveMode) => {
    await loadExercises();
    if (mode === 'updated') {
      setSelectedExercises(prev =>
        prev.has(saved.id) ? new Map(prev).set(saved.id, saved) : prev,
      );
    } else if (multiSelect) {
      setSelectedExercises(prev => new Map(prev).set(saved.id, saved));
    } else {
      onSelectExercise(saved);
      onClose();
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
            <AppTouchable
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={16} color={colors.textSecondary} />
            </AppTouchable>
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
            contentContainerStyle={[
              styles.listContent,
              multiSelect && selectedExercises.size > 0 && { paddingBottom: 100 },
            ]}
            keyboardShouldPersistTaps="handled"
            {...EXERCISE_LIST_PERFORMANCE_PROPS}
            extraData={selectedExercises}
            renderItem={({ item }) => (
              <ExerciseListRow
                exercise={item}
                onPress={onRowPress}
                onEdit={onRowEdit}
                selectable={multiSelect}
                selected={selectedExercises.has(item.id)}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No exercises found.</Text>
                <AppTouchable
                  style={styles.createCustomBar}
                  onPress={handleOpenAddCustom}
                  accessibilityRole="button"
                  accessibilityLabel={
                    searchQuery.trim()
                      ? `Create custom exercise ${searchQuery.trim()}`
                      : 'Create custom exercise'
                  }
                >
                  <Plus size={16} color={colors.primaryLight} />
                  <Text style={styles.createCustomText}>
                    {searchQuery.trim()
                      ? `Create "${searchQuery.trim()}"`
                      : 'Create Custom Exercise'}
                  </Text>
                </AppTouchable>
              </View>
            }
          />
        )}

        {/* Floating Batch Add Bar */}
        {multiSelect && selectedExercises.size > 0 && (
          <View style={styles.floatingBarWrap}>
            <AppTouchable
              style={styles.floatingAddBtn}
              onPress={() => {
                if (onSelectMultiple) {
                  onSelectMultiple(Array.from(selectedExercises.values()));
                } else {
                  selectedExercises.forEach(ex => onSelectExercise(ex));
                }
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Add ${selectedExercises.size} selected ${selectedExercises.size === 1 ? 'exercise' : 'exercises'}`}
            >
              <Check size={20} color={colors.onPrimary} strokeWidth={2.5} />
              <Text style={styles.floatingAddBtnText}>
                Add {selectedExercises.size} Exercise{selectedExercises.size > 1 ? 's' : ''}
              </Text>
            </AppTouchable>
          </View>
        )}

        {/* Create / Edit Custom Exercise */}
        <CustomExerciseModal
          visible={showCustomModal}
          exercise={editingExercise}
          onClose={closeCustomModal}
          onSaved={handleCustomSaved}
        />
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
