export interface RestAlarmNativeModule {
  areNotificationsEnabled(): boolean;
  requestNotificationPermission(): Promise<boolean>;
  canScheduleExactAlarms(): boolean;
  /** Opens the system "Alarms & reminders" page for Lifts; false below Android 12. */
  openExactAlarmSettings(): boolean;
  /** Resolves true when scheduled exactly, false when Android may defer delivery. */
  schedule(triggerAtMs: number, title: string, body: string): Promise<boolean>;
  cancel(): Promise<void>;
}
