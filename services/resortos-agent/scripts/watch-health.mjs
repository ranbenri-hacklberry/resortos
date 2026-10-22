import { execFile, spawn } from 'node:child_process';
import { openSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideWatch, freshWatchState } from '../dist/whatsapp/watchDecision.js';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statePath = process.env.AGENT_WATCH_STATE || path.join(root, 'data', 'agent-watch.json');
const healthUrl = process.env.AGENT_HEALTH_URL || 'http://127.0.0.1:8787/health';
const alertPhone = process.env.AGENT_ALERT_PHONE || '0506102416';
const envFile = process.env.AGENT_ENV_FILE || '/Users/rani/resortos/.env';

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // SMS still works if the variables are already in the environment.
  }
}

function readState() {
  try {
    const raw = JSON.parse(readFileSync(statePath, 'utf8'));
    return {
      badSince: typeof raw.badSince === 'number' ? raw.badSince : null,
      restartedAt: typeof raw.restartedAt === 'number' ? raw.restartedAt : null,
      alerted: raw.alerted === true,
    };
  } catch {
    return freshWatchState();
  }
}

async function probe() {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(4000) });
    const body = await res.json();
    return { up: true, whatsapp: String(body.whatsapp || '') };
  } catch {
    return { up: false, whatsapp: 'down' };
  }
}

async function sendSms(message) {
  loadEnv(envFile);
  const token = String(process.env.MICROPAY_TOKEN || '').trim();
  const from = String(process.env.MICROPAY_FROM || '').trim();
  if (!token || !from) {
    console.error('[agent-watch] sms skipped, micropay env missing');
    return;
  }
  const digits = alertPhone.replace(/\D/g, '');
  const phone = digits.startsWith('972') ? `0${digits.slice(3)}` : digits;
  const res = await fetch(process.env.MICROPAY_URL || 'https://www.micropay.co.il/extApi/scheduleSms.php', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, from, msg: message, list: phone }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  console.log(`[agent-watch] sms ${res.status} ${text.slice(0, 80)}`);
}

async function restartAgent() {
  try {
    const { stdout } = await execFileAsync('pgrep', ['-f', 'node dist/index.js']);
    for (const pid of stdout.split('\n').map((line) => line.trim()).filter(Boolean)) {
      process.kill(Number(pid), 'SIGTERM');
    }
  } catch {
    // Already stopped.
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  // Append Chloe's stdout/stderr to the monitored log (Ran 2026-10-22), never /dev/null.
  const logFd = openSync(process.env.AGENT_LOG || '/tmp/resortos-agent.log', 'a');
  const child = spawn('/opt/homebrew/bin/node', ['dist/index.js'], {
    cwd: root,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  console.log(`[agent-watch] restarted pid ${child.pid}`);
}

const probeResult = await probe();
const prev = readState();
const decision = decideWatch(prev, probeResult, Date.now());
writeFileSync(statePath, JSON.stringify(decision.state));
console.log(`[agent-watch] whatsapp=${probeResult.whatsapp} action=${decision.action}`);

try {
  if (decision.action === 'restart') {
    await restartAgent();
  } else if (decision.action === 'alert') {
    const why = probeResult.up ? probeResult.whatsapp : 'כבויה';
    await sendSms(`ResortOS: וואטסאפ הסוכנת תקוע (${why}). ניסיתי להרים מחדש ולא חזר.`);
  } else if (decision.action === 'recovered') {
    await sendSms('ResortOS: וואטסאפ הסוכנת חזר.');
  }
} catch (err) {
  console.error('[agent-watch]', err?.message || err);
}
