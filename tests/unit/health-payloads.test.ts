import assert from "node:assert/strict";
import test from "node:test";

import type { HealthWorkoutPayload } from "../../src/health/contract";
import { toHealthConnectExerciseSession } from "../../src/health/health-connect-payload";
import { toHealthKitWorkoutRequest } from "../../src/health/healthkit-payload";

const payload: HealthWorkoutPayload = {
  workoutId: "workout-1",
  title: "Upper Body",
  startTime: "2026-09-13T08:00:00.000Z",
  endTime: "2026-09-13T09:15:00.000Z",
  durationSeconds: 4500,
};

test("maps a workout to the minimal HealthKit strength request", () => {
  assert.deepEqual(toHealthKitWorkoutRequest(payload), {
    startDate: new Date("2026-09-13T08:00:00.000Z"),
    endDate: new Date("2026-09-13T09:15:00.000Z"),
    workoutActivityType: "HKWorkoutActivityTypeStrengthTraining",
  });
});

test("maps a workout to the minimal Health Connect strength session", () => {
  assert.deepEqual(toHealthConnectExerciseSession(payload, 70), {
    recordType: "ExerciseSession",
    exerciseType: 70,
    title: "Upper Body",
    startTime: "2026-09-13T08:00:00.000Z",
    endTime: "2026-09-13T09:15:00.000Z",
  });
});

test("provider payloads exclude Lifts and health detail beyond the workout session", () => {
  const healthKitRequest = toHealthKitWorkoutRequest(payload);
  const healthConnectRecord = toHealthConnectExerciseSession(payload, 70);

  assert.deepEqual(Object.keys(healthKitRequest).sort(), [
    "endDate",
    "startDate",
    "workoutActivityType",
  ]);
  assert.deepEqual(Object.keys(healthConnectRecord).sort(), [
    "endTime",
    "exerciseType",
    "recordType",
    "startTime",
    "title",
  ]);
  assert.equal("workoutId" in healthKitRequest, false);
  assert.equal("workoutId" in healthConnectRecord, false);
  assert.equal("durationSeconds" in healthConnectRecord, false);
});
