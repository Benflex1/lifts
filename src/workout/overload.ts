import { SetType, TrackingType, WorkoutSet } from '../types';
import { displayToKg, formatWeight, kgToDisplay, WeightUnit } from '../utils/units';

export const PROGRESSIVE_OVERLOAD_KEY = 'progressive_overload_enabled';

export function parseProgressiveOverloadEnabled(value: string | null): boolean {
  return value !== 'false';
}

export type OverloadKind = 'add_weight' | 'add_reps' | 'repeat';

export interface OverloadSuggestion {
  kind: OverloadKind;
  weightKg: number;
  reps: number;
  /** One sentence on why, built from last session's numbers. */
  reason: string;
}

// Warmups and drop sets never decide progression.
const WORKING_SET_TYPES: ReadonlySet<SetType> = new Set(['normal', 'failure']);

// RPE at or above this means the last set was at or near failure, so the weight holds.
const HARD_RPE = 9.5;

export function isWorkingSetType(type: SetType | undefined): boolean {
  return type !== undefined && WORKING_SET_TYPES.has(type);
}

/** The weight step in display units: the smallest jump the usual equipment allows. */
export function getOverloadIncrement(equipment: string | undefined, unit: WeightUnit): number {
  if (unit === 'lb') return 5;
  const kind = (equipment || '').toLowerCase();
  if (kind === 'dumbbell') return 2;
  if (kind === 'kettlebells') return 4;
  return 2.5;
}

/** Rep goal from a routine target: a number or range. Lists and AMRAP have no single goal. */
export function parseRepGoal(target: string | undefined): { min: number; max: number } | null | undefined {
  const trimmed = target?.trim();
  if (!trimmed) return undefined;
  const single = /^(\d+)$/.exec(trimmed);
  if (single) {
    const reps = parseInt(single[1], 10);
    return reps > 0 ? { min: reps, max: reps } : null;
  }
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
  if (range) {
    const min = parseInt(range[1], 10);
    const max = parseInt(range[2], 10);
    return min > 0 && min <= max ? { min, max } : null;
  }
  return null;
}

export interface OverloadInput {
  sets: Pick<WorkoutSet, 'previousType' | 'previousWeightKg' | 'previousReps' | 'previousRpe'>[];
  targetReps?: string;
  trackingType: TrackingType;
  equipment?: string;
  unit: WeightUnit;
}

/**
 * Double progression from last session's working sets: once every set at the top weight reaches
 * the top of the rep goal, add the smallest weight step and drop back to the bottom of the goal;
 * until then, keep the weight and add a rep. Without a routine target, the goal is the reps of
 * last session's first top set. A top set logged at RPE 9.5 or harder holds the weight.
 */
export function suggestNextTarget(input: OverloadInput): OverloadSuggestion | null {
  const { trackingType, unit } = input;
  if (trackingType !== 'weight_reps' && trackingType !== 'weighted_bodyweight') return null;

  const working = input.sets.filter(
    (set) => isWorkingSetType(set.previousType) && (set.previousWeightKg ?? 0) > 0 && (set.previousReps ?? 0) > 0,
  ) as Array<{ previousWeightKg: number; previousReps: number; previousRpe?: number }>;
  if (working.length === 0) return null;

  const topWeightKg = Math.max(...working.map((set) => set.previousWeightKg));
  const topSets = working.filter((set) => set.previousWeightKg === topWeightKg);
  const topReps = topSets.map((set) => set.previousReps);
  const lowestReps = Math.min(...topReps);

  const parsedGoal = parseRepGoal(input.targetReps);
  if (parsedGoal === null) return null;
  const goal = parsedGoal ?? { min: topReps[0], max: topReps[0] };

  const atWeight = formatWeight(topWeightKg, unit);
  const repList = topReps.join(', ');

  if (lowestReps >= goal.max) {
    const hardest = Math.max(...topSets.map((set) => set.previousRpe ?? 0));
    if (hardest >= HARD_RPE) {
      return {
        kind: 'repeat',
        weightKg: topWeightKg,
        reps: goal.max,
        reason: `Last time hit ${goal.max} reps at ${atWeight} but at RPE ${hardest}, so repeat it before adding weight.`,
      };
    }
    const nextDisplay = Math.round((kgToDisplay(topWeightKg, unit) + getOverloadIncrement(input.equipment, unit)) * 100) / 100;
    return {
      kind: 'add_weight',
      weightKg: displayToKg(nextDisplay, unit),
      reps: goal.min,
      reason: `Every set hit ${goal.max} reps at ${atWeight} last time, so add weight.`,
    };
  }

  if (goal.min === goal.max || lowestReps < goal.min) {
    return {
      kind: 'repeat',
      weightKg: topWeightKg,
      reps: goal.min === goal.max ? goal.max : goal.min,
      reason: `Last time: ${repList} reps at ${atWeight}. Add weight once every set hits ${goal.max}.`,
    };
  }

  return {
    kind: 'add_reps',
    weightKg: topWeightKg,
    reps: Math.min(goal.max, lowestReps + 1),
    reason: `Last time: ${repList} reps at ${atWeight}. Add weight once every set hits ${goal.max}.`,
  };
}

/** Sets the suggestion fills: working sets still to do. Completed sets and warmups stay as they are. */
export function isOverloadFillTarget(set: Pick<WorkoutSet, 'isCompleted' | 'type'>): boolean {
  return !set.isCompleted && isWorkingSetType(set.type);
}
