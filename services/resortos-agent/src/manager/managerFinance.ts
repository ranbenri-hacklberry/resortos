/**
 * ResortOS Agent — Manager Financial Assistant (Chloe)
 * 
 * Handles check capture via WhatsApp, conversational manual forecast entries,
 * duplicate checks detection, and explicit confirmation before adding to forecast.
 */

export interface PendingCheckConfirmation {
  captureId: string;
  senderPhone: string;
  check: {
    check_number: string;
    amount: number;
    due_date: string;
    payee: string;
    bank: string;
    branch: string;
    account: string;
    description: string;
    is_outgoing: boolean;
  };
  duplicates: Array<any>;
  timestamp: number;
}

const pendingConfirmations = new Map<string, PendingCheckConfirmation>();

export function getPendingCheck(senderPhone: string): PendingCheckConfirmation | null {
  const norm = senderPhone.replace(/\D/g, '');
  const hit = pendingConfirmations.get(norm);
  if (!hit) return null;
  // Expire after 30 minutes
  if (Date.now() - hit.timestamp > 30 * 60 * 1000) {
    pendingConfirmations.delete(norm);
    return null;
  }
  return hit;
}

export function setPendingCheck(senderPhone: string, item: PendingCheckConfirmation) {
  const norm = senderPhone.replace(/\D/g, '');
  pendingConfirmations.set(norm, item);
}

export function clearPendingCheck(senderPhone: string) {
  const norm = senderPhone.replace(/\D/g, '');
  pendingConfirmations.delete(norm);
}

/**
 * Detect if a text message is a conversational manual forecast entry
 * Examples:
 * "הוסף הוצאה 12000 מזרחי ב-20/11 שכירות"
 * "הוסף הכנסה 25000 בינלאומי ב-15/11 תקבול קבוצה"
 * "הוסף שיק 6850 לפקודת מיסטרל ב-25/11/2026 מזרחי"
 */
export function parseConversationalForecastEntry(text: string) {
  const t = String(text || '').trim();

  // Pattern: הוסף (הוצאה|הכנסה|שיק) <סכום> ...
  const match = t.match(/^(?:הוסף|תרשום|הכנס)\s*(הוצאה|הכנסה|שיק)\s*([0-9,.]+)\s*(?:₪|ש"ח|שח)?\s*(.*)$/i);
  if (!match) return null;

  const kind = match[1].toLowerCase();
  const rawAmount = Number(match[2].replace(/,/g, ''));
  const rest = match[3];

  if (!rawAmount || Number.isNaN(rawAmount)) return null;

  let bank = 'mizrahi';
  if (/דיסקונט/i.test(rest)) bank = 'discount';
  else if (/בינלאומי|fibi/i.test(rest)) bank = 'beinleumi';
  else if (/מזרחי/i.test(rest)) bank = 'mizrahi';

  // Extract date (DD/MM or DD/MM/YYYY or YYYY-MM-DD)
  let date = '';
  const dateMatch = rest.match(/(\d{1,2})[\/\.](\d{1,2})(?:[\/\.](\d{2,4}))?/);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const month = dateMatch[2].padStart(2, '0');
    let year = dateMatch[3] ? Number(dateMatch[3]) : 2026;
    if (year < 100) year += 2000;
    date = `${year}-${month}-${day}`;
  } else {
    // Default to +7 days
    const d = new Date(Date.now() + 7 * 86400000);
    date = d.toISOString().slice(0, 10);
  }

  // Extract payee / description
  let label = rest
    .replace(/(?:בנק\s*)?(?:מזרחי|דיסקונט|בינלאומי)/gi, '')
    .replace(/(?:ב-|בתאריך\s*)?\d{1,2}[\/\.]\d{1,2}(?:[\/\.]\d{2,4})?/g, '')
    .replace(/לפקודת\s*/g, '')
    .trim();

  if (!label) {
    label = kind === 'שיק' ? 'שיק לספק' : kind === 'הוצאה' ? 'הוצאה צפויה' : 'הכנסה צפויה';
  }

  return {
    kind, // 'שיק' | 'הוצאה' | 'הכנסה'
    amount: rawAmount,
    date,
    bank,
    label,
    isExpense: kind === 'שיק' || kind === 'הוצאה'
  };
}

/**
 * Format confirmation prompt for captured check
 */
export function formatCheckConfirmationPrompt(c: PendingCheckConfirmation['check'], duplicates: any[]) {
  const bankName = c.bank.includes('בינלאומי') ? 'הבנק הבינלאומי (31-92-395140)' : 'מזרחי טפחות (462-601997)';
  const dupWarning = duplicates.length > 0
    ? `⚠️ *שים לב: נמצא שיק דומה במערכת!* מס׳ ${duplicates[0].check_number} ע״ס ₪${Number(duplicates[0].amount).toLocaleString('he-IL')}.\n\n`
    : '';

  return `📸 *זיהיתי שיק חדש לקליטה:*
${dupWarning}🔹 *מספר שיק:* ${c.check_number}
🔹 *סכום:* ₪${Number(c.amount).toLocaleString('he-IL')}
🔹 *תאריך פירעון:* ${c.due_date}
🔹 *לפקודת:* ${c.payee}
🔹 *חשבון חיוב:* ${bankName}
🔹 *סוג:* ${c.is_outgoing ? 'שיק יוצא (הוצאה)' : 'שיק נכנס (הכנסה)'}

האם לאשר ולהכניס לתחזית התזרים של ResortOS?
השב *כן* או *אישור* להוספה, או ציין תיקון (לדוגמה: "סכום 4500" או "תאריך 20/11").`;
}
