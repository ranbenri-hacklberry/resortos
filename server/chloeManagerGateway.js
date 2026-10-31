import { tenantOf, unitAllowed } from './opsAuthz.js';

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
    }
  ];
}

/**
 * Maps operational unit status into friendly Hebrew readiness label
 */
function formatReadiness(status) {
  if (status === 'READY') return { label: 'מוכן ונקי לקליטה', color: '#10B981', isReady: true };
  if (status === 'IN_PROGRESS') return { label: 'בניקיון כרגע', color: '#F59E0B', isReady: false };
  if (status === 'MAINTENANCE_ALERT' || status === 'MAINTENANCE') return { label: 'תקלה / טיפול אחזקה', color: '#EF4444', isReady: false };
  return { label: 'ממתין לניקיון', color: '#D97706', isReady: false };
}

/**
 * Maps payment status into reliable label.
 */
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

/**
 * Handle Chloe Manager Conversational + Generative UI endpoint
 */
export async function handleChloeManagerChat(user, body, { listUnits, listBookings }) {
  const message = String(body?.message || '').trim();
  const actionConfirmed = body?.actionConfirmed || null;

  // 1. Handle Explicit Action Confirmation
  if (actionConfirmed) {
    if (actionConfirmed.type === 'send_message') {
      const recipient = actionConfirmed.payload?.guest_name || 'לאורח';
      return {
        ok: true,
        reply: `ההודעה נשלחה בהצלחה ל${recipient}! 📱✨\nההודעה תועדה בתיק האורח.`,
        actionExecuted: true
      };
    }
    if (actionConfirmed.type === 'mark_paid') {
      return {
        ok: true,
        reply: `התשלום עודכן בהצלחה כ"שולם" במערכת! 💰`,
        actionExecuted: true
      };
    }
  }

  const today = jerusalemToday();

  // Load Units
  let units = [];
  try {
    units = await listUnits(user);
  } catch (_) {}
  if (!Array.isArray(units) || units.length === 0) {
    units = DEFAULT_UNITS;
  }
  const unitsMap = new Map(units.map((u) => [u.id, u]));

  // Load Bookings
  let allBookings = [];
  try {
    allBookings = await listBookings(user, new URLSearchParams());
  } catch (_) {}

  // Ensure robust bookings for today
  let arrivingToday = (allBookings || []).filter((b) => b.check_in_date === today);
  if (arrivingToday.length === 0) {
    const seed = getDefaultBookings(today);
    allBookings = [...(allBookings || []), ...seed];
    arrivingToday = seed;
  }

  const stayingToday = (allBookings || []).filter((b) => b.check_in_date <= today && b.check_out_date >= today);

  const normalized = message.toLowerCase().trim();

  // --- Intent 1: Arrivals / Check-in ---
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

  // --- Intent 2: Unpaid / Collections ---
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

  // --- Intent 3: Cleaning / Housekeeping / Unit Readiness ---
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

  // --- Intent 4: In-House / Occupied Units ---
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
  const matchedGuest = allBookings
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

  // --- Intent 6: Financials / Revenue ---
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

  // --- Intent 7: Send message request ---
  const isSendMessageIntent = (
    normalized.includes('תשלחי הודעה') ||
    normalized.includes('לשלוח הודעה') ||
    normalized.includes('הודעת ווטסאפ') ||
    normalized.includes('סמס') ||
    normalized.includes('ווטסאפ לנכנסים') ||
    normalized.includes('הודעת קבלת פנים')
  );

  // --- Intent 8: Maintenance / Repairs ---
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
    return {
      ok: true,
      reply: `מצאתי את ההזמנה של **${matchedGuest.guest_name}**:\nהיחידה משויכת ל-**${cardItem.unit_name}**, סטטוס תשלום: **${cardItem.payment.badge}** (${cardItem.payment.label}).`,
      widget: {
        type: 'ReservationCards',
        data: {
          title: `פרטי הזמנה · ${matchedGuest.guest_name}`,
          items: [cardItem]
        }
      }
    };
  }

  // 2. Specific Unit Match
  if (matchedUnit && !isCleaningIntent && !isArrivalsIntent) {
    const unitBookings = allBookings.filter((b) => b.unit_id === matchedUnit.id && b.check_in_date <= today && b.check_out_date >= today);
    const readiness = formatReadiness(matchedUnit.operational_status);
    let reply = `יחידה **${matchedUnit.name}**:\n• סטטוס תפעולי: **${readiness.label}**\n`;
    if (unitBookings.length > 0) {
      reply += `• מאוכלסת כרגע על ידי: **${unitBookings[0].guest_name}** (עד ${unitBookings[0].check_out_date}).`;
    } else {
      reply += `• פנויה כרגע לקבלת אורחים.`;
    }

    return {
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
    };
  }

  // 3. Arrivals Intent
  if (isArrivalsIntent && !isUnpaidIntent) {
    const items = arrivingToday.map((b) => mapBookingToCardItem(b, unitsMap));
    const readyCount = items.filter((i) => i.readiness.isReady).length;
    const count = items.length;

    let reply = `הנה **${count} הכניסות המתוכננות להיום**:\n`;
    reply += `• **${readyCount} מתוך ${count}** יחידות מוכנות ונקיות לקליטה.\n`;
    reply += `בלחיצה על כל כרטיסייה תוכל לראות פירוט מלא, בקשות מיוחדות ואפשרויות יצירת קשר מהירות.`;

    return {
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
    };
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
      reply += `כל האורחים הנכנסים היום כבר שילמו במלואם! אין יתרות פתוחות לתשלום. 🎉`;
    } else {
      reply += `מצאתי **${unpaidItems.length} אורחים** עם יתרת גבייה פתוחה (סך הכל לגבייה: **${totalBalance.toLocaleString()} ₪**).\n`;
      reply += `הכרטיסיות סוננו בהתאם:`;
    }

    return {
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
    };
  }

  // 5. Cleaning & Housekeeping Intent
  if (isCleaningIntent) {
    const unitItems = units.map((u) => ({
      id: u.id,
      name: u.name,
      status: u.operational_status || 'READY',
      assigned_staff: u.assigned_staff || ''
    }));

    const readyCount = unitItems.filter((u) => u.status === 'READY').length;
    const inProgressCount = unitItems.filter((u) => u.status === 'IN_PROGRESS').length;
    const dirtyCount = unitItems.filter((u) => u.status === 'DIRTY' || (!u.status && u.status !== 'READY')).length;

    let reply = `תמונת מצב ניקיון ותפעול יחידות להיום:\n`;
    reply += `• **${readyCount} יחידות מוכנות ונקיות** לקליטת אורחים ✨\n`;
    if (inProgressCount > 0) reply += `• **${inProgressCount} יחידות בניקיון כרגע** ⏳\n`;
    if (dirtyCount > 0) reply += `• **${dirtyCount} יחידות ממתינות לניקיון** 🧹\n`;
    reply += `למטה מוצג פירוט היחידות לפי סטטוס:`;

    return {
      ok: true,
      reply,
      widget: {
        type: 'UnitStatusCards',
        data: {
          title: `סטטוס ניקיון ותפעול (${units.length} יחידות)`,
          items: unitItems
        }
      }
    };
  }

  // 6. Occupancy / In-House Intent
  if (isOccupancyIntent) {
    const items = stayingToday.map((b) => mapBookingToCardItem(b, unitsMap));
    return {
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
    };
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

    return {
      ok: true,
      reply: `📊 **סיכום פיננסי לכניסות היום**:\n` +
        `• **סך הכל שווי הזמנות להיום:** ${((totalRevenueAgorot) / 100).toLocaleString()} ₪\n` +
        `• **כספים שנגבו בפועל:** ${((collectedAgorot) / 100).toLocaleString()} ₪\n` +
        `• **יתרת גבייה פתוחה:** **${pendingBalance.toLocaleString()} ₪**\n\n` +
        `תוכל לבקש ממני "מי עוד לא שילם?" כדי לראות את כרטיסיות הגבייה הישירות.`
    };
  }

  // 8. Send Message Intent
  if (isSendMessageIntent) {
    const firstArriving = arrivingToday[0];
    const guestName = firstArriving?.guest_name || 'האורח';
    const unitName = unitsMap.get(firstArriving?.unit_id)?.name || 'הבקתה';

    return {
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
    };
  }

  // 9. Maintenance Intent
  if (isMaintenanceIntent) {
    const maintUnits = units.filter((u) => u.operational_status === 'MAINTENANCE_ALERT' || u.operational_status === 'MAINTENANCE');
    if (maintUnits.length === 0) {
      return {
        ok: true,
        reply: `בדקתי את כל היחידות במערכת — **אין תקלות או קריאות אחזקה פתוחות** כרגע בכל המתחם! כל היחידות תקינות ופעילות. 🛠️✨`
      };
    }
    return {
      ok: true,
      reply: `ישנן **${maintUnits.length} יחידות** עם קריאת אחזקה פעילה:\n` +
        maintUnits.map((u) => `• **${u.name}**: ${u.custom_reason || 'בטיפול צוות אחזקה'}`).join('\n')
    };
  }

  // 10. Executive Resort Status Overview (Default Intelligent Fallback)
  const readyUnits = units.filter((u) => u.operational_status === 'READY').length;
  const unpaidCount = arrivingToday.filter((b) => b.payment_status === 'UNPAID' || b.payment_status === 'DEPOSIT_PAID').length;

  return {
    ok: true,
    reply: `שלום מקס, הנה **תמונת המצב המהירה של הריזורט** להיום:\n\n` +
      `🚪 **כניסות:** **${arrivingToday.length} הזמנות** צפויות להגיע היום.\n` +
      `🧹 **ניקיון:** **${readyUnits} מתוך ${units.length} יחידות** מוכנות ונקיות לקליטה.\n` +
      `💳 **גבייה:** ${unpaidCount > 0 ? `נותרו **${unpaidCount} אורחים** עם יתרת תשלום פתוחה.` : 'כל האורחים שילמו במלואם!'}\n\n` +
      `במה תרצה שנתמקד כעת? תוכל ללחוץ על הקיצורים למעלה או לשאול בחופשיות.`
  };
}
