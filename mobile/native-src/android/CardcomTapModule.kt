package il.resortos.cardcom

import android.nfc.NfcAdapter
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import il.resortos.app.BuildConfig
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.util.UUID

/**
 * Native module name: CardcomTap.
 * The JS bridge always talks to this class. The Cardcom AAR stays behind [CardcomTapSdk].
 */
class CardcomTapModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CardcomTap"

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(available())
  }

  @ReactMethod
  fun deviceProfile(promise: Promise) {
    promise.resolve(profile())
  }

  @ReactMethod
  fun registerDevice(tpn: String, merchantCode: String, promise: Promise) {
    Thread {
      try {
        val result = sdk().registerDevice(tpn, merchantCode)
        promise.resolve(jsonToMap(result))
      } catch (error: Throwable) {
        promise.reject("REGISTER_FAILED", error.message, error)
      }
    }.start()
  }

  @ReactMethod
  fun performTransaction(inputJson: String, sessionKey: String, promise: Promise) {
    Thread {
      try {
        val input = JSONObject(inputJson)
        val result = sdk().performTransaction(input, sessionKey)
        promise.resolve(jsonToMap(result))
      } catch (error: Throwable) {
        promise.reject("TAP_FAILED", error.message, error)
      }
    }.start()
  }

  private fun available(): Boolean {
    if (BuildConfig.CARDCOM_TAP_MOCK) return true
    return Build.VERSION.SDK_INT >= 33 && hasNfc()
  }

  private fun profile(): com.facebook.react.bridge.WritableMap {
    val androidId = Settings.Secure.getString(reactContext.contentResolver, Settings.Secure.ANDROID_ID)
      ?: "unknown"
    val uuid = UUID.nameUUIDFromBytes("resortos-tap-$androidId".toByteArray(StandardCharsets.UTF_8)).toString()
    val adapter = NfcAdapter.getDefaultAdapter(reactContext)
    return Arguments.createMap().apply {
      putString("deviceUuid", uuid)
      putString("manufacturer", Build.MANUFACTURER ?: "")
      putString("model", Build.MODEL ?: "")
      putInt("sdk", Build.VERSION.SDK_INT)
      putBoolean("android13", Build.VERSION.SDK_INT >= 33)
      putBoolean("nfc", hasNfc())
      putBoolean("nfcEnabled", adapter?.isEnabled == true)
      putBoolean("mock", BuildConfig.CARDCOM_TAP_MOCK)
    }
  }

  private fun hasNfc(): Boolean {
    return reactContext.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_NFC)
  }

  private fun sdk(): CardcomTapSdk {
    return if (BuildConfig.CARDCOM_TAP_MOCK) {
      MockCardcomTapSdk()
    } else {
      ReflectiveCardcomTapSdk(reactContext)
    }
  }

  private fun jsonToMap(json: JSONObject): com.facebook.react.bridge.WritableMap {
    val map = Arguments.createMap()
    val keys = json.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      when (val value = json.opt(key)) {
        is Boolean -> map.putBoolean(key, value)
        is Int -> map.putInt(key, value)
        is Long -> map.putDouble(key, value.toDouble())
        is Double -> map.putDouble(key, value)
        is String -> map.putString(key, value)
        null, JSONObject.NULL -> map.putNull(key)
        else -> map.putString(key, value.toString())
      }
    }
    return map
  }
}
