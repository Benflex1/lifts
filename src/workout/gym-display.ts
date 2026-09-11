import { PreviousSetSuggestion } from '../types';
import { formatWeight, WeightUnit } from '../utils/units';

export function formatPreviousMetric(
  suggestion: PreviousSetSuggestion,
  unit: WeightUnit,
): string {
  const metric = `${formatWeight(suggestion.weightKg, unit)} × ${suggestion.reps}`;
  return suggestion.sourceGymName ? `${metric} · from ${suggestion.sourceGymName}` : metric;
}
