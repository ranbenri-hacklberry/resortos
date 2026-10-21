import { config, type Lang, type RoomEntry } from '../config.js';
import { inboundSystemPrompt, outboundSystemPrompt } from './prompts.js';
import { parseTransfer, isInventoryQuestion } from '../manager/inventoryQuestion.js';

export const ACTIONS = ['ROOM_READY', 'CLEANING_STARTED', 'MAINTENANCE_ISSUE', 'SUPPLIES_NEEDED', 'QUERY_STATUS', 'UNKNOWN'] as const;
export type Action = (typeof ACTIONS)[number];

export interface InboundIntent {
  action: Action;
  room_raw: string;
  room_id: string | null;
  issue_description_hebrew: string | null;
  acknowledgement_reply_cleaner_language: string;
}

/** JSON Schema passed to Ollama's `format` field (structured outputs; stricter than format:"json"). */
export const INBOUND_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: [...ACTIONS] },
    room_raw: { type: 'string' },
    room_id: { type: ['string', 'null'] },
    issue_description_hebrew: { type: ['string', 'null'] },
    acknowledgement_reply_cleaner_language: { type: 'string' },
  },
  required: ['action', 'room_raw', 'room_id', 'issue_description_hebrew', 'acknowledgement_reply_cleaner_language'],
  additionalProperties: false,
} as const;

const OUTBOUND_SCHEMA = {
  type: 'object',
  properties: { translation: { type: 'string' } },
  required: ['translation'],
  additionalProperties: false,
} as const;

interface ChatOpts {
  system: string;
  user: string;
  schema: object | 'json';
}

export class OllamaClient {
  constructor(private fetchImpl: typeof fetch = fetch) {}

