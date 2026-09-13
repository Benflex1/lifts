import {
  ExerciseType,
  SdkAvailabilityStatus,
  getSdkStatus,
  initialize,
  insertRecords,
  requestPermission,
} from "react-native-health-connect";

import type { HealthProvider, HealthWorkoutPayload } from "./contract";
import { toHealthConnectExerciseSession } from "./health-connect-payload";

const WRITE_EXERCISE_SESSION_PERMISSION = {
  accessType: "write" as const,
  recordType: "ExerciseSession" as const,
};

async function getAvailabilityStatus(): Promise<number | null> {
  try {
    return await getSdkStatus();
  } catch {
    return null;
  }
}

export function createHealthConnectProvider(): HealthProvider {
  return {
    id: "health-connect",

    async isAvailable(): Promise<boolean> {
      return (
        (await getAvailabilityStatus()) === SdkAvailabilityStatus.SDK_AVAILABLE
      );
    },

    async requestWriteAuthorization(): Promise<
      "granted" | "denied" | "unavailable"
    > {
      const status = await getAvailabilityStatus();
      if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
        return "unavailable";
      }

      try {
        if (!(await initialize())) {
          return "unavailable";
        }

        const permissions = await requestPermission([
          WRITE_EXERCISE_SESSION_PERMISSION,
        ]);

        return permissions.some(
          (permission) =>
            permission.accessType === "write" &&
            permission.recordType === "ExerciseSession",
        )
          ? "granted"
          : "denied";
      } catch {
        return "denied";
      }
    },

    async writeStrengthWorkout(payload: HealthWorkoutPayload): Promise<void> {
      const status = await getAvailabilityStatus();
      if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
        throw new Error("Health Connect is unavailable");
      }

      if (!(await initialize())) {
        throw new Error("Health Connect could not be initialized");
      }

      await insertRecords([
        toHealthConnectExerciseSession(payload, ExerciseType.STRENGTH_TRAINING),
      ]);
    },
  };
}
