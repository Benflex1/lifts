import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { HealthProvider } from "../../src/health/contract";
import { getPlatformHealthProvider } from "../../src/health/provider.native";

const canMockModules = typeof mock.module === "function";

async function withNodeVersion<T>(
  nodeVersion: string | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process.versions, "node");
  Object.defineProperty(process.versions, "node", {
    ...descriptor,
    value: nodeVersion,
  });

  try {
    return await callback();
  } finally {
    if (descriptor) {
      Object.defineProperty(process.versions, "node", descriptor);
    }
  }
}

function stubProvider(id: HealthProvider["id"]): HealthProvider {
  return {
    id,
    isAvailable: async () => true,
    requestWriteAuthorization: async () => "granted",
    writeStrengthWorkout: async () => {},
  };
}

test("returns null in Node when __DEV__ is false without loading native modules", async () => {
  const globalWithDev = globalThis as typeof globalThis & { __DEV__?: boolean };
  const previousDev = globalWithDev.__DEV__;
  globalWithDev.__DEV__ = false;

  try {
    assert.equal(await getPlatformHealthProvider(), null);
  } finally {
    if (previousDev === undefined) {
      delete globalWithDev.__DEV__;
    } else {
      globalWithDev.__DEV__ = previousDev;
    }
  }
});

test("returns null in Node when __DEV__ is true without loading native modules", async () => {
  const globalWithDev = globalThis as typeof globalThis & { __DEV__?: boolean };
  const previousDev = globalWithDev.__DEV__;
  globalWithDev.__DEV__ = true;

  try {
    assert.equal(await getPlatformHealthProvider(), null);
  } finally {
    if (previousDev === undefined) {
      delete globalWithDev.__DEV__;
    } else {
      globalWithDev.__DEV__ = previousDev;
    }
  }
});

test(
  "dispatches to the HealthKit adapter on iOS",
  { skip: !canMockModules },
  async (t) => {
    const provider = stubProvider("healthkit");
    t.mock.module("react-native", {
      exports: { Platform: { OS: "ios" } },
    });
    t.mock.module(new URL("../../src/health/healthkit.ts", import.meta.url), {
      exports: { createHealthKitProvider: () => provider },
    });

    await withNodeVersion(undefined, async () => {
      assert.equal(await getPlatformHealthProvider(), provider);
    });
  },
);

test(
  "dispatches to the Health Connect adapter on Android",
  { skip: !canMockModules },
  async (t) => {
    const provider = stubProvider("health-connect");
    t.mock.module("react-native", {
      exports: { Platform: { OS: "android" } },
    });
    t.mock.module(
      new URL("../../src/health/health-connect.ts", import.meta.url),
      {
        exports: { createHealthConnectProvider: () => provider },
      },
    );

    await withNodeVersion(undefined, async () => {
      assert.equal(await getPlatformHealthProvider(), provider);
    });
  },
);

test(
  "returns null for unsupported native platforms",
  { skip: !canMockModules },
  async (t) => {
    t.mock.module("react-native", {
      exports: { Platform: { OS: "web" } },
    });
    t.mock.module(new URL("../../src/health/healthkit.ts", import.meta.url), {
      exports: {
        createHealthKitProvider: () => {
          throw new Error("unsupported platform loaded HealthKit");
        },
      },
    });
    t.mock.module(
      new URL("../../src/health/health-connect.ts", import.meta.url),
      {
        exports: {
          createHealthConnectProvider: () => {
            throw new Error("unsupported platform loaded Health Connect");
          },
        },
      },
    );

    await withNodeVersion(undefined, async () => {
      assert.equal(await getPlatformHealthProvider(), null);
    });
  },
);

test(
  "wires the Health Connect provider permission action to the installed adapter export",
  { skip: !canMockModules },
  async (t) => {
    let opened = 0;
    t.mock.module("react-native-health-connect", {
      exports: {
        ExerciseType: { STRENGTH_TRAINING: "StrengthTraining" },
        SdkAvailabilityStatus: { SDK_AVAILABLE: 3 },
        getSdkStatus: async () => 3,
        initialize: async () => true,
        insertRecords: async () => [],
        openHealthConnectSettings: () => {
          opened += 1;
        },
        requestPermission: async () => [],
      },
    });

    const { createHealthConnectProvider } =
      await import("../../src/health/health-connect");
    const provider = createHealthConnectProvider();

    assert.equal(typeof provider.openPermissionSettings, "function");
    provider.openPermissionSettings?.();
    assert.equal(opened, 1);
  },
);
