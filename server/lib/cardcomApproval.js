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

import {
  isRanPhone,
  formatRanApprovalPrompt,
  formatGuestConfirmationMessage,
  formatGuestInvoiceDeliveryMessage,
  createCardcomInvoiceForDeal,
  recordCardcomTerminalPayment,
  defaultRateLimiter,
  normalizePhone
} from './cardcomTerminalService.js';

export function parseRanApprovalChoice(text) {
  const clean = String(text || '').trim();
  if (/^(?:1|כן|אשר|אישור|1 לאישור|yes)$/i.test(clean)) return '1';
  if (/^(?:2|הבא|האפשרות הבאה|2 לאפשרות הבאה|next)$/i.test(clean)) return '2';
  if (/^(?:0|לא|התעלם|אל תשייך|0 לא לשייך|no|ignore)$/i.test(clean)) return '0';
  return null;
}

export function isGuestInvoiceYesReply(text) {
  const clean = String(text || '').trim();
  return /^(?:כן|אשמח|תודה|שלח|שלחי|בטח|בבקשה|כן בבקשה|yes|send|please)(?:$|\s|[!?.,])/i.test(clean);
}

/**
 * Handles inbound message from Ran if there is an active pending terminal match.
 */
export async function handleRanTerminalInbound(
  sender,
  text,
  deps = {}
) {
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
    const booking = await deps.loadBooking(candidate.bookingId);
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
      } catch (err) {
        deps.logger?.error({ err: err.message }, 'Failed creating Cardcom invoice for deal');
        // Report error to Ran only! Never to the guest.
        await deps.sendWhatsApp?.(
          sender,
          `⚠️ שים לב: השיוך בוצע בהצלחה, אך הפקת החשבונית ב-Cardcom נכשלה: ${err.message}. ניתן להפיק ידנית.`
        );
      }
    }

    // 3. Record payment into booking clearing_payments
    const { booking: updatedBooking } = recordCardcomTerminalPayment(booking, deal, invoiceInfo || {});
    await deps.patchBooking?.(candidate.bookingId, {
      clearing_payments: updatedBooking.clearing_payments,
      payment_status: updatedBooking.payment_status,
      payment_mode: updatedBooking.payment_mode
    });
    match.payment_recorded_at = new Date().toISOString();

    await deps.saveMatches?.(deps.matches);

    // 4. Confirm to Ran
    const docText = match.invoice_number ? ` הופקה חשבונית מס קבלה שמספרה ${match.invoice_number}.` : '';
    const ranConfirmation = `✅ הסליקה בסך ₪${match.amount.toLocaleString('he-IL')} שויכה בהצלחה ל-*${candidate.guestName}* (${candidate.unitName}).${docText}`;
    await deps.sendWhatsApp?.(sender, ranConfirmation);

    // 5. Send warm WhatsApp to guest asking if they want the invoice
    if (candidate.guestPhone) {
      const guestJid = `${normalizePhone(candidate.guestPhone)}@s.whatsapp.net`;
      const guestMsg = formatGuestConfirmationMessage(deal, booking, candidate.unitName);

      if (defaultRateLimiter.canSend(guestJid).allowed) {
        const guestSent = await deps.sendWhatsApp?.(guestJid, guestMsg);
        if (guestSent) {
          defaultRateLimiter.recordOutbound(guestJid);
          match.guest_notified_at = new Date().toISOString();
          await deps.saveMatches?.(deps.matches);

          await deps.logGuestComm?.({
            bookingId: candidate.bookingId,
            direction: 'outbound',
            phone: candidate.guestPhone,
            content: guestMsg,
            channel: 'whatsapp'
          });
        }
      } else {
        deps.logger?.warn?.({ guestJid }, 'Guest payment confirmation rate limited');
      }
    }

    return { handled: true, reply: ranConfirmation };
  }

  if (choice === '2') {
    const nextIdx = candidateIdx + 1;
    if (nextIdx < match.candidates.length) {
      match.current_candidate_index = nextIdx;
      await deps.saveMatches?.(deps.matches);

      const nextCandidate = match.candidates[nextIdx];
      const prompt = formatRanApprovalPrompt(deal, nextCandidate, match.candidates.slice(nextIdx + 1));
      const ranReply = `אפשרות הבאה:\n${prompt}`;
      await deps.sendWhatsApp?.(sender, ranReply);
      return { handled: true, reply: ranReply };
    }

    const noMoreMsg = `אין אפשרויות נוספות במערכת עבור סליקה ₪${match.amount.toLocaleString('he-IL')} (אישור: ${match.approval || 'אין'}). הסליקה תישאר פתוחה לשיוך ידני בדשבורד.`;
    await deps.sendWhatsApp?.(sender, noMoreMsg);
    return { handled: true, reply: noMoreMsg };
  }

  if (choice === '0') {
    match.status = 'ignored';
    await deps.saveMatches?.(deps.matches);

    const ignoredMsg = `הסליקה ₪${match.amount.toLocaleString('he-IL')} (אישור: ${match.approval || 'אין'}) סומנה כלא משויכת.`;
    await deps.sendWhatsApp?.(sender, ignoredMsg);
    return { handled: true, reply: ignoredMsg };
  }

  return { handled: false };
}

/**
 * Handles inbound message from a guest responding "yes" to invoice offer.
 */
export async function handleGuestInvoiceReply(
  senderPhone,
  text,
  deps = {}
) {
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
    const sent = await deps.sendWhatsApp?.(guestJid, msg);
    if (sent) {
      defaultRateLimiter.recordOutbound(guestJid);
      match.guest_invoice_requested = true;
      match.guest_invoice_sent_at = new Date().toISOString();
      await deps.saveMatches?.(deps.matches);

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
