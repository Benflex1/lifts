package expo.modules.restalarm

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

// Schedules the single rest-timer alarm, shows the lock-screen countdown and posts the end alert
// using platform APIs only, so the app needs neither Firebase nor expo-notifications on Android.
object RestAlarm {
  // Same channel id expo-notifications used, so existing user channel settings carry over.
  const val CHANNEL_ID = "rest-timer"
  // Quiet channel for the countdown: visible on the lock screen, but no sound or vibration.
  const val COUNTDOWN_CHANNEL_ID = "rest-countdown"
  const val EXTRA_TITLE = "expo.modules.restalarm.TITLE"
  const val EXTRA_BODY = "expo.modules.restalarm.BODY"
  private const val ACTION_REST_FINISHED = "expo.modules.restalarm.REST_FINISHED"
  // Separate ids: the end alert is a fresh post that alerts, not an update of the silent countdown.
  private const val COUNTDOWN_ID = 7301
  private const val ALERT_ID = 7302
  private const val REQUEST_CODE = 7301
  private val VIBRATION_PATTERN = longArrayOf(0, 800, 400, 800, 400, 800)

  fun canScheduleExactAlarms(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return context.getSystemService(AlarmManager::class.java)?.canScheduleExactAlarms() ?: false
  }

  fun areNotificationsEnabled(context: Context): Boolean =
    context.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() ?: false

  /**
   * Arms the end alert and shows the countdown until then. The countdown is drawn by the system
   * from [triggerAtMillis], so it keeps ticking while the app is not running.
   * Returns true when the alarm was scheduled exactly, false when Android may defer it.
   */
  fun schedule(
    context: Context,
    triggerAtMillis: Long,
    title: String,
    body: String,
    countdownTitle: String,
    countdownBody: String
  ): Boolean {
    ensureChannels(context)
    val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return false
    val operation = alarmIntent(context, title, body)
    val exact = canScheduleExactAlarms(context) && setExact(alarmManager, triggerAtMillis, operation)
    if (!exact) {
      // Inexact fallback when exact alarms are denied, or revoked between the check and the call.
      alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, operation)
    }
    showCountdown(context, triggerAtMillis, countdownTitle, countdownBody)
    return exact
  }

  fun cancel(context: Context) {
    context.getSystemService(AlarmManager::class.java)?.cancel(alarmIntent(context))
    val manager = context.getSystemService(NotificationManager::class.java)
    manager?.cancel(COUNTDOWN_ID)
    manager?.cancel(ALERT_ID)
  }

  /** Replaces the countdown with the end-of-rest alert. Runs from the alarm receiver, without the app. */
  fun showRestFinished(context: Context, title: String, body: String) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.cancel(COUNTDOWN_ID)
    if (!manager.areNotificationsEnabled()) return
    ensureChannels(context)

    val builder = Notification.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.rest_alarm_notification_icon)
      .setContentTitle(title)
      .setContentText(body)
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setAutoCancel(true)
    launchIntent(context)?.let { builder.setContentIntent(it) }

    try {
      manager.notify(ALERT_ID, builder.build())
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS was revoked after the enabled check.
    }
  }

  private fun setExact(alarmManager: AlarmManager, triggerAtMillis: Long, operation: PendingIntent): Boolean =
    try {
      alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, operation)
      true
    } catch (_: SecurityException) {
      false
    }

  // A chronometer with a countdown: the system ticks it down to [endsAtMillis] by itself. Posted once
  // when the rest is armed and replaced by the end alert, so the app never has to post per second.
  private fun showCountdown(context: Context, endsAtMillis: Long, title: String, body: String) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (!manager.areNotificationsEnabled()) return

    val builder = Notification.Builder(context, COUNTDOWN_CHANNEL_ID)
      .setSmallIcon(R.drawable.rest_alarm_notification_icon)
      .setContentTitle(title)
      .setContentText(body)
      .setCategory(Notification.CATEGORY_STOPWATCH)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(true)
      .setWhen(endsAtMillis)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
    launchIntent(context)?.let { builder.setContentIntent(it) }

    try {
      manager.notify(COUNTDOWN_ID, builder.build())
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS was revoked after the enabled check.
    }
  }

  private fun ensureChannels(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val alert = NotificationChannel(CHANNEL_ID, "Rest Timer", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Alerts you when your rest between sets is over."
      enableVibration(true)
      vibrationPattern = VIBRATION_PATTERN
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setShowBadge(false)
      setBypassDnd(true)
    }
    // Default importance keeps the countdown on the lock screen. Without a sound or vibration it does not alert.
    val countdown = NotificationChannel(COUNTDOWN_CHANNEL_ID, "Rest Countdown", NotificationManager.IMPORTANCE_DEFAULT).apply {
      description = "Shows the rest countdown while Lifts is in the background."
      enableVibration(false)
      setSound(null, null)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setShowBadge(false)
    }
    manager.createNotificationChannels(listOf(alert, countdown))
  }

  private fun launchIntent(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    return PendingIntent.getActivity(context, REQUEST_CODE, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  // Extras are not part of PendingIntent identity, so cancel() matches the scheduled alarm.
  private fun alarmIntent(context: Context, title: String? = null, body: String? = null): PendingIntent {
    val intent = Intent(context, RestAlarmReceiver::class.java).setAction(ACTION_REST_FINISHED)
    title?.let { intent.putExtra(EXTRA_TITLE, it) }
    body?.let { intent.putExtra(EXTRA_BODY, it) }
    return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}
