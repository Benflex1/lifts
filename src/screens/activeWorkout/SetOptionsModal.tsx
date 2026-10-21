import React from 'react';
import { Modal, Text, View } from 'react-native';
import { AppTouchable } from '../../components/ui';
import { ArrowDown, ArrowUp, Calculator, Trash2, Trophy, X } from 'lucide-react-native';
import { ActiveExercise, SetType, WorkoutSet } from '../../types';
import { WeightUnit, kgToDisplay } from '../../utils/units';
import { RPE_CHIPS } from '../../workout/sets';
import { WorkoutPRSummary, formatPRDescription } from '../../workout/pr';
import { colors } from '../../theme';
import { styles } from '../activeWorkoutStyles';
import { computeDropSetSuggestions, findPreviousWorkingSet } from './activeWorkoutLogic';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';

export interface SetOptionsTarget {
  activeExerciseId: string;
  exerciseName: string;
  set: WorkoutSet;
}

export interface SetOptionsModalProps {
  target: SetOptionsTarget | null;
  exercises: ActiveExercise[];
  prSummary: WorkoutPRSummary | null;
  unit: WeightUnit;
  bottomInset: number;
  onClose: () => void;
  onSelectType: (type: SetType) => void;
  onSelectRpe: (rpe: number | null) => void;
  onMoveSet: (direction: -1 | 1) => void;
  onSetDropWeight: (weightKg: number) => void;
  onOpenPlateCalculator: () => void;
  onDeleteSet: () => void;
}

const SET_TYPE_CHIPS = [
  { type: 'normal', label: 'Normal' },
  { type: 'warmup', label: 'Warmup (W)' },
  { type: 'drop', label: 'Drop (D)' },
  { type: 'failure', label: 'Failure (F)' },
] as const;

