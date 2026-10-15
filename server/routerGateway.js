import { sameDayAlertPhones } from '../src/lib/sameDayKinorotSms.js';
import { readSpeedResult, runOfficeSpeedTest } from './routerSpeed.js';
import { alertText, publicRouterStatus, readRouterStatus, saveRouterReport } from './routerStatus.js';

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

async function notify(kind) {
  const message = alertText(kind);
  if (!message) return;
  const phones = sameDayAlertPhones();
  if (!phones.length) return;
  const { sendMicropaySms } = await import('./micropaySms.js');
  for (const phone of phones) {
    try {
      await sendMicropaySms({ phone, message });
    } catch (err) {
      console.error('[router] sms failed', err?.message || err);
    }
  }
}

export async function tryHandleNetwork(req, res) {
  const pathname = pathOf(req);
  if (pathname !== '/api/network/status' && pathname !== '/api/network/report' && pathname !== '/api/network/speedtest') return false;
  try {
    if (req.method === 'GET' && pathname === '/api/network/status') {
      send(res, 200, { ...publicRouterStatus(readRouterStatus()), speed: readSpeedResult() });
      return true;
    }
    if (req.method === 'POST' && pathname === '/api/network/speedtest') {
      const speed = await runOfficeSpeedTest();
      send(res, speed.ok ? 200 : 502, speed);
      return true;
    }
    if (req.method === 'POST' && pathname === '/api/network/report') {
      const expected = String(process.env.NETWORK_REPORT_TOKEN || '');
      const given = String(req.headers['x-network-token'] || '');
      if (!expected || given !== expected) {
        send(res, 401, { ok: false, error: 'unauthorized' });
        return true;
      }
      const body = await readJson(req);
      const saved = saveRouterReport(body);
      if (saved.alert) await notify(saved.alert);
      send(res, 200, saved.status);
      return true;
    }
    send(res, 405, { ok: false, error: 'method not allowed' });
    return true;
  } catch (err) {
    console.error('[router]', err?.message || err);
    const error = pathname === '/api/network/speedtest' ? 'speedtest failed' : (err.message || 'network status failed');
    send(res, 500, { ok: false, error });
    return true;
  }
}
