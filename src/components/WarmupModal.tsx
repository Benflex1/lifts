import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { X, Flame, Check, Dumbbell, Layers } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ActiveExercise } from '../types';
import { WeightUnit, kgToDisplay, displayToKg } from '../utils/units';
import {
  WarmupPreset,
  WARMUP_PRESETS,
  getDefaultBarWeight,
  generateWarmupRamp,
  formatPlateBreakdown,
  getDefaultIncrement,
} from '../workout/warmup';
import { WeightInput } from './WeightInput';

interface WarmupModalProps {
  visible: boolean;
  activeExercise: ActiveExercise | null;
  unit: WeightUnit;
  onClose: () => void;
  onApplyWarmupSets: (
    warmupSets: { weightKg: number; reps: number }[],
    replaceExisting: boolean
  ) => void;
}

export const WarmupModal: React.FC<WarmupModalProps> = ({
  visible,
  activeExercise,
  unit,
  onClose,
  onApplyWarmupSets,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<WarmupPreset>('strength');
  const [workingWeightDisplay, setWorkingWeightDisplay] = useState<number>(0);
  const [barWeightDisplay, setBarWeightDisplay] = useState<number>(20);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(true);

  // Initialize weights when modal becomes visible or activeExercise changes
  useEffect(() => {
    if (!visible || !activeExercise) return;

    // Detect bar weight based on equipment
    const defaultBar = getDefaultBarWeight(
      activeExercise.exercise?.equipment,
      activeExercise.exercise?.category,
      unit
    );
    setBarWeightDisplay(defaultBar);

    // Detect working weight from first normal working set or ghost stats
    let initialWorkingKg = 0;
    const workingSet = activeExercise.sets.find((s) => s.type !== 'warmup' && s.weightKg > 0);
    if (workingSet) {
      initialWorkingKg = workingSet.weightKg;
    } else {
      const ghostSet = activeExercise.sets.find((s) => (s.previousWeightKg || 0) > 0);
      if (ghostSet && ghostSet.previousWeightKg) {
        initialWorkingKg = ghostSet.previousWeightKg;
      } else {
        // Sensible fallback
        initialWorkingKg = defaultBar > 0 ? (unit === 'lb' ? displayToKg(135, 'lb') : 60) : (unit === 'lb' ? displayToKg(50, 'lb') : 20);
      }
    }

    setWorkingWeightDisplay(kgToDisplay(initialWorkingKg, unit));
  }, [visible, activeExercise, unit]);

  const workingWeightKg = useMemo(() => {
    return displayToKg(workingWeightDisplay, unit);
  }, [workingWeightDisplay, unit]);

  const barWeightKg = useMemo(() => {
    return displayToKg(barWeightDisplay, unit);
  }, [barWeightDisplay, unit]);

  const generatedRamp = useMemo(() => {
    if (workingWeightKg <= 0) return [];
    return generateWarmupRamp({
      workingWeightKg,
      barWeightKg,
      unit,
      preset: selectedPreset,
      roundIncrement: getDefaultIncrement(unit),
    });
  }, [workingWeightKg, barWeightKg, unit, selectedPreset]);

  if (!visible || !activeExercise) return null;

  const handleApply = () => {
    if (generatedRamp.length === 0) return;
    if (Platform.OS !== 'web') {
      try {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (_) {}
    }

    const setsToApply = generatedRamp.map((s) => ({
      weightKg: s.weightKg,
      reps: s.reps,
    }));

    onApplyWarmupSets(setsToApply, replaceExisting);
    onClose();
  };

  const exerciseName = activeExercise.exercise?.name || 'Exercise';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Flame size={20} color="#F59E0B" />
              <Text style={styles.headerTitle}>Warmup Calculator</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close warmup calculator"
            >
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.exerciseSubtitle} numberOfLines={1}>
            {exerciseName}
          </Text>

          <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled">
            {/* Working Weight & Bar Configuration */}
            <View style={styles.configSection}>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Target Working Weight ({unit})</Text>
                <View style={styles.weightInputWrap}>
                  <WeightInput
                    value={workingWeightKg}
                    isEdited={true}
                    onCommit={(newKg: number) => {
                      setWorkingWeightDisplay(kgToDisplay(newKg, unit));
                    }}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Bar Baseline</Text>
                <View style={styles.barChipsRow}>
                  <TouchableOpacity
                    style={[
                      styles.chip,
                      barWeightDisplay === (unit === 'lb' ? 45 : 20) && styles.chipActive,
                    ]}
                    onPress={() => setBarWeightDisplay(unit === 'lb' ? 45 : 20)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        barWeightDisplay === (unit === 'lb' ? 45 : 20) && styles.chipTextActive,
                      ]}
                    >
                      {unit === 'lb' ? '45 lb (Bar)' : '20 kg (Bar)'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.chip,
                      barWeightDisplay === (unit === 'lb' ? 35 : 15) && styles.chipActive,
                    ]}
                    onPress={() => setBarWeightDisplay(unit === 'lb' ? 35 : 15)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        barWeightDisplay === (unit === 'lb' ? 35 : 15) && styles.chipTextActive,
                      ]}
                    >
                      {unit === 'lb' ? '35 lb' : '15 kg'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.chip, barWeightDisplay === 0 && styles.chipActive]}
                    onPress={() => setBarWeightDisplay(0)}
                  >
                    <Text style={[styles.chipText, barWeightDisplay === 0 && styles.chipTextActive]}>
                      None (0)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Protocol / Preset Selection */}
            <View style={styles.presetsSection}>
              <Text style={styles.fieldLabel}>Warmup Protocol</Text>
              <View style={styles.presetButtonsGrid}>
                {(['strength', 'hypertrophy', 'quick', 'heavy'] as WarmupPreset[]).map((presetKey) => {
                  const p = WARMUP_PRESETS[presetKey];
                  const isSelected = selectedPreset === presetKey;
                  return (
                    <TouchableOpacity
                      key={presetKey}
                      style={[styles.presetCard, isSelected && styles.presetCardActive]}
                      onPress={() => setSelectedPreset(presetKey)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.presetHeader}>
                        <Text
                          style={[styles.presetTitle, isSelected && styles.presetTitleActive]}
                        >
                          {p.name.split('/')[0].trim()}
                        </Text>
                        <Text
                          style={[styles.presetCount, isSelected && styles.presetCountActive]}
                        >
                          {p.steps.length} sets
                        </Text>
                      </View>
                      <Text style={styles.presetDesc} numberOfLines={2}>
                        {p.description}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Calculated Warmup Ramp Table */}
            <View style={styles.tableSection}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { width: 34 }]}>SET</Text>
                <Text style={[styles.th, { width: 50 }]}>%</Text>
                <Text style={[styles.th, { flex: 1 }]}>WEIGHT</Text>
                <Text style={[styles.th, { width: 44, textAlign: 'center' }]}>REPS</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>PLATES / SIDE</Text>
              </View>

              {generatedRamp.map((step) => {
                const platesSummary = formatPlateBreakdown(step.plates, unit);
                return (
                  <View key={`ramp-${step.setIndex}`} style={styles.tableRow}>
                    <View style={styles.warmupBadge}>
                      <Text style={styles.warmupBadgeText}>W</Text>
                    </View>
                    <Text style={styles.tdPct}>{step.label}</Text>
                    <Text style={styles.tdWeight}>
                      {step.displayWeight} {unit}
                    </Text>
                    <Text style={styles.tdReps}>{step.reps}</Text>
                    <Text style={styles.tdPlates} numberOfLines={1}>
                      {platesSummary || '—'}
                    </Text>
                  </View>
                );
              })}

              {generatedRamp.length === 0 && (
                <Text style={styles.emptyNotice}>
                  Enter a target weight above bar weight to preview warmup sets.
                </Text>
              )}
            </View>

            {/* Options */}
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => setReplaceExisting((prev) => !prev)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, replaceExisting && styles.checkboxChecked]}>
                {replaceExisting && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
              </View>
              <Text style={styles.optionText}>Replace existing warmup sets</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.applyBtn,
                generatedRamp.length === 0 && styles.applyBtnDisabled,
              ]}
              disabled={generatedRamp.length === 0}
              onPress={handleApply}
            >
              <Flame size={16} color="#FFFFFF" />
              <Text style={styles.applyBtnText}>
                Add {generatedRamp.length} Warmup Sets
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    backgroundColor: '#161922',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262A36',
    overflow: 'hidden',
    display: 'flex',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F9FAFB',
  },
  closeButton: {
    padding: 4,
  },
  exerciseSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    paddingHorizontal: 16,
    marginTop: 2,
    marginBottom: 12,
  },
  scrollArea: {
    paddingHorizontal: 16,
  },
  configSection: {
    backgroundColor: '#1E232F',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    gap: 12,
  },
  inputGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weightInputWrap: {
    width: 100,
    height: 38,
  },
  barChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#161922',
  },
  chipActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#78350F30',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  chipTextActive: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  presetsSection: {
    marginBottom: 14,
    gap: 8,
  },
  presetButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#1E232F',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#2D3342',
  },
  presetCardActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#2A2318',
  },
  presetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  presetTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  presetTitleActive: {
    color: '#FBBF24',
  },
  presetCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  presetCountActive: {
    color: '#F59E0B',
  },
  presetDesc: {
    fontSize: 11,
    color: '#9CA3AF',
    lineHeight: 14,
  },
  tableSection: {
    backgroundColor: '#1E232F',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2D3342',
    marginBottom: 4,
  },
  th: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#252B3B',
  },
  warmupBadge: {
    width: 24,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#372B10',
    borderWidth: 1,
    borderColor: '#78350F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  warmupBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F59E0B',
  },
  tdPct: {
    width: 50,
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  tdWeight: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#F3F4F6',
  },
  tdReps: {
    width: 44,
    fontSize: 13,
    fontWeight: '600',
    color: '#E5E7EB',
    textAlign: 'center',
  },
  tdPlates: {
    flex: 1.2,
    fontSize: 11,
    fontWeight: '500',
    color: '#38BDF8',
    textAlign: 'right',
  },
  emptyNotice: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 16,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#4B5563',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
  },
  checkboxChecked: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  optionText: {
    fontSize: 13,
    color: '#D1D5DB',
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#262A36',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#1E232F',
    borderWidth: 1,
    borderColor: '#374151',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  applyBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#D97706',
  },
  applyBtnDisabled: {
    opacity: 0.5,
  },
  applyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
