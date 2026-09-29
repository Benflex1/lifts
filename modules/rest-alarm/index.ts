import { requireOptionalNativeModule } from 'expo';
import type { RestAlarmNativeModule } from './RestAlarm.types';

export type { RestAlarmNativeModule } from './RestAlarm.types';

// Null in Expo Go and on platforms without the native module (iOS, web).
export default requireOptionalNativeModule<RestAlarmNativeModule>('RestAlarm');
