package expo.modules.cardcomtap

import android.content.Context
import android.nfc.NfcAdapter
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.lang.reflect.Proxy
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * CardcomTap native bridge.
 * Mock path is the default (CARDCOM_TAP_MOCK=true) until Cardcom's AAR is present
 * and the flag is turned off. The real path talks to the SDK by reflection because
 * the AAR is delivered only after the signing-cert SHA256 is registered.
 *
 * Expected SDK calls, from Cardcom's Tap guide:
 *   topService.registerDevice(tpn, merchantCode, listener)
 *   topService.performTransaction(inputObject, sessionKey, listener)
 */
class CardcomTapModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CardcomTap")

    Function("availability") {
      availability(appContext.reactContext)
    }

    AsyncFunction("registerDevice") { tpn: String, merchantCode: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction mapOf("ok" to false, "code" to "NO_CONTEXT")
      registerDevice(context, tpn, merchantCode)
    }

    AsyncFunction("performTransaction") { inputJson: String, sessionKey: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction mapOf("ok" to false, "code" to "NO_CONTEXT")
      performTransaction(context, inputJson, sessionKey)
    }
  }
}

private val SERVICE_CLASSES = listOf(
  "com.denovo.topliteapp.TopService",
  "com.denovo.app.toplite.TopService",
  "com.denovo.toplite.TopService"
)

fun availability(context: Context?): Map<String, Any?> {
  val adapter = context?.let { NfcAdapter.getDefaultAdapter(it) }
  return mapOf(
    "ok" to true,
    "platform" to "android",
    "supported" to true,
    "mock" to BuildConfig.CARDCOM_TAP_MOCK,
    "nfc" to (adapter != null),
    "nfcEnabled" to (adapter?.isEnabled == true),
    "minAndroid" to 33
  )
}

fun registerDevice(context: Context, tpn: String, merchantCode: String): Map<String, Any?> {
  if (tpn.isBlank() || merchantCode.isBlank()) {
    return mapOf("ok" to false, "code" to "PREPARE_FIELDS", "message" to "חסרים נתוני רישום")
  }
  if (BuildConfig.CARDCOM_TAP_MOCK) {
    return mapOf(
      "ok" to true,
      "mock" to true,
      "sessionKey" to "mock-session",
      "sessionDate" to System.currentTimeMillis(),
      "sessionExpireTime" to (System.currentTimeMillis() + 12 * 60 * 60 * 1000)
    )
  }
  return invokeSdk(context, "registerDevice", listOf(tpn, merchantCode), 45) { payload ->
    mapOf(
      "ok" to true,
      "mock" to false,
      "sessionKey" to stringField(payload, "session_key", "sessionKey"),
      "sessionDate" to (payload["session_date"] ?: payload["sessionDate"]),
      "sessionExpireTime" to (payload["session_expire_time"] ?: payload["sessionExpireTime"]),
      "raw" to payload
    )
  }
}

fun performTransaction(context: Context, inputJson: String, sessionKey: String): Map<String, Any?> {
  if (sessionKey.isBlank()) {
    return mapOf("ok" to false, "code" to "NO_SESSION", "message" to "אין רישום מכשיר")
  }
  if (BuildConfig.CARDCOM_TAP_MOCK) {
    val response = mapOf(
      "response_code" to "00",
      "status" to "APPROVED",
      "transaction_id" to "mock-${System.currentTimeMillis()}",
      "ApprovalNumber" to "123456",
      "UID" to "mock-uid",
      "message" to "אושר (הדגמה)"
    )
    return mapOf(
      "ok" to true,
      "mock" to true,
      "response_code" to "00",
      "raw" to response
    )
  }
  return invokeSdk(context, "performTransaction", listOf(inputJson, sessionKey), 120) { payload ->
    val code = stringField(payload, "response_code", "responseCode")
    mapOf(
      "ok" to (code == "00"),
      "mock" to false,
      "response_code" to code,
      "registerNeeded" to (payload["registerNeeded"] == true),
      "message" to stringField(payload, "message", "customMessage"),
      "raw" to payload
    )
  }
}

private fun invokeSdk(
  context: Context,
  methodName: String,
  args: List<Any>,
  timeoutSeconds: Long,
  onSuccess: (Map<String, Any?>) -> Map<String, Any?>
): Map<String, Any?> {
  return try {
    val service = loadService(context)
    val latch = CountDownLatch(1)
    var result: Map<String, Any?> = mapOf("ok" to false, "code" to "SDK_TIMEOUT", "message" to "ה-SDK לא ענה")
    val started = callWithListener(service, methodName, args, { payload ->
      result = onSuccess(payload)
      latch.countDown()
    }, { code, message ->
      result = mapOf(
        "ok" to false,
        "code" to code,
        "message" to message,
        "registerNeeded" to (code == "REGISTER_NEEDED")
      )
      latch.countDown()
    })
    if (!started) {
      return mapOf(
        "ok" to false,
        "code" to "SDK_METHOD_MISSING",
        "message" to "הפעולה $methodName לא נמצאה ב-AAR. עדכנו את שמות המחלקות ב-CardcomTapModule.kt"
      )
    }
    latch.await(timeoutSeconds, TimeUnit.SECONDS)
    result
  } catch (err: Exception) {
    mapOf("ok" to false, "code" to "SDK_NOT_LINKED", "message" to (err.message ?: "SDK"))
  }
}

