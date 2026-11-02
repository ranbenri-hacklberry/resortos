# ResortOS mobile

Hebrew, right-to-left app for the Mialis front desk. The dashboard is the same page the browser already serves. Card payments that need the phone's NFC run in a native screen.

Expo Go cannot load the Tap module. Install a build made with `expo prebuild` (a development build, not Expo Go).

## Why this shape

The dashboard (`src/components/dashboard/DashboardApp.jsx`) is a React page the owner is still changing. It signs in through `/api/dashboard/*` and reads operations and finance from the Pages functions. A second native copy of that screen would drift the week it shipped.

Cardcom Tap on Phone is an Android AAR (`com.denovo:topliteapp-PROD`). It cannot run inside a browser or on iOS. So the app is:

- a React Native shell
- a WebView on the live dashboard, with a small JS bridge (`window.ResortOSNative.openCharge`)
- a native Charge screen
- an Android module named `CardcomTap` that hides the SDK behind one Kotlin interface
- a mock of that SDK until Cardcom sends the AAR
- Pages functions under `/api/payments/cardcom/*` that hold `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`, and `CARDCOM_TERMINAL`

The web dashboard and the Pages project are unchanged apart from new payment routes and a static fallback page for the charge link.

## Build a debug APK

From `mobile/`:

```bash
npm install
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleDebug
```

The debug APK bundles its JavaScript, so it opens without Metro. Payments default to mock mode: the button runs the Tap flow, but no card is charged.

```bash
PAYMENTS_MODE=live npx expo prebuild --platform android --no-install
```

`live` calls `https://resortos.app` (override with `API_BASE` and `DASHBOARD_URL`). The phone must already be signed in on the dashboard tab. The WebView copies the dashboard session token and sends it to the payment routes. Secrets never go into the app.

iOS, on a Mac:

```bash
npx expo prebuild --platform ios
npx expo run:ios
```

There is no Tap on iOS. The Charge screen offers a payment link or manual card entry. Both go through the server.

## SHA256 for Cardcom

Cardcom builds the AAR only after they register the signing certificate SHA256. For a local debug build:

```bash
mobile/scripts/signing-sha256.sh
```

Debug certificate from this project's `android/app/debug.keystore` (alias `androiddebugkey`):

```
SHA256: FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

That fingerprint is only for the debug APK. Production builds and Play App Signing use a different certificate. Put the fingerprint you will actually ship into `public/.well-known/assetlinks.json`.

The Expo debug keystore lives at `mobile/android/app/debug.keystore`, not only in the home directory. The script checks `~/.android/debug.keystore` first; pass the app keystore when that is the one you built with:

```bash
mobile/scripts/signing-sha256.sh mobile/android/app/debug.keystore androiddebugkey android
```

```bash
mobile/scripts/signing-sha256.sh /path/to/release.keystore your-alias
```

It will prompt via keytool's store password argument; pass the password as the third argument only on a trusted machine. For Play App Signing, send the SHA-256 from Play Console (App signing), not the upload key, if that is the certificate on the phones.

Put the fingerprint in `public/.well-known/assetlinks.json` before relying on `https://resortos.app/app/charge` links. The app scheme `resortos://charge` does not need the fingerprint.

## Where the AAR goes

```
mobile/android/app/libs/*.aar
```

See `mobile/android/app/libs/README.md`. Any AAR in that folder flips `CARDCOM_TAP_MOCK` off and uses `ReflectiveCardcomTapSdk`. The class names inside the AAR are not published; after `jar tf` on the file, update `mobile/native-src/android/CardcomTapSdk.kt` if the reflective lookup misses. Then run prebuild again so the plugin copies the Kotlin into `android/`.

Force the mock even if an AAR is present:

```bash
cd mobile/android && ./gradlew assembleDebug -PcardcomTapMock
```

The mock matches `mockSdkTransaction` in `functions/lib/cardcomTapCore.js`: amount `0.13` declines, a session key of `expired` asks the app to register again.

## Finalizing a real APK

Every APK that includes the real SDK has to be finalized, zip-aligned, and signed, in that order. Cardcom sends `AppFinalizationFolder.zip` with `finalizer` and `release.fin`. The debug mock APK does not need this.

```bash
export CARDCOM_KEYSTORE_PASSWORD='...'
mobile/scripts/finalize-apk.sh app-release.apk /path/to/release.fin /path/to/keystore.jks
```

Distribute only `finalizedApkFolder/<name>_aligned_signed.apk`.

