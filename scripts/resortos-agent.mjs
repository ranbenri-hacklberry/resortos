#!/usr/bin/env node
/**
 * Local helper for Codex and Cursor.
 * Neither client has a built-in approval flow for the ResortOS staff API.
 * This process requests access, shows a matching code, and after a manager
 * approves it stores the credential in ~/.config/resortos/agent-connection.json
 * (mode 0600). The credential is not printed.
 *
 *   node scripts/resortos-agent.mjs connect --client codex
 *   node scripts/resortos-agent.mjs connect --client cursor --permissions read,room_status
 *   node scripts/resortos-agent.mjs units
 *
 * Base URL defaults to http://100.127.14.15:3001 (Tailscale, WireGuard).
 * Override with RESORTOS_BASE_URL. Plain public HTTP is refused.
 */
import { randomBytes } from 'crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { assertAgentTransport } from '../server/agentConnections.js';

const credentialFile = path.join(homedir(), '.config', 'resortos', 'agent-connection.json');

function argsOf(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      out._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function readCredential() {
  try {
    return JSON.parse(readFileSync(credentialFile, 'utf8'));
  } catch {
    return null;
  }
}

function writeCredential(record) {
  mkdirSync(path.dirname(credentialFile), { recursive: true, mode: 0o700 });
  writeFileSync(credentialFile, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  chmodSync(credentialFile, 0o600);
}

async function api(baseUrl, pathName, { method = 'GET', body, headers = {} } = {}) {
  assertAgentTransport(baseUrl);
  const response = await fetch(`${baseUrl}${pathName}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || `HTTP_${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function connect(options) {
  const baseUrl = options.base || process.env.RESORTOS_BASE_URL || 'http://100.127.14.15:3001';
  assertAgentTransport(baseUrl);
  const client = options.client || 'codex';
  const permissions = String(options.permissions || 'read,room_status').split(',').map((item) => item.trim()).filter(Boolean);
  if (readCredential() && !options.replace) {
    console.log('כבר יש חיבור שמור. להחלפה: --replace');
    return;
  }
  const pollSecret = randomBytes(32).toString('base64url');
  const opened = await api(baseUrl, '/api/ops/agent-connections/requests', {
    method: 'POST',
    body: { client, permissions, poll_secret: pollSecret, label: options.label || '' },
  });
  const connection = opened.connection;
  console.log(`${connection.client_label} מבקש גישה`);
  console.log(`קוד התאמה: ${connection.match_code}`);
  console.log(`הרשאות: ${(connection.permissions || []).join(', ')}`);
  console.log('ממתין לאישור מנהל בהגדרות ← סוכנים מחוברים');
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const polled = await api(baseUrl, `/api/ops/agent-connections/requests/${encodeURIComponent(connection.id)}`, {
      headers: { 'X-Resortos-Poll': pollSecret },
    });
    if (polled.credential) {
      writeCredential({
        base_url: baseUrl,
        connection_id: connection.id,
        client,
        credential: polled.credential,
      });
      console.log('החיבור אושר ונשמר מקומית.');
      return;
    }
    const status = polled.connection?.status;
    if (status === 'rejected' || status === 'expired' || status === 'revoked') {
      console.log(`הבקשה נסגרה: ${status}`);
      return;
    }
  }
  console.log('הבקשה פגה לפני אישור.');
}

async function units() {
  const saved = readCredential();
  if (!saved?.credential || !saved.base_url) {
    console.log('אין חיבור שמור. קודם: node scripts/resortos-agent.mjs connect --client codex');
    process.exitCode = 1;
    return;
  }
  const data = await api(saved.base_url, '/api/ops/units', {
    headers: { Authorization: `Bearer ${saved.credential}` },
  });
  const rows = Array.isArray(data.units) ? data.units : [];
  console.log(`חדרים: ${rows.length}`);
}

const args = argsOf(process.argv.slice(2));
const command = args._[0];
if (command === 'connect') {
  connect(args).catch((err) => {
    console.error(err.message || 'CONNECT_FAILED');
    process.exitCode = 1;
  });
} else if (command === 'units') {
  units().catch((err) => {
    console.error(err.message || 'READ_FAILED');
    process.exitCode = 1;
  });
} else if (command) {
  console.error('פקודה לא מוכרת. connect או units');
  process.exitCode = 1;
}
