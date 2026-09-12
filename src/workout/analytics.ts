import { Workout } from '../types';
import { calculate1RM } from '../utils/calculator';

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

export type ProgressionMetric = 'e1rm' | 'max_weight' | 'volume' | 'max_reps';
export type TimeframeFilter = '1M' | '3M' | '6M' | '1Y' | 'ALL';

export interface ProgressionDataPoint {
  workoutId: string;
  workoutName: string;
  date: string;
  dateLabel: string;
  timestamp: number;
  gymId: string;
  gymName?: string;
  e1rmKg: number;
  maxWeightKg: number;
  totalVolumeKg: number;
  maxReps: number;
  isPr: boolean;
  prMetrics?: {
    e1rm?: boolean;
    maxWeight?: boolean;
    volume?: boolean;
    maxReps?: boolean;
  };
  topSet: {
    weightKg: number;
    reps: number;
    rpe?: number;
  };
}

export interface ExerciseProgressionSeries {
  exerciseId: string;
  points: ProgressionDataPoint[];
  summary: {
    allTimeBest1RM: number;
    allTimeBestWeight: number;
    allTimeBestReps: number;
    current1RM: number;
    currentWeight: number;
    currentReps: number;
    changePercent1RM: number;
    changePercentReps: number;
    totalSessions: number;
    totalVolumeKg: number;
  };
}

export function getTimeframeCutoff(timeframe: TimeframeFilter, now: Date = new Date()): number {
  if (timeframe === 'ALL') return 0;
  const nowMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  switch (timeframe) {
    case '1M':
      return nowMs - 30 * dayMs;
    case '3M':
      return nowMs - 90 * dayMs;
    case '6M':
      return nowMs - 180 * dayMs;
    case '1Y':
      return nowMs - 365 * dayMs;
    default:
      return 0;
  }
}

export interface ExtractProgressionOptions {
  allowedGymIds?: string[] | Set<string> | null;
  timeframe?: TimeframeFilter;
  now?: Date;
  gymNamesMap?: Map<string, string> | Record<string, string>;
}

