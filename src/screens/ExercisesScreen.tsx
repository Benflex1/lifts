import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Search, X, Plus } from 'lucide-react-native';
import { Exercise, ExerciseGymScope } from '../types';
import { reportError } from '../utils/errorReporting';
import { getExerciseGymScope } from '../database/db';
import { useSettings } from '../context/SettingsContext';
import { useExerciseCatalog } from '../hooks/useExerciseCatalog';
import { useGymProfiles } from '../hooks/useGymProfiles';
import { MUSCLE_GROUPS, EQUIPMENT_LIST } from '../workout/exercise-options';
import { CustomExerciseModal, CustomExerciseSaveMode } from '../components/CustomExerciseModal';
import { ExerciseScopeModal } from '../components/ExerciseScopeModal';
import { ExerciseDetailModal } from '../components/ExerciseDetailModal';

import { colors } from '../theme';
import { ExerciseFilterBar } from '../components/ExerciseFilterBar';
import { IconButton, ScreenHeader } from '../components/ui';
import { EXERCISE_LIST_PERFORMANCE_PROPS, ExerciseListRow } from '../components/ExerciseListRow';
import { useStableCallback } from '../hooks/useStableCallback';

const ExercisesScreenInner: React.FC = () => {
  const { gymTrackingEnabled } = useSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('All');
  const [selectedEquipment, setSelectedEquipment] = useState('All');
  const {
    exercises,
    loading: initialLoading,
    reload: reloadExercises,
  } = useExerciseCatalog({
    query: debouncedQuery,
    muscle: selectedMuscle,
    equipment: selectedEquipment,
  });

  // Selected exercise for detail view
  const [activeDetail, setActiveDetail] = useState<Exercise | null>(null);

  // Custom exercise modal (create & edit)
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  // Exercise scope management
  const { gyms, reload: reloadGyms } = useGymProfiles();
  const [exerciseScope, setExerciseScope] = useState<ExerciseGymScope | null>(null);
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [scopeRefreshKey, setScopeRefreshKey] = useState(0);

  const handleOpenScope = async () => {
    if (!activeDetail) return;
    try {
      const [, scope] = await Promise.all([reloadGyms(), getExerciseGymScope(activeDetail.id)]);
      setExerciseScope(scope);
      setShowScopeModal(true);
    } catch (e) {
      reportError(e, { scope: 'exercises.scope-details' });
    }
  };

  const handleScopeSaved = (scope: ExerciseGymScope | null) => {
    setExerciseScope(scope);
    setScopeRefreshKey(k => k + 1);
  };

  useEffect(() => {
    if (!gymTrackingEnabled) setShowScopeModal(false);
  }, [gymTrackingEnabled]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleOpenAddCustom = () => {
    setEditingExercise(null);
    setShowCustomModal(true);
  };

  const onRowPress = useStableCallback((item: Exercise) => setActiveDetail(item));
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
    await reloadExercises();
    if (mode === 'created' || activeDetail?.id === saved.id) {
      setActiveDetail(saved);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Exercises"
        right={
          <IconButton
            icon={Plus}
            tone="primary"
            onPress={handleOpenAddCustom}
            accessibilityLabel="Create custom exercise"
          />
        }
      />

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
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
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
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          {...EXERCISE_LIST_PERFORMANCE_PROPS}
          renderItem={({ item }) => (
            <ExerciseListRow exercise={item} onPress={onRowPress} onEdit={onRowEdit} showChevron />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No exercises found.</Text>
            </View>
          }
        />
      )}

      {/* Exercise Detail Modal */}
      <ExerciseDetailModal
        visible={activeDetail !== null}
        exercise={activeDetail}
        onClose={() => {
          setActiveDetail(null);
          setShowScopeModal(false);
        }}
        onEditCustom={handleOpenEditCustom}
        onEditScope={handleOpenScope}
        onHistoryTransferred={reloadExercises}
        refreshKey={scopeRefreshKey}
      />

      <ExerciseScopeModal
        visible={gymTrackingEnabled && showScopeModal && activeDetail !== null}
        exercise={activeDetail}
        gyms={gyms}
        scope={exerciseScope}
        onClose={() => setShowScopeModal(false)}
        onSaved={handleScopeSaved}
      />

      {/* Create / Edit Custom Exercise */}
      <CustomExerciseModal
        visible={showCustomModal}
        exercise={editingExercise}
        onClose={closeCustomModal}
        onSaved={handleCustomSaved}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 15,
  },
});

/** Memoized so hidden (kept-alive) tabs skip re-rendering when the app shell updates. */
export const ExercisesScreen = React.memo(ExercisesScreenInner);
