const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withAppBuildGradle, withDangerousMod, withGradleProperties } = require('@expo/config-plugins');

const PERMISSIONS = [
  'android.permission.NFC',
  'android.permission.INTERNET',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION'
];

function ensurePermission(manifest, name) {
  const root = manifest.manifest;
  const list = root['uses-permission'] || [];
  if (!list.some((item) => item.$?.['android:name'] === name)) {
    list.push({ $: { 'android:name': name } });
  }
  root['uses-permission'] = list;
}

function withCardcomAndroid(config) {
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    for (const name of PERMISSIONS) ensurePermission(manifest, name);
    const root = manifest.manifest;
    const features = root['uses-feature'] || [];
    if (!features.some((item) => item.$?.['android:name'] === 'android.hardware.nfc')) {
      features.push({ $: { 'android:name': 'android.hardware.nfc', 'android:required': 'false' } });
    }
    root['uses-feature'] = features;
    const app = root.application?.[0];
    if (app?.$) app.$['android:supportsRtl'] = 'true';
    return mod;
  });

  config = withGradleProperties(config, (mod) => {
    const items = mod.modResults;
    if (!items.find((item) => item.type === 'property' && item.key === 'CARDCOM_TAP_MOCK')) {
      items.push({ type: 'property', key: 'CARDCOM_TAP_MOCK', value: 'true' });
    }
    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') return mod;
    if (!/^\s*debuggableVariants\s*=/m.test(mod.modResults.contents)) {
      const commented = '// debuggableVariants = ["liteDebug", "prodDebug"]';
      if (mod.modResults.contents.includes(commented)) {
        mod.modResults.contents = mod.modResults.contents.replace(commented, 'debuggableVariants = []');
      } else {
        mod.modResults.contents = mod.modResults.contents.replace(
          /react\s*\{/,
          'react {\n        debuggableVariants = []'
        );
      }
    }
    return mod;
  });

  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const file = path.join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const marker = '# cardcom-tap';
      const extra = `\n${marker}\n-keep class com.denovo.** { *; }\n-keep class com.cardcom.** { *; }\n-keep class expo.modules.cardcomtap.** { *; }\n`;
      const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!text.includes(marker)) fs.writeFileSync(file, `${text}${extra}`);
      return mod;
    }
  ]);

  return config;
}

module.exports = withCardcomAndroid;
