package il.resortos.kiosk

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/** Tiny HTTP/1.1 listener. Bearer token is kiosk.local.token. Not Cardcom's password. */
class ChargeHttpServer(
    private val port: Int,
    private val token: String,
    private val coordinator: ChargeCoordinator
) {
    private var socket: ServerSocket? = null

    fun start() {
        val server = ServerSocket()
        server.reuseAddress = true
        server.bind(InetSocketAddress("0.0.0.0", port))
        socket = server
        thread(isDaemon = true, name = "kiosk-http") {
            while (!server.isClosed) {
                val client = try {
                    server.accept()
                } catch (_: Exception) {
                    break
                }
                thread(isDaemon = true, name = "kiosk-http-conn") {
                    try {
                        handle(client)
                    } catch (_: Exception) {
                        runCatching { write(client, 400, "Bad Request", error("BAD_REQUEST", "בקשה לא תקינה")) }
                    } finally {
                        runCatching { client.close() }
                    }
                }
            }
        }
    }

    fun stop() {
        runCatching { socket?.close() }
    }

    private fun handle(client: Socket) {
        client.soTimeout = 20_000
        val request = readRequest(client) ?: run {
            write(client, 400, "Bad Request", error("BAD_REQUEST", "בקשה לא תקינה"))
            return
        }
        val path = request.path.substringBefore('?').trimEnd('/').ifBlank { "/" }
        if (request.method == "GET" && path == "/v1/health") {
            write(client, 200, "OK", coordinator.health())
            return
        }
        if (token.length < 16 || !constantTimeEquals(bearerToken(request.headers["authorization"]), token)) {
            write(client, 401, "Unauthorized", error("UNAUTHORIZED", "חסר אישור"))
            return
        }
        client.soTimeout = 0
        val result = route(request.method, path, request.body)
        val reason = when (result.http) {
            200 -> "OK"
            400 -> "Bad Request"
            401 -> "Unauthorized"
            404 -> "Not Found"
            409 -> "Conflict"
            503 -> "Unavailable"
            else -> "Error"
        }
        write(client, result.http, reason, result.body)
    }

    private fun route(method: String, path: String, body: String): ChargeResult {
        val json = if (body.isBlank()) JSONObject() else runCatching { JSONObject(body) }.getOrElse {
            return ChargeResult(400, error("BAD_JSON", "JSON לא תקין"))
        }
        if (method == "POST" && path == "/v1/charges") return coordinator.charge(json)
        if (method == "POST" && path == "/v1/basalt/spend") return coordinator.basaltSpend(json)
        if (method == "POST" && path == "/v1/basalt/refund") return coordinator.basaltRefund(json)
        if (method == "POST" && path == "/v1/fallback") return coordinator.fallback(json)
        val charge = Regex("^/v1/charges/([^/]+)$").matchEntire(path)
        if (method == "GET" && charge != null) return coordinator.status(decode(charge.groupValues[1]))
        val cancel = Regex("^/v1/charges/([^/]+)/cancel$").matchEntire(path)
        if (method == "POST" && cancel != null) return coordinator.cancel(decode(cancel.groupValues[1]))
        val fallback = Regex("^/v1/fallback/([^/]+)$").matchEntire(path)
        if (method == "GET" && fallback != null) return coordinator.fallbackStatus(decode(fallback.groupValues[1]))
        return ChargeResult(404, error("NOT_FOUND", "נתיב לא קיים"))
    }

    private fun readRequest(client: Socket): RawRequest? {
        val input = client.getInputStream()
        val header = ByteArrayOutputStream()
        var seen = 0
        while (seen < 4 || !endsWithHeader(header)) {
            val next = input.read()
            if (next < 0) return null
            header.write(next)
            seen += 1
            if (header.size() > 8192) return null
        }
        val text = header.toString(Charsets.UTF_8)
        val lines = text.split("\r\n")
        val first = lines.firstOrNull()?.split(" ") ?: return null
        if (first.size < 2) return null
        val headers = mutableMapOf<String, String>()
        for (line in lines.drop(1)) {
            if (line.isBlank()) continue
            val colon = line.indexOf(':')
            if (colon <= 0) continue
            headers[line.substring(0, colon).trim().lowercase()] = line.substring(colon + 1).trim()
        }
        val length = headers["content-length"]?.toIntOrNull() ?: 0
        if (length < 0 || length > 4096) return null
        val payload = ByteArray(length)
        var off = 0
        while (off < length) {
            val n = input.read(payload, off, length - off)
            if (n < 0) break
            off += n
        }
        return RawRequest(first[0].uppercase(), first[1], headers, payload.toString(Charsets.UTF_8))
    }

    private fun endsWithHeader(header: ByteArrayOutputStream): Boolean {
        val bytes = header.toByteArray()
        val n = bytes.size
        return n >= 4 && bytes[n - 4] == '\r'.code.toByte() && bytes[n - 3] == '\n'.code.toByte()
            && bytes[n - 2] == '\r'.code.toByte() && bytes[n - 1] == '\n'.code.toByte()
    }

    private fun write(client: Socket, status: Int, reason: String, json: JSONObject) {
        val bytes = json.toString().toByteArray(Charsets.UTF_8)
        val head = "HTTP/1.1 $status $reason\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n"
        val out = client.getOutputStream()
        out.write(head.toByteArray(Charsets.ISO_8859_1))
        out.write(bytes)
        out.flush()
    }

    private fun decode(value: String) = java.net.URLDecoder.decode(value, "UTF-8")

    private fun error(code: String, message: String) = JSONObject()
        .put("ok", false)
        .put("status", "error")
        .put("settled", true)
        .put("error", code)
        .put("message", message)

    private data class RawRequest(
        val method: String,
        val path: String,
        val headers: Map<String, String>,
        val body: String
    )
}
