import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { ExercisePodium, PodiumEntry, PRMetric } from '../workout/pr';
import { formatWeight, WeightUnit } from '../utils/units';

interface ExercisePodiumViewProps {
  podium: ExercisePodium | null;
  unit: WeightUnit;
  isBodyweight?: boolean;
  gymTrackingEnabled?: boolean;
}

export const ExercisePodiumView: React.FC<ExercisePodiumViewProps> = ({
  podium,
  unit,
  isBodyweight = false,
  gymTrackingEnabled = false,
}) => {
  const [selectedMetric, setSelectedMetric] = useState<PRMetric>(
    isBodyweight ? 'reps' : 'weight'
  );

  if (!podium) return null;

  const hasWeight = podium.weight.length > 0;
  const has1RM = podium['1rm'].length > 0;
  const hasVolume = podium.volume.length > 0;
  const hasReps = podium.reps.length > 0;

  if (!hasWeight && !has1RM && !hasVolume && !hasReps) {
    return null;
  }

  const entries = podium[selectedMetric] || [];
  const first = entries.find((e) => e.rank === 1);
  const second = entries.find((e) => e.rank === 2);
  const third = entries.find((e) => e.rank === 3);

  const formatValue = (entry: PodiumEntry): { primary: string; secondary: string } => {
    const dateStr = entry.date
      ? new Date(entry.date).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: '2-digit',
        })
      : '';

    if (entry.metric === 'weight') {
      return {
        primary: formatWeight(entry.weightKg, unit),
        secondary: `${entry.reps} ${entry.reps === 1 ? 'rep' : 'reps'} · ${dateStr}`,
      };
    }
    if (entry.metric === '1rm') {
      return {
        primary: formatWeight(entry.value, unit),
        secondary: `Est. 1RM · ${dateStr}`,
      };
    }
    if (entry.metric === 'volume') {
      return {
        primary: formatWeight(entry.value, unit),
        secondary: `${formatWeight(entry.weightKg, unit)} × ${entry.reps} · ${dateStr}`,
      };
    }
    // reps
    return {
      primary: `${entry.value} reps`,
      secondary: dateStr,
    };
  };

  const renderSlot = (
    rank: 1 | 2 | 3,
    entry: PodiumEntry | undefined,
    theme: {
      bg: string;
      border: string;
      titleColor: string;
      title: string;
      emoji: string;
      height: number;
    }
  ) => {
    return (
      <View
        style={[
          styles.podiumSlot,
          {
            backgroundColor: theme.bg,
            borderColor: theme.border,
            minHeight: theme.height,
          },
        ]}
      >
        <View style={styles.slotHeader}>
          <Text style={styles.slotEmoji}>{theme.emoji}</Text>
          <Text style={[styles.slotTitle, { color: theme.titleColor }]}>{theme.title}</Text>
        </View>

        {entry ? (
          <View style={styles.slotBody}>
            <Text style={styles.slotPrimaryText} numberOfLines={1}>
              {formatValue(entry).primary}
            </Text>
            <Text style={styles.slotSecondaryText} numberOfLines={1}>
              {formatValue(entry).secondary}
            </Text>
            {gymTrackingEnabled && entry.gymName && (
              <View style={styles.slotGymBadge}>
                <Text style={styles.slotGymText} numberOfLines={1}>
                  📍 {entry.gymName}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.slotEmpty}>
            <Text style={styles.slotEmptyText}>—</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Trophy size={16} color="#F59E0B" />
          <Text style={styles.title}>ALL-TIME PODIUM</Text>
        </View>

        {/* Metric Selector Pills */}
        <View style={styles.metricTabs}>
          {hasWeight && (
            <TouchableOpacity
              style={[styles.metricTab, selectedMetric === 'weight' && styles.metricTabActive]}
              onPress={() => setSelectedMetric('weight')}
            >
              <Text
                style={[
                  styles.metricTabText,
                  selectedMetric === 'weight' && styles.metricTabTextActive,
                ]}
              >
                Weight
              </Text>
            </TouchableOpacity>
          )}

          {has1RM && (
            <TouchableOpacity
              style={[styles.metricTab, selectedMetric === '1rm' && styles.metricTabActive]}
              onPress={() => setSelectedMetric('1rm')}
            >
              <Text
                style={[
                  styles.metricTabText,
                  selectedMetric === '1rm' && styles.metricTabTextActive,
                ]}
              >
                1RM
              </Text>
            </TouchableOpacity>
          )}

          {hasVolume && (
            <TouchableOpacity
              style={[styles.metricTab, selectedMetric === 'volume' && styles.metricTabActive]}
              onPress={() => setSelectedMetric('volume')}
            >
              <Text
                style={[
                  styles.metricTabText,
                  selectedMetric === 'volume' && styles.metricTabTextActive,
                ]}
              >
                Volume
              </Text>
            </TouchableOpacity>
          )}

          {hasReps && (
            <TouchableOpacity
              style={[styles.metricTab, selectedMetric === 'reps' && styles.metricTabActive]}
              onPress={() => setSelectedMetric('reps')}
            >
              <Text
                style={[
                  styles.metricTabText,
                  selectedMetric === 'reps' && styles.metricTabTextActive,
                ]}
              >
                Reps
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Podium Columns (Silver - Gold - Bronze) */}
      <View style={styles.podiumRow}>
        {renderSlot(2, second, {
          bg: '#1A202C',
          border: '#94A3B850',
          titleColor: '#CBD5E1',
          title: '2ND',
          emoji: '🥈',
          height: 110,
        })}

        {renderSlot(1, first, {
          bg: '#271E11',
          border: '#F59E0B70',
          titleColor: '#FBBF24',
          title: '1ST',
          emoji: '🥇',
          height: 128,
        })}

        {renderSlot(3, third, {
          bg: '#231812',
          border: '#D9770650',
          titleColor: '#FED7AA',
          title: '3RD',
          emoji: '🥉',
          height: 98,
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111827',
    borderColor: '#374151',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  metricTabs: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  metricTab: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metricTabActive: {
    backgroundColor: '#374151',
  },
  metricTabText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
  },
  metricTabTextActive: {
    color: '#F9FAFB',
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  podiumSlot: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    justifyContent: 'flex-start',
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 6,
  },
  slotEmoji: {
    fontSize: 14,
  },
  slotTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  slotBody: {
    alignItems: 'center',
  },
  slotPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  slotSecondaryText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  slotGymBadge: {
    marginTop: 4,
    backgroundColor: '#1E293B',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  slotGymText: {
    color: '#38BDF8',
    fontSize: 9,
    fontWeight: '700',
  },
  slotEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  slotEmptyText: {
    color: '#4B5563',
    fontSize: 16,
    fontWeight: '700',
  },
});
