import { randomBytes } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { createAgentConnectionService } from './agentConnections.js';

function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function dbKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || '';
}

async function rest(method, pathAndQuery, body, extraHeaders = {}) {
  const key = dbKey();
  const response = await fetch(`${supabaseUrl()}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) {
    const err = new Error(data?.message || data?.error || response.statusText);
    err.status = response.status;
    throw err;
  }
  return data;
}

function sealKey() {
  const file = path.join(homedir(), '.config', 'resortos', 'agent-seal.key');
  try {
    return Buffer.from(readFileSync(file, 'utf8').trim(), 'base64url');
  } catch {
    const key = randomBytes(32);
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, key.toString('base64url'), { mode: 0o600 });
    return key;
  }
}

function postgresStore() {
  return {
    async insert(row) {
      const saved = await rest('POST', 'hotelos_agent_connections', row, { Prefer: 'return=representation' });
      return Array.isArray(saved) ? saved[0] : saved;
    },
    async update(id, patch) {
      const saved = await rest(
        'PATCH',
        `hotelos_agent_connections?id=eq.${encodeURIComponent(id)}`,
        patch,
        { Prefer: 'return=representation' }
      );
      return Array.isArray(saved) ? saved[0] : saved;
    },
    async get(id) {
      const rows = await rest('GET', `hotelos_agent_connections?id=eq.${encodeURIComponent(id)}&limit=1`);
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    async findByCredentialHash(hash) {
      const rows = await rest('GET', `hotelos_agent_connections?credential_hash=eq.${encodeURIComponent(hash)}&limit=1`);
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    async findPendingByPollHash(hash) {
      const rows = await rest(
        'GET',
        `hotelos_agent_connections?poll_secret_hash=eq.${encodeURIComponent(hash)}&status=eq.pending&limit=1`
      );
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    async listByTenant(tenantId) {
      const rows = await rest(
        'GET',
        `hotelos_agent_connections?tenant_id=eq.${encodeURIComponent(tenantId)}&order=created_at.desc&limit=100`
      );
      return Array.isArray(rows) ? rows : [];
    },
    async addAudit(entry) {
      await rest('POST', 'hotelos_agent_audit', entry, { Prefer: 'return=minimal' });
      return entry;
    },
    async listAudit(connectionId) {
      const rows = await rest(
        'GET',
        `hotelos_agent_audit?connection_id=eq.${encodeURIComponent(connectionId)}&order=created_at.asc&limit=200`
      );
      return Array.isArray(rows) ? rows : [];
    },
  };
}

async function loadStaff(id) {
  const rows = await rest(
    'GET',
    `employees?id=eq.${encodeURIComponent(id)}&select=id,business_id,name,role,is_active,allowed_units,username&limit=1`
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  return {
    id: row.id,
    tenant_id: row.business_id,
    display_name: row.name,
    role: row.role,
    is_active: row.is_active !== false,
    allowed_units: row.allowed_units || [],
    username: row.username,
  };
}

let service = null;

export function agentConnectionService() {
  if (!service) {
    service = createAgentConnectionService({
      store: postgresStore(),
      loadStaff,
      sealKey: sealKey(),
    });
  }
  return service;
}

function bearer(req) {
  const header = String(req.headers?.authorization || req.get?.('authorization') || '');
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : '';
}

function pollSecret(req) {
  return String(req.headers?.['x-resortos-poll'] || req.get?.('x-resortos-poll') || '');
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
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

const hits = new Map();

function allowRequest(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((at) => now - at < 10 * 60 * 1000);
  if (recent.length >= 8) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

async function managerFrom(req) {
  const token = bearer(req);
  if (!token || token.startsWith('ros_agent_')) return null;
  const key = dbKey();
  const response = await fetch(`${supabaseUrl()}/rest/v1/rpc/hotelos_me`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_token: token }),
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}

export async function tryHandleAgentConnections(req, res) {
  const pathName = String(req.url || '').split('?')[0];
  const requestMatch = pathName.match(/^\/api\/ops\/agent-connections\/requests(?:\/([^/]+))?$/);
  const actionMatch = pathName.match(/^\/api\/ops\/agent-connections\/([^/]+)\/(approve|reject|revoke)$/);
  const list = req.method === 'GET' && pathName === '/api/ops/agent-connections';
  if (!requestMatch && !actionMatch && !list) return false;
  try {
    if (!dbKey()) {
      send(res, 503, { error: 'DB_NOT_CONFIGURED' });
      return true;
    }
    const api = agentConnectionService();
    if (req.method === 'POST' && pathName === '/api/ops/agent-connections/requests') {
      const ip = String(req.socket?.remoteAddress || req.headers?.['x-forwarded-for'] || 'local');
      if (!allowRequest(ip)) {
        send(res, 429, { error: 'RATE_LIMIT' });
        return true;
      }
      const body = await readJson(req);
      const result = await api.requestConnection({
        client: body.client,
        label: body.label,
        permissions: body.permissions,
        pollSecret: body.poll_secret,
        tenantId: process.env.HOTELOS_TENANT_ID || '22222222-2222-2222-2222-222222222222',
      });
      send(res, 201, result);
      return true;
    }
    if (req.method === 'GET' && requestMatch?.[1]) {
      const result = await api.poll({ id: decodeURIComponent(requestMatch[1]), pollSecret: pollSecret(req) });
      send(res, 200, result);
      return true;
    }
    const manager = await managerFrom(req);
    if (!manager) {
      send(res, 401, { error: 'UNAUTHORIZED' });
      return true;
    }
    if (list) {
      send(res, 200, { connections: await api.list(manager) });
      return true;
    }
    if (req.method === 'POST' && actionMatch) {
      const id = decodeURIComponent(actionMatch[1]);
      const decision = actionMatch[2];
      const connection = decision === 'revoke'
        ? await api.revoke(manager, id)
        : await api.decide(manager, id, decision === 'approve' ? 'approve' : 'reject');
      send(res, 200, { connection });
      return true;
    }
    send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    return true;
  } catch (err) {
    const status = Number(err.status) || 500;
    send(res, status, { error: status >= 500 ? 'AGENT_CONNECTION_FAILED' : err.message });
    return true;
  }
}

export async function agentPrincipal(token) {
  if (!dbKey() || !String(token || '').startsWith('ros_agent_')) return null;
  return agentConnectionService().authenticate(token);
}
