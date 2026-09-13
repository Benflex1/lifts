import type { HealthWorkoutPayload } from './contract';

export function fingerprintHealthPayload(payload: HealthWorkoutPayload): string {
  return JSON.stringify([
    payload.workoutId,
    payload.title,
    payload.startTime,
    payload.endTime,
    payload.durationSeconds,
  ]);
}
