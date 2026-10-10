import { Exercise, ExerciseGymScope, Gym, Workout, WorkoutSet } from '../types';
import { calculate1RM } from '../utils/calculator';
import { formatWeight, WeightUnit } from '../utils/units';
import { getAllowedGymIds, resolveExerciseScope } from './gym-scope';
import {
  distanceUnitFor,
  formatDistance,
  formatSetDuration,
  getTrackingType,
  setRecordValues,
  SetRecordValues,
} from './tracking';
import type { TrackingType } from '../types';

export type PRRank = 1 | 2 | 3; // 1 = Gold, 2 = Silver, 3 = Bronze
export type PRMetric = 'weight' | '1rm' | 'volume' | 'reps' | 'duration' | 'distance';

export const PR_METRICS: PRMetric[] = ['weight', '1rm', 'volume', 'reps', 'duration', 'distance'];

function recordValues(
  set: Pick<WorkoutSet, 'weightKg' | 'reps' | 'durationSeconds' | 'distanceM'>,
  type: TrackingType,
): SetRecordValues {
  return setRecordValues(set, type, (weightKg, reps) => calculate1RM(weightKg, reps).average);
}
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
  duration: number[];
  distance: number[];
}

function emptyLeaderboard(): ExerciseLeaderboard {
  return { weight: [], '1rm': [], volume: [], reps: [], duration: [], distance: [] };
}

export interface WorkoutPRAchievementItem {
  exerciseId: string;
  exerciseName: string;
  setId: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  durationSeconds?: number;
  distanceM?: number;
  trackingType?: TrackingType;
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
  const values = Object.fromEntries(PR_METRICS.map((metric) => [metric, new Set<number>()])) as Record<PRMetric, Set<number>>;

  for (const w of workouts) {
    if (beforeStartTime && w.startTime >= beforeStartTime) continue;
    if (gymFilter !== null && !gymFilter.has(w.gymId)) continue;

    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      const trackingType = getTrackingType(ex);
      for (const s of ex.sets) {
        if (!s.isCompleted || s.type === 'warmup') continue;
        const setValues = recordValues(s, trackingType);
        for (const metric of PR_METRICS) {
          if (setValues[metric] > 0) values[metric].add(setValues[metric]);
        }
      }
    }
  }

  const desc = (a: number, b: number) => b - a;
  const leaderboard = emptyLeaderboard();
  for (const metric of PR_METRICS) leaderboard[metric] = Array.from(values[metric]).sort(desc);
  return leaderboard;
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
    distance: 4,
    duration: 5,
  };
  return metricOrder[a.metric] - metricOrder[b.metric];
}

/**
 * Evaluates all PRs achieved within a workout (active or completed) relative to
 * historical workouts, respecting multi-gym tracking isolation.
 */
/**
 * Where prior records come from when ranking a workout. The default reads raw workout lists; the
 * history index answers the same questions incrementally when evaluating many workouts at once.
 */
export interface PriorRecordSource {
  /** Distinct values per metric, descending, from sets strictly before `beforeStartTime`. */
  leaderboard(exerciseId: string, gymFilter: Set<string> | null, beforeStartTime: string): ExerciseLeaderboard;
  /** Most reps ever done at exactly `weightKg` strictly before `beforeStartTime`. */
  maxRepsAtWeight(exerciseId: string, gymFilter: Set<string> | null, beforeStartTime: string, weightKg: number): number;
}

