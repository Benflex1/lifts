export interface RestAlarmNativeModule {
  areNotificationsEnabled(): boolean;
  requestNotificationPermission(): Promise<boolean>;
  canScheduleExactAlarms(): boolean;
  /** Opens the system "Alarms & reminders" page for Lifts; false below Android 12. */
  openExactAlarmSettings(): boolean;
  /**
   * Arms the end-of-rest alert and shows a system-ticked countdown until then.
   * The countdown updates itself without the app running. Resolves true when scheduled
   * exactly, false when Android may defer delivery.
   */
  schedule(
    triggerAtMs: number,
    title: string,
    body: string,
    countdownTitle: string,
    countdownBody: string
  ): Promise<boolean>;
  cancel(): Promise<void>;
}
