import { AsyncLocalStorage } from 'node:async_hooks';
import type { WAMessage } from '@whiskeysockets/baileys';
import type { ChannelId, InboundEnvelope } from './whatsapp/types.js';
import { cleaningCredit, config, isBookableRoom, isStaffRoom, isOfficeRoom, type CleanerProfile, type Lang, type RoomEntry } from './config.js';
import type { InboundIntent } from './llm/client.js';
import { detectGuestLang, type GuestLang } from './guest/i18n.js';
import { V, newOtp, isYes, isNo, extractOtp, OTP_TTL_MS, OTP_MAX_ATTEMPTS, HANDOFF_GAP_MS } from './guest/verify.js';
import { resolveRoomByAlias } from './llm/client.js';
import { alertRecipients, alertRoomLabel, buildUnknownScanAlert, createAlertMemory, displaySender, explainAlert, isWhatIsThis } from './manager/scanAlert.js';
import { handleManagerInventory, type InventoryClient } from './manager/inventoryQuestion.js';
import type { InvoiceIntake, InvoiceMedia } from './invoice/intake.js';
import { detectInventoryIntent } from './llm/client.js';
import { AWAITING_INSPECTION_REASON, ResortOSError, type ReadyResult, type BookingRow, type UnitRow } from './integration/resortos.js';
import type { Transcript } from './whatsapp/media.js';
import { resolveStaffPhone } from './whatsapp/client.js';
import { generateRoomQrPng } from './whatsapp/qrGenerator.js';
import { consultCallDesk } from './calls/deskReply.js';
import {
  getPendingCheck,
  setPendingCheck,
  clearPendingCheck,
  parseConversationalForecastEntry,
  formatCheckConfirmationPrompt,
} from './manager/managerFinance.js';
import {
  CLEANER_EXIT_MENU,
  CLEANER_READY_THANKS,
  CLEANER_ASK_SUPPLIES,
  CLEANER_ASK_MAINTENANCE,
  CLEANER_CONFIRM_SUPPLIES,
  CLEANER_CONFIRM_MAINTENANCE,
  managerIssueMenu,
  managerStatusMenu,
  withManagerActions,
} from './llm/prompts.js';
import { whatsappCallbackReply, isLateCheckoutQuestion, isLateCheckoutFollowUp, lateCheckoutManagerSms, answerLateCheckout, israelClock, answerGuestQuestion, answerStaffPlaceQuestion, staffPlaceNeedsRoom, type GuestContext } from './guest/guestKnowledge.js';
import { answerRackRate } from './pricing/priceList.js';
import { exactStaticReply, lookupExact } from './pricing/exactLookup.js';
import {
  confirmAnswer,
  proposeStatusChange,
  statusConfirmText,
  statusLabel,
  textHasStatusWord,
  type StatusChange,
} from './manager/statusConfirm.js';
import { cashConfirmText, cashShekelLabel, paymentStatusChoice, paymentStatusLabel, paymentStatusQuestion, proposeCashCollection } from './manager/cashCollection.js';
import { holdConfirmText, holdDoneText, holdProgressText, proposesNightHold } from './manager/nightHold.js';
import { fileAudit, handleManagerRoomHold } from './manager/roomHold.js';
import { join as joinPath } from 'node:path';
import { placeDetail, placeMenuFor } from './guest/placeMenu.js';
import { handleManagerWifi } from './manager/managerWifi.js';
import {
  formatManagerInitialCard,
  formatRoomWifi,
  roomMenuPick,
  formatGuestDetails,
  answerManagerRoomQuestion,
  answerComplexCheckinsQuestion,
  unitShortStatus,
  isComplexCheckinsQuestion,
  matchComplex,
  getCleaningStatusLabel,
  getRoomOccupancy,
} from './manager/managerQuestions.js';
import {
  displayPhone,
  guestLinkConfirm,
  guestLinkPickText,
  guestLinkSms,
  linkChoice,
  phoneFromReply,
  stayUrlOf,
  type GuestLinkChoice,
} from './manager/guestLink.js';
import { normalizeOutgoingText } from './whatsapp/textSpacing.js';
import { logConversation } from './conversationLog.js';
import { isStaffOpsQuestion, STAFF_OPS_ONLY_REPLY } from './manager/opsQuestion.js';
import { scanIdWithGrok } from './idValidation/grokIdScan.js';
import { guestIdEnabled, hasGuestId, saveGuestIdScan, shouldAskForId, ID_REQUEST_TEXT, idReplyFor } from './idValidation/guestIdStore.js';
import {
  groundById,
  groundByScan,
  groundOptionLabel,
  groundStatusLabel,
  groundsForComplex,
  housekeepingMenu,
  poolGuestReply,
  roomsForFamily,
  workerGroundChoice,
  type GroundKind,
} from './grounds/groundScan.js';
import {
  matchManagerRoomIntent,
  normalizeSpokenHebrewNumbers,
  formatComplexClarificationPrompt,
  formatNumberClarificationPrompt,
  bareUnitNumber,
  complexOfRoom,
  resolveRoomWithContext,
  type RoomDialogContext,
} from './manager/managerFuzzyMatcher.js';

export type CleanerSessionState =
  | { role: 'CLEANER'; state: 'AWAITING_STATUS'; roomId: string }
  | { role: 'CLEANER'; state: 'AWAITING_SUPPLIES'; roomId: string }
  | { role: 'CLEANER'; state: 'AWAITING_MAINTENANCE'; roomId: string }
  | { role: 'CLEANER'; state: 'AWAITING_STATUS_CONFIRM'; roomId: string; change: StatusChange; sourceText?: string }
  | { role: 'CLEANER'; state: 'AWAITING_PLACE'; placeIds: string[]; roomId?: string }
  | { role: 'CLEANER'; state: 'AWAITING_GROUND'; assetId: string; kind: GroundKind; label: string }
  | { role: 'CLEANER'; state: 'AWAITING_GROUND_FAULT'; assetId: string; kind: GroundKind; label: string };

export type ManagerSessionState =
  | { role: 'MANAGER'; state: 'AWAITING_ACTION'; roomId: string; bookingId?: string }
  | { role: 'MANAGER'; state: 'SELECT_STATUS'; roomId: string }
  | { role: 'MANAGER'; state: 'AWAITING_MAINTENANCE'; roomId: string }
  | { role: 'MANAGER'; state: 'AWAITING_ROOM_NOTE'; roomId: string }
  | { role: 'MANAGER'; state: 'AWAITING_GUEST_NOTE'; roomId: string; bookingId?: string }
  | { role: 'MANAGER'; state: 'AWAITING_CLARIFICATION'; candidateRoomIds: string[]; pendingQuestion?: string }
  | { role: 'MANAGER'; state: 'AWAITING_STATUS_CONFIRM'; roomId: string; change: StatusChange; sourceText?: string }
  | { role: 'MANAGER'; state: 'AWAITING_CASH_CONFIRM'; roomId: string; shekels: number; sourceText?: string }
  | { role: 'MANAGER'; state: 'AWAITING_PAYMENT_STATUS'; roomId: string }
  | { role: 'MANAGER'; state: 'AWAITING_HOLD_CONFIRM'; roomId: string }
  | { role: 'MANAGER'; state: 'AWAITING_PLACE'; placeIds: string[]; roomId?: string }
  | { role: 'MANAGER'; state: 'AWAITING_ISSUE_KIND'; roomId: string }
  | { role: 'MANAGER'; state: 'AWAITING_SUPPLIES'; roomId: string }
  | { role: 'MANAGER'; state: 'AWAITING_GUEST_PICK'; roomId: string; choices: GuestLinkChoice[] }
  | { role: 'MANAGER'; state: 'AWAITING_GUEST_PHONE'; roomId: string; bookingId: string; stayUrl: string; guestName: string }
  | { role: 'MANAGER'; state: 'AWAITING_GUEST_LINK'; roomId: string; bookingId: string; phone: string; stayUrl: string; guestName: string };

export type GuestSessionState =
  | { role: 'GUEST'; state: 'AWAITING_PLACE'; placeIds: string[]; bookingId?: string }
  | { role: 'GUEST'; state: 'AWAITING_CALL_CONFIRM'; bookingId: string; unitId: string; roomName: string; guestName?: string | null; guestPhone?: string | null }
  | { role: 'GUEST'; state: 'AWAITING_BOOKING_PHONE'; pendingText: string; askedAt: number }
  | { role: 'GUEST'; state: 'VERIFY_HAS_BOOKING'; roomId?: string; pendingText: string; askedAt: number }
  | { role: 'GUEST'; state: 'VERIFY_PHONE'; roomId?: string; pendingText: string; askedAt: number; tries: number }
  | { role: 'GUEST'; state: 'VERIFY_OTP'; roomId?: string; pendingText: string; bookingId: string; bookingPhone: string; code: string; expiresAt: number; attempts: number };

export type SessionState = CleanerSessionState | ManagerSessionState | GuestSessionState;

/** Narrow interfaces so everything is mockable in tests. */
export interface PipelineDeps {
  /** Manager inventory (stock questions + confirmed transfers) via the ResortOS bridge. Optional. */
  inventory?: InventoryClient;
  /** Supplier-invoice intake (manager photos → draft → "אשר חשבונית"). Optional. */
  invoiceIntake?: InvoiceIntake;
  downloadMedia?: (m: WAMessage) => Promise<InvoiceMedia | null>;
  send: (jid: string, text: string, channelId?: ChannelId) => Promise<unknown>;
  notifyManagerSms?: (message: string) => Promise<unknown> | void;
  sendImage?: (jid: string, buffer: Buffer, caption?: string, channelId?: ChannelId) => Promise<unknown>;
  isAudio: (m: WAMessage) => boolean;
  extractText: (m: WAMessage) => string | null;
  transcribe: (m: WAMessage, hint?: Lang) => Promise<Transcript>;
  llm: {
    extractIntent(text: string, lang: Lang, rooms: RoomEntry[]): Promise<InboundIntent>;
    translateTask(hebrew: string, lang: Lang): Promise<string>;
  };
  resortos: {
    listUnits?(): Promise<UnitRow[]>;
    listBookings?(p?: { from?: string; to?: string }): Promise<BookingRow[]>;
    publishBookingStay?(booking: BookingRow): Promise<boolean>;
    markRoomReady(p: { unitId: string; reportedBy: string; note?: string }): Promise<ReadyResult>;
    approveRoomByManager?(p: { unitId: string; reportedBy: string; note?: string }): Promise<ReadyResult>;
    startCleaning?(p: { unitId: string; reportedBy: string; note?: string }): Promise<ReadyResult>;
    updateUnitStatus?(p: { unitId: string; status: string; reason?: string; reportedBy: string; note?: string }): Promise<unknown>;
    setStaffOccupancy?(p: { unitId: string; occupancy: 'OCCUPIED' | 'VACANT'; reportedBy: string; note?: string }): Promise<ReadyResult>;
    updateUnitNote?(p: { unitId: string; note: string; reportedBy: string }): Promise<unknown>;
    updateBookingNote?(p: { bookingId: string; note: string; reportedBy: string }): Promise<unknown>;
    collectCash?(p: { unitId: string; amountAgorot: number; reportedBy: string; note?: string }): Promise<{ ok: true; guest_name?: string; amount_agorot?: number } | { ok: false; skipped: string }>;
    setPaymentStatus?(p: { unitId: string; status: 'PARTIAL' | 'PAID'; reportedBy: string }): Promise<{ ok: true; guest_name?: string; payment_status?: string } | { ok: false; skipped: string }>;
    holdNight?(p: { unitId: string; reportedBy: string }): Promise<{ ok: true; verified: boolean; resId?: string } | { ok: false; skipped: string }>;
    reportMaintenance(p: { unitId: string; description: string; reportedBy: string }): Promise<unknown>;
    reportSupplies(p: { unitId: string; description: string; reportedBy: string }): Promise<unknown>;
    sendGuestLinkSms?(p: { bookingId: string; phone: string; message: string; reportedBy?: string }): Promise<{ ok: true }>;
    getGroundStatus?(id: string): Promise<{ status?: string; updatedBy?: string } | null>;
    setGroundStatus?(p: { id: string; status: string; reportedBy: string; note?: string }): Promise<unknown>;
    logGuestComm?(p: {
      bookingId: string;
      tenantId?: string | null;
      channel?: string;
      direction: 'inbound' | 'outbound';
      phone?: string | null;
      content: string;
      status?: string;
      metadata?: Record<string, unknown>;
    }): Promise<void>;
    requestGuestCall?(p: {
      bookingId: string;
      unitId: string;
      guestName?: string | null;
      guestPhone?: string | null;
      cabin?: string | null;
    }): Promise<void>;
  };
  cleaners: () => CleanerProfile[];
  rooms: () => RoomEntry[];
  log: { info: (...a: any[]) => void; warn: (...a: any[]) => void; error: (...a: any[]) => void };
}

export const phoneOf = (jid: string) => resolveStaffPhone(jid);

export function normalizePhoneTail(raw?: string | null): string {
  if (!raw) return '';
  const resolved = resolveStaffPhone(raw);
  const digits = resolved.replace(/\D/g, '');
  if (digits.startsWith('972')) return digits.slice(3).slice(-9);
  if (digits.startsWith('0')) return digits.slice(1).slice(-9);
  return digits.slice(-9);
}

/** A phone number typed by a guest (052-606-5443, +972 52 606 5443, 0526065443) as digits, or ''. */
export function extractTypedPhone(text?: string | null): string {
  const m = String(text || '').match(/(?:\+?972|0)[\s\-.]*\d(?:[\s\-.]*\d){7,8}/);
  if (!m) return '';
  const digits = m[0].replace(/\D/g, '');
  return digits.length >= 9 ? digits : '';
}

export function askBookingPhone(lang: GuestLang): string {
  const t: Record<GuestLang, string> = {
    he: 'רגע, אני בודקת את ההזמנה שלך 🙂 לא מצאתי אותה לפי המספר הזה. מה מספר הטלפון שאיתו בוצעה ההזמנה? אפשר גם שם מלא ותאריכי הגעה. אני מעדכנת את המנהל.',
    en: "One moment, I'm checking your booking 🙂 I couldn't find it by this number. What phone number was the booking made with? Your full name and arrival dates also work. I'm updating the manager.",
    ru: 'Минутку, проверяю ваше бронирование 🙂 Не нашла его по этому номеру. На какой номер телефона было сделано бронирование? Можно также полное имя и даты заезда. Я сообщаю менеджеру.',
    ar: 'لحظة، أتحقق من حجزك 🙂 لم أجده بهذا الرقم. ما رقم الهاتف الذي تم الحجز به؟ يمكن أيضاً الاسم الكامل وتواريخ الوصول. أنا أبلّغ المدير.',
    th: 'สักครู่ กำลังตรวจสอบการจองของคุณ 🙂 ไม่พบการจองจากหมายเลขนี้ การจองทำด้วยหมายเลขโทรศัพท์ใด? หรือแจ้งชื่อเต็มและวันที่เข้าพักก็ได้ กำลังแจ้งผู้จัดการ',
  };
  return t[lang] ?? t.he;
}

export function bookingPhoneNotFound(lang: GuestLang): string {
  const t: Record<GuestLang, string> = {
    he: 'לא מצאתי הזמנה גם לפי המספר הזה 🙏 אפשר שם מלא ותאריכי הגעה? המנהל מעודכן ויחזור אליך.',
    en: "I couldn't find a booking with that number either 🙏 Could you send your full name and arrival dates? The manager has been updated and will get back to you.",
    ru: 'По этому номеру бронирование тоже не найдено 🙏 Пришлите, пожалуйста, полное имя и даты заезда. Менеджер в курсе и свяжется с вами.',
    ar: 'لم أجد حجزاً بهذا الرقم أيضاً 🙏 هل يمكنك إرسال الاسم الكامل وتواريخ الوصول؟ المدير على علم وسيتواصل معك.',
    th: 'ไม่พบการจองจากหมายเลขนี้เช่นกัน 🙏 กรุณาส่งชื่อเต็มและวันที่เข้าพัก ผู้จัดการได้รับแจ้งแล้วและจะติดต่อกลับ',
  };
  return t[lang] ?? t.he;
}

export function phonesMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const tailA = normalizePhoneTail(a);
  const tailB = normalizePhoneTail(b);
  return Boolean(tailA && tailB && tailA.length >= 7 && tailA === tailB);
}

export function matchesCleaner(c: CleanerProfile, rawTarget?: string | null): boolean {
  if (!rawTarget) return false;
  const rawUser = String(rawTarget).split('@')[0].split(':')[0].replace(/\D/g, '');
  if (c.lid && rawUser && c.lid === rawUser) return true;
  return phonesMatch(c.phone, rawTarget);
}

export function isManagerRole(role?: string | null): boolean {
  return role === 'MANAGER' || role === 'OPS_MANAGER' || role === 'PRIORITY';
}

/** A non-canceled booking on this phone means Chloe should answer as the guest, even when the same phone is a manager. */
export function hasGuestBooking(bookings: Array<{ guest_phone?: string | null; deleted_at?: string | null; booking_status?: string | null }>, phone: string): boolean {
  return bookings.some((booking) => phonesMatch(booking.guest_phone, phone) && !booking.deleted_at && booking.booking_status !== 'CANCELED');
}

/** Phone that WhatsApp attaches to an @lid sender (key.senderPn / remoteJidAlt / participantPn), digits only, or ''. */
export function lidSenderPn(msg: any): string {
  const k: any = msg?.key || {};
  const jid = String(k.remoteJid || '');
  if (!jid.endsWith('@lid')) return '';
  const alt = [k.senderPn, k.remoteJidAlt, k.participantPn, k.participantAlt].find((v) => typeof v === 'string' && /@s\.whatsapp\.net$/.test(v));
  return alt ? String(alt).split('@')[0].split(':')[0].replace(/\D/g, '') : '';
}

export function getIsraelToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

const CLARIFY: Record<Lang, string> = {
  th: 'ขออภัยค่ะ ไม่เข้าใจ รบกวนส่งอีกครั้งนะคะ',
  ar: 'عذراً، ما فهمت عليك. ممكن تعيد الرسالة؟',
  he: 'לא הבנתי. אפשר לשלוח שוב?',
};

export function firstName(full?: string | null): string {
  return String(full || '').trim().split(/\s+/)[0]?.replace(/[,.!:]+$/g, '') || '';
}

const GREETING_PHRASE: Record<string, string> = {
  'בוקר טוב': 'בוקר טוב',
  'צהריים טובים': 'צהריים טובים',
  'צהרים טובים': 'צהריים טובים',
  'ערב טוב': 'ערב טוב',
  'לילה טוב': 'לילה טוב',
  'היי': 'היי',
  'הי': 'היי',
  'שלום': 'שלום',
  'אהלן': 'אהלן',
  'מה נשמע': 'מה נשמע',
  'מה קורה': 'מה קורה',
  'hi': 'היי',
  'hello': 'היי',
  'hey': 'היי',
  'good morning': 'בוקר טוב',
};

/** A greeting by itself is answered in the same words, then an offer to help. */
export function greetingReply(text: string, fullName?: string | null): string | null {
  const who = firstName(fullName);
  let cleaned = String(text || '').trim().replace(/[!?.,…]+$/g, '').replace(/\s+/g, ' ').trim();
  if (who) cleaned = cleaned.replace(new RegExp(`\\s+${who}$`, 'i'), '').trim();
  const phrase = GREETING_PHRASE[cleaned] || GREETING_PHRASE[cleaned.toLowerCase()];
  if (!phrase) return null;
  return who
    ? `${phrase} ${who}, במה אוכל לעזור לך היום?`
    : `${phrase}, במה אוכל לעזור היום?`;
}

/** A question with no facts opens with the person's name. */
export function askByName(fullName: string | null | undefined, text: string): string {
  const who = firstName(fullName);
  // Keep trailing newlines: callers append more text after the question (Ran 2026-10-20, "📞)בינתיים").
  const body = String(text || '').replace(/^(?:שלום|היי|הי|hello|hi|أهلاً|أهلا)\b[!,.،\s]*/i, '').replace(/^\s+/, '').replace(/[ \t]+$/, '');
  if (!who) return body;
  if (body.startsWith(`${who},`) || body.startsWith(`${who} `)) return body;
  return `${who}, ${body}`;
}

const ASK_ROOM: Record<Lang, string> = {
  th: 'ขออภัยค่ะ ช่วยบอกชื่อกลุ่มบ้านและหมายเลขด้วยนะคะ เช่น "มูล 3" หรือ "ทัช 2"',
  ar: 'عذراً، ممكن تحكي لي اسم المجمع ورقم الكابينة؟ مثلاً "מול הנוף 3" أو "טאג 2"',
  he: 'באיזה מתחם ואיזו בקתה? למשל "מול הנוף 3" או "טאג׳ 2"',
};

