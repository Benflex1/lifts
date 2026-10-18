import React from 'react';
import { Modal, Text, View } from 'react-native';
import { AppTouchable } from '../../components/ui';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Clock,
  Gauge,
  MapPin,
  Trash2,
  X,
} from 'lucide-react-native';
import { colors } from '../../theme';
import { styles } from '../activeWorkoutStyles';

export interface WorkoutOptionsMenuProps {
  visible: boolean;
  workoutName: string;
  gymTrackingEnabled: boolean;
  activeGymName: string | null;
  showRpeColumn: boolean;
  bottomInset: number;
  onClose: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onReorder: () => void;
  onChangeGym: () => void;
  onAdjustDuration: () => void;
  onToggleRpeColumn: () => void;
  onDiscard: () => void;
}

export const WorkoutOptionsMenu: React.FC<WorkoutOptionsMenuProps> = ({
  visible,
  workoutName,
  gymTrackingEnabled,
  activeGymName,
  showRpeColumn,
  bottomInset,
  onClose,
  onExpandAll,
  onCollapseAll,
  onReorder,
  onChangeGym,
  onAdjustDuration,
  onToggleRpeColumn,
  onDiscard,
}) => {
  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <AppTouchable
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={onClose}
        accessible={false}
      >
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(20, bottomInset + 12) }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle} numberOfLines={1}>
              {workoutName}
            </Text>
            <AppTouchable
              onPress={onClose}
              style={styles.modalCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="Close workout options"
            >
              <X size={20} color={colors.textSecondary} />
            </AppTouchable>
          </View>

          <AppTouchable
            style={styles.menuItem}
            onPress={onExpandAll}
            accessibilityRole="button"
            accessibilityLabel="Expand all exercises"
          >
            <ChevronDown size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Expand All Exercises</Text>
          </AppTouchable>

          <AppTouchable
            style={styles.menuItem}
            onPress={onCollapseAll}
            accessibilityRole="button"
            accessibilityLabel="Collapse all exercises"
          >
            <ChevronUp size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Collapse All Exercises</Text>
          </AppTouchable>

          <AppTouchable
            style={styles.menuItem}
            onPress={onReorder}
            accessibilityRole="button"
            accessibilityLabel="Reorder exercises"
          >
            <ArrowUpDown size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Reorder Exercises</Text>
          </AppTouchable>

          {gymTrackingEnabled && activeGymName && (
            <AppTouchable
              style={styles.menuItem}
              onPress={onChangeGym}
              accessibilityRole="button"
              accessibilityLabel={`Change workout gym, currently ${activeGymName}`}
            >
              <MapPin size={18} color={colors.textSecondary} />
              <Text style={styles.menuItemText} numberOfLines={1}>
                Change Gym · {activeGymName}
              </Text>
            </AppTouchable>
          )}

          <AppTouchable
            style={styles.menuItem}
            onPress={onAdjustDuration}
            accessibilityRole="button"
            accessibilityLabel="Adjust workout duration"
          >
            <Clock size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>Adjust Workout Time</Text>
          </AppTouchable>

          <AppTouchable
            style={styles.menuItem}
            onPress={onToggleRpeColumn}
            accessibilityRole="button"
            accessibilityLabel={showRpeColumn ? 'Hide RPE column' : 'Show RPE column'}
          >
            <Gauge size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>
              {showRpeColumn ? 'Hide RPE Column' : 'Show RPE Column'}
            </Text>
          </AppTouchable>

          <AppTouchable
            style={[styles.menuItem, styles.menuItemDestructive]}
            onPress={onDiscard}
            accessibilityRole="button"
            accessibilityLabel="Discard workout"
          >
            <Trash2 size={18} color={colors.danger} />
            <Text style={styles.menuItemTextDestructive}>Discard Workout</Text>
          </AppTouchable>
        </View>
      </AppTouchable>
    </Modal>
  );
};
