// Node/fallback entry point. Metro resolves restNotifications.android.ts on
// Android, restNotifications.ios.ts on iOS, and restNotifications.web.ts on web.
// The base file keeps the detection helper (a test seam) and no-op scheduling so
// Node tests and unsupported platforms never touch native modules. See
// docs/platform-dispatch.md.

function isNodeEnvironment(): boolean {
  return (
    typeof (globalThis as any).__DEV__ === 'undefined' &&
    typeof process !== 'undefined' &&
    Boolean(process.versions?.node)
  );
}

export function isExpoGoAndroid(): boolean {
  if (isNodeEnvironment()) {
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native probe keeps Node-based tests free of the RN module
    const { Platform } = require('react-native');
    if (Platform?.OS !== 'android') {
      return false;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dependency; absent outside Expo Go
      const expo = require('expo');
      if (typeof expo?.isRunningInExpoGo === 'function' && expo.isRunningInExpoGo()) {
        return true;
      }
    } catch {
      // Intentional: detection is best-effort; a failure means "not Expo Go".
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dependency; absent in bare runtimes
      const mod = require('expo-constants');
      const Constants = mod?.default ?? mod;
      if (Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient') {
        return true;
      }
    } catch {
      // Intentional: detection is best-effort; a failure means "not Expo Go".
    }
    return false;
  } catch {
    return false;
  }
}

export async function initRestNotifications(): Promise<void> {
  // No-op on Node and unsupported platforms.
}

export async function scheduleRestNotification(
  _endsAtMs: number,
  _exerciseName?: string,
): Promise<string | null> {
  return null;
}

export async function cancelRestNotification(): Promise<void> {
  // No-op on Node and unsupported platforms.
}

// Only Android has a native rest cue (see restNotifications.android.ts); elsewhere the app buzzes.
export function isRestCueNative(): boolean {
  return false;
}
