import { Workout, WorkoutHistorySummary } from '../types';

export function updateWorkoutHistorySummary(
  history: readonly WorkoutHistorySummary[],
  workout: Workout,
): WorkoutHistorySummary[] {
  const totalSets = workout.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => set.isCompleted).length,
    0,
  );

  return history.map((summary) => summary.id === workout.id
    ? {
        ...summary,
        name: workout.name,
        gymId: workout.gymId,
        startTime: workout.startTime,
        endTime: workout.endTime,
        durationSeconds: workout.durationSeconds,
        totalVolumeKg: workout.totalVolumeKg,
        totalSets,
        notes: workout.notes,
      }
    : summary);
}
