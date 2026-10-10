package expo.modules.restalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class RestAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val endsAt = intent.getLongExtra(RestAlarm.EXTRA_ENDS_AT, -1L)
    if (endsAt <= 0L) return
    RestAlarm.playCue(context, endsAt)
  }
}
