import type { ExactAlarmStatus } from './restNotificationsAndroid';

export type { ExactAlarmStatus } from './restNotificationsAndroid';

// Exact-alarm permission only exists on Android (see exactAlarms.android.ts).
export function getExactAlarmStatus(): ExactAlarmStatus {
  return 'unsupported';
}

export function openExactAlarmSettings(): boolean {
  return false;
}
