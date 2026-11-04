package il.resortos.kiosk

import android.content.Context
import android.os.Build
import android.provider.Settings
import il.resortos.kiosk.cardcom.CardcomTapSdk
import il.resortos.kiosk.cardcom.MockCardcomTapSdk
import org.json.JSONObject
import java.math.BigDecimal
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

data class ChargeResult(val http: Int, val body: JSONObject)

/**
 * One contactless charge at a time. The ESP blocks on POST /v1/charges.
 * Cancel and the wait timeout release that POST. If the reader later approves,
 * the stored result flips to approved and the server still captures it.
 * Dispense only when ok, status approved, settled, and mock are all the safe values.
 */
class ChargeCoordinator(
    context: Context,
    private val config: KioskConfig,
    private val sdk: CardcomTapSdk,
    private val api: ResortApi?
) {
    private val app = context.applicationContext
    private val prefs = app.getSharedPreferences("kiosk.tap", Context.MODE_PRIVATE)
    private val deviceUuid = deviceUuid()
    private val usingMockSdk = sdk is MockCardcomTapSdk
    private val startLock = Any()
    private val results = LinkedHashMap<String, JSONObject>()

    @Volatile private var inflight: Job? = null
    var onUi: (phase: String, line: String) -> Unit = { _, _ -> }

    init {
        if (api != null) recover()
    }

    fun health(): JSONObject {
        val phoneMock = config.paymentsMode != "live" || BuildConfig.CARDCOM_TAP_MOCK
        return JSONObject()
            .put("ok", config.configured)
            .put("configured", config.configured)
            .put("mock", phoneMock)
            .put("busy", inflight != null)
            .put("port", config.port)
            .put("mode", config.paymentsMode)
            .put("version", BuildConfig.VERSION_NAME)
    }

    fun charge(body: JSONObject): ChargeResult {
        if (!config.configured) return error(503, "UNCONFIGURED", "חסר kiosk.local.token")
        val orderId = body.optString("orderId").trim()
        if (!orderId.matches(Regex("^[A-Za-z0-9_-]{1,64}$"))) {
            return error(400, "BAD_ORDER", "מזהה הזמנה חסר או לא תקין")
        }
        val payments = body.opt("payments")
        if (body.has("payments") && payments != null && payments != JSONObject.NULL && payments.toString() != "1") {
            return error(400, "KIOSK_SINGLE_PAYMENT", "עגלת הקפה סולקת בתשלום אחד", orderId)
        }
        val amount = parseAmount(body.opt("amount"))
            ?: return error(400, "BAD_AMOUNT", "סכום החיוב חייב להיות גדול מאפס", orderId)
        if (amount > BigDecimal("300.00")) {
            return error(400, "TAP_LIMIT", "כרטיס פיזי ב-Tap מוגבל ל-300 ש״ח", orderId)
        }
        val timeout = timeoutSec(body)
        remembered(orderId)?.let { saved ->
            val savedStatus = saved.optString("status")
            if (savedStatus == "approved" || savedStatus == "review") return ChargeResult(200, saved)
        }
        if (config.live && BuildConfig.CARDCOM_TAP_MOCK) {
            return error(503, "SDK_MOCK", "מצב live בלי חבילת Cardcom. אין חיוב.", orderId)
        }
        if (config.live && api == null) {
            return error(503, "UNCONFIGURED", "מצב live בלי kiosk.server.token", orderId)
        }

        val job = Job(orderId, amount, timeout)
        synchronized(startLock) {
            val current = inflight
            if (current != null) {
                val code = if (current.orderId == orderId) "IN_PROGRESS" else "BUSY"
                return error(409, code, "יש חיוב פתוח על המכשיר", orderId, settled = false)
            }
            inflight = job
        }
        return try {
            execute(job)
        } catch (err: Exception) {
            clearInflight(job)
            error(500, "TAP_FAILED", err.message ?: "החיוב לא הושלם", orderId)
        }
    }

    fun cancel(orderId: String): ChargeResult {
        val job = inflight
        if (job == null || job.orderId != orderId) {
            val saved = remembered(orderId)
            if (saved != null) return ChargeResult(200, saved)
            return error(404, "NOT_FOUND", "אין חיוב פתוח להזמנה", orderId)
        }
        job.cancelled = true
        job.latch.countDown()
        if (usingMockSdk) job.thread?.interrupt()
        ui("cancelled", "ההמתנה בוטלה")
        return result(
            http = 200,
            status = "cancelled",
            settled = false,
            orderId = orderId,
            amount = job.amount,
            message = "ההמתנה בוטלה"
        )
    }

    fun status(orderId: String): ChargeResult {
        if (!orderId.matches(Regex("^[A-Za-z0-9_-]{1,64}$"))) {
            return error(400, "BAD_ORDER", "מזהה הזמנה חסר או לא תקין")
        }
        remembered(orderId)?.let { return ChargeResult(200, it) }
        val job = inflight
        if (job != null && job.orderId == orderId) {
            return result(200, "pending", false, orderId, job.amount, "ממתין להצמדת כרטיס", channel = "tap")
        }
        val remote = api?.order(orderId)
        if (remote != null && remote.optInt("_http") == 200 && remote.has("status")) {
            val mapped = fromServer(remote, orderId)
            remember(orderId, mapped)
            return ChargeResult(200, mapped)
        }
        return error(404, "NOT_FOUND", "ההזמנה לא נמצאה", orderId)
    }

    fun fallback(body: JSONObject): ChargeResult {
        if (!config.configured) return error(503, "UNCONFIGURED", "חסר kiosk.local.token")
        val orderId = body.optString("orderId").trim()
        if (!orderId.matches(Regex("^[A-Za-z0-9_-]{1,64}$"))) {
            return error(400, "BAD_ORDER", "מזהה הזמנה חסר או לא תקין")
        }
        val amount = parseAmount(body.opt("amount"))
            ?: return error(400, "BAD_AMOUNT", "סכום החיוב חייב להיות גדול מאפס", orderId)
        if (amount > BigDecimal("20000.00")) {
            return error(400, "AMOUNT_TOO_HIGH", "הסכום גבוה מהמותר", orderId)
        }
        val client = api ?: return error(503, "UNCONFIGURED", "דף תשלום דורש kiosk.server.token", orderId)
        ui("qr", "מכינים קישור תשלום")
        val opened = client.link(JSONObject().put("orderId", orderId).put("amount", amount.toPlainString()).put("payments", 1))
        val openedStatus = opened.optString("status")
        val usable = openedStatus == "approved" || openedStatus == "review" || (openedStatus == "pending" && opened.optString("url").isNotBlank())
        if (!usable) {
            return error(opened.optInt("_http", 400).let { if (it == 0) 502 else it }, opened.optString("error", "LINK_FAILED"), opened.optString("message", "יצירת דף התשלום נכשלה"), orderId)
        }
        val mapped = fromServer(opened, orderId).put("url", opened.optString("url")).put("lowProfileId", opened.optString("lowProfileId"))
        remember(orderId, mapped)
        ui("qr", "הציגו QR לתשלום")
        return ChargeResult(if (mapped.optString("status") == "approved") 200 else 200, mapped)
    }

    fun fallbackStatus(orderId: String): ChargeResult {
        if (!orderId.matches(Regex("^[A-Za-z0-9_-]{1,64}$"))) {
            return error(400, "BAD_ORDER", "מזהה הזמנה חסר או לא תקין")
        }
        val client = api ?: return status(orderId)
        val remote = client.linkStatus(orderId)
        if (remote.optInt("_http") == 404 || remote.optString("error") == "NOT_FOUND") {
            return error(404, "NOT_FOUND", "ההזמנה לא נמצאה", orderId)
        }
        if (remote.optString("status").isBlank()) {
            return error(remote.optInt("_http", 502), remote.optString("error", "OFFLINE"), remote.optString("message", "אין קשר לשרת"), orderId, settled = false)
        }
        val mapped = fromServer(remote, orderId)
        remember(orderId, mapped)
        if (mapped.optString("status") == "approved") ui("approved", mapped.optString("message"))
        return ChargeResult(200, mapped)
    }

    private fun execute(job: Job): ChargeResult {
        ui("tap", "הצמידו כרטיס\n₪ ${job.amount.toPlainString()}")
        val worker = Thread {
            var sdkResult: JSONObject? = null
            var errorText: String? = null
            try {
                sdkResult = readCard(job)
            } catch (err: Exception) {
                errorText = err.message ?: "TAP_FAILED"
            }
            synchronized(job) {
                if (job.abandoned) {
                    settleQuiet(job, sdkResult, errorText)
                    clearInflight(job)
                } else {
                    job.sdk = sdkResult
                    job.sdkError = errorText
                    job.ready = true
                    job.latch.countDown()
                }
            }
        }
        worker.name = "kiosk-sdk"
        job.thread = worker
        worker.start()
        job.latch.await(job.timeoutSec.toLong(), TimeUnit.SECONDS)
        synchronized(job) {
            if (job.ready) {
                val done = settle(job, job.sdk, job.sdkError)
                clearInflight(job)
                return done
            }
            job.abandoned = true
        }
        if (usingMockSdk) worker.interrupt()
        val status = if (job.cancelled) "cancelled" else "timeout"
        val message = if (job.cancelled) "ההמתנה בוטלה" else "תם הזמן. בדקו שוב לפני הנפקה."
        ui(status, message)
        val waiting = result(200, status, false, job.orderId, job.amount, message, channel = "tap")
        remember(job.orderId, waiting.body)
        return waiting
    }

    private fun readCard(job: Job): JSONObject {
        if (api == null) {
            val input = JSONObject()
                .put("type", "SALE")
                .put("amount", job.amount.toPlainString())
                .put("lang", "iw")
            if (stopped(job)) return JSONObject().put("event", "cancelled")
            return sdk.performTransaction(input, "mock-session")
        }
        val session = loadSession()
        val prep = prepare(job, session, force = false)
        if (prep.has("event")) return prep
        if (stopped(job)) return JSONObject().put("event", "cancelled")
        var sessionKey = session?.optString("sessionKey").orEmpty()
        val needsRegister = sessionKey.isBlank() || prep.optString("tpn").isNotBlank() && session == null
        if (needsRegister) {
            val registered = sdk.registerDevice(prep.getString("tpn"), prep.getString("merchantCode"))
            sessionKey = registered.optString("sessionKey", registered.optString("session_key"))
            if (sessionKey.isBlank()) throw IllegalStateException("REGISTER_FAILED")
            saveSession(prep, sessionKey)
        }
        if (stopped(job)) return JSONObject().put("event", "cancelled")
        var tapped = sdk.performTransaction(job.sdkRequest, sessionKey)
        if (tapped.optString("event") == "register_needed") {
            val again = prepare(job, null, force = true)
            if (again.has("event")) return again
            val registered = sdk.registerDevice(again.getString("tpn"), again.getString("merchantCode"))
            sessionKey = registered.optString("sessionKey", registered.optString("session_key"))
            if (sessionKey.isBlank()) throw IllegalStateException("REGISTER_FAILED")
            saveSession(again, sessionKey)
            if (stopped(job)) return JSONObject().put("event", "cancelled")
            tapped = sdk.performTransaction(job.sdkRequest, sessionKey)
        }
        return tapped
    }

    private fun prepare(job: Job, session: JSONObject?, force: Boolean): JSONObject {
        val body = JSONObject()
            .put("orderId", job.orderId)
            .put("amount", job.amount.toPlainString())
            .put("payments", 1)
            .put("deviceUuid", deviceUuid)
            .put("manufacturer", text(Build.MANUFACTURER))
            .put("model", text(Build.MODEL))
        if (!force && session != null) {
            body.put("sapakMutavNumber", session.optString("sapakMutavNumber"))
            val rav = session.opt("ravMutavTerminalNumber")
            if (rav != null && rav != JSONObject.NULL) body.put("ravMutavTerminalNumber", rav)
        }
        if (force) body.put("forceRegister", true)
        val prep = api?.prepare(body) ?: return JSONObject().put("event", "server")
        val prepStatus = prep.optString("status")
        if (prepStatus == "approved" || prepStatus == "review" || prep.optBoolean("alreadyPaid")) {
            job.early = fromServer(prep, job.orderId)
            return JSONObject().put("event", "early")
        }
        if (prep.optBoolean("ok") != true || !prep.has("sdkRequest")) {
            job.early = error(
                prep.optInt("_http", 400),
                prep.optString("error", "PREPARE_FAILED"),
                prep.optString("message", "הכנת המכשיר נכשלה"),
                job.orderId
            ).body
            return JSONObject().put("event", "early")
        }
        if (config.paymentsMode != "live" && !prep.optBoolean("mock", false)) {
            job.early = error(409, "SERVER_NOT_MOCK", "הטלפון במצב הדגמה והשרת לא. אין חיוב.", job.orderId).body
            return JSONObject().put("event", "early")
        }
        job.idempotencyKey = prep.optString("idempotencyKey")
        job.sdkRequest = when (val raw = prep.opt("sdkRequest")) {
            is JSONObject -> raw
            is String -> JSONObject(raw)
            else -> JSONObject()
        }
        job.rav = prep.opt("ravMutavTerminalNumber")?.toString().orEmpty()
        return prep
    }

    private fun settle(job: Job, sdkResult: JSONObject?, errorText: String?): ChargeResult {
        val done = settleQuiet(job, sdkResult, errorText)
        ui(done.optString("status"), done.optString("message"))
        return ChargeResult(200, done)
    }

    private fun settleQuiet(job: Job, sdkResult: JSONObject?, errorText: String?): JSONObject {
        job.early?.let {
            remember(job.orderId, it)
            return it
        }
        if (sdkResult == null) {
            val failed = result(200, "error", true, job.orderId, job.amount, errorText ?: "החיוב לא הושלם", channel = "tap", code = "TAP_FAILED").body
            remember(job.orderId, failed)
            return failed
        }
        val event = sdkResult.optString("event")
        if (event == "cancelled" || event == "register_needed") {
            val status = if (event == "cancelled") "cancelled" else "error"
            val message = if (event == "cancelled") "ההמתנה בוטלה" else "רישום המכשיר נכשל"
            val failed = result(200, status, true, job.orderId, job.amount, message, channel = "tap").body
            remember(job.orderId, failed)
            return failed
        }
        val payload = sdkPayload(sdkResult)
        val approved = payload.optString("response_code", sdkResult.optString("response_code")) == "00"
        if (api != null && job.idempotencyKey.isNotBlank()) {
            val envelope = JSONObject()
                .put("orderId", job.orderId)
                .put("idempotencyKey", job.idempotencyKey)
                .put("ravMutavTerminalNumber", job.rav)
                .put("sdkResponse", payload)
            if (approved) persistPending(envelope)
            val remote = api.complete(envelope)
            val mapped = fromServer(remote, job.orderId)
            if (mapped.optBoolean("settled", true) && mapped.optString("error") != "UNCONFIRMED") {
                prefs.edit().remove(PENDING).commit()
            }
            remember(job.orderId, mapped)
            return mapped
        }
        val local = if (approved) {
            result(
                200,
                "approved",
                true,
                job.orderId,
                job.amount,
                "הדגמה. לא נגבה כסף.",
                channel = "tap",
                deal = payload.optString("transaction_id", "mock-${job.amount.toPlainString()}"),
                approval = "00MOCK",
                mock = true
            ).body
        } else {
            result(200, "declined", true, job.orderId, job.amount, "הכרטיס נדחה", channel = "tap", mock = true).body
        }
        remember(job.orderId, local)
        return local
    }

    private fun recover() {
        val raw = prefs.getString(PENDING, null) ?: return
        Thread {
            ui("recover", "משלים חיוב קודם. אל תצמידו כרטיס.")
            try {
                val saved = JSONObject(raw)
                val remote = api?.complete(saved) ?: return@Thread
                val mapped = fromServer(remote, saved.optString("orderId"))
                if (mapped.optString("error") != "UNCONFIRMED") prefs.edit().remove(PENDING).commit()
                remember(saved.optString("orderId"), mapped)
                ui(mapped.optString("status"), mapped.optString("message"))
            } catch (_: Exception) {
                ui("error", "חיוב קודם לא הושלם. אל תצמידו שוב.")
            }
        }.start()
    }

    private fun fromServer(json: JSONObject, orderId: String): JSONObject {
        val status = json.optString("status").ifBlank { if (json.optBoolean("ok")) "approved" else "error" }
        val serverMock = if (json.has("mock")) json.optBoolean("mock") else config.paymentsMode != "live"
        val mock = BuildConfig.CARDCOM_TAP_MOCK || usingMockSdk || serverMock
        val settled = json.optBoolean("settled", status == "approved" || status == "declined" || status == "review")
        val ok = status == "approved"
        return JSONObject()
            .put("ok", ok)
            .put("status", status)
            .put("settled", settled)
            .put("channel", json.optString("channel"))
            .put("orderId", json.optString("orderId", orderId))
            .put("amount", json.opt("amount")?.let { parseAmount(it)?.toPlainString() } ?: "")
            .put("dealNumber", json.optString("dealNumber"))
            .put("approval", json.optString("approval"))
            .put("documentNumber", json.optString("documentNumber"))
            .put("documentUrl", json.optString("documentUrl"))
            .put("invoiceOk", json.optBoolean("invoiceOk") || json.optString("documentUrl").isNotBlank() || json.optString("documentNumber").isNotBlank())
            .put("url", json.optString("url"))
            .put("lowProfileId", json.optString("lowProfileId"))
            .put("mock", mock)
            .put("message", json.optString("message"))
            .put("error", json.optString("error"))
    }

    private fun result(
        http: Int,
        status: String,
        settled: Boolean,
        orderId: String,
        amount: BigDecimal?,
        message: String,
        channel: String = "",
        deal: String = "",
        approval: String = "",
        code: String = "",
        mock: Boolean? = null
    ): ChargeResult {
        val phoneMock = mock ?: (config.paymentsMode != "live" || BuildConfig.CARDCOM_TAP_MOCK || usingMockSdk)
        val body = JSONObject()
            .put("ok", status == "approved")
            .put("status", status)
            .put("settled", settled)
            .put("channel", channel)
            .put("orderId", orderId)
            .put("amount", amount?.toPlainString() ?: "")
            .put("dealNumber", deal)
            .put("approval", approval)
            .put("documentNumber", "")
            .put("documentUrl", "")
            .put("invoiceOk", false)
            .put("url", "")
            .put("lowProfileId", "")
            .put("mock", phoneMock)
            .put("message", message)
            .put("error", code)
        return ChargeResult(http, body)
    }

    private fun error(http: Int, code: String, message: String, orderId: String = "", settled: Boolean = true): ChargeResult {
        val body = result(http, "error", settled, orderId, null, message, code = code).body
        return ChargeResult(http, body)
    }

    private fun remember(orderId: String, body: JSONObject) {
        if (orderId.isBlank()) return
        synchronized(results) {
            results[orderId] = body
            while (results.size > 32) {
                val eldest = results.entries.firstOrNull()?.key ?: break
                results.remove(eldest)
            }
        }
    }

    private fun remembered(orderId: String): JSONObject? = synchronized(results) { results[orderId] }

    private fun clearInflight(job: Job) {
        synchronized(startLock) {
            if (inflight === job) inflight = null
        }
    }

    private fun stopped(job: Job) = job.cancelled || job.abandoned

    private fun timeoutSec(body: JSONObject): Int {
        val raw = body.opt("timeoutSec")
        val parsed = when (raw) {
            is Number -> raw.toInt()
            is String -> raw.toIntOrNull() ?: 60
            else -> 60
        }
        return parsed.coerceIn(15, 90)
    }

    private fun ui(phase: String, line: String) {
        onUi(phase, line)
    }

    private fun persistPending(envelope: JSONObject) {
        prefs.edit().putString(PENDING, envelope.toString()).commit()
    }

    private fun loadSession(): JSONObject? {
        val raw = prefs.getString(SESSION, null) ?: return null
        return runCatching { JSONObject(raw) }.getOrNull()
    }

    private fun saveSession(prep: JSONObject, sessionKey: String) {
        val session = JSONObject()
            .put("tpn", prep.optString("tpn"))
            .put("merchantCode", prep.optString("merchantCode"))
            .put("sapakMutavNumber", prep.optString("sapakMutavNumber"))
            .put("ravMutavTerminalNumber", prep.opt("ravMutavTerminalNumber") ?: "")
            .put("sessionKey", sessionKey)
        prefs.edit().putString(SESSION, session.toString()).commit()
    }

    private fun deviceUuid(): String {
        val androidId = Settings.Secure.getString(app.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"
        return UUID.nameUUIDFromBytes("resortos-kiosk-$androidId".toByteArray(StandardCharsets.UTF_8)).toString()
    }

    private fun sdkPayload(sdk: JSONObject): JSONObject {
        val text = sdk.optString("payload")
        val inner = if (text.startsWith("{")) runCatching { JSONObject(text) }.getOrNull() else null
        val out = inner ?: JSONObject()
        if (!out.has("response_code") && sdk.has("response_code")) out.put("response_code", sdk.optString("response_code"))
        return out
    }

    private fun text(value: String?) = value?.takeIf { it.isNotBlank() } ?: "unknown"

    private class Job(val orderId: String, val amount: BigDecimal, val timeoutSec: Int) {
        val latch = CountDownLatch(1)

        @Volatile var cancelled = false
        @Volatile var abandoned = false
        @Volatile var ready = false
        var sdk: JSONObject? = null
        var sdkError: String? = null
        var early: JSONObject? = null
        var thread: Thread? = null
        var idempotencyKey: String = ""
        var rav: String = ""
        var sdkRequest: JSONObject = JSONObject()
    }

    companion object {
        private const val SESSION = "session"
        private const val PENDING = "pending"
    }
}
