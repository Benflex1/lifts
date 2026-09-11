import { DetectedTrackerFormat } from './types';

/**
 * Normalizes a header string for comparison:
 * Lowercases, strips punctuation, normalizes whitespace and underscores.
 */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/[^a-z0-9\s()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FormatDetectionResult {
  format: DetectedTrackerFormat;
  label: string;
  confidence: number;
}

/**
 * Detects the gym tracking app that produced the CSV based on header signatures.
 */
export function detectTrackerFormat(headerRow: string[]): FormatDetectionResult {
  const normalized = headerRow.map(normalizeHeader);
  const headerSet = new Set(normalized);

  // Helper check
  const has = (keyword: string) =>
    normalized.some(h => h === keyword || h.includes(keyword));

  // 1. HEVY: Signature columns
  // Specifically: "exercise title", "set index", "weight kg" / "weight lbs", "superset id"
  if (
    has('exercise title') ||
    (has('set index') && (has('weight kg') || has('weight lbs') || has('weight')))
  ) {
    return { format: 'hevy', label: 'Hevy', confidence: 0.95 };
  }

  // 2. STRONG: Signature columns
  // Strong exports always include "duration", "weight unit", or "workout notes" alongside exercise and sets
  if (
    (has('duration') || has('weight unit') || has('workout notes')) &&
    (has('exercise name') || has('workout name') || has('set order'))
  ) {
    return { format: 'strong', label: 'Strong', confidence: 0.95 };
  }

  // 3. FITNOTES: Signature columns
  // Specifically: "exercise", "category", "weight (kg)" / "weight (lbs)", "reps", "kind"
  if (
    has('category') &&
    (has('weight (kg)') || has('weight (lbs)')) &&
    (has('exercise') || has('kind'))
  ) {
    return { format: 'fitnotes', label: 'FitNotes', confidence: 0.95 };
  }

  // 4. LYFTA: Signature columns
  // Standard columns: "date", "workout name" (or "workout"), "exercise name" (or "exercise"), "set order" (or "set"), "reps", "weight"
  if (
    (has('workout') || has('workout name')) &&
    (has('exercise') || has('exercise name')) &&
    has('reps') &&
    (has('weight') || has('weight kg') || has('weight lbs'))
  ) {
    return { format: 'lyfta', label: 'Lyfta', confidence: 0.9 };
  }

  // 5. GENERIC / FALLBACK:
  // Can we find columns for Exercise, Reps, Weight, Date?
  const hasExercise = normalized.some(h =>
    h.includes('exercise') || h.includes('movement') || h.includes('lift')
  );
  const hasReps = normalized.some(h => h.includes('rep'));
  const hasWeight = normalized.some(h =>
    h.includes('weight') || h.includes('load') || h.includes('kg') || h.includes('lb')
  );

  if (hasExercise && hasReps && hasWeight) {
    return { format: 'generic', label: 'CSV Workout Log', confidence: 0.7 };
  }

  return { format: 'generic', label: 'Generic CSV', confidence: 0.5 };
}