Also merge the ProGuard rules Cardcom ships before a minified release build.

## Worker secrets

The app never sees these. Set them on the Cloudflare Pages project `resortos`:

```bash
npx wrangler pages secret put CARDCOM_API_NAME --project-name resortos
npx wrangler pages secret put CARDCOM_API_PASSWORD --project-name resortos
npx wrangler pages secret put CARDCOM_TERMINAL --project-name resortos
```

Bind a KV namespace as `CHECKOUT_KV` (already used by stays) or `CARDCOM_KV`. The idempotency record lives there, so a timeout cannot record the same charge twice. Without KV, the worker only remembers the charge inside one isolate.

`CARDCOM_MOCK=1` makes the worker skip the Cardcom network and return synthetic deal numbers. Leave it unset in production.

Routes, all `POST` unless noted, all requiring the dashboard bearer token:

| Path | Role |
| --- | --- |
| `/api/payments/cardcom/quote` | Checks the amount against the booking before anyone taps |
| `/api/payments/cardcom/prepare` | `PrepareDevice` |
| `/api/payments/cardcom/process` | `ProcessSDKTransaction`, then records the payment |
| `/api/payments/cardcom/invoice` | `Documents/CreateDocument` for that `DealNumber` |
| `/api/payments/cardcom/link` | Cardcom Low Profile page for iOS and for amounts over ₪300 |
| `/api/payments/cardcom/link-status` | Reads the Low Profile result and records it once |
| `/api/payments/cardcom/manual` | Card number entered on the phone, charged on the server |
| `GET /api/payments/cardcom/booking?id=` | Balance due |

Deep links:

- `resortos://charge?booking=<id>&amount=<n>&payments=<n>`
- `https://resortos.app/app/charge?booking=<id>&amount=<n>&payments=<n>`

Only those three fields are read. A booking id is checked again on the server. The charge is refused before the tap when it is above the open balance, or above ₪300 on Tap. If the SDK already returned `00` and the amount does not match, the server still submits `ProcessSDKTransaction` once (the card may already have been charged) and marks the row for review instead of asking the desk to tap again.

In mock mode the practice booking is `tok_demo` (₪200 open).

## Open questions for Cardcom

The Tap guide (updated 2026-10-25) leaves these open. Do not guess them in production:

1. What `session_expire_time` means (absolute time or a duration) and when to call `PrepareDevice` again.
2. Whether `ProcessSDKTransaction` is safe to resend after a timeout, and how to find the original `DealNumber` if it is not. This app resubmits the same SDK payload at most once, then stops and tells the desk not to tap again.
3. Whether `SdkRequest` and `SdkResponse` must be JSON strings. We send strings, as the examples do.
4. The listener class names inside `topliteapp-PROD:3.0.5.3`. The reflective bridge tries a few packages and will need a typed rewrite once the AAR is inspected.
5. Refund rules for `type: REFUND`. The desk UI does not refund yet.
6. How to round agorot on installments. We put the remainder on the first payment and use `CreditType` 8 for more than one payment, 1 for a single payment. `CreditType` 6 (credit) is unused.
7. Whether wallets can charge more than ₪300. Physical cards are blocked in the app above that and offered a payment link instead.
8. How `DeviceUUID` should be minted, and what happens at the five-device terminal cap when a phone is replaced. The app derives a stable UUID from Android ID.
9. Time zone for `GetTransactions` dates.
10. Whether a Tap deal can take `Documents/CreateDocument` with `DocumentTypeToCreate: TaxInvoiceAndReceipt` and `DealNumbers`, and whether `UnitCost` is gross (כולל מע״מ). That call is implemented from the documents guide, not from the Tap spec. The Tap spec does not define invoices or webhooks.
11. Delivery of `finalizer`, `release.fin`, and the ProGuard file, and whether the Denovo Maven bucket is required in addition to the AAR.
12. Whether developer options must be off for a live tap, including for a debug build used at the desk.
13. PIN / CDCVM behaviour on Android 13+.
14. Confirm the same `CARDCOM_TERMINAL` is allowed to open Low Profile links and manual charges, not only Tap.
15. Apple Team ID for `applinks:resortos.app` (`APPLE_TEAM_ID` on the association file).

## Tests

From the repo root:

```bash
node --test functions/lib/cardcomTap.test.js
```

That covers the quote check, a full mock tap, a timeout that must not record twice, manual entry, the payment link, and the deep-link parser.
