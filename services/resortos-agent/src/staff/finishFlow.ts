// Ran 2026-10-29: cleaning finish by photos (no rescan) → 1 ready / 2 repair / 3 missing, multilingual.
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export type FinishLang = 'he' | 'th' | 'ar' | 'en';
export type FinishChoice = 'ready' | 'repair' | 'missing';

/** Burst of photos → one question. */
export const FINISH_PHOTO_DEBOUNCE_MS = 3 * 60 * 1000;

const DIGITS: Record<string, string> = {
  '๐': '0', '๑': '1', '๒': '2', '๓': '3', '٠': '0', '١': '1', '٢': '2', '٣': '3', '۱': '1', '۲': '2', '۳': '3',
};
export function normalizeDigits(s: string): string {
  return s.replace(/[๐-๙٠-٩۰-۹]/g, (c) => DIGITS[c] ?? c);
}

const WORDS: Array<[FinishChoice, RegExp]> = [
  ['ready', /^(?:מוכן|מוכנה|מוכנים|הכל מוכן|พร้อม|เรียบร้อย|เสร็จ(?:แล้ว)?|جاهز|جاهزة|خلص|ready|done|ok|👍)$/i],
  ['repair', /^(?:תיקון|תקלה|צריך תיקון|שבור|ซ่อม|ชำรุด|เสีย|تصليح|عطل|خربان|repair|fix|broken)$/i],
  ['missing', /^(?:חוסר|חסר|חסרים|ขาด|ขาดของ|ไม่มี|ناقص|نقص|missing)$/i],
];

/** 1/2/3 (incl. Thai/Arabic digits, "1.", "1)") or a word in he/th/ar/en. null = not understood. */
export function parseFinishChoice(raw: string | null | undefined): FinishChoice | null {
  const t = normalizeDigits(String(raw || '')).trim().replace(/[.)!،,\s]+$/u, '').trim();
  if (!t) return null;
  if (/^1$/.test(t)) return 'ready';
  if (/^2$/.test(t)) return 'repair';
  if (/^3$/.test(t)) return 'missing';
  for (const [k, re] of WORDS) if (re.test(t)) return k;
  return null;
}

/** Script of what the worker wrote wins; otherwise their cleaners.json language. */
export function finishLang(profileLang: string | undefined, text?: string | null): FinishLang {
  const t = String(text || '');
  if (/[\u0E00-\u0E7F]/.test(t)) return 'th';
  if (/[\u0600-\u06FF]/.test(t)) return 'ar';
  if (/[\u0590-\u05FF]/.test(t)) return 'he';
  if (/[a-z]{3,}/i.test(t) && !/^\s*START[_\s]/i.test(t)) return 'en';
  return (['he', 'th', 'ar', 'en'].includes(String(profileLang)) ? profileLang : 'he') as FinishLang;
}

