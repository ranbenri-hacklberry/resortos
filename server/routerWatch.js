import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sameDayAlertPhones } from '../src/lib/sameDayKinorotSms.js';
import { pollAssetBeacons } from './assetBeaconWatch.js';
import { alertText, saveRouterReport } from './routerStatus.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // The watch still runs with variables already in the environment.
  }
}

const PROBE = `
inet=false
ping -c 1 -W 2 1.1.1.1 >/dev/null 2>&1 && inet=true
wwan=$(ifstatus wwan 2>/dev/null | jsonfilter -e @.up 2>/dev/null)
ip=$(ifstatus wwan 2>/dev/null | jsonfilter -e '@["ipv4-address"][0].address' 2>/dev/null)
leases=$(wc -l < /tmp/dhcp.leases 2>/dev/null | tr -d " " || echo 0)
clients=0
for d in ra0 ra1 ra2 rax0 rax1 rax2; do
  c=$(iwinfo "$d" assoclist 2>/dev/null | grep -cE '^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}' || true)
  clients=$((clients + c))
done
up=$(cut -d. -f1 /proc/uptime 2>/dev/null || echo 0)
wup=$(ifstatus wwan 2>/dev/null | jsonfilter -e @.uptime 2>/dev/null)
host=$(uci -q get system.@system[0].hostname 2>/dev/null)
host=$(printf '%s' "$host" | tr -cd 'A-Za-z0-9._-')
[ -z "$up" ] && up=0
[ -z "$wup" ] && wup=0
[ -z "$leases" ] && leases=0
wwan_json=false
[ "$wwan" = true ] && wwan_json=true
printf '{"internet":%s,"wwanUp":%s,"wwanIp":"%s","leases":%s,"clients":%s,"uptimeSec":%s,"wwanUptimeSec":%s,"hostname":"%s","routerReachable":true}\\n' "$inet" "$wwan_json" "$ip" "$leases" "$clients" "$up" "$wup" "$host"
`;

async function probeRouter() {
  const key = process.env.ROUTER_SSH_KEY || `${process.env.HOME}/.ssh/resortos_router`;
  const host = process.env.ROUTER_HOST || '100.122.76.95';
  const user = process.env.ROUTER_USER || 'root';
  try {
    const { stdout } = await execFileAsync('ssh', [
      '-i', key,
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=8',
      `${user}@${host}`,
      PROBE,
    ], { timeout: 15000 });
    const line = stdout.trim().split('\n').filter(Boolean).at(-1);
    return JSON.parse(line);
  } catch {
    return { internet: null, routerReachable: false, wwanUp: false, wwanIp: '', leases: 0 };
  }
}

async function notify(kind) {
  const message = alertText(kind);
  const phones = sameDayAlertPhones();
  if (!message || !phones.length) return;
  const { sendMicropaySms } = await import('./micropaySms.js');
  for (const phone of phones) {
    try {
      await sendMicropaySms({ phone, message });
    } catch (err) {
      console.error('[router] sms failed', err?.message || err);
    }
  }
}

async function tick() {
  const report = await probeRouter();
  const saved = saveRouterReport(report);
  if (saved.alert) await notify(saved.alert);
  const state = saved.status.internet === true ? 'up' : (saved.status.internet === false ? 'down' : 'unknown');
  console.log(`[router] ${state} reachable=${saved.status.routerReachable === true} clients=${saved.status.clients || 0}`);
  const beacons = await pollAssetBeacons();
  const missing = (beacons.assets || []).filter((row) => row.present === false).length;
  console.log(`[beacon] online=${beacons.online === true} assets=${(beacons.assets || []).length} missing=${missing}`);
}

loadEnv();
const everyMs = Number(process.env.ROUTER_WATCH_MS || 30000);
tick().catch((err) => console.error('[router]', err.message));
setInterval(() => {
  tick().catch((err) => console.error('[router]', err.message));
}, everyMs);
