import type { RestAlarmNativeModule } from '../../modules/rest-alarm/RestAlarm.types';

export type ExactAlarmStatus = 'granted' | 'denied' | 'unsupported';

export function createAndroidRestNotifications(
  native: RestAlarmNativeModule | null,
  now: () => number = Date.now
) {
  // Notification permission is not needed: the rest cue is a vibration, not a notification.
  async function initRestNotifications(): Promise<void> {}

  async function cancelRestNotification(): Promise<void> {
    if (!native) return;
    try {
      await native.cancel();
    } catch (e) {
      console.warn('Failed to cancel rest cue:', e);
    }
  }

  // Arms the native vibration cue. The exercise name is unused: nothing is shown, only felt.
  async function scheduleRestNotification(endsAtMs: number, _exerciseName?: string): Promise<string | null> {
    if (!native) return null;
    if (endsAtMs <= now()) return null;
    try {
      await native.schedule(endsAtMs);
      return 'rest-alarm';
    } catch (e) {
      console.warn('Failed to schedule rest cue:', e);
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
