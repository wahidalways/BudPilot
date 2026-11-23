package expo.modules.shonokeeper

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * A plain-text log on the phone (files/shono-log.txt), for finding out what happens while Shono is in the background:
 * the earbuds' own messages, the phone's media volume, the earbuds' volume, and Shono going to the background and
 * back. It stays on the phone unless the user shares it from App settings. Two files of up to 100 KB: when the current
 * one is full it becomes the old one (a rename, not a rewrite).
 */
object ShonoLog {
  private const val MAX = 100 * 1024
  private val time = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

  private fun file(context: Context) = File(context.filesDir, "shono-log.txt")
  private fun old(context: Context) = File(context.filesDir, "shono-log.1.txt")

  @Synchronized
  fun add(context: Context, line: String) {
    runCatching {
      val f = file(context)
      f.appendText("${time.format(Date())} $line\n")
      if (f.length() > MAX) {
        old(context).delete()
        f.renameTo(old(context))
      }
    }
  }

  @Synchronized
  fun read(context: Context): String = listOf(old(context), file(context)).filter { it.exists() }.joinToString("") { runCatching { it.readText() }.getOrDefault("") }

  @Synchronized
  fun clear(context: Context) {
    runCatching {
      file(context).delete()
      old(context).delete()
    }
  }
}
