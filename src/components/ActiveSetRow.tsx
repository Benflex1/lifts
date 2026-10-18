import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { SetType, WorkoutSet } from '../types';
import { kgToDisplay, WeightUnit } from '../utils/units';
import { formatPreviousMetric } from '../workout/gym-display';
import { isSameSetPRResult, SetPRResult } from '../workout/pr';
import { colors } from '../theme';
import { styles } from '../screens/activeWorkoutStyles';
import { SwipeableSetRow } from './SwipeableSetRow';
import { WeightInput } from './WeightInput';
import { RepsInput } from './RepsInput';
import { PRBadge } from './PRBadge';

function getSetBadgeStyle(type: SetType) {
  switch (type) {
    case 'warmup':
      return { bg: colors.warningSoft, border: 'transparent', text: colors.warning, label: 'W' };
    case 'drop':
      return { bg: colors.purpleSoft, border: 'transparent', text: colors.purpleLight, label: 'D' };
    case 'failure':
      return { bg: colors.dangerSoft, border: 'transparent', text: colors.danger, label: 'F' };
    default:
      return { bg: 'transparent', border: 'transparent', text: colors.textSoft, label: '' };
  }
}

export interface ActiveSetRowProps {
  set: WorkoutSet;
  exerciseId: string;
  exerciseName: string;
  targetReps?: string;
  unit: WeightUnit;
  showRpeColumn: boolean;
  gymTrackingEnabled: boolean;
  setPR?: SetPRResult;
  onToggleSet: (exerciseId: string, setId: string) => void;
  onApplyPrevious: (exerciseId: string, set: WorkoutSet, targetReps?: string) => void;
  onUpdateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  onRemoveSet: (exerciseId: string, setId: string) => void;
  onOpenSetOptions: (exerciseId: string, exerciseName: string, set: WorkoutSet) => void;
  onInputFocus: (event: any, inputRef?: React.RefObject<any>) => void;
}

export function areRowPropsEqual(prev: ActiveSetRowProps, next: ActiveSetRowProps): boolean {
  if (prev.set !== next.set) return false;
  if (prev.exerciseId !== next.exerciseId) return false;
  if (prev.exerciseName !== next.exerciseName) return false;
  if (prev.targetReps !== next.targetReps) return false;
  if (prev.unit !== next.unit) return false;
  if (prev.showRpeColumn !== next.showRpeColumn) return false;
  if (prev.gymTrackingEnabled !== next.gymTrackingEnabled) return false;
  if (!isSameSetPRResult(prev.setPR, next.setPR)) return false;
  if (prev.onToggleSet !== next.onToggleSet) return false;
  if (prev.onApplyPrevious !== next.onApplyPrevious) return false;
  if (prev.onUpdateSet !== next.onUpdateSet) return false;
  if (prev.onRemoveSet !== next.onRemoveSet) return false;
  if (prev.onOpenSetOptions !== next.onOpenSetOptions) return false;
  if (prev.onInputFocus !== next.onInputFocus) return false;
  return true;
}

