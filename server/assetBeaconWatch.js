import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ackBeaconAlerts, applyBeaconSample, beaconSmsText, publicBeaconReport } from '../src/lib/assetBeacons.js';
import { sameDayAlertPhones } from '../src/lib/sameDayKinorotSms.js';
import { espGatewayUrl } from './espClimate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function beaconStatePath() {
  return process.env.ASSET_BEACON_PATH || path.join(__dirname, 'data', 'asset-beacons.json');
}

export function readBeaconState() {
  try {
    return JSON.parse(readFileSync(beaconStatePath(), 'utf8'));
  } catch {
    return null;
  }
}

export function writeBeaconState(state) {
  const stored = {
    online: state?.online === true,
    checkedAt: state?.checkedAt || null,
    assets: state?.assets || [],
    alerts: state?.alerts || [],
  };
  mkdirSync(path.dirname(beaconStatePath()), { recursive: true });
  writeFileSync(beaconStatePath(), JSON.stringify(stored));
  return stored;
}

async function notifyMissing(names) {
  const phones = sameDayAlertPhones();
  if (!phones.length || !names.length) return;
  const { sendMicropaySms } = await import('./micropaySms.js');
  for (const name of names) {
    const message = beaconSmsText(name);
    for (const phone of phones) {
      try {
        await sendMicropaySms({ phone, message });
      } catch (err) {
        console.error('[beacon] sms failed', err?.message || err);
      }
    }
  }
}

export async function pollAssetBeacons(fetchImpl = globalThis.fetch, now = new Date()) {
  const prev = readBeaconState();
  let sample = { online: false };
  try {
    const response = await fetchImpl(`${espGatewayUrl()}/api/assets`, {
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      const data = await response.json();
      sample = { online: true, assets: data?.assets };
    }
  } catch {
    sample = { online: false };
  }
  const next = applyBeaconSample(prev, sample, now.toISOString());
  writeBeaconState(next);
  if (next.sms.length) await notifyMissing(next.sms);
  return publicBeaconReport(next);
}

function pathOf(req) {
  return String(req.url || '').split('?')[0] || '/';
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(body);
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(json);
}

function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

export async function tryHandleAssetBeacons(req, res) {
  const pathname = pathOf(req);
  if (pathname !== '/api/pilot/assets' && pathname !== '/api/pilot/assets/ack') return false;
  try {
    if (req.method === 'GET' && pathname === '/api/pilot/assets') {
      send(res, 200, publicBeaconReport(readBeaconState()));
      return true;
    }
    if (req.method === 'POST' && pathname === '/api/pilot/assets/ack') {
      const body = await readJson(req);
      const ids = Array.isArray(body?.ids) ? body.ids : [body?.id].filter(Boolean);
      const next = ackBeaconAlerts(readBeaconState() || {}, ids);
      writeBeaconState(next);
      send(res, 200, publicBeaconReport(next));
      return true;
    }
    send(res, 405, { ok: false, error: 'method not allowed' });
    return true;
  } catch (err) {
    send(res, 500, { ok: false, error: err.message || 'beacon status failed' });
    return true;
  }
}
