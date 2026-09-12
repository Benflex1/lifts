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

  // Case 2: Beats 1st place
  if (value > records[0]) {
    return { rank: 1, previousRecord: records[0], isTie: false };
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

    const targetLeaderboard = isGymSpecific ? gymLeaderboard : globalLeaderboard;
    const completedSets = activeEx.sets.filter((s) => s.isCompleted && s.type !== 'warmup');
    const metrics: PRMetric[] = ['weight', '1rm', 'volume', 'reps'];

    // Map each set ID to its earned achievements in this session
    const setAchievementsMap = new Map<string, PRAchievement[]>();

    for (const metric of metrics) {
      let bestVal = 0;
      let bestSet: WorkoutSet | null = null;

      for (const set of completedSets) {
        let val = 0;
        if (metric === 'weight' && set.weightKg > 0) {
          val = set.weightKg;
        } else if (metric === '1rm' && set.weightKg > 0 && set.reps > 0) {
          val = calculate1RM(set.weightKg, set.reps).average;
        } else if (metric === 'volume' && set.weightKg > 0 && set.reps > 0) {
          val = set.weightKg * set.reps;
        } else if (metric === 'reps' && set.weightKg === 0 && set.reps > 0) {
          val = set.reps;
        }

        if (val > bestVal) {
          bestVal = val;
          bestSet = set;
        }
      }

      if (bestVal > 0 && bestSet) {
        const rankResult = evaluateRank(bestVal, targetLeaderboard[metric]);
        if (rankResult) {
          const ach: PRAchievement = {
            rank: rankResult.rank,
            metric,
            scope: isGymSpecific ? 'gym' : 'global',
            value: bestVal,
            previousRecord: rankResult.previousRecord,
            isTie: rankResult.isTie,
            gymId: isGymSpecific ? workout.gymId : undefined,
            gymName: isGymSpecific ? currentGymName : undefined,
          };

          const list = setAchievementsMap.get(bestSet.id) || [];
          list.push(ach);
          setAchievementsMap.set(bestSet.id, list);
        }
      }
    }

    for (const set of completedSets) {
      const achievements = setAchievementsMap.get(set.id);
      if (achievements && achievements.length > 0) {
        achievements.sort(compareAchievements);
        const primary = achievements[0];

        setPRs.set(set.id, {
          setId: set.id,
          primary,
          achievements,
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

export interface PodiumEntry {
  rank: PRRank;
  metric: PRMetric;
  value: number;
  weightKg: number;
  reps: number;
  date: string;
  gymId: string;
  gymName?: string;
  workoutId: string;
  workoutName: string;
}

export interface ExercisePodium {
  weight: PodiumEntry[];
  '1rm': PodiumEntry[];
  volume: PodiumEntry[];
  reps: PodiumEntry[];
}

/**
 * Extracts top 3 all-time distinct historical podium performances (1st Gold, 2nd Silver, 3rd Bronze)
 * for an exercise, respecting gym scoping rules.
 */
export function extractExercisePodium(
  workouts: Workout[],
  exerciseId: string,
  gyms: Gym[],
  allowedGymIds: Set<string> | null
): ExercisePodium {
  const gymMap = new Map(gyms.map((g) => [g.id, g.name]));

  interface CandidateSet {
    weightKg: number;
    reps: number;
    date: string;
    gymId: string;
    gymName?: string;
    workoutId: string;
    workoutName: string;
    weight: number;
    '1rm': number;
    volume: number;
    repsMetric: number;
  }

  const candidates: CandidateSet[] = [];

  for (const w of workouts) {
    if (allowedGymIds !== null && !allowedGymIds.has(w.gymId)) continue;
    const currentGymName = gymMap.get(w.gymId);

    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of ex.sets) {
        if (!s.isCompleted || s.type === 'warmup') continue;

        const weight = s.weightKg > 0 ? s.weightKg : 0;
        const oneRM = s.weightKg > 0 && s.reps > 0 ? calculate1RM(s.weightKg, s.reps).average : 0;
        const volume = s.weightKg > 0 && s.reps > 0 ? s.weightKg * s.reps : 0;
        const repsMetric = s.weightKg === 0 && s.reps > 0 ? s.reps : 0;

        candidates.push({
          weightKg: s.weightKg,
          reps: s.reps,
          date: w.startTime,
          gymId: w.gymId,
          gymName: currentGymName,
          workoutId: w.id,
          workoutName: w.name,
          weight,
          '1rm': oneRM,
          volume,
          repsMetric,
        });
      }
    }
  }

  const buildPodiumForMetric = (
    metric: PRMetric,
    getValue: (c: CandidateSet) => number
  ): PodiumEntry[] => {
    const valueMap = new Map<number, CandidateSet>();
    for (const c of candidates) {
      const val = getValue(c);
      if (val <= 0) continue;
      const existing = valueMap.get(val);
      if (!existing || c.date < existing.date) {
        valueMap.set(val, c);
      }
    }

    const distinctValues = Array.from(valueMap.keys()).sort((a, b) => b - a);
    if (distinctValues.length === 0) return [];

    const podium: PodiumEntry[] = [];
    const rank1Val = distinctValues[0];
    const candidate1 = valueMap.get(rank1Val)!;
    podium.push({
      rank: 1,
      metric,
      value: rank1Val,
      weightKg: candidate1.weightKg,
      reps: candidate1.reps,
      date: candidate1.date,
      gymId: candidate1.gymId,
      gymName: candidate1.gymName,
      workoutId: candidate1.workoutId,
      workoutName: candidate1.workoutName,
    });

    if (distinctValues.length >= 2) {
      const rank2Val = distinctValues[1];
      if (rank2Val >= 0.8 * rank1Val) {
        const candidate2 = valueMap.get(rank2Val)!;
        podium.push({
          rank: 2,
          metric,
          value: rank2Val,
          weightKg: candidate2.weightKg,
          reps: candidate2.reps,
          date: candidate2.date,
          gymId: candidate2.gymId,
          gymName: candidate2.gymName,
          workoutId: candidate2.workoutId,
          workoutName: candidate2.workoutName,
        });
      }
    }

    if (distinctValues.length >= 3) {
      const rank3Val = distinctValues[2];
      if (rank3Val >= 0.75 * rank1Val) {
        const candidate3 = valueMap.get(rank3Val)!;
        podium.push({
          rank: 3,
          metric,
          value: rank3Val,
          weightKg: candidate3.weightKg,
          reps: candidate3.reps,
          date: candidate3.date,
          gymId: candidate3.gymId,
          gymName: candidate3.gymName,
          workoutId: candidate3.workoutId,
          workoutName: candidate3.workoutName,
        });
      }
    }

    return podium;
  };

  return {
    weight: buildPodiumForMetric('weight', (c) => c.weight),
    '1rm': buildPodiumForMetric('1rm', (c) => c['1rm']),
    volume: buildPodiumForMetric('volume', (c) => c.volume),
    reps: buildPodiumForMetric('reps', (c) => c.repsMetric),
  };
}

