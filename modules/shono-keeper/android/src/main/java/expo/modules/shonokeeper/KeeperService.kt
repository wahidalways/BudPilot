package expo.modules.shonokeeper

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** The foreground service behind Shono's ongoing "Keeping ANC Low" notification. */
class KeeperService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      ShonoKeeperModule.stopPressed(this)
      return START_NOT_STICKY
    }
    val notification = build(this, intent?.getStringExtra(EXTRA_TITLE) ?: "Shono", intent?.getStringExtra(EXTRA_TEXT) ?: "")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    running = true
    // not restarted by Android after it's killed: Shono starts it again when it opens and finds the earbuds
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    private const val ACTION_STOP = "expo.modules.shonokeeper.STOP"
    private const val CHANNEL_ID = "shono_keeper"
    private const val NOTIFICATION_ID = 4721

    /** True while the service is in the foreground; then its notification is updated in place (Android 12+ won't
     * let an app in the background start a foreground service again). */
    @Volatile var running = false

    fun update(context: Context, title: String, text: String) {
      context.getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, build(context, title, text))
    }

    fun build(context: Context, title: String, text: String): Notification {
      val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      }
      val stop = PendingIntent.getService(
        context,
        1,
        Intent(context, KeeperService::class.java).setAction(ACTION_STOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        // quiet: no sound, no badge; it's there so Android keeps Shono running
        val channel = NotificationChannel(CHANNEL_ID, "Keeping your noise setting", NotificationManager.IMPORTANCE_LOW)
        channel.setShowBadge(false)
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        Notification.Builder(context, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context).setPriority(Notification.PRIORITY_LOW)
      }
      builder
        .setSmallIcon(R.drawable.shono_keeper)
        .setContentTitle(title)
        .setContentText(text)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setCategory(Notification.CATEGORY_SERVICE)
        .addAction(Notification.Action.Builder(null, "Stop", stop).build())
      open?.let { builder.setContentIntent(it) }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
      return builder.build()
    }
  }
}
