import {
  AuthorizationStatus,
  WorkoutActivityType,
  authorizationStatusFor,
  isHealthDataAvailableAsync,
  requestAuthorization,
  saveWorkoutSample,
} from "@kingstinct/react-native-healthkit";

import type { HealthProvider, HealthWorkoutPayload } from "./contract";
import { toHealthKitWorkoutRequest } from "./healthkit-payload";

const HEALTHKIT_WORKOUT_TYPE = "HKWorkoutTypeIdentifier" as const;

export function createHealthKitProvider(): HealthProvider {
  return {
    id: "healthkit",

    async isAvailable(): Promise<boolean> {
      try {
        return await isHealthDataAvailableAsync();
      } catch {
        return false;
      }
    },

    async requestWriteAuthorization(): Promise<
      "granted" | "denied" | "unavailable"
    > {
      let available: boolean;
      try {
        available = await isHealthDataAvailableAsync();
      } catch {
        return "unavailable";
      }

      if (!available) {
        return "unavailable";
      }

      try {
        await requestAuthorization({
          // @kingstinct/react-native-healthkit names HealthKit's write list
          // `toShare`; only the write list is supplied.
          toShare: [HEALTHKIT_WORKOUT_TYPE],
        });

        return authorizationStatusFor(HEALTHKIT_WORKOUT_TYPE) ===
          AuthorizationStatus.sharingAuthorized
          ? "granted"
          : "denied";
      } catch {
        return "denied";
      }
    },

    async writeStrengthWorkout(payload: HealthWorkoutPayload): Promise<void> {
      const request = toHealthKitWorkoutRequest(payload);

      if (!(await isHealthDataAvailableAsync())) {
        throw new Error("HealthKit is unavailable");
      }

      // The installed HealthKit package represents this Apple type with its
      // current traditionalStrengthTraining enum member.
      await saveWorkoutSample(
        WorkoutActivityType.traditionalStrengthTraining,
        [],
        request.startDate,
        request.endDate,
      );
    },
  };
}
