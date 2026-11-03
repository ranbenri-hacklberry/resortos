# Cardcom Tap AAR

Drop the AAR Cardcom sends after they register the signing-certificate SHA256 into this folder.

Expected artifact: `com.denovo:topliteapp-PROD:3.0.5.3`, usually a file named like `Cardcom-3.0.5.3-Release_Prod.aar`.

Any `*.aar` here turns the debug/release build off the mock and onto `ReflectiveCardcomTapSdk`. Force the mock anyway with:

```
./gradlew assembleDebug -PcardcomTapMock
```

Do not commit the AAR. It is private to the Cardcom integration package.
