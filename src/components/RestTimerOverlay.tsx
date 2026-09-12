import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Timer, Plus, Minus, X } from 'lucide-react-native';
import { useWorkout } from '../context/WorkoutContext';
import { formatTimer } from '../utils/calculator';

export interface RestTimerOverlayProps {
  nextUpText?: string | null;
}

export const RestTimerOverlay: React.FC<RestTimerOverlayProps> = ({ nextUpText }) => {
  const { restTimer, adjustRestTimer, stopRestTimer } = useWorkout();

  if (!restTimer.isActive || restTimer.remainingSeconds <= 0) {
    return null;
  }

  const isWarning = restTimer.remainingSeconds <= 3 && restTimer.remainingSeconds > 0;
  const accentColor = isWarning ? '#F59E0B' : '#10B981';

  const progressPercent = Math.min(
    100,
    Math.max(0, ((restTimer.totalSeconds - restTimer.remainingSeconds) / restTimer.totalSeconds) * 100)
  );

  return (
    <View style={[styles.floatingContainer, isWarning && styles.floatingContainerWarning]}>
      {/* Progress Line */}
      <View style={styles.progressBarBackground}>
        <View style={[styles.progressBarFill, { width: `${progressPercent}%`, backgroundColor: accentColor }]} />
      </View>

      <View style={styles.contentRow}>
        <View style={styles.leftInfo}>
          <View style={[styles.timerIconWrap, isWarning && styles.timerIconWrapWarning]}>
            <Timer size={18} color={accentColor} />
          </View>
          <View>
            <Text style={[styles.timerTitle, isWarning && styles.timerTitleWarning]}>
              {isWarning ? `Get Ready! (${restTimer.remainingSeconds})` : 'Rest Time'}
            </Text>
            <Text style={[styles.timerCountdown, { color: accentColor }]}>
              {formatTimer(restTimer.remainingSeconds)}
            </Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.adjustButton}
            onPress={() => adjustRestTimer(-30)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Minus size={16} color="#D1D5DB" />
            <Text style={styles.adjustText}>30s</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.adjustButton}
            onPress={() => adjustRestTimer(30)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Plus size={16} color="#D1D5DB" />
            <Text style={styles.adjustText}>30s</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={stopRestTimer}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={18} color="#D1D5DB" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Up Next in Superset / Exercise Cue */}
      {nextUpText ? (
        <View style={styles.nextUpContainer}>
          <View style={styles.nextUpBadge}>
            <Text style={styles.nextUpBadgeText}>NEXT</Text>
          </View>
          <Text style={styles.nextUpText} numberOfLines={1}>
            {nextUpText}
          </Text>
        </View>
      ) : null}
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
  floatingContainerWarning: {
    borderColor: '#F59E0B66',
  },
  timerIconWrapWarning: {
    backgroundColor: '#382510',
  },
  timerTitleWarning: {
    color: '#F59E0B',
  },
  progressBarBackground: {
    height: 4,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  leftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#132E27',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerTitle: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timerCountdown: {
    fontSize: 22,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adjustButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2E3B',
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  adjustText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  skipButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2E3B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  nextUpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161922',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#2A303F',
    gap: 8,
  },
  nextUpBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#8B5CF625',
    borderWidth: 1,
    borderColor: '#8B5CF660',
  },
  nextUpBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#A78BFA',
    letterSpacing: 0.5,
  },
  nextUpText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#E5E7EB',
  },
});
