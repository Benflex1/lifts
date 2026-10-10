export function restNotificationContent(exerciseName?: string): { title: string; body: string } {
  return {
    title: 'Rest Finished!',
    body: exerciseName ? `Time for your next set of ${exerciseName}.` : 'Time for your next set.',
  };
}

// Shown on the lock screen while the rest counts down, before the end alert replaces it.
export function restCountdownContent(exerciseName?: string): { title: string; body: string } {
  return {
    title: 'Resting',
    body: exerciseName ? `Up next: ${exerciseName}` : 'Up next: your next set',
  };
}
