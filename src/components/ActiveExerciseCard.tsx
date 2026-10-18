import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  FileText,
  MoreHorizontal,
  Plus,
  Timer,
} from 'lucide-react-native';
import { ActiveExercise, Exercise, SetType, WorkoutSet } from '../types';
import { WeightUnit } from '../utils/units';
import { colors } from '../theme';
import { formatDuration } from '../utils/calculator';
import { getExerciseRowViewModel } from '../utils/exercise-ui';
import { ExerciseSupersetMeta } from '../workout/supersets';
import { isSameSetPRResult, WorkoutPRSummary } from '../workout/pr';
import { styles } from '../screens/activeWorkoutStyles';
import { ActiveSetRow } from './ActiveSetRow';
import { ExerciseNoteInput } from './ExerciseNoteInput';
import { ExerciseVisual } from './MemoizedExerciseVisual';

export interface ActiveExerciseCardProps {
  exercise: ActiveExercise;
  supersetMeta?: ExerciseSupersetMeta;
  isExpanded: boolean;
  isNoteEditing: boolean;
  unit: WeightUnit;
  showRpeColumn: boolean;
  gymTrackingEnabled: boolean;
  prSummary: WorkoutPRSummary | null;
  onToggleExpanded: (exerciseId: string) => void;
  onCommitNotes: (exerciseId: string, notes: string) => void;
  onOpenDetail: (exercise: Exercise | null) => void;
  onOpenMenu: (exercise: ActiveExercise) => void;
  onOpenRestWheel: (exercise: ActiveExercise) => void;
  onStartEditingNote: (exerciseId: string) => void;
  onUpdateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  onRemoveSet: (exerciseId: string, setId: string) => void;
  onAddSet: (exerciseId: string, type?: SetType) => void;
  onToggleSet: (exerciseId: string, setId: string) => void;
  onApplyPrevious: (exerciseId: string, set: WorkoutSet, targetReps?: string) => void;
  onOpenSetOptions: (exerciseId: string, exerciseName: string, set: WorkoutSet) => void;
  onInputFocus: (event: any, inputRef?: React.RefObject<any>) => void;
}

function sameCardSetPRs(
  prev: WorkoutPRSummary | null,
  next: WorkoutPRSummary | null,
  sets: WorkoutSet[]
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  for (const set of sets) {
    if (!isSameSetPRResult(prev.setPRs.get(set.id), next.setPRs.get(set.id))) return false;
  }
  return true;
}

function sameSupersetMeta(a?: ExerciseSupersetMeta, b?: ExerciseSupersetMeta): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.groupId === b.groupId &&
    a.label === b.label &&
    a.type === b.type &&
    a.color === b.color &&
    a.isFirst === b.isFirst &&
    a.isLast === b.isLast &&
    a.positionInGroup === b.positionInGroup &&
    a.totalInGroup === b.totalInGroup
  );
}

/**
 * Custom comparison that keeps the heavy card subtree out of renders it does
 * not care about: a set toggle only replaces the owning exercise object, so
 * every other card skips re-rendering unless its own PR badges changed.
 */
export function areCardPropsEqual(prev: ActiveExerciseCardProps, next: ActiveExerciseCardProps): boolean {
  if (prev.exercise !== next.exercise) return false;
  if (prev.isExpanded !== next.isExpanded) return false;
  if (prev.isNoteEditing !== next.isNoteEditing) return false;
  if (prev.unit !== next.unit) return false;
  if (prev.showRpeColumn !== next.showRpeColumn) return false;
  if (prev.gymTrackingEnabled !== next.gymTrackingEnabled) return false;
  if (!sameSupersetMeta(prev.supersetMeta, next.supersetMeta)) return false;
  if (!sameCardSetPRs(prev.prSummary, next.prSummary, next.exercise.sets)) return false;
  if (prev.onToggleExpanded !== next.onToggleExpanded) return false;
  if (prev.onCommitNotes !== next.onCommitNotes) return false;
  if (prev.onOpenDetail !== next.onOpenDetail) return false;
  if (prev.onOpenMenu !== next.onOpenMenu) return false;
  if (prev.onOpenRestWheel !== next.onOpenRestWheel) return false;
  if (prev.onStartEditingNote !== next.onStartEditingNote) return false;
  if (prev.onUpdateSet !== next.onUpdateSet) return false;
  if (prev.onRemoveSet !== next.onRemoveSet) return false;
  if (prev.onAddSet !== next.onAddSet) return false;
  if (prev.onToggleSet !== next.onToggleSet) return false;
  if (prev.onApplyPrevious !== next.onApplyPrevious) return false;
  if (prev.onOpenSetOptions !== next.onOpenSetOptions) return false;
  if (prev.onInputFocus !== next.onInputFocus) return false;
  return true;
}

