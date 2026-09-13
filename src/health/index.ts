import type { HealthProvider } from "./contract";

export async function getPlatformHealthProvider(): Promise<HealthProvider | null> {
  if (typeof document !== "undefined") {
    const { getPlatformHealthProvider: getWebProvider } =
      await import("./provider.web");
    return getWebProvider();
  }

  const { getPlatformHealthProvider: getNativeProvider } =
    await import("./provider.native");
  return getNativeProvider();
}
