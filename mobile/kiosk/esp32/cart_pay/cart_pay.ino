// Coffee-cart client for the ResortOS kiosk phone, plus an optional Jura UART pour.
// Arduino-ESP32 3.x (HTTPClient + HardwareSerial). ESP32-S3 and ESP32-P4.
//
// Reference sketch. Not part of the resort firmware.
// Put the phone's LAN address and kiosk.local.token here locally. Do not commit a real token.
// Do not put CARDCOM_API_NAME or CARDCOM_API_PASSWORD on the ESP.
//
// Jura flags (pass as compiler.cpp.extra_flags, e.g. -DJURA_ENABLED=1):
//   JURA_ENABLED   default 0. 0 never opens the service UART and never brews.
//   JURA_DRY_RUN   default 1. Logs the FA: line and does not write it.
//                  Bring-up TY: is still sent when JURA_BRINGUP is 1.
//   JURA_BRINGUP   default 0. setup() sends TY: and prints the reply on USB Serial.
//   JURA_DRINK     default 1. Product button 1..6, used only after the pour gate.
//
// S3 pins: RX 18, TX 17 (GPIO 19/20 are USB D-/D+). P4 pins below are placeholders.
// 5V Jura UART -> level shifter -> 3.3V. See the Jura X8 section in mobile/kiosk/README.md.

#include <WiFi.h>
#include <HTTPClient.h>

#include "jura_uart.h"

#ifndef JURA_ENABLED
#define JURA_ENABLED 0
#endif
#ifndef JURA_DRY_RUN
#define JURA_DRY_RUN 1
#endif
#ifndef JURA_BRINGUP
#define JURA_BRINGUP 0
#endif
#ifndef JURA_DRINK
#define JURA_DRINK 1
#endif

static_assert(JURA_DRINK >= 1 && JURA_DRINK <= 6, "JURA_DRINK must be 1..6");

#if defined(CONFIG_IDF_TARGET_ESP32P4) || defined(ARDUINO_ESP32P4)
// Placeholder until the P4 module pinout is confirmed. Do not wire from this guess.
static const int JURA_RX_PIN = 5;
static const int JURA_TX_PIN = 4;
#else
static const int JURA_RX_PIN = 18;
static const int JURA_TX_PIN = 17;
#endif

#if JURA_ENABLED
static JuraUart jura(Serial1, JURA_RX_PIN, JURA_TX_PIN);
#endif

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

// Dispense only when this is true.
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

// Brew only after the pour gate. Every other payment result returns without
// touching FA:. A failed brew after a real approval means the money already
// moved: do not charge that orderId again.
// Dry-run logs the FA: line and returns true so a bench build is not treated
// as a failed payment. JURA_ENABLED=0 logs and returns false.
static bool cartBrewIfPaid(const String &payment, int drink) {
  if (!cartMayDispense(payment)) {
    Serial.println("jura: payment gate closed, not brewing");
    return false;
  }
  if (drink < 1 || drink > 6) {
    Serial.println("jura: drink index must be 1..6, not brewing");
    return false;
  }
#if !JURA_ENABLED
  Serial.println("jura: JURA_ENABLED=0, not brewing");
  return false;
#elif JURA_DRY_RUN
  Serial.printf("jura: dry-run brewProduct(%d) FA:%02X\n", drink, 3 + drink);
  return true;
#else
  bool started = jura.brewProduct(drink);
  if (started) {
    Serial.printf("jura: brewProduct(%d) started\n", drink);
  } else {
    Serial.printf("jura: brewProduct(%d) failed after payment; do not charge this order again\n", drink);
  }
  return started;
#endif
}

// Charge, then brew only when cartMayDispense is true.
static String cartPayAndBrew(const char *orderId, const char *amount, int timeoutSec, int drink) {
  String result = cartPay(orderId, amount, timeoutSec);
  cartBrewIfPaid(result, drink);
  return result;
}

static void juraBringUp() {
#if JURA_ENABLED && JURA_BRINGUP
  String reply;
  bool got = jura.command("TY:", reply, 2000);
  Serial.print("jura bring-up TY: ");
  if (got) {
    Serial.println(reply);
  } else if (reply.length()) {
    Serial.print("(incomplete) ");
    Serial.println(reply);
  } else {
    Serial.println("(timeout)");
  }
#elif JURA_BRINGUP
  Serial.println("jura bring-up skipped (JURA_ENABLED=0)");
#endif
}

void setup() {
  Serial.begin(115200);
#if JURA_ENABLED
  jura.begin();
#endif
  juraBringUp();
}

void loop() {
  // Reference only. Uncomment to charge one cup, then brew drink JURA_DRINK
  // when the pour gate passes. cartPayAndBrew never brews otherwise.
  // String result = cartPayAndBrew("cart-1001", "18.50", 60, JURA_DRINK);
  // String receipt = jsonText(result, "documentUrl");
  //
  // QR fallback uses the same gate:
  // String result = cartPayQr("cart-1001", "18.50");
  // cartBrewIfPaid(result, JURA_DRINK);
  //
  // cartCancel("cart-1001");  // second task, while cartPay is blocked
  (void)cartPayAndBrew;
  (void)cartPayQr;
  (void)cartCancel;
  delay(1000);
}
