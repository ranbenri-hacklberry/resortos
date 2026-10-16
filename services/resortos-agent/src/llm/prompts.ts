import type { Lang, RoomEntry } from '../config.js';

export const LANG_NAME: Record<Lang, string> = {
  th: 'Thai',
  ar: 'Levantine Arabic (Jordanian / Palestinian / Syrian colloquial)',
  he: 'Hebrew',
};

const REPLY_STYLE: Record<Lang, string> = {
  th: 'Polite, natural Thai spoken by hotel management to cleaning staff. Always use polite particles (ค่ะ for female/default, or ครับ). Warm and supportive tone (e.g. "รับทราบค่ะ บันทึกเรียบร้อยแล้วค่ะ").',
  ar: 'Natural, warm Levantine colloquial Arabic (الله يعطيك العافية، تمام سجلت...). Do not use stiff Modern Standard / MSA words.',
  he: 'Short, friendly, professional Israeli hospitality tone (מעולה, עודכן במערכת / רשמתי ושלחנו איש אחזקה).',
};

export function inboundSystemPrompt(workerLang: Lang, rooms: RoomEntry[]): string {
  let roomGuide = '';
  if (workerLang === 'th') {
    roomGuide = `### CABIN CODES USED BY THAI STAFF (CRITICAL):
Thai housekeeping staff ONLY know and use English letter codes (A, B, C, D, E, F, G) + cabin number:
- Complex A (מול הנוף): A1, A2, A3, A4, A5 -> IDs: k680, k681, k682, k683, k684
- Complex B (נופים בלבן): B1, B2 -> IDs: k685, k686
- Complex C (טוסקנה): C1, C2, C3 -> IDs: k687, k688, k689
- Complex D (חצר מוסיקלית): D1, D2, D3 -> IDs: k690 (חליל), k691 (מיתר), k692 (פעמון)
- Complex E (טאג' מאהל): E1, E2, E3, E4 -> IDs: k808, k809, k810, k811
- Complex F (בקתות מאיה): F1, F2, F3 -> IDs: k693, k694, k695
- Complex G (בתי נורית): G1, G2, G3, G4, G5, G6, G7, G8 -> IDs: k671, k673, k674, k675, k676, k677, k678, k679
- Hill (צימר בגבעה): Hill 1..4 -> IDs: hill-1, hill-2, hill-3, hill-4
- Domes (כיפת שמיים): Blue (dome-blue), Red (dome-red), Green (dome-green)
- Mialees: Villa (mialis-villa), Green Suite 1 (suite-1), Pink Suite 2 (suite-2)
- Casa Nova: Aura (k826), Bloom (k827)

* Thai Phonetic Pronunciation for English Letters:
  เอ = A, บี = B, ซี = C, ดี = D, อี = E, เอฟ = F, จี = G
  "ห้อง" = room/cabin (e.g., "ห้อง บี 1" or "บี1" means B1 -> k685; "เอ 2" means A2 -> k681).
* Note: Letter codes A1-G8 are 100% UNIQUE and unambiguous. When mentioned, always resolve room_id directly!`;
  } else {
    const list = rooms
      .map((r) => `- ${r.id}: ${r.name ?? ''} (${r.aliases.slice(0, 3).join(', ')})`)
      .join('\n');
    roomGuide = `### RESORT CABIN CATALOG:
${list}`;
  }

  return `You are the Autonomous Operations Dispatcher for "ResortOS", a luxury boutique resort in Ramot, Sea of Galilee (רמות, רמת הגולן).
You receive inbound WhatsApp messages (voice transcripts or text) from on-site staff speaking ${LANG_NAME[workerLang]}.

### OPERATIONAL OBJECTIVE:
Parse the message into strict JSON with fields: action, room_raw, room_id, issue_description_hebrew, acknowledgement_reply_cleaner_language.

${roomGuide}

### STRICT ROOM AMBIGUITY RULE:
- If a worker mentions ONLY a bare number without any letter or complex name (e.g. "בקתה 1", "חדר 2", "room 1", "เสร็จ 1 แล้ว"), it is AMBIGUOUS because there are 7 different "Cabin 1"s! Set room_id: null and politely ask in acknowledgement_reply_cleaner_language which complex (A, B, C, D, E, F, G) they mean.

### ACTIONS:
- "ROOM_READY": Room is finished cleaning, beds made, ready for guests.
- "CLEANING_STARTED": Worker started cleaning or is currently cleaning (e.g. "מתחיל ב-B1", "กำลังทำความสะอาด B1").
- "MAINTENANCE_ISSUE": Malfunction, leak, AC broken, no hot water, jacuzzi broken, electric fault.
- "SUPPLIES_NEEDED": Missing sheets, towels, toilet paper, coffee pods, cleaning supplies.
- "QUERY_STATUS": Inquiring about which rooms to clean or resort status.
- "UNKNOWN": General greetings, chatter, or unclear audio.

Return ONLY valid JSON.`;
}

export function outboundSystemPrompt(targetLang: Lang): string {
  return `You are the operations dispatcher translating task instructions from an Israeli resort manager (Hebrew) into natural ${LANG_NAME[targetLang]} for on-site staff via WhatsApp.

GUIDELINES:
- ${REPLY_STYLE[targetLang]}
- Keep cabin numbers, names, times (e.g. 15:00) and specific instructions precise.
- For Thai workers: Use natural Thai phrasing (e.g. "เปลี่ยนผ้าปูที่นอนและผ้าเช็ดตัวที่...", "แขกจะเช็คอินเวลา 15:00 น. ค่ะ").
- For Arabic workers: Use natural Levantine Arabic spoken phrasing.
- Return JSON only: {"translation": "<text>"}.`;
}

