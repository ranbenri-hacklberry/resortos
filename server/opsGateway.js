import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { actorFrom, canUseOps, isOpsLead, tenantOf, unitAllowed, visibleOpsRows } from './opsAuthz.js';
import { agentAllows, readinessOf, scopeAgentUnitPatch, statusWriteMatches } from './agentConnections.js';
import { agentConnectionService, agentPrincipal, tryHandleAgentConnections } from './agentConnectionHttp.js';
import { publishBookingToMailbox } from './checkoutMailbox.js';
import { appendRoomLog, buildRoomLogEvents } from '../src/lib/roomLog.js';
import { addCashCollection, applyPaymentStatus } from '../src/lib/cashCollect.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const nightHolds = new Set();

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
  if (token) {
    if (token.startsWith('ros_agent_')) {
      const agent = await agentPrincipal(token);
      if (!agent || !canUseOps(agent)) return null;
      return agent;
    }
    const user = await rpc('hotelos_me', { p_token: token });
    if (!canUseOps(user)) return null;
    return user;
  }
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (isLocal && req.headers?.['x-resortos-agent'] === 'true') {
    return {
      id: 'agent_local',
      username: 'whatsapp-agent',
      display_name: 'סוכן ווטסאפ',
      role: 'MANAGER',
      tenant_id: '22222222-2222-2222-2222-222222222222',
      is_active: true
    };
  }
  return null;
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
  const quote = typeof body?.room_log_note === 'string' ? body.room_log_note : '';
  const cash = body?.room_log_cash && typeof body.room_log_cash === 'object' ? body.room_log_cash : null;
  const logActor = typeof body?.room_log_actor === 'string' ? body.room_log_actor : '';
  delete row.room_log_note;
  delete row.room_log_cash;
  delete row.room_log_actor;
  const logged = buildRoomLogEvents(existing, { ...row, ...(cash ? { room_log_cash: cash } : {}), ...(logActor ? { room_log_actor: logActor } : {}) }, quote, row.updated_at);
  const kept = existing?.sop_progress && typeof existing.sop_progress === 'object' ? existing.sop_progress : {};
  const incoming = row.sop_progress && typeof row.sop_progress === 'object' ? row.sop_progress : null;
  if (logged.length || (incoming && Array.isArray(kept.roomLog))) {
    const { roomLog: _ignored, ...rest } = incoming || {};
    row.sop_progress = appendRoomLog({ ...kept, ...rest, roomLog: kept.roomLog }, logged);
  }
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

function jerusalemToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

async function bookingOnUnitToday(user, unitId) {
  const today = jerusalemToday();
  const tenant = tenantOf(user);
  const rows = await rest(
    'GET',
    `hotelos_bookings?select=*&tenant_id=eq.${encodeURIComponent(tenant)}&unit_id=eq.${encodeURIComponent(unitId)}&deleted_at=is.null&booking_status=neq.CANCELED&check_in_date=lte.${today}&check_out_date=gte.${today}&limit=20`
  );
  const list = Array.isArray(rows) ? rows : [];
  const staying = list.find((row) => row.check_in_date < today && row.check_out_date > today);
  const leaving = list.find((row) => row.check_out_date === today);
  const arriving = list.find((row) => row.check_in_date === today);
  return staying || leaving || arriving || null;
}

async function collectUnitCash(user, unitId, body) {
  const amount = Math.round(Number(body?.amount_agorot) || 0);
  if (!(amount > 0)) {
    const err = new Error('AMOUNT_REQUIRED');
    err.status = 400;
    throw err;
  }
  const today = jerusalemToday();
  const booking = await bookingOnUnitToday(user, unitId);
  if (!booking) return { ok: false, skipped: 'no_booking' };
  const at = new Date().toISOString();
  const collector = String(body?.reported_by || user?.name || 'משרד').slice(0, 80);
  const { booking: next } = addCashCollection(booking, { amountAgorot: amount, collector, at, today });
  await rest(
    'PATCH',
    `hotelos_bookings?id=eq.${encodeURIComponent(booking.id)}`,
    {
      clearing_payments: next.clearing_payments,
      payment_status: next.payment_status,
      payment_mode: next.payment_mode,
      cash_collected_by: next.cash_collected_by,
      cash_receipt_at: next.cash_receipt_at,
      updated_at: next.updated_at
    },
    { Prefer: 'return=minimal' }
  );
  await saveUnit(user, unitId, {
    room_log_note: String(body?.note || '').slice(0, 500),
    room_log_cash: { amount_agorot: amount, actor: collector }
  });
  return { ok: true, guest_name: booking.guest_name || '', amount_agorot: amount, payment_status: booking.payment_status || 'UNPAID' };
}