function sourceFromWorkouts(priorWorkoutsByExercise: Record<string, Workout[]>): PriorRecordSource {
  return {
    leaderboard: (exerciseId, gymFilter, beforeStartTime) =>
      extractLeaderboard(priorWorkoutsByExercise[exerciseId] || [], exerciseId, gymFilter, beforeStartTime),
    maxRepsAtWeight: (exerciseId, gymFilter, beforeStartTime, weightKg) => {
      let maxReps = 0;
      for (const pw of priorWorkoutsByExercise[exerciseId] || []) {
        if (beforeStartTime && pw.startTime >= beforeStartTime) continue;
        if (gymFilter !== null && !gymFilter.has(pw.gymId)) continue;
        for (const ex of pw.exercises) {
          if (ex.exerciseId !== exerciseId) continue;
          const trackingType = getTrackingType(ex);
          for (const s of ex.sets) {
            if (!s.isCompleted || s.type === 'warmup') continue;
            if (recordValues(s, trackingType).weight === weightKg && s.reps > maxReps) {
              maxReps = s.reps;
            }
          }
        }
      }
      return maxReps;
    },
  };
}

export function evaluateWorkoutPRs(
  workout: Workout,
  priorWorkoutsByExercise: Record<string, Workout[]>,
  gyms: Gym[],
  gymTrackingEnabled: boolean,
  scopesByExercise?: Record<string, ExerciseGymScope | undefined>
): WorkoutPRSummary {
  return evaluateWorkoutPRsWithSource(
    workout,
    sourceFromWorkouts(priorWorkoutsByExercise),
    gyms,
    gymTrackingEnabled,
    scopesByExercise,
  );
}

