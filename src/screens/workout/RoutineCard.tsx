import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Folder, Layers, MoreHorizontal, Play } from 'lucide-react-native';
import { Routine } from '../../types';
import { IconButton } from '../../components/ui';
import { colors } from '../../theme';
import { styles } from '../workoutStyles';
import { buildRoutineSummary } from './workoutScreenLogic';
import { useI18n } from '../../i18n';

export interface RoutineCardProps {
  routine: Routine;
  /** True while the 'All' folder is selected, which is when the folder tag shows. */
  showFolderTag: boolean;
  onOpenMenu: (routine: Routine) => void;
  onStart: (routine: Routine) => void;
}

/** ARCH-13: presentational routine card for the workout screen. */
export const RoutineCard: React.FC<RoutineCardProps> = ({
  routine,
  showFolderTag,
  onOpenMenu,
  onStart,
}) => {
  const { t } = useI18n();
  const { hasSupersets, exerciseCount, setCount, preview } = buildRoutineSummary(routine);

  return (
    <View style={styles.routineCard}>
      <View style={styles.routineCardHeader}>
        <View style={styles.routineTitleGroup}>
          <Text style={styles.routineName} numberOfLines={2}>
            {routine.name}
          </Text>
          <View style={styles.routineMetaRow}>
            <Text style={styles.routineMeta}>
              {exerciseCount === 1
                ? t('workout.routineMetaOne', { exercises: exerciseCount, sets: setCount })
                : t('workout.routineMetaOther', { exercises: exerciseCount, sets: setCount })}
            </Text>
            {routine.folderName && showFolderTag && (
              <View style={styles.metaTag}>
                <Folder size={11} color={colors.textMuted} />
                <Text style={styles.metaTagText}>{routine.folderName}</Text>
              </View>
            )}
            {hasSupersets && (
              <View style={[styles.metaTag, styles.supersetTag]}>
                <Layers size={11} color={colors.purpleLight} />
                <Text style={[styles.metaTagText, { color: colors.purpleLight }]}>
                  {t('workout.supersets')}
                </Text>
              </View>
            )}
          </View>
        </View>

        <IconButton
          icon={MoreHorizontal}
          tone="ghost"
          size={34}
          onPress={() => onOpenMenu(routine)}
          accessibilityLabel={`${routine.name} options`}
        />
      </View>

      {preview.length > 0 && (
        <Text style={styles.exPreview} numberOfLines={2}>
          {preview}
        </Text>
      )}

      <TouchableOpacity
        style={styles.startRoutineBtn}
        onPress={() => onStart(routine)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('workout.startRoutineOf', { name: routine.name })}
      >
        <Play size={15} color={colors.primaryLight} fill={colors.primaryLight} />
        <Text style={styles.startRoutineBtnText}>{t('workout.startRoutine')}</Text>
      </TouchableOpacity>
    </View>
  );
};
