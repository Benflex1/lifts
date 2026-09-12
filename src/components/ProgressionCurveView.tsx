import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutChangeEvent,
  GestureResponderEvent,
} from 'react-native';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Line,
  Text as SvgText,
  G,
} from 'react-native-svg';
import {
  ExerciseProgressionSeries,
  ProgressionDataPoint,
  ProgressionMetric,
} from '../workout/analytics';
import { formatWeight, kgToDisplay, WeightUnit } from '../utils/units';
import { Trophy, TrendingUp, TrendingDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export interface ProgressionCurveViewProps {
  series: ExerciseProgressionSeries;
  metric?: ProgressionMetric;
  unit: WeightUnit;
  height?: number;
  gymTrackingEnabled?: boolean;
  onPointPress?: (point: ProgressionDataPoint) => void;
}

export const ProgressionCurveView: React.FC<ProgressionCurveViewProps> = ({
  series,
  metric = 'e1rm',
  unit,
  height = 200,
  gymTrackingEnabled = false,
  onPointPress,
}) => {
  const [containerWidth, setContainerWidth] = useState<number>(340);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const points = series.points;

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - containerWidth) > 2) {
      setContainerWidth(w);
    }
  };

  const getPointValue = (p: ProgressionDataPoint): number => {
    switch (metric) {
      case 'e1rm':
        return kgToDisplay(p.e1rmKg, unit);
      case 'max_weight':
        return kgToDisplay(p.maxWeightKg, unit);
      case 'volume':
        return kgToDisplay(p.totalVolumeKg, unit);
      case 'max_reps':
        return p.maxReps;
      default:
        return kgToDisplay(p.e1rmKg, unit);
    }
  };

  const formatMetricValue = (val: number): string => {
    if (metric === 'max_reps') {
      return `${val} reps`;
    }
    const suffix = unit.toUpperCase();
    return `${val} ${suffix}`;
  };

  // Dimensions
  const paddingLeft = 46;
  const paddingRight = 20;
  const paddingTop = 28;
  const paddingBottom = 32;

  const chartWidth = Math.max(100, containerWidth - paddingLeft - paddingRight);
  const chartHeight = Math.max(80, height - paddingTop - paddingBottom);

  const { coords, minVal, maxVal, linePath, areaPath } = useMemo(() => {
    if (points.length === 0) {
      return { coords: [], minVal: 0, maxVal: 10, linePath: '', areaPath: '' };
    }

    const values = points.map(getPointValue);
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
      min = Math.max(0, min - 5);
      max = max + 5;
    } else {
      const margin = (max - min) * 0.12;
      min = Math.max(0, min - margin);
      max = max + margin;
    }

    const valueSpan = Math.max(1, max - min);

    const mappedCoords = points.map((p, idx) => {
      let x = paddingLeft;
      if (points.length === 1) {
        x = paddingLeft + chartWidth / 2;
      } else {
        x = paddingLeft + (idx / (points.length - 1)) * chartWidth;
      }

      const val = getPointValue(p);
      const normalizedY = (val - min) / valueSpan;
      const y = paddingTop + chartHeight - normalizedY * chartHeight;

      return { x, y, point: p, value: val };
    });

    if (mappedCoords.length === 1) {
      const c = mappedCoords[0];
      return {
        coords: mappedCoords,
        minVal: min,
        maxVal: max,
        linePath: `M ${paddingLeft} ${c.y} L ${paddingLeft + chartWidth} ${c.y}`,
        areaPath: '',
      };
    }

    // Build smooth Bezier path
    let lineD = `M ${mappedCoords[0].x} ${mappedCoords[0].y}`;
    for (let i = 0; i < mappedCoords.length - 1; i++) {
      const p0 = mappedCoords[i];
      const p1 = mappedCoords[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 2;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (p1.x - p0.x) / 2;
      const cpY2 = p1.y;
      lineD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }

    const first = mappedCoords[0];
    const last = mappedCoords[mappedCoords.length - 1];
    const bottomY = paddingTop + chartHeight;
    const areaD = `${lineD} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;

    return {
      coords: mappedCoords,
      minVal: min,
      maxVal: max,
      linePath: lineD,
      areaPath: areaD,
    };
  }, [points, metric, unit, containerWidth, height]);

  const trajectoryStats = useMemo(() => {
    if (points.length === 0) return null;
    const firstP = points[0];
    const lastP = points[points.length - 1];

    let changePct: number | null = null;
    let bestFormatted = '';
    let currentFormatted = '';

    if (metric === 'e1rm') {
      const best = series.summary.allTimeBest1RM;
      const current = series.summary.current1RM;
      bestFormatted = formatWeight(best, unit);
      currentFormatted = formatWeight(current, unit);
      if (points.length >= 2 && firstP.e1rmKg > 0) {
        changePct = Number((((lastP.e1rmKg - firstP.e1rmKg) / firstP.e1rmKg) * 100).toFixed(1));
      }
    } else if (metric === 'max_weight') {
      const best = series.summary.allTimeBestWeight;
      const current = series.summary.currentWeight;
      bestFormatted = formatWeight(best, unit);
      currentFormatted = formatWeight(current, unit);
      if (points.length >= 2 && firstP.maxWeightKg > 0) {
        changePct = Number((((lastP.maxWeightKg - firstP.maxWeightKg) / firstP.maxWeightKg) * 100).toFixed(1));
      }
    } else if (metric === 'max_reps') {
      const best = series.summary.allTimeBestReps || Math.max(...points.map((p) => p.maxReps));
      const current = lastP.maxReps;
      bestFormatted = `${best} reps`;
      currentFormatted = `${current} reps`;
      if (points.length >= 2 && firstP.maxReps > 0) {
        changePct = Number((((lastP.maxReps - firstP.maxReps) / firstP.maxReps) * 100).toFixed(1));
      }
    } else {
      // volume
      const best = Math.max(...points.map((p) => p.totalVolumeKg));
      const current = lastP.totalVolumeKg;
      bestFormatted = formatWeight(best, unit);
      currentFormatted = formatWeight(current, unit);
      if (points.length >= 2 && firstP.totalVolumeKg > 0) {
        changePct = Number((((lastP.totalVolumeKg - firstP.totalVolumeKg) / firstP.totalVolumeKg) * 100).toFixed(1));
      }
    }

    return {
      changePct,
      bestFormatted,
      currentFormatted,
      totalSessions: points.length,
    };
  }, [points, metric, unit, series.summary]);

  // Handle touch scrub
  const handleTouch = (evt: GestureResponderEvent) => {
    if (coords.length <= 1) return;
    const locX = evt.nativeEvent.locationX;
    let closestIdx = 0;
    let minDiff = Infinity;
    coords.forEach((c, idx) => {
      const diff = Math.abs(c.x - locX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    if (closestIdx !== selectedIndex) {
      try {
        void Haptics.selectionAsync();
      } catch {}
      setSelectedIndex(closestIdx);
      if (onPointPress) {
        onPointPress(coords[closestIdx].point);
      }
    }
  };

  const activeIndex = selectedIndex !== null
    ? Math.min(selectedIndex, points.length - 1)
    : points.length - 1;
  const activePoint = points[activeIndex];
  const activeCoord = coords[activeIndex];

  if (points.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <TrendingUp size={28} color="#4B5563" />
        <Text style={styles.emptyTitle}>No progression data yet</Text>
        <Text style={styles.emptySubtitle}>
          Complete workouts with this exercise to visualize your 1RM and load curves over time.
        </Text>
      </View>
    );
  }

  // Y-axis grid values
  const midVal = (minVal + maxVal) / 2;
  const yLabels = [
    { label: Math.round(maxVal).toString(), y: paddingTop },
    { label: Math.round(midVal).toString(), y: paddingTop + chartHeight / 2 },
    { label: Math.round(minVal).toString(), y: paddingTop + chartHeight },
  ];

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Trajectory Summary Pills */}
      {trajectoryStats && (
        <View style={styles.trajectoryRow}>
          {trajectoryStats.changePct !== null && (
            <View
              style={[
                styles.trajectoryPill,
                trajectoryStats.changePct > 0
                  ? styles.trajectoryPillPositive
                  : trajectoryStats.changePct < 0
                  ? styles.trajectoryPillNegative
                  : styles.trajectoryPillNeutral,
              ]}
            >
              {trajectoryStats.changePct > 0 ? (
                <TrendingUp size={12} color="#10B981" />
              ) : trajectoryStats.changePct < 0 ? (
                <TrendingDown size={12} color="#EF4444" />
              ) : null}
              <Text
                style={[
                  styles.trajectoryPillText,
                  trajectoryStats.changePct > 0
                    ? { color: '#10B981' }
                    : trajectoryStats.changePct < 0
                    ? { color: '#EF4444' }
                    : { color: '#9CA3AF' },
                ]}
              >
                {trajectoryStats.changePct > 0 ? `+${trajectoryStats.changePct}%` : `${trajectoryStats.changePct}%`}
              </Text>
            </View>
          )}

          <View style={styles.summaryMetaPill}>
            <Text style={styles.summaryMetaLabel}>Best:</Text>
            <Text style={styles.summaryMetaValue}>{trajectoryStats.bestFormatted}</Text>
          </View>

          <View style={styles.summaryMetaPill}>
            <Text style={styles.summaryMetaLabel}>Latest:</Text>
            <Text style={styles.summaryMetaValue}>{trajectoryStats.currentFormatted}</Text>
          </View>

          <View style={styles.summaryMetaPill}>
            <Text style={styles.summaryMetaValue}>{trajectoryStats.totalSessions} {trajectoryStats.totalSessions === 1 ? 'session' : 'sessions'}</Text>
          </View>
        </View>
      )}

      {/* Inspection Callout Card */}
      {activePoint && activeCoord && (
        <View style={styles.calloutCard}>
          <View style={styles.calloutHeader}>
            <Text style={styles.calloutDate}>{activePoint.dateLabel}</Text>
            {activePoint.isPr && (
              <View style={styles.prBadge}>
                <Trophy size={11} color="#F59E0B" />
                <Text style={styles.prBadgeText}>NEW PR</Text>
              </View>
            )}
          </View>

          <View style={styles.calloutMetricsRow}>
            <Text style={styles.calloutMainVal}>
              {formatMetricValue(getPointValue(activePoint))}
            </Text>
            <Text style={styles.calloutMetricLabel}>
              {metric === 'e1rm'
                ? 'Est. 1RM'
                : metric === 'max_weight'
                ? 'Top Weight'
                : metric === 'volume'
                ? 'Session Volume'
                : 'Max Reps'}
            </Text>
          </View>

          <View style={styles.calloutFooter}>
            <Text style={styles.calloutTopSet}>
              Best Set: {activePoint.topSet.weightKg > 0 ? formatWeight(activePoint.topSet.weightKg, unit) : 'BW'} × {activePoint.topSet.reps}
              {activePoint.topSet.rpe ? ` @${activePoint.topSet.rpe}` : ''}
            </Text>
            {gymTrackingEnabled && activePoint.gymName && (
              <Text style={styles.calloutGym} numberOfLines={1}>
                📍 {activePoint.gymName}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* SVG Canvas */}
      <View
        style={{ width: containerWidth, height }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
      >
        <Svg width={containerWidth} height={height}>
          <Defs>
            <LinearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#38BDF8" stopOpacity="0.28" />
              <Stop offset="1" stopColor="#38BDF8" stopOpacity="0.0" />
            </LinearGradient>
          </Defs>

          {/* Grid Lines and Y-Axis Labels */}
          {yLabels.map((grid, idx) => (
            <G key={idx}>
              <Line
                x1={paddingLeft}
                y1={grid.y}
                x2={containerWidth - paddingRight}
                y2={grid.y}
                stroke="#262A34"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <SvgText
                x={paddingLeft - 8}
                y={grid.y + 4}
                fill="#6B7280"
                fontSize="10"
                fontWeight="600"
                textAnchor="end"
              >
                {grid.label}
              </SvgText>
            </G>
          ))}

          {/* Area Fill */}
          {areaPath !== '' && (
            <Path d={areaPath} fill="url(#curveGradient)" />
          )}

          {/* Curve Stroke */}
          {linePath !== '' && (
            <Path
              d={linePath}
              fill="none"
              stroke="#38BDF8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Vertical Scrubber Cursor */}
          {activeCoord && coords.length > 1 && (
            <Line
              x1={activeCoord.x}
              y1={paddingTop}
              x2={activeCoord.x}
              y2={paddingTop + chartHeight}
              stroke="#38BDF880"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          )}

          {/* Data Points */}
          {coords.map((c, idx) => {
            const isSelected = idx === activeIndex;
            const isPr = c.point.isPr;

            return (
              <G key={c.point.workoutId || idx}>
                {/* Active halo */}
                {isSelected && (
                  <Circle
                    cx={c.x}
                    cy={c.y}
                    r="8"
                    fill="#38BDF825"
                  />
                )}

                {/* Point dot */}
                <Circle
                  cx={c.x}
                  cy={c.y}
                  r={isSelected ? 5 : isPr ? 4.5 : 3.5}
                  fill={isPr ? '#F59E0B' : isSelected ? '#38BDF8' : '#1E293B'}
                  stroke={isPr ? '#F59E0B' : '#38BDF8'}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                />
              </G>
            );
          })}

          {/* X-axis first and last date labels */}
          {coords.length > 0 && (
            <>
              <SvgText
                x={coords[0].x}
                y={paddingTop + chartHeight + 18}
                fill="#9CA3AF"
                fontSize="10"
                fontWeight="500"
                textAnchor={coords.length === 1 ? 'middle' : 'start'}
              >
                {coords[0].point.dateLabel}
              </SvgText>
              {coords.length > 1 && (
                <SvgText
                  x={coords[coords.length - 1].x}
                  y={paddingTop + chartHeight + 18}
                  fill="#9CA3AF"
                  fontSize="10"
                  fontWeight="500"
                  textAnchor="end"
                >
                  {coords[coords.length - 1].point.dateLabel}
                </SvgText>
              )}
            </>
          )}
        </Svg>
      </View>

      {/* Touch scrub hint */}
      {coords.length > 1 && (
        <Text style={styles.scrubHint}>Drag or tap along curve to inspect sessions</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 4,
  },
  trajectoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    width: '100%',
    marginBottom: 8,
  },
  trajectoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  trajectoryPillPositive: {
    backgroundColor: '#10B98115',
    borderColor: '#10B98140',
  },
  trajectoryPillNegative: {
    backgroundColor: '#EF444415',
    borderColor: '#EF444440',
  },
  trajectoryPillNeutral: {
    backgroundColor: '#262A34',
    borderColor: '#374151',
  },
  trajectoryPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  summaryMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#14171F',
    borderWidth: 1,
    borderColor: '#262A34',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  summaryMetaLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '600',
  },
  summaryMetaValue: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
  },
  calloutCard: {
    width: '100%',
    backgroundColor: '#181D27',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2D3748',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  calloutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  calloutDate: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  prBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F59E0B20',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#F59E0B50',
  },
  prBadgeText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  calloutMetricsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  calloutMainVal: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  calloutMetricLabel: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
  },
  calloutFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#262A34',
    paddingTop: 6,
    marginTop: 2,
  },
  calloutTopSet: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '500',
  },
  calloutGym: {
    color: '#9CA3AF',
    fontSize: 11,
    maxWidth: '40%',
  },
  scrubHint: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 6,
  },
  emptyContainer: {
    width: '100%',
    backgroundColor: '#14171F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262A34',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  emptyTitle: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
});
