import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'crypto';

function awaitingInspection(unit) {
  if (unit?.operational_status !== 'READY') return false;
  const list = Array.isArray(unit.quality_inspections) ? unit.quality_inspections : [];
  const last = list.length ? list[list.length - 1] : null;
  const ratings = last?.ratings && typeof last.ratings === 'object' ? last.ratings : {};
  const managerRated = Object.values(ratings).some((value) => Number(value) > 0);
  if (managerRated && last && !last.reopened) return false;
  if (String(unit.custom_reason || '').includes('ביקורת')) return true;
  return Boolean(last && !last.reopened && (last.source === 'calendar' || last.note === 'סומן נקי מהיומן'));
}

export const AGENT_CLIENTS = {
  codex: 'Codex',
  cursor: 'Cursor',
};

export const AGENT_PERMISSIONS = ['read', 'room_status'];

export const AGENT_STATUS_FIELDS = [
  'operational_status',
  'operational_domain',
  'custom_reason',
  'quality_inspections',
  'cleaning_started_at',
  'assigned_staff',
  'staff_occupancy',
  'is_escalated',
];

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REQUEST_TTL_MS = 10 * 60 * 1000;
const TOKEN_PREFIX = 'ros_agent_';

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function assertAgentTransport(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw Object.assign(new Error('BAD_BASE_URL'), { status: 400 });
  }
  if (url.protocol === 'https:') return url;
  const host = url.hostname;
  const loopback = host === '127.0.0.1' || host === 'localhost';
  const tailscale = /^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  if (url.protocol === 'http:' && (loopback || tailscale)) return url;
  throw Object.assign(new Error('INSECURE_TRANSPORT'), { status: 400 });
}

