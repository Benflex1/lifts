export interface RestAlarmNativeModule {
  canScheduleExactAlarms(): boolean;
  /** Opens the system "Alarms & reminders" page for Lifts; false below Android 12. */
  openExactAlarmSettings(): boolean;
  /**
   * Arms the end-of-rest vibration cue: a pulse at 3, 2 and 1 seconds left and a harder buzz
   * when the rest ends. Plays from an alarm, so it works with the phone locked and posts no
   * notification. Resolves true when scheduled exactly, false when Android may defer it.
   */
  schedule(endsAtMs: number): Promise<boolean>;
  /** Disarms the cue and stops it if it is playing. */
  cancel(): Promise<void>;
}
