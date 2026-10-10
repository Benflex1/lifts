import { PreviousSetSuggestion, TrackingType } from '../types';
import { formatWeight, WeightUnit } from '../utils/units';
import { DEFAULT_TRACKING_TYPE, formatTrackedSet } from './tracking';

export function formatPreviousMetric(
  suggestion: PreviousSetSuggestion,
  unit: WeightUnit,
  trackingType: TrackingType = DEFAULT_TRACKING_TYPE,
): string {
  const metric = trackingType === DEFAULT_TRACKING_TYPE
    ? `${formatWeight(suggestion.weightKg, unit)} × ${suggestion.reps}`
    : formatTrackedSet(suggestion, trackingType, unit);
  return suggestion.sourceGymName ? `${metric} · from ${suggestion.sourceGymName}` : metric;
}
