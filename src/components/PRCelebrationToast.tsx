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
import { Medal } from './ui';

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
  const isGold = achievement.rank === 1;
  const isSilver = achievement.rank === 2;

  const rankTitle = isGold ? 'NEW GOLD PR!' : isSilver ? 'NEW 2ND BEST!' : 'NEW 3RD BEST!';
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
        style={[
          styles.card,
          isGold
            ? styles.cardGold
            : isSilver
            ? styles.cardSilver
            : styles.cardBronze,
        ]}
        activeOpacity={0.9}
        onPress={handleDismiss}
        accessibilityRole="alert"
        accessibilityLabel={`${rankTitle} ${exerciseName}`}
      >
        <View style={styles.medalCircle}>
          <Medal rank={achievement.rank} size={30} numbered />
        </View>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text
              style={[
                styles.title,
                isGold
                  ? styles.titleGold
                  : isSilver
                  ? styles.titleSilver
                  : styles.titleBronze,
              ]}
            >
              {rankTitle}
            </Text>
            {secondaryCount > 0 && (
              <View style={styles.secondaryPill}>
                <Text style={styles.secondaryPillText}>+{secondaryCount} more</Text>
              </View>
            )}
          </View>
          <Text style={styles.exerciseName} numberOfLines={1}>
            {exerciseName}
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
          <X size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 38,
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 10,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: colors.surfaceAlt,
  },
  cardGold: {
    borderColor: colors.warning,
    backgroundColor: '#1C1917',
  },
  cardSilver: {
    borderColor: colors.textSecondary,
    backgroundColor: colors.surfaceSunken,
  },
  cardBronze: {
    borderColor: colors.warning,
    backgroundColor: '#1C1917',
  },
  medalCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#292524',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  medalEmoji: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  titleGold: {
    color: colors.gold,
  },
  titleSilver: {
    color: colors.text,
  },
  titleBronze: {
    color: '#FDBA74',
  },
  secondaryPill: {
    backgroundColor: colors.control,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  secondaryPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSoft,
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: 1,
  },
  metrics: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
    marginLeft: 6,
  },
});
