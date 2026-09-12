import { Exercise, ExerciseGymScope, Gym, Workout, WorkoutSet } from '../types';
import { calculate1RM } from '../utils/calculator';
import { formatWeight, WeightUnit } from '../utils/units';
import { getAllowedGymIds, resolveExerciseScope } from './gym-scope';

export type PRRank = 1 | 2 | 3; // 1 = Gold 🥇, 2 = Silver 🥈, 3 = Bronze 🥉
export type PRMetric = 'weight' | '1rm' | 'volume' | 'reps';
export type PRScope = 'global' | 'gym';

export interface PRAchievement {
  rank: PRRank;
  metric: PRMetric;
  scope: PRScope;
  value: number;
  previousRecord?: number;
  isTie?: boolean;
  gymId?: string;
  gymName?: string;
}

export interface SetPRResult {
  setId: string;
  primary: PRAchievement | null;
  achievements: PRAchievement[];
}

export interface ExerciseLeaderboard {
  weight: number[];
  '1rm': number[];
  volume: number[];
  reps: number[];
}

export interface WorkoutPRAchievementItem {
  exerciseId: string;
  exerciseName: string;
  setId: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  achievement: PRAchievement;
}

export interface WorkoutPRSummary {
  workoutId: string;
  setPRs: Map<string, SetPRResult>;
  achievements: WorkoutPRAchievementItem[];
  goldCount: number;
  silverCount: number;
  bronzeCount: number;
  totalCount: number;
}

/**
 * Inserts a value into a descending-sorted distinct array.
 */
export function insertSortedDistinct(arr: number[], val: number): void {
  if (val <= 0 || arr.includes(val)) return;
  const idx = arr.findIndex((x) => x < val);
  if (idx === -1) {
    arr.push(val);
  } else {
    arr.splice(idx, 0, val);
  }
}

/**
 * Determines whether a value qualifies for Rank 1 (Gold), Rank 2 (Silver), or Rank 3 (Bronze)
 * given a list of previous distinct best values sorted in descending order.
 */
export function evaluateRank(
  value: number,
  priorRecords?: readonly number[]
): { rank: PRRank; previousRecord?: number; isTie?: boolean } | null {
  if (value <= 0) return null;
  const records = priorRecords ?? [];

  // Case 1: First performance in history
  if (records.length === 0) {
    return { rank: 1 };
  }

  // Case 2: Beats or ties 1st place
  if (value > records[0]) {
    return { rank: 1, previousRecord: records[0], isTie: false };
  }
  if (value === records[0]) {
    return { rank: 1, previousRecord: records[0], isTie: true };
  }

  // Case 3: 2nd place (must be strictly < records[0] and at least 80% of records[0] to filter light warmups)
  if (value < records[0] && value >= 0.8 * records[0]) {
    if (records.length >= 2) {
      if (value > records[1]) {
        return { rank: 2, previousRecord: records[1] };
      }
    } else {
      return { rank: 2 };
    }
  }

  // Case 4: 3rd place (must be strictly < records[1] and at least 75% of records[0] to filter light warmups)
  if (records.length >= 2 && value < records[1] && value >= 0.75 * records[0]) {
    if (records.length >= 3) {
      if (value > records[2]) {
        return { rank: 3, previousRecord: records[2] };
      }
    } else {
      return { rank: 3 };
    }
  }

  return null;
}

/**
 * Extracts distinct, descending-sorted values for weight, 1RM, volume, and reps from workouts.
 */
export function extractLeaderboard(
  workouts: Workout[],
  exerciseId: string,
  gymFilter: Set<string> | null,
  beforeStartTime?: string
): ExerciseLeaderboard {
  const weights = new Set<number>();
  const oneRMs = new Set<number>();
  const volumes = new Set<number>();
  const reps = new Set<number>();

  for (const w of workouts) {
    if (beforeStartTime && w.startTime >= beforeStartTime) continue;
    if (gymFilter !== null && !gymFilter.has(w.gymId)) continue;

    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of ex.sets) {
        if (!s.isCompleted || s.type === 'warmup') continue;

        if (s.weightKg > 0) {
          weights.add(s.weightKg);
          if (s.reps > 0) {
            oneRMs.add(calculate1RM(s.weightKg, s.reps).average);
            volumes.add(s.weightKg * s.reps);
          }
        } else if (s.reps > 0) {
          reps.add(s.reps);
        }
      }
    }
  }

  const desc = (a: number, b: number) => b - a;
  return {
    weight: Array.from(weights).sort(desc),
    '1rm': Array.from(oneRMs).sort(desc),
    volume: Array.from(volumes).sort(desc),
    reps: Array.from(reps).sort(desc),
  };
}

