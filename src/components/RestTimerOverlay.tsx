import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Timer, Plus, Minus, X } from 'lucide-react-native';
import { useWorkout } from '../context/WorkoutContext';
import { formatTimer } from '../utils/calculator';

export const RestTimerOverlay: React.FC = () => {
  const { restTimer, adjustRestTimer, stopRestTimer } = useWorkout();

  if (!restTimer.isActive || restTimer.remainingSeconds <= 0) {
    return null;
  }

  const progressPercent = Math.min(
    100,
    Math.max(0, ((restTimer.totalSeconds - restTimer.remainingSeconds) / restTimer.totalSeconds) * 100)
  );

  return (
    <View style={styles.floatingContainer}>
      {/* Progress Line */}
      <View style={styles.progressBarBackground}>
        <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
      </View>

      <View style={styles.contentRow}>
        <View style={styles.leftInfo}>
          <View style={styles.timerIconWrap}>
            <Timer size={18} color="#10B981" />
          </View>
          <View>
            <Text style={styles.timerTitle}>Rest Time</Text>
            <Text style={styles.timerCountdown}>{formatTimer(restTimer.remainingSeconds)}</Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.adjustButton}
            onPress={() => adjustRestTimer(-30)}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Minus size={14} color="#D1D5DB" />
            <Text style={styles.adjustText}>30s</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.adjustButton}
            onPress={() => adjustRestTimer(30)}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Plus size={14} color="#D1D5DB" />
            <Text style={styles.adjustText}>30s</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={stopRestTimer}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    bottom: 75,
    left: 16,
    right: 16,
    backgroundColor: '#1E2129',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#2F3442',
    overflow: 'hidden',
    zIndex: 999,
  },
  progressBarBackground: {
    height: 3,
    backgroundColor: '#262A34',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  leftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#132E27',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerTitle: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  timerCountdown: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adjustButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2E3B',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 2,
  },
  adjustText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  skipButton: {
    padding: 6,
    marginLeft: 2,
  },
});
