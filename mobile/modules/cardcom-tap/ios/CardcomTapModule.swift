import ExpoModulesCore

public class CardcomTapModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CardcomTap")

    Function("availability") { () -> [String: Any] in
      return [
        "ok": true,
        "platform": "ios",
        "supported": false,
        "mock": false,
        "nfc": false,
        "nfcEnabled": false
      ]
    }

    AsyncFunction("registerDevice") { (_: String, _: String) -> [String: Any] in
      return ["ok": false, "code": "TAP_ANDROID_ONLY", "supported": false]
    }

    AsyncFunction("performTransaction") { (_: String, _: String) -> [String: Any] in
      return ["ok": false, "code": "TAP_ANDROID_ONLY", "supported": false]
    }
  }
}
