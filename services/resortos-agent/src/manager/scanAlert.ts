import type { CleanerProfile, RoomEntry } from '../config.js';
import { KNOWN_STAFF_LIDS } from '../whatsapp/client.js';

/** Managers who get automatic alerts (excludes anyone with noAlerts, e.g. אדם). */
export function alertRecipients(cleaners: CleanerProfile[]): CleanerProfile[] {
  return cleaners.filter((c) => c.role === 'MANAGER' && c.phone && !c.noAlerts);
}

/** Room label for alerts: use the name as-is when it already reads as a cabin label (no "בבקתה בקתות מאיה · בקתה 3"). */
export function alertRoomLabel(r?: Partial<RoomEntry> | null): string {
  const name = String((r as any)?.name || (r as any)?.letterCode || '').trim();
  if (!name) return 'היחידה';
  if (name.includes('משרד') || name.includes('בקתה') || name.includes('·')) return name;
  return `בקתה ${name}`;
}

/** Human-readable sender for staff messages: never a raw @lid. */
export function displaySender(jid: string, senderPn?: string, cleaners: CleanerProfile[] = []): string {
  const raw = String(jid || '');
  const user = raw.split('@')[0].split(':')[0].replace(/\D/g, '');
  let phone = '';
  if (raw.endsWith('@lid')) {
    phone = KNOWN_STAFF_LIDS[user] || cleaners.find((c) => c.lid && c.lid === user)?.phone || String(senderPn || '').replace(/\D/g, '');
  } else {
    phone = user;
  }
  if (!phone) return 'מספר לא מזוהה';
  return phone.startsWith('972') ? `0${phone.slice(3)}` : phone;
}

export function buildUnknownScanAlert(roomLabel: string, sender: string): string {
  return `🔔 סריקה ממספר לא מזוהה ב${roomLabel}\nטלפון: ${sender}\nלא נמצאה הזמנה לפי טלפון — ביקשתי שם מלא ותאריכים. כדאי לבדוק בכינורות.`;
}

export const SCAN_ALERT_COOLDOWN_MS = 10 * 60 * 1000;
export const ALERT_MEMORY_MS = 15 * 60 * 1000;

export function createAlertMemory(now: () => number = Date.now) {
  const lastByScanner = new Map<string, number>();
  const lastByManager = new Map<string, { text: string; at: number }>();
  return {
    /** True if an alert for this scanner may go out now (and records it). */
    shouldAlert(scannerKey: string): boolean {
      const t = now();
      const prev = lastByScanner.get(scannerKey);
      if (prev !== undefined && t - prev < SCAN_ALERT_COOLDOWN_MS) return false;
      lastByScanner.set(scannerKey, t);
      return true;
    },
    remember(managerKey: string, text: string) { lastByManager.set(managerKey, { text, at: now() }); },
    recent(managerKey: string): string | null {
      const e = lastByManager.get(managerKey);
      if (!e || now() - e.at > ALERT_MEMORY_MS) return null;
      return e.text;
    },
    forget(managerKey: string) { lastByManager.delete(managerKey); },
  };
}

const WHAT_IS_IT = /^\s*(מה\s*זה|מה\s*זאת|מה\s*קרה|\?+|מה\??)\s*[?!.]*\s*$/;
export function isWhatIsThis(text: string): boolean { return WHAT_IS_IT.test(String(text || '')); }

export function explainAlert(alert: string): string {
  return `זו התראה ששלחתי לפני כמה דקות: מישהו סרק QR של חדר ממספר שלא מצאתי לו הזמנה, אז ביקשתי ממנו שם ותאריכים.\n\n${alert}`;
}
