import type { Lang, RoomEntry } from '../config.js';
import { resolveRoomByAlias } from '../llm/client.js';
import { complexOfRoom, resolveRoomWithContext } from './managerFuzzyMatcher.js';

export type StatusChange = 'ready' | 'occupied' | 'vacant' | 'dirty' | 'cleaning';

const READY_WORD = /מוכן|מוכנה|אישור|מאשר|גמור|ready|finish|done|เสร็จ|เรียบร้อย|جاهز|نظيف/i;
const OCCUPIED_WORD = /תפוס|מאוכלס|occupied/i;
const VACANT_WORD = /(?:^|\s)פנוי(?:\s|$|[.!?])/i;
const DIRTY_WORD = /מלוכלך|לניקיון|dirty/i;
const CLEANING_WORD = /בניקיון|מתחיל|התחלתי לנקות|start clean/i;

const LABEL: Record<Lang, Record<StatusChange, string>> = {
  he: { ready: 'מוכן לאורח', occupied: 'מאוכלס', vacant: 'פנוי', dirty: 'ממתין לניקיון', cleaning: 'בניקיון' },
  th: { ready: 'พร้อมใช้งาน', occupied: 'มีแขก', vacant: 'ว่าง', dirty: 'รอทำความสะอาด', cleaning: 'กำลังทำความสะอาด' },
  ar: { ready: 'جاهزة للضيف', occupied: 'مشغولة', vacant: 'فاضية', dirty: 'بانتظار التنظيف', cleaning: 'قيد التنظيف' },
};

export function statusLabel(lang: Lang, change: StatusChange): string {
  return (LABEL[lang] || LABEL.he)[change];
}

export function textHasStatusWord(text: string): boolean {
  return READY_WORD.test(text) || OCCUPIED_WORD.test(text) || (VACANT_WORD.test(text) && !/פנויים/.test(text)) || DIRTY_WORD.test(text) || CLEANING_WORD.test(text);
}

export function proposeStatusChange(text: string, rooms: RoomEntry[], contextRoomId?: string): { roomId: string; change: StatusChange } | null {
  const trimmed = text.trim();
  if (!trimmed || /[?？]/.test(trimmed)) return null;
  if (/פנויים|מה פנוי|יש פנוי|חדרים פנויים/.test(trimmed)) return null;
  if (/^(?:מה|כמה|יש|מי|איזה|איפה|מתי|סטטוס|מחירון)\b/.test(trimmed)) return null;

  let change: StatusChange | null = null;
  if (READY_WORD.test(trimmed)) change = 'ready';
  else if (OCCUPIED_WORD.test(trimmed)) change = 'occupied';
  else if (VACANT_WORD.test(trimmed)) change = 'vacant';
  else if (DIRTY_WORD.test(trimmed)) change = 'dirty';
  else if (CLEANING_WORD.test(trimmed)) change = 'cleaning';
  if (!change) return null;

  const context = contextRoomId ? { complexKey: complexOfRoom(contextRoomId)?.key } : {};
  const fuzzy = resolveRoomWithContext(trimmed, rooms, context);
  const roomId = fuzzy.type === 'RESOLVED' ? fuzzy.roomId : resolveRoomByAlias(trimmed, rooms);
  if (roomId) return { roomId, change };
  if (contextRoomId) return { roomId: contextRoomId, change };
  return null;
}

export function statusConfirmText(lang: Lang, roomLabel: string, change: StatusChange): string {
  const label = statusLabel(lang, change);
  if (lang === 'th') return `เข้าใจว่า *${roomLabel}* → ${label}\nยืนยันการอัปเดต? ตอบ *כן* หรือ *לא*`;
  if (lang === 'ar') return `فهمت: *${roomLabel}* → ${label}\nللتحديث أجب *نعم* أو *لا*`;
  return `הבנתי: *${roomLabel}* → ${label}.\nלעדכן? השב *כן* או *לא*`;
}

export function confirmAnswer(text: string): 'yes' | 'no' | null {
  const t = text.trim();
  if (/^(?:כן|אישור|מאשר|יאללה|עדכן|טוב|בטח|מעולה|אוקי|אוקיי|בסדר|מאושר|נכון|نعم|ใช่|yes|ok|okay|[👍👌✅✔️☑️😊🙂😀😃😄😁🤠😉❤️🙌👏]+)$/iu.test(t)) {
    return 'yes';
  }
  if (/^(?:לא|ביטול|בטל|לא לעדכן|לא לאשר|אל תעדכן|אל תאשר|لا|ไม่|no|[👎❌✖️🚫]+)$/iu.test(t)) {
    return 'no';
  }
  return null;
}
