import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function s256(verifier) {
  return createHash('sha256').update(String(verifier)).digest('base64url');
}

function token(prefix) {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

function hostAllowed(hostname) {
  const host = String(hostname || '').toLowerCase();
  const roots = ['chatgpt.com', 'openai.com', 'grok.com', 'x.ai'];
  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

export function redirectAllowed(uri, { loopback = false } = {}) {
  let url;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === 'https:' && hostAllowed(url.hostname)) return true;
  if (loopback && url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')) return true;
  return false;
}

export function createMemoryOauthStore() {
  const clients = new Map();
  const codes = new Map();
  const access = new Map();
  const refresh = new Map();
  return { clients, codes, access, refresh };
}

export function createFileOauthStore(file) {
  const target = file || path.join(os.homedir(), '.config', 'resortos', 'mcp-auth.json');
  function load() {
    try {
      return JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch {
      return { clients: {}, codes: {}, access: {}, refresh: {} };
    }
  }
  function save(data) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, target);
    try { fs.chmodSync(target, 0o600); } catch { /* windows */ }
  }
  function mapOf(key) {
    return {
      get: (id) => load()[key]?.[id],
      set: (id, value) => {
        const next = load();
        next[key] = next[key] || {};
        next[key][id] = value;
        save(next);
      },
      delete: (id) => {
        const next = load();
        if (next[key]) delete next[key][id];
        save(next);
      },
      entries: () => Object.entries(load()[key] || {})
    };
  }
  return {
    clients: mapOf('clients'),
    codes: mapOf('codes'),
    access: mapOf('access'),
    refresh: mapOf('refresh')
  };
}

export function createOauthService({ store, now = () => new Date(), verifyStaff, loopback = false }) {
  function clientOf(id) {
    return store.clients.get(id) || null;
  }

  return {
    register({ redirectUris, name }) {
      const uris = (Array.isArray(redirectUris) ? redirectUris : []).map(String);
      if (!uris.length || uris.some((uri) => !redirectAllowed(uri, { loopback }))) {
        const err = new Error('INVALID_REDIRECT');
        err.status = 400;
        throw err;
      }
      const id = `ros_mcp_client_${randomBytes(12).toString('hex')}`;
      const row = { id, name: String(name || 'mcp').slice(0, 80), redirect_uris: uris, created_at: now().toISOString() };
      store.clients.set(id, row);
      return row;
    },
    clientOf,
    async issueCode({ clientId, redirectUri, codeChallenge, method, state, username, password, resource }) {
      const user = await verifyStaff(username, password);
      return this.issueForManager({ clientId, redirectUri, codeChallenge, method, state, resource, user });
    },
    issueForManager({ clientId, redirectUri, codeChallenge, method, state, resource, user }) {
      const client = clientOf(clientId);
      if (!client || !client.redirect_uris.includes(redirectUri) || !redirectAllowed(redirectUri, { loopback })) {
        const err = new Error('INVALID_CLIENT');
        err.status = 400;
        throw err;
      }
      if (method !== 'S256' || !codeChallenge) {
        const err = new Error('PKCE_REQUIRED');
        err.status = 400;
        throw err;
      }
      if (!user?.id || !['MANAGER', 'PRIORITY'].includes(String(user.role || '').toUpperCase()) || user.is_active === false) {
        const err = new Error('FORBIDDEN');
        err.status = 403;
        throw err;
      }
      const code = token('ros_mcp_code_');
      store.codes.set(sha256(code), {
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        resource: resource || '',
        state: state || '',
        user: publicUser(user),
        expires_at: now().getTime() + CODE_TTL_MS
      });
      return code;
    },
    exchange({ code, verifier, clientId, redirectUri, resource }) {
      const hash = sha256(code || '');
      const row = store.codes.get(hash);
      store.codes.delete(hash);
      if (!row || row.expires_at <= now().getTime()) {
        const err = new Error('INVALID_GRANT');
        err.status = 400;
        throw err;
      }
      if (row.client_id !== clientId || row.redirect_uri !== redirectUri) {
        const err = new Error('INVALID_GRANT');
        err.status = 400;
        throw err;
      }
      if (resource && row.resource && resource !== row.resource) {
        const err = new Error('INVALID_TARGET');
        err.status = 400;
        throw err;
      }
      if (s256(verifier || '') !== row.code_challenge) {
        const err = new Error('INVALID_GRANT');
        err.status = 400;
        throw err;
      }
      return mint(store, row.user, row.resource, now);
    },
    refresh({ refreshToken, resource }) {
      const hash = sha256(refreshToken || '');
      const row = store.refresh.get(hash);
      store.refresh.delete(hash);
      if (!row || row.expires_at <= now().getTime()) {
        const err = new Error('INVALID_GRANT');
        err.status = 400;
        throw err;
      }
      if (resource && row.resource && resource !== row.resource) {
        const err = new Error('INVALID_TARGET');
        err.status = 400;
        throw err;
      }
      for (const [key, tokenRow] of entries(store.access)) {
        if (tokenRow.user?.id === row.user?.id && tokenRow.resource === row.resource) store.access.delete(key);
      }
      return mint(store, row.user, row.resource, now);
    },
    authenticate(accessToken, resource) {
      const row = store.access.get(sha256(accessToken || ''));
      if (!row || row.expires_at <= now().getTime()) return null;
      if (resource && row.resource && row.resource !== resource) return null;
      if (!['MANAGER', 'PRIORITY'].includes(String(row.user?.role || '').toUpperCase())) return null;
      return row.user;
    },
    revoke(accessToken) {
      const hash = sha256(accessToken || '');
      const row = store.access.get(hash);
      store.access.delete(hash);
      if (!row) return false;
      for (const [key, refreshRow] of entries(store.refresh)) {
        if (refreshRow.user?.id === row.user?.id) store.refresh.delete(key);
      }
      return true;
    }
  };
}

function entries(map) {
  if (typeof map.entries !== 'function') return [];
  const listed = map.entries();
  return Array.isArray(listed) ? listed : [...listed];
}

function publicUser(user) {
  return {
    id: String(user.id),
    username: String(user.username || ''),
    display_name: String(user.display_name || user.name || user.username || ''),
    role: String(user.role || '').toUpperCase() === 'PRIORITY' ? 'PRIORITY' : 'MANAGER',
    tenant_id: String(user.tenant_id || user.business_id || ''),
    allowed_units: Array.isArray(user.allowed_units) ? user.allowed_units : [],
    is_active: true
  };
}

function mint(store, user, resource, now) {
  const accessToken = token('ros_mcp_');
  const refreshToken = token('ros_mcp_refresh_');
  store.access.set(sha256(accessToken), {
    user,
    resource: resource || '',
    expires_at: now().getTime() + ACCESS_TTL_MS
  });
  store.refresh.set(sha256(refreshToken), {
    user,
    resource: resource || '',
    expires_at: now().getTime() + REFRESH_TTL_MS
  });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    scope: 'resortos:owner'
  };
}

export function secretsEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
