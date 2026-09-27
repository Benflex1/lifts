import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronRight, Edit2 } from 'lucide-react-native';
import { Exercise } from '../types';
import { getExerciseRowViewModel } from '../utils/exercise-ui';
import { colors } from '../theme';
import { ExerciseVisual } from './ExerciseVisual';

interface ExerciseListRowProps {
  exercise: Exercise;
  onPress: (exercise: Exercise) => void;
  onEdit?: (exercise: Exercise) => void;
  /** Multi-select mode: shows a checkbox on the right. */
  selectable?: boolean;
  selected?: boolean;
  /** Shows a trailing chevron for built-in exercises (detail navigation). */
  showChevron?: boolean;
}

/**
 * One exercise in a long list. Memoized so that selecting or filtering only re-renders the rows
 * whose props actually changed; pass stable handlers (see useStableCallback).
 */
function ExerciseListRowInner({
  exercise,
  onPress,
  onEdit,
  selectable = false,
  selected = false,
  showChevron = false,
}: ExerciseListRowProps) {
  const { visualAccessibilityLabel } = getExerciseRowViewModel(exercise);

  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      <TouchableOpacity
        style={styles.main}
        onPress={() => onPress(exercise)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={exercise.name}
      >
        <ExerciseVisual exercise={exercise} size="compact" accessibilityLabel={visualAccessibilityLabel} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {exercise.name}
            </Text>
            {exercise.isCustom && (
              <View style={styles.customBadge}>
                <Text style={styles.customBadgeText}>Custom</Text>
              </View>
            )}
          </View>
          <View style={styles.tagRow}>
            <Text style={styles.tagMuscle} numberOfLines={1}>
              {exercise.primaryMuscles.join(', ') || 'General'}
            </Text>
            <Text style={styles.tagDot}>·</Text>
            <Text style={styles.tagEquipment} numberOfLines={1}>
              {exercise.equipment}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {exercise.isCustom && onEdit && (
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => onEdit(exercise)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${exercise.name}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Edit2 size={16} color={colors.textSoft} />
        </TouchableOpacity>
      )}

      {selectable ? (
        <TouchableOpacity
          style={[styles.checkCircle, selected && styles.checkCircleSelected]}
          onPress={() => onPress(exercise)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          aria-checked={selected}
          accessibilityLabel={`Select ${exercise.name}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {selected && <Check size={16} color={colors.onPrimary} strokeWidth={3} />}
        </TouchableOpacity>
      ) : showChevron && !exercise.isCustom ? (
        <ChevronRight size={18} color={colors.textFaint} />
      ) : null}
    </View>
  );
}

export const ExerciseListRow = React.memo(ExerciseListRowInner);

/** FlatList tuning for rows with images: render about a screen ahead instead of ten. */
export const EXERCISE_LIST_PERFORMANCE_PROPS = {
  initialNumToRender: 10,
  maxToRenderPerBatch: 8,
  updateCellsBatchingPeriod: 40,
  windowSize: 5,
} as const;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 16,
    marginBottom: 2,
  },
  rowSelected: {
    backgroundColor: colors.primarySoft,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  customBadge: {
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  customBadgeText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 5,
  },
  tagMuscle: {
    color: colors.textSecondary,
    fontSize: 13,
    textTransform: 'capitalize',
    flexShrink: 1,
  },
  tagDot: {
    color: colors.textFaint,
    fontSize: 13,
  },
  tagEquipment: {
    color: colors.textMuted,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    marginLeft: 8,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  checkCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
