import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { Minus, Plus, TrendingDown, TrendingUp, Weight } from 'lucide-react-native';
import {
  BodyWeightEntry,
  BodyWeightRange,
  bodyWeightTrend,
  filterBodyWeightRange,
  formatWeighInDate,
  fromDateKey,
  summarizeBodyWeight,
} from '../workout/body-weight';
import { formatWeight, kgToDisplay, WeightUnit } from '../utils/units';
import { colors, radii } from '../theme';
import { SegmentedControl } from './ui';

const RANGES: { key: BodyWeightRange; label: string }[] = [
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: '1Y', label: '1Y' },
  { key: 'ALL', label: 'All' },
];

const CHART_HEIGHT = 132;
const CHART_PAD_Y = 10;
const DOT_LIMIT = 40;

interface BodyWeightCardProps {
  entries: BodyWeightEntry[];
  unit: WeightUnit;
  onLog: () => void;
}

function formatChange(changeKg: number, unit: WeightUnit): string {
  const display = kgToDisplay(Math.abs(changeKg), unit);
  if (display < 0.05) return 'No change';
  const sign = changeKg > 0 ? '+' : '−';
  return `${sign}${display.toFixed(1).replace(/\.0$/, '')} ${unit}`;
}

function formatDisplay(weightKg: number, unit: WeightUnit): string {
  return kgToDisplay(weightKg, unit).toFixed(1);
}

