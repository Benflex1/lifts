import { WorkoutSet } from '../types';

export const RPE_CHIPS: (number | null)[] = [null, 5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

export function resolveRestTimerSeconds(seconds: number | null | undefined): number {
  return seconds ?? 0;
}

export function resolveHistoricalTargetReps(
  exerciseTargetReps: string | undefined,
  setTargetReps: string | undefined
): string {
  if (exerciseTargetReps?.trim()) return exerciseTargetReps;
  if (setTargetReps?.trim()) return setTargetReps;
  return '10';
}

export function validateTargetReps(target: string | undefined): { isValid: boolean; error?: string } {
  if (!target || typeof target !== 'string' || !target.trim()) {
    return { isValid: false, error: 'Target reps cannot be empty' };
  }

  const trimmed = target.trim();

  // AMRAP (case-insensitive)
  if (/^amrap$/i.test(trimmed)) {
    return { isValid: true };
  }

  // Single positive integer: e.g. "5", "10"
  if (/^\d+$/.test(trimmed)) {
    const val = parseInt(trimmed, 10);
    if (val <= 0) {
      return { isValid: false, error: 'Target reps must be greater than 0' };
    }
    if (val > 100) {
      return { isValid: false, error: 'Target reps cannot exceed 100' };
    }
    return { isValid: true };
  }

  // Range: e.g. "8-12", "6 - 8"
  if (/^\d+\s*-\s*\d+$/.test(trimmed)) {
    const [minStr, maxStr] = trimmed.split('-');
    const min = parseInt(minStr.trim(), 10);
    const max = parseInt(maxStr.trim(), 10);
    if (min <= 0 || max <= 0) {
      return { isValid: false, error: 'Range values must be greater than 0' };
    }
    if (min > max) {
      return { isValid: false, error: 'Minimum reps cannot exceed maximum reps' };
    }
    if (max > 100) {
      return { isValid: false, error: 'Target reps cannot exceed 100' };
    }
    return { isValid: true };
  }

  // Comma-separated list: e.g. "12, 10, 8, 6"
  if (/^\d+(\s*,\s*\d+)+$/.test(trimmed)) {
    const parts = trimmed.split(',').map((p) => parseInt(p.trim(), 10));
    for (const num of parts) {
      if (num <= 0) {
        return { isValid: false, error: 'All per-set reps must be greater than 0' };
      }
      if (num > 100) {
        return { isValid: false, error: 'Target reps cannot exceed 100' };
      }
    }
    return { isValid: true };
  }

  return {
    isValid: false,
    error: 'Invalid target reps format. Use a number (e.g. 10), range (e.g. 8-12), list (e.g. 12, 10, 8), or AMRAP',
  };
}

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
  if (/^\d+(\s*,\s*\d+)+$/.test(trimmed)) {
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
  if (/^\d+\s*-\s*\d+$/.test(trimmed)) {
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
