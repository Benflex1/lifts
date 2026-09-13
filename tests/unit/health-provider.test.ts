import assert from "node:assert/strict";
import test from "node:test";

import { getPlatformHealthProvider } from "../../src/health/provider.native";

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
