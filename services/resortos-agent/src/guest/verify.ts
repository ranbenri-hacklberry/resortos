import { randomInt } from 'node:crypto';

/**
 * Unidentified-sender verification (Ran 2026-10-22).
 * A typed phone never releases a lockbox code in WhatsApp: on a match the guest link goes by SMS to the
 * booking phone only (the guest page can show the door code). Mismatch → OTP to the booking phone.
 * Anything else → SMS handoff to Ran only.
 */
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 3;
export const HANDOFF_GAP_MS = 15 * 60 * 1000;

export function newOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function isYes(text: string): boolean {
  return /^(?:כן|יש|בטח|נכון|כמובן|yes|yeah|yep|y|sure|да|نعم)(?=$|[\s!.,?🙂😊])/iu.test(text.trim());
}
export function isNo(text: string): boolean {
  return /^(?:לא|אין|no|nope|нет|لا)(?=$|[\s!.,?])/iu.test(text.trim());
}
export function extractOtp(text: string): string {
  const m = text.replace(/[\s-]/g, '').match(/^\D*(\d{6})\D*$/);
  return m ? m[1] : '';
}

export const V = {
  askHasBooking: (room: string) =>
    `שלום! 😊 יש לכם הזמנה ל${room} להיום? (כן / לא)`,
  askHasBookingGeneral: () =>
    `שלום! 😊 אשמח לעזור. יש לכם הזמנה אצלנו? (כן / לא)`,
  askPhone: () =>
    `מעולה! מה מספר הטלפון שאיתו בוצעה ההזמנה?`,
  askPhoneAgain: () =>
    `לא הצלחתי לזהות מספר טלפון 🙏 אפשר לכתוב אותו שוב, למשל 050-1234567?`,
  linkSent: () =>
    `תודה! 🙏 שלחתי את הקישור לדף האורח ב-SMS למספר שאיתו בוצעה ההזמנה. בדף תמצאו את כל פרטי השהות.`,
  otpSent: () =>
    `תודה! שלחתי קוד אימות בן 6 ספרות ב-SMS למספר שאיתו בוצעה ההזמנה. אפשר לכתוב אותו כאן 🙂`,
  otpWrong: (left: number) =>
    `הקוד לא תואם 🙏 נשארו ${left} ניסיונות. אפשר לנסות שוב.`,
  verified: () => `אומת ✅ תודה!`,
  handoff: () =>
    `תודה! 🙏 מנהל המתחם יחזור אליכם בהקדם.`,
  noCode: () =>
    `ברוכים הבאים! 😊 מנהל המתחם יעדכן אתכם כאן בפרטי הכניסה בהקדם 🌿`,
  otpSms: (code: string) => `קוד האימות שלכם: ${code}. בתוקף ל-10 דקות. אם לא ביקשתם, אפשר להתעלם.`,
  linkSms: (url: string) => `דף האורח שלכם: ${url}`,
  handoffSms: (p: { sender: string; name?: string | null; room?: string | null; text: string; why: string }) =>
    `פנייה לא מזוהה בצ׳אט (${p.why})\n📲 ${p.sender}${p.name ? ` · ${p.name}` : ''}\n🏠 ${p.room || 'לא צוין'}\n💬 ${p.text.replace(/\s+/g, ' ').trim().slice(0, 200)}`,
};
