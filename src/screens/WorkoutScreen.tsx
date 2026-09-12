import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  FlatList,
} from 'react-native';
import {
  Play,
  Plus,
  Folder,
  Edit2,
  Trash2,
  Dumbbell,
  Sparkles,
  Calendar,
  Copy,
  Settings2,
  Layers,
} from 'lucide-react-native';
import { useWorkout } from '../context/WorkoutContext';
import { Routine } from '../types';
import { getRoutines, deleteRoutine, duplicateRoutine } from '../database/db';
import { RoutineEditorModal } from '../components/RoutineEditorModal';
import { FolderManageModal } from '../components/FolderManageModal';
import { SettingsModal } from '../components/SettingsModal';
import { WorkoutStartModal } from '../components/WorkoutStartModal';
import { resolveInitialStartGymId } from '../workout/gym-session';
import { useSettings } from '../context/SettingsContext';
import { useDialog } from '../context/DialogContext';

export const WorkoutScreen: React.FC = () => {
  const { startWorkout, gyms, refreshGyms } = useWorkout();
  const { gymTrackingEnabled } = useSettings();
  const { confirm, notify } = useDialog();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('All');
  const [showEditor, setShowEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [routineToEdit, setRoutineToEdit] = useState<Routine | null>(null);
  const [showFolderManage, setShowFolderManage] = useState(false);
  const [pendingStart, setPendingStart] = useState<{
    routine?: Routine;
    customName: string;
  } | null>(null);

  useEffect(() => {
    loadRoutines();
  }, []);

  const loadRoutines = async () => {
    const list = await getRoutines();
    setRoutines(list);
  };

  const openStartModal = async (routine?: Routine, customName = 'Empty Workout') => {
    if (!gymTrackingEnabled) {
      try {
        await startWorkout(routine, customName);
      } catch (e) {
        await notify({
          title: 'Error',
          message: routine ? `Failed to start "${routine.name}".` : 'Failed to start workout.',
        });
      }
      return;
    }

    try {
      await refreshGyms();
      setPendingStart({ routine, customName });
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to start workout.' });
    }
  };

  const handleStartEmpty = async () => {
    await openStartModal(undefined, 'Empty Workout');
  };

  const handleStartRoutine = async (routine: Routine) => {
    await openStartModal(routine, routine.name);
  };

  const handleConfirmStart = async (gymId: string) => {
    if (!pendingStart) return false;

    try {
      const started = await startWorkout(
        pendingStart.routine,
        pendingStart.customName,
        undefined,
        { gymId },
      );
      if (started) setPendingStart(null);
      return started;
    } catch (e) {
      await notify({
        title: 'Error',
        message: pendingStart.routine
          ? `Failed to start "${pendingStart.routine.name}".`
          : 'Failed to start workout.',
      });
      throw e;
    }
  };

  const handleDuplicateRoutine = async (routine: Routine) => {
    try {
      await duplicateRoutine(routine.id);
      loadRoutines();
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to duplicate routine.' });
    }
  };

  const handleDeleteRoutine = async (routine: Routine) => {
    const shouldDelete = await confirm({
      title: 'Delete Routine',
      message: `Are you sure you want to delete "${routine.name}"?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!shouldDelete) return;

    try {
      await deleteRoutine(routine.id);
      loadRoutines();
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to delete routine.' });
    }
  };

  // Collect unique folders
  const folders = [
    'All',
    ...Array.from(new Set(routines.map(r => r.folderName).filter(Boolean) as string[])),
  ];

  // Auto-reset selected folder if deleted or renamed
  useEffect(() => {
    if (selectedFolder !== 'All' && !folders.includes(selectedFolder)) {
      setSelectedFolder('All');
    }
  }, [folders, selectedFolder]);

  const filteredRoutines =
    selectedFolder === 'All'
      ? routines
      : routines.filter(r => r.folderName === selectedFolder);

  return (
    <View style={styles.container}>
      {/* Top App Header */}
      <View style={styles.appHeader}>
        <View>
          <Text style={styles.appTitle}>LIFTS</Text>
          <Text style={styles.appSubtitle}>Think Less. Lift More.</Text>
        </View>
        <View style={styles.appHeaderActions}>
          <TouchableOpacity
            style={styles.settingsHeaderBtn}
            onPress={() => setShowSettings(true)}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Settings2 size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.newRoutineHeaderBtn}
            onPress={() => {
              setRoutineToEdit(null);
              setShowEditor(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="New routine"
          >
            <Plus size={18} color="#FFFFFF" />
            <Text style={styles.newRoutineHeaderBtnText}>New Routine</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Quick Start Card */}
        <View style={styles.quickStartCard}>
          <View style={styles.quickStartInfo}>
            <Text style={styles.quickStartTitle}>Quick Start</Text>
            <Text style={styles.quickStartSubtitle}>
              Start an empty workout and log on the fly
            </Text>
          </View>
          <TouchableOpacity style={styles.quickStartBtn} onPress={handleStartEmpty}>
            <Play size={18} color="#000000" fill="#000000" />
            <Text style={styles.quickStartBtnText}>Start Empty</Text>
          </TouchableOpacity>
        </View>

        {/* Routines Section Header */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>My Routines</Text>
            <View style={styles.unlimitedBadge}>
              <Sparkles size={12} color="#10B981" />
              <Text style={styles.unlimitedBadgeText}>{routines.length} Routines (Unlimited)</Text>
            </View>
          </View>
        </View>

        {/* Folder Filter Horizontal Chips */}
        {folders.length > 1 && (
          <View style={styles.folderChipsHeader}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.folderChipsContainer}
            >
              {folders.map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.folderChip, selectedFolder === f && styles.folderChipActive]}
                  onPress={() => setSelectedFolder(f)}
                >
                  {f !== 'All' && (
                    <Folder
                      size={13}
                      color={selectedFolder === f ? '#FFFFFF' : '#9CA3AF'}
                      style={{ marginRight: 4 }}
                    />
                  )}
                  <Text
                    style={[
                      styles.folderChipText,
                      selectedFolder === f && styles.folderChipTextActive,
                    ]}
                  >
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setShowFolderManage(true)} style={styles.manageBtn}>
              <Settings2 size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Routines List */}
        {filteredRoutines.map(routine => (
          <View key={routine.id} style={styles.routineCard}>
            <View style={styles.routineCardHeader}>
              <View style={styles.routineTitleGroup}>
                <Text style={styles.routineName}>{routine.name}</Text>
                <View style={styles.routineBadgesRow}>
                  {routine.folderName && (
                    <View style={styles.folderBadge}>
                      <Folder size={11} color="#3B82F6" />
                      <Text style={styles.folderBadgeText}>{routine.folderName}</Text>
                    </View>
                  )}
                  {routine.exercises.some(e => Boolean(e.supersetId)) && (
                    <View style={styles.supersetTagBadge}>
                      <Layers size={11} color="#A855F7" />
                      <Text style={styles.supersetTagBadgeText}>Supersets</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.routineActions}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => handleDuplicateRoutine(routine)}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Copy size={16} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => {
                    setRoutineToEdit(routine);
                    setShowEditor(true);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Edit2 size={16} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => handleDeleteRoutine(routine)}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Trash2 size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Exercise Badges Preview */}
            <View style={styles.exPreviewWrap}>
              {routine.exercises.slice(0, 5).map((re, idx) => (
                <Text key={idx} style={styles.exPreviewItem} numberOfLines={1}>
                  {re.targetSets}× {re.exercise.name}
                  {idx < Math.min(routine.exercises.length - 1, 4) ? ', ' : ''}
                </Text>
              ))}
              {routine.exercises.length > 5 && (
                <Text style={styles.exPreviewMore}>+{routine.exercises.length - 5} more</Text>
              )}
            </View>

            {/* Start Button */}
            <TouchableOpacity
              style={styles.startRoutineBtn}
              onPress={() => handleStartRoutine(routine)}
            >
              <Play size={16} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={styles.startRoutineBtnText}>Start Workout</Text>
            </TouchableOpacity>
          </View>
        ))}

        {filteredRoutines.length === 0 && (
          <View style={styles.emptyRoutinesBox}>
            <Text style={styles.emptyRoutinesText}>No routines in this folder.</Text>
          </View>
        )}
      </ScrollView>

      {/* Routine Editor Modal */}
      <RoutineEditorModal
        visible={showEditor}
        routineToEdit={routineToEdit}
        existingFolders={folders.filter(f => f !== 'All')}
        onClose={() => setShowEditor(false)}
        onSaved={loadRoutines}
      />

      <FolderManageModal
        visible={showFolderManage}
        folders={folders.filter(f => f !== 'All')}
        onClose={() => setShowFolderManage(false)}
        onFoldersChanged={() => {
          setShowFolderManage(false);
          loadRoutines();
        }}
      />

      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />

      <WorkoutStartModal
        visible={pendingStart !== null}
        workoutName={pendingStart?.customName || 'Workout'}
        gyms={gyms}
        selectedGymId={resolveInitialStartGymId(gyms)}
        onStart={handleConfirmStart}
        onClose={() => setPendingStart(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0E12',
  },
  appHeader: {
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
  appTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  appSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  newRoutineHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  appHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#262A34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newRoutineHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  quickStartCard: {
    backgroundColor: '#1E2129',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2D323F',
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickStartInfo: {
    flex: 1,
    marginRight: 12,
  },
  quickStartTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  quickStartSubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  quickStartBtn: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  quickStartBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  unlimitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#132E27',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  unlimitedBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  folderChipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  manageBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#20242E',
    marginLeft: 8,
  },
  folderChipsContainer: {
    gap: 8,
  },
  folderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A20',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#262A34',
  },
  folderChipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  folderChipText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  folderChipTextActive: {
    color: '#FFFFFF',
  },
  routineCard: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262A34',
    marginBottom: 14,
  },
  routineCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  routineTitleGroup: {
    flex: 1,
    marginRight: 8,
  },
  routineName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  folderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  folderBadgeText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '600',
  },
  routineBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  supersetTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#261834',
    borderWidth: 1,
    borderColor: '#6B21A8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  supersetTagBadgeText: {
    color: '#C084FC',
    fontSize: 11,
    fontWeight: '700',
  },
  routineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#20242E',
  },
  exPreviewWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  exPreviewItem: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  exPreviewMore: {
    color: '#6B7280',
    fontSize: 13,
    fontStyle: 'italic',
  },
  startRoutineBtn: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  startRoutineBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyRoutinesBox: {
    padding: 30,
    alignItems: 'center',
  },
  emptyRoutinesText: {
    color: '#6B7280',
    fontSize: 14,
  },
});