export function extractExerciseProgression(
  workouts: Workout[],
  exerciseId: string,
  options: ExtractProgressionOptions = {},
): ExerciseProgressionSeries {
  const { allowedGymIds, timeframe = 'ALL', now = new Date(), gymNamesMap } = options;
  const cutoffMs = getTimeframeCutoff(timeframe, now);

  const rawPoints: ProgressionDataPoint[] = [];

  for (const workout of workouts) {
    if (allowedGymIds) {
      const isAllowed = allowedGymIds instanceof Set
        ? allowedGymIds.has(workout.gymId)
        : (allowedGymIds.length === 0 || allowedGymIds.includes(workout.gymId));
      if (!isAllowed) {
        continue;
      }
    }

    const workoutDate = new Date(workout.startTime);
    const timestamp = workoutDate.getTime();
    if (Number.isNaN(timestamp)) {
      continue;
    }

    const occurrences = (workout.exercises || []).filter((e) => e.exerciseId === exerciseId);
    const completedSets = occurrences.flatMap((e) => e.sets || []).filter((s) => s.isCompleted);
    if (completedSets.length === 0) continue;

    let maxWeightKg = 0;
    let maxReps = 0;
    let totalVolumeKg = 0;
    let best1RM = 0;
    let topSet = completedSets[0];
    let topSetScore = -1;

    for (const set of completedSets) {
      const weight = Number.isFinite(set.weightKg) ? Math.max(0, set.weightKg) : 0;
      const reps = Number.isFinite(set.reps) ? Math.max(0, set.reps) : 0;
      const setVol = weight * reps;
      totalVolumeKg += setVol;

      if (weight > maxWeightKg) maxWeightKg = weight;
      if (reps > maxReps) maxReps = reps;

      const calc = calculate1RM(weight, reps);
      const est1RM = calc.average;
      if (est1RM > best1RM) best1RM = est1RM;

      // Score set priority for topSet metadata: prefer higher 1RM, tie-break by weight, then reps for bodyweight
      const score = est1RM * 10000 + weight * 100 + reps;
      if (score > topSetScore) {
        topSetScore = score;
        topSet = set;
      }
    }

    const gymName = gymNamesMap
      ? (gymNamesMap instanceof Map ? gymNamesMap.get(workout.gymId) : (gymNamesMap as Record<string, string>)[workout.gymId])
      : undefined;

    rawPoints.push({
      workoutId: workout.id,
      workoutName: workout.name,
      date: workout.startTime,
      dateLabel: dateLabel(workoutDate),
      timestamp,
      gymId: workout.gymId,
      gymName,
      e1rmKg: best1RM,
      maxWeightKg,
      totalVolumeKg,
      maxReps,
      isPr: false,
      topSet: {
        weightKg: topSet.weightKg,
        reps: topSet.reps,
        rpe: topSet.rpe,
      },
    });
  }

  // Chronological sort: oldest to newest across full history
  rawPoints.sort((a, b) => a.timestamp - b.timestamp);

  // Compute PR flags as records fall chronologically across full history
  let runningBest1RM = 0;
  let runningBestWeight = 0;
  let runningBestVolume = 0;
  let runningBestReps = 0;

  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i];
    const is1rmPr = i > 0 && p.e1rmKg > runningBest1RM && p.e1rmKg > 0;
    const isWeightPr = i > 0 && p.maxWeightKg > runningBestWeight && p.maxWeightKg > 0;
    const isVolPr = i > 0 && p.totalVolumeKg > runningBestVolume && p.totalVolumeKg > 0;
    const isRepsPr = i > 0 && p.maxReps > runningBestReps && p.maxReps > 0;

    p.prMetrics = {
      e1rm: is1rmPr,
      maxWeight: isWeightPr,
      volume: isVolPr,
      maxReps: isRepsPr,
    };
    p.isPr = is1rmPr || isWeightPr || (runningBestWeight === 0 && isRepsPr);

    if (p.e1rmKg > runningBest1RM) runningBest1RM = p.e1rmKg;
    if (p.maxWeightKg > runningBestWeight) runningBestWeight = p.maxWeightKg;
    if (p.totalVolumeKg > runningBestVolume) runningBestVolume = p.totalVolumeKg;
    if (p.maxReps > runningBestReps) runningBestReps = p.maxReps;
  }

  // True all-time bests across full history
  const allTimeBest1RM = rawPoints.length > 0 ? Math.max(...rawPoints.map((p) => p.e1rmKg)) : 0;
  const allTimeBestWeight = rawPoints.length > 0 ? Math.max(...rawPoints.map((p) => p.maxWeightKg)) : 0;
  const allTimeBestReps = rawPoints.length > 0 ? Math.max(...rawPoints.map((p) => p.maxReps)) : 0;
  const current1RM = rawPoints.length > 0 ? rawPoints[rawPoints.length - 1].e1rmKg : 0;
  const currentWeight = rawPoints.length > 0 ? rawPoints[rawPoints.length - 1].maxWeightKg : 0;
  const currentReps = rawPoints.length > 0 ? rawPoints[rawPoints.length - 1].maxReps : 0;

  // Filter points to timeframe window after calculating true PRs and all-time bests
  const filteredPoints = cutoffMs > 0 ? rawPoints.filter((p) => p.timestamp >= cutoffMs) : rawPoints;

  let changePercent1RM = 0;
  let changePercentReps = 0;
  if (filteredPoints.length >= 2) {
    const firstVal = filteredPoints[0].e1rmKg;
    const lastVal = filteredPoints[filteredPoints.length - 1].e1rmKg;
    if (firstVal > 0) {
      changePercent1RM = Number((((lastVal - firstVal) / firstVal) * 100).toFixed(1));
    }
    const firstReps = filteredPoints[0].maxReps;
    const lastReps = filteredPoints[filteredPoints.length - 1].maxReps;
    if (firstReps > 0) {
      changePercentReps = Number((((lastReps - firstReps) / firstReps) * 100).toFixed(1));
    }
  }

  const totalVolumeKg = filteredPoints.reduce((sum, p) => sum + p.totalVolumeKg, 0);

  return {
    exerciseId,
    points: filteredPoints,
    summary: {
      allTimeBest1RM,
      allTimeBestWeight,
      allTimeBestReps,
      current1RM,
      currentWeight,
      currentReps,
      changePercent1RM,
      changePercentReps,
      totalSessions: filteredPoints.length,
      totalVolumeKg,
    },
  };
}

export function isPointPrForMetric(point: ProgressionDataPoint, metric: ProgressionMetric): boolean {
  if (point.prMetrics) {
    switch (metric) {
      case 'e1rm':
        return Boolean(point.prMetrics.e1rm);
      case 'max_weight':
        return Boolean(point.prMetrics.maxWeight);
      case 'volume':
        return Boolean(point.prMetrics.volume);
      case 'max_reps':
        return Boolean(point.prMetrics.maxReps);
    }
  }
  return point.isPr;
}

export interface MuscleDistributionPoint {
  muscle: string;
  volumeKg: number;
  setsCount: number;
  percentage: number;
  setsPercentage: number;
}

