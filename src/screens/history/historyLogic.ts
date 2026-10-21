import { ActiveExercise, Gym, Workout, WorkoutHistorySummary, WorkoutSet } from '../../types';
import { SetPRResult, formatPRDescription } from '../../workout/pr';
import { resolveHistoricalTargetReps } from '../../workout/sets';
import { withPreviousTracked } from '../../workout/tracking';
import { WeightUnit } from '../../utils/units';

/**
 * ARCH-12: pure helpers backing the history screen. Kept free of React so the
 * derived values, repeat drafts, and notification payloads are directly testable.
 */

/** Short weekday/date label for a workout start time, falling back to the raw value. */
export function formatHistoryDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    // Intentional: an unparseable date falls back to the raw ISO string for display.
    return isoString;
  }
}

export function filterHistoryByGym(
  history: WorkoutHistorySummary[],
  selectedGymId: string | null,
): WorkoutHistorySummary[] {
  return selectedGymId ? history.filter(item => item.gymId === selectedGymId) : history;
}

export function computeHistoryTotals(history: WorkoutHistorySummary[]): {
  totalWorkouts: number;
  totalVolumeKg: number;
} {
  return {
    totalWorkouts: history.length,
    totalVolumeKg: history.reduce((sum, w) => sum + w.totalVolumeKg, 0),
  };
}

/**
 * Builds the repeat-workout draft from a history detail: fresh IDs everywhere,
 * previous-performance ghosts carried over from the source gym, and target reps
 * resolved from the historical entries.
 */
export function buildRepeatExercises(
  detail: Workout,
  sourceGym: Gym | null | undefined,
  randomUUID: () => string,
): ActiveExercise[] {
  const newWorkoutPrefix = `wo-again-${randomUUID().slice(0, 8)}`;
  return detail.exercises.map((ex, exIdx) => {
    const activeExId = `ae-${newWorkoutPrefix}-${ex.exerciseId}-occ${exIdx}-${randomUUID().slice(0, 6)}`;
    return {
      id: activeExId,
      exerciseId: ex.exerciseId,
      exercise: ex.exercise,
      notes: '',
      targetReps: resolveHistoricalTargetReps(ex.targetReps, ex.sets[0]?.targetReps),
      restTimerSeconds: ex.restTimerSeconds ?? 90,
      supersetId: ex.supersetId,
      ...(ex.trackingType ? { trackingType: ex.trackingType } : {}),
      sets: ex.sets.map((s, sIdx) =>
        withPreviousTracked<WorkoutSet>(
          {
            id: `set-${activeExId}-${sIdx + 1}-${randomUUID().slice(0, 6)}`,
            setNumber: sIdx + 1,
            type: s.type || 'normal',
            weightKg: s.weightKg,
            reps: s.reps,
            targetReps: resolveHistoricalTargetReps(ex.targetReps, s.targetReps),
            rpe: s.rpe,
            isCompleted: false,
            previousWeightKg: s.weightKg,
            previousReps: s.reps,
            previousGymId: sourceGym?.id,
            previousGymName: sourceGym?.name,
            ...(s.durationSeconds !== undefined ? { durationSeconds: s.durationSeconds } : {}),
            ...(s.distanceM !== undefined ? { distanceM: s.distanceM } : {}),
          },
          s.isCompleted ? s : { ...s, type: undefined, rpe: undefined },
        ),
      ),
    };
  });
}

/** Title and body shown when a PR badge is tapped in the expanded history card. */
export function buildPRDetailsNotification(
  exerciseName: string,
  setNumber: number,
  setPR: SetPRResult,
  unit: WeightUnit,
): { title: string; message: string } {
  const desc = setPR.achievements.map(a => `• ${formatPRDescription(a, unit)}`).join('\n');
  const title =
    setPR.primary?.rank === 1
      ? setPR.primary?.isTie
        ? 'Tied Personal Record'
        : 'Personal Record'
      : setPR.primary?.rank === 2
        ? 'Silver Record'
        : 'Bronze Record';
  return {
    title,
    message: `${exerciseName} (Set #${setNumber})\n\n${desc}`,
  };
}