export const FINISH_TEXT = {
  askChoice: {
    he: (room: string) => `📸 קיבלתי את התמונות של ${room}, תודה!\nמה מצב החדר?\n1 - מוכן ✅\n2 - צריך תיקון 🔧\n3 - יש חוסר 📦\n(אפשר להשיב 1, 2 או 3)`,
    th: (room: string) => `📸 ได้รับรูปห้อง ${room} แล้วค่ะ ขอบคุณค่ะ!\nห้องเป็นอย่างไรบ้างคะ?\n1 - พร้อม ✅\n2 - ต้องซ่อม 🔧\n3 - ของขาด 📦\n(ตอบ 1, 2 หรือ 3 ได้ค่ะ)`,
    ar: (room: string) => `📸 وصلتني صور ${room}، شكراً!\nشو وضع الغرفة؟\n1 - جاهزة ✅\n2 - بحاجة تصليح 🔧\n3 - في نقص 📦\n(جاوب 1 أو 2 أو 3)`,
    en: (room: string) => `📸 Got the photos of ${room}, thanks!\nHow is the room?\n1 - Ready ✅\n2 - Needs repair 🔧\n3 - Something missing 📦\n(Reply 1, 2 or 3)`,
  },
  askChoiceNoPhotos: {
    he: (room: string) => `סיום ניקיון ${room}. מה מצב החדר?\n1 - מוכן ✅\n2 - צריך תיקון 🔧\n3 - יש חוסר 📦`,
    th: (room: string) => `ทำความสะอาด ${room} เสร็จแล้ว ห้องเป็นอย่างไรบ้างคะ?\n1 - พร้อม ✅\n2 - ต้องซ่อม 🔧\n3 - ของขาด 📦`,
    ar: (room: string) => `إنهاء تنظيف ${room}. شو وضع الغرفة؟\n1 - جاهزة ✅\n2 - بحاجة تصليح 🔧\n3 - في نقص 📦`,
    en: (room: string) => `Finishing ${room}. How is the room?\n1 - Ready ✅\n2 - Needs repair 🔧\n3 - Something missing 📦`,
  },
  askProblem: {
    he: (k: 'repair' | 'missing') => k === 'repair' ? '🔧 שלחו בבקשה תמונה של התקלה והסבר קצר (טקסט או הקלטה).' : '📦 שלחו בבקשה תמונה של מה שחסר והסבר קצר (טקסט או הקלטה).',
    th: (k: 'repair' | 'missing') => k === 'repair' ? '🔧 ช่วยส่งรูปจุดที่เสียและอธิบายสั้นๆ (พิมพ์หรือส่งข้อความเสียง) ค่ะ' : '📦 ช่วยส่งรูปของที่ขาดและอธิบายสั้นๆ (พิมพ์หรือส่งข้อความเสียง) ค่ะ',
    ar: (k: 'repair' | 'missing') => k === 'repair' ? '🔧 ابعت لو سمحت صورة للعطل وشرح قصير (كتابة أو رسالة صوتية).' : '📦 ابعت لو سمحت صورة للنقص وشرح قصير (كتابة أو رسالة صوتية).',
    en: (k: 'repair' | 'missing') => k === 'repair' ? '🔧 Please send a photo of the problem and a short explanation (text or voice).' : '📦 Please send a photo of what is missing and a short explanation (text or voice).',
  },
  askProblemOptional: {
    he: (k: 'repair' | 'missing') => k === 'repair' ? '🔧 מה צריך לתקן? הסבר קצר (אפשר גם תמונה).' : '📦 מה חסר? הסבר קצר (אפשר גם תמונה).',
    th: (k: 'repair' | 'missing') => k === 'repair' ? '🔧 ต้องซ่อมอะไรคะ? อธิบายสั้นๆ (ส่งรูปได้ด้วยค่ะ)' : '📦 ขาดอะไรคะ? อธิบายสั้นๆ (ส่งรูปได้ด้วยค่ะ)',
    ar: (k: 'repair' | 'missing') => k === 'repair' ? '🔧 شو بدو تصليح؟ شرح قصير (ممكن كمان صورة).' : '📦 شو ناقص؟ شرح قصير (ممكن كمان صورة).',
    en: (k: 'repair' | 'missing') => k === 'repair' ? '🔧 What needs repair? A short explanation (a photo is welcome too).' : '📦 What is missing? A short explanation (a photo is welcome too).',
  },
  needExplanation: { he: 'קיבלתי את התמונה. מה ההסבר? (טקסט או הקלטה)', th: 'ได้รับรูปแล้วค่ะ ช่วยอธิบายหน่อยค่ะ (พิมพ์หรือส่งข้อความเสียง)', ar: 'وصلت الصورة. شو الشرح؟ (كتابة أو رسالة صوتية)', en: 'Got the photo. What is the explanation? (text or voice)' },
  needProblemPhoto: { he: 'תודה. שלחו בבקשה גם תמונה של הבעיה 📸', th: 'ขอบคุณค่ะ ช่วยส่งรูปปัญหาด้วยนะคะ 📸', ar: 'شكراً. ابعت كمان صورة للمشكلة 📸', en: 'Thanks. Please also send a photo of the problem 📸' },
  notUnderstood: { he: 'לא הבנתי. השיבו 1 (מוכן), 2 (תיקון) או 3 (חוסר).', th: 'ไม่เข้าใจค่ะ ตอบ 1 (พร้อม), 2 (ซ่อม) หรือ 3 (ขาด) นะคะ', ar: 'ما فهمت. جاوب 1 (جاهزة)، 2 (تصليح) أو 3 (نقص).', en: "Sorry, I didn't get that. Reply 1 (ready), 2 (repair) or 3 (missing)." },
  ready: { he: (room: string) => `תודה! ${room} סומן כמוכן וממתין לביקורת ✅`, th: (room: string) => `ขอบคุณค่ะ! ${room} บันทึกว่าพร้อมแล้ว รอตรวจค่ะ ✅`, ar: (room: string) => `شكراً! ${room} تسجلت جاهزة وبانتظار الفحص ✅`, en: (room: string) => `Thanks! ${room} is marked ready, awaiting inspection ✅` },
  readyBlocked: { he: (room: string) => `ל־${room} יש תקלה פתוחה, אז הוא נשאר בתקלה עד שמנהל יטפל. תודה!`, th: (room: string) => `${room} ยังมีงานซ่อมค้างอยู่ จะรอผู้จัดการตรวจค่ะ ขอบคุณค่ะ!`, ar: (room: string) => `${room} فيها عطل مفتوح، بتضل هيك لحد ما المدير يعالجه. شكراً!`, en: (room: string) => `${room} has an open maintenance issue, so it stays flagged until a manager handles it. Thanks!` },
  problemSaved: { he: (room: string) => `נרשם ל־${room} והמנהלים יראו את זה בלוח ✅`, th: (room: string) => `บันทึกให้ ${room} แล้ว ผู้จัดการจะเห็นในระบบค่ะ ✅`, ar: (room: string) => `تسجّل لـ${room} والمدراء رح يشوفوه بالنظام ✅`, en: (room: string) => `Logged for ${room}; managers will see it on the board ✅` },
  closePreviousFirst: {
    he: (prev: string, next: string) => `לפני שמתחילים את ${next}, צריך לסגור את ${prev}: שלחו תמונות של החדר ואז 1/2/3. אחרי זה אפתח את ${next} אוטומטית, בלי לסרוק שוב.`,
    th: (prev: string, next: string) => `ก่อนเริ่ม ${next} ต้องปิดงาน ${prev} ก่อนค่ะ: ส่งรูปห้องแล้วตอบ 1/2/3 จากนั้นจะเปิด ${next} ให้อัตโนมัติ ไม่ต้องสแกนใหม่ค่ะ`,
    ar: (prev: string, next: string) => `قبل ما تبلش ${next}، لازم تسكّر ${prev}: ابعت صور الغرفة وبعدين 1/2/3. بعدها بفتحلك ${next} تلقائياً بدون مسح من جديد.`,
    en: (prev: string, next: string) => `Before starting ${next}, please close ${prev}: send photos of the room, then 1/2/3. I'll then open ${next} automatically, no need to rescan.`,
  },
  closePreviousFirstNoPhotos: {
    he: (prev: string, next: string) => `לפני שמתחילים את ${next}, צריך לסגור את ${prev}. מה מצבו? 1 מוכן / 2 תיקון / 3 חוסר. אחרי זה אפתח את ${next} אוטומטית.`,
    th: (prev: string, next: string) => `ก่อนเริ่ม ${next} ต้องปิดงาน ${prev} ก่อนค่ะ ตอบ 1 พร้อม / 2 ซ่อม / 3 ขาด แล้วจะเปิด ${next} ให้อัตโนมัติค่ะ`,
    ar: (prev: string, next: string) => `قبل ما تبلش ${next}، لازم تسكّر ${prev}. 1 جاهزة / 2 تصليح / 3 نقص. بعدها بفتحلك ${next} تلقائياً.`,
    en: (prev: string, next: string) => `Before starting ${next}, please close ${prev}: 1 ready / 2 repair / 3 missing. I'll then open ${next} automatically.`,
  },
  qrUnreadable: { he: 'לא הצלחתי לקרוא את הברקוד בתמונה. שלחו תמונה ברורה יותר של הברקוד, או כתבו את קוד החדר.', th: 'อ่าน QR ในรูปไม่ได้ค่ะ ช่วยส่งรูป QR ที่ชัดกว่านี้ หรือพิมพ์รหัสห้องมาได้เลยค่ะ', ar: 'ما قدرت أقرأ الباركود بالصورة. ابعت صورة أوضح للباركود أو اكتب كود الغرفة.', en: "I couldn't read the QR in the photo. Please send a clearer photo of the QR, or type the room code." },
  stillWaitingPhotos: { he: (room: string) => `עדיין מחכה לתמונות של ${room} 📸`, th: (room: string) => `ยังรอรูปห้อง ${room} อยู่นะคะ 📸`, ar: (room: string) => `لسا بستنى صور ${room} 📸`, en: (room: string) => `Still waiting for photos of ${room} 📸` },
};

/** Default photo store: local disk under data/cleaning-photos + index.jsonl (no DB). */
export async function storeCleaningPhotoLocal(p: { roomId: string; by: string; buffer: Buffer; mimetype: string; kind: 'finish' | 'problem' }): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.join(config.dataDir, 'cleaning-photos', day, p.roomId.replace(/[^\w\-]/g, '_'));
  await mkdir(dir, { recursive: true });
  const ext = p.mimetype.includes('png') ? 'png' : 'jpg';
  const file = path.join(dir, `${Date.now()}-${p.kind}.${ext}`);
  await writeFile(file, p.buffer);
  await appendFile(path.join(config.dataDir, 'cleaning-photos', 'index.jsonl'), JSON.stringify({ at: new Date().toISOString(), room: p.roomId, by: p.by, kind: p.kind, file }) + '\n');
  return file;
}