export interface InboundResult {
  handled: boolean;
  intent?: InboundIntent;
  transcript?: Transcript;
  reason?: string;
}

/** Ran 2026-10-22: Barak gets every guest message Sun–Thu 19:00–21:00 (max 1 per guest per 15 min). */
export const BARAK_FORWARD_PHONE = '972503934696';
const BARAK_FORWARD_GAP_MS = 15 * 60 * 1000;
export function inBarakForwardWindow(now: Date = new Date()): boolean {
  const { hour, dow } = israelClock(now);
  return dow >= 0 && dow <= 4 && hour >= 19 && hour < 21;
}
export function barakForwardText(p: { name?: string | null; unit?: string | null; hhmm: string; summary: string; phone: string }): string {
  return `🌙 פנייה מאורח אחרי 19:00\n👤 ${p.name || 'לא זוהה'} · ${p.unit || 'לא זוהה'}\n🕐 ${p.hhmm}\n💬 ${p.summary}\n📲 לענות לאורח: https://wa.me/${p.phone}`;
}
function intlPhone(raw?: string | null): string {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('972')) return d;
  if (d.startsWith('0')) return `972${d.slice(1)}`;
  return d;
}
/** Guest asked not to be called / WhatsApp only (Ran 2026-10-22). */
const NO_CALL_RE = /לא\s*(?:ל|ת)?התקשר|בלי\s*(?:שיחה|טלפון)|אל\s*תתקשר|בוו?א?טס?א?פ|no\s*calls?|don'?t\s*call|whatsapp\s*only|by\s*whatsapp|не\s*звоните|только\s*(?:в\s*)?whatsapp|لا\s*تتصل|بدون\s*اتصال|عبر\s*واتساب/i;

const LOCKBOX_QUERY_REGEX = /קוד|כספת|מפתח|רหัส|เซฟ|كود|خزنة|مفتاح/i;

export function formatRoomDisplay(roomId: string, rooms: RoomEntry[]): string {
  const r = rooms.find((x) => x.id === roomId);
  if (!r) {
    if (roomId === 'pilot-office') return 'משרד';
    return roomId.startsWith('k') ? `יחידה ${roomId.slice(1)}` : roomId;
  }
  // Musical Courtyard rule: 1, 2, 3 instead of instrument names
  if (r.id === 'k690' || r.name?.includes('מוסיקלית') || r.name?.includes('מוזיקלית')) {
    if (r.id === 'k690' || r.letterCode === 'D1' || r.name?.includes('1')) return 'חצר מוזיקלית 1';
    if (r.id === 'k691' || r.letterCode === 'D2' || r.name?.includes('2')) return 'חצר מוזיקלית 2';
    if (r.id === 'k692' || r.letterCode === 'D3' || r.name?.includes('3')) return 'חצר מוזיקלית 3';
    return 'חצר מוזיקלית';
  }
  if (r.name) {
    let clean = r.name
      .replace(/\s*·\s*בקתה\s*/g, ' ')
      .replace(/\s*·\s*/g, ' ')
      .trim();
    clean = clean.replace(/מוסיקלית/g, 'מוזיקלית');
    return clean;
  }
  return r.letterCode || (roomId.startsWith('k') ? `יחידה ${roomId.slice(1)}` : roomId);
}

/** Guest units with no stay tonight. A checkout today is free for a new arrival. */
export function formatVacantToday(rooms: RoomEntry[], bookings: BookingRow[], today: string): string {
  const occupied = new Set(
    bookings
      .filter((b) => !b.deleted_at && b.booking_status !== 'CANCELED' && (b.check_in_date || '') <= today && (b.check_out_date || '') > today)
      .map((b) => b.unit_id)
  );
  const free = rooms.filter((room) => isBookableRoom(room) && !isStaffRoom(room) && !isOfficeRoom(room) && !occupied.has(room.id));
  if (!free.length) return 'אין חדר פנוי להיום.';
  return `פנויים להיום (${free.length}):\n${free.map((room) => `• ${formatRoomDisplay(room.id, rooms)}`).join('\n')}`;
}

export function formatRoomForWorker(roomId: string, lang: Lang, rooms: RoomEntry[]): string {
  const r = rooms.find((x) => x.id === roomId);
  const lockbox = r?.lockbox;

  if (lang === 'th') {
    const name = r?.letterCode || formatRoomDisplay(roomId, rooms);
    return lockbox ? `${name} (รหัสตู้เซฟ: ${lockbox})` : name;
  }
  const name = formatRoomDisplay(roomId, rooms);
  if (lang === 'ar') {
    return lockbox ? `${name} (كود الخزنة: ${lockbox})` : name;
  }
  return lockbox ? `${name} (כספת: ${lockbox})` : name;
}

const roomHoldAudit = (entry: Record<string, unknown>) => fileAudit(process.env.ROOM_HOLD_AUDIT_PATH || joinPath(process.cwd(), 'data', 'room-hold-audit.jsonl'))(entry);

