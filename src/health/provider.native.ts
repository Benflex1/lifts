import type { HealthProvider } from "./contract";

function isNodeEnvironment(): boolean {
  return (
    typeof (globalThis as any).__DEV__ === "undefined" &&
    typeof process !== "undefined" &&
    Boolean(process.versions?.node)
  );
}

export async function getPlatformHealthProvider(): Promise<HealthProvider | null> {
  if (isNodeEnvironment()) {
    return null;
  }

  try {
    const { Platform } = await import("react-native");

    if (Platform.OS === "ios") {
      const { createHealthKitProvider } = await import("./healthkit");
      return createHealthKitProvider();
    }

    if (Platform.OS === "android") {
      const { createHealthConnectProvider } = await import("./health-connect");
      return createHealthConnectProvider();
    }
  } catch {
    return null;
  }

  return null;
}
