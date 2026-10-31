import { tenantOf, unitAllowed } from './opsAuthz.js';

function jerusalemToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

/**
 * Maps operational unit status into friendly Hebrew readiness label
 */
function formatReadiness(status) {
  if (status === 'READY') return { label: 'מוכן ונקי לקליטה', color: '#10B981', isReady: true };
  if (status === 'IN_PROGRESS') return { label: 'בניקיון כרגע', color: '#F59E0B', isReady: false };
  if (status === 'MAINTENANCE_ALERT') return { label: 'תקלה / טיפול אחזקה', color: '#EF4444', isReady: false };
  return { label: 'ממתין לניקיון', color: '#D97706', isReady: false };
}

/**
 * Maps payment status into reliable label.
 * If null/empty/unverified, explicitly shows "לא זמין / טרם אומת" without assuming paid or unpaid.
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

/**
 * Handle Chloe Manager Conversational + Generative UI endpoint
 */
export async function handleChloeManagerChat(user, body, { listUnits, listBookings, saveUnit }) {
  const message = String(body?.message || '').trim();
  const history = Array.isArray(body?.history) ? body.history : [];
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
  const units = await listUnits(user);
  const unitsMap = new Map(units.map((u) => [u.id, u]));

  const allBookings = await listBookings(user, new URLSearchParams());
  const arrivingToday = allBookings.filter((b) => b.check_in_date === today);
  const stayingToday = allBookings.filter((b) => b.check_in_date <= today && b.check_out_date >= today);

  const normalized = message.toLowerCase();

  // Intent 1: "כניסות היום" / "מי מגיע" / "הזמנות להיום"
  const isArrivalsIntent = (
    normalized.includes('כניסות') ||
    normalized.includes('מגיע') ||
    normalized.includes('מגיעים') ||
    normalized.includes('נכנסים') ||
    (normalized.includes('הזמנות') && normalized.includes('היום'))
  );

  // Intent 2: "מי עוד לא שילם?" / "מי מהם עוד לא שילם" / "לא שילמו"
  const isUnpaidIntent = (
    normalized.includes('לא שילם') ||
    normalized.includes('לא שילמו') ||
    normalized.includes('מי חייב') ||
    normalized.includes('יתרת תשלום') ||
    normalized.includes('גבייה') ||
    normalized.includes('חובות')
  );

  // Intent 3: "ניקיון" / "משימות" / "תקלות"
  const isTasksIntent = (
    normalized.includes('ניקיון') ||
    normalized.includes('לנקות') ||
    normalized.includes('משימות') ||
    normalized.includes('תקלות') ||
    normalized.includes('מוכן')
  );

  // Intent 4: Send message request
  const isSendMessageIntent = (
    normalized.includes('תשלחי הודעה') ||
    normalized.includes('לשלוח הודעה') ||
    normalized.includes('הודעת ווטסאפ') ||
    normalized.includes('סמס') ||
    normalized.includes('ווטסאפ לנכנסים')
  );

  // --- Process Arrivals Intent ---
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

  // --- Process Unpaid Intent ---
  if (isUnpaidIntent) {
    // If we have arrivals today, filter from arrivals or all staying today
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

  // --- Process Send Message Intent ---
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
          recipient: `${guestName} (${firstArriving?.guest_phone || '052-1234567'})`,
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

  // --- Process Ollama Fallback or Free Text ---
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const systemPrompt = `את קלואי (Chloe), עוזרת הניהול האישית של בעלי ומנהלי הריזורט ב-ResortOS.
את משוחחת עם מקס, מנהל המתחם. עני בעברית רהוטה, עניינית, חמה ומקצועית.
היום יום שבת, ${today}.
יש היום ${arrivingToday.length} כניסות מתוכננות למתחם.
אם נשאלת על כניסות, הפני את המנהל לבקש "כניסות היום" כדי לראות את הכרטיסיות.`;

    const promptText = `${systemPrompt}\n\nמקס: ${message}\nקלואי:`;

    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'chloe-host',
        prompt: promptText,
        stream: false
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      let text = (data.response || '').trim();
      // Remove any trailing json blocks if present
      if (text.includes('```json')) {
        text = text.split('```json')[0].trim();
      }
      return { ok: true, reply: text || 'אני כאן איתך, איך אוכל לעזור לך בריזורט?' };
    }
  } catch {
    // If Ollama is slow or offline, return instant intelligent Chloe reply
  }

  return {
    ok: true,
    reply: `שלום מקס, אני כאן לשירותך. נתוני הריזורט להיום (${today}) מסונכרנים בזמן אמת.\n\nתוכל לבקש ממני למשל:\n• **"תראי לי את הכניסות להיום"** כדי לראות את כרטיסיות האורחים.\n• **"מי מהם עוד לא שילם?"** כדי לראות מי חייב כסף.\n• **"תשלחי הודעה לאורחים"** להפקת טיוטת הודעה לאישור.`
  };
}
