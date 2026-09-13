import type { HealthWorkoutPayload } from "./contract";

export interface HealthConnectExerciseSession {
  recordType: "ExerciseSession";
  exerciseType: number;
  title: string;
  startTime: string;
  endTime: string;
}

export function toHealthConnectExerciseSession(
  payload: HealthWorkoutPayload,
  strengthExerciseType: number,
): HealthConnectExerciseSession {
  return {
    recordType: "ExerciseSession",
    exerciseType: strengthExerciseType,
    title: payload.title,
    startTime: payload.startTime,
    endTime: payload.endTime,
  };
}