/**
 * Sorts achievements to pick the primary one to display on compact badges:
 * Rank 1 (Gold) > Rank 2 (Silver) > Rank 3 (Bronze)
 * Global Rank 1 > Gym Rank 1
 * Weight > 1RM > Volume > Reps
 */
export function compareAchievements(a: PRAchievement, b: PRAchievement): number {
  if (a.rank !== b.rank) return a.rank - b.rank; // 1 < 2 < 3
  if (a.isTie !== b.isTie) {
    if (!a.isTie && b.isTie) return -1;
    if (a.isTie && !b.isTie) return 1;
  }
  if (a.scope !== b.scope) {
    // If ranks are equal, Global is highest honor (e.g. All-Time Gold > Gym Gold)
    if (a.scope === 'global') return -1;
    if (b.scope === 'global') return 1;
  }
  const metricOrder: Record<PRMetric, number> = {
    weight: 0,
    '1rm': 1,
    volume: 2,
    reps: 3,
  };
  return metricOrder[a.metric] - metricOrder[b.metric];
}

/**
 * Evaluates all PRs achieved within a workout (active or completed) relative to
 * historical workouts, respecting multi-gym tracking isolation.
 */
export function evaluateWorkoutPRs(
  workout: Workout,
  priorWorkoutsByExercise: Record<string, Workout[]>,
  gyms: Gym[],
  gymTrackingEnabled: boolean,
  scopesByExercise?: Record<string, ExerciseGymScope | undefined>
): WorkoutPRSummary {
  const gymMap = new Map(gyms.map((g) => [g.id, g.name]));
  const currentGymName = gymMap.get(workout.gymId);

  const setPRs = new Map<string, SetPRResult>();
  const achievementsList: WorkoutPRAchievementItem[] = [];

  let goldCount = 0;
  let silverCount = 0;
  let bronzeCount = 0;

  for (const activeEx of workout.exercises) {
    const exerciseId = activeEx.exerciseId;
    const exercise = activeEx.exercise;
    const scope = scopesByExercise?.[exerciseId];

    const isGymSpecific =
      gymTrackingEnabled &&
      (resolveExerciseScope(exercise, scope) === 'gym_specific' ||
        resolveExerciseScope(exercise, scope) === 'linked_group');
    const allowedGymIds = getAllowedGymIds(exercise, scope, workout.gymId);

    const priorWorkouts = priorWorkoutsByExercise[exerciseId] || [];

    // Build initial leaderboards strictly before this workout started
    const globalLeaderboard = !isGymSpecific
      ? extractLeaderboard(
          priorWorkouts,
          exerciseId,
          null,
          workout.startTime
        )
      : { weight: [], '1rm': [], volume: [], reps: [] };

    const gymLeaderboard = isGymSpecific
      ? extractLeaderboard(
          priorWorkouts,
          exerciseId,
          allowedGymIds,
          workout.startTime
        )
      : { weight: [], '1rm': [], volume: [], reps: [] };

    // Running copies that update with each set in the current workout
    const runningGlobal: ExerciseLeaderboard = {
      weight: [...globalLeaderboard.weight],
      '1rm': [...globalLeaderboard['1rm']],
      volume: [...globalLeaderboard.volume],
      reps: [...globalLeaderboard.reps],
    };
    const runningGym: ExerciseLeaderboard = {
      weight: [...gymLeaderboard.weight],
      '1rm': [...gymLeaderboard['1rm']],
      volume: [...gymLeaderboard.volume],
      reps: [...gymLeaderboard.reps],
    };

    // Tracks max value achieved so far in this session for this exercise occurrence
    const sessionMax: Record<PRMetric, number> = {
      weight: 0,
      '1rm': 0,
      volume: 0,
      reps: 0,
    };

    for (const set of activeEx.sets) {
      if (!set.isCompleted || set.type === 'warmup') {
        continue;
      }

      const activeMetrics: Array<{ metric: PRMetric; value: number }> = [];

      if (set.weightKg > 0) {
        activeMetrics.push({ metric: 'weight', value: set.weightKg });
        if (set.reps > 0) {
          activeMetrics.push({
            metric: '1rm',
            value: calculate1RM(set.weightKg, set.reps).average,
          });
          activeMetrics.push({
            metric: 'volume',
            value: set.weightKg * set.reps,
          });
        }
      } else if (set.reps > 0) {
        activeMetrics.push({ metric: 'reps', value: set.reps });
      }

      const setAchievements: PRAchievement[] = [];

      for (const { metric, value } of activeMetrics) {
        // Must improve upon what was already done in this workout on this metric
        if (value <= sessionMax[metric]) {
          continue;
        }

        if (isGymSpecific) {
          // Gym-specific evaluation ONLY for machine / cable exercises
          const gymResult = evaluateRank(value, runningGym[metric]);
          if (gymResult) {
            setAchievements.push({
              rank: gymResult.rank,
              metric,
              scope: 'gym',
              value,
              previousRecord: gymResult.previousRecord,
              isTie: gymResult.isTie,
              gymId: workout.gymId,
              gymName: currentGymName,
            });
          }
          insertSortedDistinct(runningGym[metric], value);
        } else {
          // Global evaluation for global exercises (barbell, dumbbell, bodyweight)
          const globalResult = evaluateRank(value, runningGlobal[metric]);
          if (globalResult) {
            setAchievements.push({
              rank: globalResult.rank,
              metric,
              scope: 'global',
              value,
              previousRecord: globalResult.previousRecord,
              isTie: globalResult.isTie,
            });
          }
          insertSortedDistinct(runningGlobal[metric], value);
        }

        // Update session max
        sessionMax[metric] = Math.max(sessionMax[metric], value);
      }

      if (setAchievements.length > 0) {
        setAchievements.sort(compareAchievements);
        const primary = setAchievements[0];

        setPRs.set(set.id, {
          setId: set.id,
          primary,
          achievements: setAchievements,
        });

        achievementsList.push({
          exerciseId,
          exerciseName: exercise.name,
          setId: set.id,
          setNumber: set.setNumber,
          weightKg: set.weightKg,
          reps: set.reps,
          achievement: primary,
        });

        if (primary.rank === 1) goldCount++;
        else if (primary.rank === 2) silverCount++;
        else if (primary.rank === 3) bronzeCount++;
      }
    }
  }

  return {
    workoutId: workout.id,
    setPRs,
    achievements: achievementsList,
    goldCount,
    silverCount,
    bronzeCount,
    totalCount: goldCount + silverCount + bronzeCount,
  };
}

