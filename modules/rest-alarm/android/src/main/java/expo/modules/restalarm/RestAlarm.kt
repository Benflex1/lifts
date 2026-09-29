package expo.modules.restalarm

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

// Schedules the single rest-timer alarm and posts its notification using platform
// APIs only, so the app needs neither Firebase nor expo-notifications on Android.
object RestAlarm {
  // Same channel id expo-notifications used, so existing user channel settings carry over.
  const val CHANNEL_ID = "rest-timer"
  const val EXTRA_TITLE = "expo.modules.restalarm.TITLE"
  const val EXTRA_BODY = "expo.modules.restalarm.BODY"
  private const val ACTION_REST_FINISHED = "expo.modules.restalarm.REST_FINISHED"
  private const val NOTIFICATION_ID = 7301
  private const val REQUEST_CODE = 7301
  private val VIBRATION_PATTERN = longArrayOf(0, 800, 400, 800, 400, 800)

  fun canScheduleExactAlarms(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return context.getSystemService(AlarmManager::class.java)?.canScheduleExactAlarms() ?: false
  }

  fun areNotificationsEnabled(context: Context): Boolean =
    context.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() ?: false

  /** Returns true when the alarm was scheduled exactly, false when Android may defer it. */
  fun schedule(context: Context, triggerAtMillis: Long, title: String, body: String): Boolean {
    ensureChannel(context)
    val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return false
    val operation = alarmIntent(context, title, body)
    if (canScheduleExactAlarms(context)) {
      try {
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, operation)
        return true
      } catch (_: SecurityException) {
        // Permission revoked between the check and the call; fall back to an inexact alarm.
      }
    }
    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, operation)
    return false
  }

  fun cancel(context: Context) {
    context.getSystemService(AlarmManager::class.java)?.cancel(alarmIntent(context))
    context.getSystemService(NotificationManager::class.java)?.cancel(NOTIFICATION_ID)
  }

  fun showNotification(context: Context, title: String, body: String) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (!manager.areNotificationsEnabled()) return
    ensureChannel(context)

    val builder = Notification.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.rest_alarm_notification_icon)
      .setContentTitle(title)
      .setContentText(body)
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setAutoCancel(true)

    context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
      builder.setContentIntent(
        PendingIntent.getActivity(context, REQUEST_CODE, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      )
    }

    try {
      manager.notify(NOTIFICATION_ID, builder.build())
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS was revoked after the enabled check.
    }
  }

  private fun ensureChannel(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(CHANNEL_ID, "Rest Timer", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Alerts you when your rest between sets is over."
      enableVibration(true)
      vibrationPattern = VIBRATION_PATTERN
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setShowBadge(false)
      setBypassDnd(true)
    }
    manager.createNotificationChannel(channel)
  }

  // Extras are not part of PendingIntent identity, so cancel() matches the scheduled alarm.
  private fun alarmIntent(context: Context, title: String? = null, body: String? = null): PendingIntent {
    val intent = Intent(context, RestAlarmReceiver::class.java).setAction(ACTION_REST_FINISHED)
    title?.let { intent.putExtra(EXTRA_TITLE, it) }
    body?.let { intent.putExtra(EXTRA_BODY, it) }
    return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}