function shortDate(key: string): string {
  const date = fromDateKey(key);
  return `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
}

/** Body weight on the Progress tab: the latest weigh-in, its trend, and a chart. */
export function BodyWeightCard({ entries, unit, onLog }: BodyWeightCardProps) {
  const [range, setRange] = useState<BodyWeightRange>('3M');
  const [width, setWidth] = useState(300);
  const summary = useMemo(() => summarizeBodyWeight(entries), [entries]);
  const visible = useMemo(() => filterBodyWeightRange(entries, range), [entries, range]);

  const chart = useMemo(() => {
    if (visible.length === 0) return null;
    const weights = visible.map((entry) => entry.weightKg);
    const low = Math.min(...weights);
    const high = Math.max(...weights);
    // The line is the 7-day trend, drawn from the whole log so the range's first days are averaged too.
    const trendByDate = new Map(bodyWeightTrend(entries).map((entry) => [entry.date, entry]));
    const trendEntries = visible.map((entry) => trendByDate.get(entry.date) ?? entry);
    // Scale to the trend as well, since days before the range can pull it outside the weigh-ins.
    const trendWeights = trendEntries.map((entry) => entry.weightKg);
    const scaleLow = Math.min(low, ...trendWeights);
    const scaleHigh = Math.max(high, ...trendWeights);
    // Keep a little air above and below, and never zoom so far in that 0.2 kg looks like a cliff.
    const pad = Math.max(0.5, (scaleHigh - scaleLow) * 0.15);
    const minY = scaleLow - pad;
    const maxY = scaleHigh + pad;
    const first = fromDateKey(visible[0].date).getTime();
    const last = fromDateKey(visible[visible.length - 1].date).getTime();
    const span = Math.max(1, last - first);
    const place = (entry: BodyWeightEntry) => ({
      x: visible.length === 1 ? width / 2 : ((fromDateKey(entry.date).getTime() - first) / span) * (width - 8) + 4,
      y: CHART_PAD_Y + (1 - (entry.weightKg - minY) / (maxY - minY)) * (CHART_HEIGHT - CHART_PAD_Y * 2),
    });
    const points = visible.map(place);
    const trend = trendEntries.map(place);
    const line = trend.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const area = trend.length > 1
      ? `${line} L${trend[trend.length - 1].x.toFixed(1)},${CHART_HEIGHT} L${trend[0].x.toFixed(1)},${CHART_HEIGHT} Z`
      : '';
    return { points, trend, line, area, low, high };
  }, [entries, visible, width]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };

  const change = summary?.change;
  const TrendIcon = !change || Math.abs(change.kg) < 0.05 ? Minus : change.kg > 0 ? TrendingUp : TrendingDown;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerIcon}>
          <Weight size={16} color={colors.primaryLight} />
        </View>
        <Text style={styles.title}>Body Weight</Text>
        <TouchableOpacity
          style={styles.logButton}
          onPress={onLog}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Log body weight"
        >
          <Plus size={14} color={colors.onPrimary} strokeWidth={3} />
          <Text style={styles.logText}>Log</Text>
        </TouchableOpacity>
      </View>

      {!summary ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No weigh-ins yet</Text>
          <Text style={styles.emptyText}>Log your weight now and then, and the trend shows up here.</Text>
        </View>
      ) : (
        <>
          <View style={styles.valueRow}>
            <Text style={styles.value}>{formatDisplay(summary.latest.weightKg, unit)}</Text>
            <Text style={styles.valueUnit}>{unit}</Text>
            {change && (
              <View style={styles.changePill}>
                <TrendIcon size={12} color={colors.primaryLight} />
                <Text style={styles.changeText}>
                  {formatChange(change.kg, unit)} · {change.days} {change.days === 1 ? 'day' : 'days'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.meta}>
            {formatWeighInDate(summary.latest.date)} · 7-day average {formatWeight(summary.weekAverageKg, unit)}
          </Text>

          {entries.length < 2 ? (
            <Text style={styles.hint}>Log a few more weigh-ins to see your trend.</Text>
          ) : (
            <>
              <SegmentedControl options={RANGES} value={range} onChange={setRange} style={styles.ranges} />

              <View style={styles.chart} onLayout={onLayout}>
                {chart ? (
                  <>
                    <Svg width={width} height={CHART_HEIGHT}>
                      <Defs>
                        <LinearGradient id="bodyWeightFill" x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0" stopColor={colors.primary} stopOpacity={0.28} />
                          <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
                        </LinearGradient>
                      </Defs>
                      <Line x1={0} x2={width} y1={CHART_PAD_Y} y2={CHART_PAD_Y} stroke={colors.border} strokeDasharray="3 5" />
                      <Line
                        x1={0}
                        x2={width}
                        y1={CHART_HEIGHT - CHART_PAD_Y}
                        y2={CHART_HEIGHT - CHART_PAD_Y}
                        stroke={colors.border}
                        strokeDasharray="3 5"
                      />
                      {chart.area ? <Path d={chart.area} fill="url(#bodyWeightFill)" /> : null}
                      {chart.points.map((point, index) => (
                        <Circle
                          key={visible[index].date}
                          cx={point.x}
                          cy={point.y}
                          r={chart.points.length > DOT_LIMIT ? 1.5 : 2.5}
                          fill={colors.textMuted}
                          opacity={0.7}
                        />
                      ))}
                      {chart.trend.length > 1 && (
                        <Path d={chart.line} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                      )}
                      <Circle
                        cx={chart.trend[chart.trend.length - 1].x}
                        cy={chart.trend[chart.trend.length - 1].y}
                        r={5}
                        fill={colors.primary}
                        stroke={colors.surface}
                        strokeWidth={2}
                      />
                    </Svg>
                    <View style={styles.axisRow}>
                      <Text style={styles.axisText}>{shortDate(visible[0].date)}</Text>
                      <Text style={styles.axisText}>
                        {chart.low === chart.high
                          ? formatWeight(chart.low, unit)
                          : `${formatWeight(chart.low, unit)} – ${formatWeight(chart.high, unit)}`}
                      </Text>
                      <Text style={styles.axisText}>{shortDate(visible[visible.length - 1].date)}</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.noRange}>No weigh-ins in this range.</Text>
                )}
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  logText: { color: colors.onPrimary, fontSize: 13, fontWeight: '800' },
  empty: { paddingTop: 14 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  emptyText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 14, gap: 4 },
  value: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  valueUnit: { color: colors.textSecondary, fontSize: 15, fontWeight: '700', marginRight: 8 },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  changeText: { color: colors.primaryLight, fontSize: 12, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  hint: { color: colors.textSecondary, fontSize: 13, marginTop: 14 },
  ranges: { marginTop: 14 },
  chart: { marginTop: 12, minHeight: CHART_HEIGHT },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  noRange: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 50 },
});
