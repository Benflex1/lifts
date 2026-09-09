export function createScopedId(prefix: string): string {
  const runtimeCrypto = (globalThis as any).crypto;
  if (typeof runtimeCrypto?.randomUUID === 'function') {
    return `${prefix}-${runtimeCrypto.randomUUID()}`;
  }

  // Expo's native crypto module is loaded only on runtimes without Web Crypto,
  // keeping this utility usable by the Node-based store tests and web builds.
  try {
    const expoCrypto = require('expo-crypto') as { randomUUID: () => string };
    return `${prefix}-${expoCrypto.randomUUID()}`;
  } catch (_) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}
