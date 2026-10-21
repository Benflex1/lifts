import React from 'react';
import { Text, View } from 'react-native';
import { Check, Flame } from 'lucide-react-native';
import { WeekSnapshot } from '../../workout/week-summary';
import { WeightUnit, formatWeight } from '../../utils/units';
import { colors } from '../../theme';
import { styles } from '../workoutStyles';
import { formatWeekDuration } from './workoutScreenLogic';

export interface WeekSummaryCardProps {
  week: WeekSnapshot;
  unit: WeightUnit;
}

/** ARCH-13: presentational week-in-review card for the workout screen. */
export const WeekSummaryCard: React.FC<WeekSummaryCardProps> = ({ week, unit }) => (
  <View style={styles.weekCard}>
    <View style={styles.weekHeader}>
      <Text style={styles.weekTitle}>This week</Text>
      {week.streakWeeks > 1 && (
        <View style={styles.streakPill}>
          <Flame size={13} color={colors.warning} />
          <Text style={styles.streakText}>{week.streakWeeks} week streak</Text>
        </View>
      )}
    </View>
    <View style={styles.weekDays}>
      {week.days.map(day => (
        <View key={day.dateKey} style={styles.weekDay}>
          <View
            style={[
              styles.weekDot,
              day.trained && styles.weekDotTrained,
              day.isToday && !day.trained && styles.weekDotToday,
            ]}
          >
            {day.trained && <Check size={14} color={colors.onPrimary} strokeWidth={3} />}
          </View>
          <Text style={[styles.weekDayLabel, day.isToday && styles.weekDayLabelToday]}>
            {day.label}
          </Text>
        </View>
      ))}
    </View>
    <View style={styles.weekStats}>
      <View style={styles.weekStat}>
        <Text style={styles.weekStatValue}>{week.workouts}</Text>
        <Text style={styles.weekStatLabel}>{week.workouts === 1 ? 'workout' : 'workouts'}</Text>
      </View>
      <View style={styles.weekStat}>
        <Text style={styles.weekStatValue}>{formatWeight(week.volumeKg, unit)}</Text>
        <Text style={styles.weekStatLabel}>volume</Text>
      </View>
      <View style={styles.weekStat}>
        <Text style={styles.weekStatValue}>{formatWeekDuration(week.durationSeconds)}</Text>
        <Text style={styles.weekStatLabel}>trained</Text>
      </View>
    </View>
  </View>
);