  private async chat({ system, user, schema }: ChatOpts): Promise<unknown> {
    const res = await this.fetchImpl(`${config.ollama.url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(config.ollama.timeoutMs),
      body: JSON.stringify({
        model: config.ollama.model,
        stream: false,
        format: schema,
        keep_alive: config.ollama.keepAlive,
        think: false,
        options: { temperature: 0.1, num_ctx: 4096, num_predict: 220 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (!content) throw new Error('Ollama returned empty content');
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(content);
  }

  /**
   * Deterministic fast intent extractor for staff messages.
   * Resolves common operational phrases in <0.1ms without calling Ollama.
   */
  fastIntent(text: string, workerLang: Lang, rooms: RoomEntry[]): InboundIntent | null {
    return extractIntentFast(text, workerLang, rooms);
  }

  /** Parse a worker message into a structured intent. Uses ultra-fast deterministic matching first, falling back to LLM. */
  async extractIntent(text: string, workerLang: Lang, rooms: RoomEntry[]): Promise<InboundIntent> {
    const fast = extractIntentFast(text, workerLang, rooms);
    if (fast) return fast;

    const raw = await this.chat({
      system: inboundSystemPrompt(workerLang, rooms),
      user: text,
      schema: INBOUND_SCHEMA,
    });
    const intent = normalizeIntent(raw, rooms);
    // If the room wasn't resolved by the LLM, attempt deterministic fallback on raw text
    if (!intent.room_id) {
      intent.room_id = resolveRoomByAlias(intent.room_raw || text, rooms);
    }
    return intent;
  }

  /** Hebrew manager instruction -> polite Thai / Levantine Arabic. Hebrew targets are returned as-is. */
  async translateTask(hebrewText: string, targetLang: Lang): Promise<string> {
    if (targetLang === 'he') return hebrewText;
    const raw = (await this.chat({
      system: outboundSystemPrompt(targetLang),
      user: hebrewText,
      schema: OUTBOUND_SCHEMA,
    })) as { translation?: unknown };
    if (typeof raw.translation !== 'string' || !raw.translation.trim()) throw new Error('Invalid translation payload');
    return raw.translation.trim();
  }

  /** Load the model into memory so the next staff message does not wait on a cold start. */
  async warmup(): Promise<void> {
    await this.fetchImpl(`${config.ollama.url}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(config.ollama.timeoutMs),
      body: JSON.stringify({
        model: config.ollama.model,
        prompt: 'ok',
        stream: false,
        keep_alive: config.ollama.keepAlive,
        options: { num_predict: 1, num_ctx: 4096, temperature: 0 },
      }),
    });
  }

  /** Round-trip latency to Ollama (lightweight /api/tags). */
  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const t0 = performance.now();
    try {
      const r = await this.fetchImpl(`${config.ollama.url}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return { ok: r.ok, latencyMs: Math.round(performance.now() - t0) };
    } catch {
      return { ok: false, latencyMs: Math.round(performance.now() - t0) };
    }
  }
}

/** Defensive validation: the model is never trusted, especially for room ids. */
export function normalizeIntent(raw: unknown, rooms: RoomEntry[]): InboundIntent {
  const o = (raw ?? {}) as Record<string, unknown>;
  const action = ACTIONS.includes(o.action as Action) ? (o.action as Action) : 'UNKNOWN';
  const room_raw = typeof o.room_raw === 'string' ? o.room_raw : '';
  let room_id = typeof o.room_id === 'string' && rooms.some((r) => r.id === o.room_id) ? (o.room_id as string) : null;
  if (!room_id && room_raw) room_id = resolveRoomByAlias(room_raw, rooms);
  const desc = typeof o.issue_description_hebrew === 'string' && o.issue_description_hebrew.trim() ? o.issue_description_hebrew : null;
  const ack = typeof o.acknowledgement_reply_cleaner_language === 'string' ? o.acknowledgement_reply_cleaner_language : '';
  return { action, room_raw, room_id, issue_description_hebrew: desc, acknowledgement_reply_cleaner_language: ack };
}

const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.,·]+/g, '');

const LETTER_COMPLEX_MAP: Record<string, string[]> = {
  a: ['k680', 'k681', 'k682', 'k683', 'k684'], // מול הנוף 1-5
  b: ['k685', 'k686'],                         // נופים בלבן 1-2
  c: ['k687', 'k688', 'k689'],                 // טוסקנה 1-3
  d: ['k690', 'k691', 'k692'],                 // חצר מוסיקלית 1-3
  e: ['k808', 'k809', 'k810', 'k811'],         // טאג' מאהל 1-4
  f: ['k693', 'k694', 'k695'],                 // בקתות מאיה 1-3
  g: ['k671', 'k673', 'k674', 'k675', 'k676', 'k677', 'k678', 'k679'], // בתי נורית 1-8
};

const THAI_LETTER_PHONETIC: Record<string, string> = {
  'เอ': 'a',
  'บี': 'b',
  'ซี': 'c',
  'ดี': 'd',
  'อี': 'e',
  'เอฟ': 'f',
  'จี': 'g',
};

/** Deterministic fallback: exact alias match or letter-code pattern (e.g. B1, บี1). */
export function resolveRoomByAlias(raw: string, rooms: RoomEntry[]): string | null {
  if (!raw) return null;
  const n = norm(raw);

  // 1. Direct match on alias catalog
  const exact = rooms.filter((r) => r.aliases.some((a) => norm(a) === n) || norm(r.id) === n);
  if (exact.length === 1) return exact[0].id;

  // 2. Direct English letter code match: A1-A5, B1-B2, etc.
  const letterMatch = n.match(/\b([a-g])\s*([1-8])\b/) || n.match(/([a-g])([1-8])/);
  if (letterMatch) {
    const letter = letterMatch[1];
    const num = parseInt(letterMatch[2], 10);
    const complexList = LETTER_COMPLEX_MAP[letter];
    if (complexList && num >= 1 && num <= complexList.length) {
      return complexList[num - 1];
    }
  }

  // 3. Thai phonetic letter match: บี1 -> b1, เอ2 -> a2, etc.
  for (const [th, eng] of Object.entries(THAI_LETTER_PHONETIC)) {
    if (raw.includes(th)) {
      const match = raw.match(new RegExp(`${th}\\s*([1-8])`));
      if (match) {
        const num = parseInt(match[1], 10);
        const complexList = LETTER_COMPLEX_MAP[eng];
        if (complexList && num >= 1 && num <= complexList.length) {
          return complexList[num - 1];
        }
      }
    }
  }

  return null;
}

/**
 * Fast deterministic intent extractor.
 * Resolves standard worker reports without hitting Ollama (<0.1ms).
 */
export function extractIntentFast(text: string, workerLang: Lang, rooms: RoomEntry[]): InboundIntent | null {
  const t = text.trim();
  if (!t) return null;

  // Attempt to resolve room alias directly from text
  const roomId = resolveRoomByAlias(t, rooms);
  if (!roomId) return null;

  const room = rooms.find((r) => r.id === roomId);
  const roomName = workerLang === 'th' ? (room?.letterCode || room?.name || '') : (room?.name || room?.letterCode || '');

  // 1. Room ready patterns (Hebrew, Thai, Arabic, English)
  if (/מוכן|מוכנה|סיימתי|גמור|נקי|סיום|ready|finish|done|เสร็จ|เรียบร้อย|جاهز|نظيف/i.test(t)) {
    let reply = '';
    if (workerLang === 'th') reply = `บันทึกเรียบร้อยค่ะ: ห้อง ${roomName} พร้อมใช้งาน (READY) แล้วค่ะ ✅`;
    else if (workerLang === 'ar') reply = `أهلاً، تم تسجيل غرفة ${roomName} كجاهزة للاستلام بنجاح! ✅`;
    else reply = `היי, חדר ${roomName} עודכן בהצלחה כמוכן לאורח (READY)! ✅`;
    return {
      action: 'ROOM_READY',
      room_raw: roomName,
      room_id: roomId,
      issue_description_hebrew: null,
      acknowledgement_reply_cleaner_language: reply,
    };
  }

  // 2. Cleaning started patterns
  if (/מתחיל|מתחילה|התחלתי|נכנסתי|start|clean|เริ่ม|กำลังทำ|بدأت|تنظيف/i.test(t)) {
    let reply = '';
    if (workerLang === 'th') reply = `บันทึกเรียบร้อยค่ะ: เริ่มทำความสะอาดห้อง ${roomName} แล้วค่ะ 🧹`;
    else if (workerLang === 'ar') reply = `تم تسجيل بدء تنظيف غرفة ${roomName}! 🧹`;
    else reply = `נרשם בהצלחה שהתחלת לנקות את חדר ${roomName}! 🧹`;
    return {
      action: 'CLEANING_STARTED',
      room_raw: roomName,
      room_id: roomId,
      issue_description_hebrew: null,
      acknowledgement_reply_cleaner_language: reply,
    };
  }

  // 3. Maintenance issue patterns
  if (/תקלה|שבור|מקולקל|נוזל|נזילה|מזגן|מים|בעיה|problem|broken|leak|issue|เสีย|พัง|ชำรุด|עטל|خربان|تسريب/i.test(t)) {
    let reply = '';
    if (workerLang === 'th') reply = `รับแจ้งปัญหาห้อง ${roomName} เรียบร้อยแล้วค่ะ แจ้งช่างให้ทันทีค่ะ 🛠️`;
    else if (workerLang === 'ar') reply = `تم استلام بلاغ الصيانة لغرفة ${roomName} وسيتم معالجته فوراً 🛠️`;
    else reply = `דיווח התקלה לחדר ${roomName} נרשם ומועבר לטיפול צוות האחזקה 🛠️`;
    return {
      action: 'MAINTENANCE_ISSUE',
      room_raw: roomName,
      room_id: roomId,
      issue_description_hebrew: t,
      acknowledgement_reply_cleaner_language: reply,
    };
  }

  // 4. Supplies needed patterns
  if (/חסר|שמפו|סבון|מגבות|סדינים|מצעים|נייר|ציוד|missing|supplies|need|ขาด|หมด|ناقص|مستلزمات/i.test(t)) {
    let reply = '';
    if (workerLang === 'th') reply = `รับแจ้งรายการของที่ขาดสำหรับห้อง ${roomName} เรียบร้อยค่ะ 🧺`;
    else if (workerLang === 'ar') reply = `تم تسجيل النواقص لغرفة ${roomName} وسيتم تزويدها 🧺`;
    else reply = `דיווח הציוד החסר עבור חדר ${roomName} נרשם בהצלחה 🧺`;
    return {
      action: 'SUPPLIES_NEEDED',
      room_raw: roomName,
      room_id: roomId,
      issue_description_hebrew: t,
      acknowledgement_reply_cleaner_language: reply,
    };
  }

  return null;
}


/** Manager inventory intents (Ran 2026-10-20). Kept outside ACTIONS so the LLM room-action contract is unchanged. */
export type InventoryIntent = 'INVENTORY_TRANSFER' | 'INVENTORY_QUERY';
export function detectInventoryIntent(text: string): InventoryIntent | null {
  if (parseTransfer(text)) return 'INVENTORY_TRANSFER';
  if (isInventoryQuestion(text)) return 'INVENTORY_QUERY';
  return null;
}
