import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
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

  return (
    <Modal
      visible={exercise !== null}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(20, bottomInset + 12) }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle} numberOfLines={1}>
              {exercise?.exercise?.name}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.menuItem} onPress={onViewDetails}>
            <Info size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>View Exercise Details</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, moveUpDisabled && styles.menuItemDisabled]}
            disabled={moveUpDisabled}
            onPress={onMoveUp}
          >
            <ArrowUp size={18} color={moveUpDisabled ? colors.textFaint : colors.textSecondary} />
            <Text style={styles.menuItemText}>Move Up</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, moveDownDisabled && styles.menuItemDisabled]}
            disabled={moveDownDisabled}
            onPress={onMoveDown}
          >
            <ArrowDown
              size={18}
              color={moveDownDisabled ? colors.textFaint : colors.textSecondary}
            />
            <Text style={styles.menuItemText}>Move Down</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={onReorderAll}
            accessibilityRole="button"
            accessibilityLabel="Reorder all exercises"
          >
            <ArrowUpDown size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Reorder All Exercises</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={onSwap}>
            <Repeat size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Swap Exercise</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={onSetRestTimer}>
            <Timer size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Set Rest Timer</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={onOpenPlateCalculator}>
            <Calculator size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Plate Calculator</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={onQuickWarmup}>
            <Flame size={18} color="#F97316" />
            <Text style={styles.menuItemText}>Add Warm-up Set</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={onWarmupCalculator}>
            <Calculator size={18} color="#F97316" />
            <Text style={styles.menuItemText}>Warm-up Calculator...</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={onEditSuperset}>
            <Layers size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>
              {exercise?.supersetId ? 'Edit Superset' : 'Create Superset'}
            </Text>
          </TouchableOpacity>

          {exercise?.supersetId && (
            <TouchableOpacity style={styles.menuItem} onPress={onUngroupSuperset}>
              <Layers size={18} color={colors.danger} />
              <Text style={[styles.menuItemText, { color: colors.danger }]}>Ungroup Superset</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.menuItem} onPress={onEditNote}>
            <FileText size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Add / Edit Note</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, styles.menuItemDestructive]}
            onPress={onRemoveExercise}
          >
            <Trash2 size={18} color={colors.danger} />
            <Text style={styles.menuItemTextDestructive}>Remove Exercise</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};
