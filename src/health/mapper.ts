import type { Workout } from '../types';
import type { HealthWorkoutPayload } from './contract';

export function toHealthWorkoutPayload(workout: Workout): HealthWorkoutPayload {
  const start = new Date(workout.startTime);
  const end = new Date(workout.endTime ?? '');

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new Error('Workout must have valid ISO timestamps');
  }

  if (end.getTime() <= start.getTime()) {
    throw new Error('endTime must be later than startTime');
  }

  return {
    workoutId: workout.id,
    title: workout.name,
    startTime: workout.startTime,
    endTime: workout.endTime as string,
    durationSeconds: Math.floor((end.getTime() - start.getTime()) / 1000),
  };
}
