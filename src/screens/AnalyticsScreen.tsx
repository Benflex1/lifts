import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppTouchable } from '../components/ui';
import { Award, Calculator, Dumbbell } from 'lucide-react-native';
import { PlateCalculatorModal } from '../components/PlateCalculatorModal';
import { ScreenHeader, SegmentedControl } from '../components/ui';
import { useSettings } from '../context/SettingsContext';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import { useBackupTransfer } from '../hooks/useBackupTransfer';
import { useBodyWeightLog } from '../hooks/useBodyWeightLog';
import { useCsvImportFlow } from '../hooks/useCsvImportFlow';
import { useReloadOnActivate } from '../hooks/useReloadOnActivate';
import { BodyWeightModal } from '../components/BodyWeightModal';
import { colors } from '../theme';
import { calculate1RM } from '../utils/calculator';
import { displayToKg, formatWeight, kgToDisplay } from '../utils/units';
import { DataTransferSection } from './analytics/DataTransferSection';
import { ProgressCharts } from './analytics/ProgressCharts';
import { RecordsSection } from './analytics/RecordsSection';

type ProgressSection = 'overview' | 'records' | 'tools';

const PROGRESS_SECTIONS: { key: ProgressSection; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'records', label: 'Records' },
  { key: 'tools', label: 'Tools' },
];

/**
 * ARCH-02: Analytics composes focused pieces — useAnalyticsData for the derived data model,
 * ProgressCharts / RecordsSection / DataTransferSection for the three tabs, and
 * useBackupTransfer / useCsvImportFlow for the data-transfer commands.
 */
const AnalyticsScreenInner: React.FC = () => {
  const analytics = useAnalyticsData();
  const { bodyWeightEnabled } = useSettings();
  const bodyWeight = useBodyWeightLog(bodyWeightEnabled);
  const [showBodyWeightLog, setShowBodyWeightLog] = useState(false);
  const backup = useBackupTransfer({
    onRestored: () => {
      void analytics.reload();
      void bodyWeight.reload();
    },
  });
  const csv = useCsvImportFlow({
    defaultUnit: analytics.unit,
    onImported: () => analytics.reload(),
  });

  // Weigh-ins imported by a restore or written on another tab show up when Progress regains focus.
  useReloadOnActivate(() => void bodyWeight.reload());

  // Navigation section: Analytics charts vs Trophy Room
  const [activeSection, setActiveSection] = useState<ProgressSection>('overview');

  // 1RM calculator state
  const [weight, setWeight] = useState('100');
  const [reps, setReps] = useState('5');
  const [showPlateCalc, setShowPlateCalc] = useState(false);

  const { unit } = analytics;
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
        <RecordsSection analytics={analytics} />
      ) : activeSection === 'overview' ? (
        <ProgressCharts
          analytics={analytics}
          bodyWeight={
            bodyWeightEnabled
              ? { entries: bodyWeight.entries, onLog: () => setShowBodyWeightLog(true) }
              : undefined
          }
        />
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
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
                Epley: {kgToDisplay(oneRM.epley, unit)} {unit} • Brzycki:{' '}
                {kgToDisplay(oneRM.brzycki, unit)} {unit}
              </Text>
            </View>

            {/* Training Percentage Table */}
            <Text style={styles.tableHeading}>SUGGESTED TRAINING LOADS</Text>
            <View style={styles.percentagesGrid}>
              {percentages.map((p, idx) => (
                <View key={idx} style={styles.pctRow}>
                  <Text style={styles.pctLabel}>{p.pct}%</Text>
                  <Text style={styles.pctReps}>({p.reps})</Text>
                  <Text style={styles.pctValue}>
                    {kgToDisplay(p.load, unit)} {unit}
                  </Text>
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

            <AppTouchable
              style={styles.actionBtn}
              onPress={() => setShowPlateCalc(true)}
              accessibilityRole="button"
              accessibilityLabel="Open plate calculator"
            >
              <Calculator size={18} color={colors.black} />
              <Text style={styles.actionBtnText}>Open Plate Calculator</Text>
            </AppTouchable>
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
                Beg: {kgToDisplay(60, unit)} {unit} • Int: {kgToDisplay(100, unit)} {unit} • Adv:{' '}
                {kgToDisplay(135, unit)} {unit}
              </Text>
            </View>
            <View style={styles.standardRow}>
              <Text style={styles.standardLift}>Barbell Squat</Text>
              <Text style={styles.standardValues}>
                Beg: {kgToDisplay(80, unit)} {unit} • Int: {kgToDisplay(130, unit)} {unit} • Adv:{' '}
                {kgToDisplay(175, unit)} {unit}
              </Text>
            </View>
            <View style={styles.standardRow}>
              <Text style={styles.standardLift}>Deadlift</Text>
              <Text style={styles.standardValues}>
                Beg: {kgToDisplay(95, unit)} {unit} • Int: {kgToDisplay(155, unit)} {unit} • Adv:{' '}
                {kgToDisplay(210, unit)} {unit}
              </Text>
            </View>
            <View style={styles.standardRow}>
              <Text style={styles.standardLift}>Overhead Press</Text>
              <Text style={styles.standardValues}>
                Beg: {kgToDisplay(40, unit)} {unit} • Int: {kgToDisplay(65, unit)} {unit} • Adv:{' '}
                {kgToDisplay(90, unit)} {unit}
              </Text>
            </View>
          </View>

          <DataTransferSection backup={backup} csv={csv} gyms={analytics.gyms} />
        </ScrollView>
      )}

      <PlateCalculatorModal
        visible={showPlateCalc}
        initialWeight={numWeight || 100}
        onClose={() => setShowPlateCalc(false)}
      />

      <BodyWeightModal
        visible={showBodyWeightLog}
        entries={bodyWeight.entries}
        unit={unit}
        onSave={bodyWeight.logWeight}
        onDelete={bodyWeight.deleteWeight}
        onClose={() => setShowBodyWeightLog(false)}
      />
    </View>
  );
};

export const AnalyticsScreen = React.memo(AnalyticsScreenInner);

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
  sectionSwitcher: {
    marginTop: 14,
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
});
