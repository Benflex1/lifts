import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
} from 'react-native';
import {
  Calculator,
  Award,
  Dumbbell,
  Download,
  Upload,
  Share2,
  FileSpreadsheet,
  Trophy,
  Search,
  ChevronRight,
  X,
  Flame,
  Zap,
  TrendingUp,
  Layers,
  PieChart,
  Calendar,
} from 'lucide-react-native';
import { calculate1RM } from '../utils/calculator';
import { PlateCalculatorModal } from '../components/PlateCalculatorModal';
import { getStore, getAllExercises } from '../database/db';
import { useSettings } from '../context/SettingsContext';
import { useWorkout } from '../context/WorkoutContext';
import { formatWeight, displayToKg, kgToDisplay } from '../utils/units';
import { exportBackup } from '../utils/export';
import { saveBackupToFiles } from '../utils/saveBackup';
import { pickBackupJson } from '../utils/pickBackup';
import { parseBackup } from '../utils/backup';
import { computeRestorePlan } from '../utils/restore';
import { useDialog } from '../context/DialogContext';
import { Exercise, ExerciseGymScope, Gym, Workout } from '../types';
import {
  MuscleFrequencyPoint,
  WeeklyVolumePoint,
  buildMuscleFrequency,
  buildWeeklyVolume,
  extractExerciseProgression,
  buildTrainingDistribution,
  buildRepRangeDistribution,
  buildConsistencySummary,
  buildLifetimeTrainingStats,
  ProgressionMetric,
  TimeframeFilter,
} from '../workout/analytics';
import { ProgressionCurveView } from '../components/ProgressionCurveView';
import { ExercisePickerModal } from '../components/ExercisePickerModal';
import { ExerciseDetailModal } from '../components/ExerciseDetailModal';
import { pickCsvFile, computeCsvImportPlan, CsvImportPreview } from '../utils/importer';
import { detectEquipmentHint, inferPrimaryMuscle } from '../utils/importer/exercise-mapper';
import { createScopedId } from '../utils/ids';
import { CsvImportModal } from '../components/CsvImportModal';
import { buildTrophyRoomSummary, ExerciseRecordSummary, TrophyRoomSummary } from '../workout/trophy-room';
import { ExercisePodium, extractExercisePodium } from '../workout/pr';
import { ExercisePodiumView } from '../components/ExercisePodiumView';
import { getAllowedGymIds } from '../workout/gym-scope';
import { colors } from '../theme';
import { Chip, Medal, ScreenHeader, SegmentedControl } from '../components/ui';

type ProgressSection = 'overview' | 'records' | 'tools';

const PROGRESS_SECTIONS: { key: ProgressSection; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'records', label: 'Records' },
  { key: 'tools', label: 'Tools' },
];

