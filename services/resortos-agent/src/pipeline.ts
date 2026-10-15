import type { WAMessage } from '@whiskeysockets/baileys';
import type { CleanerProfile, Lang, RoomEntry } from './config.js';
import type { InboundIntent } from './llm/client.js';
import { resolveRoomByAlias } from './llm/client.js';
import type { ReadyResult, BookingRow, UnitRow } from './integration/resortos.js';
import type { Transcript } from './whatsapp/media.js';
import { generateRoomQrPng } from './whatsapp/qrGenerator.js';

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
  /** Worker -> agent. */
  async function handleInbound(msg: WAMessage): Promise<InboundResult> {
    const jid = msg.key.remoteJid;
    if (!jid) return { handled: false, reason: 'no jid' };
    const senderPhone = phoneOf(jid);
    const cleaner = d.cleaners().find((c) => phonesMatch(c.phone, senderPhone));
    const isManager = cleaner?.role === 'MANAGER' || cleaner?.role === 'OPS_MANAGER';
    const isWorker = Boolean(cleaner && !isManager);

    let text = d.extractText(msg);
    let transcript: Transcript | undefined;
    let lang: Lang = cleaner?.language || 'he';
    try {
      if (!text && d.isAudio(msg)) {
        transcript = await d.transcribe(msg, cleaner?.language || 'he');
        text = transcript.text;
        if (['th', 'ar', 'he'].includes(transcript.language)) lang = transcript.language as Lang;
      }
      if (!text?.trim()) return { handled: false, reason: 'no text', transcript };

      // 1. Manager Quick Approval: "מוכן B1", "אישור B1", "מאשר B1"
      const approvalMatch = text.match(/^\s*(?:מוכן|אישור|מאשר|סיום)\s+([a-zA-Z0-9_\-\u0590-\u05FF]+)\s*$/i);
      if (approvalMatch && isManager) {
        const rawCode = approvalMatch[1].replace(/_/g, ' ');
        const resolvedId = resolveRoomByAlias(rawCode, d.rooms());
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
      const qrReqMatch = text.match(/(?:שלח\s+)?(?:תמונת\s+)?(?:qr|ברקוד|קוד\s*סריקה)\s*(?:של\s+)?([a-zA-Z0-9_\-\u0590-\u05FF]+)?/i);
      if (qrReqMatch && isManager) {
        const queryRoom = qrReqMatch[1]?.trim();
        if (queryRoom) {
          const resolvedId = resolveRoomByAlias(queryRoom, d.rooms());
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

      // 3. Scan or direct room query detection:
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
          const activeBooking = bookings.find((b) =>
            b.unit_id === resolvedId && !b.deleted_at && b.booking_status !== 'CANCELED' &&
            today >= (b.check_in_date || '') && today <= (b.check_out_date || '')
          );

          let statusEmoji = '⚪ לא ידוע';
          const st = unit?.operational_status;
          if (st === 'READY') statusEmoji = '🟢 מוכן לאורח (READY)';
          else if (st === 'IN_PROGRESS') statusEmoji = '🟡 בניקיון (IN_PROGRESS)';
          else if (st === 'DIRTY') statusEmoji = '🔴 ממתין לניקיון (DIRTY)';
          else if (st === 'MAINTENANCE_ALERT') statusEmoji = '⚠️ תקלת תחזוקה (ALERT)';

          let guestCard = '👥 אורח להיום: אין הזמנה פעילה (החדר פנוי)';
          if (activeBooking) {
            const isCheckin = activeBooking.check_in_date === today;
            const isCheckout = activeBooking.check_out_date === today;
            const stayPhase = isCheckin ? "צ'ק-אין היום" : (isCheckout ? "צ'ק-אאוט היום" : "שוהה כעת");
            const pax = `${activeBooking.adults_count ?? 2} מבוגרים${activeBooking.children_count ? `, ${activeBooking.children_count} ילדים` : ''}`;
            const payStatus = activeBooking.payment_status === 'PAID' ? 'שולם במלואו ✅' : (activeBooking.payment_status || 'לא שולם');
            const stayUrl = activeBooking.checkout_token ? `https://resortos.app/stay/${activeBooking.checkout_token}` : '';

            guestCard = `👥 אורח להיום: ${activeBooking.guest_name || 'ללא שם'} (${activeBooking.guest_phone || 'ללא טלפון'})\n` +
              `📅 שהות: ${activeBooking.check_in_date} - ${activeBooking.check_out_date} (${stayPhase})\n` +
              `👨‍👩‍👧 הרכב: ${pax}\n` +
              `💳 תשלום: ${payStatus}` +
              (stayUrl ? `\n🔗 דף אורח: ${stayUrl}` : '');
            if (d.resortos.publishBookingStay) {
              void d.resortos.publishBookingStay(activeBooking).catch(() => {});
            }
          }

          const roomLabel = formatRoomDisplay(resolvedId, d.rooms());
          const managerReply = `📋 כרטיס חדר מנהל: ${roomLabel}\n` +
            `📍 מתחם: ${r?.property || 'מלון'}\n` +
            `🔑 קוד כספת מפתח: ${lockbox}\n\n` +
            `⚙️ סטטוס תפעולי: ${statusEmoji}\n` +
            `👤 מנקה משויך: ${unit?.assigned_staff || 'לא משויך'}` +
            (unit?.custom_reason ? `\n📝 הערה: ${unit.custom_reason}` : '') + `\n\n` +
            `${guestCard}\n\n` +
            `⚡ פעולות מהירות למנהל:\n` +
            `• השב "מוכן ${roomLabel}"${r?.letterCode ? ` (או "מוכן ${r.letterCode}")` : ''} לאישור סיום ביקורת\n` +
            `• השב "תקלה ${roomLabel} [תיאור]" לפתיחת קריאה`;

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
        const roomLabel = (r?.name && r.name.includes('משרד')) ? r.name : `בקתה ${r?.name || r?.letterCode}`;
        const reply = `שלום! לא זוהתה הזמנה פעילה עבור מספר טלפון זה ב${roomLabel}.\n\n` +
          `אם הגעתם להתארח אצלנו או שההזמנה בוצעה במספר אחר, אנא השבו להודעה זו עם שמכם המלא או מספר ההזמנה, ונשמח לעזור לכם בהקדם! 🏡`;
        await d.send(jid, reply);
        return { handled: true, transcript };
      }

      // If sender is unknown and did not specify a room
      if (!cleaner) {
        d.log.warn({ jid, senderPhone }, 'message from unknown number ignored');
        return { handled: false, reason: 'unknown sender', transcript };
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

            const ready = all
              .filter((u) => u.operational_status === 'READY')
              .map((u) => formatRoomDisplay(u.id, d.rooms()));
            const inProg = all
              .filter((u) => u.operational_status === 'IN_PROGRESS')
              .map((u) => `${formatRoomDisplay(u.id, d.rooms())}${u.assigned_staff ? ` (${u.assigned_staff})` : ''}`);
            const dirty = all
              .filter((u) => u.operational_status === 'DIRTY')
              .map((u) => formatRoomDisplay(u.id, d.rooms()));
            const maint = all
              .filter((u) => u.operational_status === 'MAINTENANCE_ALERT')
              .map((u) => `${formatRoomDisplay(u.id, d.rooms())}: ${u.custom_reason || 'תקלה'}`);

            statusReply = `📊 תמונת מצב יומית למנהל:\n` +
              `🏨 תפוסה להיום: ${occupancyPct}% (${occupiedIds.size}/${totalRentable} חדרים)\n` +
              `🔄 החלפות (יוצא ונכנס): ${turnovers.length}\n` +
              `🚪 כניסות להיום: ${checkIns.length}\n` +
              `👋 יציאות להיום: ${checkOuts.length}\n\n` +
              `⚙️ סטטוס תפעולי:\n` +
              `🟢 מוכנים (${ready.length}): ${ready.join(', ') || 'אין'}\n` +
              `🟡 בניקיון (${inProg.length}): ${inProg.join(', ') || 'אין'}\n` +
              `🔴 ממתינים לניקיון (${dirty.length}): ${dirty.join(', ') || 'אין'}\n` +
              `⚠️ תקלות (${maint.length}): ${maint.join(', ') || 'אין'}`;
          } else {
            // HOUSEKEEPING: only rooms assigned to this cleaner OR unassigned rooms needing cleaning.
            const myRooms = all.filter((u) =>
              (u.operational_status === 'DIRTY' || u.operational_status === 'IN_PROGRESS') &&
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

  /** ResortOS -> agent -> worker. Body: { cleaner_phone, message_he } */
  async function handleDispatch(body: { cleaner_phone?: string; message_he?: string }) {
    const phone = body.cleaner_phone?.replace(/\D/g, '');
    if (!phone || !body.message_he?.trim()) throw Object.assign(new Error('cleaner_phone and message_he required'), { status: 400 });
    const cleaner = d.cleaners().find((c) => c.phone === phone);
    if (!cleaner) throw Object.assign(new Error('unknown cleaner'), { status: 404 });

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

  return { handleInbound, handleDispatch };
}
