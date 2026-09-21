#!/usr/bin/env node
/**
 * Daily 09:45 Israel checkout reminder SMS.
 * Intended for launchd StartCalendarInterval on the Mac Studio.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runScheduledCheckoutReminders } from './guestComms.js';

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile();

const result = await runScheduledCheckoutReminders(new Date());
console.log('[scheduled-checkout-reminder]', JSON.stringify(result));
if (result.errors?.length) process.exitCode = 1;
