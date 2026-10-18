// Android uses the local rest-alarm module instead of expo-notifications, which is
// excluded from Android autolinking because it bundles Firebase Messaging.
import RestAlarm from '../../modules/rest-alarm';
import { androidRestNotifications } from './restAlarmAndroid';

export const { initRestNotifications, scheduleRestNotification, cancelRestNotification } =
  androidRestNotifications;

// The native module plays the 3-2-1 vibration cue itself, in and out of the app. Null in Expo Go,
// where the in-app haptics take over.
export function isRestCueNative(): boolean {
  return RestAlarm !== null;
}