// ========================
// CLEANER EXIT STATE MACHINE TEMPLATES
// ========================

export const CLEANER_EXIT_MENU: Record<Lang, (room: string) => string> = {
  he: (room) =>
    `סיום ניקיון ${room}:\n` +
    `1 - הכל מוכן ותקין 🟢\n` +
    `2 - חסר ציוד / מצעים / מגבות 🟡\n` +
    `3 - יש תקלה שדורשת תיקון 🔴\n` +
    `(ניתן להשיב 1, 2, 3 או לשלוח הקלטה קולית)`,
  th: (room) =>
    `ทำความสะอาด ${room} เสร็จแล้ว:\n` +
    `1 - เรียบร้อยสมบูรณ์ทุกอย่าง 🟢\n` +
    `2 - ขาดของ / ผ้าปู / ผ้าเช็ดตัว 🟡\n` +
    `3 - มีจุดชำรุดเสียหายต้องซ่อม 🔴\n` +
    `(ตอบ 1, 2, 3 หรือส่งข้อความเสียงได้ค่ะ)`,
  ar: (room) =>
    `إنهاء تنظيف ${room}:\n` +
    `1 - كل شيء جاهز וتمام 🟢\n` +
    `2 - ناقص أغراض / شراشف / مناشف 🟡\n` +
    `3 - في عطل بحاجة لتصليح 🔴\n` +
    `(تقدر تجاوب 1، 2، 3 أو تبعت رسالة صوتية)`,
};

export const CLEANER_READY_THANKS: Record<Lang, string> = {
  he: 'תודה רבה! החדר עודכן כמוכן (READY) במערכת ✅ תודה על העבודה המעולה!',
  th: 'ขอบคุณมากค่ะ! อัปเดตห้องเป็นพร้อมใช้งาน (READY) ในระบบเรียบร้อยค่ะ ✅ ขอบคุณที่ตั้งใจทำงานนะคะ!',
  ar: 'شكراً كتير! تم تحديث الغرفة كجاهزة (READY) في النظام بنجاح ✅ يعطيك ألف عافية!',
};

export const CLEANER_ASK_SUPPLIES: Record<Lang, string> = {
  he: 'מה בדיוק חסר? (אפשר להקליט או לכתוב)',
  th: 'ขาดอะไรบ้างคะ? (สามารถพิมพ์หรือส่งข้อความเสียงบอกได้เลยค่ะ)',
  ar: 'شو ناقص بالضبط؟ (تقدر تكتب أو تبعت تسجيل صوتي)',
};

export const CLEANER_ASK_MAINTENANCE: Record<Lang, string> = {
  he: 'מה התקלה? (שלח הקלטה קולית או תמונה)',
  th: 'จุดชำรุดคืออะไรคะ? (รบกวนส่งข้อความเสียงหรือรูปถ่ายได้เลยค่ะ)',
  ar: 'شو العطل؟ (ابعت تسجيل صوتي أو صورة)',
};

export const CLEANER_CONFIRM_SUPPLIES: Record<Lang, string> = {
  he: 'קיבלתי! הדיווח על הציוד החסר נרשם במערכת ויועבר לצוות בהקדם ✅',
  th: 'รับทราบค่ะ! บันทึกรายการของที่ขาดเรียบร้อยแล้ว จะประสานงานให้ทันทีค่ะ ✅',
  ar: 'تمام! تم تسجيل النواقص في النظام ورح نتابعها فوراً ✅',
};

export const CLEANER_CONFIRM_MAINTENANCE: Record<Lang, string> = {
  he: 'קיבלתי! נפתחה קריאת תחזוקה במערכת ואיש אחזקה יעודכן בהקדם 🛠️',
  th: 'รับทราบค่ะ! แจ้งฝ่ายช่างซ่อมบำรุงเรียบร้อยแล้ว ช่างจะเข้าดำเนินการโดยเร็วค่ะ 🛠️',
  ar: 'تمام! تم فتح بلاغ صيانة ورح يتم التنسيق مع فني الصيانة بأسرع وقت 🛠️',
};

// ========================
// MANAGER MENU TEMPLATES
// ========================

export function managerActionMenu(roomLabel: string): string {
  return `⚡ אפשרויות לחדר ${roomLabel} (השב מספר):\n` +
    `1 - עדכון סטטוס חדר ⚙️\n` +
    `2 - ביקורת ניקיון (אישור חדר) 🟢\n` +
    `3 - דיווח על תקלה 🔴\n` +
    `4 - הוספת הערה לחדר 📝\n` +
    `5 - הוספת הערה לאורח 👤`;
}

export function managerStatusMenu(roomLabel: string): string {
  return `בחר סטטוס חדש לחדר ${roomLabel} (השב מספר):\n` +
    `1 - מוכן לאורח (READY) 🟢\n` +
    `2 - בניקיון (IN_PROGRESS) 🟡\n` +
    `3 - ממתין לניקיון (DIRTY) 🔴\n` +
    `4 - תקלת תחזוקה (MAINTENANCE) ⚠️`;
}

