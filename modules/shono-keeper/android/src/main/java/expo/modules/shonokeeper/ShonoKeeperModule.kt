package expo.modules.shonokeeper

import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Keeps Shono connected to the earbuds while it's in the background: a foreground service with an ongoing
 * notification (so Android keeps the app alive), and a headless JS task (so React Native keeps running Shono's
 * timers: its refreshes, reconnects and request timeouts pause in the background otherwise). No wake lock: Bluetooth
 * messages from the earbuds wake the phone when there's something to do.
 */
class ShonoKeeperModule : Module() {
  private var taskId: Int? = null

  override fun definition() = ModuleDefinition {
    Name("ShonoKeeper")
    Events("onStopPressed")

    OnCreate { current = this@ShonoKeeperModule }
    OnDestroy { if (current === this@ShonoKeeperModule) current = null }

    /** Starts the service, or updates its notification while it runs. False when Android refused to start it (an
     * app in the background can't start a foreground service on Android 12+). */
    Function("start") { title: String, text: String ->
      val context = appContext.reactContext ?: return@Function false
      if (KeeperService.running) {
        KeeperService.update(context, title, text)
      } else {
        val intent = Intent(context, KeeperService::class.java)
          .putExtra(KeeperService.EXTRA_TITLE, title)
          .putExtra(KeeperService.EXTRA_TEXT, text)
        try {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
        } catch (e: Exception) {
          return@Function false
        }
      }
      val react = context as? ReactContext ?: return@Function true
      if (taskId == null) {
        UiThreadUtil.runOnUiThread {
          if (taskId == null) {
            taskId = HeadlessJsTaskContext.getInstance(react)
              .startTask(HeadlessJsTaskConfig(TASK, Arguments.createMap(), 0, true))
          }
        }
      }
      true
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function
      context.stopService(Intent(context, KeeperService::class.java))
      val id = taskId ?: return@Function
      taskId = null
      (context as? ReactContext)?.let { HeadlessJsTaskContext.getInstance(it).finishTask(id) }
    }
  }

  companion object {
    /** The JS task's name (registered in modules/shono-keeper/index.ts). */
    const val TASK = "ShonoKeeper"
    private var current: ShonoKeeperModule? = null

    /** The notification's Stop button: Shono decides what that means (it disconnects), then stops the service. */
    fun stopPressed(context: Context) {
      val module = current
      if (module == null) {
        context.stopService(Intent(context, KeeperService::class.java)) // nothing left to ask
        return
      }
      module.sendEvent("onStopPressed", mapOf<String, Any?>())
    }
  }
}
