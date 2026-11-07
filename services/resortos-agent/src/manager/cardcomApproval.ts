/**
 * Ran WhatsApp Owner Approval for Manual Cardcom Terminal Charges
 *
 * Ran's private number: +972 54-831-7887 (or Baileys LID 170626836910125@lid)
 *
 * Interactive replies:
 * - 1: Approve linking current candidate -> records payment, issues Cardcom invoice, notifies guest
 * - 2: Next candidate -> prompts Ran with candidate #2 or informs no more candidates
 * - 0: Ignore -> marks deal as ignored
 */

import fs from 'node:fs';
import path from 'node:path';

export const RAN_PRIVATE_PHONE_DIGITS = '972548317887';
export const RAN_BAILEYS_LID = '170626836910125@lid';
export const FALLBACK_INVOICE_EMAIL = 'mialeesresort@mialees.com';

export function isRanPhone(phoneOrJid: string): boolean {
  if (!phoneOrJid) return false;
  const digits = String(phoneOrJid).replace(/\D/g, '');
  return digits.includes('548317887') || digits.includes('170626836910125');
}

export function normalizePhone(raw: string): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('05') && digits.length === 10) return `972${digits.slice(1)}`;
  if (digits.startsWith('972') && digits.length === 12) return digits;
  if (digits.startsWith('5') && digits.length === 9) return `972${digits}`;
  return digits;
}

export class OutboundRateLimiter {
  private chatTimestamps = new Map<string, number[]>();
  private chatConsecutiveOutbound = new Map<string, number>();

  canSend(chatId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const timestamps = (this.chatTimestamps.get(chatId) || []).filter((t) => now - t < 60000);
    this.chatTimestamps.set(chatId, timestamps);

    if (timestamps.length >= 2) {
      return { allowed: false, reason: 'RATE_LIMIT_60S' };
    }

    const consecutive = this.chatConsecutiveOutbound.get(chatId) || 0;
    if (consecutive >= 3) {
      return { allowed: false, reason: 'MAX_CONSECUTIVE_UNREPLIED' };
    }

    return { allowed: true };
  }

  recordOutbound(chatId: string): void {
    const now = Date.now();
    const timestamps = this.chatTimestamps.get(chatId) || [];
    timestamps.push(now);
    this.chatTimestamps.set(chatId, timestamps);

    const consecutive = this.chatConsecutiveOutbound.get(chatId) || 0;
    this.chatConsecutiveOutbound.set(chatId, consecutive + 1);
  }

  recordInbound(chatId: string): void {
    this.chatConsecutiveOutbound.set(chatId, 0);
  }
}

export const defaultRateLimiter = new OutboundRateLimiter();

export function formatRanApprovalPrompt(deal: any, candidate: any, remainingCandidates: any[] = []): string {
  const amountFormatted = Number(deal.amount).toLocaleString('he-IL');
  const timeFormatted = deal.dealTime
    ? new Date(deal.dealTime).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })
    : 'עכשיו';
  const approval = deal.approval || 'אין';
  const last4 = deal.last4 || '????';

  let msg = `💳 *סליקה חדשה ₪${amountFormatted}*
4 ספרות: ${last4} | אישור: ${approval} | שעה: ${timeFormatted}`;

  if (deal.cardOwnerName) {
    msg += ` | בעל כרטיס: ${deal.cardOwnerName}`;
  }

  msg += '\n\n';

  if (candidate) {
    const dates = `${candidate.checkIn || ''} עד ${candidate.checkOut || ''}`;
    const dueFormatted = Number(candidate.dueIls ?? 0).toLocaleString('he-IL');
    msg += `נראה שזה *${candidate.guestName}* – ${candidate.unitName}, ${dates}, יתרה ₪${dueFormatted}.\n\n`;
  } else {
    msg += `לא נמצאה התאמה אוטומטית מובהקת.\n\n`;
  }

  if (remainingCandidates && remainingCandidates.length > 0) {
    msg += `(קיימות עוד ${remainingCandidates.length} אפשרויות במערכת)\n`;
  }

  msg += `לשייך? השב *1* לאישור / *2* לאפשרות הבאה / *0* לא לשייך`;
  return msg;
}

