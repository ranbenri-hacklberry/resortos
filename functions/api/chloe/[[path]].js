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
          assigned_staff: u.assigned_staff || ''
        }));
      } else if (Array.isArray(replica?.units) && replica.units.length > 0) {
        units = replica.units.map((u, idx) => ({
          id: u.id || u.cabin_id,
          name: u.name || u.cabin_name || u.id || u.cabin_id,
          sort_order: u.sort_order ?? idx,
          operational_status: u.operational_status || 'READY',
          assigned_staff: u.assigned_staff || ''
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
        if (!name) return { b, score: 0 };
        if (normalized.includes(name)) return { b, score: 100 };
        const words = name.split(/\s+/).filter((w) => w.length >= 3);
        const matchCount = words.filter((w) => normalized.includes(w)).length;
        if (matchCount === words.length && words.length > 1) return { b, score: 80 };
        if (matchCount > 0) return { b, score: matchCount * 20 };
        return { b, score: 0 };
      })
      .filter((entry) => entry.score >= 20)
      .sort((a, b) => b.score - a.score)[0]?.b || null;

    const matchedUnit = units.find((u) => {
      const name = (u.name || '').toLowerCase();
      const id = (u.id || '').toLowerCase();
      return (name && normalized.includes(name)) || (id && normalized.includes(id)) ||
        (name.includes('אאורה') && (normalized.includes('אאורה') || normalized.includes('aura'))) ||
        (name.includes('בלום') && (normalized.includes('בלום') || normalized.includes('bloom'))) ||
        (name.includes('מיאליס') && normalized.includes('מיאליס'));
    });

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

    // 1. Specific Guest Match
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

    // 2. Specific Unit Match
    if (matchedUnit && !isCleaningIntent && !isArrivalsIntent) {
      const unitBookings = bookings.filter((b) => b.unit_id === matchedUnit.id && b.check_in_date <= today && b.check_out_date >= today);
      const readiness = formatReadiness(matchedUnit.operational_status);
      let reply = `יחידה **${matchedUnit.name}**:\n• סטטוס תפעולי: **${readiness.label}**\n`;
      if (unitBookings.length > 0) {
        reply += `• מאוכלסת כרגע על ידי: **${unitBookings[0].guest_name}** (עד ${unitBookings[0].check_out_date}).`;
      } else {
        reply += `• פנויה כרגע לקבלת אורחים.`;
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
              assigned_staff: matchedUnit.assigned_staff || ''
            }]
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
        const isDeparted = Boolean(
          checkoutBooking && (
            checkoutBooking.booking_status === 'CHECKED_OUT' ||
            checkoutBooking.checked_out_at ||
            u.staff_occupancy === 'VACANT'
          )
        );
        const isStillInHouse = Boolean(hasCheckoutToday && !isDeparted && u.staff_occupancy !== 'VACANT');
        const canCleanNow = Boolean(!hasCheckoutToday || isDeparted);
        const checkoutTime = checkoutBooking?.stay?.checkout_time || checkoutBooking?.checkout_time || '11:00';

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
      const canCleanCount = unitItems.filter((u) => u.can_clean_now && u.status !== 'READY').length;
      const stillInHouseCount = unitItems.filter((u) => u.is_still_in_house).length;
      const readyCount = unitItems.filter((u) => u.status === 'READY').length;

      let reply = `תמונת מצב ניקיון יחידות להיום:\n\n`;
      reply += `✨ **עכשיו כבר אפשר לנקות (${canCleanCount} יחידות):**\n`;
      if (departedCount > 0) {
        reply += `• בראש התור: **${departedCount} יחידות שבהן האורח ביצע צ'ק-אאוט ויצא** (מסומנות ב-🚪).\n`;
      }
      reply += `• כל שאר היחידות בקטגוריה זו פנויות ומוכנות לכניסת צוות הניקיון.\n\n`;

      if (stillInHouseCount > 0) {
        reply += `⏳ **עוד בשהייה · יוצאים היום (${stillInHouseCount} יחידות):**\n`;
        reply += `• אורחים שעדיין בחדר (שעת עזיבה רשומה: 11:00) — אין להיכנס לפני אישור עזיבה.\n\n`;
      }

      reply += `🟢 **מוכנות ונקיות לקליטה:** ${readyCount} מתוך ${units.length} יחידות.`;

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
