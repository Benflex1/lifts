import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Search, X, Plus, ChevronRight, Edit2 } from 'lucide-react-native';
import { Exercise, ExerciseGymScope, Gym } from '../types';
import {
  searchExercises,
  createCustomExercise,
  updateCustomExercise,
  getExerciseGymScope,
  getGyms,
} from '../database/db';
import { useSettings } from '../context/SettingsContext';
import { useReloadOnActivate } from '../hooks/useReloadOnActivate';
import { ExerciseScopeModal } from '../components/ExerciseScopeModal';
import { ExerciseDetailModal } from '../components/ExerciseDetailModal';
import { ExerciseVisual } from '../components/ExerciseVisual';
import { getExerciseRowViewModel } from '../utils/exercise-ui';
import { colors } from '../theme';
import { ExerciseFilterBar } from '../components/ExerciseFilterBar';
import { IconButton, ScreenHeader } from '../components/ui';


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

const ExercisesScreenInner: React.FC = () => {
  const { gymTrackingEnabled } = useSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('All');
  const [selectedEquipment, setSelectedEquipment] = useState('All');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  // Selected exercise for detail view
  const [activeDetail, setActiveDetail] = useState<Exercise | null>(null);

  // Custom exercise modal (create & edit)
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [customName, setCustomName] = useState('');
  const [customMuscle, setCustomMuscle] = useState('Chest');
  const [customEquipment, setCustomEquipment] = useState('Barbell');

  // Exercise scope management
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [exerciseScope, setExerciseScope] = useState<ExerciseGymScope | null>(null);
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [scopeRefreshKey, setScopeRefreshKey] = useState(0);

  const handleOpenScope = async () => {
    if (!activeDetail) return;
    try {
      const [gymList, scope] = await Promise.all([
        getGyms(),
        getExerciseGymScope(activeDetail.id),
      ]);
      setGyms(gymList);
      setExerciseScope(scope);
      setShowScopeModal(true);
    } catch (e) {
      console.error('Error loading scope details:', e);
    }
  };

  const handleScopeSaved = (scope: ExerciseGymScope | null) => {
    setExerciseScope(scope);
    setScopeRefreshKey((k) => k + 1);
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

  useEffect(() => {
    loadExercises();
  }, [debouncedQuery, selectedMuscle, selectedEquipment]);

  // Custom exercises can be created from the workout picker, so refresh when returning here.
  useReloadOnActivate(() => void loadExercises());

  const loadExercises = async () => {
    try {
      const results = await searchExercises(debouncedQuery, selectedMuscle, selectedEquipment);
      // Keep the current array when nothing changed so the long list does not re-render.
      setExercises(previous =>
        previous.length === results.length &&
        previous.every((ex, idx) => ex === results[idx] || (ex.id === results[idx].id && ex.name === results[idx].name && ex.equipment === results[idx].equipment && ex.primaryMuscles.join() === results[idx].primaryMuscles.join()))
          ? previous
          : results,
      );
    } catch (e) {
      console.error(e);
    } finally {
      setInitialLoading(false);
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
      if (activeDetail && activeDetail.id === editingExercise.id) {
        setActiveDetail(updated);
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
      setActiveDetail(created);
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
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const rowViewModel = getExerciseRowViewModel(item);
            return (
              <View style={styles.exerciseCard}>
                <TouchableOpacity
                  style={styles.exerciseCardMain}
                  onPress={() => setActiveDetail(item)}
                  activeOpacity={0.7}
                >
                  <ExerciseVisual
                    exercise={item}
                    size="compact"
                    accessibilityLabel={rowViewModel.visualAccessibilityLabel}
                  />

                  <View style={styles.itemInfo}>
                    <View style={styles.itemNameRow}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.isCustom && (
                        <View style={styles.listCustomBadge}>
                          <Text style={styles.listCustomBadgeText}>CUSTOM</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.tagRow}>
                      <Text style={styles.tagMuscle}>
                        {item.primaryMuscles.join(', ') || 'General'}
                      </Text>
                      <Text style={styles.tagDot}>·</Text>
                      <Text style={styles.tagEquipment}>{item.equipment}</Text>
                    </View>
                  </View>

                  {!item.isCustom && <ChevronRight size={18} color={colors.textFaint} />}
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
              </View>
            );
          }}
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
        onHistoryTransferred={loadExercises}
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

      {/* Create / Edit Custom Modal */}
      <Modal 
        visible={showCustomModal} 
        transparent 
        animationType="fade"
        onRequestClose={() => {
          setShowCustomModal(false);
          setEditingExercise(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailHeaderTitle}>
                {editingExercise ? 'Edit Custom Exercise' : 'Add Custom Exercise'}
              </Text>
              <TouchableOpacity onPress={() => {
                setShowCustomModal(false);
                setEditingExercise(null);
              }}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>EXERCISE NAME</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Incline Machine Chest Press"
              placeholderTextColor={colors.textMuted}
              value={customName}
              onChangeText={setCustomName}
              autoFocus
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>PRIMARY MUSCLE</Text>
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

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>EQUIPMENT</Text>
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
                {editingExercise ? 'Save Changes' : 'Save Exercise'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  exerciseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  exerciseCardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    marginLeft: 8,
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
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailHeaderTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: colors.border,
    borderRadius: 10,
    height: 44,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  modalPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  modalPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.border,
    borderRadius: 12,
  },
  modalPillActive: {
    backgroundColor: colors.primary,
  },
  modalPillText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  modalPillTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  saveCustomBtn: {
    backgroundColor: colors.success,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  saveCustomBtnText: {
    color: colors.black,
    fontSize: 15,
    fontWeight: '700',
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
