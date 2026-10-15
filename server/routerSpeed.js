import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function parseSpeedtest(text) {
  const body = String(text || '');
  const num = (re) => {
    const match = body.match(re);
    return match ? Number(match[1]) : null;
  };
  return {
    pingMs: num(/idle ping avg ([0-9.]+) ms/),
    downMbps: num(/download average ([0-9.]+) Mbps/),
    upMbps: num(/upload average ([0-9.]+) Mbps/),
  };
}

function speedPath() {
  return process.env.ROUTER_SPEED_PATH || path.join(__dirname, 'data', 'router-speed.json');
}

export function readSpeedResult() {
  try {
    return JSON.parse(readFileSync(speedPath(), 'utf8'));
  } catch {
    return null;
  }
}

let current = null;

export async function runOfficeSpeedTest() {
  if (current) return current;
  current = (async () => {
    const key = process.env.ROUTER_SSH_KEY || `${process.env.HOME}/.ssh/resortos_router`;
    const host = process.env.ROUTER_HOST || '100.122.76.95';
    const user = process.env.ROUTER_USER || 'root';
    const remote = [
      'ping=$(gl_speedtest ping 2>&1)',
      'down=$(gl_speedtest download 40000000 0.25 8 5 3 2>&1)',
      'up=$(gl_speedtest upload 20000000 0.25 8 5 3 2>&1)',
      'printf "%s\\n%s\\n%s\\n" "$ping" "$down" "$up"',
    ].join('; ');
    const { stdout } = await execFileAsync('ssh', [
      '-i', key,
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=8',
      `${user}@${host}`,
      remote,
    ], { timeout: 40000 });
    const parsed = parseSpeedtest(stdout);
    const saved = {
      ...parsed,
      ok: parsed.downMbps != null || parsed.upMbps != null,
      checkedAt: new Date().toISOString(),
    };
    mkdirSync(path.dirname(speedPath()), { recursive: true });
    writeFileSync(speedPath(), JSON.stringify(saved));
    return saved;
  })();
  try {
    return await current;
  } finally {
    current = null;
  }
}
