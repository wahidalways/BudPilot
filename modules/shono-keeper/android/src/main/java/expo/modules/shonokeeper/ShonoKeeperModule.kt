package expo.modules.shonokeeper

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHeadset
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.abs

/** Asks for the display's fastest refresh rate at the current resolution (from Muse). Android may still cap it for
 * battery saver, heat, or a 60 Hz choice in the phone's display settings. */
private fun preferFastestRefreshRate(activity: Activity) {
  activity.runOnUiThread { runCatching { applyFastestRefreshRate(activity) } } // window settings belong to the UI thread
}

private fun applyFastestRefreshRate(activity: Activity) {
  // some mode switches blank the screen for a moment; Android 12 is the first to say which ones don't
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
  val window = activity.window ?: return
  val display = activity.display ?: return
  val current = display.mode
  val fastest = display.supportedModes
    .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
    .maxByOrNull { it.refreshRate } ?: return
  val seamless = fastest.modeId == current.modeId || current.alternativeRefreshRates.any { abs(it - fastest.refreshRate) < 0.1f }
  if (!seamless) return
  val attributes = window.attributes
  if (attributes.preferredDisplayModeId != fastest.modeId) {
    attributes.preferredDisplayModeId = fastest.modeId
    window.attributes = attributes
  }
}

/**
 * Keeps Shono connected to the earbuds while it's in the background: a foreground service with an ongoing
 * notification (so Android keeps the app alive), and a headless JS task (so React Native keeps running Shono's
 * timers: its refreshes, reconnects and request timeouts pause in the background otherwise). No wake lock: Bluetooth
 * messages from the earbuds wake the phone when there's something to do.
 *
 * It also tells Shono which Bluetooth devices are connected to the phone for sound, and the moment that changes, so
 * Shono connects to the earbuds as soon as they play on the phone (and lets go when they move to another device).
 *
 * And it keeps Shono's log (ShonoLog): Shono going to the background and back, the phone's media volume, Bluetooth
 * sound connections, and the lines Shono's JavaScript adds.
 */
class ShonoKeeperModule : Module() {
  // Shono's background timers (utils/later.ts) run on Android's own Handler, so Shono wakes only when one is due.
  // React Native's timers stop in the background, and keeping them going (a headless JS task) re-armed them on every
  // screen frame, 60-165 times a second, even with the screen off.
  private val timers = Handler(Looper.getMainLooper())
  private val pending = HashMap<Int, Runnable>()

  // Game mode › Turn on with games: which app is in front, looked at every few seconds while it's on
  private var front: String? = null
  private var gamePlaying: Boolean? = null
  private val gameLook: Runnable = object : Runnable {
    override fun run() {
      val context = appContext.reactContext ?: return
      val playing = runCatching { gameInFront(context) }.getOrDefault(false)
      if (playing != gamePlaying) {
        gamePlaying = playing
        sendEvent("onGameChanged", mapOf("playing" to playing))
      }
      timers.postDelayed(this, GAME_LOOK_MS)
    }
  }
  private var soundWatch: BroadcastReceiver? = null
  private var volumeWatch: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("ShonoKeeper")
    Events("onStopPressed", "onSoundDevicesChanged", "onLastSeen", "onLater", "onGameChanged")

    OnCreate {
      current = this@ShonoKeeperModule
      watchSound()
      watchVolume()
    }
    OnDestroy {
      if (current === this@ShonoKeeperModule) current = null
      timers.removeCallbacksAndMessages(null)
      for (r in listOfNotNull(soundWatch, volumeWatch)) appContext.reactContext?.let { runCatching { it.unregisterReceiver(r) } }
      soundWatch = null
      volumeWatch = null
    }
    // Many 90/120 Hz phones keep apps they don't know at 60 Hz, which halves the frames of every scroll and animation:
    // each time Shono comes to the front (also on launch), it asks for the screen's fastest rate
    OnActivityEntersForeground {
      note("Shono in front, ${phoneVolume()}")
      appContext.currentActivity?.let(::preferFastestRefreshRate)
    }
    OnActivityEntersBackground { note("Shono in the background, ${phoneVolume()}") }

    AsyncFunction("log") { line: String -> note(line) } // off the JS thread: it writes a file

    Function("later") { id: Int, ms: Double ->
      val run = Runnable {
        synchronized(pending) { pending.remove(id) }
        sendEvent("onLater", mapOf("id" to id))
      }
      synchronized(pending) { pending[id] = run }
      timers.postDelayed(run, ms.toLong().coerceAtLeast(0))
    }
    Function("cancelLater") { id: Int ->
      val run = synchronized(pending) { pending.remove(id) }
      if (run != null) timers.removeCallbacks(run)
    }

