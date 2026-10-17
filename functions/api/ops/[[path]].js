import { json, errorJson } from '../_db.js';

const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';

function jerusalemToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

function shiftDays(ymd, delta) {
  const [y, m, d] = (ymd || jerusalemToday()).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

const DEFAULT_UNITS = [
  { id: 'k826', name: 'קאסה נובה · Aura', sort_order: 0, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k827', name: 'קאסה נובה · Bloom', sort_order: 1, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' },
  { id: 'hill-1', name: 'צימר בגבעה 1', sort_order: 3, unit_type: 'cabin', max_occupancy: 4, operational_status: 'IN_PROGRESS', assigned_staff: 'נועה' },
  { id: 'hill-2', name: 'צימר בגבעה 2', sort_order: 4, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'hill-3', name: 'צימר בגבעה 3', sort_order: 5, unit_type: 'cabin', max_occupancy: 4, staff_occupancy: 'OCCUPIED' },
  { id: 'hill-4', name: 'צימר בגבעה 4', sort_order: 6, unit_type: 'cabin', max_occupancy: 4, operational_status: 'MAINTENANCE_ALERT', custom_reason: 'מזגן בסלון לא מקרר כראוי - דורש בדיקת גז', is_escalated: true },
  { id: 'dome-blue', name: 'כיפת שמיים כחול', sort_order: 7, unit_type: 'dome', max_occupancy: 2, staff_occupancy: 'OCCUPIED' },
  { id: 'dome-red', name: 'כיפת שמיים אדום', sort_order: 8, unit_type: 'dome', max_occupancy: 2, operational_status: 'READY' },
  { id: 'dome-green', name: 'כיפת שמיים ירוק', sort_order: 9, unit_type: 'dome', max_occupancy: 2, operational_status: 'READY' },
  { id: 'mialis-villa', name: 'וילה מיאליס ריזורט', sort_order: 10, unit_type: 'villa', max_occupancy: 23, operational_status: 'DIRTY', custom_reason: 'יציאה הבוקר · כניסה היום בצהריים' },
  { id: 'suite-1', name: 'סוויטה 1 (הירוקה)', sort_order: 11, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' },
  { id: 'suite-2', name: 'סוויטה 2 (הורודה)', sort_order: 12, unit_type: 'suite', max_occupancy: 4, staff_occupancy: 'OCCUPIED' },
  { id: 'k671', name: 'Ⓖ23 בתי נורית 1', sort_order: 13, unit_type: 'cabin', max_occupancy: 2, operational_status: 'DIRTY', custom_reason: 'ניקוי לאחר יציאה' },
  { id: 'k673', name: 'Ⓖ23 בתי נורית 2', sort_order: 14, unit_type: 'cabin', max_occupancy: 4, staff_occupancy: 'OCCUPIED' },
  { id: 'k674', name: 'Ⓖ23 בתי נורית 3', sort_order: 15, unit_type: 'cabin', max_occupancy: 4, operational_status: 'MAINTENANCE_ALERT', custom_reason: 'נזילה בברז גקוזי ראשי - דורש החלפת אטם', is_escalated: true },
  { id: 'k675', name: 'Ⓖ23 בתי נורית 4', sort_order: 16, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k676', name: 'Ⓖ23 בתי נורית 5', sort_order: 17, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k677', name: 'Ⓖ23 בתי נורית 6', sort_order: 18, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k808', name: "Ⓔ27 טאג' מאהל · בקתה 1", sort_order: 21, unit_type: 'cabin', max_occupancy: 2, operational_status: 'DIRTY', custom_reason: 'יציאה הבוקר · כניסה היום בצהריים' },
  { id: 'k809', name: "Ⓔ27 טאג' מאהל · בקתה 2", sort_order: 22, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k810', name: "Ⓔ27 טאג' מאהל · בקתה 3", sort_order: 23, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k811', name: "Ⓔ27 טאג' מאהל · בקתה 4", sort_order: 24, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k680', name: 'Ⓐ29 מול הנוף · בקתה 1', sort_order: 25, unit_type: 'cabin', max_occupancy: 5, operational_status: 'READY' },
  { id: 'k681', name: 'Ⓐ29 מול הנוף · בקתה 2', sort_order: 26, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k685', name: 'Ⓑ28 נופים בלבן · בקתה 1', sort_order: 30, unit_type: 'cabin', max_occupancy: 4, staff_occupancy: 'OCCUPIED' },
  { id: 'k687', name: 'Ⓒ27 טוסקנה · 1', sort_order: 32, unit_type: 'cabin', max_occupancy: 4, operational_status: 'NEEDS_COMPLETIONS', custom_reason: 'חוסר: 2 מארזי קפסולות אספרסו ומגבות גוף' },
  { id: 'k690', name: 'Ⓓ26 חצר מוסיקלית · בקתה 1', sort_order: 35, unit_type: 'cabin', max_occupancy: 2, staff_occupancy: 'OCCUPIED' },
  { id: 'k691', name: 'Ⓓ26 חצר מוסיקלית · בקתה 2', sort_order: 36, unit_type: 'cabin', max_occupancy: 2, operational_status: 'MAINTENANCE_ALERT', custom_reason: 'תאורת שביל כניסה מהבהבת' },
  { id: 'k693', name: 'Ⓕ24 בקתות מאיה · בקתה 1', sort_order: 38, unit_type: 'cabin', max_occupancy: 2, operational_status: 'DIRTY', custom_reason: 'ממתין למשק בית' }
];

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);
  const pathParts = params?.path || [];
  const head = pathParts[0] || '';
  const sub = pathParts[1] || '';
  const today = jerusalemToday();

  if (request.method === 'OPTIONS') {
    return json({ ok: true });
  }

  // 1. GET /api/ops/units
  if (head === 'units' && request.method === 'GET' && !sub) {
    const units = DEFAULT_UNITS.map(u => ({ ...u, tenant_id: DEMO_TENANT_ID, is_active: true, updated_at: new Date().toISOString() }));
    return json({ ok: true, units, tenant_id: DEMO_TENANT_ID });
  }

  // 2. PUT /api/ops/units/:id
  if (head === 'units' && request.method === 'PUT' && sub) {
    let body = {};
    try { body = await request.json(); } catch {}
    return json({ ok: true, unit: { id: sub, ...body, updated_at: new Date().toISOString() } });
  }

  // 3. GET /api/ops/catalog
  if (head === 'catalog' && request.method === 'GET') {
    return json({ ok: true, units: DEFAULT_UNITS, tenant_id: DEMO_TENANT_ID });
  }

  // 4. GET /api/ops/bookings
  if (head === 'bookings' && request.method === 'GET') {
    const yesterday = shiftDays(today, -1);
    const twoDaysAgo = shiftDays(today, -2);
    const tomorrow = shiftDays(today, 1);
    const inTwoDays = shiftDays(today, 2);

    const bookings = [
      // Arrivals Today
      { id: 'cf-b1', tenant_id: DEMO_TENANT_ID, unit_id: 'mialis-villa', guest_name: 'משפחת שרון', guest_phone: '052-4412389', adults_count: 8, children_count: 6, check_in_date: today, check_out_date: inTwoDays, stay: { estimated_arrival_time: '15:00' }, special_requests: 'לול תינוק ומזרונים נוספים', booking_status: 'CONFIRMED' },
      { id: 'cf-b2', tenant_id: DEMO_TENANT_ID, unit_id: 'k808', guest_name: 'דניאל ומוריה אהרוני', guest_phone: '050-8871234', adults_count: 2, children_count: 0, check_in_date: today, check_out_date: inTwoDays, stay: { estimated_arrival_time: '15:30' }, special_requests: 'בקבוק יין ומארז שוקולד', booking_status: 'CONFIRMED' },
      { id: 'cf-b3', tenant_id: DEMO_TENANT_ID, unit_id: 'suite-1', guest_name: 'רועי כרמי', guest_phone: '054-9918273', adults_count: 2, children_count: 0, check_in_date: today, check_out_date: tomorrow, stay: { estimated_arrival_time: '14:30' }, booking_status: 'CONFIRMED' },
      { id: 'cf-b4', tenant_id: DEMO_TENANT_ID, unit_id: 'hill-2', guest_name: 'עמית וטל גולן', guest_phone: '053-2219845', adults_count: 2, children_count: 2, check_in_date: today, check_out_date: inTwoDays, stay: { estimated_arrival_time: '15:00' }, booking_status: 'CONFIRMED' },
      { id: 'cf-b5', tenant_id: DEMO_TENANT_ID, unit_id: 'k687', guest_name: 'יובל וספיר דגן', guest_phone: '054-5512903', adults_count: 2, children_count: 1, check_in_date: today, check_out_date: tomorrow, stay: { estimated_arrival_time: '15:30' }, booking_status: 'CONFIRMED' },
      { id: 'cf-b6', tenant_id: DEMO_TENANT_ID, unit_id: 'k680', guest_name: 'שי ברקוביץ', guest_phone: '052-9988112', adults_count: 4, children_count: 0, check_in_date: today, check_out_date: inTwoDays, stay: { estimated_arrival_time: '16:00' }, booking_status: 'CONFIRMED' },

      // Departures Today
      { id: 'cf-b7', tenant_id: DEMO_TENANT_ID, unit_id: 'mialis-villa', guest_name: 'קבוצת היי-טק שריון', guest_phone: '050-6102416', adults_count: 12, children_count: 0, check_in_date: twoDaysAgo, check_out_date: today, booking_status: 'CONFIRMED' },
      { id: 'cf-b8', tenant_id: DEMO_TENANT_ID, unit_id: 'k808', guest_name: 'יוסי חדד', guest_phone: '054-7712399', adults_count: 2, children_count: 0, check_in_date: twoDaysAgo, check_out_date: today, booking_status: 'CONFIRMED' },
      { id: 'cf-b9', tenant_id: DEMO_TENANT_ID, unit_id: 'k671', guest_name: 'אלון בכר', guest_phone: '052-3329102', adults_count: 2, children_count: 0, check_in_date: yesterday, check_out_date: today, booking_status: 'CONFIRMED' },
      { id: 'cf-b10', tenant_id: DEMO_TENANT_ID, unit_id: 'hill-1', guest_name: 'רותם כהן', guest_phone: '053-1192834', adults_count: 3, children_count: 0, check_in_date: twoDaysAgo, check_out_date: today, booking_status: 'CONFIRMED' },
      { id: 'cf-b11', tenant_id: DEMO_TENANT_ID, unit_id: 'k693', guest_name: 'אופיר לוי', guest_phone: '058-2219845', adults_count: 2, children_count: 0, check_in_date: yesterday, check_out_date: today, booking_status: 'CONFIRMED' },

      // In-House Occupied
      { id: 'cf-b12', tenant_id: DEMO_TENANT_ID, unit_id: 'suite-2', guest_name: 'משפחת רז', guest_phone: '052-6617281', adults_count: 2, children_count: 2, check_in_date: yesterday, check_out_date: tomorrow, booking_status: 'CONFIRMED' },
      { id: 'cf-b13', tenant_id: DEMO_TENANT_ID, unit_id: 'dome-blue', guest_name: 'גיא ורוני שטרן', guest_phone: '054-3329102', adults_count: 2, children_count: 0, check_in_date: yesterday, check_out_date: inTwoDays, booking_status: 'CONFIRMED' },
      { id: 'cf-b14', tenant_id: DEMO_TENANT_ID, unit_id: 'k685', guest_name: 'ליאור כהן', guest_phone: '050-7712399', adults_count: 4, children_count: 0, check_in_date: twoDaysAgo, check_out_date: tomorrow, booking_status: 'CONFIRMED' },
      { id: 'cf-b15', tenant_id: DEMO_TENANT_ID, unit_id: 'k690', guest_name: 'שיראל ועופר', guest_phone: '058-4451290', adults_count: 2, children_count: 0, check_in_date: yesterday, check_out_date: shiftDays(today, 3), booking_status: 'CONFIRMED' },
      { id: 'cf-b16', tenant_id: DEMO_TENANT_ID, unit_id: 'k673', guest_name: 'יונתן ואילנה', guest_phone: '052-1192834', adults_count: 4, children_count: 0, check_in_date: yesterday, check_out_date: tomorrow, booking_status: 'CONFIRMED' },
      { id: 'cf-b17', tenant_id: DEMO_TENANT_ID, unit_id: 'hill-3', guest_name: 'משפחת פרידמן', guest_phone: '054-7761234', adults_count: 2, children_count: 2, check_in_date: yesterday, check_out_date: inTwoDays, booking_status: 'CONFIRMED' }
    ];

    return json({ ok: true, bookings, tenant_id: DEMO_TENANT_ID });
  }

  // 5. GET /api/ops/sop-templates
  if (head === 'sop-templates') {
    return json({ ok: true, templates: [], tenant_id: DEMO_TENANT_ID });
  }

  return errorJson('נתיב לא קיים', 404, 'NOT_FOUND');
}
