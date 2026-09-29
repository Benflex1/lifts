package expo.modules.restalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class RestAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    RestAlarm.showNotification(
      context,
      intent.getStringExtra(RestAlarm.EXTRA_TITLE) ?: "Rest Finished!",
      intent.getStringExtra(RestAlarm.EXTRA_BODY) ?: "Time for your next set."
    )
  }
}
