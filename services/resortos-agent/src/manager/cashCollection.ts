/** A manager, already in a room, reporting cash just collected. */

const COLLECT_WORD = /גביתי|גבינו|גבייה|גביה|נגבה|נגבתה|התקבל|התקבלו|קיבלתי|קיבלנו|מזומן/;

export function proposeCashCollection(text: string): { shekels: number } | null {
  const raw = String(text || '').trim();
  if (!raw || /[?？]/.test(raw)) return null;
  if (/^(?:מה|כמה|יש|מי|איזה)\b/.test(raw)) return null;
  if (!COLLECT_WORD.test(raw)) return null;
  const amount = raw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!amount) return null;
  const shekels = Number(amount[1]);
  if (!Number.isFinite(shekels) || shekels <= 0 || shekels > 100000) return null;
  return { shekels };
}

export function cashShekelLabel(shekels: number): string {
  return `₪${shekels.toLocaleString('he-IL', { maximumFractionDigits: shekels % 1 ? 2 : 0 })}`;
}

export function cashConfirmText(roomLabel: string, shekels: number, guestName?: string): string {
  const guest = guestName ? ` עבור ${guestName}` : '';
  return `הבנתי: *${roomLabel}* · גביית מזומן ${cashShekelLabel(shekels)}${guest}.\nלעדכן? השב *כן* או *לא*`;
}

export type PaymentChoice = 'PARTIAL' | 'PAID' | 'keep';

export function paymentStatusLabel(status: 'PARTIAL' | 'PAID'): string {
  return status === 'PARTIAL' ? 'שולם חלקית' : 'שולם';
}

export function paymentStatusQuestion(): string {
  return 'לשנות סטטוס תשלום?\n1. שולם חלקית\n2. שולם\nאו *לא* כדי להשאיר כמו שהוא';
}

/** חלקית is matched before שולם, because the longer phrase contains it. */
export function paymentStatusChoice(text: string): PaymentChoice | null {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^(?:לא|ביטול|בטל|no)$/i.test(t)) return 'keep';
  if (/^(?:1\.?|חלקית|חלקי|שולם חלקית|שולם חלקי|partial)$/i.test(t)) return 'PARTIAL';
  if (/^(?:2\.?|שולם|שולם מלא|שולם במלואו|paid)$/i.test(t)) return 'PAID';
  return null;
}
