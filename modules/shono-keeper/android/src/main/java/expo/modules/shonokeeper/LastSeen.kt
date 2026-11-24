package expo.modules.shonokeeper

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.util.Locale

/**
 * Last seen (Find my earbuds): where the phone was when the earbuds last disconnected from it. Off until the user turns
 * it on; read once at that moment, from the phone's own location (no history, no network of Shono's), and kept in
 * Shono's private storage on this phone. Works in the background while the keeper service runs with its location
 * type (KeeperService), which Android requires for a location read from the background.
 */
object LastSeen {
  private const val PREFS = "shono_last_seen"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** Turned on, and for which earbuds (their Bluetooth address, the same for sound and for Shono's link). */
  fun configure(context: Context, enabled: Boolean, address: String?) {
    prefs(context).edit().putBoolean("enabled", enabled).apply { if (address != null) putString("address", address) }.apply()
  }

  fun enabled(context: Context) = prefs(context).getBoolean("enabled", false)

  fun hasPermission(context: Context) =
    context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

  /** Whether the keeper should carry the location type: Android refuses it without the permission. */
  fun wanted(context: Context) = enabled(context) && hasPermission(context)

  /** Whether the phone's Location switch is on: while it's off, no place can be read. */
  fun locationOn(context: Context): Boolean {
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return lm.isLocationEnabled
    return runCatching { lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) }.getOrDefault(false)
  }

  fun isEarbuds(context: Context, address: String?) = address != null && address.equals(prefs(context).getString("address", null), ignoreCase = true)

  fun read(context: Context): Map<String, Any>? {
    val p = prefs(context)
    if (!p.contains("at")) return null
    return buildMap {
      put("lat", p.getFloat("lat", 0f).toDouble())
      put("lng", p.getFloat("lng", 0f).toDouble())
      put("accuracy", p.getFloat("accuracy", 0f).toDouble())
      put("at", p.getLong("at", 0L).toDouble())
      p.getString("place", null)?.let { put("place", it) }
    }
  }

  /** The earbuds just disconnected: read the phone's location once, save it, then add a street name if the phone can
   * find one. `done` runs after each save (Shono shows the new place). */
  @Suppress("MissingPermission") // checked in hasPermission
  fun capture(context: Context, log: (String) -> Unit, done: () -> Unit) {
    if (!wanted(context)) return
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return
    val providers = buildList {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) add(LocationManager.FUSED_PROVIDER)
      add(LocationManager.GPS_PROVIDER)
      add(LocationManager.NETWORK_PROVIDER)
    }.filter { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) }
    if (providers.isEmpty()) return log("last seen: location is off on this phone")
    // a fix from the last 2 minutes is good enough; otherwise ask for a fresh one
    val recent = providers.mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
      .filter { System.currentTimeMillis() - it.time < 120_000 }
      .minByOrNull { it.accuracy }
    if (recent != null) return save(context, recent, log, done)
    val provider = providers.first()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        lm.getCurrentLocation(provider, null, context.mainExecutor) { loc -> loc?.let { save(context, it, log, done) } ?: log("last seen: no fix") }
      } else {
        // Android 10 and older: no built-in timeout, so stop asking after 30 s (indoors GPS may never answer)
        val listener = LocationListener { save(context, it, log, done) }
        @Suppress("DEPRECATION")
        lm.requestSingleUpdate(provider, listener, Looper.getMainLooper())
        Handler(Looper.getMainLooper()).postDelayed({ lm.removeUpdates(listener) }, 30_000)
      }
    } catch (e: Exception) {
      log("last seen: ${e.message}")
    }
  }

  private fun save(context: Context, loc: Location, log: (String) -> Unit, done: () -> Unit) {
    prefs(context).edit()
      .putFloat("lat", loc.latitude.toFloat())
      .putFloat("lng", loc.longitude.toFloat())
      .putFloat("accuracy", loc.accuracy)
      .putLong("at", System.currentTimeMillis())
      .remove("place")
      .apply()
    log("last seen saved (within ${loc.accuracy.toInt()} m)")
    done()
    // a street name, from the phone's geocoder (it may need a network; without one the place stays as coordinates)
    Thread {
      val place = runCatching {
        @Suppress("DEPRECATION")
        Geocoder(context, Locale.getDefault()).getFromLocation(loc.latitude, loc.longitude, 1)?.firstOrNull()?.let { a ->
          listOfNotNull(a.thoroughfare ?: a.featureName, a.subLocality, a.locality).distinct().joinToString(", ").ifEmpty { null }
        }
      }.getOrNull()
      if (place != null) {
        prefs(context).edit().putString("place", place).apply()
        done()
      }
    }.start()
  }

  fun clear(context: Context) {
    prefs(context).edit().remove("lat").remove("lng").remove("accuracy").remove("at").remove("place").apply()
  }
}