export const ActiveExerciseCard = React.memo(function ActiveExerciseCard({
  exercise,
  supersetMeta,
  isExpanded,
  isNoteEditing,
  unit,
  showRpeColumn,
  gymTrackingEnabled,
  prSummary,
  onToggleExpanded,
  onCommitNotes,
  onOpenDetail,
  onOpenMenu,
  onOpenRestWheel,
  onStartEditingNote,
  onUpdateSet,
  onRemoveSet,
  onAddSet,
  onToggleSet,
  onApplyPrevious,
  onOpenSetOptions,
  onInputFocus,
}: ActiveExerciseCardProps) {
  const completedCount = exercise.sets.filter((s) => s.isCompleted).length;
  const totalCount = exercise.sets.length;
  const isAllCompleted = totalCount > 0 && completedCount === totalCount;
  const rowViewModel = exercise.exercise ? getExerciseRowViewModel(exercise.exercise) : null;
  const showNoteInput = isNoteEditing || Boolean(exercise.notes && exercise.notes.length > 0);

  const cardElement = !isExpanded ? (
    // Collapsed Accordion Row - Lyfta Screenshot 1
    <TouchableOpacity
      key={exercise.id}
      style={[
        styles.collapsedCard,
        supersetMeta && { borderLeftColor: supersetMeta.color, borderLeftWidth: 3.5 },
      ]}
      onPress={() => onToggleExpanded(exercise.id)}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        style={styles.exerciseAvatar}
        onPress={(e) => {
          e.stopPropagation();
          onOpenDetail(exercise.exercise || null);
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`View ${exercise.exercise?.name || 'exercise'} details`}
      >
        {exercise.exercise ? (
          <ExerciseVisual
            exercise={exercise.exercise}
            size="compact"
            accessibilityLabel={rowViewModel?.visualAccessibilityLabel || 'Exercise illustration'}
          />
        ) : (
          <Dumbbell size={20} color={colors.primary} />
        )}
      </TouchableOpacity>

      <View style={styles.collapsedContent}>
        <Text style={styles.collapsedTitle} numberOfLines={1}>
          {exercise.exercise?.name || 'Exercise'}
        </Text>
        <View style={styles.collapsedMetaRow}>
          {supersetMeta && (
            <View style={[styles.ssPositionBadge, { borderColor: supersetMeta.color, marginRight: 6 }]}>
              <Text style={[styles.ssPositionText, { color: supersetMeta.color }]}>
                {supersetMeta.positionInGroup}/{supersetMeta.totalInGroup}
              </Text>
            </View>
          )}
          <Text
            style={[
              styles.collapsedSubtitle,
              isAllCompleted && styles.completedSubtitleText,
            ]}
          >
            {completedCount}/{totalCount} done
          </Text>
          {isAllCompleted && (
            <CheckCircle2 size={13} color={colors.success} style={{ marginLeft: 4 }} />
          )}
        </View>
      </View>

      <View style={styles.collapsedActions}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={(e) => {
            e.stopPropagation();
            onOpenMenu(exercise);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          accessibilityLabel="Exercise menu"
          accessibilityRole="button"
        >
          <MoreHorizontal size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <ChevronDown size={18} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  ) : (
    // Expanded Full Exercise Card
    <View
      key={exercise.id}
      style={[
        styles.exerciseCard,
        supersetMeta && { borderLeftColor: supersetMeta.color, borderLeftWidth: 3.5 },
      ]}
    >
      {/* Exercise Header */}
      <View style={styles.cardHeader}>
        <TouchableOpacity
          style={styles.exerciseAvatar}
          onPress={() => onOpenDetail(exercise.exercise || null)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`View ${exercise.exercise?.name || 'exercise'} details`}
        >
          {exercise.exercise ? (
            <ExerciseVisual
              exercise={exercise.exercise}
              size="compact"
              accessibilityLabel={rowViewModel?.visualAccessibilityLabel || 'Exercise illustration'}
            />
          ) : (
            <Dumbbell size={20} color={colors.primary} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.exerciseTitleGroup}
          onPress={() => onOpenDetail(exercise.exercise || null)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`View ${exercise.exercise?.name || 'exercise'} details`}
        >
          <Text style={styles.exerciseName}>{exercise.exercise?.name || 'Exercise'}</Text>
          <View style={styles.badgeRow}>
            <Text style={styles.muscleBadge} numberOfLines={1}>
              {[
                (Array.isArray(exercise.exercise?.primaryMuscles)
                  ? exercise.exercise.primaryMuscles
                  : []
                ).join(', '),
                exercise.exercise?.equipment,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {exercise.targetReps ? (
              <Text style={styles.targetBadge}>{exercise.targetReps} reps</Text>
            ) : null}
            {supersetMeta && (
              <View style={[styles.ssPositionBadge, { borderColor: supersetMeta.color }]}>
                <Text style={[styles.ssPositionText, { color: supersetMeta.color }]}>
                  {supersetMeta.positionInGroup}/{supersetMeta.totalInGroup}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => onOpenMenu(exercise)}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
                <MoreHorizontal size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => onToggleExpanded(exercise.id)}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <ChevronUp size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

      {/* Rest timer + note pills */}
      <View style={styles.exerciseMetaRow}>
        <TouchableOpacity
          style={styles.restTimerRow}
          onPress={() => onOpenRestWheel(exercise)}
          accessibilityRole="button"
          accessibilityLabel="Set rest timer"
        >
          <Timer size={13} color={colors.primaryLight} />
          <Text style={styles.restTimerRowText}>
            Rest {exercise.restTimerSeconds ? formatDuration(exercise.restTimerSeconds) : 'Off'}
          </Text>
        </TouchableOpacity>
        {!showNoteInput && (
          <TouchableOpacity
            style={styles.addNotePrompt}
            onPress={() => onStartEditingNote(exercise.id)}
            accessibilityRole="button"
            accessibilityLabel="Add note"
          >
            <FileText size={13} color={colors.textSecondary} />
            <Text style={styles.addNotePromptText}>Note</Text>
          </TouchableOpacity>
        )}
      </View>

      {showNoteInput && (
        <View style={styles.exerciseNoteRow}>
          <FileText size={13} color={colors.textSecondary} />
          <ExerciseNoteInput
            exerciseId={exercise.id}
            notes={exercise.notes}
            onCommit={onCommitNotes}
            style={styles.exerciseNoteInput}
            placeholder="Add note (e.g. seat pin 4, slow tempo)..."
            placeholderTextColor={colors.textMuted}
            onFocus={onInputFocus}
            autoFocus={isNoteEditing && (!exercise.notes || exercise.notes.length === 0)}
          />
        </View>
      )}

      {/* Table Column Labels */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colHeader, { width: 38, textAlign: 'center' }]}>SET</Text>
        <Text style={[styles.colHeader, { flex: 1, paddingLeft: 8 }]}>PREVIOUS</Text>
        <Text style={[styles.colHeader, { width: 78, textAlign: 'center' }]}>
          {unit.toUpperCase()}
        </Text>
        <Text style={[styles.colHeader, { width: 70, textAlign: 'center' }]}>REPS</Text>
        {showRpeColumn && (
          <Text style={[styles.colHeader, { width: 44, textAlign: 'center' }]}>RPE</Text>
        )}
        <View style={{ width: 46 }} />
      </View>

      {/* Set Rows */}
      {exercise.sets.map((set) => (
        <ActiveSetRow
          key={set.id}
          set={set}
          exerciseId={exercise.id}
          exerciseName={exercise.exercise?.name || 'Exercise'}
          targetReps={exercise.targetReps}
          unit={unit}
          showRpeColumn={showRpeColumn}
          gymTrackingEnabled={gymTrackingEnabled}
          setPR={prSummary?.setPRs.get(set.id)}
          onToggleSet={onToggleSet}
          onApplyPrevious={onApplyPrevious}
          onUpdateSet={onUpdateSet}
          onRemoveSet={onRemoveSet}
          onOpenSetOptions={onOpenSetOptions}
          onInputFocus={onInputFocus}
        />
      ))}

      {/* Add Set Button */}
      <TouchableOpacity
        style={styles.addSetBtnWide}
        onPress={() => onAddSet(exercise.id, 'normal')}
        accessibilityRole="button"
        accessibilityLabel="Add set"
      >
        <Plus size={16} color={colors.text} />
        <Text style={styles.addSetBtnWideText}>Add Set</Text>
      </TouchableOpacity>
    </View>
  );
  return cardElement;
}, areCardPropsEqual);
