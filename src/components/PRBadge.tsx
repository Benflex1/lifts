import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PRAchievement, formatPRBadgeLabel } from '../workout/pr';

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
  const { rank, metric } = achievement;

  const isGold = rank === 1;
  const isSilver = rank === 2;

  const theme = isGold
    ? {
        bg: '#78350F35',
        border: '#F59E0B70',
        text: '#FBBF24',
      }
    : isSilver
    ? {
        bg: '#33415545',
        border: '#94A3B870',
        text: '#F1F5F9',
      }
    : {
        bg: '#451A0345',
        border: '#D9770660',
        text: '#FED7AA',
      };

  const badgeText = formatPRBadgeLabel(achievement, showGym);
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
      <Text style={[styles.compactText, { color: theme.text }]}>{badgeText}</Text>
    </View>
  ) : (
    <View style={[styles.fullContainer, { backgroundColor: theme.bg, borderColor: theme.border }]}>
      <Text style={[styles.fullText, { color: theme.text }]}>
        {badgeText} · {metricLabel}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${badgeText} ${metricLabel}`}
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
