import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function statePath() {
  return process.env.ESP_AC_STATE_PATH || path.join(__dirname, 'data', 'esp-ac-state.json');
}
const NOTE = 'שידור נשלח מהעינית. יש לוודא צפצוף מהמזגן בחדר.';

function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function espGatewayUrl() {
  loadDotEnv();
  return (process.env.ESP_GATEWAY_URL || 'http://127.0.0.1:8085').replace(/\/$/, '');
}

function clampTemp(value) {
  const temp = Number(value);
  if (!Number.isFinite(temp)) return 24;
  return Math.min(30, Math.max(16, Math.round(temp)));
}

export function readEspAcState() {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), 'utf8'));
    return {
      power: parsed.power === true,
      targetC: clampTemp(parsed.targetC ?? 24),
      known: parsed.known === true,
    };
  } catch {
    return { power: false, targetC: 24, known: false };
  }
}

function writeEspAcState(state) {
  mkdirSync(path.dirname(statePath()), { recursive: true });
  writeFileSync(statePath(), JSON.stringify({
    power: state.power === true,
    targetC: clampTemp(state.targetC),
    known: true,
    updatedAt: new Date().toISOString(),
  }));
}

export function espAcUnit(state, extra = {}) {
  return {
    id: 'tcl-ir',
    name: 'TCL',
    room: 'משרד',
    power: state.known ? state.power === true : null,
    mode: 'cold',
    targetC: state.targetC,
    fan: 'auto',
    currentC: null,
    humidity: null,
    host: 'esp32-usb',
    libraryReady: true,
    tempMin: 16,
    tempMax: 30,
    modes: ['cold'],
    fans: ['auto'],
    note: state.known ? NOTE : 'העין מחוברת. אין חיישן חוזר מהמזגן, רק השידור האחרון.',
    ...extra,
  };
}

async function postJson(url, body, fetchImpl, timeoutMs = 8000) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === 'error') {
    throw new Error(data.message || data.note || 'שידור ה-IR נכשל');
  }
  return data;
}

export async function espGatewayOnline(fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl(`${espGatewayUrl()}/api/status`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === 'success' && data.gateway === 'online';
  } catch {
    return false;
  }
}

export async function espClimateStatus(fetchImpl = globalThis.fetch) {
  const online = await espGatewayOnline(fetchImpl);
  if (!online) return null;
  return { ok: true, unit: espAcUnit(readEspAcState()) };
}

export async function espClimateCommand(body, fetchImpl = globalThis.fetch) {
  const online = await espGatewayOnline(fetchImpl);
  if (!online) return null;
  const state = readEspAcState();
  const base = espGatewayUrl();

  if (body?.power === false) {
    await postJson(`${base}/api/ir/ac/off`, {}, fetchImpl);
    state.power = false;
    state.known = true;
  } else if (body?.target != null || body?.power === true) {
    const temp = clampTemp(body?.target ?? state.targetC);
    await postJson(`${base}/api/ir/ac`, { temp }, fetchImpl);
    state.power = true;
    state.targetC = temp;
    state.known = true;
  } else if (body?.mode && body.mode !== 'cold') {
    return { ok: false, error: 'העין משדרת קירור בלבד' };
  } else if (body?.fan && body.fan !== 'auto') {
    return { ok: false, error: 'העין משדרת מאוורר אוטומטי בלבד' };
  }

  if (state.known) writeEspAcState(state);
  return {
    ok: true,
    unit: espAcUnit(state, { note: NOTE }),
  };
}

export async function officePilotStatus(fetchImpl = globalThis.fetch) {
  const online = await espGatewayOnline(fetchImpl);
  return {
    ok: true,
    online,
    area: 'pilot',
    room: 'משרד',
    unit: online ? espAcUnit(readEspAcState()) : null,
  };
}

export async function officePilotCommand(body, fetchImpl = globalThis.fetch) {
  const online = await espGatewayOnline(fetchImpl);
  if (!online) return { ok: false, error: 'הבקר של המשרד לא מחובר' };
  const action = String(body?.action || '');
  const operator = String(body?.operator || 'צוות').slice(0, 80);
  const base = espGatewayUrl();

  if (action === 'ac_off') return espClimateCommand({ power: false }, fetchImpl);
  if (action === 'ac') {
    return espClimateCommand({ power: true, target: body?.temp }, fetchImpl);
  }
  if (action === 'unlock' || action === 'lock') {
    await postJson(`${base}/api/${action}`, { operator }, fetchImpl, 28000);
    return { ok: true, online: true, action };
  }
  if (action === 'tv' || action === 'tv_on' || action === 'tv_off') {
    const power = action === 'tv_off' ? 'off' : (action === 'tv_on' ? 'on' : 'toggle');
    await postJson(`${base}/api/ir/tv`, { power }, fetchImpl);
    return { ok: true, online: true, action, note: 'שידור נשלח לטלוויזיה. אין חיווי חזרה מהמסך.' };
  }
  return { ok: false, error: 'פעולה לא מוכרת' };
}
