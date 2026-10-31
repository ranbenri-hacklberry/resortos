import { json, errorJson, fetchPostgrest, getPostgrestConfig } from '../_db.js';
import { loadCalendarReplica } from '../../lib/calendarReplica.js';

const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';

const DEFAULT_UNITS = [
  { id: 'k826', name: 'קאסה נובה · Aura', sort_order: 0, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k827', name: 'קאסה נובה · Bloom', sort_order: 1, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' },
  { id: 'hill-1', name: 'צימר בגבעה 1', sort_order: 3, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'hill-2', name: 'צימר בגבעה 2', sort_order: 4, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'hill-3', name: 'צימר בגבעה 3', sort_order: 5, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'hill-4', name: 'צימר בגבעה 4', sort_order: 6, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'dome-blue', name: 'כיפת שמיים כחול', sort_order: 7, unit_type: 'dome', max_occupancy: 2, operational_status: 'READY' },
  { id: 'dome-red', name: 'כיפת שמיים אדום', sort_order: 8, unit_type: 'dome', max_occupancy: 2, operational_status: 'READY' },
  { id: 'dome-green', name: 'כיפת שמיים ירוק', sort_order: 9, unit_type: 'dome', max_occupancy: 2, operational_status: 'READY' },
  { id: 'mialis-villa', name: 'וילה מיאליס ריזורט', sort_order: 10, unit_type: 'villa', max_occupancy: 23, operational_status: 'READY' },
  { id: 'suite-1', name: 'סוויטה 1 (הירוקה)', sort_order: 11, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' },
  { id: 'suite-2', name: 'סוויטה 2 (הורודה)', sort_order: 12, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k671', name: 'Ⓖ23 בתי נורית 1', sort_order: 13, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k673', name: 'Ⓖ23 בתי נורית 2', sort_order: 14, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k674', name: 'Ⓖ23 בתי נורית 3', sort_order: 15, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k675', name: 'Ⓖ23 בתי נורית 4', sort_order: 16, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k676', name: 'Ⓖ23 בתי נורית 5', sort_order: 17, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k677', name: 'Ⓖ23 בתי נורית 6', sort_order: 18, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k808', name: "Ⓔ25 טאג' מאהל · בקתה 1", sort_order: 21, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k809', name: "Ⓔ25 טאג' מאהל · בקתה 2", sort_order: 22, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k810', name: "Ⓔ25 טאג' מאהל · בקתה 3", sort_order: 23, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k811', name: "Ⓔ25 טאג' מאהל · בקתה 4", sort_order: 24, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k680', name: 'Ⓐ29 מול הנוף · בקתה 1', sort_order: 25, unit_type: 'cabin', max_occupancy: 5, operational_status: 'READY' },
  { id: 'k681', name: 'Ⓐ29 מול הנוף · בקתה 2', sort_order: 26, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k685', name: 'Ⓑ28 נופים בלבן · בקתה 1', sort_order: 30, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k687', name: 'Ⓒ27 טוסקנה · 1', sort_order: 32, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k690', name: 'Ⓓ26 חצר מוסיקלית · בקתה 1', sort_order: 35, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k691', name: 'Ⓓ26 חצר מוסיקלית · בקתה 2', sort_order: 36, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k693', name: 'Ⓕ24 בקתות מאיה · בקתה 1', sort_order: 38, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' }
];

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret || 'dashboard_secret')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifySessionToken(env, token) {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  const expected = await hmacHex(env.CHECKOUT_MAILBOX_SECRET || env.HOTELOS_DESK_PIN || 'dashboard_salt', encoded);
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    if (Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function isAuthorizedOps(request, env) {
  const mailboxHeader = request.headers.get('x-hotelos-mailbox') || '';
  const bridgeHeader = request.headers.get('x-hotelos-bridge-secret') || '';
  const mailboxSecret = String(env?.CHECKOUT_MAILBOX_SECRET || '').trim();
  const bridgeSecret = String(env?.HOTELOS_API_SECRET || '').trim();
  const deskPin = String(env?.HOTELOS_DESK_PIN || '').trim();

  if (mailboxSecret && mailboxHeader === mailboxSecret) return true;
  if (bridgeSecret && bridgeHeader === bridgeSecret) return true;

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token) {
    if (deskPin && token === deskPin) return true;
    if (mailboxSecret && token === mailboxSecret) return true;
    const session = await verifySessionToken(env, token);
    if (session) return true;
  }

  // Allow in environments without secrets configured
  if (!mailboxSecret && !bridgeSecret && !deskPin) return true;

  return false;
}

export async function onRequest(context) {
  const { request, params, env } = context;
  const pathParts = params?.path || [];
  const head = pathParts[0] || '';
  const sub = pathParts[1] || '';
  const { tenantId } = getPostgrestConfig(env);

  if (request.method === 'OPTIONS') {
    return json({ ok: true });
  }

  // 1. GET /api/ops/units
  if (head === 'units' && request.method === 'GET' && !sub) {
    if (!(await isAuthorizedOps(request, env))) {
      return errorJson('לא מורשה', 401, 'UNAUTHORIZED');
    }

    try {
      const res = await fetchPostgrest('/unit_operations?select=*', { method: 'GET' }, env);
      if (res && res.ok) {
        const liveUnits = await res.json();
        if (Array.isArray(liveUnits) && liveUnits.length > 0) {
          return json({ ok: true, units: liveUnits, tenant_id: tenantId || DEMO_TENANT_ID });
        }
      }
    } catch (_) {}

    // Authoritative replica fallback from D1 guest_context
    const replica = await loadCalendarReplica(env);
    if (Array.isArray(replica?.unitOps) && replica.unitOps.length > 0) {
      return json({ ok: true, units: replica.unitOps, tenant_id: tenantId || DEMO_TENANT_ID });
    }

    const catalog = Array.isArray(replica?.units) && replica.units.length > 0 ? replica.units : DEFAULT_UNITS;
    const cleanUnits = catalog.map((u, idx) => ({
      id: u.id || u.cabin_id,
      name: u.name || u.cabin_name,
      sort_order: u.sort_order ?? idx,
      tenant_id: tenantId || DEMO_TENANT_ID,
      operational_status: 'READY',
      operational_domain: 'HOUSEKEEPING',
      staff_occupancy: 'VACANT',
      custom_reason: '',
      assigned_staff: '',
      is_escalated: false,
      is_active: true,
      updated_at: new Date().toISOString()
    }));
    return json({ ok: true, units: cleanUnits, tenant_id: tenantId || DEMO_TENANT_ID });
  }

  // 2. PUT /api/ops/units/:id
  if (head === 'units' && request.method === 'PUT' && sub) {
    if (!(await isAuthorizedOps(request, env))) {
      return errorJson('לא מורשה', 401, 'UNAUTHORIZED');
    }

    let body = {};
    try { body = await request.json(); } catch {}
    const now = new Date().toISOString();
    const patch = { ...body, id: sub, updated_at: now };

    // 1. If PostgREST reachable, update Supabase
    try {
      await fetchPostgrest(`/unit_operations?id=eq.${encodeURIComponent(sub)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      }, env);
    } catch (_) {}

    // 2. Persist to D1 calendar replica so status change survives and reflects on edge
    if (env?.STAY_DB) {
      try {
        const existing = await env.STAY_DB.prepare('SELECT payload FROM guest_context WHERE id = ?1').bind('all').first();
        if (existing?.payload) {
          const payload = JSON.parse(existing.payload);
          let unitOps = Array.isArray(payload.unitOps) ? [...payload.unitOps] : [];
          const idx = unitOps.findIndex((u) => u.id === sub);
          if (idx >= 0) {
            unitOps[idx] = { ...unitOps[idx], ...patch };
          } else {
            unitOps.push(patch);
          }
          payload.unitOps = unitOps;
          await env.STAY_DB.prepare(
            'INSERT OR REPLACE INTO guest_context (id, payload, synced_at) VALUES (?1, ?2, ?3)'
          ).bind('all', JSON.stringify(payload), now).run();
        }
      } catch (err) {
        console.warn('[D1 Unit Update Error]', err);
      }
    }

    return json({ ok: true, unit: patch });
  }

  // 3. GET /api/ops/catalog
  if (head === 'catalog' && request.method === 'GET') {
    if (!(await isAuthorizedOps(request, env))) {
      return errorJson('לא מורשה', 401, 'UNAUTHORIZED');
    }

    try {
      const res = await fetchPostgrest('/resort_units?select=*&order=sort_order.asc', { method: 'GET' }, env);
      if (res && res.ok) {
        const liveCatalog = await res.json();
        if (Array.isArray(liveCatalog) && liveCatalog.length > 0) {
          return json({ ok: true, units: liveCatalog, tenant_id: tenantId || DEMO_TENANT_ID });
        }
      }
    } catch (_) {}

    const replica = await loadCalendarReplica(env);
    if (Array.isArray(replica?.units) && replica.units.length > 0) {
      const mapped = replica.units.map((u, idx) => ({
        id: u.id || u.cabin_id,
        name: u.name || u.cabin_name,
        sort_order: u.sort_order ?? idx,
        unit_type: 'cabin',
        max_occupancy: 4,
        operational_status: 'READY'
      }));
      return json({ ok: true, units: mapped, tenant_id: tenantId || DEMO_TENANT_ID });
    }

    return json({ ok: true, units: DEFAULT_UNITS, tenant_id: tenantId || DEMO_TENANT_ID });
  }

  // 4. GET /api/ops/bookings
  if (head === 'bookings' && request.method === 'GET') {
    if (!(await isAuthorizedOps(request, env))) {
      return errorJson('לא מורשה', 401, 'UNAUTHORIZED');
    }

    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    try {
      let query = '/hotelos_bookings?select=*';
      if (from && to) {
        query += `&check_in_date=lt.${encodeURIComponent(to)}&check_out_date=gte.${encodeURIComponent(from)}&order=id.asc`;
      } else {
        query += '&order=check_in_date.asc';
      }
      const liveBookings = [];
      const pageSize = 1000;
      const maxPages = from && to ? 20 : 1;
      let pulled = false;
      for (let page = 0; page < maxPages; page += 1) {
        const res = await fetchPostgrest(`${query}&limit=${pageSize}&offset=${page * pageSize}`, { method: 'GET' }, env);
        if (!res || !res.ok) break;
        const batch = await res.json();
        if (!Array.isArray(batch)) break;
        pulled = true;
        liveBookings.push(...batch);
        if (batch.length < pageSize) break;
      }
      if (pulled && liveBookings.length > 0) {
        return json({ ok: true, bookings: liveBookings, tenant_id: tenantId || DEMO_TENANT_ID });
      }
    } catch (_) {}

    // Authoritative replica fallback from D1 guest_context
    const replica = await loadCalendarReplica(env);
    const stays = (Array.isArray(replica?.stays) ? replica.stays : []).map((b) => ({
      ...b,
      tenant_id: b.tenant_id || tenantId || DEMO_TENANT_ID
    }));
    let bookings = stays;
    if (from && to) {
      bookings = stays.filter((b) => {
        const inDate = b.check_in_date || '';
        const outDate = b.check_out_date || '';
        return inDate < to && outDate >= from;
      });
    }

    return json({ ok: true, bookings, tenant_id: tenantId || DEMO_TENANT_ID });
  }

  // 5. GET /api/ops/sop-templates
  if (head === 'sop-templates') {
    return json({ ok: true, templates: [], tenant_id: tenantId || DEMO_TENANT_ID });
  }

  return errorJson('נתיב לא קיים', 404, 'NOT_FOUND');
}
