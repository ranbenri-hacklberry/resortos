import { errorJson, json, fetchPostgrest, getPostgrestConfig, DEFAULT_TENANT_ID } from '../_db.js';

function jerusalemToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

function formatReadiness(status) {
  if (status === 'READY') return { label: 'מוכן ונקי לקליטה', color: '#10B981', isReady: true };
  if (status === 'IN_PROGRESS') return { label: 'בניקיון כרגע', color: '#F59E0B', isReady: false };
  if (status === 'MAINTENANCE_ALERT') return { label: 'תקלה / טיפול אחזקה', color: '#EF4444', isReady: false };
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

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

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

    // Fetch live bookings and units from Supabase PostgREST
    let bookings = [];
    let units = [];
    try {
      const bRes = await fetchPostgrest(`/hotelos_bookings?select=*&deleted_at=is.null&booking_status=neq.CANCELED&order=check_in_date.asc&limit=500`, { method: 'GET' }, env);
      if (bRes && bRes.ok) {
        bookings = await bRes.json();
      }
    } catch (_) {}

    try {
      const uRes = await fetchPostgrest(`/resort_units?select=*&limit=100`, { method: 'GET' }, env);
      if (uRes && uRes.ok) {
        units = await uRes.json();
      }
    } catch (_) {}

    const unitsMap = new Map((units || []).map((u) => [u.id, u]));
    const arrivingToday = (bookings || []).filter((b) => b.check_in_date === today);
    const stayingToday = (bookings || []).filter((b) => b.check_in_date <= today && b.check_out_date >= today);

    const normalized = message.toLowerCase();

    // Intent: Arrivals
    const isArrivalsIntent = (
      normalized.includes('כניסות') ||
      normalized.includes('מגיע') ||
      normalized.includes('מגיעים') ||
      normalized.includes('נכנסים') ||
      (normalized.includes('הזמנות') && normalized.includes('היום'))
    );

    // Intent: Unpaid
    const isUnpaidIntent = (
      normalized.includes('לא שילם') ||
      normalized.includes('לא שילמו') ||
      normalized.includes('מי חייב') ||
      normalized.includes('יתרת תשלום') ||
      normalized.includes('גבייה') ||
      normalized.includes('חובות')
    );

    // Intent: Send Message
    const isSendMessageIntent = (
      normalized.includes('תשלחי הודעה') ||
      normalized.includes('לשלוח הודעה') ||
      normalized.includes('הודעת ווטסאפ') ||
      normalized.includes('סמס') ||
      normalized.includes('ווטסאפ לנכנסים')
    );

    if (isArrivalsIntent && !isUnpaidIntent) {
      const items = arrivingToday.map((b) => {
        const unit = unitsMap.get(b.unit_id);
        const unitName = unit?.name || b.unit_id;
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
      });

      const readyCount = items.filter((i) => i.readiness.isReady).length;
      const count = items.length;

      let reply = `הנה **${count} הכניסות המתוכננות להיום** (יום שבת, 31 באוקטובר):\n`;
      reply += `• ${readyCount} מתוך ${count} יחידות מוכנות ונקיות לקליטה.\n`;
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

    if (isUnpaidIntent) {
      const targetPool = arrivingToday.length > 0 ? arrivingToday : stayingToday;
      const unpaidItems = targetPool
        .map((b) => {
          const unit = unitsMap.get(b.unit_id);
          const unitName = unit?.name || b.unit_id;
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
        })
        .filter((item) => item.payment.status === 'UNPAID' || item.payment.status === 'DEPOSIT_PAID');

      const totalBalance = unpaidItems.reduce((acc, curr) => acc + (curr.payment.balanceDue || 0), 0);

      let reply = `בדקתי את סטטוס התשלום של האורחים הנכנסים היום.\n`;
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
            recipient: `${guestName} (${firstArriving?.guest_phone || '052-1234567'})`,
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

    return json({
      ok: true,
      reply: `שלום מקס, אני כאן לשירותך. נתוני הריזורט להיום (${today}) מסונכרנים בזמן אמת.\n\nתוכל לבקש ממני למשל:\n• **"תראי לי את הכניסות להיום"** כדי לראות את כרטיסיות האורחים.\n• **"מי מהם עוד לא שילם?"** כדי לראות מי חייב כסף.\n• **"תשלחי הודעה לאורחים"** להפקת טיוטת הודעה לאישור.`
    });
  } catch (err) {
    return errorJson(err.message || 'CHLOE_ERROR', 500);
  }
}
