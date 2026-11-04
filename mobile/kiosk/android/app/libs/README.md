# Cardcom Tap AAR

Drop the same AAR the desk app uses into this folder. Expected artifact: `com.denovo:topliteapp-PROD:3.0.5.3`.

Any `*.aar` here turns `CARDCOM_TAP_MOCK` off. Force the mock with:

```bash
./gradlew assembleDebug -PcardcomTapMock
```

Do not commit the AAR. Cardcom has to register this app's signing certificate separately from `il.resortos.app`. The kiosk reflective calls are a copy of `mobile/native-src/android/CardcomTapSdk.kt`.
