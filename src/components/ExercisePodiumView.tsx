import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ExercisePodium, PodiumEntry, PRMetric } from '../workout/pr';
import { formatWeight, WeightUnit } from '../utils/units';
import { colors, radii } from '../theme';
import { PRMark, SegmentedControl } from './ui';

interface ExercisePodiumViewProps {
  podium: ExercisePodium | null;
  unit: WeightUnit;
  isBodyweight?: boolean;
  gymTrackingEnabled?: boolean;
}

const METRIC_OPTIONS: { key: PRMetric; label: string }[] = [
  { key: 'weight', label: 'Weight' },
  { key: '1rm', label: 'e1RM' },
  { key: 'volume', label: 'Volume' },
  { key: 'reps', label: 'Reps' },
];

const RANK_LABELS = { 1: 'Best', 2: '2nd', 3: '3rd' } as const;

/** Top three sets for one exercise, ranked by the selected metric. */
export const ExercisePodiumView: React.FC<ExercisePodiumViewProps> = ({
  podium,
  unit,
  isBodyweight = false,
  gymTrackingEnabled = false,
}) => {
  const [selectedMetric, setSelectedMetric] = useState<PRMetric>(isBodyweight ? 'reps' : 'weight');

  if (!podium) return null;

  const options = METRIC_OPTIONS.filter(option => podium[option.key].length > 0);
  if (options.length === 0) return null;

  const metric = options.some(option => option.key === selectedMetric) ? selectedMetric : options[0].key;
  const entries = [1, 2, 3]
    .map(rank => podium[metric].find(entry => entry.rank === rank))
    .filter((entry): entry is PodiumEntry => Boolean(entry));

  const formatValue = (entry: PodiumEntry): { primary: string; secondary: string } => {
    if (entry.metric === 'weight') {
      return {
        primary: formatWeight(entry.weightKg, unit),
        secondary: `× ${entry.reps} ${entry.reps === 1 ? 'rep' : 'reps'}`,
      };
    }
    if (entry.metric === '1rm') {
      return {
        primary: formatWeight(entry.value, unit),
        secondary: `${formatWeight(entry.weightKg, unit)} × ${entry.reps}`,
      };
    }
    if (entry.metric === 'volume') {
      return {
        primary: formatWeight(entry.value, unit),
        secondary: `${formatWeight(entry.weightKg, unit)} × ${entry.reps}`,
      };
    }
    return { primary: `${entry.value} reps`, secondary: '' };
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Top sets</Text>
      </View>

      {options.length > 1 && (
        <SegmentedControl
          options={options}
          value={metric}
          onChange={setSelectedMetric}
          style={styles.metricSwitcher}
        />
      )}

      <View style={styles.list}>
        {entries.map((entry, idx) => {
          const value = formatValue(entry);
          const dateStr = entry.date
            ? new Date(entry.date).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : '';
          const meta = [dateStr, gymTrackingEnabled ? entry.gymName : undefined].filter(Boolean).join(' · ');
          return (
            <View key={`${entry.rank}-${idx}`} style={[styles.row, idx > 0 && styles.rowDivider]}>
              <PRMark rank={entry.rank} size={32} />
              <View style={styles.rowText}>
                <View style={styles.valueRow}>
                  <Text style={[styles.value, entry.rank === 1 && styles.valueBest]}>{value.primary}</Text>
                  {value.secondary ? <Text style={styles.valueSecondary}>{value.secondary}</Text> : null}
                </View>
                {meta ? <Text style={styles.meta}>{meta}</Text> : null}
              </View>
              <Text style={styles.rankLabel}>{RANK_LABELS[entry.rank]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: 16,
    marginBottom: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  metricSwitcher: {
    marginBottom: 6,
  },
  list: {
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  rowText: {
    flex: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  value: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  valueBest: {
    fontSize: 19,
  },
  valueSecondary: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  rankLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
