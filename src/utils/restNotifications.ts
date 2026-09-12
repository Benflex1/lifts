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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Platform } = require('react-native');
    if (Platform?.OS !== 'android') {
      return false;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const expo = require('expo');
      if (typeof expo?.isRunningInExpoGo === 'function' && expo.isRunningInExpoGo()) {
        return true;
      }
    } catch {}
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('expo-constants');
      const Constants = mod?.default ?? mod;
      if (
        Constants?.appOwnership === 'expo' ||
        Constants?.executionEnvironment === 'storeClient'
      ) {
        return true;
      }
    } catch {}
    return false;
  } catch {
    return false;
  }
}

export async function initRestNotifications(): Promise<void> {
  if (typeof document !== 'undefined') {
    const { initRestNotifications } = await import('./restNotifications.web');
    return initRestNotifications();
  }
  if (isNodeEnvironment() || isExpoGoAndroid()) {
    return;
  }
  const { initRestNotifications } = await import('./restNotifications.native');
  return initRestNotifications();
}

export async function scheduleRestNotification(
  endsAtMs: number,
  exerciseName?: string
): Promise<string | null> {
  if (typeof document !== 'undefined') {
    const { scheduleRestNotification } = await import('./restNotifications.web');
    return scheduleRestNotification(endsAtMs, exerciseName);
  }
  if (isNodeEnvironment() || isExpoGoAndroid()) {
    return null;
  }
  const { scheduleRestNotification } = await import('./restNotifications.native');
  return scheduleRestNotification(endsAtMs, exerciseName);
}

export async function cancelRestNotification(): Promise<void> {
  if (typeof document !== 'undefined') {
    const { cancelRestNotification } = await import('./restNotifications.web');
    return cancelRestNotification();
  }
  if (isNodeEnvironment() || isExpoGoAndroid()) {
    return;
  }
  const { cancelRestNotification } = await import('./restNotifications.native');
  return cancelRestNotification();
}

