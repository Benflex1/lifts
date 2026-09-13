import type { HealthWorkoutPayload } from "./contract";

export interface HealthKitWorkoutRequest {
  startDate: Date;
  endDate: Date;
  workoutActivityType: "HKWorkoutActivityTypeStrengthTraining";
}

export function toHealthKitWorkoutRequest(
  payload: HealthWorkoutPayload,
): HealthKitWorkoutRequest {
  const startDate = new Date(payload.startTime);
  const endDate = new Date(payload.endTime);

  if (
    !Number.isFinite(startDate.getTime()) ||
    !Number.isFinite(endDate.getTime())
  ) {
    throw new Error("Health workout payload must have valid ISO timestamps");
  }

  return {
    startDate,
    endDate,
    workoutActivityType: "HKWorkoutActivityTypeStrengthTraining",
  };
}
