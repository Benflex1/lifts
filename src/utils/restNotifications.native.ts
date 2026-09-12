import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let channelCreated = false;
let handlerConfigured = false;
let lastScheduledId: string | null = null;

export async function initRestNotifications(): Promise<void> {
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

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
  } catch (e) {
    console.warn('Failed to request notification permissions:', e);
  }
}

export async function scheduleRestNotification(
  endsAtMs: number,
  exerciseName?: string
): Promise<string | null> {
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
  try {
    if (lastScheduledId) {
      await Notifications.cancelScheduledNotificationAsync(lastScheduledId);
      lastScheduledId = null;
    }
  } catch (e) {
    console.warn('Failed to cancel rest notification:', e);
  }
}
