# ResortOS mobile

Hebrew, RTL staff app for Mialis. It keeps the web dashboard as the screen staff already use, and adds a native Charge screen for card payments.

## Architecture

The dashboard (`dashboard.html` → `DashboardApp`) is still changing, and its data and login already live behind `/api/dashboard/*` on Cloudflare Pages. Supabase is reached only by the Worker, never by the browser. Rewriting that UI in React Native would fork it on day one.

The app is therefore an Expo prebuild / dev-client shell:

- **Dashboard** — a WebView of `https://resortos.app/dashboard`. The site stays the source of truth. The shell injects `window.ResortOSNative.charge()` and copies the existing dashboard session (`resortos_dashboard_token_v1`) into the native charge flow.
- **Charge** — a native screen. Android calls the `CardcomTap` Kotlin module. iOS hides Tap and offers a Cardcom payment link or manual card entry through the server.
- **Worker** — `functions/api/payments/cardcom/[[path]].js`. `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`, and `CARDCOM_TERMINAL` exist only as Pages secrets.

Expo Go cannot load this native module. The debug APK is a standalone build: it embeds the JavaScript and does not open the Expo dev launcher. `CARDCOM_TAP_MOCK` stays on until the AAR is installed.

Cardcom Tap is Android-only (Android 13+, NFC). Physical cards are limited to ₪300. A terminal allows 5 devices. The Worker enforces the amount and the device cap.

## What the phone does vs what the server does

1. `POST /api/payments/cardcom/reserve` checks the amount against the booking.
2. `POST /api/payments/cardcom/prepare` calls Cardcom `PrepareDevice`.
3. The phone calls `registerDevice(tpn, merchantCode)` and keeps `session_key`.
4. The phone calls `performTransaction`. Success is SDK `response_code` `00`.
5. `POST /api/payments/cardcom/process` calls `ProcessSDKTransaction` once. Success is Cardcom `ResponseCode` 0. The `DealNumber` is stored and the payment is written on the booking (`clearing_payments`, source `CARDCOM_TAP`).
6. `POST /api/payments/cardcom/invoice` issues a tax invoice and receipt with `Documents/CreateDocument` and `DealNumbers`.

A timeout after the tap does **not** call `ProcessSDKTransaction` again and does **not** ask the guest to tap again. The retry searches `GetTransactions` and then records the same deal. The idempotency key is generated on the phone and never put in `TransactionUniqueIdForQuery` (the Tap spec says to leave that empty).

Deep links:

- `resortos://charge?booking=<id>&amount=<n>&payments=<n>`
- `https://resortos.app/charge?booking=<id>&amount=<n>&payments=<n>`

Only those three fields are accepted. The server checks the amount against the booking balance again.

## Build a debug APK

Requirements: Node 22, JDK 21, Android SDK 37 (compile/target), build-tools 35 or newer. minSdk is 33 (Android 13).

```bash
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
cd mobile
npm install
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleDebug
```

The APK is `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

`CARDCOM_TAP_MOCK=true` is the default in `android/gradle.properties`. The debug APK runs the mock Tap module, so it builds before Cardcom sends the AAR. JS is bundled into the APK (`debuggableVariants` is empty), so the Charge screen and the WebView shell start without a Metro packager. The dashboard itself still loads from `https://resortos.app/dashboard` (`extra.dashboardUrl` overrides that page if you point `extra.apiBase` at another host).

Mock builds show חיוב בנגיעה even when the phone has no NFC, because the tap is simulated. A real AAR build still requires NFC.

To exercise Charge before the Worker is deployed, run the local mock (no Cardcom credentials, same idempotency rules):

```bash
node mobile/scripts/mock-payments-server.mjs
adb reverse tcp:8788 tcp:8788
```

Then set `extra.apiBase` to `http://127.0.0.1:8788` and `extra.dashboardUrl` to `https://resortos.app/dashboard`, rebuild the debug APK, and sign in on the Charge screen with `max` / `demo`. The committed app keeps `https://resortos.app`.

Day-to-day native development rebuilds the APK (the debug build does not look for Metro):

```bash
cd mobile
npx expo run:android
```