export function createPipeline(deps: PipelineDeps) {
  const channelStorage = new AsyncLocalStorage<ChannelId>();

  // Every outgoing text: spacing normalized (bug 5) and logged with full content (Ran 2026-10-20).
  let currentRoute: { jid?: string; route?: string } = {};
  /** Bug A: a bare number answers the room menu shown in the last 10 minutes. */
  const ROOM_MENU_TTL_MS = 10 * 60 * 1000;
  const roomMenuShownAt = new Map<string, number>();

  const rawSend = deps.send;
  const wrappedSend = async (jid: string, text: string, channelId?: ChannelId) => {
    const ch = channelId || channelStorage.getStore() || 'resortos';
    const out = normalizeOutgoingText(text);
    // Bug A: remember when a numbered room-action menu was last shown to this number.
    if (/אפשרויות לחדר .*\(השב מספר\)/.test(out)) {
      try { roomMenuShownAt.set(normalizePhoneTail(phoneOf(jid)), Date.now()); } catch { /* ignore */ }
    }
    logConversation({ direction: 'outbound', jid, text: out, route: currentRoute.jid === jid ? currentRoute.route : undefined });
    return rawSend(jid, out, ch);
  };

  const rawSendImage = deps.sendImage;
  const wrappedSendImage = rawSendImage
    ? (jid: string, buffer: Buffer, caption?: string, channelId?: ChannelId) => {
        const ch = channelId || channelStorage.getStore() || 'resortos';
        return rawSendImage(jid, buffer, caption, ch);
      }
    : undefined;

  const d: PipelineDeps = {
    ...deps,
    send: wrappedSend,
    ...(wrappedSendImage ? { sendImage: wrappedSendImage } : {}),
  };

  const barakForwardLast = new Map<string, number>();
  const lastCheckoutAsk = new Map<string, number>();
  const wrongQrAlerted = new Set<string>();
  const rawSessionStates = new Map<string, SessionState>();
  const sessionStates = {
    get: (key: string): SessionState | undefined => {
      if (key.startsWith('resortos:')) {
        return rawSessionStates.get(key) ?? rawSessionStates.get(key.replace('resortos:', ''));
      }
      return rawSessionStates.get(key);
    },
    set: (key: string, val: SessionState) => {
      rawSessionStates.set(key, val);
      if (key.startsWith('resortos:')) {
        rawSessionStates.set(key.replace('resortos:', ''), val);
      }
    },
    delete: (key: string) => {
      rawSessionStates.delete(key);
      if (key.startsWith('resortos:')) {
        rawSessionStates.delete(key.replace('resortos:', ''));
      }
      return true;
    },
    has: (key: string) => {
      if (key.startsWith('resortos:')) {
        return rawSessionStates.has(key) || rawSessionStates.has(key.replace('resortos:', ''));
      }
      return rawSessionStates.has(key);
    },
    clear: () => rawSessionStates.clear(),
  };

  const alertMemory = createAlertMemory();
  // @lid guests matched by a phone they typed (jid -> booking phone), and jids already asked once for the booking phone (no loops).
  const bookingPhoneOverride = new Map<string, string>();
  const bookingPhoneAsked = new Set<string>();
  // Unidentified-sender verification (Ran 2026-10-22): handoff SMS to Ran only, max one per sender per 15 min.
  const handoffLast = new Map<string, number>();
  const otpIssued = new Set<string>();
  async function handoffToRan(key: string, p: { sender: string; name?: string | null; room?: string | null; text: string; why: string }): Promise<void> {
    const now = Date.now();
    if (now - (handoffLast.get(key) || 0) < HANDOFF_GAP_MS) return;
    handoffLast.set(key, now);
    if (!d.notifyManagerSms) return;
    try { await Promise.resolve(d.notifyManagerSms(V.handoffSms(p))); } catch (err) {
      d.log.warn({ err: String((err as any)?.message || err) }, 'handoff SMS failed');
    }
  }
  function activeToday(b: BookingRow, today: string): boolean {
    return !b.deleted_at && b.booking_status !== 'CANCELED' && today >= (b.check_in_date || '') && today <= (b.check_out_date || '');
  }

  const getSession = (phone: string, channelId?: ChannelId) => {
    const tail = normalizePhoneTail(phone);
    const ch = channelId || channelStorage.getStore();
    if (ch && ch !== 'resortos') {
      return rawSessionStates.get(`${ch}:${tail}`);
    }
    return rawSessionStates.get(`resortos:${tail}`) ?? rawSessionStates.get(tail);
  };

  const setSession = (phone: string, s: SessionState, channelId?: ChannelId) => {
    const tail = normalizePhoneTail(phone);
    const ch = channelId || channelStorage.getStore() || 'resortos';
    rawSessionStates.set(`${ch}:${tail}`, s);
    if (ch === 'resortos') {
      rawSessionStates.set(tail, s);
    }
  };

  const clearSession = (phone: string, channelId?: ChannelId) => {
    const tail = normalizePhoneTail(phone);
    const ch = channelId || channelStorage.getStore() || 'resortos';
    rawSessionStates.delete(`${ch}:${tail}`);
    if (ch === 'resortos') {
      rawSessionStates.delete(tail);
    }
  };
  const roomMemory = new Map<string, { complexKey?: string; complexAge: number; statedUnit?: number; statedUnitAge: number }>();

  function memoryKey(phone: string): string {
    const ch = channelStorage.getStore() || 'resortos';
    return `${ch}:${normalizePhoneTail(phone)}`;
  }

  function touchRoomMemory(phone: string) {
    const row = roomMemory.get(memoryKey(phone));
    if (!row) return;
    row.complexAge += 1;
    row.statedUnitAge += 1;
  }

  function rememberComplex(phone: string, complexKey: string) {
    const row = roomMemory.get(memoryKey(phone)) || { complexAge: 0, statedUnitAge: 99 };
    row.complexKey = complexKey;
    row.complexAge = 0;
    roomMemory.set(memoryKey(phone), row);
  }

  function rememberStatedUnit(phone: string, unit: number) {
    const row = roomMemory.get(memoryKey(phone)) || { complexAge: 99, statedUnitAge: 0 };
    row.statedUnit = unit;
    row.statedUnitAge = 0;
    roomMemory.set(memoryKey(phone), row);
  }

  function rememberRoom(phone: string, roomId: string) {
    const complex = complexOfRoom(roomId);
    if (complex) rememberComplex(phone, complex.key);
  }

  function dialogContext(phone: string, currentRoomId?: string): RoomDialogContext {
    const row = roomMemory.get(memoryKey(phone));
    const context: RoomDialogContext = {};
    if (row?.complexKey && row.complexAge <= 2) context.complexKey = row.complexKey;
    if (row?.statedUnit && row.statedUnitAge <= 2) context.statedUnit = row.statedUnit;
    if (currentRoomId) {
      const complex = complexOfRoom(currentRoomId);
      if (complex) context.complexKey = complex.key;
    }
    return context;
  }

  async function triggerRoomExit(p: { cleanerPhone: string; roomId: string; channelId?: ChannelId }): Promise<{ ok: boolean; message?: string }> {
    const channelId = p.channelId || 'resortos';
    return channelStorage.run(channelId, async () => {
      const cleaner = d.cleaners().find((c) => matchesCleaner(c, p.cleanerPhone));
      if (!cleaner) return { ok: false, message: 'cleaner not found' };
      const r = d.rooms().find((x) => x.id === p.roomId);
      const roomLabel = cleaner.language === 'th' ? (r?.letterCode || r?.name || p.roomId) : (r?.name || r?.letterCode || p.roomId);
      setSession(cleaner.phone, { role: 'CLEANER', state: 'AWAITING_STATUS', roomId: p.roomId }, channelId);
      const menuFn = CLEANER_EXIT_MENU[cleaner.language] || CLEANER_EXIT_MENU.he;
      const menuText = menuFn(roomLabel);
      await d.send(`${cleaner.phone}@s.whatsapp.net`, menuText);
      return { ok: true, message: menuText };
    });
  }

  async function senderHasGuestStay(phone: string): Promise<boolean> {
    if (!phone) return false;
    try {
      const bookings = (await d.resortos.listBookings?.()) || [];
      return hasGuestBooking(bookings, phone);
    } catch {
      return false;
    }
  }

  /** Worker -> agent. */
  async function handleInbound(
    input: WAMessage | InboundEnvelope,
    fallbackChannelId: ChannelId = 'resortos',
  ): Promise<InboundResult> {
    const isEnvelope = Boolean(input && typeof input === 'object' && 'rawMessage' in input && 'channelId' in input);
    const channelId: ChannelId = isEnvelope ? (input as InboundEnvelope).channelId : fallbackChannelId;
    const msg: WAMessage = isEnvelope ? (input as InboundEnvelope).rawMessage : (input as WAMessage);

    return channelStorage.run(channelId, async () => {
      const jid = msg.key.remoteJid || undefined;
      let inboundText = '';
      try { inboundText = String(d.extractText(msg) || ''); } catch { inboundText = ''; }
      const inPn = lidSenderPn(msg);
      const cleanerRow = jid ? d.cleaners().find((c) => matchesCleaner(c, jid) || matchesCleaner(c, phoneOf(jid)) || (inPn ? matchesCleaner(c, inPn) : false)) : undefined;
      const routePhone = (jid?.endsWith('@lid') && inPn) ? inPn : (jid ? phoneOf(jid) : '');
      let route = !jid ? 'none' : !cleanerRow ? 'guest' : (cleanerRow.role === 'MANAGER' || cleanerRow.role === 'OPS_MANAGER') ? 'manager' : 'staff';
      if (isManagerRole(cleanerRow?.role) && await senderHasGuestStay(routePhone)) route = 'guest';
      const isAudioMsg = (() => { try { return d.isAudio(msg); } catch { return false; } })();
      logConversation({ direction: 'inbound', jid, text: inboundText || (isAudioMsg ? '[voice note]' : ''), route });
      currentRoute = { jid, route };
      const result = await handleInboundInner(msg, channelId);
      if (route === 'guest' && jid && !msg.key.fromMe && channelId === 'resortos' && result.reason !== 'late_checkout') void forwardGuestToBarak(jid, inPn, inboundText || (isAudioMsg ? '[הודעה קולית]' : ''));
      logConversation({ direction: 'result', jid, route, handled: result.handled, reason: (result as any).reason, text: (result as any).transcript?.text });
      return result;
    });
  }

  async function forwardGuestToBarak(jid: string, senderPn: string | null | undefined, text: string): Promise<void> {
    try {
      const now = new Date();
      if ((d as any).barakForwardEnabled === false || (process.env.VITEST && (d as any).barakForwardEnabled !== true)) return;
      if (!inBarakForwardWindow(now) || !text.trim()) return;
      const phone = intlPhone(jid.endsWith('@lid') ? senderPn : phoneOf(jid));
      const key = phone || jid;
      if (now.getTime() - (barakForwardLast.get(key) || 0) < BARAK_FORWARD_GAP_MS) return;
      barakForwardLast.set(key, now.getTime());
      let name: string | null = null;
      let unit: string | null = null;
      if (phone) {
        const bookings = ((await d.resortos.listBookings?.()) || []).filter((b) => phonesMatch(b.guest_phone, phone) && !b.deleted_at && b.booking_status !== 'CANCELED');
        const today = getIsraelToday();
        const b = bookings.find((x) => today >= (x.check_in_date || '') && today <= (x.check_out_date || '')) || bookings[0];
        if (b) {
          name = b.guest_name || null;
          const room = d.rooms().find((r) => r.id === b.unit_id);
          unit = room?.name || room?.letterCode || b.unit_id || null;
        }
      }
      const summary = text.replace(/\s+/g, ' ').trim().slice(0, 300);
      await d.send(`${BARAK_FORWARD_PHONE}@s.whatsapp.net`, barakForwardText({ name, unit, hhmm: israelClock(now).hhmm, summary, phone: phone || 'לא ידוע' }), 'resortos');
      d.log.info({ guestTail: phone ? phone.slice(-4) : null }, 'guest message forwarded to Barak');
    } catch (err) {
      d.log.warn({ err: String((err as any)?.message || err) }, 'Barak forward failed');
    }
  }

  async function handleInboundInner(msg: WAMessage, channelId: ChannelId = 'resortos'): Promise<InboundResult> {
    const jid = msg.key.remoteJid;
    if (!jid) return { handled: false, reason: 'no jid' };
    const senderPhone = phoneOf(jid);
    const senderPn = lidSenderPn(msg);
    // @lid senders: the jid digits are a privacy ID, not a phone. Use the phone WhatsApp attaches (senderPn) for guest lookup + session (Ran 2026-10-21, Toscana 1).
    const baseGuestPhone = (jid.endsWith('@lid') && senderPn) ? senderPn : senderPhone;
    const guestPhone = bookingPhoneOverride.get(jid) || baseGuestPhone;
    if (jid.endsWith('@lid')) d.log.info({ jid, hasSenderPn: Boolean(senderPn), senderPnTail: senderPn ? senderPn.slice(-4) : null }, 'inbound @lid sender');
    // Staff on @lid without a stored LID (e.g. קוסטה, Ran 2026-10-21) are matched by the phone WhatsApp attaches.
    let cleaner = d.cleaners().find((c) => matchesCleaner(c, jid) || matchesCleaner(c, senderPhone)) || (senderPn ? d.cleaners().find((c) => matchesCleaner(c, senderPn)) : undefined);
    let isManager = isManagerRole(cleaner?.role);
    const sessionKey = `${channelId}:${normalizePhoneTail(baseGuestPhone)}`;
    let currentSession = sessionStates.get(sessionKey);
    // A phone that is both a manager and a guest is answered as the guest.
    if (isManager && await senderHasGuestStay(guestPhone)) {
      cleaner = undefined;
      isManager = false;
      if (currentSession && currentSession.role !== 'GUEST') {
        sessionStates.delete(sessionKey);
        currentSession = undefined;
      }
    }
    // Guest priority for the background invoice name job (local vision model shares the GPU with guest replies).
    if (!cleaner) { try { (d.invoiceIntake as any)?.noteGuestActivity?.(); } catch { /* ignore */ } }
    const isWorker = Boolean(cleaner && !isManager);

    let text = d.extractText(msg);
    // Ran 2026-10-22: a voice note (incl. forwarded) from Ran (admin) → reply to Ran only with its transcript.
    if (isManager && !msg.key.fromMe && !text?.trim() && d.isAudio(msg) &&
        [cleaner?.phone, senderPhone, senderPn].some((p) => normalizePhoneTail(p || '') === normalizePhoneTail('972548317887'))) {
      const tr = await d.transcribe(msg, 'he');
      const said = tr?.text?.trim();
      await d.send(jid, said ? `תמלול: ${said}` : 'לא הצלחתי לתמלל את ההקלטה.');
      return { handled: true, transcript: tr };
    }
    // Unidentified-sender verification (Ran 2026-10-22). A typed phone never releases a code in WhatsApp.
    if (!cleaner && currentSession?.role === 'GUEST' && text?.trim() &&
        (currentSession.state === 'VERIFY_HAS_BOOKING' || currentSession.state === 'VERIFY_PHONE' || currentSession.state === 'VERIFY_OTP' || currentSession.state === 'AWAITING_BOOKING_PHONE')) {
      const cs: any = currentSession;
      const t0: string = text;
      const today = getIsraelToday();
      const roomId: string | undefined = cs.roomId || undefined;
      const roomName = roomId ? (d.rooms().find((x) => x.id === roomId)?.name || roomId) : null;
      const senderLabel = (senderPn ? phoneOf(senderPn) : null) || (jid.endsWith('@lid') ? jid : senderPhone) || jid;
      const name = (msg as any).pushName || null;
      const hkey = normalizePhoneTail(senderPn || senderPhone) || jid;
      const handoff = async (why: string) => {
        sessionStates.delete(sessionKey);
        await handoffToRan(hkey, { sender: senderLabel, name, room: roomName, text: [cs.pendingText, t0].filter(Boolean).join(' | '), why });
        await d.send(jid, V.handoff());
        return { handled: true, reason: 'verify_handoff' } as InboundResult;
      };
      const t = t0.trim();
      if (cs.state === 'VERIFY_OTP') {
        if (Date.now() > cs.expiresAt) return handoff('פג תוקף קוד האימות');
        const otp = extractOtp(t);
        if (otp && otp === cs.code) {
          sessionStates.delete(sessionKey);
          bookingPhoneOverride.set(jid, cs.bookingPhone);
          d.log.info({ jid, bookingId: cs.bookingId }, 'guest verified by OTP');
          await d.send(jid, V.verified());
          if (cs.pendingText) return handleInboundInner({ ...msg, message: { conversation: cs.pendingText } } as any, channelId);
          return { handled: true, reason: 'verify_ok' };
        }
        const attempts = cs.attempts + 1;
        if (attempts >= OTP_MAX_ATTEMPTS) return handoff('קוד אימות שגוי 3 פעמים');
        sessionStates.set(sessionKey, { ...cs, attempts });
        await d.send(jid, V.otpWrong(OTP_MAX_ATTEMPTS - attempts));
        return { handled: true, reason: 'verify_otp_wrong' };
      }
      const typed = extractTypedPhone(t);
      if (cs.state === 'VERIFY_HAS_BOOKING' && !typed) {
        if (isNo(t)) return handoff('אין הזמנה');
        if (isYes(t)) {
          sessionStates.set(sessionKey, { role: 'GUEST', state: 'VERIFY_PHONE', roomId, pendingText: cs.pendingText, askedAt: Date.now(), tries: 0 });
          await d.send(jid, V.askPhone());
          return { handled: true, reason: 'verify_ask_phone' };
        }
        return handoff('שאלה מאורח לא מזוהה');
      }
      if (!typed) {
        const tries = (cs.tries || 0) + 1;
        if (tries > 1) return handoff('לא נמסר מספר טלפון');
        sessionStates.set(sessionKey, { role: 'GUEST', state: 'VERIFY_PHONE', roomId, pendingText: cs.pendingText, askedAt: Date.now(), tries });
        await d.send(jid, V.askPhoneAgain());
        return { handled: true, reason: 'verify_ask_phone' };
      }
      const all = (await d.resortos.listBookings?.()) || [];
      const hit = all.find((b) => activeToday(b, today) && phonesMatch(b.guest_phone, typed) && (!roomId || b.unit_id === roomId));
      d.log.info({ jid, typedTail: typed.slice(-4), matched: Boolean(hit) }, 'guest typed booking phone');
      if (hit) {
        const url = stayUrlOf(hit);
        if (!url || !d.resortos.sendGuestLinkSms || !hit.guest_phone) return handoff('נמצאה הזמנה אך אין אפשרות לשלוח קישור');
        try {
          await d.resortos.sendGuestLinkSms({ bookingId: hit.id, phone: hit.guest_phone, message: V.linkSms(url), reportedBy: 'Chloe verify' });
        } catch { return handoff('שליחת קישור ב-SMS נכשלה'); }
        sessionStates.delete(sessionKey);
        await d.send(jid, V.linkSent());
        return { handled: true, reason: 'verify_link_sms' };
      }
      const rb = roomId ? all.find((b) => b.unit_id === roomId && activeToday(b, today) && b.guest_phone) : undefined;
      const otpKey = rb ? `${jid}|${rb.id}|${today}` : '';
      if (!rb || !d.resortos.sendGuestLinkSms || otpIssued.has(otpKey)) return handoff('המספר לא תואם להזמנה');
      const code = newOtp();
      try {
        await d.resortos.sendGuestLinkSms({ bookingId: rb.id, phone: rb.guest_phone!, message: V.otpSms(code), reportedBy: 'Chloe verify' });
      } catch { return handoff('שליחת קוד אימות נכשלה'); }
      otpIssued.add(otpKey);
      sessionStates.set(sessionKey, { role: 'GUEST', state: 'VERIFY_OTP', roomId, pendingText: cs.pendingText, bookingId: rb.id, bookingPhone: rb.guest_phone!, code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
      await d.send(jid, V.otpSent());
      return { handled: true, reason: 'verify_otp_sent' };
    }
    if (text?.trim()) {
      if (isManager) {
        const lastAlert = isWhatIsThis(text) ? alertMemory.recent(sessionKey) : null;
        if (lastAlert) {
          alertMemory.forget(sessionKey);
          await d.send(jid, explainAlert(lastAlert));
          return { handled: true };
        }
        const holdReply = await handleManagerRoomHold(text.trim(), sessionKey, cleaner?.name || 'מנהל', {
          rooms: d.rooms,
          today: getIsraelToday,
          listBookings: d.resortos.listBookings?.bind(d.resortos),
          holdNight: d.resortos.holdNight?.bind(d.resortos),
          audit: roomHoldAudit,
          sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        });
        if (holdReply) {
          await d.send(jid, holdReply);
          return { handled: true };
        }
      }
      const deskReply = await consultCallDesk(senderPhone, text.trim());
      if (deskReply) {
        await d.send(jid, deskReply);
        return { handled: true };
      }
      const rawGround = text.trim();
      const scanned = groundByScan(rawGround);
      const pendingGround = currentSession?.state === 'AWAITING_GROUND' || currentSession?.state === 'AWAITING_GROUND_FAULT'
        ? currentSession
        : null;
      if (scanned || pendingGround) {
        const actor = cleaner?.name || 'צוות';
        if (scanned && isManager) {
          const roomIds = roomsForFamily(scanned.family);
          const today = getIsraelToday();
          const units = (await d.resortos.listUnits?.()) || [];
          const bookings = (await d.resortos.listBookings?.({ from: today, to: today })) || [];
          const lines = roomIds.map((roomId) => {
            const unit = units.find((row) => row.id === roomId);
            const stay = bookings.find((booking) => (
              booking.unit_id === roomId
              && !booking.deleted_at
              && booking.booking_status !== 'CANCELED'
              && String(booking.check_in_date || '').slice(0, 10) <= today
              && today < String(booking.check_out_date || '').slice(0, 10)
            ));
            const clean = getCleaningStatusLabel(unit?.operational_status, unit?.custom_reason);
            const guest = stay?.guest_name ? ` · ${stay.guest_name}` : '';
            return `${formatRoomDisplay(roomId, d.rooms())} · ${clean}${guest}`;
          });
          await d.send(jid, `${scanned.label}\nמצב החדרים במתחם:\n\n${lines.join('\n') || 'אין חדרים במתחם'}`);
          return { handled: true };
        }
        if (scanned && cleaner && !isManager) {
          sessionStates.set(sessionKey, {
            role: 'CLEANER',
            state: 'AWAITING_GROUND',
            assetId: scanned.id,
            kind: scanned.kind,
            label: scanned.label,
          });
          await d.send(jid, housekeepingMenu(scanned));
          return { handled: true };
        }
        if (scanned && !cleaner) {
          const reply = await guestGroundReply(scanned, senderPhone);
          await d.send(jid, reply);
          return { handled: true };
        }
        if (pendingGround && /^START[_\s]+/i.test(rawGround)) {
          sessionStates.delete(sessionKey);
        } else if (pendingGround?.state === 'AWAITING_GROUND_FAULT') {
          const note = rawGround.slice(0, 240);
          if (d.resortos.setGroundStatus) {
            await d.resortos.setGroundStatus({
              id: pendingGround.assetId,
              status: 'inspect',
              reportedBy: actor,
              note: `תקלה: ${note}`,
            });
          }
          sessionStates.delete(sessionKey);
          await d.send(jid, `נרשמה תקלה ב${pendingGround.label}: ${note}`);
          return { handled: true };
        } else if (pendingGround?.state === 'AWAITING_GROUND') {
          const choice = workerGroundChoice(rawGround);
          if (choice === 'start') {
            let status = pendingGround.kind === 'pool' ? 'ok' : 'clean';
            if (d.resortos.getGroundStatus) {
              const row = await d.resortos.getGroundStatus(pendingGround.assetId).catch(() => null);
              if (row?.status) status = row.status;
            }
            if (pendingGround.kind === 'yard') status = 'dirty';
            if (d.resortos.setGroundStatus) {
              await d.resortos.setGroundStatus({
                id: pendingGround.assetId,
                status,
                reportedBy: actor,
                note: 'התחלת ניקיון',
              });
            }
            sessionStates.delete(sessionKey);
            await d.send(jid, `נרשם שהתחלת ניקיון ב${pendingGround.label}.`);
            return { handled: true };
          }
          if (choice === 'fault') {
            sessionStates.set(sessionKey, {
              role: 'CLEANER',
              state: 'AWAITING_GROUND_FAULT',
              assetId: pendingGround.assetId,
              kind: pendingGround.kind,
              label: pendingGround.label,
            });
            await d.send(jid, `מה התקלה ב${pendingGround.label}?`);
            return { handled: true };
          }
          await d.send(jid, 'כתבו 1 להתחלת ניקיון או 2 לדיווח על תקלה.');
          return { handled: true };
        }
      }
    }
    let transcript: Transcript | undefined;
    let lang: Lang = cleaner?.language || 'he';
    let memoryNoted = false;

    function noteManagerTurn(raw: string) {
      if (!isManager || memoryNoted) return;
      memoryNoted = true;
      touchRoomMemory(sessionKey);
      const unit = bareUnitNumber(raw);
      if (unit) rememberStatedUnit(sessionKey, unit);
      const peek = matchManagerRoomIntent(raw, d.rooms());
      if (peek.type === 'RESOLVED') {
        const key = complexOfRoom(peek.roomId)?.key;
        if (key) rememberComplex(sessionKey, key);
      } else if (peek.type === 'AMBIGUOUS_COMPLEX') {
        rememberComplex(sessionKey, peek.complex.key);
      }
    }

    async function showManagerRoom(roomId: string, pendingQuestion?: string) {
      const r = d.rooms().find((x) => x.id === roomId);
      const lockbox = r?.lockbox || '1357#';
      const today = getIsraelToday();
      const units = (await d.resortos.listUnits?.()) || [];
      const unit = units.find((u) => u.id === roomId);
      const bookings = (await d.resortos.listBookings?.({ from: today, to: today })) || [];
      const roomLabel = formatRoomDisplay(roomId, d.rooms());
      const occupancy = getRoomOccupancy(roomId, bookings, today);
      if (occupancy.activeBooking && d.resortos.publishBookingStay) {
        void d.resortos.publishBookingStay(occupancy.activeBooking).catch(() => {});
      }
      rememberRoom(sessionKey, roomId);
      sessionStates.set(sessionKey, {
        role: 'MANAGER',
        state: 'AWAITING_ACTION',
        roomId,
        bookingId: occupancy.activeBooking?.id,
      });
      const asked = pendingQuestion && !bareUnitNumber(pendingQuestion)
        && matchManagerRoomIntent(pendingQuestion, d.rooms()).type !== 'AMBIGUOUS_NUMBER'
        ? pendingQuestion
        : '';
      const specific = asked ? answerManagerRoomQuestion(asked, roomLabel, lockbox, unit, occupancy, r) : null;
      const body = specific || formatManagerInitialCard(roomLabel, lockbox, unit, occupancy, r);
      if (!jid) return;
      roomMenuShownAt.set(sessionKey, Date.now()); // menu-loop fix: same key as the lookup
      await d.send(jid, `🔍 נבחר: *${roomLabel}*\n\n${withManagerActions(body, roomLabel)}`);
    }

    function stayAction(roomId: string) {
      sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_ACTION', roomId });
    }

    async function confirmGuestLink(roomId: string, choice: GuestLinkChoice) {
      if (!choice.phone) {
        sessionStates.set(sessionKey, {
          role: 'MANAGER',
          state: 'AWAITING_GUEST_PHONE',
          roomId,
          bookingId: choice.bookingId,
          stayUrl: choice.stayUrl,
          guestName: choice.guestName,
        });
        if (jid) await d.send(jid, `אין מספר שמור עבור ${choice.guestName}. כתוב את המספר, ואאשר לפני השליחה בסמס.`);
        return;
      }
      sessionStates.set(sessionKey, {
        role: 'MANAGER',
        state: 'AWAITING_GUEST_LINK',
        roomId,
        bookingId: choice.bookingId,
        phone: choice.phone,
        stayUrl: choice.stayUrl,
        guestName: choice.guestName,
      });
      if (jid) await d.send(jid, guestLinkConfirm(choice.guestName, choice.phone));
    }

    async function beginGuestLink(roomId: string) {
      const today = getIsraelToday();
      const next = new Date(`${today}T12:00:00+03:00`);
      next.setDate(next.getDate() + 1);
      const to = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(next);
      const bookings = (await d.resortos.listBookings?.({ from: today, to })) || [];
      const occupancy = getRoomOccupancy(roomId, bookings, today);
      const roomLabel = formatRoomDisplay(roomId, d.rooms());
      const choices = [
        occupancy.inBooking ? linkChoice(occupancy.inBooking, 'נכנס היום') : null,
        occupancy.stayingBooking ? linkChoice(occupancy.stayingBooking, 'שוהה') : null,
        occupancy.outBooking ? linkChoice(occupancy.outBooking, 'יוצא היום') : null,
      ].filter((choice): choice is GuestLinkChoice => Boolean(choice));
      const unique = choices.filter((choice, index) => choices.findIndex((other) => other.bookingId === choice.bookingId) === index);
      if (!unique.length) {
        stayAction(roomId);
        if (jid) await d.send(jid, `אין אורח עם קישור לדף אורח על *${roomLabel}*.`);
        return;
      }
      for (const booking of [occupancy.inBooking, occupancy.stayingBooking, occupancy.outBooking]) {
        if (booking && d.resortos.publishBookingStay) void d.resortos.publishBookingStay(booking).catch(() => {});
      }
      if (unique.length > 1) {
        sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_GUEST_PICK', roomId, choices: unique });
        if (jid) await d.send(jid, guestLinkPickText(unique));
        return;
      }
      await confirmGuestLink(roomId, unique[0]);
    }

    async function deliverGuestLink(pending: { roomId: string; bookingId: string; phone: string; stayUrl: string }) {
      const roomLabel = formatRoomDisplay(pending.roomId, d.rooms());
      const message = guestLinkSms(roomLabel, pending.stayUrl);
      try {
        if (!d.resortos.sendGuestLinkSms) {
          if (jid) await d.send(jid, 'השליחה בסמס לא זמינה כרגע.');
        } else {
          await d.resortos.sendGuestLinkSms({
            bookingId: pending.bookingId,
            phone: pending.phone,
            message,
            reportedBy: cleaner?.name || 'מנהל',
          });
          if (jid) await d.send(jid, `✅ הקישור נשלח בסמס למספר ${pending.phone}.`);
        }
      } catch (err) {
        d.log.error({ err: String(err) }, 'guest link sms failed');
        if (jid) await d.send(jid, 'לא הצלחתי לשלוח את הסמס. אפשר לנסות שוב.');
      }
      stayAction(pending.roomId);
    }

    async function guestOnRoom(roomId: string) {
      const today = getIsraelToday();
      const next = new Date(`${today}T12:00:00+03:00`);
      next.setDate(next.getDate() + 1);
      const to = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(next);
      const bookings = (await d.resortos.listBookings?.({ from: today, to })) || [];
      const occupancy = getRoomOccupancy(roomId, bookings, today);
      return occupancy.stayingBooking || occupancy.outBooking || occupancy.inBooking;
    }

    async function askCashConfirm(roomId: string, shekels: number, sourceText?: string) {
      const roomLabel = formatRoomDisplay(roomId, d.rooms());
      const guest = await guestOnRoom(roomId).catch(() => undefined);
      if (!guest) {
        if (jid) await d.send(jid, `אין אורח על *${roomLabel}*, אז אין על מי לרשום גבייה.`);
        return;
      }
      const quote = String(sourceText || '').trim();
      sessionStates.set(sessionKey, {
        role: 'MANAGER',
        state: 'AWAITING_CASH_CONFIRM',
        roomId,
        shekels,
        ...(quote ? { sourceText: quote } : {}),
      });
      if (!jid) return;
      await d.send(jid, cashConfirmText(roomLabel, shekels, guest.guest_name || ''));
    }

    async function applyCash(roomId: string, shekels: number, sourceText?: string) {
      const roomLabel = formatRoomDisplay(roomId, d.rooms());
      const by = cleaner?.name || 'משרד';
      const say = async (reply: string) => { if (jid) await d.send(jid, reply); };
      let recorded = false;
      try {
        if (!d.resortos.collectCash) {
          await say(`הבנתי גביית מזומן ${cashShekelLabel(shekels)} על *${roomLabel}*, אבל העדכון לא זמין כרגע.`);
        } else {
          const result = await d.resortos.collectCash({
            unitId: roomId,
            amountAgorot: Math.round(shekels * 100),
            reportedBy: by,
            note: sourceText,
          });
          if (!result.ok) {
            await say(result.skipped === 'no_booking'
              ? `אין אורח על *${roomLabel}*, לא רשמתי גבייה.`
              : `לא רשמתי את הגבייה על *${roomLabel}*.`);
          } else {
            recorded = true;
            const who = result.guest_name ? ` עבור ${result.guest_name}` : '';
            await say(`✅ נרשמה גביית מזומן ${cashShekelLabel(shekels)}${who} בחדר *${roomLabel}*.\n\n${askByName(by, paymentStatusQuestion())}`);
          }
        }
      } catch (err) {
        d.log.error({ err: String(err) }, 'cash collection failed');
        await say(`לא הצלחתי לרשום את הגבייה על *${roomLabel}*.`);
      }
      rememberRoom(sessionKey, roomId);
      sessionStates.set(sessionKey, recorded
        ? { role: 'MANAGER', state: 'AWAITING_PAYMENT_STATUS', roomId }
        : { role: 'MANAGER', state: 'AWAITING_ACTION', roomId });
    }

    async function applyPaymentStatus(roomId: string, status: 'PARTIAL' | 'PAID') {
      const roomLabel = formatRoomDisplay(roomId, d.rooms());
      const by = cleaner?.name || 'משרד';
      const label = paymentStatusLabel(status);
      const say = async (reply: string) => { if (jid) await d.send(jid, reply); };
      try {
        if (!d.resortos.setPaymentStatus) {
          await say(`הבנתי סטטוס תשלום ${label} על *${roomLabel}*, אבל העדכון לא זמין כרגע.`);
        } else {
          const result = await d.resortos.setPaymentStatus({ unitId: roomId, status, reportedBy: by });
          if (!result.ok) {
            await say(`לא עדכנתי את סטטוס התשלום על *${roomLabel}*.`);
          } else {
            const who = result.guest_name ? ` עבור ${result.guest_name}` : '';
            await say(`✅ סטטוס תשלום: ${label}${who} בחדר *${roomLabel}*.`);
          }
        }
      } catch (err) {
        d.log.error({ err: String(err) }, 'payment status update failed');
        await say(`לא הצלחתי לעדכן את סטטוס התשלום על *${roomLabel}*.`);
      }
      sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_ACTION', roomId });
    }

    async function askHoldConfirm(roomId: string) {
      const roomLabel = formatRoomDisplay(roomId, d.rooms());
      sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_HOLD_CONFIRM', roomId });
      if (!jid) return;
      await d.send(jid, holdConfirmText(roomLabel));
    }

    async function guestGroundReply(asset: { kind: GroundKind; family: string; label: string; scan: string; unitId?: string }, phone: string) {
      const today = getIsraelToday();
      const roomIds = roomsForFamily(asset.family);
      const bookings = (await d.resortos.listBookings?.()) || [];
      const mine = bookings.filter((booking) => (
        phonesMatch(booking.guest_phone, phone)
        && !booking.deleted_at
        && booking.booking_status !== 'CANCELED'
      ));
      const covers = (booking: BookingRow) => {
        const cin = String(booking.check_in_date || '').slice(0, 10);
        const cout = String(booking.check_out_date || '').slice(0, 10);
        return Boolean(cin && cout && cin <= today && today < cout);
      };
      const booking = mine.find((row) => roomIds.includes(row.unit_id) && covers(row))
        || mine.find(covers)
        || mine.find((row) => roomIds.includes(row.unit_id))
        || mine[0];
      const stayUrl = stayUrlOf(booking);
      const reply = asset.kind === 'pool'
        ? poolGuestReply(asset, stayUrl)
        : (stayUrl
          ? `${asset.label}\nדף האורח:\n${stayUrl}`
          : 'הקוד של החצר מיועד לצוות. אם אתם אורחים, כתבו כאן מה צריך.');
      if (booking) void logGuestWhatsAppExchange(booking, asset.scan, reply);
      return reply;
    }

    async function logGuestWhatsAppExchange(booking: BookingRow | undefined, inboundText: string, outboundText: string) {
      if (!booking?.id || !d.resortos.logGuestComm) return;
      const phone = displayPhone(senderPhone) || senderPhone || booking.guest_phone || '';
      if (inboundText.trim()) {
        await d.resortos.logGuestComm({
          bookingId: booking.id,
          direction: 'inbound',
          phone,
          content: inboundText.trim(),
          status: 'received',
          channel: channelId,
        });
      }
      if (outboundText.trim()) {
        await d.resortos.logGuestComm({
          bookingId: booking.id,
          direction: 'outbound',
          phone,
          content: outboundText.trim(),
          status: 'sent',
          channel: channelId,
        });
      }
    }

    async function offerPlaceMenu(raw: string, roomId?: string, guestBooking?: BookingRow): Promise<boolean> {
      const heard = String(raw || '').trim();
      if (!jid || !heard) return false;
      const menu = await placeMenuFor(heard);
      if (!menu) return false;
      const role = !cleaner ? 'GUEST' as const : isManager ? 'MANAGER' as const : 'CLEANER' as const;
      if (role === 'GUEST') {
        sessionStates.set(sessionKey, { role: 'GUEST', state: 'AWAITING_PLACE', placeIds: menu.ids, bookingId: guestBooking?.id });
        void logGuestWhatsAppExchange(guestBooking, heard, menu.text);
      } else {
        sessionStates.set(sessionKey, { role, state: 'AWAITING_PLACE', placeIds: menu.ids, ...(roomId ? { roomId } : {}) });
      }
      await d.send(jid, menu.text);
      return true;
    }

    async function sendPlaceAnswer(raw: string, roomId?: string): Promise<boolean> {
      if (await offerPlaceMenu(raw, roomId)) return true;
      const heard = String(raw || '').trim();
      if (!jid || !heard) return false;
      const named = resolveRoomByAlias(heard, d.rooms());
      const room = d.rooms().find((item) => item.id === (named || roomId));
      const reply = answerStaffPlaceQuestion(heard, {
        unitId: room?.id,
        roomName: room ? formatRoomDisplay(room.id, d.rooms()) : undefined,
        room,
      });
      if (reply) {
        await d.send(jid, reply);
        return true;
      }
      if (staffPlaceNeedsRoom(heard) && !room) {
        await d.send(jid, askByName(cleaner?.name, 'על איזה חדר?'));
        return true;
      }
      return false;
    }

    function startNightHold(roomId: string) {
      const roomLabel = formatRoomDisplay(roomId, d.rooms());
      const by = cleaner?.name || 'משרד';
      const say = async (reply: string) => { if (jid) await d.send(jid, reply); };
      void (async () => {
        try {
          if (!d.resortos.holdNight) {
            await say(`הבנתי חסימה ללילה על *${roomLabel}*, אבל העדכון לא זמין כרגע.`);
            return;
          }
          const result = await d.resortos.holdNight({ unitId: roomId, reportedBy: by });
          if (!result.ok) {
            await say(result.skipped === 'in_progress'
              ? `החסימה של *${roomLabel}* כבר בתהליך.`
              : `לא חסמתי את *${roomLabel}* ללילה.`);
            return;
          }
          await say(holdDoneText(roomLabel, result.verified));
        } catch (err) {
          d.log.error({ err: String(err) }, 'night hold failed');
          const detail = err instanceof ResortOSError ? err.code : '';
          const known = /כינורות|תפוס|לא מחובר|לא הגיב/.test(detail) ? detail : '';
          await say(known ? `${known}. *${roomLabel}* לא נחסם.` : `לא הצלחתי לחסום את *${roomLabel}* ללילה.`);
        }
      })();
    }

    async function askStatusConfirm(roomId: string, change: StatusChange, role: 'MANAGER' | 'CLEANER', sourceText?: string) {
      const roomLabel = formatRoomDisplay(roomId, d.rooms());
      const quote = String(sourceText || '').trim();
      sessionStates.set(sessionKey, { role, state: 'AWAITING_STATUS_CONFIRM', roomId, change, ...(quote ? { sourceText: quote } : {}) });
      if (!jid) return;
      await d.send(jid, statusConfirmText(lang, roomLabel, change));
    }

    async function applyStatusChange(roomId: string, change: StatusChange, role: 'MANAGER' | 'CLEANER', sourceText?: string) {
      const by = cleaningCredit(cleaner, 'צוות');
      const roomLabel = formatRoomDisplay(roomId, d.rooms());
      const say = async (reply: string) => { if (jid) await d.send(jid, reply); };
      try {
        if (change === 'ready') {
          const note = String(sourceText || '').trim() || undefined;
          const result = role === 'MANAGER' && d.resortos.approveRoomByManager
            ? await d.resortos.approveRoomByManager({ unitId: roomId, reportedBy: by, note })
            : await d.resortos.markRoomReady({ unitId: roomId, reportedBy: by, note });
          if (!result.ok) {
            sessionStates.delete(sessionKey);
            await say(result.skipped === 'maintenance_open'
              ? `לא עדכנתי את *${roomLabel}*: יש תקלת תחזוקה פתוחה.`
              : `לא עדכנתי את *${roomLabel}*.`);
            return false;
          }
          await say(role === 'CLEANER'
            ? (CLEANER_READY_THANKS[lang] || CLEANER_READY_THANKS.he)
            : `✅ חדר ${roomLabel} אושר בהצלחה כמוכן לאורח (READY)!\nביקורת מנהל הושלמה בהצלחה.`);
        } else if (change === 'occupied' || change === 'vacant') {
          const occupancy = change === 'occupied' ? 'OCCUPIED' : 'VACANT';
          if (!d.resortos.setStaffOccupancy) {
            await say(`הבנתי ש*${roomLabel}* ${statusLabel(lang, change)}, אבל עדכון התפוסה לא זמין כרגע.`);
            return false;
          }
          const result = await d.resortos.setStaffOccupancy({ unitId: roomId, occupancy, reportedBy: by, note: String(sourceText || '').trim() || undefined });
          if (!result.ok) {
            await say(`לא עדכנתי את *${roomLabel}*.`);
            return false;
          }
          await say(`✅ *${roomLabel}* עודכן ל${statusLabel(lang, change)}.`);
        } else if (change === 'cleaning' && d.resortos.startCleaning) {
          const result = await d.resortos.startCleaning({ unitId: roomId, reportedBy: by, note: String(sourceText || '').trim() || undefined });
          if (!result.ok) {
            await say(`לא עדכנתי את *${roomLabel}*.`);
            return false;
          }
          await say(`✅ *${roomLabel}* עודכן לבנקיון.`);
        } else if (d.resortos.updateUnitStatus) {
          await d.resortos.updateUnitStatus({
            unitId: roomId,
            status: 'DIRTY',
            reason: 'ממתין לניקיון',
            reportedBy: by,
            note: String(sourceText || '').trim() || undefined,
          });
          await say(`✅ *${roomLabel}* עודכן לממתין לניקיון.`);
        } else {
          await say(`לא עדכנתי את *${roomLabel}*.`);
          return false;
        }
        if (role === 'MANAGER') {
          rememberRoom(sessionKey, roomId);
          sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_ACTION', roomId });
        } else {
          sessionStates.delete(sessionKey);
        }
        return true;
      } catch (err) {
        d.log.error({ err: String(err) }, 'status update failed');
        await say(`לא הצלחתי לעדכן את *${roomLabel}*. אפשר לנסות שוב.`);
        return false;
      }
    }

    async function takeStatusConfirm(raw: string, role: 'MANAGER' | 'CLEANER', currentRoomId?: string) {
      const answer = confirmAnswer(raw);
      const pending = sessionStates.get(sessionKey);
      if (answer === 'yes' && pending?.state === 'AWAITING_STATUS_CONFIRM') {
        const ok = await applyStatusChange(pending.roomId, pending.change, role, pending.sourceText);
        return ok ? 'ok' : 'failed';
      }
      if (answer === 'no' && pending?.state === 'AWAITING_STATUS_CONFIRM') {
        if (role === 'MANAGER') {
          sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_ACTION', roomId: pending.roomId });
        } else {
          sessionStates.delete(sessionKey);
        }
        if (jid) await d.send(jid, `לא שיניתי את *${formatRoomDisplay(pending.roomId, d.rooms())}*.`);
        return 'ok';
      }
      const next = proposeStatusChange(raw, d.rooms(), currentRoomId || (pending?.state === 'AWAITING_STATUS_CONFIRM' ? pending.roomId : undefined));
      if (next) {
        await askStatusConfirm(next.roomId, next.change, role, raw);
        return 'ok';
      }
      return false;
    }

    try {
      // 0-INV. Manager inventory (Ran 2026-10-20): stock questions + transfers with explicit "אשר העברה".
      if (isManager && jid && d.inventory && text?.trim()) {
        const t0 = text.trim();
        // "מלאי" while an invoice draft is open = switch that invoice to inventory (handled by invoice intake below).
        const invoiceSwitch = t0 === 'מלאי' && Boolean((d.invoiceIntake as any)?.latestDraft?.(cleaner?.phone || senderPhone));
        if (!invoiceSwitch && (detectInventoryIntent(t0) || /^(?:אשר|בטל)\s+העברה$/.test(t0))) {
          let invReply: string | null = null;
          try { invReply = await handleManagerInventory(t0, sessionKey, cleaner?.name || 'מנהל', d.inventory); }
          catch (err) { d.log?.warn?.({ err: (err as Error).message }, 'inventory failed'); invReply = 'לא הצלחתי לגשת למלאי כרגע. לא רשמתי כלום.'; }
          if (invReply) { await d.send(jid, invReply); return { handled: true }; }
        }
      }
      // 0-INVOICE (Ran 2026-10-21): manager invoice photos / PDFs → invoice intake (was never wired: every
      // manager image fell through to the check capture). Not-an-invoice images still continue to the check flow.
      if (isManager && jid && d.invoiceIntake && d.invoiceIntake.isAllowed(cleaner?.phone || senderPhone)) {
        const invPhone = cleaner?.phone || senderPhone;
        const im: any = msg.message || {};
        const hasMedia = Boolean(im.imageMessage || im.documentMessage || im.documentWithCaptionMessage);
        if (hasMedia && d.downloadMedia) {
          try {
            const media = await d.downloadMedia(msg);
            if (media) {
              const caption = im.imageMessage?.caption || im.documentWithCaptionMessage?.message?.documentMessage?.caption || text || '';
              const r = await d.invoiceIntake.handleMedia(invPhone, cleaner?.name || 'מנהל', media, caption, async (t) => { await d.send(jid, t); });
              if (r.kind !== 'not_invoice' && r.reply) {
                await d.send(jid, r.reply);
                if (r.followUp) r.followUp.then((t) => (t ? d.send(jid, t) : undefined)).catch((err) => d.log.warn({ err: String(err) }, 'invoice follow-up failed'));
                return { handled: true };
              }
            }
          } catch (err) {
            d.log.error({ err: String(err) }, 'invoice intake failed');
          }
        } else if (text?.trim()) {
          try {
            const r = await d.invoiceIntake.handleText(invPhone, cleaner?.name || 'מנהל', text.trim(), { otherPending: Boolean(getPendingCheck(senderPhone)) || sessionStates.has(sessionKey) });
            if (r) { await d.send(jid, r); return { handled: true }; }
          } catch (err) {
            d.log.error({ err: String(err) }, 'invoice text command failed');
          }
        }
      }
      // 0A. Manager Financial Command Center Flows (WhatsApp Check Capture & Forecast)
      if (isManager) {
        const pendingCheck = getPendingCheck(senderPhone);
        if (pendingCheck) {
          const trimmed = text?.trim() || '';
          if (confirmAnswer(trimmed) === 'yes' || /^(?:כן|אישור|מאשר|1|אישור שיק|בסדר|מאושר)$/i.test(trimmed)) {
            try {
              await fetch(`${config.resortos.baseUrl}/api/finance/checks/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-resortos-agent': 'true' },
                body: JSON.stringify({
                  captureId: pendingCheck.captureId,
                  confirmedBy: cleaner?.name || 'מנהל'
                })
              });
              clearPendingCheck(senderPhone);
              const reply = `✅ *השיק אושר והוכנס לתחזית התזרים של ResortOS!*\n` +
                `🔹 מס׳ שיק: ${pendingCheck.check.check_number}\n` +
                `🔹 סכום: ₪${Number(pendingCheck.check.amount).toLocaleString('he-IL')}\n` +
                `🔹 תאריך פירעון: ${pendingCheck.check.due_date}\n` +
                `🔹 לפקודת: ${pendingCheck.check.payee}\n\n` +
                `התחזית ויתרות הבנקים עודכנו מיידית בחמ״ל הפיננסי.`;
              await d.send(jid, reply);
              return { handled: true };
            } catch (e) {
              clearPendingCheck(senderPhone);
              await d.send(jid, `❌ שגיאה באישור השיק מול המערכת. אנא נסה שוב או אשר ישירות בלוח.`);
              return { handled: true };
            }
          } else if (/^(?:לא|ביטול|בטל|מחק|2)$/i.test(trimmed)) {
            clearPendingCheck(senderPhone);
            await d.send(jid, `❌ קליטת השיק בוטלה. השיק לא נוסף לתחזית התזרים.`);
            return { handled: true };
          }
        }

        // Image Check Capture
        if (msg.message?.imageMessage || (msg.message as any)?.documentWithCaptionMessage) {
          try {
            const caption = msg.message?.imageMessage?.caption || text || '';
            const parsedFromCaption = parseConversationalForecastEntry(caption);
            // No amount in the caption → don't invent a 5000 ₪ check; ask what the image is (Ran 2026-10-21).
            if (!parsedFromCaption?.amount) {
              await d.send(jid, '🤔 קיבלתי תמונה — מה זה? (חשבונית / שיק / אחר). לשיק יש לצרף כיתוב עם סכום ותאריך, למשל: "שיק 2500 ל-15/11 לספק X".');
              return { handled: true };
            }
            const capturePayload = {
              imageName: 'whatsapp_check.jpg',
              fields: {
                amount: parsedFromCaption?.amount || 5000,
                due_date: parsedFromCaption?.date,
                payee: parsedFromCaption?.label || 'ספק כללי',
                is_outgoing: parsedFromCaption?.isExpense !== false
              },
              capturedBy: cleaner?.name || 'מנהל'
            };
            const resp = await fetch(`${config.resortos.baseUrl}/api/finance/checks/capture`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-resortos-agent': 'true' },
              body: JSON.stringify(capturePayload)
            });
            if (resp.ok) {
              const result = (await resp.json()) as any;
              setPendingCheck(senderPhone, {
                captureId: result.captureId,
                senderPhone,
                check: result.extracted,
                duplicates: result.duplicates || [],
                timestamp: Date.now()
              });
              const promptText = formatCheckConfirmationPrompt(result.extracted, result.duplicates || []);
              await d.send(jid, promptText);
              return { handled: true };
            }
          } catch (err) {
            d.log.error({ err: String(err) }, 'Failed to capture check from image');
          }
        }

        // Conversational Forecast Entry & Status
        if (text?.trim()) {
          const trimmed = text.trim();
          const parsed = parseConversationalForecastEntry(trimmed);
          if (parsed) {
            try {
              await fetch(`${config.resortos.baseUrl}/api/finance/manual-entries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-resortos-agent': 'true' },
                body: JSON.stringify({
                  amount: parsed.amount,
                  date: parsed.date,
                  bank: parsed.bank,
                  type: parsed.isExpense ? 'expense' : 'income',
                  label: parsed.label,
                  notes: trimmed
                })
              });
              const bankName = parsed.bank === 'mizrahi' ? 'מזרחי טפחות' : parsed.bank === 'discount' ? 'דיסקונט' : 'בינלאומי';
              const reply = `📝 *רשמתי לתחזית התזרים:*\n` +
                `🔹 סוג: ${parsed.isExpense ? 'הוצאה צפויה' : 'הכנסה צפויה'} (${parsed.kind})\n` +
                `🔹 סכום: ₪${Number(parsed.amount).toLocaleString('he-IL')}\n` +
                `🔹 תאריך: ${parsed.date}\n` +
                `🔹 בנק יעד: ${bankName}\n` +
                `🔹 תיאור: ${parsed.label}\n\n` +
                `ההשפעה עודכנה בתרחיש "בסיס + הנחות ידניות" בחמ״ל הפיננסי של ResortOS.`;
              await d.send(jid, reply);
              return { handled: true };
            } catch (e) {
              d.log.error({ err: String(e) }, 'Failed to record manual forecast entry');
            }
          }

          if (/^\s*(?:תזרים|יתרות|חמ[״"]?ל\s*פיננסי|מצב\s*בנקים|כמה\s*כסף\s*יש)\s*$/i.test(trimmed)) {
            try {
              const resp = await fetch(`${config.resortos.baseUrl}/api/finance/command-center`, {
                headers: { 'x-resortos-agent': 'true' }
              });
              if (resp.ok) {
                const data = (await resp.json()) as any;
                const settings = data.settings || {};
                const reply = `📊 *חמ״ל פיננסי — תמונת מצב מהירה:*\n\n` +
                  `🏦 *בנקים (מסגרת וביטחון):*\n` +
                  `• מזרחי: מסגרת ₪${Number(settings.banks?.mizrahi?.facility || 150000).toLocaleString('he-IL')} | כרית ₪${Number(settings.banks?.mizrahi?.safetyBuffer || 25000).toLocaleString('he-IL')}\n` +
                  `• דיסקונט: מסגרת ₪${Number(settings.banks?.discount?.facility || 100000).toLocaleString('he-IL')} | כרית ₪${Number(settings.banks?.discount?.safetyBuffer || 20000).toLocaleString('he-IL')}\n` +
                  `• בינלאומי: מסגרת ₪${Number(settings.banks?.beinleumi?.facility || 100000).toLocaleString('he-IL')} | כרית ₪${Number(settings.banks?.beinleumi?.safetyBuffer || 30000).toLocaleString('he-IL')}\n\n` +
                  `📋 *רישומים:*\n` +
                  `• שיקים במערכת: ${data.checks?.length || 0} שיקים\n` +
                  `• הנחות ידניות פעילות: ${data.manualEntries?.length || 0}\n` +
                  `• זיכויי בוקינג מוגדרים ל־${settings.bookingPayoutDay || 3} בכל חודש.\n\n` +
                  `לצפייה בגרף התזרים היומי המלא ל־120 יום והתראות מוקדמות:\nhttps://resortos.app/financials`;
                await d.send(jid, reply);
                return { handled: true };
              }
            } catch (_) {}
          }
        }
      }

      // 0. Active Session Fast-Paths and Flows
      if (currentSession?.state === 'AWAITING_PLACE') {
        const picked = (text?.trim() || '').match(/^([1-9][0-9]?)\.?$/);
        if (picked) {
          const id = currentSession.placeIds[Number(picked[1]) - 1];
          const detail = id ? await placeDetail(id) : '';
          const replyText = detail || 'המספר לא ברשימה. בחרו שוב.';
          if (currentSession.role === 'GUEST' && currentSession.bookingId) {
            void logGuestWhatsAppExchange({ id: currentSession.bookingId } as BookingRow, text?.trim() || '', replyText);
          }
          await d.send(jid, replyText);
          return { handled: true, transcript };
        }
        const roomId = 'roomId' in currentSession ? currentSession.roomId : undefined;
        if (currentSession.role === 'MANAGER' && roomId) {
          sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_ACTION', roomId });
        } else if (currentSession.role === 'CLEANER' && roomId) {
          sessionStates.set(sessionKey, { role: 'CLEANER', state: 'AWAITING_STATUS', roomId });
        } else {
          sessionStates.delete(sessionKey);
        }
        if (!text?.trim()) return { handled: true, transcript };
        return handleInboundInner(msg);
      }

      if (currentSession?.role === 'GUEST' && currentSession.state === 'AWAITING_CALL_CONFIRM') {
        const heard = (text?.trim() || '');
        const ans = confirmAnswer(heard);
        if (ans === 'yes' || /(?:תתקשר|להתקשר|תחזרו|תחזור|אשמח|כן|בטח|בבקשה)/i.test(heard)) {
          sessionStates.delete(sessionKey);
          const replyText = askByName(
            currentSession.guestName,
            NO_CALL_RE.test(heard) ? whatsappCallbackReply(detectGuestLang(heard)) : `בשמחה! העברנו את הבקשה לצוות המתחם ונחזור אליכם טלפונית בהקדם. 📞`
          );
          void logGuestWhatsAppExchange(
            { id: currentSession.bookingId, guest_phone: currentSession.guestPhone || senderPhone } as BookingRow,
            heard,
            replyText
          );
          if (d.resortos.requestGuestCall) {
            void d.resortos.requestGuestCall({
              bookingId: currentSession.bookingId,
              unitId: currentSession.unitId,
              guestName: currentSession.guestName,
              guestPhone: currentSession.guestPhone || displayPhone(senderPhone) || senderPhone,
              cabin: currentSession.roomName,
            });
          }
          await d.send(jid, replyText);
          return { handled: true, transcript };
        }
        if (ans === 'no') {
          sessionStates.delete(sessionKey);
          const replyText = askByName(
            currentSession.guestName,
            `בסדר גמור, אנחנו כאן לכל שאלה נוספת. שהות נעימה! 🌿`
          );
          void logGuestWhatsAppExchange(
            { id: currentSession.bookingId, guest_phone: currentSession.guestPhone || senderPhone } as BookingRow,
            heard,
            replyText
          );
          await d.send(jid, replyText);
          return { handled: true, transcript };
        }
        sessionStates.delete(sessionKey);
      }

      if (currentSession?.role === 'CLEANER') {
        if (currentSession.state === 'AWAITING_STATUS_CONFIRM') {
          if (!text && d.isAudio(msg)) {
            transcript = await d.transcribe(msg, cleaner?.language || 'he');
            text = transcript.text;
          }
          const heard = text?.trim() || '';
          if (!heard && d.isAudio(msg)) {
            await d.send(jid, askByName(cleaner?.name, lang === 'th' ? 'ไม่ได้ยินข้อความเสียงค่ะ ช่วยส่งอีกครั้งได้ไหมคะ' : 'לא שמעתי את ההקלטה. אפשר להקליט שוב או לכתוב?'));
            return { handled: true, transcript };
          }
          const taken = await takeStatusConfirm(heard, 'CLEANER', currentSession.roomId);
          if (taken) return { handled: taken !== 'failed', transcript };
          await d.send(jid, statusConfirmText(lang, formatRoomDisplay(currentSession.roomId, d.rooms()), currentSession.change));
          return { handled: true, transcript };
        }
        const trimmed = text?.trim() || '';
        if (currentSession.state === 'AWAITING_STATUS') {
          if (trimmed === '1' || trimmed === '1.' || trimmed === '๑' || confirmAnswer(trimmed) === 'yes') {
            sessionStates.delete(sessionKey);
            let apiOk = true;
            let skipped: string | undefined;
            try {
              const r = await d.resortos.markRoomReady({ unitId: currentSession.roomId, reportedBy: cleaner?.name || 'Staff' });
              if (!r.ok) skipped = r.skipped;
            } catch (e) {
              apiOk = false;
              d.log.error({ err: String(e) }, 'Fast-path markRoomReady failed');
            }
            if (skipped) return { handled: false, reason: skipped };
            if (!apiOk) {
              await d.send(jid, askByName(cleaner?.name, CLARIFY[lang]));
              return { handled: false, reason: 'resortos error' };
            }
            const reply = CLEANER_READY_THANKS[lang] || CLEANER_READY_THANKS.he;
            await d.send(jid, reply);
            return {
              handled: true,
              intent: {
                action: 'ROOM_READY',
                room_id: currentSession.roomId,
                room_raw: '',
                issue_description_hebrew: null,
                acknowledgement_reply_cleaner_language: reply,
              },
            };
          }
          if (trimmed === '2' || trimmed === '2.' || trimmed === '๒') {
            sessionStates.set(sessionKey, { role: 'CLEANER', state: 'AWAITING_SUPPLIES', roomId: currentSession.roomId });
            const reply = askByName(cleaner?.name, CLEANER_ASK_SUPPLIES[lang] || CLEANER_ASK_SUPPLIES.he);
            await d.send(jid, reply);
            return { handled: true };
          }
          if (trimmed === '3' || trimmed === '3.' || trimmed === '๓') {
            sessionStates.set(sessionKey, { role: 'CLEANER', state: 'AWAITING_MAINTENANCE', roomId: currentSession.roomId });
            const reply = askByName(cleaner?.name, CLEANER_ASK_MAINTENANCE[lang] || CLEANER_ASK_MAINTENANCE.he);
            await d.send(jid, reply);
            return { handled: true };
          }
          if (trimmed && await sendPlaceAnswer(trimmed, currentSession.roomId)) {
            return { handled: true, transcript };
          }
          // Voice or other free text falls through to normal intent extraction
          sessionStates.delete(sessionKey);
        } else if (currentSession.state === 'AWAITING_SUPPLIES') {
          if (!text && d.isAudio(msg)) {
            transcript = await d.transcribe(msg, cleaner?.language || 'he');
            text = transcript.text;
            if (['th', 'ar', 'he'].includes(transcript.language)) lang = transcript.language as Lang;
          }
          if (text?.trim()) {
            sessionStates.delete(sessionKey);
            await d.resortos.reportSupplies({ unitId: currentSession.roomId, description: text.trim(), reportedBy: cleaner?.name || 'Staff' });
            const reply = CLEANER_CONFIRM_SUPPLIES[lang] || CLEANER_CONFIRM_SUPPLIES.he;
            await d.send(jid, reply);
            return {
              handled: true,
              intent: {
                action: 'SUPPLIES_NEEDED',
                room_id: currentSession.roomId,
                room_raw: '',
                issue_description_hebrew: text.trim(),
                acknowledgement_reply_cleaner_language: reply,
              },
              transcript,
            };
          }
        } else if (currentSession.state === 'AWAITING_MAINTENANCE') {
          if (!text && d.isAudio(msg)) {
            transcript = await d.transcribe(msg, cleaner?.language || 'he');
            text = transcript.text;
            if (['th', 'ar', 'he'].includes(transcript.language)) lang = transcript.language as Lang;
          }
          if (text?.trim()) {
            sessionStates.delete(sessionKey);
            await d.resortos.reportMaintenance({ unitId: currentSession.roomId, description: text.trim(), reportedBy: cleaner?.name || 'Staff' });
            const reply = CLEANER_CONFIRM_MAINTENANCE[lang] || CLEANER_CONFIRM_MAINTENANCE.he;
            await d.send(jid, reply);
            return {
              handled: true,
              intent: {
                action: 'MAINTENANCE_ISSUE',
                room_id: currentSession.roomId,
                room_raw: '',
                issue_description_hebrew: text.trim(),
                acknowledgement_reply_cleaner_language: reply,
              },
              transcript,
            };
          }
        }
      }

      if (currentSession?.role === 'MANAGER') {
        if (!text && d.isAudio(msg)) {
          transcript = await d.transcribe(msg, cleaner?.language || 'he');
          text = transcript.text;
        }
        const trimmed = text?.trim() || '';

        if (currentSession.state === 'AWAITING_STATUS_CONFIRM') {
          if (!trimmed && d.isAudio(msg)) {
            await d.send(jid, askByName(cleaner?.name, 'לא שמעתי את ההקלטה. אפשר להקליט שוב או לכתוב?'));
            return { handled: true, transcript };
          }
          const taken = await takeStatusConfirm(trimmed, 'MANAGER', currentSession.roomId);
          if (taken) return { handled: taken !== 'failed', transcript };
          await d.send(jid, statusConfirmText(lang, formatRoomDisplay(currentSession.roomId, d.rooms()), currentSession.change));
          return { handled: true, transcript };
        }

        if (currentSession.state === 'AWAITING_HOLD_CONFIRM') {
          if (!trimmed && d.isAudio(msg)) {
            await d.send(jid, askByName(cleaner?.name, 'לא שמעתי את ההקלטה. אפשר להקליט שוב או לכתוב?'));
            return { handled: true, transcript };
          }
          const answer = confirmAnswer(trimmed);
          if (answer === 'yes') {
            const roomLabel = formatRoomDisplay(currentSession.roomId, d.rooms());
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_ACTION', roomId: currentSession.roomId });
            await d.send(jid, holdProgressText(roomLabel));
            startNightHold(currentSession.roomId);
            return { handled: true, transcript };
          }
          if (answer === 'no') {
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_ACTION', roomId: currentSession.roomId });
            await d.send(jid, `לא חסמתי את *${formatRoomDisplay(currentSession.roomId, d.rooms())}*.`);
            return { handled: true, transcript };
          }
          if (proposesNightHold(trimmed)) {
            await askHoldConfirm(currentSession.roomId);
            return { handled: true, transcript };
          }
          await d.send(jid, holdConfirmText(formatRoomDisplay(currentSession.roomId, d.rooms())));
          return { handled: true, transcript };
        }

        if (currentSession.state === 'AWAITING_PAYMENT_STATUS') {
          if (!trimmed && d.isAudio(msg)) {
            await d.send(jid, askByName(cleaner?.name, 'לא שמעתי את ההקלטה. אפשר להקליט שוב או לכתוב?'));
            return { handled: true, transcript };
          }
          const choice = paymentStatusChoice(trimmed);
          if (choice === 'keep') {
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_ACTION', roomId: currentSession.roomId });
            await d.send(jid, `השארתי את סטטוס התשלום כמו שהוא על *${formatRoomDisplay(currentSession.roomId, d.rooms())}*.`);
            return { handled: true, transcript };
          }
          if (choice === 'PARTIAL' || choice === 'PAID') {
            await applyPaymentStatus(currentSession.roomId, choice);
            return { handled: true, transcript };
          }
          await d.send(jid, askByName(cleaner?.name, paymentStatusQuestion()));
          return { handled: true, transcript };
        }

        if (currentSession.state === 'AWAITING_CASH_CONFIRM') {
          if (!trimmed && d.isAudio(msg)) {
            await d.send(jid, askByName(cleaner?.name, 'לא שמעתי את ההקלטה. אפשר להקליט שוב או לכתוב?'));
            return { handled: true, transcript };
          }
          const answer = confirmAnswer(trimmed);
          if (answer === 'yes') {
            await applyCash(currentSession.roomId, currentSession.shekels, currentSession.sourceText);
            return { handled: true, transcript };
          }
          if (answer === 'no') {
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_ACTION', roomId: currentSession.roomId });
            await d.send(jid, `לא רשמתי גבייה על *${formatRoomDisplay(currentSession.roomId, d.rooms())}*.`);
            return { handled: true, transcript };
          }
          const nextCash = proposeCashCollection(trimmed);
          if (nextCash) {
            await askCashConfirm(currentSession.roomId, nextCash.shekels, trimmed);
            return { handled: true, transcript };
          }
          const guest = await guestOnRoom(currentSession.roomId).catch(() => undefined);
          await d.send(jid, cashConfirmText(formatRoomDisplay(currentSession.roomId, d.rooms()), currentSession.shekels, guest?.guest_name || ''));
          return { handled: true, transcript };
        }

        if (currentSession.state === 'AWAITING_CLARIFICATION') {
          noteManagerTurn(trimmed);
          const remembered = resolveRoomWithContext(trimmed, d.rooms(), dialogContext(sessionKey));
          if (remembered.type === 'RESOLVED' && !bareUnitNumber(trimmed)) {
            await showManagerRoom(remembered.roomId, currentSession.pendingQuestion);
            return { handled: true, transcript };
          }
          const normalized = normalizeSpokenHebrewNumbers(trimmed);
          const choiceMatch = normalized.match(/^([1-9][0-9]?)\.?$/);
          if (choiceMatch) {
            const idx = parseInt(choiceMatch[1], 10);
            if (idx >= 1 && idx <= currentSession.candidateRoomIds.length) {
              const pickedRoomId = currentSession.candidateRoomIds[idx - 1];
              const ground = groundById(pickedRoomId);
              if (ground) {
                let status = ground.kind === 'pool' ? 'ok' : 'clean';
                let updatedBy = '';
                if (d.resortos.getGroundStatus) {
                  const row = await d.resortos.getGroundStatus(ground.id).catch(() => null);
                  if (row?.status) status = row.status;
                  updatedBy = row?.updatedBy || '';
                }
                sessionStates.delete(sessionKey);
                const now = groundStatusLabel(ground.kind, status) || status;
                const who = updatedBy ? `\nעודכן על ידי ${updatedBy}` : '';
                await d.send(jid, `${ground.label}\nסטטוס עכשיו: ${now}${who}`);
                return { handled: true, transcript };
              }
              const r = d.rooms().find((x) => x.id === pickedRoomId);
              const lockbox = r?.lockbox || '1357#';
              const today = getIsraelToday();
              const units = (await d.resortos.listUnits?.()) || [];
              const unit = units.find((u) => u.id === pickedRoomId);
              const bookings = (await d.resortos.listBookings?.({ from: today, to: today })) || [];
              const roomLabel = formatRoomDisplay(pickedRoomId, d.rooms());
              const occupancy = getRoomOccupancy(pickedRoomId, bookings, today);

              if (occupancy.activeBooking && d.resortos.publishBookingStay) {
                void d.resortos.publishBookingStay(occupancy.activeBooking).catch(() => {});
              }

              // Update session to this room
              rememberRoom(sessionKey, pickedRoomId);
              sessionStates.set(sessionKey, {
                role: 'MANAGER',
                state: 'AWAITING_ACTION',
                roomId: pickedRoomId,
                bookingId: occupancy.activeBooking?.id,
              });

              if (currentSession.pendingQuestion) {
                const answer = answerManagerRoomQuestion(currentSession.pendingQuestion, roomLabel, lockbox, unit, occupancy, r);
                if (answer) {
                  roomMenuShownAt.set(sessionKey, Date.now()); // menu-loop fix: same key as the lookup
                  await d.send(jid, `🔍 נבחר: *${roomLabel}*\n\n${withManagerActions(answer, roomLabel)}`);
                  return { handled: true, transcript };
                }
              }

              const initialCard = formatManagerInitialCard(roomLabel, lockbox, unit, occupancy, r);
              roomMenuShownAt.set(sessionKey, Date.now()); // menu-loop fix: same key as the lookup
              await d.send(jid, `🔍 נבחר: *${roomLabel}*\n\n${withManagerActions(initialCard, roomLabel)}`);
              return { handled: true, transcript };
            }
          }
          sessionStates.delete(sessionKey);
        }

        const roomLabel = 'roomId' in currentSession ? formatRoomDisplay(currentSession.roomId, d.rooms()) : '';

        if (currentSession.state === 'AWAITING_ACTION') {
          noteManagerTurn(trimmed);
          const greet = greetingReply(trimmed, cleaner?.name);
          if (greet) {
            await d.send(jid, greet);
            return { handled: true, transcript };
          }
          const cash = proposeCashCollection(trimmed);
          if (cash) {
            await askCashConfirm(currentSession.roomId, cash.shekels, trimmed);
            return { handled: true, transcript };
          }
          if (proposesNightHold(trimmed)) {
            await askHoldConfirm(currentSession.roomId);
            return { handled: true, transcript };
          }
          // Bug A (Ran 2026-10-20): a bare number answers the room menu shown last, never an older unit picker
          // ("נורית" → 1 → 1 → "נורית 3" → "1" must open Nurit 3's option 1, not Nurit 1).
          const menuAt = roomMenuShownAt.get(sessionKey);
          const isMenuNumber = /^\s*[1-9][0-9]?\.?\s*$/.test(normalizeSpokenHebrewNumbers(trimmed)) &&
            menuAt !== undefined && Date.now() - menuAt < ROOM_MENU_TTL_MS;
          const continued = isMenuNumber
            ? ({ type: 'NONE' } as const)
            : resolveRoomWithContext(trimmed, d.rooms(), dialogContext(sessionKey, currentSession.roomId));
          if (continued.type === 'RESOLVED' && continued.roomId !== currentSession.roomId) {
            await showManagerRoom(continued.roomId);
            return { handled: true, transcript };
          }
          // Check if manager is switching to another room (e.g. typing "B2", scanning QR, or asking about a different room)
          const otherRoomId = resolveRoomByAlias(trimmed, d.rooms());
          const fuzzySwitch = matchManagerRoomIntent(trimmed, d.rooms());
          // Menu-loop fix (Ran 2026-10-22): a bare menu number never switches rooms.
          if (!isMenuNumber && otherRoomId && otherRoomId !== currentSession.roomId) {
            sessionStates.delete(sessionKey);
          } else if (!isMenuNumber && fuzzySwitch.type === 'RESOLVED' && fuzzySwitch.roomId !== currentSession.roomId) {
            sessionStates.delete(sessionKey);
          } else if (!isMenuNumber && fuzzySwitch.type === 'AMBIGUOUS_COMPLEX') {
            sessionStates.delete(sessionKey);
          } else if (trimmed === '1' || trimmed === '1.' || /^שנה\s*סטטוס$|^עדכ[ןו]\s*סטטוס$|^סטטוס$/i.test(trimmed)) {
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'SELECT_STATUS', roomId: currentSession.roomId });
            await d.send(jid, managerStatusMenu(roomLabel));
            return { handled: true };
          } else if (trimmed === '7' || trimmed === '7.' || /^(?:התחל(?:י)?|להתחיל|סיים|סיימתי)\s*(?:את\s*ה?)?ניקיון$/i.test(trimmed)) {
            // Ran 2026-10-24: managers / ops managers can start cleaning from a room scan, then the same cleaner flow.
            const units = (await d.resortos.listUnits?.()) || [];
            const unit = units.find((u) => u.id === currentSession.roomId);
            const rr = d.rooms().find((x) => x.id === currentSession.roomId);
            const cleanLabel = rr?.name || rr?.letterCode || roomLabel;
            if (unit?.operational_status === 'IN_PROGRESS') {
              sessionStates.set(sessionKey, { role: 'CLEANER', state: 'AWAITING_STATUS', roomId: currentSession.roomId });
              await d.send(jid, CLEANER_EXIT_MENU.he(cleanLabel));
              return { handled: true, transcript };
            }
            sessionStates.delete(sessionKey);
            if (d.resortos.startCleaning) {
              await d.resortos.startCleaning({ unitId: currentSession.roomId, reportedBy: cleaningCredit(cleaner, 'מנהל') });
            }
            const lockboxCode = rr?.lockbox || '';
            const reply = `נרשם שהתחלת לנקות את ${cleanLabel} ✅\n🔑 קוד כספת מפתח: ${lockboxCode || 'לא מוגדר'}\n\n📲 בסיום הניקיון, יש לסרוק את ה-QR שוב ולבחור 7 כדי לעדכן סיום ולבדוק כיבוי אורות ומזגנים.`;
            await d.send(jid, reply);
            return {
              handled: true,
              intent: { action: 'CLEANING_STARTED', room_id: currentSession.roomId, room_raw: roomLabel, issue_description_hebrew: null, acknowledgement_reply_cleaner_language: reply },
              transcript,
            };
          } else if (trimmed === '4' || trimmed === '4.' || /^שלח(?:י|ו)?\s*קישור|^קישור\s*לאורח|^שליחת\s*קישור/i.test(trimmed)) {
            await beginGuestLink(currentSession.roomId);
            return { handled: true, transcript };
          } else if ((isMenuNumber || !/^\s*[56]\.?\s*$/.test(trimmed)) && roomMenuPick(trimmed)) {
            // Ran 2026-10-22: menu 5 = guest details, 6 = WiFi, for the room on screen only (manager session).
            const pick = roomMenuPick(trimmed);
            if (pick === 'wifi') {
              await d.send(jid, formatRoomWifi(roomLabel, currentSession.roomId));
            } else {
              const today = getIsraelToday();
              const bookings = (await d.resortos.listBookings?.({ from: today, to: today })) || [];
              await d.send(jid, formatGuestDetails(roomLabel, getRoomOccupancy(currentSession.roomId, bookings, today)));
            }
            return { handled: true, transcript };
          } else if (/^הערת אורח$/i.test(trimmed)) {
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_GUEST_NOTE', roomId: currentSession.roomId, bookingId: currentSession.bookingId });
            await d.send(jid, askByName(cleaner?.name, `כתוב את ההערה עבור אורח חדר ${roomLabel}: 👤`));
            return { handled: true };
          } else if (trimmed === '2' || trimmed === '2.' || /^הוסף\s*הערה$|^הערה$|^הערת חדר$/i.test(trimmed)) {
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_ROOM_NOTE', roomId: currentSession.roomId });
            await d.send(jid, askByName(cleaner?.name, `כתוב את ההערה עבור חדר ${roomLabel}: 📝`));
            return { handled: true };
          } else if (trimmed === '3' || trimmed === '3.' || /^דווח$|^אחזקה או חוסר$/i.test(trimmed)) {
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_ISSUE_KIND', roomId: currentSession.roomId });
            await d.send(jid, managerIssueMenu(roomLabel));
            return { handled: true };
          } else if (/^תקלה$/i.test(trimmed) || /^אחזקה$/i.test(trimmed)) {
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_MAINTENANCE', roomId: currentSession.roomId });
            await d.send(jid, askByName(cleaner?.name, `מה התקלה בחדר ${roomLabel}? (אפשר להקליט או לכתוב) 🛠️`));
            return { handled: true };
          } else if (/^חוסר$/i.test(trimmed)) {
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_SUPPLIES', roomId: currentSession.roomId });
            await d.send(jid, askByName(cleaner?.name, `מה חסר בחדר ${roomLabel}? (אפשר להקליט או לכתוב)`));
            return { handled: true };
          } else if (/^תקלה\s+(.+)$/i.test(trimmed) || /^אחזקה\s+(.+)$/i.test(trimmed)) {
            const desc = trimmed.match(/^(?:תקלה|אחזקה)\s+(.+)$/i)![1].trim();
            sessionStates.delete(sessionKey);
            await d.resortos.reportMaintenance({ unitId: currentSession.roomId, description: desc, reportedBy: cleaner?.name || 'מנהל' });
            const reply = `🛠️ דיווח התקלה נרשם ונפתחה קריאת תחזוקה לחדר ${roomLabel}:\n"${desc}"`;
            await d.send(jid, reply);
            return { handled: true, intent: { action: 'MAINTENANCE_ISSUE', room_id: currentSession.roomId, room_raw: roomLabel, issue_description_hebrew: desc, acknowledgement_reply_cleaner_language: reply }, transcript };
          } else if (/^(?:הערה|הערת חדר|הוסף הערה)\s+(.+)$/i.test(trimmed)) {
            const note = trimmed.match(/^(?:הערה|הערת חדר|הוסף הערה)\s+(.+)$/i)![1].trim();
            sessionStates.delete(sessionKey);
            if (d.resortos.updateUnitNote) {
              await d.resortos.updateUnitNote({ unitId: currentSession.roomId, note, reportedBy: cleaner?.name || 'מנהל' });
            }
            const reply = `📝 הערה נשמרה בהצלחה לחדר ${roomLabel}:\n"${note}"`;
            await d.send(jid, reply);
            return { handled: true, transcript };
          } else if (/^מוכן$|^אישור$|^מאשר$/i.test(trimmed) || proposeStatusChange(trimmed, d.rooms(), currentSession.roomId)) {
            const proposal = proposeStatusChange(trimmed, d.rooms(), currentSession.roomId)
              || { roomId: currentSession.roomId, change: 'ready' as const };
            await askStatusConfirm(proposal.roomId, proposal.change, 'MANAGER', trimmed);
            return { handled: true, transcript };
          } else {
            if (await sendPlaceAnswer(trimmed, currentSession.roomId)) {
              return { handled: true, transcript };
            }
            // Contextual Room Q&A
            const today = getIsraelToday();
            const bookings = (await d.resortos.listBookings?.({ from: today, to: today })) || [];
            const units = (await d.resortos.listUnits?.()) || [];
            const unit = units.find((u) => u.id === currentSession.roomId);
            const r = d.rooms().find((x) => x.id === currentSession.roomId);
            const lockbox = r?.lockbox || '1357#';
            const occupancy = getRoomOccupancy(currentSession.roomId, bookings, today);

            const exactHere = lookupExact(trimmed);
            const exactReply = exactHere ? exactStaticReply(exactHere) : null;
            if (exactReply) {
              await d.send(jid, exactReply);
              return { handled: true, transcript };
            }

            const rackRate = answerRackRate(trimmed, d.rooms(), currentSession.roomId);
            if (rackRate) {
              await d.send(jid, rackRate);
              return { handled: true, transcript };
            }

            const roomAnswer = answerManagerRoomQuestion(trimmed, roomLabel, lockbox, unit, occupancy, r);
            if (roomAnswer) {
              await d.send(jid, roomAnswer);
              // CRUCIAL: Do not delete session! Manager stays in context of this room
              return { handled: true };
            }

            sessionStates.delete(sessionKey);
          }
        } else if (currentSession.state === 'SELECT_STATUS') {
          sessionStates.delete(sessionKey);
          let status = '';
          let reason = '';
          let statusText = '';
          if (trimmed === '1') {
            status = 'READY';
            reason = 'מוכן לאורח';
            statusText = 'מוכן לאורח (READY) 🟢';
          } else if (trimmed === '2') {
            status = 'IN_PROGRESS';
            reason = 'בנקיון';
            statusText = 'בנקיון (IN_PROGRESS) 🟡';
          } else if (trimmed === '3') {
            status = 'DIRTY';
            reason = 'ממתין לניקיון';
            statusText = 'ממתין לניקיון (DIRTY) 🔴';
          } else if (trimmed === '4') {
            status = 'MAINTENANCE_ALERT';
            reason = 'תקלת תחזוקה';
            statusText = 'תקלת תחזוקה (MAINTENANCE) ⚠️';
          }

          if (status) {
            if (d.resortos.updateUnitStatus) {
              await d.resortos.updateUnitStatus({ unitId: currentSession.roomId, status, reason, reportedBy: cleaner?.name || 'מנהל' });
            } else if (status === 'READY') {
              await d.resortos.markRoomReady({ unitId: currentSession.roomId, reportedBy: cleaner?.name || 'מנהל' });
            }
            const reply = `✅ סטטוס חדר ${roomLabel} עודכן בהצלחה ל: ${statusText}`;
            await d.send(jid, reply);
            return { handled: true };
          }
        } else if (currentSession.state === 'AWAITING_ISSUE_KIND') {
          const maintenanceDesc = trimmed.match(/^(?:1|אחזקה|תקלה)(?:\s+(.+))?$/i);
          const supplyDesc = trimmed.match(/^(?:2|חוסר)(?:\s+(.+))?$/i);
          if (maintenanceDesc) {
            const desc = maintenanceDesc[1]?.trim();
            if (desc) {
              sessionStates.delete(sessionKey);
              await d.resortos.reportMaintenance({ unitId: currentSession.roomId, description: desc, reportedBy: cleaner?.name || 'מנהל' });
              await d.send(jid, `🛠️ דיווח התקלה נרשם ונפתחה קריאת תחזוקה לחדר ${roomLabel}:\n"${desc}"`);
              return { handled: true, transcript };
            }
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_MAINTENANCE', roomId: currentSession.roomId });
            await d.send(jid, askByName(cleaner?.name, `מה התקלה בחדר ${roomLabel}? (אפשר להקליט או לכתוב) 🛠️`));
            return { handled: true };
          }
          if (supplyDesc) {
            const desc = supplyDesc[1]?.trim();
            if (desc) {
              sessionStates.delete(sessionKey);
              await d.resortos.reportSupplies({ unitId: currentSession.roomId, description: desc, reportedBy: cleaner?.name || 'מנהל' });
              await d.send(jid, `📦 דיווח החוסר נרשם לחדר ${roomLabel}:\n"${desc}"`);
              return { handled: true, transcript };
            }
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_SUPPLIES', roomId: currentSession.roomId });
            await d.send(jid, askByName(cleaner?.name, `מה חסר בחדר ${roomLabel}? (אפשר להקליט או לכתוב)`));
            return { handled: true };
          }
          await d.send(jid, managerIssueMenu(roomLabel));
          return { handled: true };
        } else if (currentSession.state === 'AWAITING_SUPPLIES') {
          if (!text && d.isAudio(msg)) {
            transcript = await d.transcribe(msg, cleaner?.language || 'he');
            text = transcript.text;
          }
          if (text?.trim()) {
            sessionStates.delete(sessionKey);
            await d.resortos.reportSupplies({ unitId: currentSession.roomId, description: text.trim(), reportedBy: cleaner?.name || 'מנהל' });
            await d.send(jid, `📦 דיווח החוסר נרשם לחדר ${roomLabel}:\n"${text.trim()}"`);
            return { handled: true, transcript };
          }
        } else if (currentSession.state === 'AWAITING_GUEST_PICK') {
          const index = Number(trimmed) - 1;
          const choice = currentSession.choices[index];
          if (!choice) {
            await d.send(jid, guestLinkPickText(currentSession.choices));
            return { handled: true };
          }
          await confirmGuestLink(currentSession.roomId, choice);
          return { handled: true, transcript };
        } else if (currentSession.state === 'AWAITING_GUEST_PHONE') {
          const phone = phoneFromReply(trimmed);
          if (!phone) {
            await d.send(jid, `כתוב מספר נייד ישראלי עבור ${currentSession.guestName}.`);
            return { handled: true };
          }
          await confirmGuestLink(currentSession.roomId, {
            bookingId: currentSession.bookingId,
            phone,
            stayUrl: currentSession.stayUrl,
            guestName: currentSession.guestName,
            label: '',
          });
          return { handled: true, transcript };
        } else if (currentSession.state === 'AWAITING_GUEST_LINK') {
          const nextPhone = phoneFromReply(trimmed);
          if (nextPhone && nextPhone !== currentSession.phone) {
            await confirmGuestLink(currentSession.roomId, {
              bookingId: currentSession.bookingId,
              phone: nextPhone,
              stayUrl: currentSession.stayUrl,
              guestName: currentSession.guestName,
              label: '',
            });
            return { handled: true, transcript };
          }
          const answer = confirmAnswer(trimmed);
          if (answer === 'yes') {
            await deliverGuestLink(currentSession);
            return { handled: true, transcript };
          }
          if (answer === 'no') {
            stayAction(currentSession.roomId);
            await d.send(jid, 'לא שלחתי את הקישור.');
            return { handled: true, transcript };
          }
          await d.send(jid, guestLinkConfirm(currentSession.guestName, currentSession.phone));
          return { handled: true };
        } else if (currentSession.state === 'AWAITING_MAINTENANCE') {
          if (!text && d.isAudio(msg)) {
            transcript = await d.transcribe(msg, cleaner?.language || 'he');
            text = transcript.text;
          }
          if (text?.trim()) {
            sessionStates.delete(sessionKey);
            await d.resortos.reportMaintenance({ unitId: currentSession.roomId, description: text.trim(), reportedBy: cleaner?.name || 'מנהל' });
            const reply = `🛠️ דיווח התקלה נרשם ונפתחה קריאת תחזוקה לחדר ${roomLabel}:\n"${text.trim()}"`;
            await d.send(jid, reply);
            return { handled: true, intent: { action: 'MAINTENANCE_ISSUE', room_id: currentSession.roomId, room_raw: roomLabel, issue_description_hebrew: text.trim(), acknowledgement_reply_cleaner_language: reply }, transcript };
          }
        } else if (currentSession.state === 'AWAITING_ROOM_NOTE') {
          if (!text && d.isAudio(msg)) {
            transcript = await d.transcribe(msg, cleaner?.language || 'he');
            text = transcript.text;
          }
          if (text?.trim()) {
            sessionStates.delete(sessionKey);
            if (d.resortos.updateUnitNote) {
              await d.resortos.updateUnitNote({ unitId: currentSession.roomId, note: text.trim(), reportedBy: cleaner?.name || 'מנהל' });
            }
            const reply = `📝 הערה נשמרה בהצלחה לחדר ${roomLabel}:\n"${text.trim()}"`;
            await d.send(jid, reply);
            return { handled: true, transcript };
          }
        } else if (currentSession.state === 'AWAITING_GUEST_NOTE') {
          if (!text && d.isAudio(msg)) {
            transcript = await d.transcribe(msg, cleaner?.language || 'he');
            text = transcript.text;
          }
          if (text?.trim()) {
            sessionStates.delete(sessionKey);
            if (d.resortos.updateBookingNote && currentSession.bookingId) {
              await d.resortos.updateBookingNote({ bookingId: currentSession.bookingId, note: text.trim(), reportedBy: cleaner?.name || 'מנהל' });
            }
            const reply = `👤 הערה נשמרה בהצלחה עבור אורח חדר ${roomLabel}:\n"${text.trim()}"`;
            await d.send(jid, reply);
            return { handled: true, transcript };
          }
        }
      }

      if (!text && d.isAudio(msg)) {
        transcript = await d.transcribe(msg, cleaner?.language || 'he');
        text = transcript.text;
        if (['th', 'ar', 'he'].includes(transcript.language)) lang = transcript.language as Lang;
      }
      if (!text?.trim()) {
        if (d.isAudio(msg) && jid) {
          const missed = lang === 'th'
            ? 'ไม่ได้ยินข้อความเสียงค่ะ ช่วยส่งอีกครั้งได้ไหมคะ'
            : lang === 'ar'
              ? 'ما سمعت التسجيل. ممكن تعيد؟'
              : 'לא שמעתי את ההקלטה. אפשר להקליט שוב או לכתוב?';
          await d.send(jid, askByName(cleaner?.name, missed));
          return { handled: true, transcript };
        }
        // Guest ID photo without caption (Ran 2026-10-24): let it reach the identified-guest ID scan below.
        if (!(!cleaner && guestIdEnabled() && (msg.message as any)?.imageMessage)) {
          return { handled: false, reason: 'no text', transcript };
        }
        text = '';
      }

      const greet = cleaner ? greetingReply(text, cleaner.name) : null;
      if (greet && jid) {
        await d.send(jid, greet);
        return { handled: true, transcript };
      }
      // Bug 2 (Ran 2026-10-20): "מי נכנס לבתי נורית בסופ״ש" → per-complex arrivals, not a room picker.
      // Only one named complex per answer; never a summary of all units over WhatsApp.
      // Ran 2026-10-22: manager WiFi question (named complex -> SSID+password; unnamed -> ask, 10-min follow-up).
      if (isManager && jid) {
        const wifiReply = handleManagerWifi(sessionKey, text);
        if (wifiReply) {
          await d.send(jid, wifiReply);
          return { handled: true, transcript };
        }
      }
      if (isManager && jid && isStaffOpsQuestion(text)) {
        if (isComplexCheckinsQuestion(text)) {
          const bookings = (await d.resortos.listBookings?.()) || [];
          const answer = answerComplexCheckinsQuestion(text, d.rooms(), bookings, getIsraelToday());
          if (answer) {
            await d.send(jid, answer);
            return { handled: true, transcript };
          }
        }
        if (!matchComplex(text) && !resolveRoomByAlias(text, d.rooms())) {
          await d.send(jid, askByName(cleaner?.name, 'על איזה מתחם? (למשל "מי נכנס לבתי נורית בסופ״ש")'));
          return { handled: true, transcript };
        }
      }
      const looseCash = isManager ? proposeCashCollection(text) : null;
      if (looseCash && jid) {
        const roomId = currentSession && 'roomId' in currentSession ? currentSession.roomId : undefined;
        if (roomId) await askCashConfirm(roomId, looseCash.shekels, text);
        else await d.send(jid, askByName(cleaner?.name, 'על איזה חדר הגבייה?'));
        return { handled: true, transcript };
      }
      if (isManager && proposesNightHold(text) && jid) {
        const named = resolveRoomByAlias(text, d.rooms());
        const roomId = named || (currentSession && 'roomId' in currentSession ? currentSession.roomId : undefined);
        if (roomId) await askHoldConfirm(roomId);
        else await d.send(jid, askByName(cleaner?.name, 'על איזה חדר החסימה?'));
        return { handled: true, transcript };
      }

      const contextRoomId = currentSession && 'roomId' in currentSession ? currentSession.roomId : undefined;
      const proposal = cleaner ? proposeStatusChange(text, d.rooms(), contextRoomId) : null;
      if (proposal) {
        await askStatusConfirm(proposal.roomId, proposal.change, isManager ? 'MANAGER' : 'CLEANER', text);
        return { handled: true, transcript };
      }

      // 2. Manager QR image request: "שלח QR של B1", "QR B1", etc.
      const qrReqMatch = text.match(/(?:שלח\s+)?(?:תמונת\s+)?(?:qr|ברקוד|קוד\s*סריקה)\s*(?:של\s+)?(.+)?/i);
      if (qrReqMatch && isManager) {
        const queryRoom = qrReqMatch[1]?.trim();
        if (queryRoom) {
          let resolvedId = resolveRoomByAlias(queryRoom, d.rooms());
          if (!resolvedId) {
            const fuzzy = matchManagerRoomIntent(queryRoom, d.rooms());
            if (fuzzy.type === 'RESOLVED') resolvedId = fuzzy.roomId;
          }
          if (resolvedId) {
            const r = d.rooms().find((x) => x.id === resolvedId);
            if (r && d.sendImage) {
              const png = await generateRoomQrPng(r);
              const caption = `🔲 קוד QR לסריקה עבור חדר: ${r.letterCode || r.name}\n` +
                `📍 מתחם: ${r.property || ''}\n` +
                `🔑 קוד כספת מפתח: ${r.lockbox || 'ללא'}\n\n` +
                `📲 הנחיה לסריקה: 1. סורקים במצלמה  2. לוחצים "שלח" (Send ✈️) על ההודעה שמופיעה בווטסאפ.\n\n` +
                `מדבקת כספת רב-תכליתית: משמשת עובדים (הפעלת שעון ניקיון), מנהלים (כרטיס חדר מלא), ואורחים (קבלת קוד כספת ודף שהות).`;
              await d.sendImage(jid, png, caption);
              return { handled: true, transcript };
            }
          }
        }
      }

      // 2b. Manager Inspection Query: "מה ממתין לבדיקה", "מה ממתין לביקורת", "חדרים לביקורת", "מה לבדוק", "מי ממתין לבדיקה"
      const isInspectionQuery = isManager && /(?:מה|מי|איזה חדרים|אילו חדרים|יש חדרים)?\s*(?:ממתין|ממתינים|מחכה|מחכים|נשאר|נשארו|יש|צריך|חייב)?\s*ל?(?:בדיקה|ביקורת|אישור|לבדוק|לבקר)(?:\s+מנהל)?/i.test(text);
      if (isInspectionQuery && d.resortos.listUnits) {
        const all = await d.resortos.listUnits();
        const awaitingInspection = all.filter((u) =>
          u.operational_status === 'READY' &&
          (u.custom_reason === AWAITING_INSPECTION_REASON || u.custom_reason?.includes('ביקורת') || u.custom_reason?.includes('בדיקה'))
        );
        if (awaitingInspection.length === 0) {
          const reply = `🔍 *חדרים לביקורת מנהל:*\n` +
            `אין כרגע חדרים שממתינים לביקורת ✅\n(כל החדרים שנוקו כבר אושרו, או שטרם הסתיים ניקיונם).`;
          await d.send(jid, reply);
          return { handled: true, intent: { action: 'QUERY_STATUS', room_id: null, room_raw: text, issue_description_hebrew: null, acknowledgement_reply_cleaner_language: reply }, transcript };
        }
        const lines = awaitingInspection.map((u, i) => {
          const room = d.rooms().find((r) => r.id === u.id);
          const label = room?.name || room?.letterCode || formatRoomDisplay(u.id, d.rooms());
          const by = u.assigned_staff ? ` (נוקה ע״י ${u.assigned_staff})` : '';
          const code = room?.letterCode || u.id;
          return `${i + 1}. *${label}*${by}\n   👈 לאישור: *מוכן ${code}*`;
        });
        const reply = `🔍 *חדרים שממתינים לביקורת מנהל (${awaitingInspection.length}):*\n\n` +
          lines.join('\n\n') +
          `\n\n💡 _לאחר בדיקת החדר, כתוב "מוכן [שם/קוד חדר]" כדי לאשר אותו סופית לכניסת אורח._`;
        await d.send(jid, reply);
        return { handled: true, intent: { action: 'QUERY_STATUS', room_id: null, room_raw: text, issue_description_hebrew: null, acknowledgement_reply_cleaner_language: reply }, transcript };
      }

      // 2c. Manager Cleaning Query: "מה ממתין לניקיון", "מה מלוכלך", "חדרים לניקיון", "מה לנקות"
      const isCleaningQuery = isManager && /(?:מה|מי|איזה חדרים|אילו חדרים)?\s*(?:ממתין|ממתינים|מחכה|מחכים|נשאר|נשארו|יש|צריך)?\s*ל?ניקיון|חדרים\s+ל?ניקיון|מה\s+מלוכלך|חדרים\s+מלוכלכים/i.test(text);
      if (isCleaningQuery && d.resortos.listUnits) {
        const all = await d.resortos.listUnits();
        const today = getIsraelToday();
        const bookings = (await d.resortos.listBookings?.({ from: today, to: today })) || [];
        const checkOuts = bookings.filter((b) => b.check_out_date === today && b.booking_status !== 'CANCELED' && !b.deleted_at);
        const checkOutUnitIds = new Set(checkOuts.map((b) => b.unit_id));

        const inProg = all.filter((u) => u.operational_status === 'IN_PROGRESS');
        const dirtyUnitMap = new Map<string, UnitRow>();
        for (const u of all) {
          if (u.operational_status === 'DIRTY') {
            dirtyUnitMap.set(u.id, u);
          }
        }
        for (const outId of checkOutUnitIds) {
          const u = all.find((x) => x.id === outId);
          const isAwaiting = u?.operational_status === 'READY' && (u.custom_reason === AWAITING_INSPECTION_REASON || u.custom_reason?.includes('ביקורת'));
          const isApproved = u?.operational_status === 'READY' && (u.custom_reason === 'אושר ע״י מנהל' || u.custom_reason === 'טופל');
          const isInProg = u?.operational_status === 'IN_PROGRESS';
          if (!isAwaiting && !isApproved && !isInProg && !dirtyUnitMap.has(outId)) {
            dirtyUnitMap.set(outId, u || { id: outId, operational_status: 'DIRTY', custom_reason: 'יציאה היום' });
          }
        }

        const dirtyList = Array.from(dirtyUnitMap.values());
        let reply = `🧹 *סטטוס ניקיונות למנהל:*\n\n`;
        if (inProg.length > 0) {
          reply += `🟡 *בנקיון כרגע (${inProg.length}):*\n` +
            inProg.map((u) => `• ${formatRoomDisplay(u.id, d.rooms())}${u.assigned_staff ? ` | מנקה: ${u.assigned_staff}` : ''}`).join('\n') + `\n\n`;
        }
        if (dirtyList.length > 0) {
          reply += `🔴 *ממתינים לניקיון (${dirtyList.length}):*\n` +
            dirtyList.map((u) => `• ${formatRoomDisplay(u.id, d.rooms())}${u.custom_reason ? ` (${u.custom_reason})` : ''}`).join('\n');
        } else if (inProg.length === 0) {
          reply += `✨ אין כרגע חדרים שממתינים לניקיון! כל החדרים נקיים או מוכנים.`;
        }


        await d.send(jid, reply.trim());
        return { handled: true, intent: { action: 'QUERY_STATUS', room_id: null, room_raw: text, issue_description_hebrew: null, acknowledgement_reply_cleaner_language: reply }, transcript };
      }

      // 3. Worker explicit exit keyword check ("EXIT B1", "סיום B1", "סיימתי B1", "יציאה B1", or bare "סיום")
      const exitMatch = text.match(/^\s*(?:EXIT|DONE|FINISH|סיום|סיימתי|יציאה)(?:[_\s]+([a-zA-Z0-9_\-\u0590-\u05FF]+))?\s*$/i);
      if (exitMatch && isWorker && cleaner) {
        let targetRoomId = exitMatch[1] ? resolveRoomByAlias(exitMatch[1].replace(/_/g, ' '), d.rooms()) : null;
        if (!targetRoomId && d.resortos.listUnits) {
          const units = await d.resortos.listUnits();
          const myUnit = units.find((u) => u.assigned_staff === cleaner.name && u.operational_status === 'IN_PROGRESS');
          if (myUnit) targetRoomId = myUnit.id;
        }
        if (targetRoomId) {
          const r = d.rooms().find((x) => x.id === targetRoomId);
          sessionStates.set(sessionKey, { role: 'CLEANER', state: 'AWAITING_STATUS', roomId: targetRoomId });
          const roomLabel = cleaner.language === 'th' ? (r?.letterCode || r?.name || targetRoomId) : (r?.name || r?.letterCode || targetRoomId);
          const menuFn = CLEANER_EXIT_MENU[cleaner.language] || CLEANER_EXIT_MENU.he;
          const menuText = menuFn(roomLabel);
          await d.send(jid, menuText);
          return { handled: true, transcript };
        }
      }

      // 4. Scan or direct room query detection:
      // Examples: "START_B1", "START B1", "הגעתי ל-B1", "צ'ק אין B1", or manager typing "B1"
      let rawRoomCode: string | null = null;
      const qrScanMatch = text.match(/^\s*START[_\s]+([a-zA-Z0-9_\-\u0590-\u05FF]+)\s*$/i);
      const arrivalMatch = text.match(/^\s*(?:שלום[, ]*)?(?:הגעתי|צ['׳]?ק[- ]?אין|כניסה)\s+(?:ל|אל\s+)?(?:חדר|בקתה|סוויטה\s+)?([a-zA-Z0-9_\-\u0590-\u05FF]+)\s*$/i);
      const managerQueryMatch = isManager ? text.match(/^\s*(?:סטטוס|מצב|כרטיס|מידע)?\s*([a-zA-Z0-9_\-\u0590-\u05FF]{1,10})\s*$/i) : null;

      if (qrScanMatch) {
        rawRoomCode = qrScanMatch[1].replace(/_/g, ' ');
      } else if (arrivalMatch) {
        rawRoomCode = arrivalMatch[1].replace(/_/g, ' ');
      } else if (managerQueryMatch) {
        rawRoomCode = managerQueryMatch[1].replace(/_/g, ' ');
      }

      const resolvedId = rawRoomCode ? resolveRoomByAlias(rawRoomCode, d.rooms()) : null;

      if (resolvedId) {
        const r = d.rooms().find((x) => x.id === resolvedId);
        const lockbox = r?.lockbox || '1357#';
        const today = getIsraelToday();

        // ---- ROLE A: MANAGER ----
        if (isManager) {
          const units = (await d.resortos.listUnits?.()) || [];
          const unit = units.find((u) => u.id === resolvedId);
          const bookings = (await d.resortos.listBookings?.({ from: today, to: today })) || [];
          const roomLabel = formatRoomDisplay(resolvedId, d.rooms());
          const occupancy = getRoomOccupancy(resolvedId, bookings, today);

          if (occupancy.activeBooking && d.resortos.publishBookingStay) {
            void d.resortos.publishBookingStay(occupancy.activeBooking).catch(() => {});
          }

          // Register manager session for room context (questions & actions)
          rememberRoom(sessionKey, resolvedId);
          sessionStates.set(sessionKey, {
            role: 'MANAGER',
            state: 'AWAITING_ACTION',
            roomId: resolvedId,
            bookingId: occupancy.activeBooking?.id,
          });

          const managerReply = withManagerActions(formatManagerInitialCard(roomLabel, lockbox, unit, occupancy, r), roomLabel);

          roomMenuShownAt.set(sessionKey, Date.now()); // menu-loop fix: same key as the lookup
          await d.send(jid, managerReply);
          return {
            handled: true,
            intent: {
              action: 'QUERY_STATUS',
              room_id: resolvedId,
              room_raw: rawRoomCode ?? '',
              issue_description_hebrew: null,
              acknowledgement_reply_cleaner_language: managerReply,
            },
            transcript,
          };
        }

        // ---- ROLE B: STAFF / WORKER ----
        if (cleaner && !isManager) {
          const units = (await d.resortos.listUnits?.()) || [];
          const currentUnit = units.find((u) => u.id === resolvedId);
          // If unit is already IN_PROGRESS, worker scanning again triggers the exit menu!
          if (currentUnit?.operational_status === 'IN_PROGRESS') {
            sessionStates.set(sessionKey, { role: 'CLEANER', state: 'AWAITING_STATUS', roomId: resolvedId });
            const roomLabel = cleaner.language === 'th' ? (r?.letterCode || r?.name || '') : (r?.name || r?.letterCode || '');
            const menuFn = CLEANER_EXIT_MENU[cleaner.language] || CLEANER_EXIT_MENU.he;
            const menuText = menuFn(roomLabel);
            await d.send(jid, menuText);
            return { handled: true, transcript };
          }

          if (d.resortos.startCleaning) {
            await d.resortos.startCleaning({ unitId: resolvedId, reportedBy: cleaningCredit(cleaner) });
          }
          const roomLabel = cleaner.language === 'th' ? (r?.letterCode || r?.name || '') : (r?.name || r?.letterCode || '');
          let reply = '';
          if (cleaner.language === 'th') {
            reply = `บันทึกเรียบร้อยค่ะ: คุณ${cleaner.name} เริ่มทำความสะอาดห้อง ${roomLabel} แล้วค่ะ ✅\n🔑 รหัสตู้เซฟกุญแจ: ${lockbox || 'ไม่มี'}\n\n📲 เมื่อทำความสะอาดเสร็จแล้ว ให้สแกน QR Code อีกครั้ง เพื่อส่งรายงานและตรวจปิดไฟ/แอร์นะคะ`;
          } else if (cleaner.language === 'ar') {
            reply = `تم تسجيل بدء تنظيف غرفة ${roomLabel} بنجاح! ✅\n🔑 كود صندوق المفتاح: ${lockbox || 'غير محدد'}\n\n📲 عند الانتهاء من التنظيف، يرجى مسح رمز الـ QR مرة أخرى لتأكيد الإنهاء وإطفاء الأنوار والمكيفات.`;
          } else {
            reply = `נרשם שהתחלת לנקות את ${roomLabel} ✅\n🔑 קוד כספת מפתח: ${lockbox || 'לא מוגדר'}\n\n📲 בסיום הניקיון, יש לסרוק את ה-QR שוב כדי לעדכן סיום ולבדוק כיבוי אורות ומזגנים.`;
          }
          await d.send(jid, reply);
          return {
            handled: true,
            intent: {
              action: 'CLEANING_STARTED',
              room_id: resolvedId,
              room_raw: rawRoomCode ?? '',
              issue_description_hebrew: null,
              acknowledgement_reply_cleaner_language: reply,
            },
            transcript,
          };
        }

        // ---- ROLE C: GUEST / CUSTOMER ----
        const bookings = (await d.resortos.listBookings?.()) || [];
        const roomBooking = bookings.find((b) =>
          b.unit_id === resolvedId && phonesMatch(b.guest_phone, guestPhone) && !b.deleted_at && b.booking_status !== 'CANCELED'
        );
        const otherBooking = !roomBooking
          ? bookings.find((b) => phonesMatch(b.guest_phone, guestPhone) && !b.deleted_at && b.booking_status !== 'CANCELED')
          : undefined;

        if (otherBooking) {
          // Ran 2026-10-22: wrong-room QR never reveals the assigned room or any lockbox code.
          const reply = `שלום! 😊 נראה שקוד ה-QR שסרקתם לא תואם להזמנה שלכם.\n\n` +
            `אנא בדקו את השלט על דלת הבקתה, או השיבו כאן ומנהל המתחם יעזור לכם בהקדם 🏡`;
          void logGuestWhatsAppExchange(otherBooking, text || '', reply);
          await d.send(jid, reply);
          const wrongKey = `${otherBooking.id}|${resolvedId}|${getIsraelToday()}`;
          if (!wrongQrAlerted.has(wrongKey)) {
            wrongQrAlerted.add(wrongKey);
            const scanned = r?.name || r?.letterCode || resolvedId;
            const alert = `🔑 סריקת QR לא תואמת: ${otherBooking.guest_name || 'אורח'} סרק/ה את ${scanned}, שאינה היחידה שבהזמנה. נא לעזור לאורח.`;
            for (const m of alertRecipients(d.cleaners())) {
              await d.send(`${m.phone}@s.whatsapp.net`, alert).catch(() => {});
            }
          }
          return { handled: true, transcript };
        }

        if (roomBooking) {
          const checkIn = roomBooking.check_in_date || '';
          const checkOut = roomBooking.check_out_date || '';
          const isTodayOrStay = today >= checkIn && today <= checkOut;
          const isFuture = today < checkIn;
          const stayUrl = stayUrlOf(roomBooking);

          if (isTodayOrStay) {
            const units = (await d.resortos.listUnits?.()) || [];
            const unit = units.find((u) => u.id === resolvedId);
            const isReady = unit?.operational_status === 'READY';

            if (isReady && !r?.lockbox) {
              // Ran 2026-10-22: no configured code → never a default; manager handoff.
              await handoffToRan(`nocode|${roomBooking.id}`, { sender: roomBooking.guest_name || 'אורח', room: r?.name || resolvedId, text: text || '', why: 'אין קוד כספת מוגדר לחדר' });
              const reply = V.noCode();
              void logGuestWhatsAppExchange(roomBooking, text || '', reply);
              await d.send(jid, reply);
              return { handled: true, transcript };
            }
            if (isReady) {
              const reply = `ברוכים הבאים ל${r?.property || 'נופים בלבן'} 🌿\n` +
                `שמחים שהגעתם, בקתה ${r?.name || r?.letterCode} מוכנה ומחכה לכם!\n\n` +
                `🔑 *קוד כספת המפתח שלכם:* *${lockbox}*\n\n` +
                `📍 *הוראות פתיחת הכספת:*\n` +
                `1. הזינו את הקוד: *${lockbox}* בגלגלות / לחצנים.\n` +
                `2. לחצו על מתג הפתיחה ומשכו את מכסה הכספת כלפי מטה.\n` +
                `3. הוציאו את מפתח הבקתה.\n` +
                `4. ערבלו את הגלגלות וסגרו את מכסה הכספת.\n\n` +
                (stayUrl ? `📱 *דף האורח הדיגיטלי שלכם* (קוד WiFi, שירותים, אטרקציות וצ'ק-אאוט):\n${stayUrl}\n\n` : '') +
                `ℹ️ שעת צ'ק-אאוט: 11:00\n\n` +
                `מאחלים לכם חופשה נפלאה ושלווה! לכל בקשה או שאלה במהלך השהות, פשוט כתבו לנו כאן בווטסאפ 🏡`;
              void logGuestWhatsAppExchange(roomBooking, text, reply);
              await d.send(jid, reply);
              return { handled: true, transcript };
            } else {
              const reply = `בקתה ${r?.name || r?.letterCode} עדיין בהכנה. שעת צ'ק-אין היא מ-15:00 🌿\n\n` +
                `ברגע שהבקתה תהיה מוכנה ומאושרת ע״י המנהל, נשלח לכם לכאן אוטומטית הודעה עם קוד הכספת והוראות הכניסה!\n\n` +
                (stayUrl ? `בינתיים תוכלו להתעדכן בדף השהות הדיגיטלי שלכם:\n${stayUrl}\n\n` : '') +
                `לכל שאלה אנו זמינים כאן בווטסאפ.`;
              void logGuestWhatsAppExchange(roomBooking, text, reply);
              await d.send(jid, reply);
              return { handled: true, transcript };
            }
          } else if (isFuture) {
            const reply = `ההזמנה לבקתה ${r?.name || r?.letterCode} רשומה לתאריך ${checkIn}.\n` +
              `נשמח מאוד לארח אתכם במועד הגעתכם! 🌿\n\n` +
              (stayUrl ? `לצפייה בפרטי ההזמנה שלכם בדף האורח:\n${stayUrl}` : '');
            void logGuestWhatsAppExchange(roomBooking, text, reply);
            await d.send(jid, reply);
            return { handled: true, transcript };
          } else {
            const reply = `ההזמנה לבקתה ${r?.name || r?.letterCode} הסתיימה. שמחנו לארח אתכם 🌿`;
            void logGuestWhatsAppExchange(roomBooking, text, reply);
            await d.send(jid, reply);
            return { handled: true, transcript };
          }
        }

        // Neither staff, manager, nor guest with booking
        if (isStaffRoom(r)) {
          const reply = `מרחב זה (${r?.name || 'יחידה זו'}) הוא מגורי צוות, לא יחידת אירוח 🏡\n\n` +
            `אם הגעתם להתארח אצלנו, אנא השיבו להודעה זו עם שמכם המלא או מספר ההזמנה שלכם ונשמח להכווין אתכם לבקתה שלכם!`;
          await d.send(jid, reply);
          return { handled: true, transcript };
        }
        if (isOfficeRoom(r)) {
          const reply = `זה משרד ההנהלה והתפעול 🏢\n\n` +
            `לכל שאלה או סיוע בהזמנתכם, אנא השיבו להודעה זו ונשמח לעזור!`;
          await d.send(jid, reply);
          return { handled: true, transcript };
        }
        const roomLabel = alertRoomLabel(r);
        // Unidentified sender scanned a room QR (Ran 2026-10-22): ask whether they have a booking here today.
        const reply = V.askHasBooking(r?.name || r?.letterCode || roomLabel);
        sessionStates.set(sessionKey, { role: 'GUEST', state: 'VERIFY_HAS_BOOKING', roomId: resolvedId, pendingText: text || '', askedAt: Date.now() });
        await d.send(jid, reply);
        try {
          // One alert per scanner per 10 min; never a raw @lid; managers with noAlerts (אדם) are skipped.
          if (alertMemory.shouldAlert(normalizePhoneTail(senderPn || senderPhone) || jid)) {
            const alert = buildUnknownScanAlert(roomLabel, displaySender(jid, senderPn, d.cleaners()));
            for (const m of alertRecipients(d.cleaners())) {
              await d.send(`${m.phone}@s.whatsapp.net`, alert).then(() => alertMemory.remember(normalizePhoneTail(m.phone), alert)).catch(() => {});
            }
          }
        } catch { /* alert is best-effort */ }
        return { handled: true, transcript };
      }

      if (cleaner && text?.trim()) {
        if (/פנוי/.test(text) && matchManagerRoomIntent(text, d.rooms()).type === 'NONE') {
          const today = getIsraelToday();
          const bookings = (await d.resortos.listBookings?.({ from: today, to: today })) || [];
          const reply = formatVacantToday(d.rooms(), bookings, today);
          await d.send(jid, reply);
          return { handled: true, intent: { action: 'QUERY_STATUS', room_id: null, room_raw: text, issue_description_hebrew: null, acknowledgement_reply_cleaner_language: reply }, transcript };
        }
        const known = lookupExact(text);
        const staticReply = known ? exactStaticReply(known) : null;
        if (staticReply) {
          await d.send(jid, staticReply);
          return { handled: true, intent: { action: 'QUERY_STATUS', room_id: null, room_raw: text, issue_description_hebrew: null, acknowledgement_reply_cleaner_language: staticReply }, transcript };
        }
        const rackRate = answerRackRate(text.trim(), d.rooms());
        if (rackRate) {
          await d.send(jid, rackRate);
          return { handled: true, transcript };
        }
      }

      // 4b. Manager Fuzzy / Nickname / Complex Matching
      if (isManager) {
        noteManagerTurn(text || '');
        const fuzzy = resolveRoomWithContext(text, d.rooms(), dialogContext(sessionKey));
        if (fuzzy.type === 'RESOLVED') {
          const r = d.rooms().find((x) => x.id === fuzzy.roomId);
          const lockbox = r?.lockbox || '1357#';
          const today = getIsraelToday();
          const units = (await d.resortos.listUnits?.()) || [];
          const unit = units.find((u) => u.id === fuzzy.roomId);
          const bookings = (await d.resortos.listBookings?.({ from: today, to: today })) || [];
          const roomLabel = formatRoomDisplay(fuzzy.roomId, d.rooms());
          const occupancy = getRoomOccupancy(fuzzy.roomId, bookings, today);

          if (occupancy.activeBooking && d.resortos.publishBookingStay) {
            void d.resortos.publishBookingStay(occupancy.activeBooking).catch(() => {});
          }

          // Register manager session for room context (questions & actions)
          rememberRoom(sessionKey, fuzzy.roomId);
          sessionStates.set(sessionKey, {
            role: 'MANAGER',
            state: 'AWAITING_ACTION',
            roomId: fuzzy.roomId,
            bookingId: occupancy.activeBooking?.id,
          });

          // Check if manager asked a specific question about the room
          const specificAnswer = answerManagerRoomQuestion(text, roomLabel, lockbox, unit, occupancy, r);
          const body = specificAnswer || formatManagerInitialCard(roomLabel, lockbox, unit, occupancy, r);
          const managerReply = `🔍 זיהיתי: *${roomLabel}*\n\n${withManagerActions(body, roomLabel)}`;

          roomMenuShownAt.set(sessionKey, Date.now()); // menu-loop fix: same key as the lookup
          await d.send(jid, managerReply);
          return {
            handled: true,
            intent: {
              action: 'QUERY_STATUS',
              room_id: fuzzy.roomId,
              room_raw: text,
              issue_description_hebrew: null,
              acknowledgement_reply_cleaner_language: managerReply,
            },
            transcript,
          };
        } else if (fuzzy.type === 'AMBIGUOUS_COMPLEX') {
          const grounds = groundsForComplex(fuzzy.complex.key).map((asset) => ({
            id: asset.id,
            label: groundOptionLabel(asset),
          }));
          sessionStates.set(sessionKey, {
            role: 'MANAGER',
            state: 'AWAITING_CLARIFICATION',
            candidateRoomIds: [...fuzzy.candidateRooms.map((r) => r.id), ...grounds.map((asset) => asset.id)],
            pendingQuestion: text,
          });
          const unitStatuses: Record<string, string> = {};
          try {
            const today = getIsraelToday();
            const [units, bookings] = await Promise.all([
              d.resortos.listUnits?.() ?? Promise.resolve([]),
              d.resortos.listBookings?.({ from: today, to: today }) ?? Promise.resolve([]),
            ]);
            for (const r of fuzzy.candidateRooms) {
              const st = unitShortStatus((units || []).find((u) => u.id === r.id), getRoomOccupancy(r.id, bookings || [], today));
              if (st) unitStatuses[r.id] = st;
            }
          } catch {
            // status data unavailable: show the plain list
          }
          const prompt = askByName(cleaner?.name, formatComplexClarificationPrompt(
            fuzzy.complex.officialName,
            fuzzy.candidateRooms,
            d.rooms(),
            grounds,
            unitStatuses
          ));
          await d.send(jid, prompt);
          return { handled: true, transcript };
        } else if (fuzzy.type === 'AMBIGUOUS_NUMBER') {
          sessionStates.set(sessionKey, {
            role: 'MANAGER',
            state: 'AWAITING_CLARIFICATION',
            candidateRoomIds: fuzzy.candidateRooms.map((r) => r.id),
            pendingQuestion: text,
          });
          const prompt = askByName(cleaner?.name, formatNumberClarificationPrompt(fuzzy.number, fuzzy.candidateRooms, d.rooms()));
          await d.send(jid, prompt);
          return { handled: true, transcript };
        }
      }

      // If sender is unknown and did not specify a room
      if (!cleaner) {
        // Check if sender is an active guest with a booking in ResortOS
        const bookings = (await d.resortos.listBookings?.()) || [];
        const today = getIsraelToday();
        const guestBookings = bookings.filter((b) =>
          phonesMatch(b.guest_phone, guestPhone) && !b.deleted_at && b.booking_status !== 'CANCELED'
        );

        if (guestBookings.length > 0) {
          // Prioritize active booking (today is between check-in and check-out), then future bookings, then recent past
          guestBookings.sort((a, b) => {
            const aActive = today >= (a.check_in_date || '') && today <= (a.check_out_date || '');
            const bActive = today >= (b.check_in_date || '') && today <= (b.check_out_date || '');
            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;
            return (b.check_in_date || '').localeCompare(a.check_in_date || '');
          });

          const booking = guestBookings[0];
          const room = d.rooms().find((x) => x.id === booking.unit_id);
          const stayUrl = stayUrlOf(booking) || undefined;

          const ctx: GuestContext = {
            booking,
            room,
            unitId: booking.unit_id,
            roomName: room?.name || room?.letterCode || booking.unit_id,
            stayUrl,
            guestName: booking.guest_name,
          };

          // Guest ID scan (Ran 2026-10-24): a guest photo of an ID → Grok JSON → system decision, stored per booking
          // (decision + name only; never the image or number). Identified guest without ID → ask once in this conversation.
          if (guestIdEnabled()) {
            const gm: any = msg.message || {};
            const isImg = Boolean(gm.imageMessage || gm.documentWithCaptionMessage?.message?.documentMessage?.mimetype?.startsWith?.('image/'));
            if (isImg && d.downloadMedia) {
              try {
                const media = await d.downloadMedia(msg);
                if (media?.buffer?.length && /^image\//.test(media.mimetype || 'image/jpeg')) {
                  const r = await scanIdWithGrok(media.buffer, media.mimetype || 'image/jpeg', { bookingGuestName: booking.guest_name });
                  if (r.extraction?.document_type !== 'not_an_id' || hasGuestId(booking.id, booking as any) === false) {
                    if (r.extraction?.document_type !== 'not_an_id') saveGuestIdScan(booking.id, r);
                    const reply = idReplyFor(r);
                    d.log.info({ bookingId: booking.id, decision: r.decision, ok: r.ok }, 'guest id scan');
                    void logGuestWhatsAppExchange(booking, '[תמונת תעודה]', reply);
                    await d.send(jid, reply);
                    return { handled: true, transcript, reason: 'guest_id_scan' };
                  }
                }
              } catch (err) {
                d.log.warn({ bookingId: booking.id, err: String((err as any)?.message || err).slice(0, 80) }, 'guest id scan failed');
              }
            } else if (!hasGuestId(booking.id, booking as any) && shouldAskForId(booking.id)) {
              setTimeout(() => { void d.send(jid, ID_REQUEST_TEXT).catch(() => undefined); }, 1500).unref?.();
            }
          }

          // Late check-out (Ran 2026-10-22): never approve/deny, always SMS Ran. Follow-up "ב12:00 אפשרי?" counts too.
          {
            const nowLc = new Date();
            ctx.now = nowLc;
            const prevAsk = lastCheckoutAsk.get(sessionKey) || 0;
            const isLc = isLateCheckoutQuestion(text) || (nowLc.getTime() - prevAsk < 30 * 60 * 1000 && isLateCheckoutFollowUp(text));
            if (/צ['׳"]?ק[- ]?אאוט|check-?out|יציאה|לעזוב|לצאת/i.test(text || '')) lastCheckoutAsk.set(sessionKey, nowLc.getTime());
            if (isLc) {
              lastCheckoutAsk.set(sessionKey, nowLc.getTime());
              const lcReply = answerLateCheckout(text || '', ctx);
              void logGuestWhatsAppExchange(booking, text || '', lcReply);
              if (d.notifyManagerSms) {
                const sms = lateCheckoutManagerSms(text || '', ctx, guestPhone);
                void Promise.resolve(d.notifyManagerSms(sms)).then(
                  () => d.log.info({ bookingId: booking.id, unitId: booking.unit_id }, 'late-checkout manager SMS sent'),
                  (err: unknown) => d.log.warn({ bookingId: booking.id, err: String((err as any)?.message || err) }, 'late-checkout manager SMS failed'),
                );
              }
              await d.send(jid, lcReply);
              // Ran 2026-10-22: late check-out goes ONLY to Ran by SMS — never to Barak / staff / call desk.
              return { handled: true, transcript, reason: 'late_checkout' };
            }
          }

          // Bug 2 (Ran 2026-10-20): occupancy / arrivals questions are staff questions, never the guest fallback.
          if (isStaffOpsQuestion(text)) {
            void logGuestWhatsAppExchange(booking, text, STAFF_OPS_ONLY_REPLY);
            await d.send(jid, STAFF_OPS_ONLY_REPLY);
            return { handled: true, transcript };
          }

          const greet = greetingReply(text, booking.guest_name);
          if (greet) {
            void logGuestWhatsAppExchange(booking, text, greet);
            await d.send(jid, greet);
            return { handled: true, transcript };
          }

          if (await offerPlaceMenu(text, undefined, booking)) return { handled: true, transcript };

          const guestReply = answerGuestQuestion(text, ctx);
          if (guestReply) {
            void logGuestWhatsAppExchange(booking, text, guestReply);
            await d.send(jid, guestReply);
            return { handled: true, transcript };
          }

          if (/(?:תתקשר|להתקשר|תחזרו אלי|תחזור אלי|אפשר שיחה|שיחזרו אלי|דברו איתי)/i.test(text || '')) {
            const callReply = askByName(
              booking.guest_name,
              NO_CALL_RE.test(text || '') ? whatsappCallbackReply(detectGuestLang(text || '')) : `בשמחה! העברנו את הבקשה לצוות המתחם ונחזור אליכם טלפונית בהקדם. 📞`
            );
            void logGuestWhatsAppExchange(booking, text || '', callReply);
            if (d.resortos.requestGuestCall) {
              void d.resortos.requestGuestCall({
                bookingId: booking.id,
                unitId: booking.unit_id,
                guestName: booking.guest_name,
                guestPhone: booking.guest_phone || displayPhone(guestPhone) || guestPhone,
                cabin: ctx.roomName,
              });
            }
            await d.send(jid, callReply);
            return { handled: true, transcript };
          }

          // Helpful fallback when not matching a specific known query: ask if guest wants us to call them
          sessionStates.set(sessionKey, {
            role: 'GUEST',
            state: 'AWAITING_CALL_CONFIRM',
            bookingId: booking.id,
            unitId: booking.unit_id,
            roomName: ctx.roomName,
            guestName: booking.guest_name,
            guestPhone: booking.guest_phone || displayPhone(guestPhone) || guestPhone,
          });
          const fallbackReply = askByName(
            booking.guest_name,
            `אין לי תשובה מדויקת לשאלה הזו כרגע — תרצו שנתקשר אליכם? (השיבו *כן* ונחזור אליכם בהקדם 📞)`
          ) + `\n\n` +
            (stayUrl
              ? `בינתיים, כל המידע על שהותכם ב${ctx.roomName} (קוד WiFi, שער הישוב, הוראות ג'קוזי, מסעדות, אטרקציות וצ'ק-אאוט) זמין תמיד בדף האורח שלכם:\n📱 ${stayUrl}\n\n`
              : '') +
            `מאחלים לכם שהות נעימה ושלווה!`;
          void logGuestWhatsAppExchange(booking, text, fallbackReply);
          await d.send(jid, fallbackReply);
          return { handled: true, transcript };
        }

        // Check if an unknown prospective guest is inquiring about staff accommodation, retired units, or booking
        const prospectiveReply = answerGuestQuestion(text, {
          unitId: '',
          roomName: '',
          booking: {} as any,
        });
        if (prospectiveReply) {
          await d.send(jid, prospectiveReply);
          return { handled: true, transcript };
        }

        // Ran 2026-10-22: never drop an unidentified sender's message; start verification / handoff.
        if (text?.trim() && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'))) {
          sessionStates.set(sessionKey, { role: 'GUEST', state: 'VERIFY_HAS_BOOKING', pendingText: text, askedAt: Date.now() });
          await d.send(jid, V.askHasBookingGeneral());
          return { handled: true, reason: 'verify_ask_booking', transcript };
        }
        d.log.warn({ jid, senderPhone }, 'message from unknown number ignored');
        return { handled: false, reason: 'unknown sender', transcript };
      }

      // Security guard: Non-manager staff (cleaners, maintenance) must never receive financial information
      if (cleaner && !isManager) {
        if (/(?:^|[^\u0590-\u05FF])(?:האם\s+שולם|שולם|שולמה|שולמו|תשלום|תשלומים|לשלם|שילמתי|שילמו|שילם|מחיר|כמה עולה|כמה לשלם|עלות|סכום|יתרה|חוב|חשבונית|קבלה|payment|price|money|cost|balance|fee)(?:[^\u0590-\u05FF]|$)/i.test(text)) {
          let reply = '';
          if (lang === 'th') {
            reply = '🔒 ข้อมูลทางการเงินและสถานะการชำระเงินสามารถดูได้เฉพาะผู้จัดการเท่านั้นค่ะ';
          } else if (lang === 'ar') {
            reply = '🔒 المعلومات المالية وحالة الدفع متاحة للمديرين فقط.';
          } else {
            reply = '🔒 מידע פיננסי, עלויות וסטטוס תשלומים נגישים למנהלי המערכת בלבד.';
          }
          await d.send(jid, reply);
          return { handled: true, transcript };
        }
      }

      if (cleaner && text?.trim()) {
        const roomId = currentSession && 'roomId' in currentSession ? currentSession.roomId : undefined;
        if (await sendPlaceAnswer(text, roomId)) return { handled: true, transcript };
      }

      const exactKind = text?.trim() ? lookupExact(text) : null;
      const intent = exactKind === 'daily' && isManager
        ? { action: 'QUERY_STATUS' as const, room_id: null, room_raw: text, issue_description_hebrew: null, acknowledgement_reply_cleaner_language: '' }
        : await d.llm.extractIntent(text, lang, d.rooms());
      d.log.info({ cleaner: cleaner.name, action: intent.action, room: intent.room_id }, 'intent extracted');

      // Check if cleaner is specifically inquiring about the key safe / lockbox code
      if (intent.room_id && LOCKBOX_QUERY_REGEX.test(text)) {
        const r = d.rooms().find((x) => x.id === intent.room_id);
        const lockbox = r?.lockbox;
        let reply = '';
        if (lang === 'th') {
          reply = lockbox ? `รหัสตู้เซฟห้อง ${r?.letterCode || r?.name || ''} คือ ${lockbox} ค่ะ` : 'ไม่มีข้อมูลรหัสตู้เซฟสำหรับห้องนี้ค่ะ';
        } else if (lang === 'ar') {
          reply = lockbox ? `كود صندوق المفتاح لغرفة ${r?.name || ''} هو ${lockbox}.` : 'لا يوجد كود خزنة مسجل لهذه الغرفة.';
        } else {
          reply = lockbox ? `קוד כספת מפתח עבור ${r?.name || ''} הוא ${lockbox}.` : 'אין קוד כספת מוגדר עבור חדר זה.';
        }
        await d.send(jid, reply);
        return { handled: true, intent, transcript };
      }

      // Every room-specific report needs a resolved unit. Otherwise ask the worker to say the complex/letter + number.
      const actionable = intent.action === 'ROOM_READY' || intent.action === 'CLEANING_STARTED' || intent.action === 'MAINTENANCE_ISSUE' || intent.action === 'SUPPLIES_NEEDED';
      if (actionable && !intent.room_id) {
        await d.send(jid, askByName(cleaner?.name, ASK_ROOM[lang]));
        return { handled: false, intent, transcript, reason: 'room unresolved' };
      }

      if (intent.room_id && (intent.action === 'ROOM_READY' || intent.action === 'CLEANING_STARTED')) {
        if (intent.action === 'ROOM_READY' && !textHasStatusWord(text)) {
          if (isManager) {
            await showManagerRoom(intent.room_id);
          } else if (jid) {
            await d.send(jid, `שמעתי: ${text.trim()}\nלא שיניתי סטטוס.`);
          }
          return { handled: true, intent, transcript };
        }
        await askStatusConfirm(intent.room_id, intent.action === 'CLEANING_STARTED' ? 'cleaning' : 'ready', isManager ? 'MANAGER' : 'CLEANER', text);
        return { handled: true, intent, transcript };
      }

      let apiOk = true;
      let skipped: string | undefined;
      let statusReply: string | undefined;
      try {
        const by = cleaningCredit(cleaner);
        const desc = intent.issue_description_hebrew ?? text;
        if (intent.action === 'ROOM_READY') {
          const r = await d.resortos.markRoomReady({ unitId: intent.room_id!, reportedBy: by });
          if (!r.ok) skipped = r.skipped;
        } else if (intent.action === 'CLEANING_STARTED') {
          if (d.resortos.startCleaning) {
            const r = await d.resortos.startCleaning({ unitId: intent.room_id!, reportedBy: by });
            if (!r.ok) skipped = r.skipped;
          }
          const roomObj = d.rooms().find((x) => x.id === intent.room_id);
          const lockbox = roomObj?.lockbox;
          const roomLabel = lang === 'th'
            ? (roomObj?.letterCode || formatRoomDisplay(intent.room_id!, d.rooms()))
            : formatRoomDisplay(intent.room_id!, d.rooms());
          if (lang === 'th') {
            statusReply = `บันทึกเรียบร้อยค่ะ: คุณ${by} เริ่มทำความสะอาดห้อง ${roomLabel} แล้วค่ะ ✅` +
              (lockbox ? `\n🔑 รหัสตู้เซฟกุญแจ: ${lockbox}` : '');
          } else if (lang === 'ar') {
            statusReply = `أهلاً ${by}، تم تسجيل بدء تنظيف غرفة ${roomLabel} بنجاح! ✅` +
              (lockbox ? `\n🔑 كود صندوق المفتاح: ${lockbox}` : '');
          } else {
            statusReply = `נרשם שהתחלת לנקות את חדר ${roomLabel} ✅` +
              (lockbox ? `\n🔑 קוד כספת מפתח: ${lockbox}` : '');
          }
        } else if (intent.action === 'MAINTENANCE_ISSUE') {
          await d.resortos.reportMaintenance({ unitId: intent.room_id!, description: desc, reportedBy: by });
        } else if (intent.action === 'SUPPLIES_NEEDED') {
          await d.resortos.reportSupplies({ unitId: intent.room_id!, description: desc, reportedBy: by });
        } else if (intent.action === 'QUERY_STATUS' && d.resortos.listUnits) {
          const all = await d.resortos.listUnits();
          if (cleaner.role === 'MANAGER' || cleaner.role === 'OPS_MANAGER' || cleaner.role === 'PRIORITY') {
            const today = getIsraelToday();
            const bookings = (await d.resortos.listBookings?.({ from: today, to: today })) || [];
            statusReply = formatVacantToday(d.rooms(), bookings, today);
          } else {
            // HOUSEKEEPING: only rooms assigned to this cleaner OR unassigned rooms needing cleaning.
            // Also include checkout departures from today that haven't been started
            const dirtyIds = new Set(
              all.filter((u) => u.operational_status === 'DIRTY' || u.operational_status === 'IN_PROGRESS').map((u) => u.id)
            );
            const today = getIsraelToday();
            const bookings = (await d.resortos.listBookings?.({ from: today, to: today })) || [];
            const checkOuts = bookings.filter((b) => b.check_out_date === today && b.booking_status !== 'CANCELED' && !b.deleted_at);
            for (const b of checkOuts) {
              const u = all.find((x) => x.id === b.unit_id);
              const isDone = u?.operational_status === 'READY';
              if (!isDone) dirtyIds.add(b.unit_id);
            }

            const myRooms = all.filter((u) => {
              if (!dirtyIds.has(u.id)) return false;
              if (u.operational_status === 'IN_PROGRESS') return u.assigned_staff === cleaner.name;
              return true;
            });
            if (!myRooms.length) {
              statusReply = lang === 'th' ? 'ไม่มีห้องที่ต้องทำความสะอาดในขณะนี้ค่ะ' : (lang === 'ar' ? 'ما في غرف بحاجة لتنظيف حالياً.' : 'אין כרגע חדרים שממתינים לניקיון.');
            } else {
              const list = myRooms
                .map((u) => {
                  const formatted = formatRoomForWorker(u.id, lang, d.rooms());
                  const mine = u.operational_status === 'IN_PROGRESS' && u.assigned_staff === cleaner.name;
                  return `${formatted}${mine ? (lang === 'th' ? ' (ของคุณ)' : ' (שלך)') : ''}`;
                })
                .join('\n• ');
              statusReply = lang === 'th'
                ? `ห้องที่ต้องทำความสะอาด:\n• ${list}`
                : (lang === 'ar' ? `الغرف للتنظيف:\n• ${list}` : `חדרים לניקיון:\n• ${list}`);
            }
          }
        }
      } catch (e) {
        apiOk = false;
        d.log.error({ err: String(e) }, 'ResortOS sync failed');
      }

      if (skipped) {
        d.log.warn({ unit: intent.room_id, skipped }, `${intent.action} not applied`);
        return { handled: false, intent, transcript, reason: skipped };
      }
      if (apiOk) {
        const rawReply = statusReply || intent.acknowledgement_reply_cleaner_language || '';
        const reply = rawReply
          ? rawReply.replace(/^(?:שלום|היי|הי|hello|hi|أهلاً|أهلا)\b[!,.،\s]*/i, '').trim()
          : askByName(cleaner?.name, CLARIFY[lang]);
        await d.send(jid, /[?؟]$/.test(reply) ? askByName(cleaner?.name, reply) : reply);
      }
      return { handled: apiOk, intent, transcript, reason: apiOk ? undefined : 'resortos error' };
    } catch (e) {
      d.log.error({ err: String(e) }, 'inbound processing failed');
      await d.send(jid, askByName(cleaner?.name, CLARIFY[lang])).catch(() => {});
      return { handled: false, reason: String(e), transcript };
    }
  }

  /** ResortOS -> agent -> worker. Body: { cleaner_phone, message_he, action?, type?, room_id?, channel_id? } */
  async function handleDispatch(body: { cleaner_phone?: string; message_he?: string; action?: string; type?: string; room_id?: string; channel_id?: ChannelId }) {
    const channelId = body.channel_id || 'resortos';
    return channelStorage.run(channelId, async () => {
      const phone = body.cleaner_phone?.replace(/\D/g, '');
      if (!phone) throw Object.assign(new Error('cleaner_phone required'), { status: 400 });
      const cleaner = d.cleaners().find((c) => matchesCleaner(c, phone));
      if (!cleaner) throw Object.assign(new Error('unknown cleaner'), { status: 404 });

      if ((body.action === 'ROOM_EXIT' || body.type === 'ROOM_EXIT') && body.room_id) {
        return triggerRoomExit({ cleanerPhone: phone, roomId: body.room_id, channelId });
      }

      if (!body.message_he?.trim()) throw Object.assign(new Error('cleaner_phone and message_he required'), { status: 400 });

      // If manager refers to a room, resolve it to attach the key safe lockbox code if available
      let msg = body.message_he;
      const resolvedId = resolveRoomByAlias(body.message_he, d.rooms());
      if (resolvedId) {
        const r = d.rooms().find((x) => x.id === resolvedId);
        if (r?.lockbox && !msg.includes(r.lockbox)) {
          if (cleaner.language === 'th') {
            msg += ` (รหัสตู้เซฟ ${r.letterCode || ''}: ${r.lockbox})`;
          } else if (cleaner.language === 'ar') {
            msg += ` (كود الخزنة: ${r.lockbox})`;
          } else {
            msg += ` (קוד כספת: ${r.lockbox})`;
          }
        }
      }

      const translated = await d.llm.translateTask(msg, cleaner.language);
      await d.send(`${cleaner.phone}@s.whatsapp.net`, translated);
      return { sent: true, language: cleaner.language, translated };
    });
  }

  return {
    handleInbound,
    handleDispatch,
    triggerRoomExit,
    getSession,
    setSession,
    clearSession,
  };
}
