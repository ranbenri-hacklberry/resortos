# Coffee-cart kiosk

A separate Android app (`il.resortos.kiosk`) for an unattended coffee cart. The Mialis desk app (`il.resortos.app`) is unchanged. The cart's ESP32 asks this phone for a charge. The phone opens Cardcom Tap on Phone. Cardcom's API name and password stay on the server.

This is a prototype. It has not been installed on a handset and it has not taken a live card payment. See [Verified and untested](#verified-and-untested).

## What the Mialis app does today

Tap on Phone is an Android AAR, `com.denovo:topliteapp-PROD`, expected file `Cardcom-3.0.5.3-Release_Prod.aar` (version **3.0.5.3**). The AAR is not in git. `mobile/native-src/android/CardcomTapSdk.kt` is the only call site:

| Method | Role |
| --- | --- |
| `registerDevice(tpn, merchantCode)` | After the server's `PrepareDevice`. Returns `sessionKey`. |
| `performTransaction(inputJson, sessionKey)` | Starts the reader. Listener `onTransactionResponse` / `onTransactionError` / `onRegisterNeeded`. |

Until the AAR is dropped in `mobile/android/app/libs/`, the desk build sets `CARDCOM_TAP_MOCK` and uses `MockCardcomTapSdk`. The reflective class tries `com.denovo.toplite.TopService` (and two other packages). Those class names are not confirmed against the AAR. Register waits up to 90 seconds. The tap waits up to 120 seconds. There is no cancel or abort method in this adapter.

The React Native module is `CardcomTap` (`isAvailable`, `deviceProfile`, `registerDevice`, `performTransaction`). The screen that calls it is `ChargeScreen.onTap`, and only after the button **חיוב בכרטיס**.

These open the charge form and prefill it. They do **not** start a reader:

- the dashboard card button
- `window.ResortOSNative.openCharge({ booking, amount, payments })` inside the WebView
- `resortos://charge?booking=&amount=&payments=`
- `https://resortos.app/app/charge?booking=&amount=&payments=`

`runTapCharge` in `functions/lib/cardcomTapFlow.js` is the sequence:

1. `POST /api/payments/cardcom/quote` with `amount` (shekels), `payments`, `bookingId`, `channel: "tap"`, `idempotencyKey`.
2. Native `deviceProfile` (Android ID hashed to a UUID, manufacturer, model, NFC).
3. If no saved session: `POST /api/payments/cardcom/prepare`. The server calls `TapTransactions/PrepareDevice` and returns `tpn`, `merchantCode`, `sapakMutavNumber`, `ravMutavTerminalNumber`. The phone then calls `registerDevice`.
4. `buildSdkSaleInput` sends `type: "SALE"`, `amount` as a two-decimal string, and `CustomObject` (one payment is `CreditType` 1).
5. `performTransaction`. `response_code` `"00"` is approval. Anything else, including `"05"`, is a decline and is not sent to capture.
6. `POST /api/payments/cardcom/process` calls `TapTransactions/ProcessSDKTransaction`. Success is `ResponseCode` 0 and `DealNumber`.
7. `POST /api/payments/cardcom/invoice` calls `Documents/CreateDocument` (`TaxInvoiceAndReceipt`, `DealNumbers`). Success is `DocumentNumber` and `DocumentUrl`.

A lost capture reply is retried once with the same idempotency key and the same SDK payload. The card is not tapped again.

Amounts in this flow are shekels. Booking totals elsewhere in ResortOS are agorot. The desk refuses a tap above **₪300** (`TAP_PHYSICAL_LIMIT_ILS`) and any charge above **₪20,000** (`WALK_IN_MAX_ILS`) before the reader opens. Those caps are in our code. Nothing in the SDK wrapper enforces them. Above ₪300 the desk offers a Low Profile link instead.

There is no operator PIN, no CDCVM step, and no "staff must confirm" flag in the app. The only human step is the charge button. The repo does not say Tap on Phone may run with nobody present. Android 13+ and a working NFC radio are required for a non-mock tap. The desk README already lists PIN/CDCVM on Android 13+ as an open question for Cardcom.

Config names the desk already uses (values stay out of the app and out of git):

| Name | Where |
| --- | --- |
| `CARDCOM_API_NAME` | Cloudflare only |
| `CARDCOM_API_PASSWORD` | Cloudflare only |
| `CARDCOM_TERMINAL` | Cloudflare only |
| `CARDCOM_MOCK` | Cloudflare. `1` skips the Cardcom network |
| `CARDCOM_KV` or `CHECKOUT_KV` | Idempotency |
| Dashboard bearer | Phone session. Not a Cardcom secret |

`TPN`, `MerchantCode`, and `sessionKey` are returned at runtime and stored on the phone (`AsyncStorage` key `resortos.tap.session`). They are not env vars.

## Architecture

```
ESP32  --HTTP :8765, Bearer kiosk.local.token-->  il.resortos.kiosk
                                                      |  NFC Tap on Phone
                                                      |  HTTPS Bearer CARDCOM_KIOSK_TOKEN
                                                      v
                                              resortos.app /api/payments/kiosk/*
                                                      |  CARDCOM_API_NAME
                                                      |  CARDCOM_API_PASSWORD
                                                      v
                                              secure.cardcom.solutions
```

The ESP never calls Cardcom and never sees `CARDCOM_API_PASSWORD`. The phone never sees it either. The phone holds two tokens: one shared with the ESP (`kiosk.local.token`) and one shared with Cloudflare (`kiosk.server.token` = `CARDCOM_KIOSK_TOKEN`).

If the reader cannot be used, the phone asks the server for a Cardcom Low Profile page. The ESP shows that URL as a QR code. Cardcom's webhook hits `/api/payments/kiosk/webhook`. The server believes the payment only after `LowProfile/GetLpResult` says it is paid and the amount matches the order. A matching amount is then invoiced with the same `Documents/CreateDocument` helper as a tap.

The kiosk screen has no pay button. A charge starts from the LAN request, or from an explicit intent that also carries `kiosk.local.token`:

```bash
adb shell am start -n il.resortos.kiosk/.KioskActivity \
  -a il.resortos.kiosk.action.CHARGE \
  --es orderId cart-demo1 --es amount 12.50 --es token "$KIOSK_LOCAL_TOKEN"
```

The activity is full screen, keeps the screen on, swallows back, and calls `startLockTask()`. Unattended lock (no system dialog) needs device owner on a handset with no accounts:

```bash
adb shell dpm set-device-owner il.resortos.kiosk/.KioskAdminReceiver
```

Without device owner, Android may ask once to pin the app. Leave lock task with `adb shell am task lock stop`.

## Config names

Phone file `kiosk.properties` (see `config.example.properties`). Copy it to the app's external files dir. Do not commit it.

```bash
adb push kiosk.properties /sdcard/Android/data/il.resortos.kiosk/files/kiosk.properties
```

| Phone key | Server env | Who knows it |
| --- | --- | --- |
| `kiosk.local.token` | — | ESP and the phone. 16+ characters |
| `kiosk.server.token` | `CARDCOM_KIOSK_TOKEN` | Phone and Cloudflare. 16+ characters. Not the Cardcom password |
| `kiosk.api.base` | — | Phone. Default `https://resortos.app`. Debug builds also allow `http://` |
| `kiosk.listen.port` | — | Default `8765` |
| `kiosk.payments.mode` | — | `mock` (default) or `live` |
| — | `KIOSK_PUBLIC_ORIGIN` | Optional https origin for the webhook and the done page. Default `https://resortos.app` |
| — | `KIOSK_LINK_MAX_ILS` | Optional QR cap. Default 300. Values outside 1…20000 fall back to 300 |
| — | `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`, `CARDCOM_TERMINAL` | Server only. Already used by the desk |
| — | `CARDCOM_MOCK`, `CARDCOM_KV` or `CHECKOUT_KV` | Server only |

`live` on the phone refuses to charge unless two things are true: the AAR is in `mobile/kiosk/android/app/libs/` (so `CARDCOM_TAP_MOCK` is false) and `kiosk.server.token` is set. `mock` on the phone will not send a fake SDK payload to a server that is not in `CARDCOM_MOCK`.

Tap attempts are one payment. The ₪300 physical cap is the same desk constant. A second payment count is rejected.

Set the server token before deploy. With it missing or shorter than 16 characters, `/api/payments/kiosk/*` returns 503 and does not call Cardcom. The webhook and the done page are the exceptions: they have no bearer, and they only mark an order we already created, after GetLpResult.

```bash
npx wrangler pages secret put CARDCOM_KIOSK_TOKEN --project-name resortos
```

## API contract (ESP → phone)

Base URL `http://<phone>:8765`. Header `Authorization: Bearer <kiosk.local.token>` on every route except health.

`amount` is shekels. Send it as a string with one or two decimals (`"18.50"`) so it does not pass through a binary float. `orderId` is 1–64 characters of `A-Za-z0-9_-`. Use a new id per cup. Repeating an approved id returns the same result and does not open the reader.

### `GET /v1/health`

No token. `configured: false` means the properties file is missing. `mock` here means the phone itself is not in live mode with a real AAR. The charge response is the flag the cart should trust.

### `POST /v1/charges`

Blocks until the reader finishes, the ESP cancels, or the wait ends.

```json
{ "amount": "18.50", "orderId": "cart-1001", "timeoutSec": 60 }
```

`timeoutSec` is clamped to 15…90. Default 60. The ESP HTTP client should wait about `timeoutSec + 20` seconds.

```json
{
  "ok": true,
  "status": "approved",
  "settled": true,
  "channel": "tap",
  "orderId": "cart-1001",
  "amount": "18.50",
  "dealNumber": "4242",
  "approval": "445566",
  "documentNumber": "D1",
  "documentUrl": "https://…",
  "invoiceOk": true,
  "url": "",
  "lowProfileId": "",
  "mock": false,
  "message": "החיוב נקלט",
  "error": ""
}
```

`status` is `approved`, `declined`, `cancelled`, `timeout`, `pending`, `review`, or `error`.

`dealNumber` is Cardcom's id (`DealNumber` for a tap, `TranzactionId` for a Low Profile page). `documentUrl` is the invoice link when CreateDocument succeeded. The ESP can show that URL as a receipt QR. If `invoiceOk` is false the payment can still be approved.

### Dispense rule

Pour the drink only when all of these are true:

- `ok` is true
- `status` is `approved`
- `settled` is true
- `mock` is present and false

`review` means money may have moved and a person should look. Do not pour and do not retry that order id. `timeout` and `cancelled` with `settled: false` mean the reader might still be running. `GET /v1/charges/{orderId}` a couple of seconds later can flip to `approved`. Do not start a second charge for the same id in that window.

### `POST /v1/charges/{orderId}/cancel`

Another connection, while the charge POST is blocked. Cancel does not ask the Cardcom SDK to abort. This repo's adapter has no abort call. The POST returns `cancelled` / `settled: false`. If the customer already tapped and the SDK later returns `00`, the phone still captures and the GET becomes `approved`.

### `GET /v1/charges/{orderId}`

Last result, or the server's copy after the phone reboots.

### `POST /v1/fallback`

```json
{ "amount": "18.50", "orderId": "cart-1001" }
```

Response `status: "pending"` includes `url` and `lowProfileId`. Show `url` as a QR. The customer's phone pays on Cardcom's page.

### `GET /v1/fallback/{orderId}`

Poll until `approved`, `declined`, or `review`. Same dispense rule. `documentUrl` is the receipt when the invoice was created.

HTTP 401 is a bad local token. 409 means the phone is already in a charge (`BUSY` or `IN_PROGRESS`). 400 is a bad amount or order id. 503 means the phone or the server is not configured.

Mock amounts, phone only, when no real AAR is in the charge: `0.13` declines, `0.99` waits 15 seconds so cancel can be tried, anything else approves as a demo (`mock: true`). Do not pour.

## Server routes

Called by the phone, except the webhook and the done page.

| Route | Auth |
| --- | --- |
| `POST /api/payments/kiosk/prepare` | `CARDCOM_KIOSK_TOKEN` |
| `POST /api/payments/kiosk/complete` | same |
| `POST /api/payments/kiosk/link` | same |
| `POST /api/payments/kiosk/link-status` | same |
| `GET /api/payments/kiosk/orders?orderId=` | same |
| `POST /api/payments/kiosk/webhook` | none. Confirms with GetLpResult |
| `GET /api/payments/kiosk/done` | none. Short Hebrew page for the customer's browser |

`prepare` returns the SDK sale JSON plus, on first registration, `tpn` and `merchantCode`. Those are not returned on `GET orders`. A crashed phone writes the SDK payload to private prefs and calls `complete` on the next boot instead of opening the reader again.

Low Profile is `Operation: ChargeOnly`. `WebHookUrl` is the kiosk webhook, not the stay webhook. `ReturnValue` is the order id. The hosted page does not create the tax document; after a confirmed payment the server calls `Documents/CreateDocument`, same as a tap. If that call fails, the order is still approved and `invoiceOk` is false.

## Build the phone app

From `mobile/kiosk/android`, with the Android SDK installed (`local.properties` `sdk.dir`, not committed):

```bash
./gradlew assembleDebug
```

The debug APK is a mock until an AAR is placed in `app/libs/`. A live APK has to be finalized with Cardcom's `finalizer` the same way as the desk app (`mobile/scripts/finalize-apk.sh`). Cardcom must register this package's signing SHA-256. It is not the Mialis certificate.

`mobile/kiosk/esp32/cart_pay.ino` is the ESP32 Arduino reference. It is not part of the existing resort firmware.

## Verified and untested

Verified with `node --test functions/lib/kioskCart.test.js` (and the existing `functions/lib/cardcomTap.test.js` still passes):

- kiosk routes reject a missing token, a short token, and the kiosk token is not a dashboard session
- a tap prepare builds the same SDK sale as the desk, capture runs once, the invoice URL comes back, a repeat does not capture again
- the public JSON does not contain `CARDCOM_API_PASSWORD`, the test PAN, or `TPN`
- a decline does not call `ProcessSDKTransaction`
- ₪301 is refused before `PrepareDevice`
- a Low Profile create points `WebHookUrl` at `/api/payments/kiosk/webhook` and leaves `ApiPassword` on the outbound Cardcom call only
- GetLpResult must say paid, the Low Profile id must be the one we stored, and a different amount becomes `review` instead of `approved`
- the mock webhook marks the order paid and the done page does not echo the token

Not verified:

- installing the APK, lock task, NFC, or a charge on a handset
- the real `topliteapp` 3.0.5.3 AAR, including whether `performTransaction` can start with no button on screen
- a live `PrepareDevice` / `ProcessSDKTransaction` / `CreateDocument` / Low Profile round trip
- Cardcom actually calling the webhook
- the ESP32 sketch on hardware

`./gradlew assembleDebug` completed for the mock build (no AAR in `app/libs`). That checks that the kiosk module compiles. It does not check Tap on Phone.

## Open questions for Cardcom

1. Is Tap on Phone allowed with no staff present (a dedicated handset next to a cart)?
2. Can `performTransaction` be started by the app with no operator tap on a button, and does the SDK require a visible activity the whole time?
3. What is the unattended amount cap, and when does the handset demand a PIN or CDCVM? The desk app blocks physical taps above ₪300 on its own. That number is not from an SDK constant in this repo.
4. Is there an abort/cancel call? The adapter here cannot stop a reader that has already opened. Cancel only stops waiting.
5. Any rule that developer options, a lock-task kiosk, or a non-interactive screen will make the tap fail?
6. Does this terminal's five-device cap count the cart handset separately from the desk phones, and how should `DeviceUUID` be minted for it? The kiosk uses `UUID` over `resortos-kiosk-` plus Android ID.
7. What `session_expire_time` means, and when to call `PrepareDevice` again.
8. Whether resubmitting the same `ProcessSDKTransaction` after a timeout can double-capture. The desk, and this prototype, resubmit that payload at most once and do not tap again.
9. Whether `Documents/CreateDocument` with `TaxInvoiceAndReceipt` and `DealNumbers` works for a Tap `DealNumber` and for a Low Profile `TranzactionId`, with product text `עגלת קפה` and `UnitCost` gross.
10. Whether the same `CARDCOM_TERMINAL` may open Low Profile `ChargeOnly` pages and receive webhooks, not only Tap.
11. Delivery of `finalizer`, `release.fin`, and ProGuard rules for a second application id, and whether the Denovo Maven bucket is required in addition to the AAR.
12. The webhook body field names. We accept `LowProfileId` and `ReturnValue` / `Order`, then we call GetLpResult ourselves.
