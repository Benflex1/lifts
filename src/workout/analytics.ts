import { Workout } from '../types';

export interface WeeklyVolumePoint {
  key: string;
  label: string;
  volumeKg: number;
}

export interface MuscleFrequencyPoint {
  muscle: string;
  count: number;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  const day = result.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  result.setUTCDate(result.getUTCDate() - daysSinceMonday);
  return result;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildWeeklyVolume(
  workouts: Workout[],
  now: Date = new Date(),
  weekCount: number = 8
): WeeklyVolumePoint[] {
  const count = Math.max(1, Math.floor(weekCount));
  const currentWeek = startOfWeek(now);
  const firstWeek = new Date(currentWeek);
  firstWeek.setUTCDate(firstWeek.getUTCDate() - (count - 1) * 7);

  const points: WeeklyVolumePoint[] = [];
  const pointsByKey = new Map<string, WeeklyVolumePoint>();
  for (let index = 0; index < count; index += 1) {
    const week = new Date(firstWeek);
    week.setUTCDate(week.getUTCDate() + index * 7);
    const key = dateKey(week);
    const point = { key, label: dateLabel(week), volumeKg: 0 };
    points.push(point);
    pointsByKey.set(key, point);
  }

  for (const workout of workouts) {
    const workoutDate = new Date(workout.startTime);
    if (Number.isNaN(workoutDate.getTime())) continue;

    const point = pointsByKey.get(dateKey(startOfWeek(workoutDate)));
    if (!point) continue;

    const volume = Number.isFinite(workout.totalVolumeKg) ? workout.totalVolumeKg : 0;
    point.volumeKg += volume;
  }

  return points;
}

export function buildMuscleFrequency(
  workouts: Workout[],
  limit: number = 8
): MuscleFrequencyPoint[] {
  const counts = new Map<string, number>();

  for (const workout of workouts) {
    const musclesInWorkout = new Set<string>();
    for (const exercise of workout.exercises || []) {
      if (!exercise.sets.some(set => set.isCompleted)) continue;
      for (const muscle of exercise.exercise.primaryMuscles || []) {
        const normalized = muscle.trim().toLowerCase();
        if (normalized) musclesInWorkout.add(normalized);
      }
    }

    for (const muscle of musclesInWorkout) {
      counts.set(muscle, (counts.get(muscle) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([muscle, count]) => ({ muscle, count }))
    .sort((a, b) => b.count - a.count || a.muscle.localeCompare(b.muscle))
    .slice(0, Math.max(0, Math.floor(limit)));
}
