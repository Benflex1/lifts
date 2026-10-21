import { Workout } from '../types';
import { reportError } from '../utils/errorReporting';

export type PersistCompletedWorkout = (workout: Workout) => Promise<void>;

/**
 * Single write path for edits to a completed workout (gym reassignment, duration
 * corrections). Owns error reporting so a failed edit is never presented as saved:
 * callers only update UI state after this resolves.
 */
export async function saveCompletedWorkoutEdit(
  workout: Workout,
  save: PersistCompletedWorkout,
): Promise<Workout> {
  try {
    await save(workout);
    return workout;
  } catch (error) {
    reportError(error, { scope: 'completion.update', workoutId: workout.id });
    throw error;
  }
}
