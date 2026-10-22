import { json, errorJson, fetchPostgrest, getPostgrestConfig } from '../_db.js';

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
  { id: 'k808', name: "Ⓔ27 טאג' מאהל · בקתה 1", sort_order: 21, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k809', name: "Ⓔ27 טאג' מאהל · בקתה 2", sort_order: 22, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k810', name: "Ⓔ27 טאג' מאהל · בקתה 3", sort_order: 23, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k811', name: "Ⓔ27 טאג' מאהל · בקתה 4", sort_order: 24, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k680', name: 'Ⓐ29 מול הנוף · בקתה 1', sort_order: 25, unit_type: 'cabin', max_occupancy: 5, operational_status: 'READY' },
  { id: 'k681', name: 'Ⓐ29 מול הנוף · בקתה 2', sort_order: 26, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k685', name: 'Ⓑ28 נופים בלבן · בקתה 1', sort_order: 30, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k687', name: 'Ⓒ27 טוסקנה · 1', sort_order: 32, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k690', name: 'Ⓓ26 חצר מוסיקלית · בקתה 1', sort_order: 35, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k691', name: 'Ⓓ26 חצר מוסיקלית · בקתה 2', sort_order: 36, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k693', name: 'Ⓕ24 בקתות מאיה · בקתה 1', sort_order: 38, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' }
];

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
    try {
      const res = await fetchPostgrest('/unit_operations?select=*', { method: 'GET' }, env);
      if (res && res.ok) {
        const liveUnits = await res.json();
        if (Array.isArray(liveUnits) && liveUnits.length > 0) {
          return json({ ok: true, units: liveUnits, tenant_id: tenantId || DEMO_TENANT_ID });
        }
      }
    } catch (_) {}

    // Fallback: clean units with ZERO fake faults or invented maintenance alerts
    const cleanUnits = DEFAULT_UNITS.map((u) => ({
      ...u,
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
    let body = {};
    try { body = await request.json(); } catch {}
    try {
      const res = await fetchPostgrest(`/unit_operations?id=eq.${encodeURIComponent(sub)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...body, updated_at: new Date().toISOString() })
      }, env);
      if (res && res.ok) {
        const updated = await res.json();
        return json({ ok: true, unit: updated?.[0] || { id: sub, ...body } });
      }
    } catch (_) {}
    return json({ ok: true, unit: { id: sub, ...body, updated_at: new Date().toISOString() } });
  }

  // 3. GET /api/ops/catalog
  if (head === 'catalog' && request.method === 'GET') {
    try {
      const res = await fetchPostgrest('/resort_units?select=*&order=sort_order.asc', { method: 'GET' }, env);
      if (res && res.ok) {
        const liveCatalog = await res.json();
        if (Array.isArray(liveCatalog) && liveCatalog.length > 0) {
          return json({ ok: true, units: liveCatalog, tenant_id: tenantId || DEMO_TENANT_ID });
        }
      }
    } catch (_) {}
    return json({ ok: true, units: DEFAULT_UNITS, tenant_id: tenantId || DEMO_TENANT_ID });
  }

  // 4. GET /api/ops/bookings
  if (head === 'bookings' && request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      let query = '/hotelos_bookings?select=*';
      if (from && to) {
        query += `&check_in_date=lt.${encodeURIComponent(to)}&check_out_date=gte.${encodeURIComponent(from)}`;
      }
      query += '&order=check_in_date.asc&limit=1000';
      const res = await fetchPostgrest(query, { method: 'GET' }, env);
      if (res && res.ok) {
        const liveBookings = await res.json();
        if (Array.isArray(liveBookings)) {
          return json({ ok: true, bookings: liveBookings, tenant_id: tenantId || DEMO_TENANT_ID });
        }
      }
    } catch (_) {}

    // Never return fake demo bookings to an operational dashboard
    return json({ ok: true, bookings: [], tenant_id: tenantId || DEMO_TENANT_ID });
  }

  // 5. GET /api/ops/sop-templates
  if (head === 'sop-templates') {
    return json({ ok: true, templates: [], tenant_id: tenantId || DEMO_TENANT_ID });
  }

  return errorJson('נתיב לא קיים', 404, 'NOT_FOUND');
}
