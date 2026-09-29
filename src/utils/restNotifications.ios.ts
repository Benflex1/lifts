// iOS rest-timer notifications via expo-notifications. Android uses the local
// rest-alarm module (restNotifications.android.ts) so its build carries no Firebase.
import { restNotificationContent } from './restNotificationContent';

type NotificationsModule = typeof import('expo-notifications');

let handlerConfigured = false;
let permissionRequested = false;
let lastScheduledId: string | null = null;
let notificationsModule: NotificationsModule | null = null;
let notificationsModuleLoaded = false;

function getNotificationsModule(): NotificationsModule | null {
  if (notificationsModuleLoaded) {
    return notificationsModule;
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

  if (!permissionRequested) {
    permissionRequested = true;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      if (existingStatus !== 'granted') {
        await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
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
    const { title, body } = restNotificationContent(exerciseName);

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
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