private fun loadService(context: Context): Any {
  var last: Exception? = null
  for (name in SERVICE_CLASSES) {
    try {
      val clazz = Class.forName(name)
      val withContext = clazz.constructors.firstOrNull {
        it.parameterTypes.size == 1 && Context::class.java.isAssignableFrom(it.parameterTypes[0])
      }
      if (withContext != null) return withContext.newInstance(context)
      val noArg = clazz.constructors.firstOrNull { it.parameterTypes.isEmpty() }
      if (noArg != null) return noArg.newInstance()
      val getInstance = clazz.methods.firstOrNull { it.name == "getInstance" }
      if (getInstance != null) {
        return if (getInstance.parameterTypes.isEmpty()) getInstance.invoke(null) else getInstance.invoke(null, context)
      }
    } catch (err: Exception) {
      last = err
    }
  }
  throw IllegalStateException(last?.message ?: "SDK_CLASS_NOT_FOUND")
}

private fun callWithListener(
  target: Any,
  methodName: String,
  args: List<Any>,
  onSuccess: (Map<String, Any?>) -> Unit,
  onError: (String, String) -> Unit
): Boolean {
  val method = target.javaClass.methods.firstOrNull {
    it.name == methodName && it.parameterTypes.size == args.size + 1 && it.parameterTypes.last().isInterface
  } ?: return false
  val listenerType = method.parameterTypes.last()
  val listener = Proxy.newProxyInstance(listenerType.classLoader, arrayOf(listenerType)) { _, called, calledArgs ->
    val event = called.name
    when {
      event.contains("Success", true) || event.contains("TransactionResponse", true) -> {
        onSuccess(payloadToMap(calledArgs?.firstOrNull()))
      }
      event.contains("RegisterNeeded", true) -> onError("REGISTER_NEEDED", "onRegisterNeeded")
      event.contains("Error", true) -> onError(codeFrom(calledArgs), messageFrom(calledArgs))
    }
    null
  }
  val input = adaptInput(method.parameterTypes[0], args[0])
  if (methodName == "performTransaction" && args.size > 1) {
    method.invoke(target, input, args[1], listener)
  } else {
    method.invoke(target, *args.toTypedArray(), listener)
  }
  return true
}

private fun adaptInput(type: Class<*>, value: Any): Any {
  if (type.isAssignableFrom(value.javaClass)) return value
  if (JSONObject::class.java.isAssignableFrom(type) && value is String) return JSONObject(value)
  if (type == String::class.java) return value.toString()
  val fromJson = type.methods.firstOrNull { it.name == "fromJson" && java.lang.reflect.Modifier.isStatic(it.modifiers) }
  if (fromJson != null && value is String) return fromJson.invoke(null, value)
  return value
}

private fun payloadToMap(payload: Any?): Map<String, Any?> {
  if (payload == null) return emptyMap()
  if (payload is Map<*, *>) return payload.entries.associate { it.key.toString() to normalize(it.value) }
  if (payload is JSONObject) return jsonToMap(payload)
  if (payload is String) {
    return try {
      jsonToMap(JSONObject(payload))
    } catch (_: Exception) {
      mapOf("raw" to payload)
    }
  }
  val out = linkedMapOf<String, Any?>()
  payload.javaClass.methods
    .filter { it.parameterTypes.isEmpty() && it.name.startsWith("get") && it.name != "getClass" }
    .forEach { method ->
      try {
        val key = method.name.removePrefix("get").replaceFirstChar { it.lowercase() }
        out[key] = normalize(method.invoke(payload))
      } catch (_: Exception) {
      }
    }
  if (out.isEmpty()) out["raw"] = payload.toString()
  return out
}

private fun jsonToMap(json: JSONObject): Map<String, Any?> {
  val out = linkedMapOf<String, Any?>()
  val keys = json.keys()
  while (keys.hasNext()) {
    val key = keys.next()
    out[key] = normalize(json.opt(key))
  }
  return out
}

private fun normalize(value: Any?): Any? {
  return when (value) {
    null, JSONObject.NULL -> null
    is JSONObject -> jsonToMap(value)
    is JSONArray -> (0 until value.length()).map { normalize(value.opt(it)) }
    else -> value
  }
}

private fun stringField(payload: Map<String, Any?>, vararg keys: String): String {
  for (key in keys) {
    val value = payload[key]
    if (value != null && value.toString().isNotBlank()) return value.toString()
  }
  return ""
}

private fun codeFrom(args: Array<Any>?): String {
  val first = args?.firstOrNull()
  return when (first) {
    is String -> first
    is Number -> first.toString()
    else -> "SDK_ERROR"
  }
}

private fun messageFrom(args: Array<Any>?): String {
  val texts = args?.mapNotNull { it as? String }.orEmpty()
  return texts.lastOrNull() ?: "שגיאת SDK"
}
