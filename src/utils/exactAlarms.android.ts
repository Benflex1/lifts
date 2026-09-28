import { androidRestNotifications } from './restAlarmAndroid';

export type { ExactAlarmStatus } from './restNotificationsAndroid';

export const { getExactAlarmStatus, openExactAlarmSettings } = androidRestNotifications;
