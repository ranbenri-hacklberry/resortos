const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAppBuildGradle, withMainApplication, withAndroidManifest } = require('@expo/config-plugins');

const MARKER = 'CARDCOM-TAP';

const GRADLE_SNIPPET = `
// ${MARKER}-BEGIN
android {
    buildFeatures {
        buildConfig true
    }
    defaultConfig {
        def cardcomAars = fileTree(dir: "\$projectDir/libs", include: ["*.aar"]).files
        def cardcomMock = cardcomAars.isEmpty() || project.hasProperty("cardcomTapMock")
        buildConfigField "boolean", "CARDCOM_TAP_MOCK", cardcomMock ? "true" : "false"
    }
}
dependencies {
    def cardcomAars = fileTree(dir: "libs", include: ["*.aar"])
    if (!cardcomAars.files.isEmpty() && !project.hasProperty("cardcomTapMock")) {
        implementation cardcomAars
    }
}
// ${MARKER}-END
`;

function copyTree(projectRoot, androidRoot) {
  const src = path.join(projectRoot, 'native-src', 'android');
  const dest = path.join(androidRoot, 'app', 'src', 'main', 'java', 'il', 'resortos', 'cardcom');
  fs.mkdirSync(dest, { recursive: true });
  for (const file of fs.readdirSync(src)) {
    if (!file.endsWith('.kt')) continue;
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
  }
  const libs = path.join(androidRoot, 'app', 'libs');
  fs.mkdirSync(libs, { recursive: true });
  const readme = path.join(projectRoot, 'native-src', 'libs-README.md');
  fs.copyFileSync(readme, path.join(libs, 'README.md'));
  if (!fs.existsSync(path.join(libs, '.gitkeep'))) fs.writeFileSync(path.join(libs, '.gitkeep'), '');
}

function withCardcomTap(config) {
  config = withDangerousMod(config, ['android', async (cfg) => {
    const androidRoot = cfg.modRequest.platformProjectRoot;
    copyTree(cfg.modRequest.projectRoot, androidRoot);
    const gradleProps = path.join(androidRoot, 'gradle.properties');
    if (fs.existsSync(gradleProps)) {
      let props = fs.readFileSync(gradleProps, 'utf8');
      const jvm = 'org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8';
      if (/org\.gradle\.jvmargs=/.test(props)) props = props.replace(/org\.gradle\.jvmargs=.*/g, jvm);
      else props += `\n${jvm}\n`;
      if (!props.includes('org.gradle.workers.max=')) props += 'org.gradle.workers.max=2\n';
      fs.writeFileSync(gradleProps, props);
    }
    return cfg;
  }]);

  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes(`${MARKER}-BEGIN`)) {
      contents += `\n${GRADLE_SNIPPET}`;
    }
    if (!contents.includes('debuggableVariants = []')) {
      contents = contents.replace(
        'autolinkLibrariesWithApp()',
        'debuggableVariants = [] // CARDCOM-TAP: ship JS inside the debug APK\n    autolinkLibrariesWithApp()'
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  config = withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes('il.resortos.cardcom.CardcomTapPackage')) {
      contents = contents.replace(
        /package\s+[\w.]+/,
        (match) => `${match}\n\nimport il.resortos.cardcom.CardcomTapPackage`
      );
    }
    if (!contents.includes('CardcomTapPackage()')) {
      contents = contents.replace(
        'PackageList(this).packages.apply {',
        'PackageList(this).packages.apply {\n              add(CardcomTapPackage())'
      );
      contents = contents.replace(
        'val packages = PackageList(this).packages',
        'val packages = PackageList(this).packages\n            packages.add(CardcomTapPackage())'
      );
    }
    contents = contents.replace(
      'override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG',
      'override fun getUseDeveloperSupport(): Boolean = false // standalone debug APK, no Metro'
    );
    if (!contents.includes('I18nUtil')) {
      contents = contents.replace(
        /super\.onCreate\(\)/,
        `super.onCreate()\n    com.facebook.react.modules.i18nmanager.I18nUtil.getInstance().allowRTL(this, true)\n    com.facebook.react.modules.i18nmanager.I18nUtil.getInstance().forceRTL(this, true)`
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const root = manifest.manifest;
    root['uses-permission'] = root['uses-permission'] || [];
    for (const name of [
      'android.permission.NFC',
      'android.permission.INTERNET',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION'
    ]) {
      const exists = root['uses-permission'].some((item) => item.$?.['android:name'] === name);
      if (!exists) root['uses-permission'].push({ $: { 'android:name': name } });
    }
    root['uses-feature'] = root['uses-feature'] || [];
    const nfc = root['uses-feature'].some((item) => item.$?.['android:name'] === 'android.hardware.nfc');
    if (!nfc) {
      root['uses-feature'].push({
        $: { 'android:name': 'android.hardware.nfc', 'android:required': 'false' }
      });
    }
    const app = root.application?.[0];
    if (app?.$) app.$['android:supportsRtl'] = 'true';
    return cfg;
  });

  return config;
}

module.exports = withCardcomTap;
