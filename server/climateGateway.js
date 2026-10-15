import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { espClimateCommand, espClimateStatus, officePilotCommand, officePilotStatus } from './espClimate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pythonBin() {
  const candidates = [
    process.env.S16_PYTHON,
    '/Users/user/miniforge3/bin/python3.12',
    '/Users/rani/miniforge3/bin/python3.12',
    '/Users/rani/resortos/.venv-climate/bin/python3',
    'python3',
  ].filter(Boolean);
  for (const bin of candidates) {
    if (bin.includes('/') && !existsSync(bin)) continue;
    const probe = spawnSync(bin, ['-c', 'import tinytuya, tuya_connector'], { encoding: 'utf8' });
    if (probe.status === 0) return bin;
  }
  return 'python3';
}

const PYTHON = pythonBin();

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
      try {
        resolve(JSON.parse(text));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function runClimate(args, stdinValue) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [path.join(__dirname, 's16_climate.py'), ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        const parsed = JSON.parse(out || '{}');
        if (code !== 0 && parsed.ok !== false) {
          parsed.ok = false;
          parsed.error = parsed.error || err.trim() || 'climate failed';
        }
        resolve(parsed);
      } catch {
        reject(new Error(err.trim() || 'climate returned invalid JSON'));
      }
    });
    child.stdin.end(stdinValue ? JSON.stringify(stdinValue) : '');
  });
}

export async function tryHandleClimate(req, res) {
  const pathname = pathOf(req);
  const climatePath = pathname === '/api/climate/units' || pathname === '/api/climate/status' || pathname === '/api/climate/command';
  const pilotPath = pathname === '/api/pilot/office';
  if (!climatePath && !pilotPath) return false;
  try {
    if (pilotPath && req.method === 'GET') {
      send(res, 200, await officePilotStatus());
      return true;
    }
    if (pilotPath && req.method === 'POST') {
      const body = await readJson(req);
      const result = await officePilotCommand(body);
      send(res, result.ok ? 200 : 502, result);
      return true;
    }
    if (pilotPath) {
      send(res, 405, { ok: false, error: 'method not allowed' });
      return true;
    }
    if (req.method === 'GET' && pathname === '/api/climate/units') {
      send(res, 200, await runClimate(['list']));
      return true;
    }
    if (req.method === 'GET' && pathname === '/api/climate/status') {
      const esp = await espClimateStatus();
      const result = esp || await runClimate(['status']);
      send(res, result.ok ? 200 : 502, result);
      return true;
    }
    if (req.method === 'POST' && pathname === '/api/climate/command') {
      const body = await readJson(req);
      const esp = await espClimateCommand(body);
      const result = esp || await runClimate(['command'], body);
      send(res, result.ok ? 200 : 502, result);
      return true;
    }
    send(res, 405, { ok: false, error: 'method not allowed' });
    return true;
  } catch (err) {
    send(res, 500, { ok: false, error: err.message || 'climate failed' });
    return true;
  }
}
