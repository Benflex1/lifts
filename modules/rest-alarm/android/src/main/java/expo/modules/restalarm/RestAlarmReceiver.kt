package expo.modules.restalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class RestAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val endsAt = intent.getLongExtra(RestAlarm.EXTRA_ENDS_AT, -1L)
    if (endsAt <= 0L) return
    // Keeps the broadcast, and with it the alarm's wake lock and the process, alive for the ~4s the
    // pulses take to play.
    val pending = goAsync()
    RestAlarm.playCue(context.applicationContext, endsAt, onDone = { pending.finish() })
  }
}