/** Ranks one workout against any prior-record source, e.g. a prebuilt PRHistoryIndex. */
export function evaluateWorkoutPRsWithSource(
  workout: Workout,
  source: PriorRecordSource,
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

    // Leaderboard strictly before this workout started, scoped to the allowed gyms when gym-specific
    const gymFilter = isGymSpecific ? allowedGymIds : null;
    const targetLeaderboard = source.leaderboard(exerciseId, gymFilter, workout.startTime);
    const trackingType = getTrackingType(activeEx);
    const completedSets = activeEx.sets.filter((s) => s.isCompleted && s.type !== 'warmup');
    const completedValues = new Map(completedSets.map((set) => [set.id, recordValues(set, trackingType)]));
    const metrics = PR_METRICS;

    // Map each set ID to its earned achievements in this session
    const setAchievementsMap = new Map<string, PRAchievement[]>();

    for (const metric of metrics) {
      let bestVal = 0;
      let bestSet: WorkoutSet | null = null;

      for (const set of completedSets) {
        const val = completedValues.get(set.id)![metric];

        if (val > bestVal) {
          bestVal = val;
          bestSet = set;
        } else if (metric === 'weight' && val === bestVal && bestSet && set.reps > bestSet.reps) {
          // If weights are equal in the same session, prefer the set with more reps
          bestVal = val;
          bestSet = set;
        }
      }

      if (bestVal > 0 && bestSet) {
        let rankResult = evaluateRank(bestVal, targetLeaderboard[metric]);

        // When weight matches the top historical record, check if reps beat prior reps at this weight
        if (!rankResult && metric === 'weight' && targetLeaderboard.weight.length > 0 && bestVal === targetLeaderboard.weight[0]) {
          const maxPriorRepsAtWeight = source.maxRepsAtWeight(exerciseId, gymFilter, workout.startTime, bestVal);
          if (bestSet.reps > maxPriorRepsAtWeight) {
            rankResult = { rank: 1, previousRecord: bestVal, isTie: false };
          }
        }

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
          ...(set.durationSeconds !== undefined ? { durationSeconds: set.durationSeconds } : {}),
          ...(set.distanceM !== undefined ? { distanceM: set.distanceM } : {}),
          ...(activeEx.trackingType ? { trackingType: activeEx.trackingType } : {}),
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


// ---------------------------------------------------------------------------
// Whole-history evaluation
// ---------------------------------------------------------------------------

/** Ranking only ever looks at the best three distinct values, so that is all the index keeps. */
const LEADERBOARD_DEPTH = 3;

interface GymRecordBoard extends ExerciseLeaderboard {
  repsAtWeight: Map<number, number>;
}

function insertTopDistinct(values: number[], value: number): void {
  if (value <= 0 || values.includes(value)) return;
  if (values.length >= LEADERBOARD_DEPTH && value <= values[values.length - 1]) return;
  insertSortedDistinct(values, value);
  if (values.length > LEADERBOARD_DEPTH) values.length = LEADERBOARD_DEPTH;
}

/**
 * Running per-exercise, per-gym record index. Workouts are added in chronological order, so at
 * any point it answers "what were the records before now" without rescanning history.
 */
export class PRHistoryIndex implements PriorRecordSource {
  private readonly boards = new Map<string, Map<string, GymRecordBoard>>();

  /** Adds a workout's completed sets; `onlyExerciseIds` restricts which exercises are indexed. */
  add(workout: Workout, onlyExerciseIds?: ReadonlySet<string>): void {
    for (const ex of workout.exercises || []) {
      if (onlyExerciseIds && !onlyExerciseIds.has(ex.exerciseId)) continue;
      const trackingType = getTrackingType(ex);
      for (const s of ex.sets || []) {
        if (!s.isCompleted || s.type === 'warmup') continue;
        const board = this.boardFor(ex.exerciseId, workout.gymId);
        const setValues = recordValues(s, trackingType);
        if (setValues.weight > 0 && s.reps > (board.repsAtWeight.get(s.weightKg) ?? 0)) {
          board.repsAtWeight.set(s.weightKg, s.reps);
        }
        for (const metric of PR_METRICS) insertTopDistinct(board[metric], setValues[metric]);
      }
    }
  }

  leaderboard(exerciseId: string, gymFilter: Set<string> | null): ExerciseLeaderboard {
    const merged = emptyLeaderboard();
    for (const [gymId, board] of this.boards.get(exerciseId) ?? []) {
      if (gymFilter !== null && !gymFilter.has(gymId)) continue;
      for (const metric of PR_METRICS) {
        for (const value of board[metric]) insertTopDistinct(merged[metric], value);
      }
    }
    return merged;
  }

  maxRepsAtWeight(exerciseId: string, gymFilter: Set<string> | null, _before: string, weightKg: number): number {
    let maxReps = 0;
    for (const [gymId, board] of this.boards.get(exerciseId) ?? []) {
      if (gymFilter !== null && !gymFilter.has(gymId)) continue;
      maxReps = Math.max(maxReps, board.repsAtWeight.get(weightKg) ?? 0);
    }
    return maxReps;
  }

  private boardFor(exerciseId: string, gymId: string): GymRecordBoard {
    let byGym = this.boards.get(exerciseId);
    if (!byGym) {
      byGym = new Map();
      this.boards.set(exerciseId, byGym);
    }
    let board = byGym.get(gymId);
    if (!board) {
      board = { ...emptyLeaderboard(), repsAtWeight: new Map() };
      byGym.set(gymId, board);
    }
    return board;
  }
}

/**
 * Indexes the prior records for a workout that is still being logged. Every completed workout
 * other than the active one counts, whatever its start time: a resumed draft or an edited
 * duration can leave the active workout starting before workouts that were already saved, and
 * those records still stand.
 */
export function buildActiveWorkoutRecordIndex(
  historyByExercise: Record<string, Workout[]>,
  activeWorkoutId: string | undefined
): PRHistoryIndex {
  const index = new PRHistoryIndex();
  const loadedExerciseIds = new Set(Object.keys(historyByExercise));
  const added = new Set<string>();
  for (const list of Object.values(historyByExercise)) {
    for (const workout of list) {
      if (workout.id === activeWorkoutId || added.has(workout.id)) continue;
      added.add(workout.id);
      index.add(workout, loadedExerciseIds);
    }
  }
  return index;
}

/**
 * Ranks the sets of a workout that is still being logged. Exercises whose history has not loaded
 * yet are skipped; ranking them against an empty history would flag every set as a new record.
 */
export function evaluateActiveWorkoutPRs(
  workout: Workout,
  historyByExercise: Record<string, Workout[]>,
  index: PriorRecordSource,
  gyms: Gym[],
  gymTrackingEnabled: boolean,
  scopesByExercise?: Record<string, ExerciseGymScope | undefined>
): WorkoutPRSummary {
  const loaded = { ...workout, exercises: workout.exercises.filter((ex) => ex.exerciseId in historyByExercise) };
  return evaluateWorkoutPRsWithSource(loaded, index, gyms, gymTrackingEnabled, scopesByExercise);
}

/**
 * Evaluates PRs for every workout in one chronological pass. Equivalent to calling
 * evaluateWorkoutPRs for each workout against the full history, but linear in history size
 * instead of quadratic.
 */
export function evaluateAllWorkoutPRs(
  workouts: Workout[],
  gyms: Gym[],
  gymTrackingEnabled: boolean,
  scopesByExercise?: Record<string, ExerciseGymScope | undefined>
): Record<string, WorkoutPRSummary> {
  const ordered = workouts
    .filter((w) => typeof w.startTime === 'string' && w.startTime.length > 0)
    .sort((a, b) => (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0));
  const index = new PRHistoryIndex();
  const results: Record<string, WorkoutPRSummary> = {};

  let i = 0;
  while (i < ordered.length) {
    // Workouts sharing a start time never count against each other ("strictly before").
    let j = i;
    while (j < ordered.length && ordered[j].startTime === ordered[i].startTime) j++;
    for (let k = i; k < j; k++) {
      results[ordered[k].id] = evaluateWorkoutPRsWithSource(ordered[k], index, gyms, gymTrackingEnabled, scopesByExercise);
    }
    for (let k = i; k < j; k++) index.add(ordered[k]);
    i = j;
  }

  // Workouts without a start time keep the original all-history behaviour.
  const byExercise: Record<string, Workout[]> = {};
  for (const w of workouts) {
    for (const ex of w.exercises || []) (byExercise[ex.exerciseId] ||= []).push(w);
  }
  for (const w of workouts) {
    if (!results[w.id]) results[w.id] = evaluateWorkoutPRs(w, byExercise, gyms, gymTrackingEnabled, scopesByExercise);
  }
  return results;
}

/**
 * Formats a short badge label (e.g. "PR", "2nd", "3rd", "FitX PR"). The medal
 * itself is rendered visually by the <Medal /> component next to this text.
 */
export function formatPRBadgeLabel(achievement: PRAchievement, showGymName = false): string {
  const rankLabel = achievement.rank === 1 ? (achievement.isTie ? 'Tied PR' : 'PR') : achievement.rank === 2 ? '2nd' : '3rd';

  if (achievement.scope === 'gym') {
    if (showGymName && achievement.gymName) {
      return `${achievement.gymName} ${rankLabel}`;
    }
    return `Gym ${rankLabel}`;
  }
  return rankLabel;
}

/**
 * Formats detailed human-readable achievement description
 */
const PR_METRIC_WORDING: Record<PRMetric, { best: string; ranked: string }> = {
  weight: { best: 'Heaviest weight', ranked: 'heaviest weight' },
  '1rm': { best: 'Best estimated 1RM', ranked: 'best estimated 1RM' },
  volume: { best: 'Most volume in one set', ranked: 'highest set volume' },
  reps: { best: 'Most reps', ranked: 'most reps' },
  duration: { best: 'Longest time', ranked: 'longest time' },
  distance: { best: 'Longest distance', ranked: 'longest distance' },
};

/**
 * Formats a plain-language achievement description, e.g. "Heaviest weight ever (beats 100 kg)",
 * "2nd most reps at FitX" or "Ties your best estimated 1RM ever (ties 120 kg)".
 */
export function formatPRDescription(achievement: PRAchievement, unit: WeightUnit = 'kg'): string {
  const wording = PR_METRIC_WORDING[achievement.metric];
  const scopeStr =
    achievement.scope === 'gym'
      ? achievement.gymName
        ? ` at ${achievement.gymName}`
        : ' at this gym'
      : ' ever';

  let headline: string;
  if (achievement.rank === 1) {
    headline = achievement.isTie ? `Ties your ${wording.ranked}` : wording.best;
  } else {
    headline = `${achievement.rank === 2 ? '2nd' : '3rd'} ${wording.ranked}`;
  }

  let prevStr = '';
  if (achievement.previousRecord !== undefined && achievement.previousRecord > 0) {
    const action = achievement.isTie ? 'ties' : 'beats';
    if (achievement.metric === 'weight' || achievement.metric === '1rm' || achievement.metric === 'volume') {
      prevStr = ` (${action} ${formatWeight(achievement.previousRecord, unit)})`;
    } else if (achievement.metric === 'reps') {
      prevStr = ` (${action} ${achievement.previousRecord} reps)`;
    } else if (achievement.metric === 'duration') {
      prevStr = ` (${action} ${formatSetDuration(achievement.previousRecord)})`;
    } else if (achievement.metric === 'distance') {
      prevStr = ` (${action} ${formatDistance(achievement.previousRecord, distanceUnitFor(unit))})`;
    }
  }

  return `${headline}${scopeStr}${prevStr}`;
}

export interface PodiumEntry {
  rank: PRRank;
  metric: PRMetric;
  value: number;
  weightKg: number;
  reps: number;
  durationSeconds?: number;
  distanceM?: number;
  trackingType?: TrackingType;
  date: string;
  gymId: string;
  gymName?: string;
  workoutId: string;
  workoutName: string;
}

export type ExercisePodium = Record<PRMetric, PodiumEntry[]>;

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
    durationSeconds?: number;
    distanceM?: number;
    trackingType?: TrackingType;
    date: string;
    gymId: string;
    gymName?: string;
    workoutId: string;
    workoutName: string;
    values: SetRecordValues;
  }

  const candidates: CandidateSet[] = [];

  for (const w of workouts) {
    if (allowedGymIds !== null && !allowedGymIds.has(w.gymId)) continue;
    const currentGymName = gymMap.get(w.gymId);

    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      const trackingType = getTrackingType(ex);
      for (const s of ex.sets) {
        if (!s.isCompleted || s.type === 'warmup') continue;

        candidates.push({
          weightKg: s.weightKg,
          reps: s.reps,
          ...(s.durationSeconds !== undefined ? { durationSeconds: s.durationSeconds } : {}),
          ...(s.distanceM !== undefined ? { distanceM: s.distanceM } : {}),
          ...(ex.trackingType ? { trackingType: ex.trackingType } : {}),
          date: w.startTime,
          gymId: w.gymId,
          gymName: currentGymName,
          workoutId: w.id,
          workoutName: w.name,
          values: recordValues(s, trackingType),
        });
      }
    }
  }

  const podiumTrackedFields = (c: CandidateSet) => ({
    ...(c.durationSeconds !== undefined ? { durationSeconds: c.durationSeconds } : {}),
    ...(c.distanceM !== undefined ? { distanceM: c.distanceM } : {}),
    ...(c.trackingType ? { trackingType: c.trackingType } : {}),
  });

  const buildPodiumForMetric = (
    metric: PRMetric,
    getValue: (c: CandidateSet) => number
  ): PodiumEntry[] => {
    const valueMap = new Map<number, CandidateSet>();
    for (const c of candidates) {
      const val = getValue(c);
      if (val <= 0) continue;
      const existing = valueMap.get(val);
      if (
        !existing ||
        (metric === 'weight' && c.reps > existing.reps) ||
        (metric === 'weight' && c.reps === existing.reps && c.date < existing.date) ||
        (metric !== 'weight' && c.date < existing.date)
      ) {
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
      ...podiumTrackedFields(candidate1),
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
          ...podiumTrackedFields(candidate2),
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
          ...podiumTrackedFields(candidate3),
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

  return Object.fromEntries(
    PR_METRICS.map((metric) => [metric, buildPodiumForMetric(metric, (c) => c.values[metric])])
  ) as ExercisePodium;
}