iOS (on a Mac): `npx expo run:ios`. Tap stays hidden there.

## SHA256 for Cardcom

Cardcom builds the AAR only after they have the SHA256 of the cert that signs the APK you will distribute.

Debug cert (for a development AAR):

```bash
mobile/scripts/print-sha256.sh
# or, after the first debug build:
keytool -list -v \
  -alias androiddebugkey \
  -keystore mobile/android/app/debug.keystore \
  -storepass android \
  -keypass android
```

If Gradle used the machine debug keystore instead:

```bash
keytool -list -v -alias androiddebugkey -keystore "$HOME/.android/debug.keystore" -storepass android
```

Send Cardcom the `SHA256:` line under Certificate fingerprints.

Play Store builds must use the **App signing** SHA256 from Play Console (Release → App signing), not the upload key, if Play re-signs the app. Manual sideload uses the keystore you sign with below.

Release keystore:

```bash
keytool -genkeypair -v -keystore release.keystore -alias resortos \
  -keyalg RSA -keysize 2048 -validity 10000
mobile/scripts/print-sha256.sh release.keystore resortos
```

Do not commit keystores. `*.keystore` and `*.jks` are gitignored.

## Where to put the AAR

Cardcom's package is private. Expected artifact: `com.denovo:topliteapp-PROD:3.0.5.3`, file name similar to `topliteapp-PROD-3.0.5.3.aar` or `Cardcom-<version>-Release_Prod.aar`.

Drop the file in either:

- `mobile/vendor/cardcom/*.aar` (preferred)
- `mobile/android/app/libs/*.aar`

Then set the flag off and rebuild:

```properties
# mobile/android/gradle.properties
CARDCOM_TAP_MOCK=false
```

The module compiles the real calls only as reflection until the AAR's class names are confirmed. If registration returns `SDK_CLASS_NOT_FOUND` or `SDK_METHOD_MISSING`, open the AAR (`unzip -l the.aar`) and update `SERVICE_CLASSES` in `mobile/modules/cardcom-tap/android/src/main/java/expo/modules/cardcomtap/CardcomTapModule.kt`. The JS/Kotlin boundary stays `availability`, `registerDevice(tpn, merchantCode)`, and `performTransaction(inputJson, sessionKey)`.

Also copy Cardcom's `proguard-rules.pro` over the `# cardcom-tap` block in `mobile/android/app/proguard-rules.pro`. The repo already keeps `com.denovo.**` and `com.cardcom.**`.

Their Maven bucket `s3://denovo-android.s3.amazonaws.com/prod` is optional. Credentials come from Cardcom. The file dependency is enough.

## Finalizing every release APK

Tap will not run on an APK that skipped Finalization. Debug mocks do not need it. Every APK that links the real AAR does.

`mobile/scripts/finalize-apk.sh` runs the three steps from Cardcom's guide. Put these in one directory first:

- the built APK
- `keystore.jks` (or the release keystore)
- `release.fin` and the `finalizer` binary from Cardcom's `AppFinalizationFolder.zip`

```bash
mobile/scripts/finalize-apk.sh \
  --apk mobile/android/app/build/outputs/apk/release/app-release.apk \
  --fin /path/to/release.fin \
  --finalizer /path/to/finalizer \
  --keystore /path/to/keystore.jks \
  --ks-pass "$KEYSTORE_PASSWORD"
```

That is:

1. `finalizer -i APK -f release.fin -o <dir>`
2. `zipalign -p -v 4 <unaligned> <aligned>`
3. `apksigner sign --ks keystore.jks ...`

Distribute only `*-aligned-signed.apk`. Repeat for every new APK.

## Worker secrets

From the repo root, on the Pages project `resortos`:

```bash
npx wrangler pages secret put CARDCOM_API_NAME --project-name resortos
npx wrangler pages secret put CARDCOM_API_PASSWORD --project-name resortos
npx wrangler pages secret put CARDCOM_TERMINAL --project-name resortos
```

Leave `CARDCOM_TAP_MOCK` unset in production once the secrets are real. If it is unset and the three secrets exist, the Worker calls Cardcom. Set `CARDCOM_TAP_MOCK=1` to force the mock while testing against production Pages.

