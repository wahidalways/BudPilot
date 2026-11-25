package expo.modules.shonokeeper

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.io.Writer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * A plain-text log on the phone (files/shono-log.txt), for finding out what happens while Shono is in the background:
 * the earbuds' own messages, the phone's media volume, the earbuds' volume, and Shono going to the background and
 * back. It stays on the phone unless the user shares it from App settings. Two files of up to 100 KB: when the current
 * one is full it becomes the old one (a rename, not a rewrite).
 *
 * Written on one background thread with the file kept open (it used to be opened and closed for every line, sometimes
 * on the main thread); each line is flushed, so nothing is lost if Android stops Shono.
 */
object ShonoLog {
  private const val MAX = 100 * 1024
  private val time = SimpleDateFormat("HH:mm:ss.SSS", Locale.US) // used on the log's thread only
  private val io = Executors.newSingleThreadExecutor { Thread(it, "shono-log").apply { isDaemon = true } }
  private var out: Writer? = null

  private fun file(context: Context) = File(context.filesDir, "shono-log.txt")
  private fun old(context: Context) = File(context.filesDir, "shono-log.1.txt")

  fun add(context: Context, line: String) {
    val at = System.currentTimeMillis()
    val app = context.applicationContext
    io.execute {
      runCatching {
        val f = file(app)
        val w = out ?: FileOutputStream(f, true).bufferedWriter().also { out = it } // append
        w.write("${time.format(Date(at))} $line\n")
        w.flush()
        if (f.length() > MAX) {
          close()
          old(app).delete()
          f.renameTo(old(app))
        }
      }.onFailure { close() }
    }
  }

  fun read(context: Context): String {
    val app = context.applicationContext
    // after the lines still waiting to be written
    return io.submit<String> { listOf(old(app), file(app)).filter { it.exists() }.joinToString("") { runCatching { it.readText() }.getOrDefault("") } }.get()
  }

  fun clear(context: Context) {
    val app = context.applicationContext
    io.execute {
      close()
      runCatching {
        file(app).delete()
        old(app).delete()
      }
    }
  }

  private fun close() {
    runCatching { out?.close() }
    out = null
  }
}
