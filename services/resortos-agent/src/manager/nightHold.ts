/** Manager-only: block the current room for one night in Kinorot. */

const HOLD_WORD = /(?:^|\s)(?:לא זמין|חסום(?:\s+ללילה)?|חסימה|לחסום|תחסום)(?:\s|$|[.!])/;

export function proposesNightHold(text: string): boolean {
  const raw = String(text || '').trim();
  if (!raw || /[?？]/.test(raw)) return false;
  if (/^(?:מה|כמה|יש|מי|איזה|למה)\b/.test(raw)) return false;
  return HOLD_WORD.test(raw);
}

export function holdConfirmText(roomLabel: string): string {
  return `הבנתי: *${roomLabel}* · חסימה ללילה אחד בכינורות, עד מחר.\nלחסום? השב *כן* או *לא*`;
}

export function holdProgressText(roomLabel: string): string {
  return `חוסם את *${roomLabel}* ללילה אחד. זה בתהליך.`;
}

export function holdDoneText(roomLabel: string, verified: boolean): string {
  return verified
    ? `✅ *${roomLabel}* חסום ללילה ביומן כינורות.`
    : `החסימה של *${roomLabel}* נשמרה בכינורות. היומן עדיין לא נקלט.`;
}
