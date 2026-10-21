#!/usr/bin/env node
/**
 * Checkout reminder mechanism — launchd il.resortos.checkout-reminder.*
 *   node server/scheduledCheckoutReminder.js --mode=plan|send|report [--date=YYYY-MM-DD] [--no-notify]
 * Dry run is the DEFAULT (see server/checkoutReminderJob.js isDryRun).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile();

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const { runCheckoutReminderJob } = await import('./checkoutReminderJob.js');
const result = await runCheckoutReminderJob({
  mode: arg('mode') || 'send',
  date: arg('date'),
  notify: !process.argv.includes('--no-notify')
});
if (result.errors?.length) process.exitCode = 1;
