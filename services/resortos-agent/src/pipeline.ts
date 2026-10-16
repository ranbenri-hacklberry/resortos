import type { WAMessage } from '@whiskeysockets/baileys';
import { config, isStaffRoom, isOfficeRoom, type CleanerProfile, type Lang, type RoomEntry } from './config.js';
import type { InboundIntent } from './llm/client.js';
import { resolveRoomByAlias } from './llm/client.js';
import { AWAITING_INSPECTION_REASON, type ReadyResult, type BookingRow, type UnitRow } from './integration/resortos.js';
import type { Transcript } from './whatsapp/media.js';
import { generateRoomQrPng } from './whatsapp/qrGenerator.js';
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
  managerActionMenu,
  managerStatusMenu,
} from './llm/prompts.js';
import { answerGuestQuestion, type GuestContext } from './guest/guestKnowledge.js';
import { answerRackRate } from './pricing/priceList.js';
import {
  formatManagerInitialCard,
  answerManagerRoomQuestion,
  getRoomOccupancy,
} from './manager/managerQuestions.js';
import {
  matchManagerRoomIntent,
  normalizeSpokenHebrewNumbers,
  formatComplexClarificationPrompt,
  formatNumberClarificationPrompt,
} from './manager/managerFuzzyMatcher.js';

export type CleanerSessionState =
  | { role: 'CLEANER'; state: 'AWAITING_STATUS'; roomId: string }
  | { role: 'CLEANER'; state: 'AWAITING_SUPPLIES'; roomId: string }
  | { role: 'CLEANER'; state: 'AWAITING_MAINTENANCE'; roomId: string };

export type ManagerSessionState =
  | { role: 'MANAGER'; state: 'AWAITING_ACTION'; roomId: string; bookingId?: string }
  | { role: 'MANAGER'; state: 'SELECT_STATUS'; roomId: string }
  | { role: 'MANAGER'; state: 'AWAITING_MAINTENANCE'; roomId: string }
  | { role: 'MANAGER'; state: 'AWAITING_ROOM_NOTE'; roomId: string }
  | { role: 'MANAGER'; state: 'AWAITING_GUEST_NOTE'; roomId: string; bookingId?: string }
  | { role: 'MANAGER'; state: 'AWAITING_CLARIFICATION'; candidateRoomIds: string[]; pendingQuestion?: string };

export type SessionState = CleanerSessionState | ManagerSessionState;

/** Narrow interfaces so everything is mockable in tests. */
export interface PipelineDeps {
  send: (jid: string, text: string) => Promise<void>;
  sendImage?: (jid: string, buffer: Buffer, caption?: string) => Promise<void>;
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
    markRoomReady(p: { unitId: string; reportedBy: string }): Promise<ReadyResult>;
    approveRoomByManager?(p: { unitId: string; reportedBy: string }): Promise<ReadyResult>;
    startCleaning?(p: { unitId: string; reportedBy: string }): Promise<ReadyResult>;
    updateUnitStatus?(p: { unitId: string; status: string; reason?: string; reportedBy: string }): Promise<unknown>;
    updateUnitNote?(p: { unitId: string; note: string; reportedBy: string }): Promise<unknown>;
    updateBookingNote?(p: { bookingId: string; note: string; reportedBy: string }): Promise<unknown>;
    reportMaintenance(p: { unitId: string; description: string; reportedBy: string }): Promise<unknown>;
    reportSupplies(p: { unitId: string; description: string; reportedBy: string }): Promise<unknown>;
  };
  cleaners: () => CleanerProfile[];
  rooms: () => RoomEntry[];
  log: { info: (...a: any[]) => void; warn: (...a: any[]) => void; error: (...a: any[]) => void };
}

export const phoneOf = (jid: string) => jid.split('@')[0].split(':')[0];

export function normalizePhoneTail(raw?: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('972')) return digits.slice(3).slice(-9);
  if (digits.startsWith('0')) return digits.slice(1).slice(-9);
  return digits.slice(-9);
}

export function phonesMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const tailA = normalizePhoneTail(a);
  const tailB = normalizePhoneTail(b);
  return Boolean(tailA && tailB && tailA.length >= 7 && tailA === tailB);
}

export function getIsraelToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

