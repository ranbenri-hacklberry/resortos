import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    let val = trimmed.slice(eq + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const { fetchMicropayCredit } = await import('./micropaySms.js');
try {
  const result = await fetchMicropayCredit();
  console.log(JSON.stringify({
    ok: result.ok,
    message: result.message,
    credit: result.credit ?? null
  }));
} catch (err) {
  console.log(JSON.stringify({
    ok: false,
    error: err.message,
    status: err.status || null,
    description: err.description || null
  }));
}