export function formatGuestConfirmationMessage(deal: any, booking: any, unitName = ''): string {
  const guestName = (booking.guest_name || 'שלום').trim().split(/\s+/)[0];
  const amountFormatted = Number(deal.amount).toLocaleString('he-IL');
  const unit = unitName || booking.unit_name || booking.unit_id || 'הריזורט';
  const approval = deal.approval ? ` (אישור: ${deal.approval})` : '';

  return `שלום ${guestName}, התשלום בסך ₪${amountFormatted} עבור האירוח ב-${unit} התקבל בהצלחה${approval}. לשלוח לך את החשבונית לכאן בווטסאפ?`;
}

export function formatGuestInvoiceDeliveryMessage(invoiceUrl: string, invoiceNumber?: string, unitName = ''): string {
  const docRef = invoiceNumber ? ` מס׳ ${invoiceNumber}` : '';
  const unitRef = unitName ? ` ב-${unitName}` : '';
  return `בשמחה! הנה קישור לחשבונית המס קבלה${docRef} עבור השהייה שלך${unitRef}:\n${invoiceUrl}\nנשמח לעמוד לרשותך לכל דבר נוסף ✨`;
}

export async function createCardcomInvoiceForDeal({
  dealId,
  amount,
  name,
  email,
  phone,
  description = 'אירוח ונופש',
  apiName,
  apiPassword,
  fetchImpl = fetch,
  timeoutMs = 15000
}: {
  dealId: string;
  amount: number;
  name?: string;
  email?: string;
  phone?: string;
  description?: string;
  apiName: string;
  apiPassword: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  if (!dealId) throw new Error('MISSING_DEAL_ID');
  if (!apiName || !apiPassword) throw new Error('MISSING_CARDCOM_CREDENTIALS');

  const customerEmail = String(email || '').trim();
  const invoiceEmail = customerEmail || FALLBACK_INVOICE_EMAIL;
  const customerName = String(name || '').trim() || 'אורח';
  const customerPhone = String(phone || '').trim();

  const body = {
    ApiName: apiName,
    ApiPassword: apiPassword,
    IsSendSMS: false,
    Document: {
      DocumentTypeToCreate: 'TaxInvoiceAndReceipt',
      Name: customerName,
      Email: invoiceEmail,
      Phone: customerPhone || undefined,
      IsSendByEmail: true,
      Products: [
        {
          Description: String(description || 'אירוח ונופש').slice(0, 200),
          UnitCost: Math.round(Number(amount) * 100) / 100,
          Quantity: 1,
          IsVatFree: false
        }
      ],
      ISOCoinID: '1'
    },
    DealNumbers: [{ DealNumber: String(dealId) }]
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl('https://secure.cardcom.solutions/api/v11/Documents/CreateDocument', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const data = await res.json();
    if (!res.ok || (data.ResponseCode !== 0 && data.ResponseCode !== '0')) {
      throw new Error(data.Description || `Cardcom Document error (code ${data.ResponseCode})`);
    }

    return {
      documentNumber: String(data.DocumentNumber || data.DocNumber || ''),
      documentUrl: String(data.DocumentUrl || data.DocUrl || data.Url || ''),
      dealId: String(dealId)
    };
  } finally {
    clearTimeout(t);
  }
}

export function recordCardcomTerminalPayment(booking: any, deal: any, invoiceInfo: any = {}) {
  const existingPayments = Array.isArray(booking.clearing_payments)
    ? [...booking.clearing_payments]
    : [];

  const dealIdStr = String(deal.dealId || deal.deal_id);
  const alreadyRecorded = existingPayments.find(
    (p: any) => String(p.deal_number || p.txn || '') === dealIdStr
  );

  const paymentEntry = {
    method: 'CARD',
    amount_ils: Number(deal.amount),
    amount_agorot: Math.round(Number(deal.amount) * 100),
    deal_number: dealIdStr,
    txn: dealIdStr,
    approval: deal.approval ? String(deal.approval) : undefined,
    last4: deal.last4 ? String(deal.last4) : undefined,
    payer_name: deal.cardOwnerName || deal.payer_name || undefined,
    invoice: invoiceInfo?.documentNumber ? String(invoiceInfo.documentNumber) : undefined,
    invoice_url: invoiceInfo?.documentUrl ? String(invoiceInfo.documentUrl) : undefined,
    terminal: '184288',
    recorded_at: new Date().toISOString()
  };

  if (!alreadyRecorded) {
    existingPayments.push(paymentEntry);
  } else {
    Object.assign(alreadyRecorded, paymentEntry);
  }

  const totalPriceAgorot = Number(booking.total_price_agorot || 0);
  const totalPaidAgorot = existingPayments.reduce((sum: number, p: any) => sum + (Number(p.amount_agorot) || Math.round((Number(p.amount_ils) || 0) * 100)), 0);

  let paymentStatus = booking.payment_status || 'UNPAID';
  if (totalPriceAgorot > 0) {
    if (totalPaidAgorot >= totalPriceAgorot) {
      paymentStatus = 'PAID';
    } else if (totalPaidAgorot > 0) {
      paymentStatus = 'PARTIAL';
    }
  } else if (totalPaidAgorot > 0) {
    paymentStatus = 'PAID';
  }

  return {
    booking: {
      ...booking,
      clearing_payments: existingPayments,
      payment_status: paymentStatus,
      payment_mode: 'CARD'
    },
    paymentEntry
  };
}

export interface CandidateBooking {
  bookingId: string;
  checkoutToken?: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  unitId: string;
  unitName: string;
  checkIn: string;
  checkOut: string;
  dueIls: number;
  totalIls: number;
  score: number;
}

export interface TerminalPendingMatch {
  id: string;
  deal_id: string;
  terminal_number: string;
  amount: number;
  last4?: string;
  approval?: string;
  deal_time?: string;
  payer_name?: string;
  candidates: CandidateBooking[];
  current_candidate_index: number;
  status: 'pending' | 'approved' | 'ignored' | 'manual_linked';
  selected_booking_id?: string;
  ran_prompted_at?: string;
  approved_at?: string;
  payment_recorded_at?: string;
  invoice_number?: string;
  invoice_url?: string;
  guest_notified_at?: string;
  guest_invoice_requested?: boolean;
  guest_invoice_sent_at?: string;
}

export function parseRanApprovalChoice(text: string): '1' | '2' | '0' | null {
  const clean = String(text || '').trim();
  if (/^(?:1|כן|אשר|אישור|1 לאישור|yes)$/i.test(clean)) return '1';
  if (/^(?:2|הבא|האפשרות הבאה|2 לאפשרות הבאה|next)$/i.test(clean)) return '2';
  if (/^(?:0|לא|התעלם|אל תשייך|0 לא לשייך|no|ignore)$/i.test(clean)) return '0';
  return null;
}

export function isGuestInvoiceYesReply(text: string): boolean {
  const clean = String(text || '').trim();
  return /^(?:כן|אשמח|תודה|שלח|שלחי|בטח|בבקשה|כן בבקשה|yes|send|please)(?:$|\s|[!?.,])/i.test(clean);
}

export function loadPendingMatchesFromFile(baseDir = process.cwd()): TerminalPendingMatch[] {
  try {
    const file = path.join(baseDir, 'data', 'cardcom-pending-matches.json');
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (_) {}
  return [];
}

export function savePendingMatchesToFile(matches: TerminalPendingMatch[], baseDir = process.cwd()): void {
  try {
    const dir = path.join(baseDir, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'cardcom-pending-matches.json');
    fs.writeFileSync(file, JSON.stringify(matches, null, 2), 'utf8');
  } catch (_) {}
}

export interface ApprovalDeps {
  matches: TerminalPendingMatch[];
  saveMatches: (matches: TerminalPendingMatch[]) => Promise<void> | void;
  loadBooking: (bookingId: string) => Promise<any>;
  patchBooking: (bookingId: string, patch: any) => Promise<any>;
  sendWhatsApp: (jid: string, text: string) => Promise<boolean>;
  logGuestComm?: (comm: {
    bookingId: string;
    direction: 'outbound' | 'inbound';
    phone?: string;
    content: string;
    channel?: string;
  }) => Promise<void>;
  cardcomCreds?: { apiName: string; apiPassword: string };
  fetchImpl?: typeof fetch;
  logger?: { info: (msg: any, ...args: any[]) => void; warn: (msg: any, ...args: any[]) => void; error: (msg: any, ...args: any[]) => void };
}

/**
 * Handles inbound message from Ran if there is an active pending terminal match.
 */
export async function handleRanTerminalInbound(
  sender: string,
  text: string,
  deps: ApprovalDeps
): Promise<{ handled: boolean; reply?: string }> {
  if (!isRanPhone(sender)) {
    return { handled: false };
  }

  const choice = parseRanApprovalChoice(text);
  if (!choice) {
    return { handled: false };
  }

  // Find latest pending match
  const pendingList = (deps.matches || []).filter((m) => m.status === 'pending');
  if (!pendingList.length) {
    return { handled: false };
  }

  // Sort latest first
  pendingList.sort((a, b) => new Date(b.deal_time || 0).getTime() - new Date(a.deal_time || 0).getTime());
  const match = pendingList[0];
  const deal = {
    dealId: match.deal_id,
    amount: match.amount,
    amountAgorot: Math.round(match.amount * 100),
    approval: match.approval,
    last4: match.last4,
    cardOwnerName: match.payer_name,
    dealTime: match.deal_time
  };

  const candidateIdx = match.current_candidate_index || 0;
  const candidate = match.candidates[candidateIdx];

  if (choice === '1') {
    if (!candidate) {
      return { handled: true, reply: '⚠️ לא נבחרה הזמנה לשיוך. סליקה זו ממתינה לשיוך ידני בדשבורד.' };
    }

    match.status = 'approved';
    match.selected_booking_id = candidate.bookingId;
    match.approved_at = new Date().toISOString();

    // 1. Load booking & record payment
    let booking = await deps.loadBooking(candidate.bookingId);
    let invoiceInfo = null;

    // 2. Create Cardcom invoice linked to existing deal (no new card charge)
    if (deps.cardcomCreds?.apiName && deps.cardcomCreds?.apiPassword) {
      try {
        invoiceInfo = await createCardcomInvoiceForDeal({
          dealId: match.deal_id,
          amount: match.amount,
          name: candidate.guestName,
          email: candidate.guestEmail,
          phone: candidate.guestPhone,
          description: `אירוח ב-${candidate.unitName}`,
          apiName: deps.cardcomCreds.apiName,
          apiPassword: deps.cardcomCreds.apiPassword,
          fetchImpl: deps.fetchImpl
        });
        match.invoice_number = invoiceInfo.documentNumber;
        match.invoice_url = invoiceInfo.documentUrl;
      } catch (err: any) {
        deps.logger?.error({ err: err.message }, 'Failed creating Cardcom invoice for deal');
        // Report error to Ran only! Never to the guest.
        await deps.sendWhatsApp(
          sender,
          `⚠️ שים לב: השיוך בוצע בהצלחה, אך הפקת החשבונית ב-Cardcom נכשלה: ${err.message}. ניתן להפיק ידנית.`
        );
      }
    }

    // 3. Record payment into booking clearing_payments
    const { booking: updatedBooking } = recordCardcomTerminalPayment(booking, deal, invoiceInfo || {});
    await deps.patchBooking(candidate.bookingId, {
      clearing_payments: updatedBooking.clearing_payments,
      payment_status: updatedBooking.payment_status,
      payment_mode: updatedBooking.payment_mode
    });
    match.payment_recorded_at = new Date().toISOString();

    await deps.saveMatches(deps.matches);

    // 4. Confirm to Ran
    const docText = match.invoice_number ? ` הופקה חשבונית מס קבלה שמספרה ${match.invoice_number}.` : '';
    const ranConfirmation = `✅ הסליקה בסך ₪${match.amount.toLocaleString('he-IL')} שויכה בהצלחה ל-*${candidate.guestName}* (${candidate.unitName}).${docText}`;
    await deps.sendWhatsApp(sender, ranConfirmation);

    // 5. Send warm WhatsApp to guest asking if they want the invoice
    if (candidate.guestPhone) {
      const guestJid = `${normalizePhone(candidate.guestPhone)}@s.whatsapp.net`;
      const guestMsg = formatGuestConfirmationMessage(deal, booking, candidate.unitName);

      if (defaultRateLimiter.canSend(guestJid).allowed) {
        const guestSent = await deps.sendWhatsApp(guestJid, guestMsg);
        if (guestSent) {
          defaultRateLimiter.recordOutbound(guestJid);
          match.guest_notified_at = new Date().toISOString();
          await deps.saveMatches(deps.matches);

          await deps.logGuestComm?.({
            bookingId: candidate.bookingId,
            direction: 'outbound',
            phone: candidate.guestPhone,
            content: guestMsg,
            channel: 'whatsapp'
          });
        }
      } else {
        deps.logger?.warn({ guestJid }, 'Guest payment confirmation rate limited');
      }
    }

    return { handled: true, reply: ranConfirmation };
  }

  if (choice === '2') {
    const nextIdx = candidateIdx + 1;
    if (nextIdx < match.candidates.length) {
      match.current_candidate_index = nextIdx;
      await deps.saveMatches(deps.matches);

      const nextCandidate = match.candidates[nextIdx];
      const prompt = formatRanApprovalPrompt(deal, nextCandidate, match.candidates.slice(nextIdx + 1));
      const ranReply = `אפשרות הבאה:\n${prompt}`;
      await deps.sendWhatsApp(sender, ranReply);
      return { handled: true, reply: ranReply };
    }

    const noMoreMsg = `אין אפשרויות נוספות במערכת עבור סליקה ₪${match.amount.toLocaleString('he-IL')} (אישור: ${match.approval || 'אין'}). הסליקה תישאר פתוחה לשיוך ידני בדשבורד.`;
    await deps.sendWhatsApp(sender, noMoreMsg);
    return { handled: true, reply: noMoreMsg };
  }

  if (choice === '0') {
    match.status = 'ignored';
    await deps.saveMatches(deps.matches);

    const ignoredMsg = `הסליקה ₪${match.amount.toLocaleString('he-IL')} (אישור: ${match.approval || 'אין'}) סומנה כלא משויכת.`;
    await deps.sendWhatsApp(sender, ignoredMsg);
    return { handled: true, reply: ignoredMsg };
  }

  return { handled: false };
}

/**
 * Handles inbound message from a guest responding "yes" to invoice offer.
 */
export async function handleGuestInvoiceReply(
  senderPhone: string,
  text: string,
  deps: ApprovalDeps
): Promise<boolean> {
  if (!isGuestInvoiceYesReply(text)) {
    return false;
  }

  const normSender = normalizePhone(senderPhone);
  if (!normSender) return false;

  // Find approved match for this guest phone that has invoice_url but hasn't sent it yet
  const match = (deps.matches || []).find((m) => {
    if (m.status !== 'approved' || !m.invoice_url || m.guest_invoice_sent_at) return false;
    const candidate = m.candidates.find((c) => c.bookingId === m.selected_booking_id);
    if (!candidate?.guestPhone) return false;
    return normalizePhone(candidate.guestPhone) === normSender;
  });

  if (!match || !match.invoice_url) {
    return false;
  }

  const candidate = match.candidates.find((c) => c.bookingId === match.selected_booking_id);
  const guestJid = `${normSender}@s.whatsapp.net`;
  const msg = formatGuestInvoiceDeliveryMessage(match.invoice_url, match.invoice_number, candidate?.unitName);

  if (defaultRateLimiter.canSend(guestJid).allowed) {
    const sent = await deps.sendWhatsApp(guestJid, msg);
    if (sent) {
      defaultRateLimiter.recordOutbound(guestJid);
      match.guest_invoice_requested = true;
      match.guest_invoice_sent_at = new Date().toISOString();
      await deps.saveMatches(deps.matches);

      if (match.selected_booking_id) {
        await deps.logGuestComm?.({
          bookingId: match.selected_booking_id,
          direction: 'outbound',
          phone: senderPhone,
          content: msg,
          channel: 'whatsapp'
        });
      }
      return true;
    }
  }

  return false;
}
