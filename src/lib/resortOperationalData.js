import { DEFAULT_RESORT_UNITS } from './units';
import { israelToday } from './cabinAccess';

export function shiftDays(ymd, delta) {
  const [y, m, d] = (ymd || israelToday()).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export function getResortDefaultUnits(tenantId, todayStr = israelToday()) {
  const customStatusMap = {
    'mialis-villa': { operational_status: 'DIRTY', custom_reason: 'יציאה הבוקר · כניסה היום בצהריים' },
    'k808': { operational_status: 'DIRTY', custom_reason: 'יציאה הבוקר · כניסה היום בצהריים' },
    'suite-1': { operational_status: 'READY', custom_reason: 'מוכן לחלוטין לכניסה' },
    'suite-2': { staff_occupancy: 'OCCUPIED' },
    'hill-1': { operational_status: 'IN_PROGRESS', assigned_staff: 'נועה (משק בית)', cleaning_started_at: new Date().toISOString() },
    'hill-2': { operational_status: 'READY' },
    'hill-3': { staff_occupancy: 'OCCUPIED' },
    'hill-4': { operational_status: 'MAINTENANCE_ALERT', operational_domain: 'MAINTENANCE', custom_reason: 'מזגן בסלון לא מקרר כראוי - דורש בדיקת גז', is_escalated: true },
    'dome-blue': { staff_occupancy: 'OCCUPIED' },
    'k671': { operational_status: 'DIRTY', custom_reason: 'ניקוי לאחר יציאה' },
    'k673': { staff_occupancy: 'OCCUPIED' },
    'k674': { operational_status: 'MAINTENANCE_ALERT', operational_domain: 'MAINTENANCE', custom_reason: 'נזילה בברז ג׳קוזי ראשי - דורש החלפת אטם', is_escalated: true, assigned_staff: 'קלואי (סוכנת ווטסאפ)' },
    'k680': { operational_status: 'READY' },
    'k685': { staff_occupancy: 'OCCUPIED' },
    'k687': { operational_status: 'NEEDS_COMPLETIONS', custom_reason: 'חוסר: 2 מארזי קפסולות אספרסו ומגבות גוף' },
    'k690': { staff_occupancy: 'OCCUPIED' },
    'k691': { operational_status: 'MAINTENANCE_ALERT', operational_domain: 'MAINTENANCE', custom_reason: 'תאורת שביל כניסה מהבהבת' },
    'k693': { operational_status: 'DIRTY', custom_reason: 'ממתין למשק בית' }
  };

  return DEFAULT_RESORT_UNITS.map((unit) => {
    const overrides = customStatusMap[unit.id] || {};
    return {
      ...unit,
      tenant_id: tenantId,
      operational_status: overrides.operational_status || 'READY',
      operational_domain: overrides.operational_domain || 'HOUSEKEEPING',
      custom_reason: overrides.custom_reason || '',
      staff_occupancy: overrides.staff_occupancy || 'VACANT',
      assigned_staff: overrides.assigned_staff || 'צוות תפעול',
      cleaning_started_at: overrides.cleaning_started_at || null,
      is_escalated: Boolean(overrides.is_escalated),
      is_active: true,
      updated_at: new Date().toISOString()
    };
  });
}

export function getResortDefaultBookings(tenantId, todayStr = israelToday()) {
  const yesterday = shiftDays(todayStr, -1);
  const twoDaysAgo = shiftDays(todayStr, -2);
  const tomorrow = shiftDays(todayStr, 1);
  const inTwoDays = shiftDays(todayStr, 2);
  const inThreeDays = shiftDays(todayStr, 3);

  return [
    // 1. ARRIVING TODAY (חדרים נכנסים)
    {
      id: 'b-arr-villa',
      tenant_id: tenantId,
      unit_id: 'mialis-villa',
      guest_name: 'משפחת שרון',
      guest_phone: '052-4412389',
      adults_count: 8,
      children_count: 6,
      check_in_date: todayStr,
      check_out_date: inTwoDays,
      stay: { estimated_arrival_time: '15:00' },
      special_requests: 'לול תינוק, מזרונים נוספים והכנת שולחן שבת',
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-arr-k808',
      tenant_id: tenantId,
      unit_id: 'k808',
      guest_name: 'דניאל ומוריה אהרוני',
      guest_phone: '050-8871234',
      adults_count: 2,
      children_count: 0,
      check_in_date: todayStr,
      check_out_date: inTwoDays,
      stay: { estimated_arrival_time: '15:30' },
      special_requests: 'בקבוק יין ומארז שוקולד ליום נישואין',
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-arr-suite1',
      tenant_id: tenantId,
      unit_id: 'suite-1',
      guest_name: 'רועי כרמי',
      guest_phone: '054-9918273',
      adults_count: 2,
      children_count: 0,
      check_in_date: todayStr,
      check_out_date: tomorrow,
      stay: { estimated_arrival_time: '14:30' },
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-arr-hill2',
      tenant_id: tenantId,
      unit_id: 'hill-2',
      guest_name: 'עמית וטל גולן',
      guest_phone: '053-2219845',
      adults_count: 2,
      children_count: 2,
      check_in_date: todayStr,
      check_out_date: inTwoDays,
      stay: { estimated_arrival_time: '15:00' },
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-arr-k687',
      tenant_id: tenantId,
      unit_id: 'k687',
      guest_name: 'יובל וספיר דגן',
      guest_phone: '054-5512903',
      adults_count: 2,
      children_count: 1,
      check_in_date: todayStr,
      check_out_date: tomorrow,
      stay: { estimated_arrival_time: '15:30' },
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-arr-k680',
      tenant_id: tenantId,
      unit_id: 'k680',
      guest_name: 'שי ברקוביץ',
      guest_phone: '052-9988112',
      adults_count: 4,
      children_count: 0,
      check_in_date: todayStr,
      check_out_date: inTwoDays,
      stay: { estimated_arrival_time: '16:00' },
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },

    // 2. DEPARTING TODAY (יציאות היום - יוצרות Turnover דחוף כשיש כניסה באותו יום)
    {
      id: 'b-dep-villa',
      tenant_id: tenantId,
      unit_id: 'mialis-villa',
      guest_name: 'קבוצת היי-טק שריון',
      guest_phone: '050-6102416',
      adults_count: 12,
      children_count: 0,
      check_in_date: twoDaysAgo,
      check_out_date: todayStr,
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-dep-k808',
      tenant_id: tenantId,
      unit_id: 'k808',
      guest_name: 'יוסי חדד',
      guest_phone: '054-7712399',
      adults_count: 2,
      children_count: 0,
      check_in_date: twoDaysAgo,
      check_out_date: todayStr,
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-dep-k671',
      tenant_id: tenantId,
      unit_id: 'k671',
      guest_name: 'אלון בכר',
      guest_phone: '052-3329102',
      adults_count: 2,
      children_count: 0,
      check_in_date: yesterday,
      check_out_date: todayStr,
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-dep-hill1',
      tenant_id: tenantId,
      unit_id: 'hill-1',
      guest_name: 'רותם כהן',
      guest_phone: '053-1192834',
      adults_count: 3,
      children_count: 0,
      check_in_date: twoDaysAgo,
      check_out_date: todayStr,
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-dep-k693',
      tenant_id: tenantId,
      unit_id: 'k693',
      guest_name: 'אופיר לוי',
      guest_phone: '058-2219845',
      adults_count: 2,
      children_count: 0,
      check_in_date: yesterday,
      check_out_date: todayStr,
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },

    // 3. IN-HOUSE OCCUPIED (חדרים מאוכלסים)
    {
      id: 'b-occ-suite2',
      tenant_id: tenantId,
      unit_id: 'suite-2',
      guest_name: 'משפחת רז',
      guest_phone: '052-6617281',
      adults_count: 2,
      children_count: 2,
      check_in_date: yesterday,
      check_out_date: tomorrow,
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-occ-dome-blue',
      tenant_id: tenantId,
      unit_id: 'dome-blue',
      guest_name: 'גיא ורוני שטרן',
      guest_phone: '054-3329102',
      adults_count: 2,
      children_count: 0,
      check_in_date: yesterday,
      check_out_date: inTwoDays,
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-occ-k685',
      tenant_id: tenantId,
      unit_id: 'k685',
      guest_name: 'ליאור כהן',
      guest_phone: '050-7712399',
      adults_count: 4,
      children_count: 0,
      check_in_date: twoDaysAgo,
      check_out_date: tomorrow,
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-occ-k690',
      tenant_id: tenantId,
      unit_id: 'k690',
      guest_name: 'שיראל ועופר',
      guest_phone: '058-4451290',
      adults_count: 2,
      children_count: 0,
      check_in_date: yesterday,
      check_out_date: inThreeDays,
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-occ-k673',
      tenant_id: tenantId,
      unit_id: 'k673',
      guest_name: 'יונתן ואילנה',
      guest_phone: '052-1192834',
      adults_count: 4,
      children_count: 0,
      check_in_date: yesterday,
      check_out_date: tomorrow,
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    },
    {
      id: 'b-occ-hill3',
      tenant_id: tenantId,
      unit_id: 'hill-3',
      guest_name: 'משפחת פרידמן',
      guest_phone: '054-7761234',
      adults_count: 2,
      children_count: 2,
      check_in_date: yesterday,
      check_out_date: inTwoDays,
      booking_status: 'CONFIRMED',
      payment_status: 'PAID'
    }
  ];
}

export function getResortDefaultMaintenance() {
  return [
    {
      id: 'ticket-m1',
      unitId: 'k674',
      title: 'Ⓖ23 בתי נורית 3',
      description: 'נזילה בברז ג׳קוזי ראשי - דורש החלפת אטם',
      urgency: 'CRITICAL',
      domain: 'MAINTENANCE',
      reportedBy: 'קלואי (סוכנת ווטסאפ)'
    },
    {
      id: 'ticket-m2',
      unitId: 'hill-4',
      title: 'צימר בגבעה 4',
      description: 'מזגן בסלון לא מקרר כראוי - דורש בדיקת גז',
      urgency: 'HIGH',
      domain: 'MAINTENANCE',
      reportedBy: 'צוות אחזקה'
    },
    {
      id: 'ticket-m3',
      unitId: 'k691',
      title: 'Ⓓ26 חצר מוסיקלית 2',
      description: 'תאורת שביל כניסה מהבהבת',
      urgency: 'HIGH',
      domain: 'MAINTENANCE',
      reportedBy: 'צוות אחזקה'
    }
  ];
}

export function getResortDefaultSupplies() {
  return [
    { id: 'shop-def-1', text: '10 מגבות בריכה גדולות', unitName: 'מיאליס וילה', isChloe: true, done: false },
    { id: 'shop-def-2', text: '2 מארזי קפסולות נספרסו ונייר טואלט', unitName: 'טוסקנה 1', done: false },
    { id: 'shop-def-3', text: '5 סטים של סבוני רחצה ושמפו יוקרתי', unitName: 'כללי', done: false },
    { id: 'shop-def-4', text: 'נורות לד חמות לתאורת שביל', unitName: 'החצר המוסיקלית', done: false }
  ];
}
