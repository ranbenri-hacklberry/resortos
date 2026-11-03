package il.resortos.cardcom

import android.content.Context
import org.json.JSONObject
import java.lang.reflect.Proxy
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * The only surface the rest of the app uses. [MockCardcomTapSdk] ships until Cardcom
 * delivers the AAR. [ReflectiveCardcomTapSdk] is the placeholder for that AAR:
 * replace it with typed calls once `jar tf` shows the real class names.
 * Keep the decisions in the mock aligned with functions/lib/cardcomTapCore.js
 * (`mockSdkTransaction`): session "expired" asks to register again, amount 0.13 declines.
 */
interface CardcomTapSdk {
  fun registerDevice(tpn: String, merchantCode: String): JSONObject
  fun performTransaction(input: JSONObject, sessionKey: String): JSONObject
}

class MockCardcomTapSdk : CardcomTapSdk {
  override fun registerDevice(tpn: String, merchantCode: String): JSONObject {
    Thread.sleep(350)
    return JSONObject()
      .put("event", "success")
      .put("sessionKey", "mock-session")
      .put("session_key", "mock-session")
      .put("session_expire_time", System.currentTimeMillis() + 24 * 60 * 60 * 1000)
      .put("message", "")
  }

  override fun performTransaction(input: JSONObject, sessionKey: String): JSONObject {
    Thread.sleep(700)
    if (sessionKey.isBlank() || sessionKey == "expired") {
      return JSONObject()
        .put("event", "register_needed")
        .put("message", "צריך לרשום את המכשיר מחדש")
    }
    val amount = input.optString("amount", "")
    if (amount == "0.13") {
      val payload = JSONObject().put("response_code", "05").put("message", "נדחה")
      return JSONObject()
        .put("event", "success")
        .put("response_code", "05")
        .put("message", "הכרטיס נדחה")
        .put("payload", payload.toString())
    }
    val payload = JSONObject()
      .put("response_code", "00")
      .put("transaction_id", "mock-$amount")
      .put("ApprovalNumber", "00MOCK")
      .put("status", "APPROVED")
    return JSONObject()
      .put("event", "success")
      .put("response_code", "00")
      .put("transaction_id", payload.getString("transaction_id"))
      .put("approval_number", "00MOCK")
      .put("message", "")
      .put("payload", payload.toString())
  }
}

class ReflectiveCardcomTapSdk(private val context: Context) : CardcomTapSdk {
  override fun registerDevice(tpn: String, merchantCode: String): JSONObject {
    val service = newService()
    val listenerType = findClass(
      "com.denovo.toplite.RegisterListener",
      "com.denovo.toplite.RegistrationListener",
      "com.denovo.app.top.RegisterListener"
    ) ?: throw IllegalStateException("CARDCOM_SDK_LISTENER_NOT_FOUND")
    val out = JSONObject()
    val latch = CountDownLatch(1)
    val failure = AtomicReference<String>()
    val listener = Proxy.newProxyInstance(listenerType.classLoader, arrayOf(listenerType)) { _, method, args ->
      when (method.name) {
        "onRegisterSuccess" -> {
          out.put("event", "success")
          out.put("sessionKey", args?.getOrNull(0)?.toString() ?: "")
          out.put("session_key", args?.getOrNull(0)?.toString() ?: "")
          if ((args?.size ?: 0) > 2) out.put("session_expire_time", args?.get(2)?.toString() ?: "")
          latch.countDown()
        }
        "onRegisterError" -> {
          failure.set(args?.getOrNull(1)?.toString() ?: args?.getOrNull(0)?.toString() ?: "REGISTER_FAILED")
          latch.countDown()
        }
        else -> Unit
      }
      null
    }
    invoke(service, "registerDevice", tpn, merchantCode, listener)
    if (!latch.await(90, TimeUnit.SECONDS)) throw IllegalStateException("REGISTER_TIMEOUT")
    failure.get()?.let { throw IllegalStateException(it) }
    return out
  }

  override fun performTransaction(input: JSONObject, sessionKey: String): JSONObject {
    val service = newService()
    val listenerType = findClass(
      "com.denovo.toplite.TransactionListener",
      "com.denovo.app.top.TransactionListener"
    ) ?: throw IllegalStateException("CARDCOM_SDK_LISTENER_NOT_FOUND")
    val out = JSONObject()
    val latch = CountDownLatch(1)
    val failure = AtomicReference<String>()
    val listener = Proxy.newProxyInstance(listenerType.classLoader, arrayOf(listenerType)) { _, method, args ->
      when (method.name) {
        "onTransactionResponse" -> {
          val payload = args?.getOrNull(0)?.toString() ?: "{}"
          out.put("event", "success")
          out.put("payload", payload)
          val parsed = runCatching { JSONObject(payload) }.getOrNull()
          out.put("response_code", parsed?.optString("response_code") ?: "")
          latch.countDown()
        }
        "onTransactionError" -> {
          failure.set(args?.getOrNull(1)?.toString() ?: "TAP_FAILED")
          latch.countDown()
        }
        "onRegisterNeeded" -> {
          out.put("event", "register_needed")
          latch.countDown()
        }
        else -> Unit
      }
      null
    }
    val register = service.javaClass.methods.firstOrNull { it.name == "performTransaction" }
      ?: throw IllegalStateException("CARDCOM_SDK_METHOD_NOT_FOUND")
    // The AAR documents performTransaction(inputObject, sessionKey, listener).
    // inputObject's concrete type is confirmed when the AAR arrives; we pass the JSON
    // if the parameter is a String, otherwise a best-effort map via the JSON text.
    val inputArg: Any = if (register.parameterTypes.getOrNull(0) == String::class.java) {
      input.toString()
    } else {
      input.toString()
    }
    register.invoke(service, inputArg, sessionKey, listener)
    if (!latch.await(120, TimeUnit.SECONDS)) throw IllegalStateException("TAP_TIMEOUT")
    if (out.optString("event") == "register_needed") return out
    failure.get()?.let { throw IllegalStateException(it) }
    return out
  }

  private fun newService(): Any {
    val type = findClass(
      "com.denovo.toplite.TopService",
      "com.denovo.toplite.ToPService",
      "com.denovo.app.top.TopService"
    ) ?: throw IllegalStateException(
      "CARDCOM_SDK_CLASS_NOT_FOUND. Drop the AAR in android/app/libs and update ReflectiveCardcomTapSdk with the class names from jar tf."
    )
    val ctor = type.constructors.firstOrNull { it.parameterTypes.size == 1 }
      ?: type.constructors.firstOrNull { it.parameterTypes.isEmpty() }
      ?: throw IllegalStateException("CARDCOM_SDK_CONSTRUCTOR_NOT_FOUND")
    return if (ctor.parameterTypes.isEmpty()) ctor.newInstance() else ctor.newInstance(context)
  }

  private fun invoke(target: Any, name: String, vararg args: Any?) {
    val method = target.javaClass.methods.firstOrNull { it.name == name && it.parameterTypes.size == args.size }
      ?: throw IllegalStateException("CARDCOM_SDK_METHOD_NOT_FOUND:$name")
    method.invoke(target, *args)
  }

  private fun findClass(vararg names: String): Class<*>? {
    for (name in names) {
      try {
        return Class.forName(name)
      } catch (_: ClassNotFoundException) {
        continue
      }
    }
    return null
  }
}
