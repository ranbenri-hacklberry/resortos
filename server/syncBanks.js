import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

if (!process.env.CI) process.env.CI = '1';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (fs.existsSync(envPath)) {
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

import('./bankScrapers.js')
  .then(({ scrapeConfiguredBanks }) => {
    const keepAlive = setInterval(() => {}, 15000);
    return scrapeConfiguredBanks().finally(() => clearInterval(keepAlive));
  })
  .then((result) => {
    console.error('[sync-banks] done', result && {
      ok: result.ok,
      count: result.count,
      results: result.results
    });
    console.log(JSON.stringify({ ok: result?.ok, count: result?.count, results: result?.results }, null, 2));
  })
  .catch((err) => {
    console.error('[sync-banks] fail', err.message);
    if (err.body) console.error(JSON.stringify(err.body));
    process.exit(1);
  });
