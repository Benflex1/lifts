import React from 'react';
import { Text, View } from 'react-native';
import { AppTouchable } from '../../components/ui';
import { ChevronDown, MoreHorizontal } from 'lucide-react-native';
import { useWorkoutClock } from '../../context/WorkoutContext';
import { formatTimer } from '../../utils/calculator';
import { WeightUnit, formatWeight } from '../../utils/units';
import { colors } from '../../theme';
import { styles } from '../activeWorkoutStyles';
import { useI18n } from '../../i18n';

/**
 * Renders the ticking workout duration without re-rendering the whole logger every
 * second. The duration button lives here so its accessibility value follows the
 * clock without re-rendering the header.
 */
const LiveWorkoutClock: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const { t } = useI18n();
  const elapsedSeconds = useWorkoutClock();
  const formatted = formatTimer(elapsedSeconds);

  return (
    <AppTouchable
      style={styles.metricColumn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('logger.workoutDuration')}
      accessibilityHint={t('logger.durationHint')}
      accessibilityValue={{ text: formatted }}
    >
      <Text style={[styles.metricColValue, { color: colors.primary }]}>{formatted}</Text>
      <Text style={styles.metricColLabel}>{t('logger.duration')}</Text>
    </AppTouchable>
  );
};

export interface WorkoutHeaderProps {
  workoutName: string;
  gymName: string | null;
  showGym: boolean;
  isDeload: boolean;
  isFinishing: boolean;
  unit: WeightUnit;
  liveVolume: number;
  completedSetsCount: number;
  totalSetsCount: number;
  topInset: number;
  onMinimize: () => void;
  onOpenMenu: () => void;
  onFinish: () => void;
  onOpenDuration: () => void;
}

export const WorkoutHeader: React.FC<WorkoutHeaderProps> = ({
  workoutName,
  gymName,
  showGym,
  isDeload,
  isFinishing,
  unit,
  liveVolume,
  completedSetsCount,
  totalSetsCount,
  topInset,
  onMinimize,
  onOpenMenu,
  onFinish,
  onOpenDuration,
}) => {
  const { t } = useI18n();
  return (
    <>
      {/* Top App Bar */}
      <View style={[styles.topBar, { paddingTop: Math.max(50, topInset + 8) }]}>
        <AppTouchable
          onPress={onMinimize}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={t('logger.minimize')}
          accessibilityRole="button"
        >
          <ChevronDown size={22} color={colors.textSoft} />
        </AppTouchable>

        <View style={styles.topBarTitleWrap}>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {workoutName}
          </Text>
          {isDeload ? (
            <Text style={[styles.topBarSubtitle, styles.topBarDeload]} numberOfLines={1}>
              Deload week
              {showGym && gymName ? ` · ${gymName}` : ''}
            </Text>
          ) : showGym && gymName ? (
            <Text style={styles.topBarSubtitle} numberOfLines={1}>
              {gymName}
            </Text>
          ) : null}
        </View>

        <View style={styles.topRightWrap}>
          <AppTouchable
            onPress={onOpenMenu}
            style={styles.moreBtn}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityLabel={t('logger.menu')}
            accessibilityRole="button"
          >
            <MoreHorizontal size={20} color={colors.textSoft} />
          </AppTouchable>

          <AppTouchable
            onPress={onFinish}
            style={[styles.finishBtn, isFinishing && styles.btnDisabled]}
            disabled={isFinishing}
            accessibilityRole="button"
            accessibilityLabel={t('logger.finishA11y')}
            accessibilityState={{ busy: isFinishing, disabled: isFinishing }}
          >
            <Text style={styles.finishBtnText}>
              {isFinishing ? t('logger.saving') : t('logger.finish')}
            </Text>
          </AppTouchable>
        </View>
      </View>

      {/* Live Metrics Strip */}
      <View style={styles.metricsContainer}>
        <LiveWorkoutClock onPress={onOpenDuration} />
        <View style={styles.metricColumn}>
          <Text style={styles.metricColValue}>{formatWeight(liveVolume, unit)}</Text>
          <Text style={styles.metricColLabel}>{t('logger.volume')}</Text>
        </View>
        <View style={styles.metricColumn}>
          <Text style={styles.metricColValue}>
            {completedSetsCount}
            <Text style={styles.metricColValueMuted}> / {totalSetsCount}</Text>
          </Text>
          <Text style={styles.metricColLabel}>{t('logger.sets')}</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${totalSetsCount > 0 ? Math.round((completedSetsCount / totalSetsCount) * 100) : 0}%`,
            },
          ]}
        />
      </View>
    </>
  );
};
