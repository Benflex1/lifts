import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let channelCreated = false;
let handlerConfigured = false;
let permissionRequested = false;
let lastScheduledId: string | null = null;
let notificationsModule: NotificationsModule | null = null;
let notificationsModuleLoaded = false;
let didLogExpoGoWarning = false;

export function isExpoGoAndroid(): boolean {
  try {
    if (Platform.OS !== 'android') {
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

function getNotificationsModule(): NotificationsModule | null {
  if (notificationsModuleLoaded) {
    return notificationsModule;
  }

  if (isExpoGoAndroid()) {
    if (!didLogExpoGoWarning && (globalThis as any).__DEV__) {
      didLogExpoGoWarning = true;
      console.info(
        '[restNotifications] Expo Go on Android does not support expo-notifications in SDK 53+. Local in-app rest timer and haptics remain active; background system notifications are bypassed. Use a development build for background notifications.'
      );
    }
    notificationsModuleLoaded = true;
    notificationsModule = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    notificationsModule = require('expo-notifications');
  } catch (error) {
    if ((globalThis as any).__DEV__) {
      console.warn('[restNotifications] Failed to load expo-notifications module:', error);
    }
    notificationsModule = null;
  }

  notificationsModuleLoaded = true;
  return notificationsModule;
}

export async function initRestNotifications(): Promise<void> {
  const Notifications = getNotificationsModule();
  if (!Notifications) {
    return;
  }

  if (!handlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerConfigured = true;
  }

  if (Platform.OS === 'android' && !channelCreated) {
    try {
      await Notifications.setNotificationChannelAsync('rest-timer', {
        name: 'Rest Timer',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 500, 250, 500],
        sound: 'default',
        enableVibrate: true,
      });
      channelCreated = true;
    } catch (e) {
      console.warn('Failed to set Android notification channel for rest timer:', e);
    }
  }

  if (!permissionRequested) {
    permissionRequested = true;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      if (existingStatus !== 'granted') {
        await Notifications.requestPermissionsAsync();
      }
    } catch (e) {
      console.warn('Failed to request notification permissions:', e);
    }
  }
}

export async function scheduleRestNotification(
  endsAtMs: number,
  exerciseName?: string
): Promise<string | null> {
  const Notifications = getNotificationsModule();
  if (!Notifications) {
    return null;
  }

  await initRestNotifications();
  await cancelRestNotification();

  const now = Date.now();
  const diffMs = endsAtMs - now;
  if (diffMs <= 1000) {
    return null;
  }

  try {
    const title = 'Rest Finished!';
    const body = exerciseName
      ? `Time for your next set of ${exerciseName}.`
      : 'Time for your next set.';

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: [0, 500, 250, 500],
        ...(Platform.OS === 'android' ? { channelId: 'rest-timer' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(endsAtMs),
      },
    });

    lastScheduledId = id;
    return id;
  } catch (e) {
    console.warn('Failed to schedule rest notification:', e);
    return null;
  }
}

export async function cancelRestNotification(): Promise<void> {
  const Notifications = getNotificationsModule();
  if (!Notifications) {
    lastScheduledId = null;
    return;
  }

  try {
    if (lastScheduledId) {
      await Notifications.cancelScheduledNotificationAsync(lastScheduledId).catch(() => {});
      lastScheduledId = null;
    }
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    await Notifications.dismissAllNotificationsAsync().catch(() => {});
  } catch (e) {
    console.warn('Failed to cancel rest notification:', e);
  }
}