```bash
npx wrangler pages secret put CARDCOM_TAP_MOCK --project-name resortos
```

The app never sees these values. It sends the dashboard bearer token (`Authorization: Bearer`) from `/api/dashboard/login` or `/api/dashboard/otp/verify`.

Endpoints:

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/payments/cardcom/booking?id=` | Balance check for the deep link |
| POST | `/api/payments/cardcom/reserve` | Lock amount + idempotency key |
| POST | `/api/payments/cardcom/prepare` | `PrepareDevice` |
| POST | `/api/payments/cardcom/process` | `ProcessSDKTransaction`, then record the booking |
| POST | `/api/payments/cardcom/invoice` | `Documents/CreateDocument` for the `DealNumber` |
| POST | `/api/payments/cardcom/link` | Low Profile page for iOS / no-NFC |
| POST | `/api/payments/cardcom/link-status` | Record the link payment once |
| POST | `/api/payments/cardcom/manual` | Card typed on the phone, charged on the server |

Tests: `node --test functions/lib/cardcomTap.test.js`

## Android App Links

`public/.well-known/assetlinks.json` is a placeholder. Replace `sha256_cert_fingerprints` with the same SHA256 you send Cardcom (colon-separated bytes). Package name: `il.mialis.resortos`. Until that matches, `resortos://charge?...` still opens the app. `https://resortos.app/charge` opens it only after verification.

iOS universal links need an Apple Team ID in `apple-app-site-association`. That file is not published yet. See open questions.

## Open questions for Cardcom

The Tap guide (updated 2026-10-25) and the CreateDocument article were used. These points are still unconfirmed:

1. **`session_expire_time`** — absolute timestamp or a duration? The app stores it and re-registers when the SDK returns `onRegisterNeeded`. It does not guess an expiry formula.
2. **`SdkRequest` / `SdkResponse` shape** — the guide shows them as strings and also says not to invent a flat JSON structure. We send JSON strings of the original request and the full SDK response. Confirm string vs object, and the listener payload nesting (`transactionResult`, `DE48`, `customMessage`).
3. **Resubmit of `ProcessSDKTransaction`** — the guide says a timeout is not proof the charge failed, and it does not define idempotency. We never resubmit. We search `GetTransactions` by amount and recent time, then record. Confirm that search is the supported recovery, and the time zone of `FromDate` / `ToDate`.
4. **Refunds** — `REFUND` exists on the SDK request builder and is not in the staff UI. Need the original-deal rules and limits before exposing it.
5. **Installments** — staff "number of payments" uses `CreditType` 8 (regular installments). `CreditType` 6 is credit. Confirm that is the product they want. Remainder agorot is added to the first payment. Confirm rounding.
6. **₪300** — applied to Tap sales only. Confirm whether wallets can go higher, and whether PIN is required above some amount.
7. **`DeviceUUID`** — we generate one UUID per install and store it on the device. Confirm that survives reinstall policy, and how a dead phone is removed from the 5-device cap. `GetDevices` is not called yet.
8. **Manual card field names** — server charge uses `Transactions/Transaction` with `CardNumber`, `CardExpirationMMYY`, `CVV2`, `NumOfPayments`, `CreditType`, `ExternalUniqTranId`. Confirm before production manual entry. The PAN is not stored and is not returned to the phone (last 4 only).
9. **Invoice** — implemented as `POST /api/v11/Documents/CreateDocument` with `DocumentTypeToCreate: TaxInvoiceAndReceipt` and `DealNumbers: [{ DealNumber }]`, from the public "document associated with a deal" article. Confirm document type, VAT (`IsVatFree: false`), and whether the SMS module should send the receipt. Webhooks are not part of the Tap spec and are not used.
10. **AAR class names and Play signing** — confirm the `TopService` package inside the delivered AAR, the finalizer binary, and whether production distribution is sideload or Play (which SHA256 they registered).
11. **iOS** — Tap does not exist. Confirm Low Profile is the approved substitute, and send the Apple Team ID if universal links should be added.
