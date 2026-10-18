import React from 'react';
import { Modal, Text, View } from 'react-native';
import { AppTouchable } from '../../components/ui';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calculator,
  FileText,
  Flame,
  Info,
  Layers,
  Repeat,
  Timer,
  Trash2,
  X,
} from 'lucide-react-native';
import { ActiveExercise } from '../../types';
import { colors } from '../../theme';
import { styles } from '../activeWorkoutStyles';
import { isMoveDownDisabled, isMoveUpDisabled } from './activeWorkoutLogic';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';

export interface ExerciseOptionsMenuProps {
  exercise: ActiveExercise | null;
  exerciseIndex: number;
  exerciseCount: number;
  bottomInset: number;
  onClose: () => void;
  onViewDetails: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onReorderAll: () => void;
  onSwap: () => void;
  onSetRestTimer: () => void;
  onOpenPlateCalculator: () => void;
  onQuickWarmup: () => void;
  onWarmupCalculator: () => void;
  onEditSuperset: () => void;
  onUngroupSuperset: () => void;
  onEditNote: () => void;
  onRemoveExercise: () => void;
}

export const ExerciseOptionsMenu: React.FC<ExerciseOptionsMenuProps> = ({
  exercise,
  exerciseIndex,
  exerciseCount,
  bottomInset,
  onClose,
  onViewDetails,
  onMoveUp,
  onMoveDown,
  onReorderAll,
  onSwap,
  onSetRestTimer,
  onOpenPlateCalculator,
  onQuickWarmup,
  onWarmupCalculator,
  onEditSuperset,
  onUngroupSuperset,
  onEditNote,
  onRemoveExercise,
}) => {
  const moveUpDisabled = isMoveUpDisabled(exerciseIndex);
  const moveDownDisabled = isMoveDownDisabled(exerciseIndex, exerciseCount);

  // A11Y-04: modal container traps screen-reader focus and takes iOS focus on open.

  const modalA11yRef = useModalAccessibility(exercise !== null);
  return (
    <Modal
      visible={exercise !== null}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <AppTouchable
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={onClose}
        accessible={false}
      >
        <View
          ref={modalA11yRef}
          accessibilityViewIsModal
          style={[styles.sheetContainer, { paddingBottom: Math.max(20, bottomInset + 12) }]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle} numberOfLines={1}>
              {exercise?.exercise?.name}
            </Text>
            <AppTouchable
              onPress={onClose}
              style={styles.modalCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="Close exercise options"
            >
              <X size={20} color={colors.textSecondary} />
            </AppTouchable>
          </View>

          <AppTouchable
            style={styles.menuItem}
            onPress={onViewDetails}
            accessibilityRole="button"
            accessibilityLabel="View exercise details"
          >
            <Info size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>View Exercise Details</Text>
          </AppTouchable>

          <AppTouchable
            style={[styles.menuItem, moveUpDisabled && styles.menuItemDisabled]}
            disabled={moveUpDisabled}
            onPress={onMoveUp}
            accessibilityRole="button"
            accessibilityLabel="Move exercise up"
            accessibilityState={{ disabled: moveUpDisabled }}
          >
            <ArrowUp size={18} color={moveUpDisabled ? colors.textFaint : colors.textSecondary} />
            <Text style={styles.menuItemText}>Move Up</Text>
          </AppTouchable>

          <AppTouchable
            style={[styles.menuItem, moveDownDisabled && styles.menuItemDisabled]}
            disabled={moveDownDisabled}
            onPress={onMoveDown}
            accessibilityRole="button"
            accessibilityLabel="Move exercise down"
            accessibilityState={{ disabled: moveDownDisabled }}
          >
            <ArrowDown
              size={18}
              color={moveDownDisabled ? colors.textFaint : colors.textSecondary}
            />
            <Text style={styles.menuItemText}>Move Down</Text>
          </AppTouchable>

          <AppTouchable
            style={styles.menuItem}
            onPress={onReorderAll}
            accessibilityRole="button"
            accessibilityLabel="Reorder all exercises"
          >
            <ArrowUpDown size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Reorder All Exercises</Text>
          </AppTouchable>

          <AppTouchable
            style={styles.menuItem}
            onPress={onSwap}
            accessibilityRole="button"
            accessibilityLabel="Swap exercise"
          >
            <Repeat size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Swap Exercise</Text>
          </AppTouchable>

          <AppTouchable
            style={styles.menuItem}
            onPress={onSetRestTimer}
            accessibilityRole="button"
            accessibilityLabel="Set rest timer"
          >
            <Timer size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Set Rest Timer</Text>
          </AppTouchable>

          <AppTouchable
            style={styles.menuItem}
            onPress={onOpenPlateCalculator}
            accessibilityRole="button"
            accessibilityLabel="Open plate calculator"
          >
            <Calculator size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Plate Calculator</Text>
          </AppTouchable>

          <AppTouchable
            style={styles.menuItem}
            onPress={onQuickWarmup}
            accessibilityRole="button"
            accessibilityLabel="Add warm-up set"
          >
            <Flame size={18} color="#F97316" />
            <Text style={styles.menuItemText}>Add Warm-up Set</Text>
          </AppTouchable>

          <AppTouchable
            style={styles.menuItem}
            onPress={onWarmupCalculator}
            accessibilityRole="button"
            accessibilityLabel="Open warm-up calculator"
          >
            <Calculator size={18} color="#F97316" />
            <Text style={styles.menuItemText}>Warm-up Calculator...</Text>
          </AppTouchable>

          <AppTouchable
            style={styles.menuItem}
            onPress={onEditSuperset}
            accessibilityRole="button"
            accessibilityLabel={exercise?.supersetId ? 'Edit superset' : 'Create superset'}
          >
            <Layers size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>
              {exercise?.supersetId ? 'Edit Superset' : 'Create Superset'}
            </Text>
          </AppTouchable>

          {exercise?.supersetId && (
            <AppTouchable
              style={styles.menuItem}
              onPress={onUngroupSuperset}
              accessibilityRole="button"
              accessibilityLabel="Ungroup superset"
            >
              <Layers size={18} color={colors.danger} />
              <Text style={[styles.menuItemText, { color: colors.danger }]}>Ungroup Superset</Text>
            </AppTouchable>
          )}

          <AppTouchable
            style={styles.menuItem}
            onPress={onEditNote}
            accessibilityRole="button"
            accessibilityLabel="Add or edit exercise note"
          >
            <FileText size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Add / Edit Note</Text>
          </AppTouchable>

          <AppTouchable
            style={[styles.menuItem, styles.menuItemDestructive]}
            onPress={onRemoveExercise}
            accessibilityRole="button"
            accessibilityLabel="Remove exercise"
          >
            <Trash2 size={18} color={colors.danger} />
            <Text style={styles.menuItemTextDestructive}>Remove Exercise</Text>
          </AppTouchable>
        </View>
      </AppTouchable>
    </Modal>
  );
};
