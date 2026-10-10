package expo.modules.restalarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

// Plays the end-of-rest vibration cue (3, 2, 1 and a harder buzz at 0) from an exact alarm, so it
// runs on time with the phone locked or the app killed, and without posting a notification.
object RestAlarm {
  const val EXTRA_ENDS_AT = "expo.modules.restalarm.ENDS_AT"
  private const val ACTION_REST_CUE = "expo.modules.restalarm.REST_CUE"
  private const val REQUEST_CODE = 7301
  // The cue starts this long before the rest ends: one pulse per second for 3, 2, 1, then the end buzz.
  private const val CUE_LEAD_MS = 3000L
  // A cue that arrives this long after the rest ended (phone was off, alarm deferred) is dropped.
  private const val STALE_AFTER_MS = 30_000L
  // Durations in ms with their amplitudes (0 = off). Each count is a short pulse; the end buzz is
  // longer and at full strength, so it reads as harder even on phones without amplitude control.
  private val CUE_TIMINGS = longArrayOf(150, 850, 150, 850, 150, 850, 700)
  private val CUE_AMPLITUDES = intArrayOf(170, 0, 170, 0, 170, 0, 255)
  // Notification ids and channels used by earlier versions, removed so nothing is left behind.
  private val LEGACY_NOTIFICATION_IDS = intArrayOf(7301, 7302)
  private val LEGACY_CHANNEL_IDS = listOf("rest-timer", "rest-countdown")

  fun canScheduleExactAlarms(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return context.getSystemService(AlarmManager::class.java)?.canScheduleExactAlarms() ?: false
  }

  /**
   * Arms the vibration cue for a rest ending at [endsAtMillis]. Replaces any armed cue.
   * Returns true when scheduled exactly, false when Android may defer it.
   */
  fun schedule(context: Context, endsAtMillis: Long): Boolean {
    removeLegacyNotifications(context)
    val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return false
    val operation = alarmIntent(context, endsAtMillis)
    val triggerAtMillis = endsAtMillis - CUE_LEAD_MS
    val exact = canScheduleExactAlarms(context) && setExact(alarmManager, triggerAtMillis, operation)
    if (!exact) {
      // Inexact fallback when exact alarms are denied, or revoked between the check and the call.
      alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, operation)
    }
    return exact
  }

  fun cancel(context: Context) {
    context.getSystemService(AlarmManager::class.java)?.cancel(alarmIntent(context))
    vibrator(context)?.cancel()
  }

  /** Runs from the alarm receiver, without the app. Skips the part of the cue that is already past. */
  fun playCue(context: Context, endsAtMillis: Long, nowMillis: Long = System.currentTimeMillis()) {
    val effect = cueEffect(nowMillis - (endsAtMillis - CUE_LEAD_MS)) ?: return
    val vibrator = vibrator(context) ?: return
    if (!vibrator.hasVibrator()) return
    // Alarm usage: Android ignores other vibrations from apps in the background or with the screen off.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM))
    } else {
      @Suppress("DEPRECATION")
      vibrator.vibrate(
        effect,
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
    }
  }

  // [elapsedMillis] is how far into the cue we are. A late start drops the counts already missed,
  // keeping the end buzz on the rest's end; past the end only the end buzz plays.
  private fun cueEffect(elapsedMillis: Long): VibrationEffect? {
    val endBuzzStart = CUE_TIMINGS.sum() - CUE_TIMINGS.last()
    if (elapsedMillis > endBuzzStart + STALE_AFTER_MS) return null
    if (elapsedMillis >= endBuzzStart) {
      return VibrationEffect.createWaveform(longArrayOf(CUE_TIMINGS.last()), intArrayOf(CUE_AMPLITUDES.last()), -1)
    }
    val timings = mutableListOf<Long>()
    val amplitudes = mutableListOf<Int>()
    var segmentStart = 0L
    CUE_TIMINGS.forEachIndexed { i, duration ->
      val segmentEnd = segmentStart + duration
      val skip = (elapsedMillis - segmentStart).coerceIn(0L, duration)
      if (duration - skip > 0) {
        // A partly elapsed pulse is cut to silence rather than played short.
        timings.add(duration - skip)
        amplitudes.add(if (skip > 0) 0 else CUE_AMPLITUDES[i])
      }
      segmentStart = segmentEnd
    }
    return VibrationEffect.createWaveform(timings.toLongArray(), amplitudes.toIntArray(), -1)
  }

  private fun vibrator(context: Context): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Vibrator::class.java)
    }

  private fun setExact(alarmManager: AlarmManager, triggerAtMillis: Long, operation: PendingIntent): Boolean =
    try {
      alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, operation)
      true
    } catch (_: SecurityException) {
      false
    }

  private fun removeLegacyNotifications(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    LEGACY_NOTIFICATION_IDS.forEach { manager.cancel(it) }
    LEGACY_CHANNEL_IDS.forEach { manager.deleteNotificationChannel(it) }
  }

  // Extras are not part of PendingIntent identity, so cancel() matches the scheduled alarm.
  private fun alarmIntent(context: Context, endsAtMillis: Long? = null): PendingIntent {
    val intent = Intent(context, RestAlarmReceiver::class.java).setAction(ACTION_REST_CUE)
    endsAtMillis?.let { intent.putExtra(EXTRA_ENDS_AT, it) }
    return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}
