import type { RestAlarmNativeModule } from '../../modules/rest-alarm/RestAlarm.types';
import { restCountdownContent, restNotificationContent } from './restNotificationContent';

export type ExactAlarmStatus = 'granted' | 'denied' | 'unsupported';

// Matches the other platforms: alarms due within a second are left to the in-app timer.
const MIN_SCHEDULE_LEAD_MS = 1000;

export function createAndroidRestNotifications(
  native: RestAlarmNativeModule | null,
  now: () => number = Date.now
) {
  let permissionRequested = false;

  async function initRestNotifications(): Promise<void> {
    if (!native || permissionRequested) return;
    permissionRequested = true;
    try {
      if (!native.areNotificationsEnabled()) {
        await native.requestNotificationPermission();
      }
    } catch (e) {
      console.warn('Failed to request notification permission:', e);
    }
  }

  async function cancelRestNotification(): Promise<void> {
    if (!native) return;
    try {
      await native.cancel();
    } catch (e) {
      console.warn('Failed to cancel rest notification:', e);
    }
  }

  async function scheduleRestNotification(endsAtMs: number, exerciseName?: string): Promise<string | null> {
    if (!native) return null;

    await initRestNotifications();
    await cancelRestNotification();

    if (endsAtMs - now() <= MIN_SCHEDULE_LEAD_MS) return null;

    const { title, body } = restNotificationContent(exerciseName);
    const countdown = restCountdownContent(exerciseName);
    try {
      await native.schedule(endsAtMs, title, body, countdown.title, countdown.body);
      return 'rest-alarm';
    } catch (e) {
      console.warn('Failed to schedule rest notification:', e);
      return null;
    }
  }

  function getExactAlarmStatus(): ExactAlarmStatus {
    if (!native) return 'unsupported';
    try {
      return native.canScheduleExactAlarms() ? 'granted' : 'denied';
    } catch {
      return 'unsupported';
    }
  }

  function openExactAlarmSettings(): boolean {
    if (!native) return false;
    try {
      return native.openExactAlarmSettings();
    } catch (e) {
      console.warn('Failed to open exact alarm settings:', e);
      return false;
    }
  }

  return {
    initRestNotifications,
    scheduleRestNotification,
    cancelRestNotification,
    getExactAlarmStatus,
    openExactAlarmSettings,
  };
}
