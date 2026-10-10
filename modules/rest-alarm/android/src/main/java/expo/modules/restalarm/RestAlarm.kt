package expo.modules.restalarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
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
  // A count this late still plays straight away: exact alarms often arrive some milliseconds late.
  private const val LATE_PULSE_TOLERANCE_MS = 400L
  // One short pulse per count (3, 2, 1), then the end buzz on the rest's end. The end buzz is longer
  // and at full strength, so it reads as harder even on phones without amplitude control.
  private class CuePulse(val startMillis: Long, val durationMillis: Long, val amplitude: Int)
  private val CUE_PULSES = listOf(
    CuePulse(0, 150, 170),
    CuePulse(1000, 150, 170),
    CuePulse(2000, 150, 170),
    CuePulse(CUE_LEAD_MS, 700, 255),
  )
  private val PULSE_TOKEN = Any()
  private val handler by lazy { Handler(Looper.getMainLooper()) }
  // Ends the receiver's goAsync() once the cue has played or was cancelled, releasing the alarm's wake lock.
  private var pendingDone: (() -> Unit)? = null
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
    stopPulses()
    vibrator(context)?.cancel()
  }

  /**
   * Runs from the alarm receiver, without the app. Plays each pulse as its own short vibration on a
   * timer: Android cancels an ongoing vibration whenever another one starts (a keyboard tick, a scroll
   * haptic, another app), so one long waveform would be cut off after the first pulse while the phone
   * is in use. Pulses already past are skipped. [onDone] runs once the last pulse has started.
   */
  fun playCue(context: Context, endsAtMillis: Long, onDone: () -> Unit, nowMillis: Long = System.currentTimeMillis()) {
    val vibrator = vibrator(context)
    val pulses = cuePulses(nowMillis - (endsAtMillis - CUE_LEAD_MS))
    if (vibrator == null || !vibrator.hasVibrator() || pulses.isEmpty()) {
      onDone()
      return
    }
    stopPulses()
    synchronized(this) { pendingDone = onDone }
    val amplitudeControl = vibrator.hasAmplitudeControl()
    pulses.forEachIndexed { i, pulse ->
      handler.postAtTime({
        vibrate(vibrator, pulse, amplitudeControl)
        if (i == pulses.lastIndex) finishPulses()
      }, PULSE_TOKEN, SystemClock.uptimeMillis() + pulse.delayMillis)
    }
  }

  data class Pulse(val delayMillis: Long, val durationMillis: Long, val amplitude: Int)

  // [elapsedMillis] is how far into the cue we are. Counts missed by more than the tolerance are dropped and the end buzz
  // keeps its place on the rest's end; past the end only the end buzz plays, and a stale cue none.
  internal fun cuePulses(elapsedMillis: Long): List<Pulse> {
    val endBuzz = CUE_PULSES.last()
    if (elapsedMillis > endBuzz.startMillis + STALE_AFTER_MS) return emptyList()
    return CUE_PULSES.filter { it === endBuzz || it.startMillis >= elapsedMillis - LATE_PULSE_TOLERANCE_MS }
      .map { Pulse((it.startMillis - elapsedMillis).coerceAtLeast(0L), it.durationMillis, it.amplitude) }
  }

  private fun vibrate(vibrator: Vibrator, pulse: Pulse, amplitudeControl: Boolean) {
    val amplitude = if (amplitudeControl) pulse.amplitude else VibrationEffect.DEFAULT_AMPLITUDE
    val effect = VibrationEffect.createOneShot(pulse.durationMillis, amplitude)
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

  private fun stopPulses() {
    handler.removeCallbacksAndMessages(PULSE_TOKEN)
    finishPulses()
  }

  // cancel() runs on the module's thread, the pulses on the main thread.
  private fun finishPulses() {
    val done = synchronized(this) { pendingDone.also { pendingDone = null } }
    done?.invoke()
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
