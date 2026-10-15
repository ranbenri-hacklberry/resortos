import { actorFrom, canUseOps, isOpsLead, tenantOf, unitAllowed, visibleOpsRows } from './opsAuthz.js';
import { agentAllows, readinessOf, scopeAgentUnitPatch, statusWriteMatches } from './agentConnections.js';
import { agentConnectionService, agentPrincipal, tryHandleAgentConnections } from './agentConnectionHttp.js';
import { publishBookingToMailbox } from './checkoutMailbox.js';

function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function dbKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || '';
}

function bearer(req) {
  const header = String(req.headers?.authorization || req.get?.('authorization') || '');
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : '';
}

function pathOf(req) {
  const raw = String(req.url || '').split('?')[0];
  return raw || '/';
}

function queryOf(req) {
  const raw = String(req.url || '');
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  return new URLSearchParams(q);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readJson(req) {
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

async function rpc(fn, args) {
  const key = dbKey();
  const response = await fetch(`${supabaseUrl()}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const err = new Error(data?.message || response.statusText);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function rest(method, pathAndQuery, body, extraHeaders = {}) {
  const key = dbKey();
  const response = await fetch(`${supabaseUrl()}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) {
    const err = new Error(data?.message || response.statusText);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function staffFrom(req) {
  const token = bearer(req);
  if (!token) return null;
  if (token.startsWith('ros_agent_')) {
    const agent = await agentPrincipal(token);
    if (!agent || !canUseOps(agent)) return null;
    return agent;
  }
  const user = await rpc('hotelos_me', { p_token: token });
  if (!canUseOps(user)) return null;
  return user;
}

function filterUnits(user, rows) {
  return visibleOpsRows(user, rows, 'id');
}

async function listUnits(user) {
  const tenant = tenantOf(user);
  const rows = await rest(
    'GET',
    `unit_operations?select=*&tenant_id=eq.${encodeURIComponent(tenant)}&limit=2000`
  );
  return filterUnits(user, Array.isArray(rows) ? rows : []);
}

async function listBookings(user, query) {
  const tenant = tenantOf(user);
  const from = query.get('from');
  const to = query.get('to');
  let filter = `hotelos_bookings?select=*&tenant_id=eq.${encodeURIComponent(tenant)}`;
  if (from && to) {
    filter += `&check_in_date=lt.${encodeURIComponent(to)}&check_out_date=gte.${encodeURIComponent(from)}`;
  }
  filter += '&limit=2000';
  const rows = await rest('GET', filter);
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((row) => unitAllowed(user, row.unit_id));
}

async function listCatalog(user) {
  const tenant = tenantOf(user);
  const wide = `resort_units?select=id,tenant_id,name,sort_order,unit_type,max_occupancy,base_price_agorot,is_active,updated_at,property_id,content,access&tenant_id=eq.${encodeURIComponent(tenant)}&order=sort_order.asc&limit=2000`;
  let rows;
  try {
    rows = await rest('GET', wide);
  } catch {
    rows = await rest(
      'GET',
      `resort_units?select=id,tenant_id,name,sort_order,unit_type,max_occupancy,base_price_agorot,is_active,updated_at&tenant_id=eq.${encodeURIComponent(tenant)}&order=sort_order.asc&limit=2000`
    );
  }
  return filterUnits(user, Array.isArray(rows) ? rows : []);
}

async function changesSince(user, cursor) {
  const tenant = tenantOf(user);
  const since = encodeURIComponent(cursor);
  const [units, bookings] = await Promise.all([
    rest('GET', `unit_operations?select=*&tenant_id=eq.${encodeURIComponent(tenant)}&updated_at=gt.${since}&order=updated_at.asc&limit=80`),
    rest('GET', `hotelos_bookings?select=*&tenant_id=eq.${encodeURIComponent(tenant)}&updated_at=gt.${since}&order=updated_at.asc&limit=80`)
  ]);
  const unitRows = Array.isArray(units) ? units : [];
  const bookingRows = Array.isArray(bookings) ? bookings : [];
  const stamps = [...unitRows, ...bookingRows].map((row) => row.updated_at).filter(Boolean).sort();
  return {
    units: visibleOpsRows(user, unitRows, 'id'),
    bookings: visibleOpsRows(user, bookingRows, 'unit_id'),
    cursor: stamps.length ? stamps[stamps.length - 1] : cursor
  };
}

function writeEvent(res, event, payload) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

async function streamEvents(req, res, user) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  let closed = false;
  const stop = () => { closed = true; };
  req.on('close', stop);
  res.on?.('close', stop);
  let cursor = new Date().toISOString();
  writeEvent(res, 'ready', { tenant_id: tenantOf(user) });
  while (!closed) {
    try {
      const batch = await changesSince(user, cursor);
      cursor = batch.cursor || cursor;
      for (const row of batch.units) writeEvent(res, 'unit', row);
      for (const row of batch.bookings) writeEvent(res, 'booking', row);
      if (!batch.units.length && !batch.bookings.length) res.write(`: ping\n\n`);
    } catch {
      closed = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function listWorkLog(user) {
  const tenant = tenantOf(user);
  const staffId = String(user.id);
  const rows = await rest(
    'GET',
    `resort_operations?select=id,unit_id,domain,reason,status,completed_at,completed_by,completed_by_name,assigned_staff,tenant_id&tenant_id=eq.${encodeURIComponent(tenant)}&status=eq.DONE&completed_by=eq.${encodeURIComponent(staffId)}&order=completed_at.desc&limit=120`
  );
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((row) => unitAllowed(user, row.unit_id));
}

const OPEN_UNIT_STATUSES = new Set(['DIRTY', 'MAINTENANCE_ALERT', 'GARDENING', 'IN_PROGRESS']);

function historyStatus(status) {
  if (status === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (status === 'READY') return 'DONE';
  return 'OPEN';
}

function opsSnapshotChanged(existing, row) {
  if ((existing?.operational_status || null) !== (row.operational_status || null)) return true;
  return JSON.stringify(existing?.quality_inspections || []) !== JSON.stringify(row.quality_inspections || []);
}

async function relatedBookingId(user, unitId) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const rows = await rest(
    'GET',
    `hotelos_bookings?select=id,check_in_date,check_out_date,booking_status,deleted_at&tenant_id=eq.${encodeURIComponent(tenantOf(user))}&unit_id=eq.${encodeURIComponent(unitId)}&limit=40`
  );
  const active = (Array.isArray(rows) ? rows : []).filter((row) => !row.deleted_at && row.booking_status !== 'CANCELED');
  const departing = active.find((row) => row.check_out_date === today || row.booking_status === 'CHECKED_OUT');
  if (departing?.id) return departing.id;
  const arriving = active.find((row) => row.check_in_date === today);
  if (arriving?.id) return arriving.id;
  const staying = active.find((row) => today >= row.check_in_date && today < row.check_out_date);
  return staying?.id || null;
}

async function recordOperation(user, unitId, row, existing) {
  if (!opsSnapshotChanged(existing, row) || !row.operational_status) {
    return row.current_operation_id || existing?.current_operation_id || null;
  }
  const prevStatus = existing?.operational_status || null;
  const nextStatus = row.operational_status;
  const nextOpen = OPEN_UNIT_STATUSES.has(nextStatus);
  let operationId = prevStatus === 'READY' && nextOpen
    ? null
    : (row.current_operation_id || existing?.current_operation_id || null);
  if (!operationId) {
    const open = await rest(
      'GET',
      `resort_operations?select=id&tenant_id=eq.${encodeURIComponent(tenantOf(user))}&unit_id=eq.${encodeURIComponent(unitId)}&completed_at=is.null&order=created_at.desc&limit=1`
    );
    operationId = Array.isArray(open) && open[0]?.id ? open[0].id : null;
  }
  const actor = actorFrom(user);
  const now = row.updated_at || new Date().toISOString();
  const patch = {
    domain: row.operational_domain || 'HOUSEKEEPING',
    reason: row.custom_reason || null,
    assigned_staff: row.assigned_staff || actor.name,
    sop_progress: row.sop_progress || {},
    quality_inspections: Array.isArray(row.quality_inspections) ? row.quality_inspections : [],
    rework_count: Number(row.rework_count) || 0,
    updated_at: now,
    ...(user?.agent_connection_id ? {
      agent_connection_id: user.agent_connection_id,
      actor_staff_id: actor.id,
      actor_staff_name: actor.name,
    } : {}),
  };
  if (nextOpen && !operationId) {
    const created = await rest('POST', 'resort_operations', {
      tenant_id: tenantOf(user),
      unit_id: unitId,
      booking_id: await relatedBookingId(user, unitId),
      status: historyStatus(nextStatus),
      started_at: row.cleaning_started_at || (nextStatus === 'IN_PROGRESS' ? now : null),
      ...patch
    }, { Prefer: 'return=representation' });
    const createdRow = Array.isArray(created) ? created[0] : created;
    return createdRow?.id || null;
  }
  if (operationId && nextOpen) {
    await rest('PATCH', `resort_operations?id=eq.${encodeURIComponent(operationId)}`, {
      status: historyStatus(nextStatus),
      started_at: row.cleaning_started_at || null,
      ...patch
    }, { Prefer: 'return=minimal' });
    return operationId;
  }
  if (nextStatus === 'READY' && prevStatus !== 'READY') {
    const done = {
      ...patch,
      status: 'DONE',
      completed_at: now,
      completed_by: actor.id,
      completed_by_name: actor.name,
      started_at: row.cleaning_started_at || null
    };
    if (operationId) {
      await rest('PATCH', `resort_operations?id=eq.${encodeURIComponent(operationId)}`, done, { Prefer: 'return=minimal' });
      return operationId;
    }
    const created = await rest('POST', 'resort_operations', {
      tenant_id: tenantOf(user),
      unit_id: unitId,
      booking_id: await relatedBookingId(user, unitId),
      ...done
    }, { Prefer: 'return=representation' });
    const createdRow = Array.isArray(created) ? created[0] : created;
    return createdRow?.id || null;
  }
  return operationId;
}

async function saveUnit(user, unitId, body) {
  if (!unitAllowed(user, unitId)) {
    const err = new Error('FORBIDDEN');
    err.status = 403;
    throw err;
  }
  const existingRows = await rest(
    'GET',
    `unit_operations?select=*&id=eq.${encodeURIComponent(unitId)}&limit=1`
  );
  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  if (existing && existing.tenant_id && existing.tenant_id !== tenantOf(user)) {
    const err = new Error('FORBIDDEN');
    err.status = 403;
    throw err;
  }
  const row = {
    ...(existing || {}),
    ...(body || {}),
    id: unitId,
    tenant_id: tenantOf(user),
    updated_at: new Date().toISOString()
  };
  delete row.completed_by;
  delete row.completed_by_name;
  try {
    row.current_operation_id = await recordOperation(user, unitId, row, existing);
  } catch (err) {
    console.warn('[OPS HISTORY]', err?.message || err);
  }
  const saved = await rest(
    'POST',
    'unit_operations?on_conflict=id',
    row,
    { Prefer: 'resolution=merge-duplicates,return=representation' }
  );
  // Real-time webhook to guest stay page
  syncUnitStatusToGuestMailbox(unitId, row.operational_status).catch(() => {});
  return Array.isArray(saved) ? saved[0] : row;
}

async function syncUnitStatusToGuestMailbox(unitId, operationalStatus) {
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    const bookings = await rest(
      'GET',
      `hotelos_bookings?unit_id=eq.${encodeURIComponent(unitId)}&deleted_at=is.null&booking_status=neq.CANCELED&check_out_date=gte.${today}&select=*&order=check_in_date.asc&limit=3`
    );
    if (!Array.isArray(bookings) || !bookings.length) return;
    const active = bookings.find((b) => (b.check_in_date || '') <= today && (b.check_out_date || '') >= today) || bookings[0];
    if (!active?.checkout_token) return;
    const updated = {
      ...active,
      stay: {
        ...(active.stay || {}),
        operational_status: operationalStatus,
        cabin_ready: operationalStatus === 'READY',
      }
    };
    await publishBookingToMailbox(updated);
    console.log(`[GUEST WEBHOOK] Published ${unitId} (${operationalStatus}) to guest stay ${active.checkout_token}`);
  } catch (err) {
    console.warn('[GUEST WEBHOOK ERROR]', unitId, err?.message || err);
  }
}

async function saveSopTemplate(user, body) {
  if (!isOpsLead(user)) {
    const err = new Error('FORBIDDEN');
    err.status = 403;
    throw err;
  }
  const id = String(body?.id || '').trim();
  if (!id) {
    const err = new Error('TEMPLATE_REQUIRED');
    err.status = 400;
    throw err;
  }
  const existingRows = await rest(
    'GET',
    `sop_templates?select=id,tenant_id&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  if (existing?.tenant_id && existing.tenant_id !== tenantOf(user)) {
    const err = new Error('FORBIDDEN');
    err.status = 403;
    throw err;
  }
  const row = {
    id,
    tenant_id: tenantOf(user),
    domain: body?.domain || null,
    title: body?.title && typeof body.title === 'object' ? body.title : {},
    steps: Array.isArray(body?.steps) ? body.steps : [],
    updated_at: new Date().toISOString()
  };
  const saved = await rest(
    'POST',
    'sop_templates?on_conflict=tenant_id,id',
    row,
    { Prefer: 'resolution=merge-duplicates,return=representation' }
  );
  return Array.isArray(saved) ? saved[0] : row;
}

function opsRoute(req) {
  const path = pathOf(req);
  if (req.method === 'GET' && (
    path === '/api/ops/units'
    || path === '/api/ops/bookings'
    || path === '/api/ops/work-log'
    || path === '/api/ops/catalog'
    || path === '/api/ops/sop-templates'
    || path === '/api/ops/events'
  )) {
    return { path };
  }
  const unitMatch = path.match(/^\/api\/ops\/units\/([^/]+)$/);
  if (req.method === 'PUT' && unitMatch) return { path, unitId: decodeURIComponent(unitMatch[1]) };
  if (req.method === 'PUT' && path === '/api/ops/sop-templates') return { path };
  return null;
}

export async function tryHandleOps(req, res) {
  if (await tryHandleAgentConnections(req, res)) return true;
  const route = opsRoute(req);
  if (!route) return false;
  const { path } = route;
  try {
    if (!dbKey()) {
      send(res, 503, { error: 'DB_NOT_CONFIGURED' });
      return true;
    }
    const user = await staffFrom(req);
    if (!user) {
      send(res, 401, { error: 'UNAUTHORIZED' });
      return true;
    }
    if (user.agent_connection_id && !agentAllows(user, 'read')) {
      send(res, 403, { error: 'FORBIDDEN' });
      return true;
    }
    if (req.method === 'GET' && path === '/api/ops/units') {
      const units = await listUnits(user);
      if (user.agent_connection_id) {
        await agentConnectionService().recordUse(user, 'read');
      }
      send(res, 200, { units, tenant_id: tenantOf(user) });
      return true;
    }
    if (req.method === 'GET' && path === '/api/ops/bookings') {
      send(res, 200, { bookings: await listBookings(user, queryOf(req)), tenant_id: tenantOf(user) });
      return true;
    }
    if (req.method === 'GET' && path === '/api/ops/work-log') {
      send(res, 200, { rows: await listWorkLog(user) });
      return true;
    }
    if (req.method === 'GET' && path === '/api/ops/catalog') {
      send(res, 200, { units: await listCatalog(user), tenant_id: tenantOf(user) });
      return true;
    }
    if (req.method === 'GET' && path === '/api/ops/sop-templates') {
      const tenant = tenantOf(user);
      const rows = await rest(
        'GET',
        `sop_templates?select=id,domain,title,steps,updated_at&tenant_id=eq.${encodeURIComponent(tenant)}&limit=50`
      );
      send(res, 200, { templates: Array.isArray(rows) ? rows : [], tenant_id: tenant });
      return true;
    }
    if (req.method === 'GET' && path === '/api/ops/events') {
      await streamEvents(req, res, user);
      return true;
    }
    if (req.method === 'PUT' && path === '/api/ops/sop-templates') {
      if (user.agent_connection_id) {
        send(res, 403, { error: 'FORBIDDEN' });
        return true;
      }
      const body = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
        ? req.body
        : await readJson(req);
      const template = await saveSopTemplate(user, body);
      send(res, 200, { template });
      return true;
    }
    const body = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? req.body
      : await readJson(req);
    if (user.agent_connection_id) {
      if (!agentAllows(user, 'room_status')) {
        send(res, 403, { error: 'FORBIDDEN' });
        return true;
      }
      const known = await listUnits(user);
      const match = known.find((row) => row.id === route.unitId);
      if (!match) {
        send(res, 404, { error: 'UNIT_NOT_FOUND' });
        return true;
      }
      const intended = scopeAgentUnitPatch(match, body);
      await saveUnit(user, route.unitId, intended);
      const fresh = (await listUnits(user)).find((row) => row.id === route.unitId) || null;
      if (!statusWriteMatches(intended, fresh)) {
        send(res, 409, { error: 'STATUS_NOT_VERIFIED', unit: fresh, readiness: readinessOf(fresh) });
        return true;
      }
      await agentConnectionService().recordUse(user, 'room_status', {
        unit_id: route.unitId,
        detail: { readiness: readinessOf(fresh), operational_status: fresh.operational_status },
      });
      send(res, 200, { unit: fresh, readiness: readinessOf(fresh) });
      return true;
    }
    const unit = await saveUnit(user, route.unitId, body);
    send(res, 200, { unit });
    return true;
  } catch (err) {
    const status = Number(err.status) || 500;
    send(res, status, { error: status === 403 ? 'FORBIDDEN' : (err.message || 'OPS_FAILED') });
    return true;
  }
}
