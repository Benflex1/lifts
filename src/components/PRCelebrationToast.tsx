import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRAchievement, formatPRDescription } from '../workout/pr';
import { WeightUnit } from '../utils/units';
import { colors } from '../theme';
import { PRMark, PR_RANK_COLORS } from './ui';
import { formatWeight } from '../utils/units';

export interface PRCelebrationEvent {
  exerciseName: string;
  weightKg: number;
  reps: number;
  achievement: PRAchievement;
  secondaryCount?: number;
}

interface PRCelebrationToastProps {
  event: PRCelebrationEvent | null;
  unit: WeightUnit;
  onDismiss: () => void;
}

export const PRCelebrationToast: React.FC<PRCelebrationToastProps> = ({
  event,
  unit,
  onDismiss,
}) => {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!event) return;

    if (Platform.OS !== 'web') {
      try {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    }

    // Animate in
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 8,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto dismiss after 3.5s
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      handleDismiss();
    }, 3500);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [event]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -80,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  if (!event) return null;

  const { achievement, exerciseName, weightKg, reps, secondaryCount = 0 } = event;
  const accent = PR_RANK_COLORS[achievement.rank];
  const rankTitle =
    achievement.rank === 1
      ? achievement.isTie
        ? 'Record tied'
        : 'New personal record'
      : achievement.rank === 2
        ? 'Your 2nd best'
        : 'Your 3rd best';
  const setText = weightKg > 0 ? `${formatWeight(weightKg, unit)} × ${reps}` : `${reps} reps`;
  const desc = formatPRDescription(achievement, unit);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: Math.max(Platform.OS === 'ios' ? 52 : 36, insets.top + 8),
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.card, { borderColor: accent + '55' }]}
        activeOpacity={0.9}
        onPress={handleDismiss}
        accessibilityRole="alert"
        accessibilityLabel={`${rankTitle}: ${exerciseName}, ${setText}. ${desc}`}
      >
        <PRMark rank={achievement.rank} size={40} />

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: accent }]}>{rankTitle}</Text>
            {secondaryCount > 0 && <Text style={styles.moreText}>+{secondaryCount} more</Text>}
          </View>
          <Text style={styles.exerciseName} numberOfLines={1}>
            {exerciseName} <Text style={styles.setText}>{setText}</Text>
          </Text>
          <Text style={styles.metrics} numberOfLines={1}>
            {desc}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss PR notification"
        >
          <X size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 38,
    left: 12,
    right: 12,
    zIndex: 9999,
    elevation: 10,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: colors.surfaceAlt,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
  },
  moreText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  setText: {
    fontWeight: '600',
    color: colors.textSecondary,
  },
  metrics: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
});
