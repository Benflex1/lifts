import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, MoreHorizontal } from 'lucide-react-native';
import { useWorkoutClock } from '../../context/WorkoutContext';
import { formatTimer } from '../../utils/calculator';
import { WeightUnit, formatWeight } from '../../utils/units';
import { colors } from '../../theme';
import { styles } from '../activeWorkoutStyles';

/** Renders the ticking workout duration without re-rendering the whole logger every second. */
const LiveWorkoutClock: React.FC = () => {
  const elapsedSeconds = useWorkoutClock();
  return <>{formatTimer(elapsedSeconds)}</>;
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
  return (
    <>
      {/* Top App Bar */}
      <View style={[styles.topBar, { paddingTop: Math.max(50, topInset + 8) }]}>
        <TouchableOpacity
          onPress={onMinimize}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Minimize workout"
          accessibilityRole="button"
        >
          <ChevronDown size={22} color={colors.textSoft} />
        </TouchableOpacity>

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
          <TouchableOpacity
            onPress={onOpenMenu}
            style={styles.moreBtn}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityLabel="Workout menu"
            accessibilityRole="button"
          >
            <MoreHorizontal size={20} color={colors.textSoft} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onFinish}
            style={[styles.finishBtn, isFinishing && styles.btnDisabled]}
            disabled={isFinishing}
            accessibilityRole="button"
            accessibilityLabel="Finish workout"
            accessibilityState={{ busy: isFinishing, disabled: isFinishing }}
          >
            <Text style={styles.finishBtnText}>{isFinishing ? 'Saving...' : 'Finish'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Live Metrics Strip */}
      <View style={styles.metricsContainer}>
        <TouchableOpacity
          style={styles.metricColumn}
          onPress={onOpenDuration}
          accessibilityRole="button"
          accessibilityLabel="Adjust workout duration"
        >
          <Text style={[styles.metricColValue, { color: colors.primary }]}>
            <LiveWorkoutClock />
          </Text>
          <Text style={styles.metricColLabel}>Duration</Text>
        </TouchableOpacity>
        <View style={styles.metricColumn}>
          <Text style={styles.metricColValue}>{formatWeight(liveVolume, unit)}</Text>
          <Text style={styles.metricColLabel}>Volume</Text>
        </View>
        <View style={styles.metricColumn}>
          <Text style={styles.metricColValue}>
            {completedSetsCount}
            <Text style={styles.metricColValueMuted}> / {totalSetsCount}</Text>
          </Text>
          <Text style={styles.metricColLabel}>Sets</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${totalSetsCount > 0 ? Math.round((completedSetsCount / totalSetsCount) * 100) : 0}%` },
          ]}
        />
      </View>
    </>
  );
};