const CLARIFY: Record<Lang, string> = {
  th: 'ขออภัยค่ะ ไม่เข้าใจ รบกวนส่งอีกครั้งนะคะ',
  ar: 'عذراً، ما فهمت عليك. ممكن تعيد الرسالة؟',
  he: 'סליחה, לא הבנתי. אפשר לשלוח שוב?',
};

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

export function createPipeline(d: PipelineDeps) {
  const sessionStates = new Map<string, SessionState>();
  const getSession = (phone: string) => sessionStates.get(normalizePhoneTail(phone));
  const setSession = (phone: string, s: SessionState) => sessionStates.set(normalizePhoneTail(phone), s);
  const clearSession = (phone: string) => sessionStates.delete(normalizePhoneTail(phone));

  async function triggerRoomExit(p: { cleanerPhone: string; roomId: string }): Promise<{ ok: boolean; message?: string }> {
    const cleaner = d.cleaners().find((c) => phonesMatch(c.phone, p.cleanerPhone));
    if (!cleaner) return { ok: false, message: 'cleaner not found' };
    const r = d.rooms().find((x) => x.id === p.roomId);
    const roomLabel = cleaner.language === 'th' ? (r?.letterCode || r?.name || p.roomId) : (r?.name || r?.letterCode || p.roomId);
    setSession(cleaner.phone, { role: 'CLEANER', state: 'AWAITING_STATUS', roomId: p.roomId });
    const menuFn = CLEANER_EXIT_MENU[cleaner.language] || CLEANER_EXIT_MENU.he;
    const menuText = menuFn(roomLabel);
    await d.send(`${cleaner.phone}@s.whatsapp.net`, menuText);
    return { ok: true, message: menuText };
  }

  /** Worker -> agent. */
  async function handleInbound(msg: WAMessage): Promise<InboundResult> {
    const jid = msg.key.remoteJid;
    if (!jid) return { handled: false, reason: 'no jid' };
    const senderPhone = phoneOf(jid);
    const cleaner = d.cleaners().find((c) => phonesMatch(c.phone, senderPhone));
    const isManager = cleaner?.role === 'MANAGER' || cleaner?.role === 'OPS_MANAGER';
    const isWorker = Boolean(cleaner && !isManager);
    const sessionKey = normalizePhoneTail(senderPhone);
    const currentSession = sessionStates.get(sessionKey);

    let text = d.extractText(msg);
    let transcript: Transcript | undefined;
    let lang: Lang = cleaner?.language || 'he';
    try {
      // 0A. Manager Financial Command Center Flows (WhatsApp Check Capture & Forecast)
      if (isManager) {
        const pendingCheck = getPendingCheck(senderPhone);
        if (pendingCheck) {
          const trimmed = text?.trim() || '';
          if (/^(?:כן|אישור|מאשר|1|אישור שיק|בסדר|מאושר)$/i.test(trimmed)) {
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
      if (currentSession?.role === 'CLEANER') {
        const trimmed = text?.trim() || '';
        if (currentSession.state === 'AWAITING_STATUS') {
          if (trimmed === '1' || trimmed === '1.' || trimmed === '๑') {
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
              await d.send(jid, CLARIFY[lang]);
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
            const reply = CLEANER_ASK_SUPPLIES[lang] || CLEANER_ASK_SUPPLIES.he;
            await d.send(jid, reply);
            return { handled: true };
          }
          if (trimmed === '3' || trimmed === '3.' || trimmed === '๓') {
            sessionStates.set(sessionKey, { role: 'CLEANER', state: 'AWAITING_MAINTENANCE', roomId: currentSession.roomId });
            const reply = CLEANER_ASK_MAINTENANCE[lang] || CLEANER_ASK_MAINTENANCE.he;
            await d.send(jid, reply);
            return { handled: true };
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

        if (currentSession.state === 'AWAITING_CLARIFICATION') {
          const normalized = normalizeSpokenHebrewNumbers(trimmed);
          const choiceMatch = normalized.match(/^([1-9][0-9]?)\.?$/);
          if (choiceMatch) {
            const idx = parseInt(choiceMatch[1], 10);
            if (idx >= 1 && idx <= currentSession.candidateRoomIds.length) {
              const pickedRoomId = currentSession.candidateRoomIds[idx - 1];
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
              sessionStates.set(sessionKey, {
                role: 'MANAGER',
                state: 'AWAITING_ACTION',
                roomId: pickedRoomId,
                bookingId: occupancy.activeBooking?.id,
              });

              if (currentSession.pendingQuestion) {
                const answer = answerManagerRoomQuestion(currentSession.pendingQuestion, roomLabel, lockbox, unit, occupancy, r);
                if (answer) {
                  await d.send(jid, `🔍 נבחר: *${roomLabel}*\n\n${answer}`);
                  return { handled: true, transcript };
                }
              }

              const initialCard = formatManagerInitialCard(roomLabel, lockbox, unit, occupancy, r);
              await d.send(jid, `🔍 נבחר: *${roomLabel}*\n\n${initialCard}`);
              return { handled: true, transcript };
            }
          }
          sessionStates.delete(sessionKey);
        }

        const roomLabel = 'roomId' in currentSession ? formatRoomDisplay(currentSession.roomId, d.rooms()) : '';

        if (currentSession.state === 'AWAITING_ACTION') {
          // Check if manager is switching to another room (e.g. typing "B2", scanning QR, or asking about a different room)
          const otherRoomId = resolveRoomByAlias(trimmed, d.rooms());
          const fuzzySwitch = matchManagerRoomIntent(trimmed, d.rooms());
          if (otherRoomId && otherRoomId !== currentSession.roomId) {
            sessionStates.delete(sessionKey);
          } else if (fuzzySwitch.type === 'RESOLVED' && fuzzySwitch.roomId !== currentSession.roomId) {
            sessionStates.delete(sessionKey);
          } else if (fuzzySwitch.type === 'AMBIGUOUS_COMPLEX' || fuzzySwitch.type === 'AMBIGUOUS_NUMBER') {
            sessionStates.delete(sessionKey);
          } else if (trimmed === '1' || /^עדכ[ןו]\s*סטטוס$|^סטטוס$/i.test(trimmed)) {
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'SELECT_STATUS', roomId: currentSession.roomId });
            await d.send(jid, managerStatusMenu(roomLabel));
            return { handled: true };
          } else if (trimmed === '2' || /^מוכן$|^אישור$|^מאשר$/i.test(trimmed)) {
            sessionStates.delete(sessionKey);
            if (d.resortos.approveRoomByManager) {
              await d.resortos.approveRoomByManager({ unitId: currentSession.roomId, reportedBy: cleaner?.name || 'מנהל' });
            } else {
              await d.resortos.markRoomReady({ unitId: currentSession.roomId, reportedBy: cleaner?.name || 'מנהל' });
            }
            const reply = `✅ חדר ${roomLabel} אושר בהצלחה כמוכן לאורח (READY)!\nביקורת מנהל הושלמה בהצלחה.`;
            await d.send(jid, reply);
            return {
              handled: true,
              intent: {
                action: 'ROOM_READY',
                room_id: currentSession.roomId,
                room_raw: roomLabel,
                issue_description_hebrew: null,
                acknowledgement_reply_cleaner_language: reply,
              },
            };
          } else if (trimmed === '3' || /^תקלה$/i.test(trimmed)) {
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_MAINTENANCE', roomId: currentSession.roomId });
            await d.send(jid, `מה התקלה בחדר ${roomLabel}? (אפשר להקליט או לכתוב) 🛠️`);
            return { handled: true };
          } else if (/^תקלה\s+(.+)$/i.test(trimmed)) {
            const desc = trimmed.match(/^תקלה\s+(.+)$/i)![1].trim();
            sessionStates.delete(sessionKey);
            await d.resortos.reportMaintenance({ unitId: currentSession.roomId, description: desc, reportedBy: cleaner?.name || 'מנהל' });
            const reply = `🛠️ דיווח התקלה נרשם ונפתחה קריאת תחזוקה לחדר ${roomLabel}:\n"${desc}"`;
            await d.send(jid, reply);
            return { handled: true, intent: { action: 'MAINTENANCE_ISSUE', room_id: currentSession.roomId, room_raw: roomLabel, issue_description_hebrew: desc, acknowledgement_reply_cleaner_language: reply }, transcript };
          } else if (trimmed === '4' || /^הערה$|^הערת חדר$/i.test(trimmed)) {
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_ROOM_NOTE', roomId: currentSession.roomId });
            await d.send(jid, `אנא כתוב את ההערה עבור חדר ${roomLabel}: 📝`);
            return { handled: true };
          } else if (/^(?:הערה|הערת חדר)\s+(.+)$/i.test(trimmed)) {
            const note = trimmed.match(/^(?:הערה|הערת חדר)\s+(.+)$/i)![1].trim();
            sessionStates.delete(sessionKey);
            if (d.resortos.updateUnitNote) {
              await d.resortos.updateUnitNote({ unitId: currentSession.roomId, note, reportedBy: cleaner?.name || 'מנהל' });
            }
            const reply = `📝 הערה נשמרה בהצלחה לחדר ${roomLabel}:\n"${note}"`;
            await d.send(jid, reply);
            return { handled: true, transcript };
          } else if (trimmed === '5' || /^הערת אורח$/i.test(trimmed)) {
            sessionStates.set(sessionKey, { role: 'MANAGER', state: 'AWAITING_GUEST_NOTE', roomId: currentSession.roomId, bookingId: currentSession.bookingId });
            await d.send(jid, `אנא כתוב את ההערה עבור אורח חדר ${roomLabel}: 👤`);
            return { handled: true };
          } else {
            // Contextual Room Q&A
            const today = getIsraelToday();
            const bookings = (await d.resortos.listBookings?.({ from: today, to: today })) || [];
            const units = (await d.resortos.listUnits?.()) || [];
            const unit = units.find((u) => u.id === currentSession.roomId);
            const r = d.rooms().find((x) => x.id === currentSession.roomId);
            const lockbox = r?.lockbox || '1357#';
            const occupancy = getRoomOccupancy(currentSession.roomId, bookings, today);

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
            reason = 'בניקיון';
            statusText = 'בניקיון (IN_PROGRESS) 🟡';
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
      if (!text?.trim()) return { handled: false, reason: 'no text', transcript };

      // 1. Manager Quick Approval: "מוכן B1", "אישור B1", "מאשר B1", "מוכן תזמורת 1"
      const approvalMatch = text.match(/^\s*(?:מוכן|אישור|מאשר|סיום)\s+(.+)$/i);
      if (approvalMatch && isManager) {
        const rawCode = approvalMatch[1].trim().replace(/_/g, ' ');
        let resolvedId = resolveRoomByAlias(rawCode, d.rooms());
        if (!resolvedId) {
          const fuzzy = matchManagerRoomIntent(rawCode, d.rooms());
          if (fuzzy.type === 'RESOLVED') resolvedId = fuzzy.roomId;
        }
        if (resolvedId) {
          const r = d.rooms().find((x) => x.id === resolvedId);
          if (d.resortos.approveRoomByManager) {
            await d.resortos.approveRoomByManager({ unitId: resolvedId, reportedBy: cleaner.name });
          } else {
            await d.resortos.markRoomReady({ unitId: resolvedId, reportedBy: cleaner.name });
          }
          const roomLabel = r?.name || r?.letterCode || rawCode;
          const reply = `✅ חדר ${roomLabel} אושר בהצלחה כמוכן לאורח (READY)!\nביקורת מנהל הושלמה בהצלחה.`;
          await d.send(jid, reply);
          return { handled: true, intent: { action: 'ROOM_READY', room_id: resolvedId, room_raw: rawCode, issue_description_hebrew: null, acknowledgement_reply_cleaner_language: reply }, transcript };
        }
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
          reply += `🟡 *בניקיון כרגע (${inProg.length}):*\n` +
            inProg.map((u) => `• ${formatRoomDisplay(u.id, d.rooms())}${u.assigned_staff ? ` (מנקה: ${u.assigned_staff})` : ''}`).join('\n') + `\n\n`;
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
          sessionStates.set(sessionKey, {
            role: 'MANAGER',
            state: 'AWAITING_ACTION',
            roomId: resolvedId,
            bookingId: occupancy.activeBooking?.id,
          });

          const managerReply = formatManagerInitialCard(roomLabel, lockbox, unit, occupancy, r);

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
            await d.resortos.startCleaning({ unitId: resolvedId, reportedBy: cleaner.name });
          }
          const roomLabel = cleaner.language === 'th' ? (r?.letterCode || r?.name || '') : (r?.name || r?.letterCode || '');
          let reply = '';
          if (cleaner.language === 'th') {
            reply = `บันทึกเรียบร้อยค่ะ: คุณ${cleaner.name} เริ่มทำความสะอาดห้อง ${roomLabel} แล้วค่ะ ✅\n🔑 รหัสตู้เซฟกุญแจ: ${lockbox || 'ไม่มี'}`;
          } else if (cleaner.language === 'ar') {
            reply = `أهلاً ${cleaner.name}، تم تسجيل بدء تنظيف غرفة ${roomLabel} بنجاح! ✅\n🔑 كود صندوق المفتاح: ${lockbox || 'غير محدد'}`;
          } else {
            reply = `היי ${cleaner.name}, נרשם בהצלחה שהתחלת לנקות את חדר ${roomLabel}! ✅\n🔑 קוד כספת מפתח: ${lockbox || 'לא מוגדר'}`;
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
          b.unit_id === resolvedId && phonesMatch(b.guest_phone, senderPhone) && !b.deleted_at && b.booking_status !== 'CANCELED'
        );
        const otherBooking = !roomBooking
          ? bookings.find((b) => phonesMatch(b.guest_phone, senderPhone) && !b.deleted_at && b.booking_status !== 'CANCELED')
          : undefined;

        if (otherBooking) {
          const correctRoom = d.rooms().find((x) => x.id === otherBooking.unit_id);
          const correctLabel = correctRoom?.name || correctRoom?.letterCode || otherBooking.unit_id;
          const stayUrl = otherBooking.checkout_token ? `https://resortos.app/stay/${otherBooking.checkout_token}` : '';
          const reply = `שלום ${otherBooking.guest_name || ''}! 🧭\n` +
            `נראה שסרקת את כספת חדר ${r?.name || r?.letterCode}, אך ההזמנה שלך היא עבור ${correctLabel}!\n\n` +
            `אנא גש אל ${correctLabel} וסרוק את הכספת שם, או השתמש בקוד הכספת של החדר שלך:\n` +
            `🔑 קוד כספת מפתח עבור ${correctLabel}: ${correctRoom?.lockbox || 'לא מוגדר'}\n\n` +
            (stayUrl ? `📱 דף האורח הדיגיטלי שלך:\n${stayUrl}\n\n` : '') +
            `לכל שאלה אנו זמינים כאן בווטסאפ.`;
          await d.send(jid, reply);
          return { handled: true, transcript };
        }

        if (roomBooking) {
          const checkIn = roomBooking.check_in_date || '';
          const checkOut = roomBooking.check_out_date || '';
          const isTodayOrStay = today >= checkIn && today <= checkOut;
          const isFuture = today < checkIn;
          const stayUrl = roomBooking.checkout_token ? `https://resortos.app/stay/${roomBooking.checkout_token}` : '';

          if (isTodayOrStay) {
            const units = (await d.resortos.listUnits?.()) || [];
            const unit = units.find((u) => u.id === resolvedId);
            const isReady = unit?.operational_status === 'READY';

            if (isReady) {
              const reply = `שלום ${roomBooking.guest_name || 'וברוכים הבאים'}, ברוכים הבאים ל${r?.property || 'נופים בלבן'}! 🌿✨\n` +
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
              await d.send(jid, reply);
              return { handled: true, transcript };
            } else {
              const reply = `שלום ${roomBooking.guest_name || ''}, איזה כיף שהגעתם! 🌿\n` +
                `בקתה ${r?.name || r?.letterCode} עוברת כרגע ניקיון והכנה קפדנית כדי שתהיה מושלמת עבורכם (שעת צ'ק-אין רשמית היא החל מ-15:00).\n\n` +
                `ברגע שהבקתה תהיה מוכנה ומאושרת ע״י המנהל, נשלח לכם לכאן אוטומטית הודעה עם קוד הכספת והוראות הכניסה!\n\n` +
                (stayUrl ? `בינתיים תוכלו להתעדכן בדף השהות הדיגיטלי שלכם:\n${stayUrl}\n\n` : '') +
                `לכל שאלה אנו זמינים כאן בווטסאפ.`;
              await d.send(jid, reply);
              return { handled: true, transcript };
            }
          } else if (isFuture) {
            const reply = `שלום ${roomBooking.guest_name || ''}, ההזמנה שלכם לבקתה ${r?.name || r?.letterCode} רשומה לתאריך ${checkIn}.\n` +
              `נשמח מאוד לארח אתכם במועד הגעתכם! 🌿\n\n` +
              (stayUrl ? `לצפייה בפרטי ההזמנה שלכם בדף האורח:\n${stayUrl}` : '');
            await d.send(jid, reply);
            return { handled: true, transcript };
          } else {
            const reply = `שלום ${roomBooking.guest_name || ''}, ההזמנה שלכם לבקתה ${r?.name || r?.letterCode} הסתיימה. שמחנו לארח אתכם ונשמח לראותכם שוב בעתיד! 🌿`;
            await d.send(jid, reply);
            return { handled: true, transcript };
          }
        }

        // Neither staff, manager, nor guest with booking
        if (isStaffRoom(r)) {
          const reply = `שלום! מרחב זה (${r?.name || 'יחידה זו'}) הינו אזור תפעולי של מגורי צוות ואינו מיועד לאירוח אורחים 🏡\n\n` +
            `אם הגעתם להתארח אצלנו, אנא השיבו להודעה זו עם שמכם המלא או מספר ההזמנה שלכם ונשמח להכווין אתכם לבקתה שלכם!`;
          await d.send(jid, reply);
          return { handled: true, transcript };
        }
        if (isOfficeRoom(r)) {
          const reply = `שלום! מרחב זה הינו משרד ההנהלה והתפעול 🏢\n\n` +
            `לכל שאלה או סיוע בהזמנתכם, אנא השיבו להודעה זו ונשמח לעזור!`;
          await d.send(jid, reply);
          return { handled: true, transcript };
        }
        const roomLabel = (r?.name && r.name.includes('משרד')) ? r.name : `בקתה ${r?.name || r?.letterCode}`;
        const reply = `שלום! לא זוהתה הזמנה פעילה עבור מספר טלפון זה ב${roomLabel}.\n\n` +
          `אם הגעתם להתארח אצלנו או שההזמנה בוצעה במספר אחר, אנא השבו להודעה זו עם שמכם המלא או מספר ההזמנה, ונשמח לעזור לכם בהקדם! 🏡`;
        await d.send(jid, reply);
        return { handled: true, transcript };
      }

      if (cleaner && text?.trim()) {
        const rackRate = answerRackRate(text.trim(), d.rooms());
        if (rackRate) {
          await d.send(jid, rackRate);
          return { handled: true, transcript };
        }
      }

      // 4b. Manager Fuzzy / Nickname / Complex Matching
      if (isManager) {
        const fuzzy = matchManagerRoomIntent(text, d.rooms());
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
          sessionStates.set(sessionKey, {
            role: 'MANAGER',
            state: 'AWAITING_ACTION',
            roomId: fuzzy.roomId,
            bookingId: occupancy.activeBooking?.id,
          });

          // Check if manager asked a specific question about the room
          const specificAnswer = answerManagerRoomQuestion(text, roomLabel, lockbox, unit, occupancy, r);
          const body = specificAnswer || formatManagerInitialCard(roomLabel, lockbox, unit, occupancy, r);
          const managerReply = `🔍 זיהיתי: *${roomLabel}*\n\n${body}`;

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
          sessionStates.set(sessionKey, {
            role: 'MANAGER',
            state: 'AWAITING_CLARIFICATION',
            candidateRoomIds: fuzzy.candidateRooms.map((r) => r.id),
            pendingQuestion: text,
          });
          const prompt = formatComplexClarificationPrompt(fuzzy.complex.officialName, fuzzy.candidateRooms, d.rooms());
          await d.send(jid, prompt);
          return { handled: true, transcript };
        } else if (fuzzy.type === 'AMBIGUOUS_NUMBER') {
          sessionStates.set(sessionKey, {
            role: 'MANAGER',
            state: 'AWAITING_CLARIFICATION',
            candidateRoomIds: fuzzy.candidateRooms.map((r) => r.id),
            pendingQuestion: text,
          });
          const prompt = formatNumberClarificationPrompt(fuzzy.number, fuzzy.candidateRooms, d.rooms());
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
          phonesMatch(b.guest_phone, senderPhone) && !b.deleted_at && b.booking_status !== 'CANCELED'
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
          const stayUrl = booking.checkout_token ? `https://resortos.app/stay/${booking.checkout_token}` : undefined;

          const ctx: GuestContext = {
            booking,
            room,
            unitId: booking.unit_id,
            roomName: room?.name || room?.letterCode || booking.unit_id,
            stayUrl,
            guestName: booking.guest_name,
          };

          const guestReply = answerGuestQuestion(text, ctx);
          if (guestReply) {
            await d.send(jid, guestReply);
            return { handled: true, transcript };
          }

          // Helpful fallback when not matching a specific known query
          const fallbackReply = `שלום ${booking.guest_name || ''}! 🌿\n` +
            `שמחים לעזור. קיבלנו את הודעתכם וצוות המתחם ישיב לכם כאן בהקדם.\n\n` +
            `בינתיים, כל המידע על שהותכם ב${ctx.roomName} (קוד WiFi, שער הישוב, הוראות ג'קוזי, מסעדות, אטרקציות וצ'ק-אאוט) זמין תמיד בדף האורח שלכם:\n` +
            (stayUrl ? `📱 ${stayUrl}\n\n` : '') +
            `מאחלים לכם שהות נעימה ושלווה!`;
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

      const intent = await d.llm.extractIntent(text, lang, d.rooms());
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
        await d.send(jid, ASK_ROOM[lang]);
        return { handled: false, intent, transcript, reason: 'room unresolved' };
      }

      let apiOk = true;
      let skipped: string | undefined;
      let statusReply: string | undefined;
      try {
        const by = cleaner.name;
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
            statusReply = `היי ${by}, נרשם בהצלחה שהתחלת לנקות את חדר ${roomLabel}! ✅` +
              (lockbox ? `\n🔑 קוד כספת מפתח: ${lockbox}` : '');
          }
        } else if (intent.action === 'MAINTENANCE_ISSUE') {
          await d.resortos.reportMaintenance({ unitId: intent.room_id!, description: desc, reportedBy: by });
        } else if (intent.action === 'SUPPLIES_NEEDED') {
          await d.resortos.reportSupplies({ unitId: intent.room_id!, description: desc, reportedBy: by });
        } else if (intent.action === 'QUERY_STATUS' && d.resortos.listUnits) {
          const all = await d.resortos.listUnits();
          if (cleaner.role === 'MANAGER' || cleaner.role === 'OPS_MANAGER') {
            const today = getIsraelToday();
            const bookings = (await d.resortos.listBookings?.({ from: today, to: today })) || [];
            const rentableRooms = d.rooms().filter((r) => r.id !== 'pilot-office');
            const totalRentable = rentableRooms.length || 40;

            const checkIns = bookings.filter((b) => b.check_in_date === today && b.booking_status !== 'CANCELED' && !b.deleted_at);
            const checkOuts = bookings.filter((b) => b.check_out_date === today && b.booking_status !== 'CANCELED' && !b.deleted_at);
            const inIds = new Set(checkIns.map((b) => b.unit_id));
            const outIds = new Set(checkOuts.map((b) => b.unit_id));
            const turnovers = [...inIds].filter((id) => outIds.has(id));

            const occupiedIds = new Set(
              bookings
                .filter((b) => b.booking_status !== 'CANCELED' && !b.deleted_at && (b.check_in_date || '') <= today && (b.check_out_date || '') >= today)
                .map((b) => b.unit_id)
            );
            const occupancyPct = totalRentable > 0 ? Math.round((occupiedIds.size / totalRentable) * 100) : 0;

            const awaitingInspection = all.filter(
              (u) => u.operational_status === 'READY' &&
              (u.custom_reason === AWAITING_INSPECTION_REASON || u.custom_reason?.includes('ביקורת') || u.custom_reason?.includes('בדיקה'))
            );
            const ready = all
              .filter((u) => u.operational_status === 'READY' &&
                u.custom_reason !== AWAITING_INSPECTION_REASON &&
                !u.custom_reason?.includes('ביקורת') &&
                !u.custom_reason?.includes('בדיקה') &&
                !outIds.has(u.id)
              )
              .map((u) => formatRoomDisplay(u.id, d.rooms()));
            const inProg = all
              .filter((u) => u.operational_status === 'IN_PROGRESS')
              .map((u) => `${formatRoomDisplay(u.id, d.rooms())}${u.assigned_staff ? ` (${u.assigned_staff})` : ''}`);

            // Reconcile dirty: explicitly DIRTY units + today's checkouts that have not been cleaned/approved
            const dirtyUnitIds = new Set(
              all.filter((u) => u.operational_status === 'DIRTY').map((u) => u.id)
            );
            for (const outId of outIds) {
              const u = all.find((x) => x.id === outId);
              const isAwaiting = u?.operational_status === 'READY' && (u.custom_reason === AWAITING_INSPECTION_REASON || u.custom_reason?.includes('ביקורת'));
              const isApproved = u?.operational_status === 'READY' && (u.custom_reason === 'אושר ע״י מנהל' || u.custom_reason === 'טופל');
              const isInProg = u?.operational_status === 'IN_PROGRESS';
              if (!isAwaiting && !isApproved && !isInProg) {
                dirtyUnitIds.add(outId);
              }
            }
            const dirty = Array.from(dirtyUnitIds).map((id) => formatRoomDisplay(id, d.rooms()));
            const maint = all
              .filter((u) => u.operational_status === 'MAINTENANCE_ALERT')
              .map((u) => `${formatRoomDisplay(u.id, d.rooms())}: ${u.custom_reason || 'תקלה'}`);
            const inspect = awaitingInspection.map((u) => formatRoomDisplay(u.id, d.rooms()));

            statusReply = `📊 תמונת מצב יומית למנהל:\n` +
              `🏨 תפוסה להיום: ${occupancyPct}% (${occupiedIds.size}/${totalRentable} חדרים)\n` +
              `🔄 החלפות (יוצא ונכנס): ${turnovers.length}\n` +
              `🚪 כניסות להיום: ${checkIns.length}\n` +
              `👋 יציאות להיום: ${checkOuts.length}\n\n` +
              `⚙️ סטטוס תפעולי:\n` +
              `🔍 ממתינים לביקורת מנהל (${inspect.length}): ${inspect.join(', ') || 'אין'}\n` +
              `🟢 מוכנים ומאושרים לאורח (${ready.length}): ${ready.join(', ') || 'אין'}\n` +
              `🟡 בניקיון (${inProg.length}): ${inProg.join(', ') || 'אין'}\n` +
              `🔴 ממתינים לניקיון (${dirty.length}): ${dirty.join(', ') || 'אין'}\n` +
              `⚠️ תקלות (${maint.length}): ${maint.join(', ') || 'אין'}`;
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

            const myRooms = all.filter((u) =>
              dirtyIds.has(u.id) &&
              (!u.assigned_staff || u.assigned_staff === cleaner.name)
            );
            if (!myRooms.length) {
              statusReply = lang === 'th' ? 'ไม่มีห้องที่ต้องทำความสะอาดในขณะนี้ค่ะ' : (lang === 'ar' ? 'ما في غرف بحاجة لتنظيف حالياً.' : 'אין כרגע חדרים שממתינים לניקיון.');
            } else {
              const list = myRooms
                .map((u) => {
                  const formatted = formatRoomForWorker(u.id, lang, d.rooms());
                  return `${formatted}${u.assigned_staff === cleaner.name ? (lang === 'th' ? ' (ของคุณ)' : ' (שלך)') : ''}`;
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
        const reply = statusReply || intent.acknowledgement_reply_cleaner_language || CLARIFY[lang];
        await d.send(jid, reply);
      }
      return { handled: apiOk, intent, transcript, reason: apiOk ? undefined : 'resortos error' };
    } catch (e) {
      d.log.error({ err: String(e) }, 'inbound processing failed');
      await d.send(jid, CLARIFY[lang]).catch(() => {});
      return { handled: false, reason: String(e), transcript };
    }
  }

  /** ResortOS -> agent -> worker. Body: { cleaner_phone, message_he, action?, type?, room_id? } */
  async function handleDispatch(body: { cleaner_phone?: string; message_he?: string; action?: string; type?: string; room_id?: string }) {
    const phone = body.cleaner_phone?.replace(/\D/g, '');
    if (!phone) throw Object.assign(new Error('cleaner_phone required'), { status: 400 });
    const cleaner = d.cleaners().find((c) => phonesMatch(c.phone, phone));
    if (!cleaner) throw Object.assign(new Error('unknown cleaner'), { status: 404 });

    if ((body.action === 'ROOM_EXIT' || body.type === 'ROOM_EXIT') && body.room_id) {
      return triggerRoomExit({ cleanerPhone: phone, roomId: body.room_id });
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