/**
 * Formats a short badge label (e.g. "🥇 PR", "🥈 2nd", "🥉 3rd", "🏅 FitX PR")
 */
export function formatPRBadgeLabel(achievement: PRAchievement, showGymName = false): string {
  const medal = achievement.rank === 1 ? '🥇' : achievement.rank === 2 ? '🥈' : '🥉';
  const rankLabel = achievement.rank === 1 ? (achievement.isTie ? 'Tied PR' : 'PR') : achievement.rank === 2 ? '2nd' : '3rd';

  if (achievement.scope === 'gym') {
    if (showGymName && achievement.gymName) {
      return `${medal} ${achievement.gymName} ${rankLabel}`;
    }
    return `${medal} Gym ${rankLabel}`;
  }
  return `${medal} ${rankLabel}`;
}

/**
 * Formats detailed human-readable achievement description
 */
export function formatPRDescription(achievement: PRAchievement, unit: WeightUnit = 'kg'): string {
  const medal = achievement.rank === 1 ? '🥇 Gold' : achievement.rank === 2 ? '🥈 Silver' : '🥉 Bronze';
  const rankStr = achievement.rank === 1 ? (achievement.isTie ? 'Tied Best' : 'Best') : achievement.rank === 2 ? '2nd Best' : '3rd Best';
  const metricStr =
    achievement.metric === 'weight'
      ? 'Weight Record'
      : achievement.metric === '1rm'
      ? 'Estimated 1RM'
      : achievement.metric === 'volume'
      ? 'Set Volume'
      : 'Max Reps';

  const scopeStr =
    achievement.scope === 'gym'
      ? achievement.gymName
        ? `at ${achievement.gymName}`
        : 'Gym Record'
      : 'All-Time';

  let prevStr = '';
  if (achievement.previousRecord !== undefined && achievement.previousRecord > 0) {
    const action = achievement.isTie ? 'ties' : 'beats';
    if (achievement.metric === 'weight' || achievement.metric === '1rm' || achievement.metric === 'volume') {
      prevStr = ` (${action} ${formatWeight(achievement.previousRecord, unit)})`;
    } else if (achievement.metric === 'reps') {
      prevStr = ` (${action} ${achievement.previousRecord} reps)`;
    }
  }

  return `${medal} (${rankStr}) · ${scopeStr} ${metricStr}${prevStr}`;
}