export const AnalyticsScreen: React.FC = () => {
  const { unit, gymTrackingEnabled } = useSettings();
  const { isWorkingOut } = useWorkout();
  const { confirm, notify } = useDialog();

  // Navigation section: Analytics charts vs Trophy Room
  const [activeSection, setActiveSection] = useState<ProgressSection>('overview');

  // Trophy room states
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([]);
  const [allExerciseList, setAllExerciseList] = useState<Exercise[]>([]);
  const [exerciseScopes, setExerciseScopes] = useState<Record<string, ExerciseGymScope | undefined>>({});
  const [trophyGymId, setTrophyGymId] = useState<string | null>(null);
  const [trophyCategory, setTrophyCategory] = useState<string>('all');
  const [trophySearch, setTrophySearch] = useState<string>('');

  // Selected exercise detail modal in Trophy Room
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const [detailPodium, setDetailPodium] = useState<ExercisePodium | null>(null);

  // 1RM calculator state
  const [weight, setWeight] = useState('100');
  const [reps, setReps] = useState('5');
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [hasWorkoutData, setHasWorkoutData] = useState(false);
  const [weeklyVolume, setWeeklyVolume] = useState<WeeklyVolumePoint[]>([]);
  const [muscleFrequency, setMuscleFrequency] = useState<MuscleFrequencyPoint[]>([]);

  // Progression states
  const [selectedProgressionExerciseId, setSelectedProgressionExerciseId] = useState<string | null>(null);
  const [progressionTimeframe, setProgressionTimeframe] = useState<TimeframeFilter>('ALL');
  const [progressionMetric, setProgressionMetric] = useState<ProgressionMetric>('e1rm');
  const [progressionGymFilter, setProgressionGymFilter] = useState<string | null>(null);
  const [showProgressionPicker, setShowProgressionPicker] = useState(false);

  // CSV Import State
  const [csvPreview, setCsvPreview] = useState<CsvImportPreview | null>(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvRawText, setCsvRawText] = useState('');
  const [csvGymId, setCsvGymId] = useState('');
  const [csvSkipDuplicates, setCsvSkipDuplicates] = useState(true);
  const [csvExerciseOverrides, setCsvExerciseOverrides] = useState<Record<string, Exercise>>({});
  const [isCsvImporting, setIsCsvImporting] = useState(false);
  const [allGyms, setAllGyms] = useState<Gym[]>([]);

  const loadAnalytics = React.useCallback(async () => {
    try {
      const store = await getStore();
      const snapshot = await store.readSnapshot();

      const workouts: Workout[] = snapshot.workouts || [];
      const gymsList: Gym[] = snapshot.gyms || [];
      const allExercisesList = await getAllExercises();

      setAllWorkouts(workouts);
      setAllGyms(gymsList);
      setAllExerciseList(allExercisesList);

      const scopesMap: Record<string, ExerciseGymScope | undefined> = {};
      (snapshot.exerciseGymScopes || []).forEach((s) => {
        scopesMap[s.exerciseId] = s;
      });
      setExerciseScopes(scopesMap);

      setHasWorkoutData(workouts.length > 0);
      setWeeklyVolume(buildWeeklyVolume(workouts));
      setMuscleFrequency(buildMuscleFrequency(workouts, { exerciseCatalog: allExercisesList }));

      if (workouts.length > 0) {
        let foundExerciseId: string | null = null;
        for (const w of workouts) {
          for (const ex of w.exercises || []) {
            if ((ex.sets || []).some((s) => s.isCompleted)) {
              foundExerciseId = ex.exerciseId;
              break;
            }
          }
          if (foundExerciseId) break;
        }
        if (foundExerciseId) {
          setSelectedProgressionExerciseId((prev) => prev || foundExerciseId);
        }
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const progressionExercise = useMemo(() => {
    if (!selectedProgressionExerciseId) {
      return allExerciseList[0] || null;
    }
    return allExerciseList.find((e) => e.id === selectedProgressionExerciseId) || null;
  }, [allExerciseList, selectedProgressionExerciseId]);

  const progressionSeries = useMemo(() => {
    if (!progressionExercise || allWorkouts.length === 0) return null;
    const gymNames = new Map(allGyms.map((g) => [g.id, g.name]));
    const allowedGymIds = progressionGymFilter ? [progressionGymFilter] : undefined;
    return extractExerciseProgression(allWorkouts, progressionExercise.id, {
      allowedGymIds,
      timeframe: progressionTimeframe,
      gymNamesMap: gymNames,
    });
  }, [progressionExercise, allWorkouts, progressionGymFilter, progressionTimeframe, allGyms]);

  const [dashboardTimeframe, setDashboardTimeframe] = useState<TimeframeFilter>('ALL');
  const [distMode, setDistMode] = useState<'volume' | 'sets'>('volume');

  const lifetimeStats = useMemo(() => {
    if (allWorkouts.length === 0) return null;
    return buildLifetimeTrainingStats(allWorkouts);
  }, [allWorkouts]);

  const trainingDistribution = useMemo(() => {
    if (allWorkouts.length === 0) return [];
    return buildTrainingDistribution(allWorkouts, dashboardTimeframe);
  }, [allWorkouts, dashboardTimeframe]);

  const repRangeDistribution = useMemo(() => {
    if (allWorkouts.length === 0) return null;
    return buildRepRangeDistribution(allWorkouts, dashboardTimeframe);
  }, [allWorkouts, dashboardTimeframe]);

  const consistencySummary = useMemo(() => {
    if (allWorkouts.length === 0) return null;
    return buildConsistencySummary(allWorkouts, new Date(), 12);
  }, [allWorkouts]);

  const trophySummary = useMemo(() => {
    if (allWorkouts.length === 0) return null;
    return buildTrophyRoomSummary(
      allWorkouts,
      allExerciseList,
      allGyms,
      gymTrackingEnabled,
      exerciseScopes,
      {
        selectedGymId: trophyGymId,
        categoryFilter: trophyCategory,
        searchQuery: trophySearch,
      }
    );
  }, [
    allWorkouts,
    allExerciseList,
    allGyms,
    gymTrackingEnabled,
    exerciseScopes,
    trophyGymId,
    trophyCategory,
    trophySearch,
  ]);

  const handleOpenRecordDetail = (record: ExerciseRecordSummary) => {
    const ex = allExerciseList.find((e) => e.id === record.exerciseId);
    if (!ex) return;
    setDetailExercise(ex);
  };

  const numWeight = displayToKg(parseFloat(weight) || 0, unit);
  const numReps = parseInt(reps, 10) || 1;
  const oneRM = calculate1RM(numWeight, numReps);

  const percentages = [
    { pct: 95, reps: '2 reps', load: Math.round(oneRM.average * 0.95) },
    { pct: 90, reps: '4 reps', load: Math.round(oneRM.average * 0.9) },
    { pct: 85, reps: '6 reps', load: Math.round(oneRM.average * 0.85) },
    { pct: 80, reps: '8 reps', load: Math.round(oneRM.average * 0.8) },
    { pct: 75, reps: '10 reps', load: Math.round(oneRM.average * 0.75) },
    { pct: 70, reps: '12 reps', load: Math.round(oneRM.average * 0.7) },
  ];

  const handleExportData = async () => {
    try {
      await exportBackup();
      await notify({ title: 'Export Complete', message: 'Your workout data has been exported.' });
    } catch (e: any) {
      await notify({
        title: 'Export Error',
        message: e?.message ? `Failed to export data: ${e.message}` : 'Failed to export data. Please try again.',
      });
    }
  };

  const handleSaveData = async () => {
    try {
      const result = await saveBackupToFiles();
      if (result === 'cancelled') return;
      await notify({ title: 'Backup Saved', message: 'Your workout data was saved to the selected file location.' });
    } catch (e: any) {
      await notify({
        title: 'Save Error',
        message: e?.message ? `Failed to save data: ${e.message}` : 'Failed to save data. Please try again.',
      });
    }
  };

  const handleImportData = async () => {
    if (isWorkingOut) {
      await notify({
        title: 'Session In Progress',
        message: 'Cannot restore backup while a workout session is active. Please finish or discard your current workout first.',
      });
      return;
    }

    try {
      const json = await pickBackupJson();
      if (!json) return;

      const backup = parseBackup(json);
      const store = await getStore();
      const { preview, snapshotToMerge } = await computeRestorePlan(backup, store);

      const message =
        `Backup Summary:\n` +
        `• ${preview.gymsCount} gyms to import\n` +
        `• ${preview.scopeOverridesCount} exercise scope overrides to import\n` +
        `• ${preview.workoutsCount} workouts to import (${preview.skippedWorkoutsCount} identical skipped)\n` +
        `• ${preview.routinesCount} routines to import (${preview.skippedRoutinesCount} identical skipped)\n` +
        `• ${preview.customExercisesCount} custom exercises to import\n` +
        `• ${preview.draftsCount} drafts to import\n` +
        `• ${preview.newSettingsCount} new settings keys (existing settings preserved)\n\n` +
        `Proceed with merging this backup?`;

      const proceed = await confirm({
        title: 'Restore Backup',
        message,
        confirmLabel: 'Restore',
        cancelLabel: 'Cancel',
      });

      if (!proceed) return;

      await store.mergeSnapshot(snapshotToMerge);
      await notify({
        title: 'Restore Complete',
        message: 'Your backup data has been successfully merged.',
      });
    } catch (err: any) {
      await notify({
        title: 'Restore Failed',
        message: err?.message || 'An error occurred during restore. No data was changed.',
      });
    }
  };

  const handleImportCsv = async () => {
    if (isWorkingOut) {
      await notify({
        title: 'Session In Progress',
        message: 'Cannot import workouts while a workout session is active. Please finish or discard your current workout first.',
      });
      return;
    }

    try {
      const picked = await pickCsvFile();
      if (!picked) return;

      const store = await getStore();
      const [snapshot, gymsList, defaultGym] = await Promise.all([
        store.readSnapshot(),
        store.getGyms(),
        store.getDefaultGym(),
      ]);

      const targetGym = defaultGym.id || gymsList[0]?.id || 'gym-default';
      setAllGyms(gymsList);
      setCsvGymId(targetGym);
      setCsvFileName(picked.name);
      setCsvRawText(picked.content);
      setCsvSkipDuplicates(true);
      setCsvExerciseOverrides({});

      const plan = computeCsvImportPlan(picked.content, snapshot, {
        targetGymId: targetGym,
        skipExistingWorkouts: true,
        defaultUnit: unit,
      });

      setCsvPreview(plan);
    } catch (err: any) {
      await notify({
        title: 'Import Failed',
        message: err?.message || 'Failed to read or parse the selected CSV file.',
      });
    }
  };

  const handleAssignExercise = async (rawName: string, exercise: Exercise) => {
    const updated = { ...csvExerciseOverrides, [rawName]: exercise };
    setCsvExerciseOverrides(updated);
    if (!csvRawText) return;
    try {
      const store = await getStore();
      const snapshot = await store.readSnapshot();
      const plan = computeCsvImportPlan(csvRawText, snapshot, {
        targetGymId: csvGymId,
        skipExistingWorkouts: csvSkipDuplicates,
        defaultUnit: unit,
        exerciseOverrides: updated,
      });
      setCsvPreview(plan);
    } catch (err) {
      console.error('Failed to recompute plan after exercise assignment:', err);
    }
  };

  const handleSetCustomExercise = async (rawName: string) => {
    const customId = createScopedId('custom-ex');
    const customEx: Exercise = {
      id: customId,
      name: rawName.trim(),
      category: 'strength',
      equipment: detectEquipmentHint(rawName) || 'other',
      primaryMuscles: inferPrimaryMuscle(rawName),
      secondaryMuscles: [],
      instructions: [],
      isCustom: true,
    };
    const updated = { ...csvExerciseOverrides, [rawName]: customEx };
    setCsvExerciseOverrides(updated);
    if (!csvRawText) return;
    try {
      const store = await getStore();
      const snapshot = await store.readSnapshot();
      const plan = computeCsvImportPlan(csvRawText, snapshot, {
        targetGymId: csvGymId,
        skipExistingWorkouts: csvSkipDuplicates,
        defaultUnit: unit,
        exerciseOverrides: updated,
      });
      setCsvPreview(plan);
    } catch (err) {
      console.error('Failed to recompute plan after setting custom exercise:', err);
    }
  };

  const handleSelectCsvGym = async (gymId: string) => {
    setCsvGymId(gymId);
    if (!csvRawText) return;
    try {
      const store = await getStore();
      const snapshot = await store.readSnapshot();
      const plan = computeCsvImportPlan(csvRawText, snapshot, {
        targetGymId: gymId,
        skipExistingWorkouts: csvSkipDuplicates,
        defaultUnit: unit,
        exerciseOverrides: csvExerciseOverrides,
      });
      setCsvPreview(plan);
    } catch (err) {
      console.error('Failed to recompute plan with gym:', err);
    }
  };

  const handleToggleCsvSkipDuplicates = async (skip: boolean) => {
    setCsvSkipDuplicates(skip);
    if (!csvRawText) return;
    try {
      const store = await getStore();
      const snapshot = await store.readSnapshot();
      const plan = computeCsvImportPlan(csvRawText, snapshot, {
        targetGymId: csvGymId,
        skipExistingWorkouts: skip,
        defaultUnit: unit,
        exerciseOverrides: csvExerciseOverrides,
      });
      setCsvPreview(plan);
    } catch (err) {
      console.error('Failed to recompute plan with duplicate toggle:', err);
    }
  };

  const handleConfirmCsvImport = async () => {
    if (!csvPreview) return;
    setIsCsvImporting(true);
    try {
      const store = await getStore();
      await store.mergeSnapshot(csvPreview.snapshotToMerge);
      const snapshot = await store.readSnapshot();
      const workouts: Workout[] = snapshot.workouts || [];
      setHasWorkoutData(workouts.length > 0);
      setWeeklyVolume(buildWeeklyVolume(workouts));
      const allExercisesList = await getAllExercises();
      setAllExerciseList(allExercisesList);
      setMuscleFrequency(buildMuscleFrequency(workouts, { exerciseCatalog: allExercisesList }));

      const importedCount = csvSkipDuplicates ? csvPreview.newWorkoutsCount : csvPreview.totalWorkouts;
      setCsvPreview(null);
      await notify({
        title: 'Import Complete',
        message: `Successfully imported ${importedCount} workouts and ${csvPreview.totalSets} sets from ${csvPreview.formatLabel}.`,
      });
    } catch (err: any) {
      await notify({
        title: 'Import Failed',
        message: err?.message || 'Failed to import workouts. No changes were made.',
      });
    } finally {
      setIsCsvImporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Progress">
        <SegmentedControl
          options={PROGRESS_SECTIONS}
          value={activeSection}
          onChange={setActiveSection}
          style={styles.sectionSwitcher}
        />
      </ScreenHeader>

      {activeSection === 'records' ? (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Trophy Room Hero Banner */}
          <View style={styles.trophyHeroCard}>
            <View style={styles.trophyHeroHeader}>
              <Trophy size={18} color={colors.warning} />
              <Text style={styles.trophyHeroTitle}>ALL-TIME RECORDS</Text>
            </View>
            <View style={styles.medalTallyRow}>
              <View style={styles.medalTallyBox}>
                <Medal rank={1} size={22} />
                <Text style={[styles.medalTallyCount, { color: colors.gold }]}>{trophySummary?.totalGold ?? 0}</Text>
                <Text style={styles.medalTallyLabel}>GOLD</Text>
              </View>
              <View style={styles.medalTallyBox}>
                <Medal rank={2} size={22} />
                <Text style={[styles.medalTallyCount, { color: colors.text }]}>{trophySummary?.totalSilver ?? 0}</Text>
                <Text style={styles.medalTallyLabel}>SILVER</Text>
              </View>
              <View style={styles.medalTallyBox}>
                <Medal rank={3} size={22} />
                <Text style={[styles.medalTallyCount, { color: '#FED7AA' }]}>{trophySummary?.totalBronze ?? 0}</Text>
                <Text style={styles.medalTallyLabel}>BRONZE</Text>
              </View>
              <View style={styles.medalTallyBox}>
                <Trophy size={20} color={colors.primaryLight} />
                <Text style={[styles.medalTallyCount, { color: colors.primary }]}>{trophySummary?.totalRecords ?? 0}</Text>
                <Text style={styles.medalTallyLabel}>TOTAL</Text>
              </View>
            </View>
          </View>

          {/* SBD / Compound Highlights Card */}
          {trophySummary && trophySummary.sbdTotalKg > 0 && (
            <View style={styles.sbdCard}>
              <View style={styles.sbdHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sbdTitle}>POWERLIFTING TOTAL</Text>
                  <Text style={styles.sbdSubtitle}>Best estimated 1RM across Big 3</Text>
                </View>
                <View style={styles.sbdBadge}>
                  <Text style={styles.sbdTotalText}>{formatWeight(trophySummary.sbdTotalKg, unit)}</Text>
                </View>
              </View>

              <View style={styles.sbdGrid}>
                {trophySummary.sbdBreakdown.squat && (
                  <View style={styles.sbdCol}>
                    <Text style={styles.sbdLiftName}>SQUAT</Text>
                    <Text style={styles.sbdLiftVal}>{formatWeight(trophySummary.sbdBreakdown.squat.oneRMKg, unit)}</Text>
                    <Text style={styles.sbdLiftSub}>
                      {formatWeight(trophySummary.sbdBreakdown.squat.weightKg, unit)} × {trophySummary.sbdBreakdown.squat.reps}
                    </Text>
                  </View>
                )}
                {trophySummary.sbdBreakdown.bench && (
                  <View style={styles.sbdCol}>
                    <Text style={styles.sbdLiftName}>BENCH</Text>
                    <Text style={styles.sbdLiftVal}>{formatWeight(trophySummary.sbdBreakdown.bench.oneRMKg, unit)}</Text>
                    <Text style={styles.sbdLiftSub}>
                      {formatWeight(trophySummary.sbdBreakdown.bench.weightKg, unit)} × {trophySummary.sbdBreakdown.bench.reps}
                    </Text>
                  </View>
                )}
                {trophySummary.sbdBreakdown.deadlift && (
                  <View style={styles.sbdCol}>
                    <Text style={styles.sbdLiftName}>DEADLIFT</Text>
                    <Text style={styles.sbdLiftVal}>{formatWeight(trophySummary.sbdBreakdown.deadlift.oneRMKg, unit)}</Text>
                    <Text style={styles.sbdLiftSub}>
                      {formatWeight(trophySummary.sbdBreakdown.deadlift.weightKg, unit)} × {trophySummary.sbdBreakdown.deadlift.reps}
                    </Text>
                  </View>
                )}
                {trophySummary.sbdBreakdown.overheadPress && (
                  <View style={styles.sbdCol}>
                    <Text style={styles.sbdLiftName}>OHP</Text>
                    <Text style={styles.sbdLiftVal}>{formatWeight(trophySummary.sbdBreakdown.overheadPress.oneRMKg, unit)}</Text>
                    <Text style={styles.sbdLiftSub}>
                      {formatWeight(trophySummary.sbdBreakdown.overheadPress.weightKg, unit)} × {trophySummary.sbdBreakdown.overheadPress.reps}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Filters & Search */}
          <View style={styles.trophyFiltersSection}>
            {/* Search Input */}
            <View style={styles.trophySearchRow}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                style={styles.trophySearchInput}
                placeholder="Search records"
                placeholderTextColor={colors.textMuted}
                value={trophySearch}
                onChangeText={setTrophySearch}
              />
              {trophySearch.length > 0 && (
                <TouchableOpacity onPress={() => setTrophySearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Gym filter pills */}
            {gymTrackingEnabled && allGyms.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillsScroll}
                contentContainerStyle={styles.pillsContent}
              >
                <Chip
                  size="sm"
                  label="All Gyms"
                  selected={trophyGymId === null}
                  onPress={() => setTrophyGymId(null)}
                />
                {allGyms.map((g) => (
                  <Chip
                    key={g.id}
                    size="sm"
                    label={g.name}
                    selected={trophyGymId === g.id}
                    onPress={() => setTrophyGymId(g.id)}
                  />
                ))}
              </ScrollView>
            )}

            {/* Category filter pills */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillsScroll}
                contentContainerStyle={styles.pillsContent}
              >
              {['all', 'chest', 'back', 'legs', 'shoulders', 'arms', 'core'].map((cat) => (
                <Chip
                  key={cat}
                  size="sm"
                  label={cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                  selected={trophyCategory === cat}
                  onPress={() => setTrophyCategory(cat)}
                />
              ))}
            </ScrollView>
          </View>

          {/* Records List */}
          {trophySummary && trophySummary.records.length > 0 ? (
            trophySummary.records.map((record) => {
              const dateStr = record.bestWeight?.date || record.bestReps?.date;
              const formattedDate = dateStr
                ? new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
                : '';

              return (
                <TouchableOpacity
                  key={record.exerciseId}
                  style={styles.recordCard}
                  onPress={() => handleOpenRecordDetail(record)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${record.exerciseName} record details`}
                >
                  <View style={styles.recordCardMain}>
                    <View style={styles.recordCardHeader}>
                      <Text style={styles.recordExerciseName}>{record.exerciseName}</Text>
                      <View style={styles.recordBadgeRow}>
                        <View style={styles.recordPill}>
                          <Text style={styles.recordPillText}>
                            {(record.primaryMuscles && record.primaryMuscles.length > 0
                              ? record.primaryMuscles[0]
                              : record.category
                            )}
                          </Text>
                        </View>
                        <View style={styles.recordPill}>
                          <Text style={styles.recordPillText}>{record.equipment}</Text>
                        </View>
                        {gymTrackingEnabled && record.bestWeight?.gymName && (
                          <View style={styles.recordGymBadge}>
                            <Text style={styles.recordGymText}>{record.bestWeight.gymName}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.recordMetricsGrid}>
                      {record.bestWeight && (
                        <View style={styles.recordMetricBox}>
                          <Text style={styles.recordMetricLabel}>Heaviest set</Text>
                          <Text style={styles.recordMetricVal}>
                            {formatWeight(record.bestWeight.value, unit)} × {record.bestWeight.reps}
                          </Text>
                        </View>
                      )}

                      {record.best1RM && (
                        <View style={styles.recordMetricBox}>
                          <Text style={styles.recordMetricLabel}>Est. 1RM</Text>
                          <Text style={styles.recordMetricVal}>{formatWeight(record.best1RM.value, unit)}</Text>
                        </View>
                      )}

                      {record.bestVolume && (
                        <View style={styles.recordMetricBox}>
                          <Text style={styles.recordMetricLabel}>Best volume</Text>
                          <Text style={styles.recordMetricVal}>{formatWeight(record.bestVolume.value, unit)}</Text>
                        </View>
                      )}

                      {record.bestReps && (
                        <View style={styles.recordMetricBox}>
                          <Text style={styles.recordMetricLabel}>Max reps</Text>
                          <Text style={styles.recordMetricVal}>{record.bestReps.value} reps</Text>
                        </View>
                      )}
                    </View>

                    {formattedDate.length > 0 && (
                      <Text style={styles.recordDateText}>Set on {formattedDate}</Text>
                    )}
                  </View>

                  <ChevronRight size={18} color={colors.textMuted} />
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyTrophyCard}>
              <Trophy size={32} color={colors.textFaint} />
              <Text style={styles.emptyTrophyTitle}>No records found</Text>
              <Text style={styles.emptyTrophySubtitle}>
                {trophySearch || trophyCategory !== 'all'
                  ? 'Try clearing search or category filters.'
                  : 'Log completed workouts to start building your personal record trophy room!'}
              </Text>
            </View>
          )}
        </ScrollView>
      ) : activeSection === 'overview' ? (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        {/* Progress Charts */}
        {analyticsLoading ? (
          <View style={styles.chartLoading}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.chartLoadingText}>Loading progress...</Text>
          </View>
        ) : hasWorkoutData ? (
          <>
            {/* Lifetime Training Overview Banner */}
            {lifetimeStats && (
              <View style={styles.lifetimeHeroCard}>
                <View style={styles.lifetimeHeroHeader}>
                  <TrendingUp size={18} color={colors.primary} />
                  <Text style={styles.lifetimeHeroTitle}>LIFETIME TRAINING SUMMARY</Text>
                </View>
                <View style={styles.lifetimeGrid}>
                  <View style={styles.lifetimeTile}>
                    <Text style={styles.lifetimeTileVal}>{lifetimeStats.totalWorkouts}</Text>
                    <Text style={styles.lifetimeTileLabel}>WORKOUTS</Text>
                    <Text style={styles.lifetimeTileSub}>
                      {lifetimeStats.workoutsThisWeek} this week
                    </Text>
                  </View>
                  <View style={styles.lifetimeTile}>
                    <Text style={styles.lifetimeTileVal}>
                      {formatWeight(lifetimeStats.totalVolumeKg, unit)}
                    </Text>
                    <Text style={styles.lifetimeTileLabel}>TOTAL VOLUME</Text>
                    <Text style={styles.lifetimeTileSub}>
                      {formatWeight(lifetimeStats.volumeThisWeekKg, unit)} this wk
                    </Text>
                  </View>
                  <View style={styles.lifetimeTile}>
                    <Text style={styles.lifetimeTileVal}>
                      {lifetimeStats.totalDurationMinutes >= 60
                        ? `${(lifetimeStats.totalDurationMinutes / 60).toFixed(1)}h`
                        : `${lifetimeStats.totalDurationMinutes}m`}
                    </Text>
                    <Text style={styles.lifetimeTileLabel}>TIME TRAINED</Text>
                    <Text style={styles.lifetimeTileSub}>
                      {lifetimeStats.totalWorkouts > 0
                        ? `~${Math.round(lifetimeStats.totalDurationMinutes / lifetimeStats.totalWorkouts)}m / session`
                        : '—'}
                    </Text>
                  </View>
                  <View style={styles.lifetimeTile}>
                    <Text style={styles.lifetimeTileVal}>{lifetimeStats.totalSets}</Text>
                    <Text style={styles.lifetimeTileLabel}>SETS LOGGED</Text>
                    <Text style={styles.lifetimeTileSub}>
                      {lifetimeStats.totalReps.toLocaleString()} reps
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.toolCard}>
              <View style={styles.toolHeader}>
                <Dumbbell size={18} color={colors.primary} />
                <Text style={styles.toolTitle}>Weekly Volume</Text>
              </View>
              <Text style={styles.toolSubtitle}>Total completed-set volume over the last eight weeks.</Text>
              <View style={styles.volumeChart}>
                {weeklyVolume.map(point => {
                  const maxVolume = Math.max(1, ...weeklyVolume.map(item => item.volumeKg));
                  const barHeight = point.volumeKg > 0
                    ? Math.max(6, (point.volumeKg / maxVolume) * 112)
                    : 4;
                  return (
                    <View key={point.key} style={styles.volumeColumn}>
                      <View style={styles.volumeBarTrack}>
                        <View
                          style={[
                            styles.volumeBar,
                            { height: barHeight },
                            point.volumeKg <= 0 && styles.volumeBarEmpty,
                          ]}
                        />
                      </View>
                      <Text style={styles.volumeLabel}>{point.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {muscleFrequency.length > 0 && (
              <View style={styles.toolCard}>
                <View style={styles.toolHeader}>
                  <Award size={18} color={colors.primary} />
                  <Text style={styles.toolTitle}>Muscle Frequency</Text>
                </View>
                <Text style={styles.toolSubtitle}>Workouts that trained each muscle by primary or secondary role.</Text>
                <View style={styles.muscleLegend}>
                  <View style={styles.muscleLegendItem}>
                    <View style={[styles.muscleLegendSwatch, styles.musclePrimaryBar]} />
                    <Text style={styles.muscleLegendText}>Primary</Text>
                  </View>
                  <View style={styles.muscleLegendItem}>
                    <View style={[styles.muscleLegendSwatch, styles.muscleSecondaryBar]} />
                    <Text style={styles.muscleLegendText}>Secondary</Text>
                  </View>
                </View>
                <View style={styles.muscleChart}>
                  {muscleFrequency.map(point => {
                    const maxCount = Math.max(1, ...muscleFrequency.map(item => item.count));
                    return (
                      <View key={point.muscle} style={styles.muscleRow}>
                        <View style={styles.muscleRowHeader}>
                          <Text style={styles.muscleName}>{point.muscle}</Text>
                          <Text style={styles.muscleCount}>{point.count}</Text>
                        </View>
                        <View style={styles.muscleBarTrack}>
                          {point.primaryCount > 0 && (
                            <View
                              style={[
                                styles.muscleBar,
                                styles.musclePrimaryBar,
                                { width: `${(point.primaryCount / maxCount) * 100}%` },
                              ]}
                            />
                          )}
                          {point.secondaryCount > 0 && (
                            <View
                              style={[
                                styles.muscleBar,
                                styles.muscleSecondaryBar,
                                { width: `${(point.secondaryCount / maxCount) * 100}%` },
                              ]}
                            />
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Consistency & Streaks */}
            {consistencySummary && (
              <View style={styles.toolCard}>
                <View style={styles.toolHeader}>
                  <Flame size={18} color={colors.primary} />
                  <Text style={styles.toolTitle}>Consistency & Streaks</Text>
                </View>
                <Text style={styles.toolSubtitle}>Your training rhythm over the last 12 weeks.</Text>

                <View style={styles.streakBadgesRow}>
                  <View style={styles.streakBadge}>
                    <View style={[styles.streakIcon, { backgroundColor: colors.dangerSoft }]}>
                      <Flame size={16} color={colors.danger} />
                    </View>
                    <View>
                      <Text style={styles.streakValue}>{consistencySummary.currentStreakWeeks} wk</Text>
                      <Text style={styles.streakLabel}>Current streak</Text>
                    </View>
                  </View>
                  <View style={styles.streakBadge}>
                    <View style={[styles.streakIcon, { backgroundColor: colors.warningSoft }]}>
                      <Trophy size={16} color={colors.gold} />
                    </View>
                    <View>
                      <Text style={styles.streakValue}>{consistencySummary.bestStreakWeeks} wk</Text>
                      <Text style={styles.streakLabel}>Best streak</Text>
                    </View>
                  </View>
                  <View style={styles.streakBadge}>
                    <View style={[styles.streakIcon, { backgroundColor: colors.primarySoft }]}>
                      <Zap size={16} color={colors.primaryLight} />
                    </View>
                    <View>
                      <Text style={styles.streakValue}>{consistencySummary.averageWorkoutsPerWeek}/wk</Text>
                      <Text style={styles.streakLabel}>12-week avg</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.consistencyHeatmap}>
                  {consistencySummary.weeks.map((week) => {
                    const active = week.workoutCount > 0;
                    return (
                      <View key={week.weekKey} style={styles.consistencyCol}>
                        <View
                          style={[
                            styles.consistencyDot,
                            active && styles.consistencyDotActive,
                            week.workoutCount >= 3 && styles.consistencyDotHigh,
                          ]}
                        />
                        <Text style={styles.consistencyLabel}>{week.label.split(' ')[0]}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Exercise Progression Curve */}
            <View style={styles.toolCard}>
              <View style={styles.toolHeader}>
                <TrendingUp size={18} color={colors.primary} />
                <Text style={styles.toolTitle}>Exercise Progression</Text>
              </View>
              <Text style={styles.toolSubtitle}>
                Estimated 1RM, load, and volume trajectory over time.
              </Text>

              {/* Exercise Selector */}
              <TouchableOpacity
                style={styles.exerciseSelectorBtn}
                onPress={() => setShowProgressionPicker(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose exercise for progression curve"
              >
                <View style={styles.exerciseSelectorLeft}>
                  <Dumbbell size={18} color={colors.primary} />
                  <Text style={styles.exerciseSelectorName}>
                    {progressionExercise?.name || 'Select Exercise'}
                  </Text>
                </View>
                <View style={styles.changeBadge}>
                  <Text style={styles.changeBadgeText}>Change</Text>
                </View>
              </TouchableOpacity>

              {/* Timeframe & Metric Filters */}
              <View style={styles.filterControlsRow}>
                <View style={styles.filterGroup}>
                  {(['1M', '3M', '6M', '1Y', 'ALL'] as TimeframeFilter[]).map((tf) => {
                    const isSelected = progressionTimeframe === tf;
                    const label = tf === 'ALL' ? 'All time' : `Past ${tf}`;
                    return (
                      <TouchableOpacity
                        key={tf}
                        style={[
                          styles.filterChip,
                          isSelected && styles.filterChipActive,
                        ]}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Timeframe: ${label}`}
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => setProgressionTimeframe(tf)}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            isSelected && styles.filterChipTextActive,
                          ]}
                        >
                          {tf}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.filterGroup}>
                  {(['e1rm', 'max_weight', 'max_reps', 'volume'] as ProgressionMetric[]).map((m) => {
                    const isSelected = progressionMetric === m;
                    const label = m === 'e1rm' ? 'Estimated 1RM' : m === 'max_weight' ? 'Heaviest Weight' : m === 'max_reps' ? 'Max Reps' : 'Total Volume';
                    return (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.filterChip,
                          isSelected && styles.filterChipActive,
                        ]}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => setProgressionMetric(m)}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            isSelected && styles.filterChipTextActive,
                          ]}
                        >
                          {m === 'e1rm' ? '1RM' : m === 'max_weight' ? 'Weight' : m === 'max_reps' ? 'Reps' : 'Vol'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Gym Scoping Filter */}
              {gymTrackingEnabled && allGyms.length > 1 && (
                <View style={styles.gymFilterRow}>
                  <TouchableOpacity
                    style={[
                      styles.gymChip,
                      progressionGymFilter === null && styles.gymChipActive,
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel="Filter by all gyms"
                    accessibilityState={{ selected: progressionGymFilter === null }}
                    onPress={() => setProgressionGymFilter(null)}
                  >
                    <Text
                      style={[
                        styles.gymChipText,
                        progressionGymFilter === null && styles.gymChipTextActive,
                      ]}
                    >
                      All Gyms
                    </Text>
                  </TouchableOpacity>
                  {allGyms.map((gym) => (
                    <TouchableOpacity
                      key={gym.id}
                      style={[
                        styles.gymChip,
                        progressionGymFilter === gym.id && styles.gymChipActive,
                      ]}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter by ${gym.name}`}
                      accessibilityState={{ selected: progressionGymFilter === gym.id }}
                      onPress={() => setProgressionGymFilter(gym.id)}
                    >
                      <Text
                        style={[
                          styles.gymChipText,
                          progressionGymFilter === gym.id && styles.gymChipTextActive,
                        ]}
                      >
                        {gym.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Chart */}
              {progressionSeries ? (
                <ProgressionCurveView
                  series={progressionSeries}
                  metric={progressionMetric}
                  unit={unit}
                  height={190}
                  gymTrackingEnabled={gymTrackingEnabled}
                />
              ) : (
                <View style={styles.emptyChartBox}>
                  <Text style={styles.emptyChartText}>No recorded sets for this exercise yet.</Text>
                </View>
              )}
            </View>

            {/* Training Breakdown Section Header & Timeframe Filter */}
            <View style={styles.breakdownHeaderRow}>
              <View style={styles.breakdownTitleWrap}>
                <Layers size={18} color={colors.primary} />
                <Text style={styles.breakdownTitleText}>TRAINING BREAKDOWN</Text>
              </View>
              <View style={styles.breakdownTimeframeRow}>
                {(['1M', '3M', '6M', '1Y', 'ALL'] as TimeframeFilter[]).map((tf) => {
                  const isSelected = dashboardTimeframe === tf;
                  const label = tf === 'ALL' ? 'All time' : `Past ${tf}`;
                  return (
                    <TouchableOpacity
                      key={tf}
                      style={[
                        styles.breakdownChip,
                        isSelected && styles.breakdownChipActive,
                      ]}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Breakdown timeframe: ${label}`}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setDashboardTimeframe(tf)}
                    >
                      <Text
                        style={[
                          styles.breakdownChipText,
                          isSelected && styles.breakdownChipTextActive,
                        ]}
                      >
                        {tf}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Rep-Range Training Zones */}
            {repRangeDistribution && repRangeDistribution.totalSets > 0 && (
              <View style={styles.toolCard}>
                <View style={styles.toolHeader}>
                  <Layers size={18} color={colors.primary} />
                  <Text style={styles.toolTitle}>Rep Range Training Zones</Text>
                </View>
                <Text style={styles.toolSubtitle}>
                  Distribution of completed sets across strength, hypertrophy, and endurance ({dashboardTimeframe === 'ALL' ? 'All time' : `Past ${dashboardTimeframe}`}).
                </Text>

                <View style={styles.zoneStackedBar}>
                  {repRangeDistribution.strength > 0 && (
                    <View
                      style={[
                        styles.zoneBarSegment,
                        {
                          flex: repRangeDistribution.strength,
                          backgroundColor: colors.danger,
                        },
                      ]}
                    />
                  )}
                  {repRangeDistribution.hypertrophy > 0 && (
                    <View
                      style={[
                        styles.zoneBarSegment,
                        {
                          flex: repRangeDistribution.hypertrophy,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  )}
                  {repRangeDistribution.endurance > 0 && (
                    <View
                      style={[
                        styles.zoneBarSegment,
                        {
                          flex: repRangeDistribution.endurance,
                          backgroundColor: colors.success,
                        },
                      ]}
                    />
                  )}
                </View>

                <View style={styles.zoneLegendRow}>
                  <View style={styles.zoneLegendItem}>
                    <View style={[styles.zoneDot, { backgroundColor: colors.danger }]} />
                    <Text style={styles.zoneLabel}>
                      Strength (1-5): {repRangeDistribution.percentages.strength}% ({repRangeDistribution.strength} sets)
                    </Text>
                  </View>
                  <View style={styles.zoneLegendItem}>
                    <View style={[styles.zoneDot, { backgroundColor: colors.primary }]} />
                    <Text style={styles.zoneLabel}>
                      Hypertrophy (6-12): {repRangeDistribution.percentages.hypertrophy}% ({repRangeDistribution.hypertrophy} sets)
                    </Text>
                  </View>
                  <View style={styles.zoneLegendItem}>
                    <View style={[styles.zoneDot, { backgroundColor: colors.success }]} />
                    <Text style={styles.zoneLabel}>
                      Endurance (13+): {repRangeDistribution.percentages.endurance}% ({repRangeDistribution.endurance} sets)
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Muscle Distribution with Volume vs Sets Toggle */}
            {trainingDistribution.length > 0 && (
              <View style={styles.toolCard}>
                <View style={styles.toolHeaderBetween}>
                  <View style={styles.toolHeaderLeft}>
                    <PieChart size={18} color={colors.primary} />
                    <Text style={styles.toolTitle}>Muscle Distribution</Text>
                  </View>
                  <View style={styles.distToggleWrap}>
                    <TouchableOpacity
                      style={[styles.distToggleBtn, distMode === 'volume' && styles.distToggleBtnActive]}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel="View volume distribution"
                      accessibilityState={{ selected: distMode === 'volume' }}
                      onPress={() => setDistMode('volume')}
                    >
                      <Text style={[styles.distToggleText, distMode === 'volume' && styles.distToggleTextActive]}>
                        Volume
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.distToggleBtn, distMode === 'sets' && styles.distToggleBtnActive]}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel="View sets distribution"
                      accessibilityState={{ selected: distMode === 'sets' }}
                      onPress={() => setDistMode('sets')}
                    >
                      <Text style={[styles.distToggleText, distMode === 'sets' && styles.distToggleTextActive]}>
                        Sets
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.toolSubtitle}>
                  {distMode === 'volume'
                    ? `Proportion of completed volume across muscle groups (${dashboardTimeframe === 'ALL' ? 'All time' : `Past ${dashboardTimeframe}`}).`
                    : `Proportion of hard working sets completed across muscle groups (${dashboardTimeframe === 'ALL' ? 'All time' : `Past ${dashboardTimeframe}`}).`}
                </Text>

                <View style={styles.distList}>
                  {[...trainingDistribution]
                    .sort((a, b) => (distMode === 'volume' ? b.volumeKg - a.volumeKg : b.setsCount - a.setsCount))
                    .slice(0, 8)
                    .map((item) => {
                      const pct = distMode === 'volume' ? item.percentage : item.setsPercentage;
                      const valText = distMode === 'volume'
                        ? `${item.percentage}% (${formatWeight(item.volumeKg, unit)})`
                        : `${item.setsPercentage}% (${item.setsCount} ${item.setsCount === 1 ? 'set' : 'sets'})`;
                      return (
                        <View key={item.muscle} style={styles.distRow}>
                          <View style={styles.distHeaderRow}>
                            <Text style={styles.distMuscleName}>{item.muscle}</Text>
                            <Text style={styles.distPercentage}>{valText}</Text>
                          </View>
                          <View style={styles.distBarTrack}>
                            <View
                              style={[
                                styles.distBarFill,
                                { width: `${Math.min(100, pct)}%` },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    })}
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={styles.chartEmptyTitle}>Progress charts will appear here</Text>
            <Text style={styles.chartEmptyText}>Complete a workout to start tracking volume and muscle frequency.</Text>
          </View>
        )}

      </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        {/* 1RM Calculator Section */}
        <View style={styles.toolCard}>
          <View style={styles.toolHeader}>
            <Calculator size={18} color={colors.primary} />
            <Text style={styles.toolTitle}>One-Rep Max (1RM) Calculator</Text>
          </View>
          <Text style={styles.toolSubtitle}>
            Calculates your maximum single-rep strength using Epley and Brzycki formulas.
          </Text>

          <View style={styles.inputsRow}>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>LIFTED WEIGHT ({unit.toUpperCase()})</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="decimal-pad"
                value={weight}
                onChangeText={setWeight}
                selectTextOnFocus={true}
              />
            </View>

            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>REPETITIONS</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="number-pad"
                value={reps}
                onChangeText={setReps}
                selectTextOnFocus={true}
              />
            </View>
          </View>

          {/* 1RM Output Big Display */}
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>ESTIMATED 1RM</Text>
            <Text style={styles.resultValue}>{formatWeight(oneRM.average, unit)}</Text>
            <Text style={styles.resultFormula}>
              Epley: {kgToDisplay(oneRM.epley, unit)} {unit} • Brzycki: {kgToDisplay(oneRM.brzycki, unit)} {unit}
            </Text>
          </View>

          {/* Training Percentage Table */}
          <Text style={styles.tableHeading}>SUGGESTED TRAINING LOADS</Text>
          <View style={styles.percentagesGrid}>
            {percentages.map((p, idx) => (
              <View key={idx} style={styles.pctRow}>
                <Text style={styles.pctLabel}>{p.pct}%</Text>
                <Text style={styles.pctReps}>({p.reps})</Text>
                <Text style={styles.pctValue}>{kgToDisplay(p.load, unit)} {unit}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Standalone Barbell Plate Calculator Button */}
        <View style={styles.toolCard}>
          <View style={styles.toolHeader}>
            <Dumbbell size={18} color={colors.primary} />
            <Text style={styles.toolTitle}>Barbell Plate Calculator</Text>
          </View>
          <Text style={styles.toolSubtitle}>
            Determine the exact Olympic plates to slide on each side of the barbell.
          </Text>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowPlateCalc(true)}
          >
            <Calculator size={18} color={colors.black} />
            <Text style={styles.actionBtnText}>Open Plate Calculator</Text>
          </TouchableOpacity>
        </View>

        {/* Strength Standards Guide */}
        <View style={styles.toolCard}>
          <View style={styles.toolHeader}>
            <Award size={18} color={colors.primary} />
            <Text style={styles.toolTitle}>Strength Level Standards</Text>
          </View>
          <Text style={styles.toolSubtitle}>
            General 1RM standards for an adult male (~80 kg bodyweight):
          </Text>

          <View style={styles.standardRow}>
            <Text style={styles.standardLift}>Bench Press</Text>
            <Text style={styles.standardValues}>
              Beg: {kgToDisplay(60, unit)} {unit} • Int: {kgToDisplay(100, unit)} {unit} • Adv: {kgToDisplay(135, unit)} {unit}
            </Text>
          </View>
          <View style={styles.standardRow}>
            <Text style={styles.standardLift}>Barbell Squat</Text>
            <Text style={styles.standardValues}>
              Beg: {kgToDisplay(80, unit)} {unit} • Int: {kgToDisplay(130, unit)} {unit} • Adv: {kgToDisplay(175, unit)} {unit}
            </Text>
          </View>
          <View style={styles.standardRow}>
            <Text style={styles.standardLift}>Deadlift</Text>
            <Text style={styles.standardValues}>
              Beg: {kgToDisplay(95, unit)} {unit} • Int: {kgToDisplay(155, unit)} {unit} • Adv: {kgToDisplay(210, unit)} {unit}
            </Text>
          </View>
          <View style={styles.standardRow}>
            <Text style={styles.standardLift}>Overhead Press</Text>
            <Text style={styles.standardValues}>
              Beg: {kgToDisplay(40, unit)} {unit} • Int: {kgToDisplay(65, unit)} {unit} • Adv: {kgToDisplay(90, unit)} {unit}
            </Text>
          </View>
        </View>

        {/* Data Ownership */}
        <Text style={styles.groupHeading}>Your Data</Text>
        <View style={styles.listCard}>
          <TouchableOpacity
            style={[styles.listRow]}
            onPress={handleSaveData}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Save Backup to Files"
          >
            <View style={styles.listRowIcon}>
              <Download size={18} color={colors.textSoft} />
            </View>
            <View style={styles.listRowText}>
              <Text style={styles.listRowTitle}>Save Backup to Files</Text>
              <Text style={styles.listRowSub}>Export a full v3 backup file</Text>
            </View>
            <ChevronRight size={18} color={colors.textFaint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.listRow, styles.listRowDivider]}
            onPress={handleExportData}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Share Backup Workout Data"
          >
            <View style={styles.listRowIcon}>
              <Share2 size={18} color={colors.textSoft} />
            </View>
            <View style={styles.listRowText}>
              <Text style={styles.listRowTitle}>Share Backup</Text>
              <Text style={styles.listRowSub}>Send a backup to another app</Text>
            </View>
            <ChevronRight size={18} color={colors.textFaint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.listRow, styles.listRowDivider]}
            onPress={handleImportData}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Restore & Import Backup Data"
          >
            <View style={styles.listRowIcon}>
              <Upload size={18} color={colors.textSoft} />
            </View>
            <View style={styles.listRowText}>
              <Text style={styles.listRowTitle}>Restore Backup</Text>
              <Text style={styles.listRowSub}>Replace data from a backup file</Text>
            </View>
            <ChevronRight size={18} color={colors.textFaint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.listRow, styles.listRowDivider]}
            onPress={handleImportCsv}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Import Workouts from CSV"
          >
            <View style={styles.listRowIcon}>
              <FileSpreadsheet size={18} color={colors.textSoft} />
            </View>
            <View style={styles.listRowText}>
              <Text style={styles.listRowTitle}>Import from Other Apps</Text>
              <Text style={styles.listRowSub}>Hevy, Strong, Lyfta and more (CSV)</Text>
            </View>
            <ChevronRight size={18} color={colors.textFaint} />
          </TouchableOpacity>
        </View>
        <Text style={styles.dataFootnote}>
          Lifts is local-first: everything stays on this device unless you export it.
        </Text>
      </ScrollView>
      )}

      <PlateCalculatorModal
        visible={showPlateCalc}
        initialWeight={numWeight || 100}
        onClose={() => setShowPlateCalc(false)}
      />

      <ExercisePickerModal
        visible={showProgressionPicker}
        title="Select Progression Exercise"
        onClose={() => setShowProgressionPicker(false)}
        onSelectExercise={(ex) => {
          setSelectedProgressionExerciseId(ex.id);
          setShowProgressionPicker(false);
        }}
      />

      <CsvImportModal
        visible={csvPreview !== null}
        preview={csvPreview}
        fileName={csvFileName}
        gyms={allGyms}
        selectedGymId={csvGymId}
        onSelectGymId={handleSelectCsvGym}
        skipDuplicates={csvSkipDuplicates}
        onToggleSkipDuplicates={handleToggleCsvSkipDuplicates}
        onConfirmImport={handleConfirmCsvImport}
        onClose={() => setCsvPreview(null)}
        isImporting={isCsvImporting}
        onAssignExercise={handleAssignExercise}
        onSetCustomExercise={handleSetCustomExercise}
      />

      {/* Modal for Exercise Details & History in Trophy Room */}
      <ExerciseDetailModal
        visible={detailExercise !== null}
        exercise={detailExercise}
        onClose={() => setDetailExercise(null)}
        currentGym={trophyGymId ? allGyms.find((g) => g.id === trophyGymId) : null}
        onHistoryTransferred={loadAnalytics}
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
    paddingTop: 12,
    paddingBottom: 120,
  },
  lifetimeHeroCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  lifetimeHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  lifetimeHeroTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  lifetimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  lifetimeTile: {
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    padding: 12,
  },
  lifetimeTileVal: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 2,
    fontVariant: ['tabular-nums'],
  },
  lifetimeTileLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  lifetimeTileSub: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  chartLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 28,
  },
  chartLoadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  chartEmpty: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  chartEmptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  chartEmptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  volumeChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 142,
    gap: 5,
  },
  volumeColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  volumeBarTrack: {
    height: 112,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderRadius: 6,
    overflow: 'hidden',
  },
  volumeBar: {
    width: '72%',
    backgroundColor: colors.primary,
    borderRadius: 6,
  },
  volumeLabel: {
    color: colors.textMuted,
    fontSize: 9,
  },
  muscleChart: {
    gap: 9,
  },
  muscleLegend: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 2,
    marginBottom: 2,
  },
  muscleLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  muscleLegendSwatch: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  muscleLegendText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  muscleRow: {
    gap: 4,
  },
  muscleRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  muscleName: {
    color: colors.textSoft,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  muscleCount: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  muscleBarTrack: {
    height: 8,
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    overflow: 'hidden',
  },
  muscleBar: {
    height: '100%',
  },
  musclePrimaryBar: {
    backgroundColor: colors.primary,
  },
  muscleSecondaryBar: {
    backgroundColor: colors.primary + '59',
  },
  toolCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  toolTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  toolSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inputCol: {
    flex: 1,
  },
  inputLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: 12,
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: 'center',
  },
  resultBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 18,
  },
  resultLabel: {
    color: colors.primaryLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  resultValue: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  resultFormula: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  tableHeading: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  percentagesGrid: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pctRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  pctLabel: {
    color: colors.text,
    fontWeight: '700',
    width: 45,
  },
  pctReps: {
    color: colors.textSecondary,
    flex: 1,
  },
  pctValue: {
    color: colors.text,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    paddingVertical: 13,
    borderRadius: 14,
    gap: 8,
  },
  actionBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  standardRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  standardLift: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 2,
  },
  standardValues: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  trophyHeroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  trophyHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  trophyHeroTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  medalTallyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  medalTallyBox: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
  },
  medalTallyCount: {
    fontSize: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  medalTallyLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  sbdCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  sbdHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sbdTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sbdSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  sbdBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  sbdTotalText: {
    color: colors.primaryLight,
    fontSize: 14,
    fontWeight: '800',
  },
  sbdGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  sbdCol: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  sbdLiftName: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sbdLiftVal: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  sbdLiftSub: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  trophyFiltersSection: {
    marginBottom: 14,
    gap: 10,
  },
  trophySearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
  },
  trophySearchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  pillsScroll: {
    flexDirection: 'row',
    flexGrow: 0,
  },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  recordCardMain: {
    flex: 1,
  },
  recordCardHeader: {
    marginBottom: 8,
  },
  recordExerciseName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  recordBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  recordPill: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recordPillText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  recordGymBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recordGymText: {
    color: colors.primaryLight,
    fontSize: 11,
    fontWeight: '600',
  },
  recordMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  recordMetricBox: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  recordMetricLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 1,
  },
  recordMetricVal: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  recordDateText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  emptyTrophyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  emptyTrophyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyTrophySubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  streakBadgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  streakBadge: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    padding: 12,
  },
  streakValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  streakLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  consistencyHeatmap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  consistencyCol: {
    alignItems: 'center',
    gap: 6,
  },
  consistencyDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.surfaceHigh,
  },
  consistencyDotActive: {
    backgroundColor: colors.primary + '99',
  },
  consistencyDotHigh: {
    backgroundColor: colors.primary,
  },
  consistencyLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
  },
  exerciseSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  exerciseSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  exerciseSelectorName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  changeBadge: {
    backgroundColor: '#38BDF820',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#38BDF840',
  },
  changeBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  filterControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  filterGroup: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  filterChipActive: {
    backgroundColor: '#38BDF820',
  },
  filterChipText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  gymFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  gymChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gymChipActive: {
    backgroundColor: '#38BDF820',
    borderColor: '#38BDF850',
  },
  gymChipText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  gymChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  emptyChartBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyChartText: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  zoneStackedBar: {
    flexDirection: 'row',
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginBottom: 12,
  },
  zoneBarSegment: {
    height: '100%',
  },
  zoneLegendRow: {
    gap: 6,
  },
  zoneLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  zoneLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  distList: {
    gap: 10,
  },
  distRow: {
    gap: 4,
  },
  distHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  distMuscleName: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  distPercentage: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  distBarTrack: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  distBarFill: {
    height: '100%',
    backgroundColor: colors.warning,
    borderRadius: 3,
  },
  breakdownHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  breakdownTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownTitleText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  breakdownTimeframeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  breakdownChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  breakdownChipActive: {
    backgroundColor: '#38BDF820',
    borderColor: colors.primary,
  },
  breakdownChipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  breakdownChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  toolHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  toolHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  distToggleWrap: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  distToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  distToggleBtnActive: {
    backgroundColor: '#F59E0B25',
  },
  distToggleText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  distToggleTextActive: {
    color: colors.warning,
    fontWeight: '700',
  },
  sectionSwitcher: {
    marginTop: 14,
  },
  streakIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupHeading: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
    marginLeft: 4,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  listRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  listRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRowText: {
    flex: 1,
  },
  listRowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  listRowSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  dataFootnote: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 24,
    lineHeight: 17,
  },
  volumeBarEmpty: {
    backgroundColor: colors.surfaceHigh,
  },
  pillsContent: {
    gap: 8,
  },
});
