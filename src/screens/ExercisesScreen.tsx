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
import { Search, X, Dumbbell, Plus, ChevronRight, Edit2 } from 'lucide-react-native';
import { Exercise, ExerciseGymScope, Gym } from '../types';
import {
  searchExercises,
  createCustomExercise,
  updateCustomExercise,
  getExerciseGymScope,
  getGyms,
} from '../database/db';
import { useSettings } from '../context/SettingsContext';
import { ExerciseScopeModal } from '../components/ExerciseScopeModal';
import { ExerciseDetailModal } from '../components/ExerciseDetailModal';


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

export const ExercisesScreen: React.FC = () => {
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

  const loadExercises = async () => {
    try {
      const results = await searchExercises(debouncedQuery, selectedMuscle, selectedEquipment);
      setExercises(results);
    } catch (e) {
      console.error(e);
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Exercise Library</Text>
        <TouchableOpacity
          style={styles.addCustomBtn}
          onPress={handleOpenAddCustom}
        >
          <Plus size={16} color="#FFFFFF" />
          <Text style={styles.addCustomBtnText}>Custom</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchRow}>
        <Search size={18} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search 800+ movements..."
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

      {/* Muscle Filter Horizontal Scroll */}
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
              <Text
                style={[
                  styles.filterChipText,
                  selectedMuscle === item && styles.filterChipTextActive,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Equipment Filter Horizontal Scroll */}
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
              style={[styles.subChip, selectedEquipment === item && styles.subChipActive]}
              onPress={() => setSelectedEquipment(item)}
            >
              <Text style={[styles.subChipText, selectedEquipment === item && styles.subChipTextActive]}>
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Exercise List */}
      {initialLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={styles.exerciseCard}>
              <TouchableOpacity
                style={styles.exerciseCardMain}
                onPress={() => setActiveDetail(item)}
                activeOpacity={0.7}
              >
                <View style={styles.iconWrap}>
                  <Dumbbell size={20} color="#3B82F6" />
                </View>

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
                    <Text style={styles.tagDot}>•</Text>
                    <Text style={styles.tagEquipment}>{item.equipment}</Text>
                  </View>
                </View>

                {!item.isCustom && <ChevronRight size={18} color="#4B5563" />}
              </TouchableOpacity>

              {item.isCustom && (
                <TouchableOpacity
                  style={styles.itemEditBtn}
                  onPress={() => handleOpenEditCustom(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Edit2 size={16} color="#3B82F6" />
                </TouchableOpacity>
              )}
            </View>
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
                <X size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>EXERCISE NAME</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Incline Machine Chest Press"
              placeholderTextColor="#6B7280"
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
    backgroundColor: '#0D0E12',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#181A20',
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  addCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  addCustomBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A20',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: '#262A34',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  suggestionsContainer: {
    marginBottom: 8,
  },
  suggestionsScroll: {
    paddingHorizontal: 16,
    gap: 6,
  },
  suggestionChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
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
    fontSize: 12,
    fontWeight: '600',
  },
  suggestionTextActive: {
    color: '#FFFFFF',
  },
  filterSection: {
    marginBottom: 6,
  },
  filterSectionSmall: {
    marginBottom: 12,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#181A20',
    borderWidth: 1,
    borderColor: '#262A34',
  },
  filterChipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterChipText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  subChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1B1E26',
  },
  subChipActive: {
    backgroundColor: '#2563EB',
  },
  subChipText: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  subChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  exerciseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A20',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#262A34',
    gap: 12,
  },
  exerciseCardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#1E2638',
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '700',
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
  headerEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E2638',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  headerEditBtnText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '700',
  },
  detailCustomBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#3B82F620',
    borderColor: '#3B82F660',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  detailCustomBadgeText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  editCustomActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1E2638',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 14,
    marginBottom: 4,
  },
  editCustomActionBtnText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '700',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tagMuscle: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '600',
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
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailContainer: {
    flex: 1,
    backgroundColor: '#0D0E12',
    paddingTop: 50,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  detailHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  detailContent: {
    padding: 20,
  },
  detailName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 14,
  },
  detailBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  badgePrimary: {
    backgroundColor: '#1E2638',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgePrimaryText: {
    color: '#3B82F6',
    fontWeight: '600',
    fontSize: 13,
    textTransform: 'capitalize',
  },
  badgeSecondary: {
    backgroundColor: '#20242E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeSecondaryText: {
    color: '#9CA3AF',
    fontSize: 13,
    textTransform: 'capitalize',
  },
  secondaryMusclesText: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 20,
    textTransform: 'capitalize',
  },
  statsCard: {
    backgroundColor: '#181A20',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#262A34',
    marginBottom: 14,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  statsHeaderTitle: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statsTierTitle: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  statBox: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 70,
    backgroundColor: '#13151B',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#20242E',
  },
  statBoxLabel: {
    color: '#6B7280',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  statBoxValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  scopeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#181A20',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#262A34',
    marginBottom: 14,
  },
  scopeText: {
    flex: 1,
    marginRight: 12,
  },
  scopeLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  scopeValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  scopeButton: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#1D4ED8',
  },
  scopeButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  instructionsBox: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#262A34',
    marginTop: 6,
  },
  instructionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  instructionsHeading: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 12,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#262A34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
  },
  noInstructionsText: {
    color: '#6B7280',
    fontSize: 14,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#181A20',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2F3442',
  },
  fieldLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#262A34',
    borderRadius: 10,
    height: 44,
    color: '#FFFFFF',
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
    backgroundColor: '#262A34',
    borderRadius: 12,
  },
  modalPillActive: {
    backgroundColor: '#3B82F6',
  },
  modalPillText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  modalPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  saveCustomBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  saveCustomBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 15,
  },
});