    /** Whether Android lets Shono run in the background without battery limits ("Unrestricted"). */
    Function("backgroundUnrestricted") {
      val context = appContext.reactContext ?: return@Function false
      (context.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(context.packageName)
    }
    /** Android's own question, "Let Shono always run in the background?"; phones that hide it get Shono's app settings
     * page instead, where Battery › Unrestricted is. */
    Function("askBackgroundUnrestricted") {
      val activity = appContext.currentActivity ?: return@Function false
      val pkg = Uri.parse("package:${activity.packageName}")
      runCatching { activity.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg)) }.isSuccess ||
        runCatching { activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)) }.isSuccess
    }
    /** Game mode › Turn on with games: whether Shono may see which app is in front (Usage access), and Android's page
     * to allow it. */
    Function("hasUsageAccess") { appContext.reactContext?.let { usageAllowed(it) } ?: false }
    Function("openUsageAccess") {
      val activity = appContext.currentActivity ?: return@Function false
      runCatching { activity.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:${activity.packageName}"))) }.isSuccess ||
        runCatching { activity.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) }.isSuccess
    }
    /** Starts or stops looking for a game in front; "onGameChanged" says when one opens or closes. */
    Function("watchGames") { on: Boolean ->
      timers.removeCallbacks(gameLook)
      gamePlaying = null
      if (on) timers.post(gameLook)
    }

    /** What kind of phone this is, so low-end ones start with the lighter look. */
    Function("deviceClass") {
      val context = appContext.reactContext ?: return@Function null
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val mem = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
      mapOf("lowRam" to am.isLowRamDevice, "ramGb" to mem.totalMem / 1_073_741_824.0, "sdk" to Build.VERSION.SDK_INT)
    }
    AsyncFunction("readLog") { appContext.reactContext?.let { ShonoLog.read(it) } ?: "" }
    Function("clearLog") { appContext.reactContext?.let { ShonoLog.clear(it) } }

    // Find my earbuds › Last seen (LastSeen.kt)
    Function("setLastSeen") { enabled: Boolean, address: String? ->
      appContext.reactContext?.let {
        val was = LastSeen.wanted(it)
        LastSeen.configure(it, enabled, address)
        if (LastSeen.wanted(it) != was) KeeperService.refresh(it) // add or drop the service's location type
      }
    }
    AsyncFunction("getLastSeen") { appContext.reactContext?.let { LastSeen.read(it) } }
    Function("clearLastSeen") { appContext.reactContext?.let { LastSeen.clear(it) } }
    Function("locationOn") { appContext.reactContext?.let { LastSeen.locationOn(it) } ?: true }

    /** The devices connected to the phone for sound (music or calls): [{ address, name }]. Empty without Bluetooth
     * access or with Bluetooth off. */
    AsyncFunction("soundDevices") { promise: Promise ->
      val context = appContext.reactContext
      val adapter = (context?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
      if (context == null || adapter == null || !adapter.isEnabled) {
        promise.resolve(listOf<Map<String, String>>())
      } else {
        val found = ConcurrentHashMap<String, String>()
        val left = AtomicInteger(2) // the two profiles; each one that answers (or can't be asked) counts down once
        val done = AtomicBoolean(false)
        val finish = {
          if (left.decrementAndGet() == 0 && done.compareAndSet(false, true)) {
            promise.resolve(found.map { mapOf("address" to it.key, "name" to it.value) })
          }
        }
        val listener = object : BluetoothProfile.ServiceListener {
          override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
            try {
              for (device in proxy.connectedDevices) found[device.address] = device.name ?: ""
            } catch (e: SecurityException) {
              // no Bluetooth access yet: nothing to report
            }
            adapter.closeProfileProxy(profile, proxy)
            finish()
          }

          override fun onServiceDisconnected(profile: Int) {}
        }
        if (!adapter.getProfileProxy(context, listener, BluetoothProfile.A2DP)) finish()
        if (!adapter.getProfileProxy(context, listener, BluetoothProfile.HEADSET)) finish()
      }
    }

    /** Starts the service, or updates its notification while it runs. False when Android refused to start it (an
     * app in the background can't start a foreground service on Android 12+). */
    Function("start") { title: String, text: String ->
      val context = appContext.reactContext ?: return@Function false
      // Android 14+ refuses a connected-device service without Nearby devices access, and Shono would crash
      if (Build.VERSION.SDK_INT >= 34 && context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
        return@Function false
      }
      if (KeeperService.running) {
        KeeperService.update(context, title, text)
      } else {
        note("background keeper starting")
        val intent = Intent(context, KeeperService::class.java)
          .putExtra(KeeperService.EXTRA_TITLE, title)
          .putExtra(KeeperService.EXTRA_TEXT, text)
        try {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
        } catch (e: Exception) {
          return@Function false
        }
      }
      true
    }

    Function("stop") {
      val context = appContext.reactContext
      if (context != null) {
        if (KeeperService.running) note("background keeper stopped")
        context.stopService(Intent(context, KeeperService::class.java))
      }
      KeeperService.running = false // a start straight after starts it again, rather than updating a stopping one
    }
  }

  /** Bluetooth sound connections coming and going (the earbuds leaving the case connect within a second or two). */
  private fun watchSound() {
    val context = appContext.reactContext ?: return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context?, intent: Intent?) {
        val state = intent?.getIntExtra(BluetoothProfile.EXTRA_STATE, -1)?.takeIf { it >= 0 }?.let { " state $it" } ?: ""
        note("bluetooth ${intent?.action?.substringAfterLast('.')}$state")
        sendEvent("onSoundDevicesChanged", mapOf<String, Any?>())
        // the earbuds left this phone: note where the phone is (Last seen, when it's on)
        if (intent?.action == BluetoothDevice.ACTION_ACL_DISCONNECTED) {
          @Suppress("DEPRECATION")
          val device = intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE)
          if (LastSeen.isEarbuds(context, device?.address)) {
            LastSeen.capture(context, { line -> note(line) }) { sendEvent("onLastSeen", mapOf<String, Any?>()) }
          }
        }
      }
    }
    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
      addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
      addAction(BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED)
      addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED)
      addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
    }
    // system broadcasts only, so the receiver needn't be exported
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }
    soundWatch = receiver
  }

  /** The phone's media volume, whenever it changes (an earbud volume tap that reaches the phone shows here). */
  private fun watchVolume() {
    val context = appContext.reactContext ?: return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context?, intent: Intent?) {
        if (intent?.getIntExtra(EXTRA_STREAM, -1) != AudioManager.STREAM_MUSIC) return
        val now = intent.getIntExtra(EXTRA_VALUE, -1)
        val before = intent.getIntExtra(EXTRA_PREV, -1)
        if (now != before) note("phone volume $before → $now")
      }
    }
    val filter = IntentFilter(VOLUME_CHANGED)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }
    volumeWatch = receiver
  }

  private fun usageAllowed(context: Context): Boolean {
    val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), context.packageName)
    } else {
      @Suppress("DEPRECATION")
      ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), context.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  /** Whether the app in front is a game: the last app brought to the front (Android's usage events), by the category
   * it declares. Kept between looks, so a still screen keeps the last answer. */
  private fun gameInFront(context: Context): Boolean {
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return false
    val now = System.currentTimeMillis()
    val events = usm.queryEvents(now - 10_000, now)
    val e = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(e)
      @Suppress("DEPRECATION") // ACTIVITY_RESUMED on Android 10+, the same value
      if (e.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) front = e.packageName
    }
    val pkg = front ?: return false
    if (pkg == context.packageName) return false
    val info = context.packageManager.getApplicationInfo(pkg, 0)
    @Suppress("DEPRECATION")
    return (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && info.category == ApplicationInfo.CATEGORY_GAME) ||
      (info.flags and ApplicationInfo.FLAG_IS_GAME) != 0
  }

  private fun phoneVolume(): String {
    val audio = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return "phone volume unknown"
    return "phone volume ${audio.getStreamVolume(AudioManager.STREAM_MUSIC)} of ${audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)}"
  }

  private fun note(line: String) {
    appContext.reactContext?.let { ShonoLog.add(it, line) }
  }

  companion object {
    private const val GAME_LOOK_MS = 4000L // how often Turn on with games looks at the app in front

    // the system's volume broadcast (not in the public SDK, but sent on every volume change)
    private const val VOLUME_CHANGED = "android.media.VOLUME_CHANGED_ACTION"
    private const val EXTRA_STREAM = "android.media.EXTRA_VOLUME_STREAM_TYPE"
    private const val EXTRA_VALUE = "android.media.EXTRA_VOLUME_STREAM_VALUE"
    private const val EXTRA_PREV = "android.media.EXTRA_PREV_VOLUME_STREAM_VALUE"

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
