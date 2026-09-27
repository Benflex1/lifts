import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {
  Play,
  Plus,
  Folder,
  FolderCog,
  Edit2,
  Trash2,
  Copy,
  Settings2,
  Layers,
  MoreHorizontal,
  ChevronRight,
  Check,
  Flame,
} from 'lucide-react-native';
import { useWorkoutActions, useWorkoutGyms } from '../context/WorkoutContext';
import { Routine } from '../types';
import { getRoutines, deleteRoutine, duplicateRoutine, getGyms, getWorkoutHistory } from '../database/db';
import { buildWeekSnapshot, WeekSnapshot } from '../workout/week-summary';
import { formatWeight } from '../utils/units';
import { RoutineEditorModal } from '../components/RoutineEditorModal';
import { FolderManageModal } from '../components/FolderManageModal';
import { SettingsModal } from '../components/SettingsModal';
import { WorkoutStartModal } from '../components/WorkoutStartModal';
import { resolveInitialStartGymId } from '../workout/gym-session';
import { useSettings } from '../context/SettingsContext';
import { useDialog } from '../context/DialogContext';
import { useReloadOnActivate } from '../hooks/useReloadOnActivate';
import { getSupersetMetadata } from '../workout/supersets';
import { colors, radii } from '../theme';
import { ActionSheet, Chip, IconButton, ScreenHeader, SectionHeader } from '../components/ui';