async function setUnitPaymentStatus(user, unitId, body) {
  const status = body?.payment_status === 'PARTIAL' || body?.payment_status === 'PAID' ? body.payment_status : '';
  if (!status) {
    const err = new Error('STATUS_REQUIRED');
    err.status = 400;
    throw err;
  }
  const booking = await bookingOnUnitToday(user, unitId);
  if (!booking) return { ok: false, skipped: 'no_booking' };
  const at = new Date().toISOString();
  const next = applyPaymentStatus(booking, status, at);
  const collector = String(body?.reported_by || user?.name || 'משרד').slice(0, 80);
  await rest(
    'PATCH',
    `hotelos_bookings?id=eq.${encodeURIComponent(booking.id)}`,
    { payment_status: next.payment_status, updated_at: next.updated_at },
    { Prefer: 'return=minimal' }
  );
  // Push the new payment status to the cloud stay record so guest check-in sees it.
  if (booking.checkout_token) {
    publishBookingToMailbox({ ...booking, payment_status: next.payment_status, updated_at: next.updated_at })
      .catch((err) => console.warn('[PAYMENT PUBLISH]', booking.id, err?.message || err));
  }
  const label = status === 'PARTIAL' ? 'שולם חלקית' : 'שולם';
  await saveUnit(user, unitId, {
    room_log_actor: collector,
    room_log_note: `סטטוס תשלום: ${label}`
  });
  return { ok: true, guest_name: booking.guest_name || '', payment_status: status };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runKinorotHold(unitId) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'server/kinorotHold.js'), String(unitId || '')], { cwd: ROOT });
    let out = '';
    let errText = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(Object.assign(new Error('כינורות לא הגיב'), { status: 502 }));
    }, 50000);
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { errText += chunk; });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(Object.assign(new Error('כינורות לא שמר את החסימה'), { status: 502 }));
        }
        return;
      }
      const error = new Error(String(errText || '').trim() || 'החסימה בכינורות נכשלה');
      error.status = code === 400 || code === 409 ? code : 502;
      reject(error);
    });
  });
}

async function waitForKinorotSync(control, since, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = control.readKinorotSyncStatus();
    if (!status.running && status.lastError && status.lastAttemptAt && status.lastAttemptAt >= since) {
      const error = new Error(status.lastError);
      error.status = 502;
      throw error;
    }
    if (!status.running && status.lastOkAt && status.lastOkAt >= since) return status;
    await sleep(3000);
  }
  return null;
}

