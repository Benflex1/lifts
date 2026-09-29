// Android uses the local rest-alarm module instead of expo-notifications, which is
// excluded from Android autolinking because it bundles Firebase Messaging.
import { androidRestNotifications } from './restAlarmAndroid';

export const { initRestNotifications, scheduleRestNotification, cancelRestNotification } =
  androidRestNotifications;