function seal(key, plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

function openSeal(key, payload) {
  const buf = Buffer.from(payload, 'base64url');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function matchCode() {
  let code = '';
  for (let i = 0; i < 4; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

function normalizePermissions(list) {
  const wanted = new Set((Array.isArray(list) ? list : []).map((item) => String(item || '').trim()));
  if (wanted.has('room_status')) wanted.add('read');
  const next = AGENT_PERMISSIONS.filter((item) => wanted.has(item));
  return next.length ? next : ['read'];
}

function publicConnection(row, { includeCode = false } = {}) {
  return {
    id: row.id,
    client: row.client_kind,
    client_label: AGENT_CLIENTS[row.client_kind] || row.client_kind,
    label: row.label || '',
    permissions: row.status === 'approved' || row.status === 'revoked'
      ? row.granted_permissions
      : row.requested_permissions,
    status: row.status,
    match_code: includeCode || row.status === 'pending' ? row.match_code : null,
    created_at: row.created_at,
    expires_at: row.expires_at,
    approved_at: row.approved_at || null,
    revoked_at: row.revoked_at || null,
    last_used_at: row.last_used_at || null,
    approved_by_staff_id: row.approved_by_staff_id || null,
    approved_by_name: row.approved_by_name || null,
  };
}

export function readinessOf(unit) {
  if (!unit) return 'unknown';
  if (awaitingInspection(unit)) return 'awaiting_inspection';
  if (unit.operational_status === 'READY') return 'ready';
  if (unit.operational_status === 'DIRTY') return 'dirty';
  if (unit.operational_status === 'IN_PROGRESS') return 'cleaning';
  return String(unit.operational_status || 'unknown').toLowerCase();
}

export function resolveUnit(units, { unitId = '', name = '' } = {}) {
  const list = Array.isArray(units) ? units : [];
  const id = String(unitId || '').trim();
  if (id) {
    const matches = list.filter((row) => row.id === id);
    if (matches.length !== 1) {
      return { error: 'UNIT_NOT_FOUND' };
    }
    return { unit: matches[0] };
  }
  const label = String(name || '').trim();
  if (!label) return { error: 'UNIT_REQUIRED' };
  const matches = list.filter((row) => row.name === label || row.display_name === label);
  if (matches.length === 0) return { error: 'UNIT_NOT_FOUND' };
  if (matches.length > 1) return { error: 'UNIT_AMBIGUOUS' };
  return { unit: matches[0] };
}

export function scopeAgentUnitPatch(existing, body) {
  const next = { ...(existing || {}) };
  for (const key of AGENT_STATUS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body || {}, key)) next[key] = body[key];
  }
  next.id = existing?.id;
  return next;
}

export function agentAllows(user, permission) {
  if (!user?.agent_connection_id) return true;
  return (user.agent_permissions || []).includes(permission);
}

export function statusWriteMatches(intended, read) {
  if (!read) return false;
  if ((intended?.operational_status || null) !== (read.operational_status || null)) return false;
  if (String(intended?.custom_reason || '') !== String(read.custom_reason || '')) return false;
  return JSON.stringify(intended?.quality_inspections || []) === JSON.stringify(read.quality_inspections || []);
}

function isManager(user) {
  const role = String(user?.role || '').toUpperCase();
  return role === 'MANAGER' || role === 'OPS_MANAGER';
}

export function createMemoryStore() {
  const rows = new Map();
  const audit = [];
  return {
    async insert(row) {
      rows.set(row.id, { ...row });
      return row;
    },
    async update(id, patch) {
      const current = rows.get(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      rows.set(id, next);
      return next;
    },
    async get(id) {
      return rows.get(id) ? { ...rows.get(id) } : null;
    },
    async findByCredentialHash(hash) {
      return [...rows.values()].find((row) => row.credential_hash === hash) || null;
    },
    async findPendingByPollHash(hash) {
      return [...rows.values()].find((row) => row.status === 'pending' && row.poll_secret_hash === hash) || null;
    },
    async listByTenant(tenantId) {
      return [...rows.values()].filter((row) => row.tenant_id === tenantId);
    },
    async addAudit(entry) {
      audit.push(entry);
      return entry;
    },
    async listAudit(connectionId) {
      return audit.filter((row) => row.connection_id === connectionId);
    },
  };
}

export function createAgentConnectionService({ store, loadStaff, now = () => new Date(), sealKey }) {
  const key = sealKey || randomBytes(32);

  async function audit(row, action, staff, extra = {}) {
    await store.addAudit({
      id: `aa_${randomBytes(8).toString('hex')}`,
      connection_id: row.id,
      tenant_id: row.tenant_id,
      staff_id: staff?.id || row.approved_by_staff_id || null,
      staff_name: staff?.display_name || staff?.name || row.approved_by_name || null,
      action,
      unit_id: extra.unit_id || null,
      detail: extra.detail || {},
      created_at: now().toISOString(),
    });
  }

  async function expireIfNeeded(row) {
    if (!row || row.status !== 'pending') return row;
    if (new Date(row.expires_at).getTime() > now().getTime()) return row;
    return store.update(row.id, { status: 'expired', credential_sealed: null });
  }

  return {
    async requestConnection({ client, label = '', permissions, pollSecret, tenantId }) {
      const kind = String(client || '').trim().toLowerCase();
      if (!AGENT_CLIENTS[kind]) {
        throw Object.assign(new Error('UNKNOWN_CLIENT'), { status: 400 });
      }
      const secret = String(pollSecret || '');
      if (secret.length < 32) {
        throw Object.assign(new Error('POLL_SECRET_REQUIRED'), { status: 400 });
      }
      const pollHash = sha256(secret);
      const existing = await store.findPendingByPollHash(pollHash);
      if (existing) {
        const fresh = await expireIfNeeded(existing);
        if (fresh.status === 'pending') {
          return { connection: publicConnection(fresh), credential: null };
        }
      }
      const createdAt = now();
      const row = {
        id: `ac_${randomBytes(8).toString('hex')}`,
        tenant_id: tenantId,
        client_kind: kind,
        label: String(label || '').trim().slice(0, 40),
        requested_permissions: normalizePermissions(permissions),
        granted_permissions: [],
        match_code: matchCode(),
        poll_secret_hash: pollHash,
        credential_hash: null,
        credential_sealed: null,
        status: 'pending',
        approved_by_staff_id: null,
        approved_by_name: null,
        created_at: createdAt.toISOString(),
        expires_at: new Date(createdAt.getTime() + REQUEST_TTL_MS).toISOString(),
        approved_at: null,
        revoked_at: null,
        last_used_at: null,
        credential_delivered_at: null,
      };
      await store.insert(row);
      await audit(row, 'request', null, { detail: { permissions: row.requested_permissions } });
      return { connection: publicConnection(row), credential: null };
    },

    async poll({ id, pollSecret }) {
      const row = await expireIfNeeded(await store.get(id));
      if (!row || sha256(pollSecret || '') !== row.poll_secret_hash) {
        throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      }
      if (row.status !== 'approved' || !row.credential_sealed || row.credential_delivered_at) {
        return { connection: publicConnection(row), credential: null };
      }
      const credential = openSeal(key, row.credential_sealed);
      await store.update(row.id, {
        credential_sealed: null,
        credential_delivered_at: now().toISOString(),
      });
      return { connection: publicConnection({ ...row, credential_delivered_at: now().toISOString() }), credential };
    },

    async list(manager) {
      if (!isManager(manager)) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
      const rows = await store.listByTenant(manager.tenant_id || manager.business_id);
      const next = [];
      for (const row of rows) next.push(await expireIfNeeded(row));
      next.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return next.map((row) => publicConnection(row));
    },

    async decide(manager, id, decision) {
      if (!isManager(manager)) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
      const row = await expireIfNeeded(await store.get(id));
      if (!row || row.tenant_id !== (manager.tenant_id || manager.business_id)) {
        throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      }
      if (row.status !== 'pending') {
        throw Object.assign(new Error('NOT_PENDING'), { status: 409 });
      }
      const staffName = manager.display_name || manager.name || manager.username || 'מנהל';
      if (decision === 'reject') {
        const saved = await store.update(row.id, {
          status: 'rejected',
          approved_by_staff_id: manager.id,
          approved_by_name: staffName,
          credential_sealed: null,
        });
        await audit(saved, 'reject', manager);
        return publicConnection(saved);
      }
      const credential = TOKEN_PREFIX + randomBytes(32).toString('base64url');
      const saved = await store.update(row.id, {
        status: 'approved',
        granted_permissions: row.requested_permissions,
        credential_hash: sha256(credential),
        credential_sealed: seal(key, credential),
        approved_by_staff_id: String(manager.id),
        approved_by_name: staffName,
        approved_at: now().toISOString(),
      });
      await audit(saved, 'approve', manager, { detail: { permissions: saved.granted_permissions } });
      return publicConnection(saved);
    },

    async revoke(manager, id) {
      if (!isManager(manager)) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
      const row = await store.get(id);
      if (!row || row.tenant_id !== (manager.tenant_id || manager.business_id)) {
        throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      }
      if (row.status === 'revoked') return publicConnection(row);
      if (row.status !== 'approved') {
        throw Object.assign(new Error('NOT_ACTIVE'), { status: 409 });
      }
      const saved = await store.update(row.id, {
        status: 'revoked',
        revoked_at: now().toISOString(),
        credential_sealed: null,
      });
      await audit(saved, 'revoke', manager);
      return publicConnection(saved);
    },

    async authenticate(token) {
      const raw = String(token || '');
      if (!raw.startsWith(TOKEN_PREFIX)) return null;
      const row = await store.findByCredentialHash(sha256(raw));
      if (!row || row.status !== 'approved' || row.revoked_at) return null;
      const staff = await loadStaff(row.approved_by_staff_id);
      if (!staff || staff.is_active === false) return null;
      const tenantId = staff.tenant_id || staff.business_id;
      if (!tenantId || tenantId !== row.tenant_id) return null;
      await store.update(row.id, { last_used_at: now().toISOString() });
      return {
        id: staff.id,
        tenant_id: tenantId,
        role: staff.role,
        display_name: staff.display_name || staff.name,
        username: staff.username,
        is_active: true,
        allowed_units: staff.allowed_units || [],
        agent_connection_id: row.id,
        agent_permissions: row.granted_permissions || [],
        agent_client: row.client_kind,
      };
    },

    async recordUse(user, action, extra = {}) {
      if (!user?.agent_connection_id) return;
      const row = await store.get(user.agent_connection_id);
      if (!row) return;
      await audit(row, action, {
        id: user.id,
        display_name: user.display_name,
      }, extra);
    },

    async auditOf(id) {
      return store.listAudit(id);
    },
  };
}
