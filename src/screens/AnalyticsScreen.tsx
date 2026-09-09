import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Calculator, Award, Dumbbell, ShieldCheck, Download, Upload } from 'lucide-react-native';
import { calculate1RM } from '../utils/calculator';
import { PlateCalculatorModal } from '../components/PlateCalculatorModal';
import { getStore } from '../database/db';
import { useSettings } from '../context/SettingsContext';
import { useWorkout } from '../context/WorkoutContext';
import { formatWeight, displayToKg, kgToDisplay } from '../utils/units';
import { exportBackup } from '../utils/export';
import { pickBackupJson } from '../utils/pickBackup';
import { parseBackup } from '../utils/backup';
import { computeRestorePlan } from '../utils/restore';
import { useDialog } from '../context/DialogContext';
import { Workout } from '../types';
import { MuscleFrequencyPoint, WeeklyVolumePoint, buildMuscleFrequency, buildWeeklyVolume } from '../workout/analytics';

export const AnalyticsScreen: React.FC = () => {
  const { unit } = useSettings();
  const { isWorkingOut } = useWorkout();
  const { confirm, notify } = useDialog();
  // 1RM calculator state
  const [weight, setWeight] = useState('100');
  const [reps, setReps] = useState('5');
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [hasWorkoutData, setHasWorkoutData] = useState(false);
  const [weeklyVolume, setWeeklyVolume] = useState<WeeklyVolumePoint[]>([]);
  const [muscleFrequency, setMuscleFrequency] = useState<MuscleFrequencyPoint[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadAnalytics = async () => {
      try {
        const store = await getStore();
        const snapshot = await store.readSnapshot();
        if (!mounted) return;

        const workouts: Workout[] = snapshot.workouts || [];
        setHasWorkoutData(workouts.length > 0);
        setWeeklyVolume(buildWeeklyVolume(workouts));
        setMuscleFrequency(buildMuscleFrequency(workouts));
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
    } catch (e) {
      await notify({ title: 'Export Error', message: 'Failed to export data. Please try again.' });
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tools & Analytics</Text>
      </View>

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
          onPress={handleExportData}
          accessibilityRole="button"
          accessibilityLabel="Backup & Export Workout Data"
        >
          <Download size={20} color="#9CA3AF" />
          <Text style={styles.exportCardText}>Backup & Export (v2)</Text>
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
      </ScrollView>

      <PlateCalculatorModal
        visible={showPlateCalc}
        initialWeight={numWeight || 100}
        onClose={() => setShowPlateCalc(false)}
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
});