async function kinHoldVisible(placeId, resId) {
  const id = `kin_${placeId}_${resId}`;
  const rows = await rest(
    'GET',
    `hotelos_bookings?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=id,unit_id,check_in_date,check_out_date&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function holdUnitNight(user, unitId, body) {
  if (!unitAllowed(user, unitId)) {
    const err = new Error('FORBIDDEN');
    err.status = 403;
    throw err;
  }
  if (nightHolds.has(unitId)) return { ok: false, skipped: 'in_progress' };
  nightHolds.add(unitId);
  try {
    const created = await runKinorotHold(unitId);
    const control = await import('./kinorotSyncControl.js');
    const running = control.readKinorotSyncStatus();
    if (running.running) {
      await waitForKinorotSync(control, running.lastAttemptAt || new Date(0).toISOString(), 90000).catch(() => null);
    }
    const syncFrom = new Date().toISOString();
    control.startKinorotSync({ quick: true });
    const finished = await waitForKinorotSync(control, syncFrom, 90000).catch(() => null);
    const seen = finished ? await kinHoldVisible(created.placeId, created.resId) : null;
    const collector = String(body?.reported_by || user?.name || 'משרד').slice(0, 80);
    await saveUnit(user, unitId, {
      room_log_actor: collector,
      room_log_note: seen ? 'נחסם ללילה ביומן כינורות' : 'החסימה נשמרה בכינורות, היומן עדיין לא נקלט'
    });
    return {
      ok: true,
      verified: Boolean(seen),
      resId: created.resId,
      checkIn: created.checkIn,
      checkOut: created.checkOut
    };
  } finally {
    nightHolds.delete(unitId);
  }
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
  const cashMatch = path.match(/^\/api\/ops\/units\/([^/]+)\/cash$/);
  if (req.method === 'POST' && cashMatch) return { path, unitId: decodeURIComponent(cashMatch[1]), cash: true };
  const paymentMatch = path.match(/^\/api\/ops\/units\/([^/]+)\/payment$/);
  if (req.method === 'POST' && paymentMatch) return { path, unitId: decodeURIComponent(paymentMatch[1]), payment: true };
  const holdMatch = path.match(/^\/api\/ops\/units\/([^/]+)\/hold$/);
  if (req.method === 'POST' && holdMatch) return { path, unitId: decodeURIComponent(holdMatch[1]), hold: true };
  const unitMatch = path.match(/^\/api\/ops\/units\/([^/]+)$/);
  if (req.method === 'PUT' && unitMatch) return { path, unitId: decodeURIComponent(unitMatch[1]) };
  if (req.method === 'PUT' && path === '/api/ops/sop-templates') return { path };
  if (req.method === 'POST' && path === '/api/ops/guest-sms') return { path };
  if ((req.method === 'GET' || req.method === 'POST') && path === '/api/ops/grounds') return { path };
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
    if (path === '/api/ops/grounds') {
      if (req.method === 'POST' && user.agent_connection_id && !agentAllows(user, 'room_status')) {
        send(res, 403, { error: 'FORBIDDEN' });
        return true;
      }
      const { readGrounds, setGroundStatus } = await import('./groundsStatus.js');
      if (req.method === 'GET') {
        send(res, 200, { assets: readGrounds() });
        return true;
      }
      const body = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
        ? req.body
        : await readJson(req);
      const assets = setGroundStatus({
        id: body?.id,
        status: body?.status,
        by: body?.reported_by || user?.name || 'צוות',
        note: body?.note
      });
      send(res, 200, { assets, asset: assets[body?.id] || null });
      return true;
    }
    if (req.method === 'POST' && path === '/api/ops/guest-sms') {
      if (user.agent_connection_id && !agentAllows(user, 'room_status')) {
        send(res, 403, { error: 'FORBIDDEN' });
        return true;
      }
      const body = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
        ? req.body
        : await readJson(req);
      const { sendManagerGuestLink } = await import('./guestComms.js');
      const row = await sendManagerGuestLink({
        bookingId: body?.booking_id,
        phone: body?.phone,
        message: body?.message,
        actor: body?.reported_by || user?.name || 'agent'
      });
      send(res, 200, { ok: true, id: row?.id || null });
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
    if (route.cash || route.payment || route.hold) {
      if (user.agent_connection_id && !agentAllows(user, 'room_status')) {
        send(res, 403, { error: 'FORBIDDEN' });
        return true;
      }
      const result = route.hold
        ? await holdUnitNight(user, route.unitId, body)
        : route.payment
          ? await setUnitPaymentStatus(user, route.unitId, body)
          : await collectUnitCash(user, route.unitId, body);
      send(res, 200, result);
      return true;
    }
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
      if (typeof body?.room_log_note === 'string' && body.room_log_note.trim()) {
        intended.room_log_note = body.room_log_note.trim().slice(0, 500);
      }
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
