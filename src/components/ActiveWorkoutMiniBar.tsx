import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronUp, Play, Clock, Dumbbell, Timer } from 'lucide-react-native';
import { useRestTimer, useWorkout, useWorkoutClock } from '../context/WorkoutContext';
import { useSettings } from '../context/SettingsContext';
import { formatWeight } from '../utils/units';
import { formatTimer } from '../utils/calculator';
import { colors } from '../theme';
import { workoutVolumeKg } from '../workout/tracking';

export const ActiveWorkoutMiniBar: React.FC = () => {
  const { isWorkingOut, isMinimized, activeWorkout, maximizeWorkout } = useWorkout();
  const elapsedSeconds = useWorkoutClock();
  const restTimer = useRestTimer();
  const { unit } = useSettings();

  if (!isWorkingOut || !isMinimized || !activeWorkout) {
    return null;
  }

  // Calculate completed volume
  const volume = workoutVolumeKg(activeWorkout.exercises);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={maximizeWorkout}
      activeOpacity={0.9}
    >
      <View style={styles.leftSection}>
        <View style={styles.pulseDot} />
        <View>
          <Text style={styles.workoutName} numberOfLines={1}>
            {activeWorkout.name}
          </Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Clock size={11} color={colors.textSecondary} />
              <Text style={styles.metricText}>{formatTimer(elapsedSeconds)}</Text>
            </View>
            <Text style={styles.dot}>•</Text>
            <View style={styles.metricItem}>
              <Dumbbell size={11} color={colors.textSecondary} />
              <Text style={styles.metricText}>{formatWeight(volume, unit)}</Text>
            </View>
            {restTimer?.isActive && restTimer.remainingSeconds > 0 && (
              <>
                <Text style={styles.dot}>•</Text>
                <View style={styles.metricItem}>
                  <Timer size={11} color={colors.success} />
                  <Text style={[styles.metricText, { color: colors.success, fontWeight: '700' }]}>
                    Rest: {formatTimer(restTimer.remainingSeconds)}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      </View>

      <View style={styles.resumeBtn}>
        <Text style={styles.resumeBtnText}>Resume</Text>
        <ChevronUp size={16} color={colors.black} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 62,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  workoutName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  dot: {
    color: colors.textFaint,
    fontSize: 10,
  },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 12,
    gap: 4,
  },
  resumeBtnText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '700',
  },
});
