import { WorkoutHistorySummary } from '../types';

export interface WeekDay {
  /** Single-letter weekday label, Monday first. */
  label: string;
  /** Local calendar date, YYYY-MM-DD. */
  dateKey: string;
  trained: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export interface WeekSnapshot {
  days: WeekDay[];
  workouts: number;
  volumeKg: number;
  durationSeconds: number;
  /** Consecutive weeks with at least one workout, counting back from this week (or last week if
   *  nothing is logged yet this week). */
  streakWeeks: number;
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Monday 00:00 local time of the week containing `date`. */
export function startOfLocalWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  return result;
}

/** Summarizes the current Monday-to-Sunday week (local time) for the home screen. */
export function buildWeekSnapshot(history: WorkoutHistorySummary[], now: Date = new Date()): WeekSnapshot {
  const weekStart = startOfLocalWeek(now);
  const todayKey = localDateKey(now);
  const trainedDays = new Set<string>();
  const trainedWeeks = new Set<number>();
  let workouts = 0;
  let volumeKg = 0;
  let durationSeconds = 0;

  for (const item of history) {
    const start = new Date(item.startTime);
    if (Number.isNaN(start.getTime())) continue;
    trainedWeeks.add(startOfLocalWeek(start).getTime());
    if (start >= weekStart && start <= now) {
      trainedDays.add(localDateKey(start));
      workouts += 1;
      volumeKg += item.totalVolumeKg || 0;
      durationSeconds += item.durationSeconds || 0;
    }
  }

  const days: WeekDay[] = DAY_LABELS.map((label, idx) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + idx);
    const key = localDateKey(day);
    return {
      label,
      dateKey: key,
      trained: trainedDays.has(key),
      isToday: key === todayKey,
      isFuture: key > todayKey,
    };
  });

  let streakWeeks = 0;
  const cursor = new Date(weekStart);
  if (!trainedWeeks.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
  while (trainedWeeks.has(cursor.getTime())) {
    streakWeeks += 1;
    cursor.setDate(cursor.getDate() - 7);
  }

  return { days, workouts, volumeKg, durationSeconds, streakWeeks };
}
