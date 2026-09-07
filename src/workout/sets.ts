import { WorkoutSet } from '../types';

export function initialReps(target: string | undefined, setIndex: number, previousReps?: number): number {
  if (!target || typeof target !== 'string') {
    return previousReps !== undefined && previousReps > 0 ? previousReps : 10;
  }

  const trimmed = target.trim();
  if (!trimmed) {
    return previousReps !== undefined && previousReps > 0 ? previousReps : 10;
  }

  if (trimmed.toUpperCase() === 'AMRAP') {
    return previousReps !== undefined && previousReps > 0 ? previousReps : 10;
  }

  // Comma-separated list: e.g. "10, 8, 6"
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim());
    const validNumbers = parts.map((p) => parseInt(p, 10)).filter((n) => !isNaN(n) && n > 0);
    if (validNumbers.length > 0) {
      if (setIndex < validNumbers.length) {
        return validNumbers[setIndex];
      }
      // Repeat final target for sets beyond list
      return validNumbers[validNumbers.length - 1];
    }
  }

  // Range: e.g. "6-8" or "8 - 12"
  if (trimmed.includes('-')) {
    const [lowerStr] = trimmed.split('-');
    const lower = parseInt(lowerStr.trim(), 10);
    if (!isNaN(lower) && lower > 0) {
      return lower;
    }
  }

  // Single fixed numeric target: e.g. "5"
  const single = parseInt(trimmed, 10);
  if (!isNaN(single) && single > 0 && String(single) === trimmed) {
    return single;
  }

  // Unsupported free-form text: falls back to previous reps or 10
  return previousReps !== undefined && previousReps > 0 ? previousReps : 10;
}

export function validateCompletedSet(set: WorkoutSet): string | null {
  if (typeof set.weightKg !== 'number' || !Number.isFinite(set.weightKg)) {
    return 'Weight must be a valid number';
  }
  if (set.weightKg < 0) {
    return 'Weight cannot be negative';
  }
  if (typeof set.reps !== 'number' || !Number.isFinite(set.reps)) {
    return 'Reps must be a valid number';
  }
  if (!Number.isInteger(set.reps)) {
    return 'Reps must be a whole number';
  }
  if (set.reps <= 0) {
    return 'Reps must be greater than 0';
  }
  return null;
}
