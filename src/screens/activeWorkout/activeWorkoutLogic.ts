import { ActiveExercise, Gym, Workout, WorkoutSet } from '../../types';
import { WeightUnit, displayToKg, kgToDisplay } from '../../utils/units';
import { getDefaultIncrement, roundToIncrement } from '../../workout/warmup';
import { getTrackingType, setVolumeKg } from '../../workout/tracking';
import { PRHistoryIndex } from '../../workout/pr';

/**
 * ARCH-01: pure helpers backing the active-workout screen. Kept free of React so the derived
 * values and suggestions they produce are directly testable.
 */

export interface LiveSetStats {
  liveVolume: number;
  completedSetsCount: number;
  totalSetsCount: number;
}

export function computeLiveSetStats(exercises: ActiveExercise[]): LiveSetStats {
  let volume = 0;
  let completed = 0;
  let total = 0;

  for (const ex of exercises) {
    const trackingType = getTrackingType(ex);
    for (const s of ex.sets) {
      total++;
      if (s.isCompleted) {
        volume += setVolumeKg(s, trackingType);
        completed++;
      }
    }
  }

  return { liveVolume: volume, completedSetsCount: completed, totalSetsCount: total };
}

/** All completed set IDs in the workout, used to detect freshly completed sets. */
export function getCompletedSetIds(exercises: ActiveExercise[]): Set<string> {
  const completedIds = new Set<string>();
  for (const ex of exercises) {
    for (const s of ex.sets) {
      if (s.isCompleted) {
        completedIds.add(s.id);
      }
    }
  }
  return completedIds;
}

/**
 * Every prior workout exactly once, across the per-exercise history caches, excluding the
 * active workout itself (anything starting at or after its start time).
 */
export function collectPriorWorkouts(
  exerciseWorkouts: Record<string, Workout[]>,
  activeStartTime: string | undefined,
): Workout[] {
  const seen = new Set<string>();
  const result: Workout[] = [];
  for (const list of Object.values(exerciseWorkouts)) {
    for (const workout of list) {
      if (seen.has(workout.id)) continue;
      if (activeStartTime && workout.startTime >= activeStartTime) continue;
      seen.add(workout.id);
      result.push(workout);
    }
  }
  return result;
}

/** Prior records indexed once per loaded history. */
export function buildPriorRecordIndex(
  exerciseWorkouts: Record<string, Workout[]>,
  activeStartTime: string | undefined,
): PRHistoryIndex {
  const index = new PRHistoryIndex();
  const loadedExerciseIds = new Set(Object.keys(exerciseWorkouts));
  for (const workout of collectPriorWorkouts(exerciseWorkouts, activeStartTime)) {
    index.add(workout, loadedExerciseIds);
  }
  return index;
}

/** The active gym when selected, else the workout's gym from the loaded list. */
export function resolveDisplayedActiveGym(
  activeGym: Gym | null,
  gyms: Gym[],
  workoutGymId: string | undefined,
): Gym | null {
  return activeGym || gyms.find((gym) => gym.id === workoutGymId) || null;
}

/** Nearest preceding set that is a weighted working set (skips warmups and unweighted sets). */
export function findPreviousWorkingSet(
  sets: WorkoutSet[],
  setIndex: number,
): WorkoutSet | undefined {
  return sets
    .slice(0, setIndex)
    .reverse()
    .find((s) => s.type !== 'warmup' && s.weightKg > 0);
}

/** The 20/25/30 % drop-set weight suggestions derived from a working set. */
export function computeDropSetSuggestions(
  previousWorkingSet: WorkoutSet,
  unit: WeightUnit,
): { pct: number; kg: number }[] {
  const inc = getDefaultIncrement(unit);
  const prevDisplay = kgToDisplay(previousWorkingSet.weightKg, unit);
  return [
    { pct: 20, kg: displayToKg(roundToIncrement(prevDisplay * 0.8, inc), unit) },
    { pct: 25, kg: displayToKg(roundToIncrement(prevDisplay * 0.75, inc), unit) },
    { pct: 30, kg: displayToKg(roundToIncrement(prevDisplay * 0.7, inc), unit) },
  ];
}

export function isMoveUpDisabled(index: number): boolean {
  return index <= 0;
}

export function isMoveDownDisabled(index: number, exerciseCount: number): boolean {
  return index < 0 || index >= exerciseCount - 1;
}
