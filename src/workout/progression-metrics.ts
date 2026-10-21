import { TrackingType } from '../types';
import { formatWeight, kgToDisplay, WeightUnit } from '../utils/units';
import type { ProgressionDataPoint, ProgressionMetric } from './analytics';
import { distanceUnitFor, formatSetDuration, METERS_PER_MILE, metersToDisplay } from './tracking';

/** How one progression metric reads, plots and labels itself. */
export interface ProgressionMetricSpec {
  key: ProgressionMetric;
  /** Short chip label. */
  chip: string;
  /** Full name, for accessibility. */
  label: string;
  /** Name under the value in the chart's callout. */
  callout: string;
  prLabel: string;
  /** Pace: a smaller number is the better result. */
  lowerIsBetter?: boolean;
  /** The plotted number in display units, or 0 when the session has none. */
  value: (point: ProgressionDataPoint, unit: WeightUnit) => number;
  /** A plotted number as text, e.g. "100 kg", "1:30", "5.2 km", "5:12 /km". */
  format: (value: number, unit: WeightUnit) => string;
  /** A y-axis tick, kept short. */
  axis: (value: number, unit: WeightUnit) => string;
}

function paceSecondsFor(point: ProgressionDataPoint, unit: WeightUnit): number {
  if (point.bestPaceSecondsPerKm <= 0) return 0;
  return distanceUnitFor(unit) === 'mi'
    ? point.bestPaceSecondsPerKm * (METERS_PER_MILE / 1000)
    : point.bestPaceSecondsPerKm;
}

const roundAxis = (value: number) => Math.round(value).toString();
const timeAxis = (value: number) => formatSetDuration(value);
const distanceAxis = (value: number) =>
  value >= 10 ? Math.round(value).toString() : value.toFixed(1);

export const PROGRESSION_METRICS: Record<ProgressionMetric, ProgressionMetricSpec> = {
  e1rm: {
    key: 'e1rm',
    callout: 'Est. 1RM',
    chip: '1RM',
    label: 'Estimated 1RM',
    prLabel: 'NEW 1RM PR',
    value: (point, unit) => kgToDisplay(point.e1rmKg, unit),
    format: (value, unit) => `${value} ${unit.toUpperCase()}`,
    axis: roundAxis,
  },
  max_weight: {
    key: 'max_weight',
    callout: 'Top Weight',
    chip: 'Weight',
    label: 'Heaviest Weight',
    prLabel: 'NEW WEIGHT PR',
    value: (point, unit) => kgToDisplay(point.maxWeightKg, unit),
    format: (value, unit) => `${value} ${unit.toUpperCase()}`,
    axis: roundAxis,
  },
  max_reps: {
    key: 'max_reps',
    callout: 'Max Reps',
    chip: 'Reps',
    label: 'Max Reps',
    prLabel: 'NEW REPS PR',
    value: point => point.maxReps,
    format: value => `${value} reps`,
    axis: roundAxis,
  },
  volume: {
    key: 'volume',
    callout: 'Session Volume',
    chip: 'Vol',
    label: 'Total Volume',
    prLabel: 'NEW VOL PR',
    value: (point, unit) => kgToDisplay(point.totalVolumeKg, unit),
    format: (value, unit) => `${value} ${unit.toUpperCase()}`,
    axis: roundAxis,
  },
  max_duration: {
    key: 'max_duration',
    callout: 'Longest Set',
    chip: 'Longest',
    label: 'Longest Set',
    prLabel: 'NEW TIME PR',
    value: point => point.maxDurationSeconds,
    format: value => formatSetDuration(value),
    axis: timeAxis,
  },
  total_duration: {
    key: 'total_duration',
    callout: 'Total Time',
    chip: 'Total',
    label: 'Total Time',
    prLabel: 'NEW TOTAL TIME PR',
    value: point => point.totalDurationSeconds,
    format: value => formatSetDuration(value),
    axis: timeAxis,
  },
  max_distance: {
    key: 'max_distance',
    callout: 'Longest Distance',
    chip: 'Distance',
    label: 'Longest Distance',
    prLabel: 'NEW DISTANCE PR',
    value: (point, unit) => metersToDisplay(point.maxDistanceM, distanceUnitFor(unit)),
    format: (value, unit) => `${value} ${distanceUnitFor(unit)}`,
    axis: distanceAxis,
  },
  best_pace: {
    key: 'best_pace',
    callout: 'Best Pace',
    chip: 'Pace',
    label: 'Best Pace',
    prLabel: 'NEW PACE PR',
    lowerIsBetter: true,
    value: (point, unit) => Math.round(paceSecondsFor(point, unit)),
    format: (value, unit) => `${formatSetDuration(value)} /${distanceUnitFor(unit)}`,
    axis: timeAxis,
  },
};

/** The metrics worth charting for how an exercise is tracked. */
export function progressionMetricsFor(type: TrackingType): ProgressionMetric[] {
  switch (type) {
    case 'duration':
      return ['max_duration', 'total_duration'];
    case 'distance_duration':
      return ['max_distance', 'best_pace', 'total_duration'];
    case 'bodyweight_reps':
    case 'assisted_bodyweight':
      return ['max_reps'];
    default:
      return ['e1rm', 'max_weight', 'max_reps', 'volume'];
  }
}

/** The chosen metric when this exercise has it, else its first one. */
export function resolveProgressionMetric(
  selected: ProgressionMetric,
  type: TrackingType,
): ProgressionMetric {
  const available = progressionMetricsFor(type);
  return available.includes(selected) ? selected : available[0];
}

/** Points that have a value for the metric, so a run with no pace never plots as a 0:00 pace. */
export function pointsWithMetric(
  points: ProgressionDataPoint[],
  metric: ProgressionMetric,
  unit: WeightUnit,
): ProgressionDataPoint[] {
  const spec = PROGRESSION_METRICS[metric];
  // Weight metrics keep their long-standing behaviour: every session plots, bodyweight sets at 0.
  if (metric === 'e1rm' || metric === 'max_weight' || metric === 'volume' || metric === 'max_reps')
    return points;
  return points.filter(point => spec.value(point, unit) > 0);
}

/** "BW × 12", "100 kg × 5 @8", "5 km in 25:30" or "1:30" for the callout's best set. */
export function formatTopSet(
  point: ProgressionDataPoint,
  type: TrackingType,
  unit: WeightUnit,
): string {
  const { topSet } = point;
  if (type === 'duration' && topSet.durationSeconds)
    return formatSetDuration(topSet.durationSeconds);
  if (type === 'distance_duration' && (topSet.distanceM || topSet.durationSeconds)) {
    const distance = topSet.distanceM
      ? `${metersToDisplay(topSet.distanceM, distanceUnitFor(unit))} ${distanceUnitFor(unit)}`
      : '';
    const time = topSet.durationSeconds ? formatSetDuration(topSet.durationSeconds) : '';
    return distance && time ? `${distance} in ${time}` : distance || time;
  }
  const weight = topSet.weightKg > 0 ? formatWeight(topSet.weightKg, unit) : 'BW';
  return `${weight} × ${topSet.reps}${topSet.rpe ? ` @${topSet.rpe}` : ''}`;
}
