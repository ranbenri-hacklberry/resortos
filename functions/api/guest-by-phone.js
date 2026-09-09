import { errorJson, fetchPostgrest, getPostgrestConfig, isLocalPostgrestUrl, json } from './_db.js';
import { guestContextPayload } from '../lib/guestContext.js';
import { loadCalendarReplica } from '../lib/calendarReplica.js';
import { normalizeGuestPhone } from '../lib/guestPhone.js';

function corsJson(data, status = 200) {
  return json(data, status, {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key'
  });
}

function expectedApiKey(env) {
  return String(env?.GROK_BOT_API_KEY || env?.GUEST_CONTEXT_API_KEY || '').trim();
}

function providedApiKey(request) {
  const header = String(request.headers.get('x-api-key') || '').trim();
  if (header) return header;
  const auth = String(request.headers.get('authorization') || '');
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  return bearer ? bearer[1].trim() : '';
}

function apiKeyOk(provided, expected) {
  if (!expected || !provided) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function loadUnitNames(env, unitIds) {
  const ids = [...new Set((unitIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const listed = ids.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
  const res = await fetchPostgrest(`/resort_units?id=in.(${listed})&select=id,name`, { method: 'GET' }, env);
  if (!res || !res.ok) return {};
  const rows = await res.json().catch(() => []);
  const names = {};
  for (const row of rows || []) {
    if (row?.id) names[row.id] = row.name || '';
  }
  return names;
}

async function rowsFromPostgrest(env, tail) {
  const { baseUrl, tenantId } = getPostgrestConfig(env);
  if (isLocalPostgrestUrl(baseUrl)) return null;
  const query = [
    `/hotelos_bookings?tenant_id=eq.${tenantId}`,
    'deleted_at=is.null',
    `guest_phone=like.*${encodeURIComponent(tail)}*`,
    'select=id,unit_id,guest_name,guest_phone,check_in_date,check_out_date,booking_status,adults_count,children_count,special_requests',
    'order=check_in_date.asc',
    'limit=40'
  ].join('&');
  const res = await fetchPostgrest(query, { method: 'GET' }, env);
  if (!res || !res.ok) return null;
  return res.json().catch(() => []);
}

async function rowsFromReplica(env, tail) {
  const packed = await loadCalendarReplica(env);
  if (packed) {
    const list = packed.byTail?.[tail];
    return Array.isArray(list) ? list : [];
  }
  return packed ? [] : null;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return corsJson({ ok: true });
  if (request.method !== 'GET') return errorJson('Method not allowed', 405, 'METHOD_NOT_ALLOWED');

  const expected = expectedApiKey(env);
  if (!expected) return corsJson({ error: 'API_KEY_NOT_CONFIGURED' }, 503);
  if (!apiKeyOk(providedApiKey(request), expected)) return corsJson({ error: 'UNAUTHORIZED' }, 401);

  const url = new URL(request.url);
  const raw = url.searchParams.get('phone')
    || url.searchParams.get('sender')
    || url.searchParams.get('wa')
    || url.searchParams.get('wa_id')
    || '';
  const parsed = normalizeGuestPhone(raw);
  if (!parsed.tail) return corsJson({ found: false, phone: '', suggestions: [] });

  let rows = await rowsFromReplica(env, parsed.tail);
  if (!rows) rows = await rowsFromPostgrest(env, parsed.tail);
  if (!rows) {
    return corsJson({
      found: false,
      phone: parsed.e164,
      suggestions: [],
      error: 'CALENDAR_UNAVAILABLE'
    }, 200);
  }

  const unitNames = await loadUnitNames(env, rows.map((row) => row.unit_id));
  return corsJson(guestContextPayload(rows, raw, unitNames));
}