export const ActiveSetRow = React.memo(function ActiveSetRow({
  set,
  exerciseId,
  exerciseName,
  targetReps,
  unit,
  showRpeColumn,
  gymTrackingEnabled,
  setPR,
  onToggleSet,
  onApplyPrevious,
  onUpdateSet,
  onRemoveSet,
  onOpenSetOptions,
  onInputFocus,
}: ActiveSetRowProps) {
  const badge = getSetBadgeStyle(set.type);

  return (
  <SwipeableSetRow
    key={set.id}
    isCompleted={set.isCompleted}
    onDelete={() => onRemoveSet(exerciseId, set.id)}
  >
    <View
      style={[styles.setRow, set.isCompleted && styles.setRowCompleted]}
    >
      {/* Set Number / Type Toggle Badge */}
      <TouchableOpacity
        style={[
          styles.setBadge,
          { backgroundColor: badge.bg, borderColor: badge.border },
        ]}
        onPress={() =>
          onOpenSetOptions(exerciseId, exerciseName, set)
        }
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <Text style={[styles.setBadgeText, { color: badge.text }]}>
          {badge.label || set.setNumber}
        </Text>
      </TouchableOpacity>

      {/* Previous Performance Comparison / PR Medal */}
      <View style={styles.previousCell}>
        {set.isCompleted && setPR?.primary ? (
          <View style={styles.prBadgeWrap}>
            <PRBadge
              achievement={setPR!.primary!}
              compact
              showGym={gymTrackingEnabled}
              additionalCount={Math.max(0, (setPR?.achievements.length || 0) - 1)}
              onPress={() =>
                onOpenSetOptions(exerciseId, exerciseName, set)
              }
            />
          </View>
        ) : (set.previousWeightKg !== undefined || set.previousReps !== undefined) ? (
          <TouchableOpacity
            style={styles.previousButton}
            onPress={() => onApplyPrevious(exerciseId, set, targetReps)}
            disabled={set.isCompleted}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={`Apply previous stats: ${formatPreviousMetric(
              {
                weightKg: set.previousWeightKg ?? 0,
                reps: set.previousReps ?? 0,
                sourceGymId: set.previousGymId,
                sourceGymName: gymTrackingEnabled ? set.previousGymName : undefined,
              },
              unit,
            )}`}
          >
            <Text style={[styles.previousText, !set.isCompleted && styles.previousTextClickable]}>
              {formatPreviousMetric(
                {
                  weightKg: set.previousWeightKg ?? 0,
                  reps: set.previousReps ?? 0,
                  sourceGymId: set.previousGymId,
                  sourceGymName: gymTrackingEnabled ? set.previousGymName : undefined,
                },
                unit,
              )}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.previousPlaceholder}>—</Text>
        )}
      </View>

      {/* Weight Input */}
      <View style={styles.inputWrapWeight}>
        <WeightInput
          value={set.weightKg}
          isEdited={set.isWeightEdited}
          onCommit={(w, edited) =>
            onUpdateSet(exerciseId, set.id, {
              weightKg: w,
              isWeightEdited: edited !== undefined ? edited : true,
            })
          }
          placeholder={
            set.previousWeightKg !== undefined && set.previousWeightKg > 0
              ? kgToDisplay(set.previousWeightKg, unit).toString()
              : '-'
          }
          completed={set.isCompleted}
          style={[styles.cellInput, set.isCompleted && styles.inputCompleted]}
          onFocus={onInputFocus}
        />
      </View>

      {/* Reps Input */}
      <View style={styles.inputWrapReps}>
        <RepsInput
          value={set.reps}
          onCommit={(r) => onUpdateSet(exerciseId, set.id, { reps: r })}
          placeholder={
            targetReps || (set.previousReps ? set.previousReps.toString() : '10')
          }
          completed={set.isCompleted}
          style={[styles.cellInput, set.isCompleted && styles.inputCompleted]}
          onFocus={onInputFocus}
        />
        {/* Compact RPE badge if defined and inline column is hidden */}
        {!showRpeColumn && set.rpe != null && (
          <TouchableOpacity
            style={styles.compactRpeBadge}
            onPress={() =>
              onOpenSetOptions(exerciseId, exerciseName, set)
            }
          >
            <Text style={styles.compactRpeText}>@{set.rpe}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Optional Inline RPE Column */}
      {showRpeColumn && (
        <TouchableOpacity
          style={styles.rpeColCell}
          onPress={() =>
            onOpenSetOptions(exerciseId, exerciseName, set)
          }
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        >
          <Text style={styles.rpeColCellText}>
            {set.rpe != null ? set.rpe.toString() : '–'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Completion Checkbox */}
      <TouchableOpacity
        style={[
          styles.checkBtn,
          set.isCompleted ? styles.checkBtnActive : styles.checkBtnInactive,
        ]}
        onPress={() => onToggleSet(exerciseId, set.id)}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        accessibilityRole="checkbox"
        accessibilityLabel={`Complete set ${set.setNumber}`}
        accessibilityState={{ checked: set.isCompleted }}
        aria-checked={set.isCompleted}
      >
        <Check
          size={20}
          color={set.isCompleted ? colors.black : colors.textFaint}
          strokeWidth={2.8}
        />
      </TouchableOpacity>
    </View>
  </SwipeableSetRow>
  );
}, areRowPropsEqual);
