import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { PRAchievement, formatPRBadgeLabel } from '../workout/pr';
import { PR_RANK_COLORS } from './ui';
import { colors } from '../theme';

interface PRBadgeProps {
  achievement: PRAchievement;
  compact?: boolean;
  showGym?: boolean;
  additionalCount?: number;
  onPress?: () => void;
}

const METRIC_LABELS: Record<PRAchievement['metric'], string> = {
  weight: 'Weight',
  '1rm': 'e1RM',
  volume: 'Volume',
  reps: 'Reps',
};

/**
 * Inline record marker: a tinted pill with a trophy. Gold marks a new best; 2nd and 3rd best use
 * quieter tones so real PRs stand out.
 */
export const PRBadge: React.FC<PRBadgeProps> = ({
  achievement,
  compact = false,
  showGym = false,
  additionalCount = 0,
  onPress,
}) => {
  const { rank, metric } = achievement;
  const accent = PR_RANK_COLORS[rank];
  const textColor = rank === 1 ? accent : rank === 2 ? '#D5DBE3' : '#E7B58A';
  const badgeText = formatPRBadgeLabel(achievement, showGym);
  const metricLabel = METRIC_LABELS[metric];

  const content = (
    <View
      style={[
        styles.pill,
        compact ? styles.pillCompact : styles.pillFull,
        { backgroundColor: accent + (rank === 1 ? '26' : '1A') },
      ]}
    >
      <Trophy size={compact ? 11 : 12} color={accent} strokeWidth={2.4} />
      <Text style={[styles.text, compact && styles.textCompact, { color: textColor }]} numberOfLines={1}>
        {compact ? badgeText : `${badgeText} · ${metricLabel}`}
      </Text>
      {additionalCount > 0 && (
        <Text style={[styles.more, compact && styles.textCompact]}>+{additionalCount}</Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel={`${badgeText}, ${metricLabel}${additionalCount > 0 ? `, plus ${additionalCount} more` : ''}`}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: 999,
  },
  pillCompact: {
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  pillFull: {
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
  },
  textCompact: {
    fontSize: 11,
  },
  more: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
