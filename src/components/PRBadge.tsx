import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PRAchievement } from '../workout/pr';

interface PRBadgeProps {
  achievement: PRAchievement;
  compact?: boolean;
  showGym?: boolean;
  onPress?: () => void;
}

export const PRBadge: React.FC<PRBadgeProps> = ({
  achievement,
  compact = false,
  showGym = false,
  onPress,
}) => {
  const { rank, scope, gymName, metric } = achievement;

  const isGold = rank === 1;
  const isSilver = rank === 2;

  const theme = isGold
    ? {
        bg: '#78350F35',
        border: '#F59E0B70',
        text: '#FBBF24',
        emoji: '🥇',
        badgeTitle: scope === 'gym' ? 'Gym PR' : 'PR',
      }
    : isSilver
    ? {
        bg: '#33415545',
        border: '#94A3B870',
        text: '#F1F5F9',
        emoji: '🥈',
        badgeTitle: scope === 'gym' ? 'Gym 2nd' : '2nd',
      }
    : {
        bg: '#451A0345',
        border: '#D9770660',
        text: '#FED7AA',
        emoji: '🥉',
        badgeTitle: scope === 'gym' ? 'Gym 3rd' : '3rd',
      };

  const gymLabel = showGym && gymName ? ` (${gymName})` : '';
  const metricLabel =
    metric === 'weight'
      ? 'Weight'
      : metric === '1rm'
      ? '1RM'
      : metric === 'volume'
      ? 'Volume'
      : 'Reps';

  const content = compact ? (
    <View style={[styles.compactContainer, { backgroundColor: theme.bg, borderColor: theme.border }]}>
      <Text style={styles.compactEmoji}>{theme.emoji}</Text>
      <Text style={[styles.compactText, { color: theme.text }]}>{theme.badgeTitle}</Text>
    </View>
  ) : (
    <View style={[styles.fullContainer, { backgroundColor: theme.bg, borderColor: theme.border }]}>
      <Text style={styles.fullEmoji}>{theme.emoji}</Text>
      <Text style={[styles.fullText, { color: theme.text }]}>
        {theme.badgeTitle} · {metricLabel}
        {gymLabel}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${theme.badgeTitle} ${metricLabel}`}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  compactEmoji: {
    fontSize: 10,
  },
  compactText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  fullContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
  },
  fullEmoji: {
    fontSize: 12,
  },
  fullText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