export function buildTrainingDistribution(
  workouts: Workout[],
  timeframe: TimeframeFilter = 'ALL',
  now: Date = new Date(),
): MuscleDistributionPoint[] {
  const cutoffMs = getTimeframeCutoff(timeframe, now);
  const muscleMap = new Map<string, { volumeKg: number; setsCount: number }>();

  let grandTotalVolume = 0;
  let grandTotalSets = 0;

  for (const workout of workouts) {
    const workoutTime = new Date(workout.startTime).getTime();
    if (Number.isNaN(workoutTime) || workoutTime < cutoffMs) continue;

    for (const ex of workout.exercises || []) {
      const completedSets = (ex.sets || []).filter((s) => s.isCompleted);
      if (completedSets.length === 0) continue;

      const rawMuscles = ex.exercise?.primaryMuscles || [];
      const muscles = rawMuscles.length > 0
        ? rawMuscles.map((m) => m.trim().toLowerCase()).filter(Boolean)
        : ['other'];

      const totalExVolume = completedSets.reduce((sum, s) => sum + (s.weightKg || 0) * (s.reps || 0), 0);
      const totalExSets = completedSets.length;
      grandTotalVolume += totalExVolume;
      grandTotalSets += totalExSets;

      const muscleCount = Math.max(1, muscles.length);
      const splitVolume = totalExVolume / muscleCount;
      const splitSets = totalExSets / muscleCount;

      for (const m of muscles) {
        const existing = muscleMap.get(m) || { volumeKg: 0, setsCount: 0 };
        existing.volumeKg += splitVolume;
        existing.setsCount += splitSets;
        muscleMap.set(m, existing);
      }
    }
  }

  return Array.from(muscleMap.entries())
    .map(([muscle, data]) => ({
      muscle,
      volumeKg: Number(data.volumeKg.toFixed(1)),
      setsCount: data.setsCount % 1 === 0 ? data.setsCount : Number(data.setsCount.toFixed(1)),
      percentage: grandTotalVolume > 0 ? Number(((data.volumeKg / grandTotalVolume) * 100).toFixed(1)) : 0,
      setsPercentage: grandTotalSets > 0 ? Number(((data.setsCount / grandTotalSets) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.volumeKg - a.volumeKg || a.muscle.localeCompare(b.muscle));
}

export interface LifetimeTrainingStats {
  totalWorkouts: number;
  totalVolumeKg: number;
  totalDurationMinutes: number;
  totalSets: number;
  totalReps: number;
  workoutsThisWeek: number;
  volumeThisWeekKg: number;
}

export function buildLifetimeTrainingStats(
  workouts: Workout[],
  now: Date = new Date(),
): LifetimeTrainingStats {
  let totalVolumeKg = 0;
  let totalDurationMinutes = 0;
  let totalSets = 0;
  let totalReps = 0;

  const currentWeekStart = startOfWeek(now).getTime();
  let workoutsThisWeek = 0;
  let volumeThisWeekKg = 0;

  for (const w of workouts) {
    const wTime = new Date(w.startTime).getTime();
    const isThisWeek = !Number.isNaN(wTime) && wTime >= currentWeekStart;
    if (isThisWeek) {
      workoutsThisWeek++;
    }

    totalDurationMinutes += Math.round((w.durationSeconds || 0) / 60);

    let workoutVolume = 0;
    for (const ex of w.exercises || []) {
      for (const s of ex.sets || []) {
        if (!s.isCompleted) continue;
        totalSets++;
        const reps = Number.isFinite(s.reps) ? Math.max(0, s.reps) : 0;
        const weight = Number.isFinite(s.weightKg) ? Math.max(0, setWeightOrZero(s.weightKg)) : 0;
        totalReps += reps;
        const setVol = weight * reps;
        workoutVolume += setVol;
      }
    }

    totalVolumeKg += workoutVolume;
    if (isThisWeek) {
      volumeThisWeekKg += workoutVolume;
    }
  }

  return {
    totalWorkouts: workouts.length,
    totalVolumeKg,
    totalDurationMinutes,
    totalSets,
    totalReps,
    workoutsThisWeek,
    volumeThisWeekKg,
  };
}

function setWeightOrZero(val: number | undefined | null): number {
  return typeof val === 'number' && Number.isFinite(val) ? Math.max(0, val) : 0;
}

export interface RepRangeDistribution {
  strength: number; // 1-5 reps
  hypertrophy: number; // 6-12 reps
  endurance: number; // 13+ reps
  totalSets: number;
  percentages: {
    strength: number;
    hypertrophy: number;
    endurance: number;
  };
}

export function buildRepRangeDistribution(
  workouts: Workout[],
  timeframe: TimeframeFilter = 'ALL',
  now: Date = new Date(),
): RepRangeDistribution {
  const cutoffMs = getTimeframeCutoff(timeframe, now);
  let strength = 0;
  let hypertrophy = 0;
  let endurance = 0;

  for (const workout of workouts) {
    const workoutTime = new Date(workout.startTime).getTime();
    if (Number.isNaN(workoutTime) || workoutTime < cutoffMs) continue;

    for (const ex of workout.exercises || []) {
      for (const s of ex.sets || []) {
        if (!s.isCompleted || s.reps <= 0) continue;
        if (s.reps <= 5) strength++;
        else if (s.reps <= 12) hypertrophy++;
        else endurance++;
      }
    }
  }

  const totalSets = strength + hypertrophy + endurance;
  return {
    strength,
    hypertrophy,
    endurance,
    totalSets,
    percentages: {
      strength: totalSets > 0 ? Number(((strength / totalSets) * 100).toFixed(1)) : 0,
      hypertrophy: totalSets > 0 ? Number(((hypertrophy / totalSets) * 100).toFixed(1)) : 0,
      endurance: totalSets > 0 ? Number(((endurance / totalSets) * 100).toFixed(1)) : 0,
    },
  };
}

export interface ConsistencyWeek {
  weekKey: string;
  label: string;
  workoutCount: number;
  totalDurationMinutes: number;
}

export interface ConsistencySummary {
  currentStreakWeeks: number;
  bestStreakWeeks: number;
  totalWorkouts: number;
  averageWorkoutsPerWeek: number;
  weeks: ConsistencyWeek[];
}

export function buildConsistencySummary(
  workouts: Workout[],
  now: Date = new Date(),
  weekSpan: number = 12,
): ConsistencySummary {
  const span = Math.max(1, Math.floor(weekSpan));
  const currentWeekDate = startOfWeek(now);
  const firstWeekDate = new Date(currentWeekDate);
  firstWeekDate.setUTCDate(firstWeekDate.getUTCDate() - (span - 1) * 7);

  const weeks: ConsistencyWeek[] = [];
  const weeksByKey = new Map<string, ConsistencyWeek>();

  for (let i = 0; i < span; i++) {
    const wDate = new Date(firstWeekDate);
    wDate.setUTCDate(wDate.getUTCDate() + i * 7);
    const key = dateKey(wDate);
    const item: ConsistencyWeek = {
      weekKey: key,
      label: dateLabel(wDate),
      workoutCount: 0,
      totalDurationMinutes: 0,
    };
    weeks.push(item);
    weeksByKey.set(key, item);
  }

  // Populate weeks and all-time weekly counts for streak calculation
  const allTimeWeeklyCounts = new Map<string, number>();

  for (const w of workouts) {
    const wTime = new Date(w.startTime);
    if (Number.isNaN(wTime.getTime())) continue;

    const wWeek = dateKey(startOfWeek(wTime));
    allTimeWeeklyCounts.set(wWeek, (allTimeWeeklyCounts.get(wWeek) || 0) + 1);

    const tracked = weeksByKey.get(wWeek);
    if (tracked) {
      tracked.workoutCount += 1;
      tracked.totalDurationMinutes += Math.round((w.durationSeconds || 0) / 60);
    }
  }

  // Current streak
  const currentWeekKey = dateKey(currentWeekDate);
  const currentWeekCount = allTimeWeeklyCounts.get(currentWeekKey) || 0;

  let currentStreakWeeks = 0;
  // If current week has workouts, start checking from current week.
  // Otherwise, start checking from previous week (streak is still ongoing if last week was active).
  let checkDate = new Date(currentWeekDate);
  if (currentWeekCount === 0) {
    checkDate.setUTCDate(checkDate.getUTCDate() - 7);
  }

  while (true) {
    const key = dateKey(checkDate);
    const count = allTimeWeeklyCounts.get(key) || 0;
    if (count > 0) {
      currentStreakWeeks++;
      checkDate.setUTCDate(checkDate.getUTCDate() - 7);
    } else {
      break;
    }
  }

  // Best streak across all recorded weeks
  const sortedWeekKeys = Array.from(allTimeWeeklyCounts.keys()).sort();
  let bestStreakWeeks = 0;
  let runningStreak = 0;
  let lastWeekMs: number | null = null;

  for (const key of sortedWeekKeys) {
    const count = allTimeWeeklyCounts.get(key) || 0;
    if (count > 0) {
      const thisWeekMs = new Date(key).getTime();
      if (lastWeekMs === null || Math.round((thisWeekMs - lastWeekMs) / (7 * 86400 * 1000)) === 1) {
        runningStreak++;
      } else {
        runningStreak = 1;
      }
      lastWeekMs = thisWeekMs;
      if (runningStreak > bestStreakWeeks) {
        bestStreakWeeks = runningStreak;
      }
    }
  }
  if (currentStreakWeeks > bestStreakWeeks) {
    bestStreakWeeks = currentStreakWeeks;
  }

  const workoutsInSpan = weeks.reduce((sum, w) => sum + w.workoutCount, 0);
  const averageWorkoutsPerWeek = Number((workoutsInSpan / span).toFixed(1));

  return {
    currentStreakWeeks,
    bestStreakWeeks,
    totalWorkouts: workouts.length,
    averageWorkoutsPerWeek,
    weeks,
  };
}
