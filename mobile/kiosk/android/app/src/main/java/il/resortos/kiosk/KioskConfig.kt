package il.resortos.kiosk

import android.content.Context
import il.resortos.kiosk.BuildConfig
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Locale
import java.util.Properties

data class KioskConfig(
    val localToken: String,
    val serverToken: String,
    val apiBase: String,
    val port: Int,
    val paymentsMode: String
) {
    val configured: Boolean get() = localToken.length >= 16
    val serverEnabled: Boolean get() = serverToken.length >= 16 && apiBase.startsWith("http")
    val live: Boolean get() = paymentsMode == "live"

    companion object {
        fun load(context: Context): KioskConfig {
            val props = Properties()
            val candidates = listOf(
                context.getExternalFilesDir(null)?.let { File(it, "kiosk.properties") },
                File(context.filesDir, "kiosk.properties")
            )
            for (file in candidates) {
                if (file != null && file.isFile) {
                    file.reader(Charsets.UTF_8).use { props.load(it) }
                    break
                }
            }
            val port = props.getProperty("kiosk.listen.port", "8765").trim().toIntOrNull() ?: 8765
            var base = props.getProperty("kiosk.api.base", "https://resortos.app").trim().trimEnd('/')
            val https = base.startsWith("https://")
            val debugHttp = BuildConfig.DEBUG && base.startsWith("http://")
            if (!https && !debugHttp) base = ""
            val mode = props.getProperty("kiosk.payments.mode", "mock").trim().lowercase(Locale.US)
            return KioskConfig(
                localToken = props.getProperty("kiosk.local.token", "").trim(),
                serverToken = props.getProperty("kiosk.server.token", "").trim(),
                apiBase = base,
                port = if (port in 1024..65535) port else 8765,
                paymentsMode = if (mode == "live") "live" else "mock"
            )
        }
    }
}

fun constantTimeEquals(a: String, b: String): Boolean {
    val left = a.toByteArray(Charsets.UTF_8)
    val right = b.toByteArray(Charsets.UTF_8)
    val len = maxOf(left.size, right.size)
    var diff = left.size xor right.size
    for (i in 0 until len) {
        val lb = if (i < left.size) left[i].toInt() else 0
        val rb = if (i < right.size) right[i].toInt() else 0
        diff = diff or (lb xor rb)
    }
    return diff == 0
}

fun parseAmount(raw: Any?): BigDecimal? {
    val decimal = when (raw) {
        is String -> {
            val text = raw.trim()
            if (!text.matches(Regex("""\d{1,6}(\.\d{1,2})?"""))) null else BigDecimal(text)
        }
        is Int, is Long -> BigDecimal(raw.toString())
        is Double -> BigDecimal(String.format(Locale.US, "%.2f", raw))
        else -> null
    } ?: return null
    if (decimal.signum() <= 0) return null
    if (decimal.scale() > 2) return null
    return decimal.setScale(2, RoundingMode.UNNECESSARY)
}

fun bearerToken(header: String?): String {
    val trimmed = header?.trim().orEmpty()
    val prefix = "bearer "
    if (trimmed.length < prefix.length) return ""
    if (!trimmed.regionMatches(0, prefix, 0, prefix.length, ignoreCase = true)) return ""
    return trimmed.substring(prefix.length).trim()
}
