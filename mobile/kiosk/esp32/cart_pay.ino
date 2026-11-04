// Coffee-cart client for the ResortOS kiosk phone.
// Arduino-ESP32 (HTTPClient). The same HTTP contract works from ESP-IDF esp_http_client.
//
// This file is a reference. It is not built by the ResortOS firmware.
// Put the phone's LAN address and kiosk.local.token here locally. Do not commit a real token.
// Do not put CARDCOM_API_NAME or CARDCOM_API_PASSWORD on the ESP.

#include <WiFi.h>
#include <HTTPClient.h>

static const char *KIOSK_HOST = "192.168.4.20";
static const uint16_t KIOSK_PORT = 8765;
// Same value as kiosk.local.token on the phone. 16+ random characters.
static const char *KIOSK_LOCAL_TOKEN = "CHANGE_ME_LOCAL_TOKEN";

static String kioskUrl(const String &path) {
  return String("http://") + KIOSK_HOST + ":" + String(KIOSK_PORT) + path;
}

static bool jsonTrue(const String &body, const char *key) {
  String needle = String("\"") + key + "\":";
  int at = body.indexOf(needle);
  if (at < 0) return false;
  at += needle.length();
  while (at < (int)body.length() && body.charAt(at) == ' ') at++;
  return body.startsWith("true", at);
}

static String jsonText(const String &body, const char *key) {
  String needle = String("\"") + key + "\":\"";
  int at = body.indexOf(needle);
  if (at < 0) return "";
  at += needle.length();
  int end = body.indexOf('"', at);
  if (end < 0) return "";
  return body.substring(at, end);
}

// Dispense the drink only when this is true.
// mock:true (or a missing mock flag) means no money moved.
static bool cartMayDispense(const String &body) {
  if (!jsonTrue(body, "ok")) return false;
  if (jsonText(body, "status") != "approved") return false;
  if (!jsonTrue(body, "settled")) return false;
  // A missing mock flag is treated as a demo. Only an explicit false may dispense.
  if (body.indexOf("\"mock\":") < 0) return false;
  if (jsonTrue(body, "mock")) return false;
  return true;
}

static String kioskRequest(const char *method, const String &path, const String &json, uint32_t timeoutMs) {
  HTTPClient http;
  http.begin(kioskUrl(path));
  http.setTimeout(timeoutMs);
  http.addHeader("Authorization", String("Bearer ") + KIOSK_LOCAL_TOKEN);
  http.addHeader("Content-Type", "application/json");
  int code = http.sendRequest(method, json);
  String body = code > 0 ? http.getString() : String("{\"ok\":false,\"status\":\"error\",\"settled\":true,\"error\":\"OFFLINE\"}");
  http.end();
  return body;
}

// Blocks until the phone returns. timeoutSec is the reader's wait (15..90).
// Give HTTP a little longer than that. On timeout or cancel, poll once more:
// the reader may still approve after the first response.
static String cartPay(const char *orderId, const char *amount, int timeoutSec) {
  String body = String("{\"orderId\":\"") + orderId + "\",\"amount\":\"" + amount + "\",\"timeoutSec\":" + String(timeoutSec) + "}";
  uint32_t httpTimeout = (uint32_t)(timeoutSec + 20) * 1000U;
  String first = kioskRequest("POST", "/v1/charges", body, httpTimeout);
  String status = jsonText(first, "status");
  if (status == "timeout" || status == "cancelled" || !jsonTrue(first, "settled")) {
    delay(2000);
    String again = kioskRequest("GET", String("/v1/charges/") + orderId, "", 10000);
    if (jsonText(again, "status").length()) return again;
  }
  return first;
}

// Call from a second task while cartPay is blocked. Uses its own HTTPClient.
static void cartCancel(const char *orderId) {
  kioskRequest("POST", String("/v1/charges/") + orderId + "/cancel", "{}", 10000);
}

// NFC fallback: show `url` as a QR on the LVGL screen. Poll until approved,
// declined, review, or the cart's own deadline. documentUrl, when present,
// is the receipt QR.
static String cartPayQr(const char *orderId, const char *amount) {
  String body = String("{\"orderId\":\"") + orderId + "\",\"amount\":\"" + amount + "\"}";
  String opened = kioskRequest("POST", "/v1/fallback", body, 20000);
  String url = jsonText(opened, "url");
  if (!url.length()) return opened;
  // drawQr(url);  // the panel already has an LVGL QR widget
  for (int i = 0; i < 40; i++) {
    delay(3000);
    String status = kioskRequest("GET", String("/v1/fallback/") + orderId, "", 10000);
    String name = jsonText(status, "status");
    if (name == "approved" || name == "declined" || name == "review") return status;
  }
  return opened;
}

void setup() {
  Serial.begin(115200);
  // WiFi is assumed up on the cart AP. Example only:
  // WiFi.begin(ssid, pass);
  // while (WiFi.status() != WL_CONNECTED) delay(200);
}

void loop() {
  // One order id per cup. Reusing an approved id does not charge again.
  // String result = cartPay("cart-1001", "18.50", 60);
  // if (cartMayDispense(result)) { /* relay on */ }
  // String receipt = jsonText(result, "documentUrl");
  delay(1000);
}
