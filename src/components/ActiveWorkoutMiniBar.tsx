import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronUp, Play, Clock, Dumbbell } from 'lucide-react-native';
import { useWorkout } from '../context/WorkoutContext';
import { formatTimer } from '../utils/calculator';

export const ActiveWorkoutMiniBar: React.FC = () => {
  const { isWorkingOut, isMinimized, activeWorkout, elapsedSeconds, maximizeWorkout } = useWorkout();

  if (!isWorkingOut || !isMinimized || !activeWorkout) {
    return null;
  }

  // Calculate completed volume
  let volume = 0;
  for (const ex of activeWorkout.exercises) {
    for (const s of ex.sets) {
      if (s.isCompleted) {
        volume += s.weightKg * s.reps;
      }
    }
  }

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
              <Clock size={11} color="#9CA3AF" />
              <Text style={styles.metricText}>{formatTimer(elapsedSeconds)}</Text>
            </View>
            <Text style={styles.dot}>•</Text>
            <View style={styles.metricItem}>
              <Dumbbell size={11} color="#9CA3AF" />
              <Text style={styles.metricText}>{volume.toLocaleString()} kg</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.resumeBtn}>
        <Text style={styles.resumeBtnText}>Resume</Text>
        <ChevronUp size={16} color="#000000" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E232E',
    borderTopWidth: 1,
    borderTopColor: '#2D3442',
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
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
    backgroundColor: '#10B981',
  },
  workoutName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
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
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  dot: {
    color: '#4B5563',
    fontSize: 10,
  },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 4,
  },
  resumeBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
});
