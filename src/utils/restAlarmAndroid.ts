import RestAlarm from '../../modules/rest-alarm';
import { createAndroidRestNotifications } from './restNotificationsAndroid';

// Single instance shared by restNotifications.android.ts and exactAlarms.android.ts.
export const androidRestNotifications = createAndroidRestNotifications(RestAlarm);
