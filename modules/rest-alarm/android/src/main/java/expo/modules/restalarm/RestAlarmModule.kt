package expo.modules.restalarm

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RestAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("RestAlarm")

    Function("canScheduleExactAlarms") {
      RestAlarm.canScheduleExactAlarms(context)
    }

    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function false
      val packageUri = Uri.parse("package:${context.packageName}")
      val launcher = appContext.currentActivity ?: context
      try {
        launcher.startActivity(
          Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, packageUri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
      } catch (_: ActivityNotFoundException) {
        launcher.startActivity(
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
      }
      true
    }

    AsyncFunction("schedule") { endsAtMillis: Double ->
      RestAlarm.schedule(context, endsAtMillis.toLong())
    }

    AsyncFunction("cancel") {
      RestAlarm.cancel(context)
    }
  }
}
