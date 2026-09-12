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
  ShieldCheck,
  Download,
  Upload,
  Share2,
  FileSpreadsheet,
  Trophy,
  BarChart3,
  Search,
  ChevronRight,
  X,
  Flame,
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

export const AnalyticsScreen: React.FC = () => {
  const { unit, gymTrackingEnabled } = useSettings();
  const { isWorkingOut } = useWorkout();
  const { confirm, notify } = useDialog();

  // Navigation section: Analytics charts vs Trophy Room
  const [activeSection, setActiveSection] = useState<'analytics' | 'trophy'>('analytics');

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

  useEffect(() => {
    let mounted = true;

    const loadAnalytics = async () => {
      try {
        const store = await getStore();
        const snapshot = await store.readSnapshot();
        if (!mounted) return;

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
        setMuscleFrequency(buildMuscleFrequency(workouts));

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
        if (mounted) setAnalyticsLoading(false);
      }
    };

    loadAnalytics();
    return () => {
      mounted = false;
    };
  }, []);

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
      setMuscleFrequency(buildMuscleFrequency(workouts));

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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tools & Analytics</Text>
      </View>

      {/* Section Switcher Tabs */}
      <View style={styles.sectionTabs}>
        <TouchableOpacity
          style={[styles.sectionTab, activeSection === 'analytics' && styles.sectionTabActive]}
          onPress={() => setActiveSection('analytics')}
        >
          <BarChart3 size={15} color={activeSection === 'analytics' ? '#F9FAFB' : '#9CA3AF'} />
          <Text style={[styles.sectionTabText, activeSection === 'analytics' && styles.sectionTabTextActive]}>
            Analytics & Tools
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sectionTab, activeSection === 'trophy' && styles.sectionTabActive]}
          onPress={() => setActiveSection('trophy')}
        >
          <Trophy size={15} color={activeSection === 'trophy' ? '#FBBF24' : '#9CA3AF'} />
          <Text style={[styles.sectionTabText, activeSection === 'trophy' && styles.sectionTabTextActive]}>
            Trophy Room
          </Text>
        </TouchableOpacity>
      </View>

      {activeSection === 'trophy' ? (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Trophy Room Hero Banner */}
          <View style={styles.trophyHeroCard}>
            <View style={styles.trophyHeroHeader}>
              <Trophy size={18} color="#F59E0B" />
              <Text style={styles.trophyHeroTitle}>ALL-TIME PERSONAL RECORDS</Text>
            </View>
            <View style={styles.medalTallyRow}>
              <View style={[styles.medalTallyBox, { borderColor: '#F59E0B60', backgroundColor: '#78350F25' }]}>
                <Text style={styles.medalTallyEmoji}>🥇</Text>
                <Text style={[styles.medalTallyCount, { color: '#FBBF24' }]}>{trophySummary?.totalGold ?? 0}</Text>
                <Text style={styles.medalTallyLabel}>GOLD</Text>
              </View>
              <View style={[styles.medalTallyBox, { borderColor: '#94A3B850', backgroundColor: '#33415525' }]}>
                <Text style={styles.medalTallyEmoji}>🥈</Text>
                <Text style={[styles.medalTallyCount, { color: '#F1F5F9' }]}>{trophySummary?.totalSilver ?? 0}</Text>
                <Text style={styles.medalTallyLabel}>SILVER</Text>
              </View>
              <View style={[styles.medalTallyBox, { borderColor: '#D9770650', backgroundColor: '#451A0325' }]}>
                <Text style={styles.medalTallyEmoji}>🥉</Text>
                <Text style={[styles.medalTallyCount, { color: '#FED7AA' }]}>{trophySummary?.totalBronze ?? 0}</Text>
                <Text style={styles.medalTallyLabel}>BRONZE</Text>
              </View>
              <View style={[styles.medalTallyBox, { borderColor: '#38BDF850', backgroundColor: '#0C4A6E25' }]}>
                <Text style={styles.medalTallyEmoji}>🏆</Text>
                <Text style={[styles.medalTallyCount, { color: '#38BDF8' }]}>{trophySummary?.totalRecords ?? 0}</Text>
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
              <Search size={16} color="#6B7280" />
              <TextInput
                style={styles.trophySearchInput}
                placeholder="Search records by exercise name..."
                placeholderTextColor="#6B7280"
                value={trophySearch}
                onChangeText={setTrophySearch}
              />
              {trophySearch.length > 0 && (
                <TouchableOpacity onPress={() => setTrophySearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            {/* Gym filter pills */}
            {gymTrackingEnabled && allGyms.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                <TouchableOpacity
                  style={[styles.filterPill, trophyGymId === null && styles.filterPillActive]}
                  onPress={() => setTrophyGymId(null)}
                >
                  <Text style={[styles.filterPillText, trophyGymId === null && styles.filterPillTextActive]}>
                    All Gyms
                  </Text>
                </TouchableOpacity>
                {allGyms.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.filterPill, trophyGymId === g.id && styles.filterPillActive]}
                    onPress={() => setTrophyGymId(g.id)}
                  >
                    <Text style={[styles.filterPillText, trophyGymId === g.id && styles.filterPillTextActive]}>
                      {g.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Category filter pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
              {['all', 'chest', 'back', 'legs', 'shoulders', 'arms', 'core'].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.filterPill, trophyCategory === cat && styles.filterPillActive]}
                  onPress={() => setTrophyCategory(cat)}
                >
                  <Text style={[styles.filterPillText, trophyCategory === cat && styles.filterPillTextActive]}>
                    {cat.toUpperCase()}
                  </Text>
                </TouchableOpacity>
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
                            ).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.recordPill}>
                          <Text style={styles.recordPillText}>{record.equipment}</Text>
                        </View>
                        {gymTrackingEnabled && record.bestWeight?.gymName && (
                          <View style={styles.recordGymBadge}>
                            <Text style={styles.recordGymText}>📍 {record.bestWeight.gymName}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.recordMetricsGrid}>
                      {record.bestWeight && (
                        <View style={styles.recordMetricBox}>
                          <Text style={styles.recordMetricLabel}>HEAVIEST SET</Text>
                          <Text style={styles.recordMetricVal}>
                            {formatWeight(record.bestWeight.value, unit)} × {record.bestWeight.reps}
                          </Text>
                        </View>
                      )}

                      {record.best1RM && (
                        <View style={styles.recordMetricBox}>
                          <Text style={styles.recordMetricLabel}>EST. 1RM</Text>
                          <Text style={styles.recordMetricVal}>{formatWeight(record.best1RM.value, unit)}</Text>
                        </View>
                      )}

                      {record.bestVolume && (
                        <View style={styles.recordMetricBox}>
                          <Text style={styles.recordMetricLabel}>SET VOLUME</Text>
                          <Text style={styles.recordMetricVal}>{formatWeight(record.bestVolume.value, unit)}</Text>
                        </View>
                      )}

                      {record.bestReps && (
                        <View style={styles.recordMetricBox}>
                          <Text style={styles.recordMetricLabel}>MAX REPS</Text>
                          <Text style={styles.recordMetricVal}>{record.bestReps.value} reps</Text>
                        </View>
                      )}
                    </View>

                    {formattedDate.length > 0 && (
                      <Text style={styles.recordDateText}>Record set on {formattedDate}</Text>
                    )}
                  </View>

                  <ChevronRight size={18} color="#6B7280" />
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyTrophyCard}>
              <Trophy size={32} color="#4B5563" />
              <Text style={styles.emptyTrophyTitle}>No records found</Text>
              <Text style={styles.emptyTrophySubtitle}>
                {trophySearch || trophyCategory !== 'all'
                  ? 'Try clearing search or category filters.'
                  : 'Log completed workouts to start building your personal record trophy room!'}
              </Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        {/* Open-Source Promise Card */}
        <View style={styles.promiseCard}>
          <ShieldCheck size={24} color="#10B981" />
          <View style={styles.promiseInfo}>
            <Text style={styles.promiseTitle}>Zero Paywalls. Forever.</Text>
            <Text style={styles.promiseText}>
              Unlimited routines, all-time history, and advanced calculators are completely unlocked.
            </Text>
          </View>
        </View>

        {/* Progress Charts */}
        {analyticsLoading ? (
          <View style={styles.chartLoading}>
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text style={styles.chartLoadingText}>Loading progress...</Text>
          </View>
        ) : hasWorkoutData ? (
          <>
            {/* Lifetime Training Overview Banner */}
            {lifetimeStats && (
              <View style={styles.lifetimeHeroCard}>
                <View style={styles.lifetimeHeroHeader}>
                  <TrendingUp size={18} color="#38BDF8" />
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
                <Dumbbell size={20} color="#38BDF8" />
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
                        <View style={[styles.volumeBar, { height: barHeight }]} />
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
                  <Award size={20} color="#F59E0B" />
                  <Text style={styles.toolTitle}>Muscle Frequency</Text>
                </View>
                <Text style={styles.toolSubtitle}>Workouts that trained each primary muscle.</Text>
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
                          <View style={[styles.muscleBar, { width: `${(point.count / maxCount) * 100}%` }]} />
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
                  <Flame size={20} color="#EF4444" />
                  <Text style={styles.toolTitle}>Consistency & Streaks</Text>
                </View>
                <Text style={styles.toolSubtitle}>Your training rhythm over the last 12 weeks.</Text>

                <View style={styles.streakBadgesRow}>
                  <View style={styles.streakBadge}>
                    <Text style={styles.streakEmoji}>🔥</Text>
                    <View>
                      <Text style={styles.streakValue}>{consistencySummary.currentStreakWeeks} Wks</Text>
                      <Text style={styles.streakLabel}>CURRENT</Text>
                    </View>
                  </View>
                  <View style={styles.streakBadge}>
                    <Text style={styles.streakEmoji}>🏆</Text>
                    <View>
                      <Text style={styles.streakValue}>{consistencySummary.bestStreakWeeks} Wks</Text>
                      <Text style={styles.streakLabel}>BEST STREAK</Text>
                    </View>
                  </View>
                  <View style={styles.streakBadge}>
                    <Text style={styles.streakEmoji}>⚡</Text>
                    <View>
                      <Text style={styles.streakValue}>{consistencySummary.averageWorkoutsPerWeek}/wk</Text>
                      <Text style={styles.streakLabel}>12-WK AVG</Text>
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
                <TrendingUp size={20} color="#38BDF8" />
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
                  <Dumbbell size={18} color="#38BDF8" />
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
                  {(['1M', '3M', '6M', '1Y', 'ALL'] as TimeframeFilter[]).map((tf) => (
                    <TouchableOpacity
                      key={tf}
                      style={[
                        styles.filterChip,
                        progressionTimeframe === tf && styles.filterChipActive,
                      ]}
                      onPress={() => setProgressionTimeframe(tf)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          progressionTimeframe === tf && styles.filterChipTextActive,
                        ]}
                      >
                        {tf}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.filterGroup}>
                  {(['e1rm', 'max_weight', 'max_reps', 'volume'] as ProgressionMetric[]).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.filterChip,
                        progressionMetric === m && styles.filterChipActive,
                      ]}
                      onPress={() => setProgressionMetric(m)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          progressionMetric === m && styles.filterChipTextActive,
                        ]}
                      >
                        {m === 'e1rm' ? '1RM' : m === 'max_weight' ? 'Weight' : m === 'max_reps' ? 'Reps' : 'Vol'}
                      </Text>
                    </TouchableOpacity>
                  ))}
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
                <Layers size={18} color="#38BDF8" />
                <Text style={styles.breakdownTitleText}>TRAINING BREAKDOWN</Text>
              </View>
              <View style={styles.breakdownTimeframeRow}>
                {(['1M', '3M', '6M', '1Y', 'ALL'] as TimeframeFilter[]).map((tf) => (
                  <TouchableOpacity
                    key={tf}
                    style={[
                      styles.breakdownChip,
                      dashboardTimeframe === tf && styles.breakdownChipActive,
                    ]}
                    onPress={() => setDashboardTimeframe(tf)}
                  >
                    <Text
                      style={[
                        styles.breakdownChipText,
                        dashboardTimeframe === tf && styles.breakdownChipTextActive,
                      ]}
                    >
                      {tf}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Rep-Range Training Zones */}
            {repRangeDistribution && repRangeDistribution.totalSets > 0 && (
              <View style={styles.toolCard}>
                <View style={styles.toolHeader}>
                  <Layers size={20} color="#10B981" />
                  <Text style={styles.toolTitle}>Rep Range Training Zones</Text>
                </View>
                <Text style={styles.toolSubtitle}>
                  Distribution of completed sets across strength, hypertrophy, and endurance ({dashboardTimeframe === 'ALL' ? 'All time' : `Past ${dashboardTimeframe}`}).
                </Text>

                <View style={styles.zoneStackedBar}>
                  {repRangeDistribution.percentages.strength > 0 && (
                    <View
                      style={[
                        styles.zoneBarSegment,
                        {
                          width: `${repRangeDistribution.percentages.strength}%`,
                          backgroundColor: '#EF4444',
                        },
                      ]}
                    />
                  )}
                  {repRangeDistribution.percentages.hypertrophy > 0 && (
                    <View
                      style={[
                        styles.zoneBarSegment,
                        {
                          width: `${repRangeDistribution.percentages.hypertrophy}%`,
                          backgroundColor: '#38BDF8',
                        },
                      ]}
                    />
                  )}
                  {repRangeDistribution.percentages.endurance > 0 && (
                    <View
                      style={[
                        styles.zoneBarSegment,
                        {
                          width: `${repRangeDistribution.percentages.endurance}%`,
                          backgroundColor: '#10B981',
                        },
                      ]}
                    />
                  )}
                </View>

                <View style={styles.zoneLegendRow}>
                  <View style={styles.zoneLegendItem}>
                    <View style={[styles.zoneDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.zoneLabel}>
                      Strength (1-5): {repRangeDistribution.percentages.strength}% ({repRangeDistribution.strength} sets)
                    </Text>
                  </View>
                  <View style={styles.zoneLegendItem}>
                    <View style={[styles.zoneDot, { backgroundColor: '#38BDF8' }]} />
                    <Text style={styles.zoneLabel}>
                      Hypertrophy (6-12): {repRangeDistribution.percentages.hypertrophy}% ({repRangeDistribution.hypertrophy} sets)
                    </Text>
                  </View>
                  <View style={styles.zoneLegendItem}>
                    <View style={[styles.zoneDot, { backgroundColor: '#10B981' }]} />
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
                    <PieChart size={20} color="#F59E0B" />
                    <Text style={styles.toolTitle}>Muscle Distribution</Text>
                  </View>
                  <View style={styles.distToggleWrap}>
                    <TouchableOpacity
                      style={[styles.distToggleBtn, distMode === 'volume' && styles.distToggleBtnActive]}
                      onPress={() => setDistMode('volume')}
                    >
                      <Text style={[styles.distToggleText, distMode === 'volume' && styles.distToggleTextActive]}>
                        Volume
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.distToggleBtn, distMode === 'sets' && styles.distToggleBtnActive]}
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

        {/* 1RM Calculator Section */}
        <View style={styles.toolCard}>
          <View style={styles.toolHeader}>
            <Calculator size={20} color="#3B82F6" />
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
            <Dumbbell size={20} color="#10B981" />
            <Text style={styles.toolTitle}>Barbell Plate Calculator</Text>
          </View>
          <Text style={styles.toolSubtitle}>
            Determine the exact Olympic plates to slide on each side of the barbell.
          </Text>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowPlateCalc(true)}
          >
            <Calculator size={18} color="#000000" />
            <Text style={styles.actionBtnText}>Open Plate Calculator</Text>
          </TouchableOpacity>
        </View>

        {/* Strength Standards Guide */}
        <View style={styles.toolCard}>
          <View style={styles.toolHeader}>
            <Award size={20} color="#F59E0B" />
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
        <TouchableOpacity
          style={styles.exportCard}
          onPress={handleSaveData}
          accessibilityRole="button"
          accessibilityLabel="Save Backup to Files"
        >
          <Download size={20} color="#9CA3AF" />
          <Text style={styles.exportCardText}>Save Backup to Files (v3)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.exportCard, { marginTop: 10 }]}
          onPress={handleExportData}
          accessibilityRole="button"
          accessibilityLabel="Share Backup Workout Data"
        >
          <Share2 size={20} color="#9CA3AF" />
          <Text style={styles.exportCardText}>Share Backup</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.exportCard, { marginTop: 10 }]}
          onPress={handleImportData}
          accessibilityRole="button"
          accessibilityLabel="Restore & Import Backup Data"
        >
          <Upload size={20} color="#3B82F6" />
          <Text style={[styles.exportCardText, { color: '#3B82F6' }]}>Restore & Import Backup</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.exportCard, { marginTop: 10 }]}
          onPress={handleImportCsv}
          accessibilityRole="button"
          accessibilityLabel="Import Workouts from CSV"
        >
          <FileSpreadsheet size={20} color="#10B981" />
          <Text style={[styles.exportCardText, { color: '#10B981' }]}>Import Workouts (Hevy, Strong, Lyfta...)</Text>
        </TouchableOpacity>
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
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0E12',
  },
  header: {
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
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  promiseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#132E27',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1C4A3F',
    gap: 14,
    marginBottom: 16,
  },
  promiseInfo: {
    flex: 1,
  },
  promiseTitle: {
    color: '#10B981',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  promiseText: {
    color: '#A7F3D0',
    fontSize: 12,
    lineHeight: 16,
  },
  lifetimeHeroCard: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#262A34',
    marginBottom: 16,
  },
  lifetimeHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  lifetimeHeroTitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  lifetimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  lifetimeTile: {
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: '#13151B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#20242E',
  },
  lifetimeTileVal: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  lifetimeTileLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  lifetimeTileSub: {
    color: '#9CA3AF',
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
    color: '#9CA3AF',
    fontSize: 13,
  },
  chartEmpty: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262A34',
    padding: 18,
    marginBottom: 16,
  },
  chartEmptyTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  chartEmptyText: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 18,
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
    backgroundColor: '#20242E',
    borderRadius: 5,
    overflow: 'hidden',
  },
  volumeBar: {
    width: '70%',
    backgroundColor: '#38BDF8',
    borderRadius: 5,
  },
  volumeLabel: {
    color: '#6B7280',
    fontSize: 9,
  },
  muscleChart: {
    gap: 9,
  },
  muscleRow: {
    gap: 4,
  },
  muscleRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  muscleName: {
    color: '#D1D5DB',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  muscleCount: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
  },
  muscleBarTrack: {
    height: 8,
    backgroundColor: '#20242E',
    borderRadius: 4,
    overflow: 'hidden',
  },
  muscleBar: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 4,
  },
  toolCard: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#262A34',
    marginBottom: 16,
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  toolTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  toolSubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 16,
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
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#262A34',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 8,
    textAlign: 'center',
  },
  resultBox: {
    backgroundColor: '#20242E',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 18,
  },
  resultLabel: {
    color: '#3B82F6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  resultValue: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
  },
  resultFormula: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 4,
  },
  tableHeading: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  percentagesGrid: {
    backgroundColor: '#20242E',
    borderRadius: 12,
    padding: 10,
  },
  pctRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  pctLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    width: 45,
  },
  pctReps: {
    color: '#9CA3AF',
    flex: 1,
  },
  pctValue: {
    color: '#10B981',
    fontWeight: '700',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  actionBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  standardRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  standardLift: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 2,
  },
  standardValues: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  exportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#181A20',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#262A34',
    marginBottom: 20,
  },
  exportCardText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTabs: {
    flexDirection: 'row',
    backgroundColor: '#181A20',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  sectionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1E232E',
  },
  sectionTabActive: {
    backgroundColor: '#2A3342',
    borderWidth: 1,
    borderColor: '#3B82F650',
  },
  sectionTabText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionTabTextActive: {
    color: '#FFFFFF',
  },
  trophyHeroCard: {
    backgroundColor: '#1C160E',
    borderColor: '#F59E0B40',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  trophyHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  trophyHeroTitle: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  medalTallyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  medalTallyBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  medalTallyEmoji: {
    fontSize: 18,
    marginBottom: 2,
  },
  medalTallyCount: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 2,
  },
  medalTallyLabel: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sbdCard: {
    backgroundColor: '#181A20',
    borderColor: '#262A34',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sbdHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sbdTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sbdSubtitle: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  sbdBadge: {
    backgroundColor: '#1E293B',
    borderColor: '#38BDF860',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sbdTotalText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '800',
  },
  sbdGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  sbdCol: {
    flex: 1,
    backgroundColor: '#20242E',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  sbdLiftName: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sbdLiftVal: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  sbdLiftSub: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  trophyFiltersSection: {
    marginBottom: 16,
    gap: 10,
  },
  trophySearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#181A20',
    borderWidth: 1,
    borderColor: '#262A34',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  trophySearchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
  },
  pillsScroll: {
    flexDirection: 'row',
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#181A20',
    borderWidth: 1,
    borderColor: '#262A34',
    marginRight: 6,
  },
  filterPillActive: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  filterPillText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181A20',
    borderColor: '#262A34',
    borderWidth: 1,
    borderRadius: 14,
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
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  recordBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  recordPill: {
    backgroundColor: '#20242E',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recordPillText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
  },
  recordGymBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recordGymText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  recordMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  recordMetricBox: {
    backgroundColor: '#20242E',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  recordMetricLabel: {
    color: '#9CA3AF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  recordMetricVal: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  recordDateText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
  },
  emptyTrophyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    backgroundColor: '#181A20',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262A34',
    marginTop: 8,
  },
  emptyTrophyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyTrophySubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalDetailContainer: {
    flex: 1,
    backgroundColor: '#0D0E12',
    paddingTop: 54,
  },
  modalDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  modalDetailTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  modalDetailScroll: {
    flex: 1,
  },
  modalDetailContent: {
    padding: 16,
  },
  modalDetailBadges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  modalDetailBadge: {
    backgroundColor: '#181A20',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#262A34',
  },
  modalDetailBadgeText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  streakBadgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  streakBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#181A20',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262A34',
    padding: 10,
  },
  streakEmoji: {
    fontSize: 18,
  },
  streakValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  streakLabel: {
    color: '#6B7280',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  consistencyHeatmap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#262A34',
  },
  consistencyCol: {
    alignItems: 'center',
    gap: 6,
  },
  consistencyDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#262A34',
  },
  consistencyDotActive: {
    backgroundColor: '#EF444490',
  },
  consistencyDotHigh: {
    backgroundColor: '#EF4444',
  },
  consistencyLabel: {
    color: '#6B7280',
    fontSize: 9,
    fontWeight: '600',
  },
  exerciseSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#181A20',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262A34',
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
    color: '#FFFFFF',
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
    color: '#38BDF8',
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
    backgroundColor: '#181A20',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#262A34',
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
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  gymFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  gymChip: {
    backgroundColor: '#181A20',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#262A34',
  },
  gymChipActive: {
    backgroundColor: '#38BDF820',
    borderColor: '#38BDF850',
  },
  gymChipText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  gymChipTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  emptyChartBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14171F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262A34',
  },
  emptyChartText: {
    color: '#6B7280',
    fontSize: 13,
    fontStyle: 'italic',
  },
  zoneStackedBar: {
    flexDirection: 'row',
    height: 16,
    borderRadius: 8,
    backgroundColor: '#262A34',
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
    color: '#9CA3AF',
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
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  distPercentage: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  distBarTrack: {
    height: 6,
    backgroundColor: '#262A34',
    borderRadius: 3,
    overflow: 'hidden',
  },
  distBarFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
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
    color: '#38BDF8',
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
    backgroundColor: '#181A20',
    borderWidth: 1,
    borderColor: '#262A34',
  },
  breakdownChipActive: {
    backgroundColor: '#38BDF820',
    borderColor: '#38BDF8',
  },
  breakdownChipText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
  },
  breakdownChipTextActive: {
    color: '#38BDF8',
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
    backgroundColor: '#13151B',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#262A34',
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
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
  },
  distToggleTextActive: {
    color: '#F59E0B',
    fontWeight: '700',
  },
});

