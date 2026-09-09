#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const credPath = path.join(root, 'native/keystore/credentials.env');
if (!existsSync(credPath)) {
  console.error('Missing native/keystore/credentials.env — generate the upload key first.');
  process.exit(1);
}

const creds = Object.fromEntries(
  readFileSync(credPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    })
);

const keystore = creds.KEYSTORE_PATH || path.join(root, 'native/keystore/resortos-reviews-upload.jks');
const env = {
  ...process.env,
  JAVA_HOME: process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
  ANDROID_HOME: process.env.ANDROID_HOME || path.join(process.env.HOME || '', 'Library/Android/sdk'),
  ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || path.join(process.env.HOME || '', 'Library/Android/sdk')
};
env.PATH = `${env.JAVA_HOME}/bin:${env.ANDROID_HOME}/platform-tools:${env.PATH}`;

const result = spawnSync(
  'npx',
  [
    'cap',
    'build',
    'android',
    '--keystorepath',
    keystore,
    '--keystorepass',
    creds.KEYSTORE_PASSWORD,
    '--keystorealias',
    creds.KEY_ALIAS || 'upload',
    '--keystorealiaspass',
    creds.KEY_PASSWORD || creds.KEYSTORE_PASSWORD,
    '--androidreleasetype',
    'AAB'
  ],
  { cwd: root, env, stdio: 'inherit' }
);
if (result.status !== 0) process.exit(result.status || 1);

const aab = path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab');
const signed = path.join(root, 'android/app/build/outputs/bundle/release/app-release-signed.aab');
const src = existsSync(signed) ? signed : aab;
if (!existsSync(src)) {
  console.error('AAB not found after build.');
  process.exit(1);
}
const destDir = path.join(root, 'dist-native');
mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, 'WhaStar-1.1.0.aab');
copyFileSync(src, dest);
console.log(`Play bundle: ${dest}`);