export const SetOptionsModal: React.FC<SetOptionsModalProps> = ({
  target,
  exercises,
  prSummary,
  unit,
  bottomInset,
  onClose,
  onSelectType,
  onSelectRpe,
  onMoveSet,
  onSetDropWeight,
  onOpenPlateCalculator,
  onDeleteSet,
}) => {
  const setPR = target ? prSummary?.setPRs.get(target.set.id) : undefined;

  const modalExercise = exercises.find(e => e.id === target?.activeExerciseId);
  const currentSetIndex = modalExercise?.sets.findIndex(s => s.id === target?.set.id) ?? -1;
  const totalSets = modalExercise?.sets.length ?? 0;
  const isFirstSet = currentSetIndex <= 0;
  const isLastSet = currentSetIndex >= totalSets - 1;

  // A11Y-04: modal container traps screen-reader focus and takes iOS focus on open.

  const modalA11yRef = useModalAccessibility(target !== null);
  return (
    <Modal
      visible={target !== null}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View ref={modalA11yRef} accessibilityViewIsModal style={styles.modalBackdrop}>
        <View style={[styles.setOptionsSheet, { paddingBottom: Math.max(20, bottomInset + 12) }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalHeaderTitle}>Set {target?.set.setNumber} Details</Text>
              <Text style={styles.modalHeaderSubtitle}>{target?.exerciseName}</Text>
            </View>
            <AppTouchable
              onPress={onClose}
              style={styles.modalCloseBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close set options"
            >
              <X size={20} color={colors.textSecondary} />
            </AppTouchable>
          </View>

          {/* PR Achievement Banner */}
          {setPR && (
            <View style={styles.prOptionsBanner}>
              <View style={styles.prOptionsBannerHeader}>
                <Trophy size={16} color={colors.warning} />
                <Text style={styles.prOptionsBannerTitle}>
                  {setPR.primary?.rank === 1
                    ? 'PERSONAL RECORD (1ST BEST)'
                    : setPR.primary?.rank === 2
                      ? 'SILVER RECORD (2ND BEST)'
                      : 'BRONZE RECORD (3RD BEST)'}
                </Text>
              </View>
              {setPR.achievements.map((ach, idx) => (
                <Text key={idx} style={styles.prOptionsDetailText}>
                  • {formatPRDescription(ach, unit)}
                </Text>
              ))}
            </View>
          )}

          {/* Set Type Selector */}
          <View style={styles.optionsSection}>
            <Text style={styles.sectionLabel}>SET TYPE</Text>
            <View style={styles.typeChipsRow}>
              {SET_TYPE_CHIPS.map(t => {
                const isSelected = target?.set.type === t.type;
                return (
                  <AppTouchable
                    key={t.type}
                    style={[styles.typeChip, isSelected && styles.typeChipActive]}
                    onPress={() => onSelectType(t.type)}
                    accessibilityRole="button"
                    accessibilityLabel={`Set type ${t.label}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={[styles.typeChipText, isSelected && styles.typeChipTextActive]}>
                      {t.label}
                    </Text>
                  </AppTouchable>
                );
              })}
            </View>

            {/* Quick Drop Set Load Reduction Helper */}
            {(() => {
              if (!target || target.set.type !== 'drop') return null;
              const dropExercise = exercises.find(e => e.id === target.activeExerciseId);
              const setIdx = dropExercise?.sets.findIndex(s => s.id === target.set.id) ?? -1;
              const prevWorkingSet = findPreviousWorkingSet(dropExercise?.sets ?? [], setIdx);
              if (!prevWorkingSet || !prevWorkingSet.weightKg || prevWorkingSet.weightKg <= 0)
                return null;

              const prevDisplay = kgToDisplay(prevWorkingSet.weightKg, unit);
              const dropReductions = computeDropSetSuggestions(prevWorkingSet, unit);

              return (
                <View style={styles.dropHelperBox}>
                  <Text style={styles.dropHelperTitle}>DROP SET WEIGHT SUGGESTIONS</Text>
                  <Text style={styles.dropHelperDesc}>
                    Based on Set #{prevWorkingSet.setNumber} ({prevDisplay} {unit}):
                  </Text>
                  <View style={styles.dropChipsRow}>
                    {dropReductions.map(r => {
                      const isCurrent = Math.abs(target.set.weightKg - r.kg) < 0.05;
                      return (
                        <AppTouchable
                          key={r.pct}
                          style={[styles.dropChip, isCurrent && styles.dropChipActive]}
                          onPress={() => onSetDropWeight(r.kg)}
                          accessibilityRole="button"
                          accessibilityLabel={`Drop weight minus ${r.pct} percent`}
                          accessibilityState={{ selected: isCurrent }}
                        >
                          <Text style={[styles.dropChipPct, isCurrent && styles.dropChipPctActive]}>
                            -{r.pct}%
                          </Text>
                          <Text
                            style={[
                              styles.dropChipWeight,
                              isCurrent && styles.dropChipWeightActive,
                            ]}
                          >
                            {kgToDisplay(r.kg, unit)} {unit}
                          </Text>
                        </AppTouchable>
                      );
                    })}
                  </View>
                </View>
              );
            })()}
          </View>

          {/* Fast 1-Tap RPE / Effort Grid */}
          <View style={styles.optionsSection}>
            <View style={styles.rpeSectionHeader}>
              <Text style={styles.sectionLabel}>RPE / EFFORT</Text>
              <Text style={styles.rpeSublabel}>(1-tap selection)</Text>
            </View>

            <View style={styles.rpeChipsGrid}>
              {RPE_CHIPS.map(val => {
                const isSelected = val === null ? target?.set.rpe == null : target?.set.rpe === val;
                return (
                  <AppTouchable
                    key={val === null ? 'none' : val.toString()}
                    style={[styles.rpeChip, isSelected && styles.rpeChipActive]}
                    onPress={() => onSelectRpe(val)}
                    accessibilityRole="button"
                    accessibilityLabel={`RPE ${val === null ? 'none' : val}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={[styles.rpeChipText, isSelected && styles.rpeChipTextActive]}>
                      {val === null ? 'None' : val.toString()}
                    </Text>
                  </AppTouchable>
                );
              })}
            </View>

            {/* RPE Helper Legend */}
            <View style={styles.rpeLegend}>
              <Text style={styles.rpeLegendItem}>• RPE 10: Max Effort (0 RIR)</Text>
              <Text style={styles.rpeLegendItem}>• RPE 9: 1 Rep in Reserve</Text>
              <Text style={styles.rpeLegendItem}>• RPE 8: 2 Reps in Reserve</Text>
              <Text style={styles.rpeLegendItem}>• RPE 7: 3 Reps in Reserve</Text>
            </View>
          </View>

          {/* Quick Action Shortcuts: Reorder */}
          <View style={styles.optionsSection}>
            <View style={styles.rpeSectionHeader}>
              <Text style={styles.sectionLabel}>REORDER SET</Text>
              <Text style={styles.rpeSublabel}>
                {currentSetIndex >= 0 ? `Set ${currentSetIndex + 1} of ${totalSets}` : ''}
              </Text>
            </View>
            <View style={styles.setOptionsActions}>
              <AppTouchable
                style={[styles.shortcutBtn, isFirstSet && styles.btnDisabled]}
                disabled={isFirstSet}
                onPress={() => {
                  if (target && !isFirstSet) {
                    onMoveSet(-1);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Move set up"
              >
                <ArrowUp size={16} color={isFirstSet ? colors.textFaint : colors.purpleLight} />
                <Text
                  style={[
                    styles.shortcutBtnText,
                    { color: isFirstSet ? colors.textFaint : colors.purpleLight },
                  ]}
                >
                  Move Up {currentSetIndex > 0 ? `(to #${currentSetIndex})` : ''}
                </Text>
              </AppTouchable>

              <AppTouchable
                style={[styles.shortcutBtn, isLastSet && styles.btnDisabled]}
                disabled={isLastSet}
                onPress={() => {
                  if (target && !isLastSet) {
                    onMoveSet(1);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Move set down"
              >
                <ArrowDown size={16} color={isLastSet ? colors.textFaint : colors.purpleLight} />
                <Text
                  style={[
                    styles.shortcutBtnText,
                    { color: isLastSet ? colors.textFaint : colors.purpleLight },
                  ]}
                >
                  Move Down{' '}
                  {currentSetIndex >= 0 && currentSetIndex < totalSets - 1
                    ? `(to #${currentSetIndex + 2})`
                    : ''}
                </Text>
              </AppTouchable>
            </View>
          </View>

          {/* Quick Action Shortcuts: Tools */}
          <View style={styles.setOptionsActions}>
            <AppTouchable
              style={styles.shortcutBtn}
              onPress={() => {
                if (target) {
                  onOpenPlateCalculator();
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Open plate calculator"
            >
              <Calculator size={16} color={colors.primary} />
              <Text style={styles.shortcutBtnText}>Plate Calculator</Text>
            </AppTouchable>

            <AppTouchable
              style={styles.shortcutDeleteBtn}
              onPress={() => {
                if (target) {
                  onDeleteSet();
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Delete set"
            >
              <Trash2 size={16} color={colors.danger} />
              <Text style={styles.shortcutDeleteText}>Delete Set</Text>
            </AppTouchable>
          </View>

          <AppTouchable
            style={styles.doneModalBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.doneModalBtnText}>Done</Text>
          </AppTouchable>
        </View>
      </View>
    </Modal>
  );
};
