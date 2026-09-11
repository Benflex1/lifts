export const PAUSED_WORKOUT_DIALOG_TITLE = 'Paused Workout Found';
export const PAUSED_WORKOUT_DIALOG_MESSAGE =
  'You have a paused workout saved. Would you like to continue it?';
export const PAUSED_WORKOUT_CONFIRM_LABEL = 'Continue Saved';
export const PAUSED_WORKOUT_MODAL_TITLE = 'Paused Workouts';

export function getPausedWorkoutCountLabel(count: number): string {
  return count === 1 ? 'Paused Workout' : `Paused Workouts (${count})`;
}

export function getPausedWorkoutModalSubtitle(count: number): string {
  return `You have ${count} saved paused workout${count === 1 ? '' : 's'}.`;
}
