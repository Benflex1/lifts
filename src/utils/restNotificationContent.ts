export function restNotificationContent(exerciseName?: string): { title: string; body: string } {
  return {
    title: 'Rest Finished!',
    body: exerciseName ? `Time for your next set of ${exerciseName}.` : 'Time for your next set.',
  };
}
