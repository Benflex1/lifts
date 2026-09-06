import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { Calculator, Award, Dumbbell, ShieldCheck, Download } from 'lucide-react-native';
import { calculate1RM } from '../utils/calculator';
import { PlateCalculatorModal } from '../components/PlateCalculatorModal';
import { getWorkoutHistory } from '../database/db';

export const AnalyticsScreen: React.FC = () => {
  // 1RM calculator state
  const [weight, setWeight] = useState('100');
  const [reps, setReps] = useState('5');
  const [showPlateCalc, setShowPlateCalc] = useState(false);

  const numWeight = parseFloat(weight) || 0;
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
      const history = await getWorkoutHistory();
      Alert.alert(
        'Data Export',
        `Successfully retrieved ${history.length} logged workouts. Your data is stored 100% locally on your device with no paywalls or external tracking.`
      );
    } catch (e) {
      Alert.alert('Export Error', 'Could not export data.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tools & Analytics</Text>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
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
              <Text style={styles.inputLabel}>LIFTED WEIGHT (KG)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="decimal-pad"
                value={weight}
                onChangeText={setWeight}
              />
            </View>

            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>REPETITIONS</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="number-pad"
                value={reps}
                onChangeText={setReps}
              />
            </View>
          </View>

          {/* 1RM Output Big Display */}
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>ESTIMATED 1RM</Text>
            <Text style={styles.resultValue}>{oneRM.average} kg</Text>
            <Text style={styles.resultFormula}>
              Epley: {oneRM.epley} kg • Brzycki: {oneRM.brzycki} kg
            </Text>
          </View>

          {/* Training Percentage Table */}
          <Text style={styles.tableHeading}>SUGGESTED TRAINING LOADS</Text>
          <View style={styles.percentagesGrid}>
            {percentages.map((p, idx) => (
              <View key={idx} style={styles.pctRow}>
                <Text style={styles.pctLabel}>{p.pct}%</Text>
                <Text style={styles.pctReps}>({p.reps})</Text>
                <Text style={styles.pctValue}>{p.load} kg</Text>
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
            <Text style={styles.standardValues}>Beg: 60kg • Int: 100kg • Adv: 135kg</Text>
          </View>
          <View style={styles.standardRow}>
            <Text style={styles.standardLift}>Barbell Squat</Text>
            <Text style={styles.standardValues}>Beg: 80kg • Int: 130kg • Adv: 175kg</Text>
          </View>
          <View style={styles.standardRow}>
            <Text style={styles.standardLift}>Deadlift</Text>
            <Text style={styles.standardValues}>Beg: 95kg • Int: 155kg • Adv: 210kg</Text>
          </View>
          <View style={styles.standardRow}>
            <Text style={styles.standardLift}>Overhead Press</Text>
            <Text style={styles.standardValues}>Beg: 40kg • Int: 65kg • Adv: 90kg</Text>
          </View>
        </View>

        {/* Data Ownership */}
        <TouchableOpacity style={styles.exportCard} onPress={handleExportData}>
          <Download size={20} color="#9CA3AF" />
          <Text style={styles.exportCardText}>Backup & Export Workout Data</Text>
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
