import { Workout } from '../types';

export const EXCESSIVE_DURATION_THRESHOLD_SECONDS = 4 * 3600; // 4 hours (14,400 seconds)

export interface DurationBreakdown {
  hours: number;
  minutes: number;
  seconds: number;
}

export function isExcessiveDuration(durationSeconds: number): boolean {
  return typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds >= EXCESSIVE_DURATION_THRESHOLD_SECONDS;
}

export function secondsToHoursMinutes(totalSeconds: number): DurationBreakdown {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return { hours, minutes, seconds };
}

export function parseDurationInput(
  hours: string | number,
  minutes: string | number,
  seconds: string | number = 0
): number {
  const parsePart = (val: string | number): number => {
    if (typeof val === 'number') {
      return Number.isFinite(val) ? Math.max(0, Math.floor(val)) : 0;
    }
    const trimmed = val.trim();
    if (trimmed.startsWith('-')) return 0;
    const sanitized = trimmed.replace(/[^0-9]/g, '');
    if (!sanitized) return 0;
    const n = parseInt(sanitized, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  const h = parsePart(hours);
  const m = parsePart(minutes);
  const s = parsePart(seconds);

  return Math.max(0, h * 3600 + m * 60 + s);
}

export function estimateWorkoutDuration(
  workout: { exercises?: Array<{ sets?: Array<{ isCompleted?: boolean; completedAt?: string }> }> }
): number {
  const exercises = workout?.exercises || [];
  const completedSets: Array<{ completedAt?: string }> = [];

  for (const ex of exercises) {
    for (const set of ex.sets || []) {
      if (set.isCompleted) {
        completedSets.push(set);
      }
    }
  }

  if (completedSets.length === 0) {
    return 1800; // 30 minutes baseline
  }

  const validTimestamps = completedSets
    .map((s) => (s.completedAt ? new Date(s.completedAt).getTime() : NaN))
    .filter((t) => Number.isFinite(t));

  if (validTimestamps.length >= 2) {
    validTimestamps.sort((a, b) => a - b);
    const first = validTimestamps[0];
    const last = validTimestamps[validTimestamps.length - 1];
    const spanSeconds = Math.floor((last - first) / 1000);

    // If sets span between 1 min and 4 hours, add 5m warm-up/cool-down buffer
    if (spanSeconds >= 60 && spanSeconds < EXCESSIVE_DURATION_THRESHOLD_SECONDS) {
      return Math.min(spanSeconds + 300, 3 * 3600);
    }
  }

  // Fallback: 2.5 minutes per completed set + 5m buffer, bounded between 30m and 2.5h
  const estimated = completedSets.length * 150 + 300;
  return Math.max(1800, Math.min(estimated, 2.5 * 3600));
}
