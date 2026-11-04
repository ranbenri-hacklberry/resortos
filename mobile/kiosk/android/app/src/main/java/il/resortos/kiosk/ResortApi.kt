package il.resortos.kiosk

import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Calls ResortOS. The Cardcom password never leaves the server. */
class ResortApi(private val base: String, private val token: String) {
    fun prepare(body: JSONObject): JSONObject = post("/api/payments/kiosk/prepare", body)
    fun complete(body: JSONObject): JSONObject = post("/api/payments/kiosk/complete", body)
    fun link(body: JSONObject): JSONObject = post("/api/payments/kiosk/link", body)

    fun order(orderId: String): JSONObject {
        val url = "$base/api/payments/kiosk/orders?orderId=${URLEncoder.encode(orderId, "UTF-8")}"
        return request("GET", url, null)
    }

    fun linkStatus(orderId: String): JSONObject {
        return post("/api/payments/kiosk/link-status", JSONObject().put("orderId", orderId))
    }

    fun basaltWallet(body: JSONObject): JSONObject = post("/api/payments/kiosk/basalt/wallets", body)
    fun basaltTopup(body: JSONObject): JSONObject = post("/api/payments/kiosk/basalt/topup", body)
    fun basaltPrepare(body: JSONObject): JSONObject = post("/api/payments/kiosk/basalt/tap/prepare", body)
    fun basaltComplete(body: JSONObject): JSONObject = post("/api/payments/kiosk/basalt/tap/complete", body)
    fun basaltSpend(body: JSONObject): JSONObject = post("/api/payments/kiosk/basalt/spend", body)
    fun basaltRefund(body: JSONObject): JSONObject = post("/api/payments/kiosk/basalt/refund", body)

    fun basaltBalance(phone: String): JSONObject {
        val url = "$base/api/payments/kiosk/basalt/balance?phone=${URLEncoder.encode(phone, "UTF-8")}"
        return request("GET", url, null)
    }

    private fun post(path: String, body: JSONObject): JSONObject {
        return request("POST", base + path, body.toString())
    }

    private fun request(method: String, url: String, json: String?): JSONObject {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 30_000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Authorization", "Bearer $token")
            if (json != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            if (json != null) {
                OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(json) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            val body = if (text.startsWith("{")) JSONObject(text) else JSONObject()
            if (!body.has("ok") && status !in 200..299) {
                body.put("ok", false)
                body.put("error", body.optString("error", "HTTP_$status"))
                body.put("message", body.optString("message", "השרת לא אישר את הפעולה"))
            }
            body.put("_http", status)
            return body
        } catch (_: Exception) {
            return JSONObject()
                .put("ok", false)
                .put("error", "OFFLINE")
                .put("message", "אין קשר לשרת התשלומים")
        } finally {
            connection.disconnect()
        }
    }
}