const WorkoutScreenInner: React.FC = () => {
  const { startWorkout, refreshGyms } = useWorkoutActions();
  const { gyms } = useWorkoutGyms();
  const { gymTrackingEnabled, unit } = useSettings();
  const { confirm, notify } = useDialog();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('All');
  const [showEditor, setShowEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [routineToEdit, setRoutineToEdit] = useState<Routine | null>(null);
  const [showFolderManage, setShowFolderManage] = useState(false);
  const [menuRoutine, setMenuRoutine] = useState<Routine | null>(null);
  const [week, setWeek] = useState<WeekSnapshot | null>(null);
  const [pendingStart, setPendingStart] = useState<{
    routine?: Routine;
    customName: string;
  } | null>(null);

  useEffect(() => {
    loadRoutines();
  }, []);

  useReloadOnActivate(() => void loadRoutines());

  const loadRoutines = async () => {
    const [list, history] = await Promise.all([getRoutines(), getWorkoutHistory()]);
    setRoutines(list);
    setWeek(buildWeekSnapshot(history));
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
      const [gymList] = await Promise.all([getGyms(), refreshGyms()]);
      // With a single gym there is nothing to choose, so start straight away.
      if (gymList.length <= 1) {
        await startWorkout(routine, customName, undefined, { gymId: resolveInitialStartGymId(gymList) });
        return;
      }
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

  const openEditor = (routine: Routine | null) => {
    setRoutineToEdit(routine);
    setShowEditor(true);
  };

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <View style={styles.container}>
      <ScreenHeader
        eyebrow={todayLabel}
        title="Workout"
        right={
          <IconButton
            icon={Settings2}
            onPress={() => setShowSettings(true)}
            accessibilityLabel="Open settings"
          />
        }
      />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* This week */}
        {week && (
          <View style={styles.weekCard}>
            <View style={styles.weekHeader}>
              <Text style={styles.weekTitle}>This week</Text>
              {week.streakWeeks > 1 && (
                <View style={styles.streakPill}>
                  <Flame size={13} color={colors.warning} />
                  <Text style={styles.streakText}>{week.streakWeeks} week streak</Text>
                </View>
              )}
            </View>
            <View style={styles.weekDays}>
              {week.days.map(day => (
                <View key={day.dateKey} style={styles.weekDay}>
                  <View
                    style={[
                      styles.weekDot,
                      day.trained && styles.weekDotTrained,
                      day.isToday && !day.trained && styles.weekDotToday,
                    ]}
                  >
                    {day.trained && <Check size={14} color={colors.onPrimary} strokeWidth={3} />}
                  </View>
                  <Text style={[styles.weekDayLabel, day.isToday && styles.weekDayLabelToday]}>
                    {day.label}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.weekStats}>
              <View style={styles.weekStat}>
                <Text style={styles.weekStatValue}>{week.workouts}</Text>
                <Text style={styles.weekStatLabel}>{week.workouts === 1 ? 'workout' : 'workouts'}</Text>
              </View>
              <View style={styles.weekStat}>
                <Text style={styles.weekStatValue}>{formatWeight(week.volumeKg, unit)}</Text>
                <Text style={styles.weekStatLabel}>volume</Text>
              </View>
              <View style={styles.weekStat}>
                <Text style={styles.weekStatValue}>
                  {week.durationSeconds >= 3600
                    ? `${(week.durationSeconds / 3600).toFixed(1)}h`
                    : `${Math.round(week.durationSeconds / 60)}m`}
                </Text>
                <Text style={styles.weekStatLabel}>trained</Text>
              </View>
            </View>
          </View>
        )}

        {/* Quick Start */}
        <TouchableOpacity
          style={styles.quickStartCard}
          onPress={handleStartEmpty}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Start empty workout"
        >
          <View style={styles.quickStartIcon}>
            <Play size={20} color={colors.primary} fill={colors.primary} />
          </View>
          <View style={styles.quickStartInfo}>
            <Text style={styles.quickStartTitle}>Start Empty Workout</Text>
            <Text style={styles.quickStartSubtitle}>Log exercises as you go</Text>
          </View>
          <ChevronRight size={20} color={colors.onPrimary} />
        </TouchableOpacity>

        {/* Routines */}
        <SectionHeader
          title="Routines"
          meta={routines.length > 0 ? String(routines.length) : undefined}
          actionLabel="+ New"
          onAction={() => openEditor(null)}
          style={styles.sectionHeader}
        />

        {folders.length > 1 && (
          <View style={styles.folderChipsHeader}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.folderChipsContainer}
              style={styles.folderChipsScroll}
            >
              {folders.map(f => (
                <Chip
                  key={f}
                  label={f}
                  selected={selectedFolder === f}
                  onPress={() => setSelectedFolder(f)}
                  leading={
                    f !== 'All' ? (
                      <Folder size={13} color={selectedFolder === f ? colors.bg : colors.textMuted} />
                    ) : undefined
                  }
                />
              ))}
            </ScrollView>
            <IconButton
              icon={FolderCog}
              size={36}
              iconSize={17}
              onPress={() => setShowFolderManage(true)}
              accessibilityLabel="Manage folders"
            />
          </View>
        )}

        {filteredRoutines.map(routine => {
          const hasSupersets = getSupersetMetadata(routine.exercises).size > 0;
          const exerciseCount = routine.exercises.length;
          const setCount = routine.exercises.reduce((sum, re) => sum + (re.targetSets || 0), 0);
          const preview = routine.exercises.map(re => re.exercise.name).join(' · ');

          return (
            <View key={routine.id} style={styles.routineCard}>
              <View style={styles.routineCardHeader}>
                <View style={styles.routineTitleGroup}>
                  <Text style={styles.routineName} numberOfLines={2}>
                    {routine.name}
                  </Text>
                  <View style={styles.routineMetaRow}>
                    <Text style={styles.routineMeta}>
                      {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'} · {setCount} sets
                    </Text>
                    {routine.folderName && selectedFolder === 'All' && (
                      <View style={styles.metaTag}>
                        <Folder size={11} color={colors.textMuted} />
                        <Text style={styles.metaTagText}>{routine.folderName}</Text>
                      </View>
                    )}
                    {hasSupersets && (
                      <View style={[styles.metaTag, styles.supersetTag]}>
                        <Layers size={11} color={colors.purpleLight} />
                        <Text style={[styles.metaTagText, { color: colors.purpleLight }]}>Supersets</Text>
                      </View>
                    )}
                  </View>
                </View>

                <IconButton
                  icon={MoreHorizontal}
                  tone="ghost"
                  size={34}
                  onPress={() => setMenuRoutine(routine)}
                  accessibilityLabel={`${routine.name} options`}
                />
              </View>

              {preview.length > 0 && (
                <Text style={styles.exPreview} numberOfLines={2}>
                  {preview}
                </Text>
              )}

              <TouchableOpacity
                style={styles.startRoutineBtn}
                onPress={() => handleStartRoutine(routine)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Start ${routine.name}`}
              >
                <Play size={15} color={colors.primaryLight} fill={colors.primaryLight} />
                <Text style={styles.startRoutineBtnText}>Start Routine</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {routines.length === 0 ? (
          <TouchableOpacity
            style={styles.emptyRoutinesBox}
            onPress={() => openEditor(null)}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <View style={styles.emptyIcon}>
              <Plus size={22} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Create your first routine</Text>
            <Text style={styles.emptyText}>Save your go-to workouts and start them in one tap.</Text>
          </TouchableOpacity>
        ) : filteredRoutines.length === 0 ? (
          <View style={styles.emptyFolderBox}>
            <Text style={styles.emptyText}>No routines in this folder.</Text>
          </View>
        ) : null}
      </ScrollView>

      <ActionSheet
        visible={menuRoutine !== null}
        title={menuRoutine?.name}
        subtitle={menuRoutine?.folderName || undefined}
        onClose={() => setMenuRoutine(null)}
        actions={
          menuRoutine
            ? [
                { key: 'edit', label: 'Edit Routine', icon: Edit2, onPress: () => openEditor(menuRoutine) },
                {
                  key: 'duplicate',
                  label: 'Duplicate',
                  icon: Copy,
                  onPress: () => handleDuplicateRoutine(menuRoutine),
                },
                {
                  key: 'delete',
                  label: 'Delete Routine',
                  icon: Trash2,
                  destructive: true,
                  onPress: () => handleDeleteRoutine(menuRoutine),
                },
              ]
            : []
        }
      />

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
    backgroundColor: colors.bg,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 120,
  },
  quickStartCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  quickStartIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  quickStartInfo: {
    flex: 1,
  },
  quickStartTitle: {
    color: colors.onPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  quickStartSubtitle: {
    color: colors.onPrimary,
    opacity: 0.75,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  sectionHeader: {
    paddingHorizontal: 4,
  },
  folderChipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  folderChipsScroll: {
    flex: 1,
  },
  folderChipsContainer: {
    gap: 8,
    paddingRight: 8,
  },
  routineCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  routineCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  routineTitleGroup: {
    flex: 1,
    marginRight: 8,
  },
  routineName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  routineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  routineMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  metaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  supersetTag: {
    backgroundColor: colors.purpleSoft,
  },
  metaTagText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  exPreview: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  startRoutineBtn: {
    backgroundColor: colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radii.md,
    gap: 8,
  },
  startRoutineBtnText: {
    color: colors.primaryLight,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyRoutinesBox: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyFolderBox: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  weekCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  weekTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  streakText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '700',
  },
  weekDays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  weekDay: {
    alignItems: 'center',
    gap: 6,
  },
  weekDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDotTrained: {
    backgroundColor: colors.primary,
  },
  weekDotToday: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  weekDayLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  weekDayLabelToday: {
    color: colors.text,
  },
  weekStats: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    paddingTop: 12,
  },
  weekStat: {
    flex: 1,
  },
  weekStatValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  weekStatLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
});

/** Memoized so hidden (kept-alive) tabs skip re-rendering when the app shell updates. */
export const WorkoutScreen = React.memo(WorkoutScreenInner);
