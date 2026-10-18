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
import { useModalAccessibility } from '../../hooks/useModalAccessibility';
import { useI18n } from '../../i18n';

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
  const { t } = useI18n();
  // A11Y-04: modal container traps screen-reader focus and takes iOS focus on open.
  const modalA11yRef = useModalAccessibility(visible);

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
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
              {workoutName}
            </Text>
            <AppTouchable
              onPress={onClose}
              style={styles.modalCloseBtn}
              accessibilityRole="button"
              accessibilityLabel={t('menu.close')}
            >
              <X size={20} color={colors.textSecondary} />
            </AppTouchable>
          </View>

          <AppTouchable
            style={styles.menuItem}
            onPress={onExpandAll}
            accessibilityRole="button"
            accessibilityLabel={t('menu.expandAll')}
          >
            <ChevronDown size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>{t('menu.expandAllVisible')}</Text>
          </AppTouchable>

          <AppTouchable
            style={styles.menuItem}
            onPress={onCollapseAll}
            accessibilityRole="button"
            accessibilityLabel={t('menu.collapseAll')}
          >
            <ChevronUp size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>{t('menu.collapseAllVisible')}</Text>
          </AppTouchable>

          <AppTouchable
            style={styles.menuItem}
            onPress={onReorder}
            accessibilityRole="button"
            accessibilityLabel={t('menu.reorder')}
          >
            <ArrowUpDown size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>{t('menu.reorderVisible')}</Text>
          </AppTouchable>

          {gymTrackingEnabled && activeGymName && (
            <AppTouchable
              style={styles.menuItem}
              onPress={onChangeGym}
              accessibilityRole="button"
              accessibilityLabel={t('menu.changeGymA11y', { gym: activeGymName })}
            >
              <MapPin size={18} color={colors.textSecondary} />
              <Text style={styles.menuItemText} numberOfLines={1}>
                {t('menu.changeGym', { gym: activeGymName })}
              </Text>
            </AppTouchable>
          )}

          <AppTouchable
            style={styles.menuItem}
            onPress={onAdjustDuration}
            accessibilityRole="button"
            accessibilityLabel={t('menu.adjustTime')}
          >
            <Clock size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>{t('menu.adjustTimeVisible')}</Text>
          </AppTouchable>

          <AppTouchable
            style={styles.menuItem}
            onPress={onToggleRpeColumn}
            accessibilityRole="button"
            accessibilityLabel={showRpeColumn ? t('menu.hideRpeA11y') : t('menu.showRpeA11y')}
          >
            <Gauge size={18} color={colors.textSecondary} />
            <Text style={styles.menuItemText}>
              {showRpeColumn ? t('menu.hideRpe') : t('menu.showRpe')}
            </Text>
          </AppTouchable>

          <AppTouchable
            style={[styles.menuItem, styles.menuItemDestructive]}
            onPress={onDiscard}
            accessibilityRole="button"
            accessibilityLabel={t('menu.discardA11y')}
          >
            <Trash2 size={18} color={colors.danger} />
            <Text style={styles.menuItemTextDestructive}>{t('menu.discard')}</Text>
          </AppTouchable>
        </View>
      </AppTouchable>
    </Modal>
  );
};
