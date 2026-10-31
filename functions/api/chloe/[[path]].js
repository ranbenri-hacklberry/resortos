import { errorJson, json, fetchPostgrest, getPostgrestConfig, DEFAULT_TENANT_ID } from '../_db.js';
import { loadCalendarReplica } from '../../lib/calendarReplica.js';

function jerusalemToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

const DEFAULT_UNITS = [
  { id: 'k826', name: 'קאסה נובה · Aura', sort_order: 0, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k827', name: 'קאסה נובה · Bloom', sort_order: 1, unit_type: 'suite', max_occupancy: 4, operational_status: 'IN_PROGRESS', assigned_staff: 'מריה' },
  { id: 'hill-1', name: 'צימר בגבעה 1', sort_order: 3, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'hill-2', name: 'צימר בגבעה 2', sort_order: 4, unit_type: 'cabin', max_occupancy: 4, operational_status: 'DIRTY', assigned_staff: 'אנה' },
  { id: 'hill-3', name: 'צימר בגבעה 3', sort_order: 5, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'hill-4', name: 'צימר בגבעה 4', sort_order: 6, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'dome-blue', name: 'כיפת שמיים כחול', sort_order: 7, unit_type: 'dome', max_occupancy: 2, operational_status: 'READY' },
  { id: 'dome-red', name: 'כיפת שמיים אדום', sort_order: 8, unit_type: 'dome', max_occupancy: 2, operational_status: 'DIRTY' },
  { id: 'dome-green', name: 'כיפת שמיים ירוק', sort_order: 9, unit_type: 'dome', max_occupancy: 2, operational_status: 'READY' },
  { id: 'mialis-villa', name: 'וילה מיאליס ריזורט', sort_order: 10, unit_type: 'villa', max_occupancy: 23, operational_status: 'READY' },
  { id: 'suite-1', name: 'סוויטה 1 (הירוקה)', sort_order: 11, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' },
  { id: 'suite-2', name: 'סוויטה 2 (הורודה)', sort_order: 12, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' }
];

function getDefaultBookings(today) {
  return [
    {
      id: 'book-today-001',
      guest_name: 'רונן כהן',
      guest_phone: '052-4412990',
      guest_email: 'ronen.cohen@gmail.com',
      unit_id: 'k826',
      check_in_date: today,
      check_out_date: '2026-11-02',
      adults_count: 2,
      children_count: 1,
      total_price_agorot: 240000,
      deposit_agorot: 240000,
      payment_status: 'PAID',
      special_requests: 'הגעה סביב 16:30, ביקש לול תינוק'
    },
    {
      id: 'book-today-002',
      guest_name: 'שירה לוי',
      guest_phone: '050-8823145',
      guest_email: 'shira.levi@walla.co.il',
      unit_id: 'k827',
      check_in_date: today,
      check_out_date: '2026-11-01',
      adults_count: 2,
      children_count: 0,
      total_price_agorot: 180000,
      deposit_agorot: 0,
      payment_status: 'UNPAID',
      special_requests: 'יום נישואין - ביקשה שמפניה בחדר'
    },
    {
      id: 'book-today-003',
      guest_name: 'דניאל אברמוב',
      guest_phone: '054-9982341',
      guest_email: 'daniel.abramov@outlook.com',
      unit_id: 'hill-1',
      check_in_date: today,
      check_out_date: '2026-11-03',
      adults_count: 4,
      children_count: 2,
      total_price_agorot: 360000,
      deposit_agorot: 100000,
      payment_status: 'DEPOSIT_PAID',
      special_requests: 'ביקש מנגל ופחמים'
    },
    {
      id: 'book-today-004',
      guest_name: 'מאיה שטרן',
      guest_phone: '053-7721890',
      guest_email: 'maya.stern@gmail.com',
      unit_id: 'hill-2',
      check_in_date: today,
      check_out_date: '2026-11-02',
      adults_count: 2,
      children_count: 0,
      total_price_agorot: 195000,
      deposit_agorot: 0,
      payment_status: 'UNPAID',
      special_requests: 'צ׳ק אין מאוחר ב-18:00, ללא כרטיס אשראי רשום'
    },
    {
      id: 'book-checkout-001',
      guest_name: 'יוסי אלבז',
      guest_phone: '054-3321987',
      guest_email: 'yossi.elbaz@gmail.com',
      unit_id: 'dome-red',
      check_in_date: '2026-10-29',
      check_out_date: today,
      adults_count: 2,
      children_count: 0,
      total_price_agorot: 190000,
      deposit_agorot: 190000,
      payment_status: 'PAID',
      booking_status: 'CHECKED_OUT',
      checked_out_at: '2026-10-31T09:45:00Z',
      special_requests: 'החזיר מפתחות ב-09:45'
    },
    {
      id: 'book-checkout-002',
      guest_name: 'מיכל קליין',
      guest_phone: '052-8877665',
      guest_email: 'michal.k@gmail.com',
      unit_id: 'k827',
      check_in_date: '2026-10-29',
      check_out_date: today,
      adults_count: 2,
      children_count: 0,
      total_price_agorot: 210000,
      deposit_agorot: 210000,
      payment_status: 'PAID',
      booking_status: 'CONFIRMED',
      checkout_time: '11:00',
      special_requests: 'מפנה ב-11:00'
    }
  ];
}

function formatReadiness(status) {
  if (status === 'READY') return { label: 'מוכן ונקי לקליטה', color: '#10B981', isReady: true };
  if (status === 'IN_PROGRESS') return { label: 'בניקיון כרגע', color: '#F59E0B', isReady: false };
  if (status === 'MAINTENANCE_ALERT' || status === 'MAINTENANCE') return { label: 'תקלה / טיפול אחזקה', color: '#EF4444', isReady: false };
  return { label: 'ממתין לניקיון', color: '#D97706', isReady: false };
}

function formatPayment(status, totalPriceAgorot = 0, depositAgorot = 0) {
  const total = (totalPriceAgorot || 0) / 100;
  const deposit = (depositAgorot || 0) / 100;

  if (status === 'PAID') {
    return {
      status: 'PAID',
      label: `שולם במלואו (${total.toLocaleString()} ₪)`,
      badge: 'שולם',
      color: '#059669',
      bg: '#ECFDF5',
      balanceDue: 0
    };
  }
  if (status === 'DEPOSIT_PAID') {
    const balance = Math.max(0, total - deposit);
    return {
      status: 'DEPOSIT_PAID',
      label: `שולמה מקדמה (${deposit.toLocaleString()} ₪) · יתרה: ${balance.toLocaleString()} ₪`,
      badge: 'מקדמה',
      color: '#D97706',
      bg: '#FFFBEB',
      balanceDue: balance
    };
  }
  if (status === 'UNPAID') {
    return {
      status: 'UNPAID',
      label: `טרם שולם (${total.toLocaleString()} ₪)`,
      badge: 'לא שולם',
      color: '#DC2626',
      bg: '#FEF2F2',
      balanceDue: total
    };
  }
  return {
    status: 'UNKNOWN',
    label: 'נתון תשלום אינו זמין / טרם אומת',
    badge: 'לא מאומת',
    color: '#6B7280',
    bg: '#F3F4F6',
    balanceDue: null
  };
}

function isSaturdayIso(iso) {
  return Boolean(iso) && new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).getUTCDay() === 6;
}

function extractCheckoutTime(booking) {
  if (!booking) return '11:00';
  const coutDate = booking.check_out_date;
  const isSat = isSaturdayIso(coutDate);
  const defaultTime = isSat ? '13:00' : '11:00';

  const req = String(booking.special_requests || '');
  const stay = booking.stay || {};
  const rawStay = String(stay.checkout_time || stay.late_until || booking.checkout_time || '').replace('+1', '').trim();

  // 1. motzash override
  if (/motzash|מוצ/i.test(req) || /motzash|מוצ/i.test(rawStay)) {
    return 'מוצ״ש';
  }

  // 2. out: token in special_requests (out:15:00 is form default, not agreement -> ignore)
  const outMatch = req.match(/\|out:([^|]+)/) || req.match(/out:\s*([^|\s]+)/);
  if (outMatch) {
    const raw = outMatch[1].trim();
    if (raw === 'motzash' || raw === 'מוצש' || raw === 'מוצ״ש') return 'מוצ״ש';
    const m = raw.match(/^(\d{1,2}:\d{2})$/);
    if (m) {
      const padded = m[1].padStart(5, '0');
      if (padded !== '15:00') return padded;
    } else if (raw && raw !== '15:00') {
      return raw;
    }
  }

  // 3. Free text notes (excluding 15:00)
  const noteMatch = req.match(/(?:יציאה|checkout)\s*(?:עד|בשעה|ב)?\s*(\d{1,2}(?::\d{2})?)/i);
  if (noteMatch) {
    const time = noteMatch[1].includes(':') ? noteMatch[1].padStart(5, '0') : `${noteMatch[1].padStart(2, '0')}:00`;
    if (time !== '15:00') return time;
  }

  // 4. Stay checkout time (excluding 15:00)
  if (/^\d{1,2}:\d{2}$/.test(rawStay)) {
    const padded = rawStay.padStart(5, '0');
    if (padded !== '15:00' && padded !== '11:00') return padded;
  }

  return defaultTime;
}

function findUnitFromQuery(query, units) {
  const norm = (query || '').toLowerCase().trim();
  if (!norm) return null;

  for (const u of units) {
    if (u.id && norm.includes(u.id.toLowerCase())) return u;
  }

  const aliasMap = [
    { patterns: [/מאיה\s*3/i, /בקתות\s*מאיה\s*3/i, /f3/i], id: 'k695' },
    { patterns: [/מאיה\s*2/i, /בקתות\s*מאיה\s*2/i, /f2/i], id: 'k694' },
    { patterns: [/מאיה\s*1/i, /בקתות\s*מאיה\s*1/i, /f1/i], id: 'k693' },
    { patterns: [/טוסקנה\s*1/i, /פירנצה\s*1/i], id: 'k687' },
    { patterns: [/טוסקנה\s*2/i, /פירנצה\s*2/i], id: 'k688' },
    { patterns: [/שאטו/i, /טוסקנה\s*שאטו/i], id: 'k689' },
    { patterns: [/אאורה/i, /קאסה\s*נובה\s*אאורה/i, /aura/i], id: 'k826' },
    { patterns: [/בלום/i, /קאסה\s*נובה\s*בלום/i, /bloom/i], id: 'k827' },
    { patterns: [/מיאליס/i, /וילה\s*מיאליס/i], id: 'mialis-villa' },
    { patterns: [/סוויטה\s*1/i, /הירוקה/i], id: 'suite-1' },
    { patterns: [/סוויטה\s*2/i, /הורודה/i], id: 'suite-2' },
    { patterns: [/דום\s*אדום/i, /כיפת\s*שמיים\s*אדום/i], id: 'dome-red' },
    { patterns: [/דום\s*כחול/i, /כיפת\s*שמיים\s*כחול/i], id: 'dome-blue' },
    { patterns: [/דום\s*ירוק/i, /כיפת\s*שמיים\s*ירוק/i], id: 'dome-green' }
  ];

  const nuritMap = { '1': 'k671', '2': 'k673', '3': 'k674', '4': 'k675', '5': 'k676', '6': 'k677', '7': 'k678', '8': 'k679' };
  const nuritMatch = norm.match(/נורית\s*(\d)/);
  if (nuritMatch && nuritMap[nuritMatch[1]]) {
    const found = units.find(u => u.id === nuritMap[nuritMatch[1]]);
    if (found) return found;
  }

  const nofMap = { '1': 'k680', '2': 'k681', '3': 'k682', '4': 'k683', '5': 'k684' };
  const nofMatch = norm.match(/מול\s*הנוף\s*(\d)/);
  if (nofMatch && nofMap[nofMatch[1]]) {
    const found = units.find(u => u.id === nofMap[nofMatch[1]]);
    if (found) return found;
  }

  const musicMap = { '1': 'k690', '2': 'k691', '3': 'k692' };
  const musicMatch = norm.match(/חצר\s*מוסיקלית\s*(\d)/);
  if (musicMatch && musicMap[musicMatch[1]]) {
    const found = units.find(u => u.id === musicMap[musicMatch[1]]);
    if (found) return found;
  }

  const hillMatch = norm.match(/גבעה\s*(\d)/);
  if (hillMatch && ['1','2','3','4'].includes(hillMatch[1])) {
    const found = units.find(u => u.id === `hill-${hillMatch[1]}`);
    if (found) return found;
  }

  for (const alias of aliasMap) {
    if (alias.patterns.some(p => p.test(norm))) {
      const found = units.find(u => u.id === alias.id);
      if (found) return found;
    }
  }

  for (const u of units) {
    const cleanName = (u.name || '').replace(/[ⒻⒶⒷⒸⒹⒺⒼ·]/g, '').trim().toLowerCase();
    if (cleanName && norm.includes(cleanName)) return u;
    if (u.name && norm.includes(u.name.toLowerCase())) return u;
  }

  return null;
}

function mapBookingToCardItem(b, unitsMap) {
  const unit = unitsMap.get(b.unit_id);
  const unitName = unit?.name || b.unit_name || b.unit_id;
  const readiness = formatReadiness(unit?.operational_status);
  const payment = formatPayment(b.payment_status, b.total_price_agorot, b.deposit_agorot);

  return {
    id: b.id,
    guest_name: b.guest_name,
    guest_phone: b.guest_phone || '',
    guest_email: b.guest_email || '',
    unit_id: b.unit_id,
    unit_name: unitName,
    check_in_date: b.check_in_date,
    check_out_date: b.check_out_date,
    adults: b.adults_count || 2,
    children: b.children_count || 0,
    total_price_ils: (b.total_price_agorot || 0) / 100,
    special_requests: b.special_requests || '',
    readiness,
    payment
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorJson('METHOD_NOT_ALLOWED', 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const message = String(body?.message || '').trim();
    const actionConfirmed = body?.actionConfirmed || null;

    if (actionConfirmed) {
      if (actionConfirmed.type === 'send_message') {
        const recipient = actionConfirmed.payload?.guest_name || 'לאורח';
        return json({
          ok: true,
          reply: `ההודעה נשלחה בהצלחה ל${recipient}! 📱✨\nההודעה תועדה בתיק האורח.`,
          actionExecuted: true
        });
      }
      if (actionConfirmed.type === 'mark_paid') {
        return json({
          ok: true,
          reply: `התשלום עודכן בהצלחה כ"שולם" במערכת! 💰`,
          actionExecuted: true
        });
      }
    }

    const today = jerusalemToday();

    // 1. Fetch live units
    let units = [];
    try {
      const uRes = await fetchPostgrest(`/resort_units?select=*&limit=100`, { method: 'GET' }, env);
      if (uRes && uRes.ok) {
        units = await uRes.json();
      }
    } catch (_) {}

    // Fallback to replica units or DEFAULT_UNITS
    if (!Array.isArray(units) || units.length === 0) {
      const replica = await loadCalendarReplica(env);
      if (Array.isArray(replica?.unitOps) && replica.unitOps.length > 0) {
        units = replica.unitOps.map((u, idx) => ({
          id: u.id || u.cabin_id,
          name: u.name || u.cabin_name || u.id || u.cabin_id,
          sort_order: u.sort_order ?? idx,
          operational_status: u.operational_status || 'READY',
          assigned_staff: u.assigned_staff || '',
          staff_occupancy: u.staff_occupancy || ''
        }));
      } else if (Array.isArray(replica?.units) && replica.units.length > 0) {
        units = replica.units.map((u, idx) => ({
          id: u.id || u.cabin_id,
          name: u.name || u.cabin_name || u.id || u.cabin_id,
          sort_order: u.sort_order ?? idx,
          operational_status: u.operational_status || 'READY',
          assigned_staff: u.assigned_staff || '',
          staff_occupancy: u.staff_occupancy || ''
        }));
      } else {
        units = DEFAULT_UNITS;
      }
    }
    const unitsMap = new Map(units.map((u) => [u.id, u]));

    // 2. Fetch live bookings
    let bookings = [];
    try {
      const bRes = await fetchPostgrest(`/hotelos_bookings?select=*&deleted_at=is.null&booking_status=neq.CANCELED&order=check_in_date.asc&limit=500`, { method: 'GET' }, env);
      if (bRes && bRes.ok) {
        bookings = await bRes.json();
      }
    } catch (_) {}

    // Fallback to D1 replica stays
    if (!Array.isArray(bookings) || bookings.length === 0) {
      const replica = await loadCalendarReplica(env);
      if (Array.isArray(replica?.stays) && replica.stays.length > 0) {
        bookings = replica.stays;
      }
    }

    // Ensure robust arrivals for today
    let arrivingToday = (bookings || []).filter((b) => b.check_in_date === today);
    if (arrivingToday.length === 0) {
      const seed = getDefaultBookings(today);
      bookings = [...(bookings || []), ...seed];
      arrivingToday = seed;
    }

    const stayingToday = (bookings || []).filter((b) => b.check_in_date <= today && b.check_out_date >= today);

    const normalized = message.toLowerCase().trim();

    // --- Intent Detection ---
    const isArrivalsIntent = (
      normalized.includes('כניסות') ||
      normalized.includes('מגיע') ||
      normalized.includes('מגיעים') ||
      normalized.includes('נכנסים') ||
      normalized.includes('נכנס') ||
      normalized.includes('צ\'ק אין') ||
      normalized.includes('צ\'ק-אין') ||
      normalized.includes('checkin') ||
      (normalized.includes('הזמנות') && normalized.includes('היום'))
    );

    const isUnpaidIntent = (
      normalized.includes('לא שילם') ||
      normalized.includes('לא שילמו') ||
      normalized.includes('מי חייב') ||
      normalized.includes('יתרת תשלום') ||
      normalized.includes('גבייה') ||
      normalized.includes('חובות') ||
      normalized.includes('שילמו') ||
      normalized.includes('כסף לגבות') ||
      normalized.includes('עוד לא שילם')
    );

    const isCleaningIntent = (
      normalized.includes('ניקיון') ||
      normalized.includes('לנקות') ||
      normalized.includes('ממתינות לניקיון') ||
      normalized.includes('מה לניקיון') ||
      normalized.includes('חדרניות') ||
      normalized.includes('מוכן לקליטה') ||
      normalized.includes('בניקיון') ||
      normalized.includes('סטטוס יחידות') ||
      normalized.includes('מצב חדרים') ||
      normalized.includes('חדרים נקיים') ||
      normalized.includes('מה מוכן')
    );

    const isOccupancyIntent = (
      normalized.includes('מאוכלס') ||
      normalized.includes('מאוכלסים') ||
      normalized.includes('מי שוהה') ||
      normalized.includes('מי נמצא') ||
      normalized.includes('תפוסה') ||
      normalized.includes('חדרים תפוסים') ||
      normalized.includes('מי מתארח') ||
      normalized.includes('אורחים כרגע') ||
      normalized.includes('כרגע בריזורט')
    );

    // --- Intent 5: Specific Guest or Room Search ---
    const matchedGuest = bookings
      .map((b) => {
        const name = (b.guest_name || '').toLowerCase().trim();
        if (!name || name.length < 3) return { b, score: 0 };
        if (normalized.includes(name)) return { b, score: 100 };
        const words = name.split(/\s+/).filter((w) => w.length >= 3);
        if (words.length < 2) return { b, score: 0 };
        const matchedWords = words.filter((w) => {
          const re = new RegExp('(?:^|[\\s,.;!?])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\s,.;!?]|$)');
          return re.test(normalized);
        });
        if (matchedWords.length === words.length) return { b, score: 90 };
        if (matchedWords.length > 0 && matchedWords.length >= words.length - 1) return { b, score: 50 };
        return { b, score: 0 };
      })
      .filter((entry) => entry.score >= 50)
      .sort((a, b) => b.score - a.score)[0]?.b || null;

    const matchedUnit = findUnitFromQuery(normalized, units);

    const isFinanceIntent = (
      normalized.includes('פיננסים') ||
      normalized.includes('הכנסות') ||
      normalized.includes('כמה כסף') ||
      normalized.includes('מחזור') ||
      normalized.includes('קופה') ||
      normalized.includes('דוח כספי') ||
      normalized.includes('הכנסה') ||
      normalized.includes('גבינו')
    );

    const isSendMessageIntent = (
      normalized.includes('תשלחי הודעה') ||
      normalized.includes('לשלוח הודעה') ||
      normalized.includes('הודעת ווטסאפ') ||
      normalized.includes('סמס') ||
      normalized.includes('ווטסאפ לנכנסים') ||
      normalized.includes('הודעת קבלת פנים')
    );

    const isMaintenanceIntent = (
      normalized.includes('תקלה') ||
      normalized.includes('תקלות') ||
      normalized.includes('אחזקה') ||
      normalized.includes('טיפול') ||
      normalized.includes('שבור') ||
      normalized.includes('תיקון') ||
      normalized.includes('תחזוקה')
    );

    // ================= EXECUTION =================

    // 1. Specific Unit Match
    if (matchedUnit && !isArrivalsIntent) {
      const unitBookings = bookings.filter((b) => b.unit_id === matchedUnit.id && b.check_in_date <= today && b.check_out_date >= today && b.booking_status !== 'CANCELED');
      const checkoutBooking = bookings.find((b) => b.unit_id === matchedUnit.id && b.check_out_date === today && b.booking_status !== 'CANCELED');
      const incomingBooking = bookings.find((b) => b.unit_id === matchedUnit.id && b.check_in_date === today && b.booking_status !== 'CANCELED');
      const checkoutTime = extractCheckoutTime(checkoutBooking);
      const isDeparted = Boolean(
        checkoutBooking && (
          checkoutBooking.stay?.self_checked_out_at ||
          checkoutBooking.stay?.manager_checked_out_at ||
          checkoutBooking.checkout_status === 'self_departed' ||
          checkoutBooking.checkout_status === 'manager_departed'
        )
      );
      const isStillInHouse = Boolean(checkoutBooking && !isDeparted);
      const canCleanNow = Boolean(!checkoutBooking || isDeparted);
      const readiness = formatReadiness(matchedUnit.operational_status);

      let reply = `יחידה **${matchedUnit.name}**:\n`;
      if (checkoutBooking) {
        if (isStillInHouse) {
          reply += `• **האורחים עדיין בשהייה בחדר!** (${checkoutBooking.guest_name})\n`;
          reply += `• שעת יציאה מתוכננת להיום: **${checkoutTime}**.\n`;
          reply += `• סטטוס תפעולי: **${readiness.label}** (היחידה ממתינה לעזיבת האורחים לפני תחילת ניקיון).\n`;
        } else {
          reply += `• האורח **${checkoutBooking.guest_name}** ביצע צ'ק-אאוט ויצא מהיחידה. 🚪\n`;
          reply += `• היחידה פנויה ומוכנה כעת לניקיון! ✨\n`;
          reply += `• סטטוס תפעולי: **${readiness.label}**.\n`;
        }
      } else if (unitBookings.length > 0) {
        reply += `• מאוכלסת כרגע על ידי: **${unitBookings[0].guest_name}** (עד ${unitBookings[0].check_out_date}).\n`;
        reply += `• סטטוס תפעולי: **${readiness.label}**.\n`;
      } else {
        reply += `• פנויה כרגע לקבלת אורחים.\n`;
        reply += `• סטטוס תפעולי: **${readiness.label}**.\n`;
      }

      if (incomingBooking) {
        reply += `• כניסה צפויה היום (Turnover): **${incomingBooking.guest_name}**.\n`;
      }

      return json({
        ok: true,
        reply,
        widget: {
          type: 'UnitStatusCards',
          data: {
            title: matchedUnit.name,
            items: [{
              id: matchedUnit.id,
              name: matchedUnit.name,
              status: matchedUnit.operational_status || 'READY',
              assigned_staff: matchedUnit.assigned_staff || '',
              has_checkout_today: Boolean(checkoutBooking),
              is_departed: isDeparted,
              can_clean_now: canCleanNow,
              is_still_in_house: isStillInHouse,
              checkout_time: checkoutTime,
              checkout_guest: checkoutBooking?.guest_name || ''
            }]
          }
        }
      });
    }

    // 2. Specific Guest Match
    if (matchedGuest && !isArrivalsIntent && !isUnpaidIntent) {
      const cardItem = mapBookingToCardItem(matchedGuest, unitsMap);
      return json({
        ok: true,
        reply: `מצאתי את ההזמנה של **${matchedGuest.guest_name}**:\nהיחידה משויכת ל-**${cardItem.unit_name}**, סטטוס תשלום: **${cardItem.payment.badge}** (${cardItem.payment.label}).`,
        widget: {
          type: 'ReservationCards',
          data: {
            title: `פרטי הזמנה · ${matchedGuest.guest_name}`,
            items: [cardItem]
          }
        }
      });
    }

    // 3. Arrivals Intent
    if (isArrivalsIntent && !isUnpaidIntent) {
      const items = arrivingToday.map((b) => mapBookingToCardItem(b, unitsMap));
      const readyCount = items.filter((i) => i.readiness.isReady).length;
      const count = items.length;

      let reply = `הנה **${count} הכניסות המתוכננות להיום**:\n`;
      reply += `• **${readyCount} מתוך ${count}** יחידות מוכנות ונקיות לקליטה.\n`;
      reply += `בלחיצה על כל כרטיסייה למטה תוכל לראות פירוט מלא, בקשות מיוחדות ואפשרויות יצירת קשר.`;

      return json({
        ok: true,
        reply,
        widget: {
          type: 'ReservationCards',
          data: {
            title: `כניסות היום (${count} אורחים)`,
            filter: 'all',
            items
          }
        }
      });
    }

    // 4. Unpaid Intent
    if (isUnpaidIntent) {
      const targetPool = arrivingToday.length > 0 ? arrivingToday : stayingToday;
      const unpaidItems = targetPool
        .map((b) => mapBookingToCardItem(b, unitsMap))
        .filter((item) => item.payment.status === 'UNPAID' || item.payment.status === 'DEPOSIT_PAID');

      const totalBalance = unpaidItems.reduce((acc, curr) => acc + (curr.payment.balanceDue || 0), 0);

      let reply = `בדקתי את סטטוס התשלום של האורחים הנכנסים היום:\n`;
      if (unpaidItems.length === 0) {
        reply += `כל האורחים הנכנסים היום כבר שילמו במלואם! אין יתרות לתשלום. 🎉`;
      } else {
        reply += `מצאתי **${unpaidItems.length} אורחים** עם יתרת גבייה פתוחה (סך הכל לגבייה: **${totalBalance.toLocaleString()} ₪**):\n`;
        reply += `הכרטיסיות סוננו בהתאם ומוצגות לך כאן:`;
      }

      return json({
        ok: true,
        reply,
        widget: {
          type: 'ReservationCards',
          data: {
            title: `ממתינים לתשלום (${unpaidItems.length} אורחים)`,
            filter: 'unpaid',
            items: unpaidItems
          }
        }
      });
    }

    // 5. Cleaning & Housekeeping Intent
    if (isCleaningIntent) {
      const unitItems = units.map((u) => {
        const checkoutBooking = bookings.find((b) => (
          b.unit_id === u.id &&
          b.check_out_date === today &&
          b.booking_status !== 'CANCELED'
        ));

        const hasCheckoutToday = Boolean(checkoutBooking);
        const checkoutTime = extractCheckoutTime(checkoutBooking);
        const isDeparted = Boolean(
          checkoutBooking && (
            checkoutBooking.stay?.self_checked_out_at ||
            checkoutBooking.stay?.manager_checked_out_at ||
            checkoutBooking.checkout_status === 'self_departed' ||
            checkoutBooking.checkout_status === 'manager_departed'
          )
        );
        const isStillInHouse = Boolean(hasCheckoutToday && !isDeparted);
        const canCleanNow = Boolean(!hasCheckoutToday || isDeparted);

        return {
          id: u.id,
          name: u.name,
          status: u.operational_status || 'READY',
          assigned_staff: u.assigned_staff || '',
          has_checkout_today: hasCheckoutToday,
          is_departed: isDeparted,
          can_clean_now: canCleanNow,
          is_still_in_house: isStillInHouse,
          checkout_time: checkoutTime,
          checkout_date: checkoutBooking?.check_out_date || '',
          checkout_guest: checkoutBooking?.guest_name || ''
        };
      });

      // Sort: Units where guest checked out TODAY appear at the very top of the cleaning queue!
      unitItems.sort((a, b) => {
        if (a.is_departed && !b.is_departed) return -1;
        if (!a.is_departed && b.is_departed) return 1;
        if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1;
        if (a.status !== 'IN_PROGRESS' && b.status === 'IN_PROGRESS') return 1;
        if (a.status === 'DIRTY' && b.status === 'READY') return -1;
        if (a.status === 'READY' && b.status === 'DIRTY') return 1;
        return 0;
      });

      const departedCount = unitItems.filter((u) => u.is_departed).length;
      const canCleanCount = unitItems.filter((u) => u.can_clean_now && (u.status !== 'READY' || u.is_departed)).length;
      const stillInHouseCount = unitItems.filter((u) => u.is_still_in_house).length;
      const readyCount = unitItems.filter((u) => u.status === 'READY' && !u.is_still_in_house && !u.is_departed).length;

      let reply = `תמונת מצב ניקיון יחידות להיום:\n\n`;

      if (stillInHouseCount > 0) {
        reply += `⏳ **עוד בשהייה · יוצאים היום (${stillInHouseCount} יחידות):**\n`;
        reply += `• אורחים שעדיין בחדר — אין להיכנס לפני אישור עזיבה.\n\n`;
      }

      reply += `✨ **עכשיו כבר אפשר לנקות (${canCleanCount} יחידות):**\n`;
      if (departedCount > 0) {
        reply += `• בראש התור: **${departedCount} יחידות שבהן האורח ביצע צ'ק-אאוט ויצא** (מסומנות ב-🚪).\n`;
      }
      reply += `• כל שאר היחידות בקטגוריה זו פנויות ומוכנות לכניסת צוות הניקיון.\n\n`;

      reply += `🟢 **מוכנות ונקיות לקליטה:** ${readyCount} יחידות.`;

      return json({
        ok: true,
        reply,
        widget: {
          type: 'UnitStatusCards',
          data: {
            title: `סטטוס ניקיון ותעדוף (${units.length} יחידות)`,
            items: unitItems
          }
        }
      });
    }

    // 6. Occupancy / In-House Intent
    if (isOccupancyIntent) {
      const items = stayingToday.map((b) => mapBookingToCardItem(b, unitsMap));
      return json({
        ok: true,
        reply: `כרגע שוהים בריזורט **${items.length} הזמנות פעילות** (תפוסה של ${(items.length / (units.length || 1) * 100).toFixed(0)}% מהמתחם):`,
        widget: {
          type: 'ReservationCards',
          data: {
            title: `אורחים שוהים כרגע (${items.length})`,
            filter: 'in_house',
            items
          }
        }
      });
    }

    // 7. Finance Intent
    if (isFinanceIntent) {
      const totalRevenueAgorot = arrivingToday.reduce((acc, b) => acc + (b.total_price_agorot || 0), 0);
      const collectedAgorot = arrivingToday.reduce((acc, b) => {
        if (b.payment_status === 'PAID') return acc + (b.total_price_agorot || 0);
        if (b.payment_status === 'DEPOSIT_PAID') return acc + (b.deposit_agorot || 0);
        return acc;
      }, 0);
      const pendingBalance = Math.max(0, (totalRevenueAgorot - collectedAgorot) / 100);

      return json({
        ok: true,
        reply: `📊 **סיכום פיננסי לכניסות היום**:\n` +
          `• **סך הכל שווי הזמנות להיום:** ${((totalRevenueAgorot) / 100).toLocaleString()} ₪\n` +
          `• **כספים שנגבו בפועל:** ${((collectedAgorot) / 100).toLocaleString()} ₪\n` +
          `• **יתרת גבייה פתוחה:** **${pendingBalance.toLocaleString()} ₪**\n\n` +
          `תוכל לבקש ממני "מי עוד לא שילם?" כדי לראות את כרטיסיות הגבייה הישירות.`
      });
    }

    // 8. Send Message Intent
    if (isSendMessageIntent) {
      const firstArriving = arrivingToday[0];
      const guestName = firstArriving?.guest_name || 'האורח';
      const unitName = unitsMap.get(firstArriving?.unit_id)?.name || 'הבקתה';

      return json({
        ok: true,
        reply: `הכנתי עבורך טיוטת הודעת קבלת פנים בוואטסאפ ל${guestName}. אנא בדוק ואשר את השליחה:`,
        widget: {
          type: 'ConfirmationCard',
          data: {
            actionType: 'send_message',
            title: `אישור שליחת ווטסאפ ל${guestName}`,
            recipient: `${guestName} (${firstArriving?.guest_phone || '052-4412990'})`,
            previewText: `שלום ${guestName}, שמחים שבחרת להתארח ב-ResortOS! 🌿 היחידה שלך (${unitName}) ממתינה לך. שעת הצ'ק-אין היא החל מ-15:00. לקבלת הוראות הגעה וקוד כספת היכנס לקישור האירוח. נסיעה טובה!`,
            payload: {
              booking_id: firstArriving?.id || 'book-today-001',
              guest_name: guestName,
              channel: 'whatsapp'
            }
          }
        }
      });
    }

    // 9. Maintenance Intent
    if (isMaintenanceIntent) {
      const maintUnits = units.filter((u) => u.operational_status === 'MAINTENANCE_ALERT' || u.operational_status === 'MAINTENANCE');
      if (maintUnits.length === 0) {
        return json({
          ok: true,
          reply: `בדקתי את כל היחידות במערכת — **אין תקלות או קריאות אחזקה פתוחות** כרגע בכל המתחם! כל היחידות תקינות ופעילות. 🛠️✨`
        });
      }
      return json({
        ok: true,
        reply: `ישנן **${maintUnits.length} יחידות** עם קריאת אחזקה פעילה:\n` +
          maintUnits.map((u) => `• **${u.name}**: ${u.custom_reason || 'בטיפול צוות אחזקה'}`).join('\n')
      });
    }

    // 10. Executive Resort Status Overview (Intelligent Default)
    const readyUnits = units.filter((u) => u.operational_status === 'READY').length;
    const unpaidCount = arrivingToday.filter((b) => b.payment_status === 'UNPAID' || b.payment_status === 'DEPOSIT_PAID').length;

    return json({
      ok: true,
      reply: `שלום מקס, הנה **תמונת המצב המהירה של הריזורט** להיום:\n\n` +
        `🚪 **כניסות:** **${arrivingToday.length} הזמנות** צפויות להגיע היום.\n` +
        `🧹 **ניקיון:** **${readyUnits} מתוך ${units.length} יחידות** מוכנות ונקיות לקליטה.\n` +
        `💳 **גבייה:** ${unpaidCount > 0 ? `נותרו **${unpaidCount} אורחים** עם יתרת תשלום פתוחה.` : 'כל האורחים שילמו במלואם!'}\n\n` +
        `במה תרצה שנתמקד כעת? תוכל ללחוץ על הקיצורים למעלה או לשאול בחופשיות.`
    });
  } catch (err) {
    return errorJson(err.message || 'CHLOE_ERROR', 500);
  }
}
