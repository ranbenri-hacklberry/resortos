/**
 * Cardcom Terminal Auto-Link & WhatsApp Approval Service
 *
 * Terminal: 184288
 * Auto-links manual terminal charges keyed by Ran in Cardcom app/UI (CardNumberEntryMode=Phone)
 * to ResortOS bookings, requiring owner approval from Ran's private WhatsApp (+972 54-831-7887)
 * via Chloe (051-526-2612).
 *
 * Safety rules:
 * - NEVER charge cards.
 * - NEVER issue an invoice or message a guest before Ran's explicit approval for that deal.
 * - Idempotent: exactly one payment record and one invoice per deal.
 * - Invoices via Cardcom only (TaxInvoiceAndReceipt) linked to existing deal.
 * - If guest has no email, invoice email = mialeesresort@mialees.com.
 * - Respect WhatsApp rate limits: max 2 outbound/60s, max 3 consecutive to a chat without reply.
 */

export const CARDCOM_LIST_URL = 'https://secure.cardcom.solutions/api/v11/Transactions/ListTransactions';
export const CARDCOM_CREATE_DOCUMENT_URL = 'https://secure.cardcom.solutions/api/v11/Documents/CreateDocument';
export const DEFAULT_CARDCOM_TERMINAL = '184288';
export const FALLBACK_INVOICE_EMAIL = 'mialeesresort@mialees.com';
export const RAN_PRIVATE_PHONE_DIGITS = '972548317887';
export const CHLOE_PHONE_DISPLAY = '051-526-2612';

// Rate Limiter tracking state
export class OutboundRateLimiter {
  constructor() {
    this.history = []; // Array of timestamps for global/chat rate limit
    this.consecutiveOutbound = new Map(); // chatId -> count
  }

  canSend(chatId) {
    const now = Date.now();
    // 1. Max 2 outbound per 60s
    this.history = this.history.filter((t) => now - t < 60_000);
    if (this.history.length >= 2) {
      return { allowed: false, reason: 'RATE_LIMIT_60S' };
    }

    // 2. Max 3 consecutive outbound without reply
    const consecutive = this.consecutiveOutbound.get(chatId) || 0;
    if (consecutive >= 3) {
      return { allowed: false, reason: 'MAX_CONSECUTIVE_UNREPLIED' };
    }

    return { allowed: true };
  }

  recordOutbound(chatId) {
    this.history.push(Date.now());
    const count = (this.consecutiveOutbound.get(chatId) || 0) + 1;
    this.consecutiveOutbound.set(chatId, count);
  }

  recordInbound(chatId) {
    // Guest/manager replied, reset consecutive counter
    this.consecutiveOutbound.set(chatId, 0);
  }

  reset() {
    this.history = [];
    this.consecutiveOutbound.clear();
  }
}

export const defaultRateLimiter = new OutboundRateLimiter();

/**
 * Normalizes phone number into clean digits (e.g. 054-831-7887 -> 972548317887)
 */
export function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

/**
 * Checks if a sender is Ran's private number (+972 54-831-7887).
 */
export function isRanPhone(sender) {
  if (!sender) return false;
  const str = String(sender).trim();
  if (str === '170626836910125@lid') return true; // Ran's Baileys LID
  const norm = normalizePhone(str);
  return norm === RAN_PRIVATE_PHONE_DIGITS || norm === '0548317887' || norm === '972548317887';
}

/**
 * Normalizes transaction record from Cardcom ListTransactions API.
 */
export function normalizeCardcomDeal(raw = {}) {
  const dealId = String(
    raw.DealNumber
    || raw.dealNumber
    || raw.TranzactionId
    || raw.TransactionId
    || raw.InternalDealNumber
    || raw.deal_id
    || raw.id
    || ''
  ).trim();

  const terminal = String(raw.TerminalNumber || raw.terminalNumber || raw.terminal || DEFAULT_CARDCOM_TERMINAL).trim();
  const amount = Number(raw.Amount ?? raw.Sum ?? raw.amount ?? 0);
  const approval = String(raw.ApprovalNumber || raw.approvalNumber || raw.ACode || raw.CouponNumber || raw.approval || '').trim();
  const rawLast4 = String(raw.Last4CardDigitsString || raw.Last4CardDigits || raw.CardNumber5 || raw.last4 || '').trim();
  const last4 = rawLast4.replace(/\D/g, '').slice(-4);
  const firstName = String(raw.CardOwnerFirstName || raw.FirstName || '').trim();
  const lastName = String(raw.CardOwnerLastName || raw.LastName || '').trim();
  const fullName = String(raw.CardOwnerName || raw.Name || [firstName, lastName].filter(Boolean).join(' ') || '').trim();
  const entryMode = String(raw.CardNumberEntryMode || raw.cardNumberEntryMode || raw.entry_mode || '').trim();
  const dealTime = raw.CreateDate || raw.DealDate || raw.deal_time || new Date().toISOString();
  const returnValue = String(raw.ReturnValue || raw.returnValue || raw.ExternalId || raw.order || '').trim();
  const documentNumber = String(
    raw.DocumentNumber
    || raw.documentNumber
    || raw.DocNumber
    || raw.docNumber
    || raw.InvoiceNumber
    || raw.invoiceNumber
    || raw.DocumentId
    || raw.InvoiceId
    || ''
  ).trim();
  const documentUrl = String(
    raw.DocumentUrl
    || raw.documentUrl
    || raw.DocUrl
    || raw.docUrl
    || raw.Url
    || raw.url
    || ''
  ).trim();
  const statusStr = String(raw.Status || raw.status || raw.Description || '');
  const responseCode = Number(raw.ResponseCode ?? raw.responseCode ?? 0);

  const isSuccess = responseCode === 0 && !/fail|declined|reject|cancel|בוטל|דחה/i.test(statusStr);

  return {
    dealId,
    terminal,
    amount: Math.round(amount * 100) / 100,
    amountAgorot: Math.round(amount * 100),
    approval,
    last4,
    cardOwnerName: fullName,
    entryMode,
    dealTime,
    returnValue,
    documentNumber,
    documentUrl,
    isSuccess
  };
}

export function formatCardcomDate(d) {
  if (!d) return '';
  const str = String(d).trim();
  if (/^\d{8}$/.test(str)) return str;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  const dateObj = new Date(d);
  if (!isNaN(dateObj.getTime())) {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = String(dateObj.getFullYear());
    return `${day}${month}${year}`;
  }
  return str;
}

/**
 * Calls Cardcom Transactions/ListTransactions API
 */
export async function fetchCardcomTransactions({
  from,
  to,
  terminal = DEFAULT_CARDCOM_TERMINAL,
  apiName,
  apiPassword,
  fetchImpl = fetch,
  timeoutMs = 15000
} = {}) {
  if (!apiName || !apiPassword) {
    throw new Error('MISSING_CARDCOM_CREDENTIALS');
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const fromDate = from || todayIso;
  const toDate = to || todayIso;

  const body = {
    ApiName: apiName,
    ApiPassword: apiPassword,
    TerminalNumber: Number(terminal),
    FromDate: formatCardcomDate(fromDate),
    ToDate: formatCardcomDate(toDate),
    Page: 1,
    Page_size: 50
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(CARDCOM_LIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      const err = new Error(data?.Description || `Cardcom API returned ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    const list = data.Transactions
      || data.Tranzactions
      || data.Deals
      || (Array.isArray(data) ? data : []);

    return list
      .map(normalizeCardcomDeal)
      .filter((d) => d.dealId && d.isSuccess);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calculates due amount in ILS for a booking.
 */
export function getBookingDueIls(booking) {
  if (!booking) return 0;
  if (String(booking.payment_status || '').toUpperCase() === 'PAID') return 0;
  const total = Number(booking.total_price_agorot) || 0;
  const clearing = Array.isArray(booking.clearing_payments) ? booking.clearing_payments : [];
  const paid = clearing.reduce((s, row) => s + (Number(row.amount_agorot) || 0), 0);
  return Math.max(0, Math.round((total - paid) / 100));
}

/**
 * Helper to compute string similarity between names.
 */
function nameSimilarity(strA, strB) {
  const clean = (s) => String(s || '').toLowerCase().replace(/[^a-zא-ת0-9\s]/gi, '').trim();
  const a = clean(strA);
  const b = clean(strB);
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.85;

  const wordsA = a.split(/\s+/).filter((w) => w.length > 1);
  const wordsB = b.split(/\s+/).filter((w) => w.length > 1);
  const overlap = wordsA.filter((w) => wordsB.includes(w));
  if (overlap.length > 0) {
    return 0.5 + 0.3 * (overlap.length / Math.max(wordsA.length, wordsB.length));
  }
  return 0;
}

/**
 * Ranks candidate bookings for an unlinked Cardcom terminal deal.
 * Returns top 1-3 candidates sorted by highest score.
 */
export function rankCandidateBookings(deal, bookings = [], todayStr = new Date().toISOString().slice(0, 10)) {
  const dealAmount = Number(deal.amount);
  if (!Number.isFinite(dealAmount) || dealAmount <= 0) return [];

  const candidates = [];

  for (const b of bookings) {
    if (!b || b.booking_status === 'CANCELED' || b.booking_status === 'DELETED') continue;

    // Check if deal is already recorded on this booking
    const clearing = Array.isArray(b.clearing_payments) ? b.clearing_payments : [];
    const alreadyLinked = clearing.some((row) => (
      String(row.deal_number || row.txn || '').trim() === deal.dealId
      || (deal.approval && String(row.approval || row.ref || '').trim() === deal.approval)
    ));
    if (alreadyLinked) continue;

    const totalAgorot = Number(b.total_price_agorot) || 0;
    const paidAgorot = clearing.reduce((s, row) => s + (Number(row.amount_agorot) || 0), 0);
    const dueIls = Math.max(0, Math.round((totalAgorot - paidAgorot) / 100));
    const depositIls = Math.round((Number(b.deposit_agorot) || 0) / 100);
    const totalIls = Math.round(totalAgorot / 100);

    const guestName = String(b.guest_name || '').trim();
    const cin = String(b.check_in_date || '').slice(0, 10);
    const cout = String(b.check_out_date || '').slice(0, 10);

    let score = 0;
    const reasons = [];

    // 1. Amount match (0-50 pts)
    if (dueIls > 0 && Math.abs(dealAmount - dueIls) < 0.05) {
      score += 50;
      reasons.push('exact_due_balance');
    } else if (depositIls > 0 && Math.abs(dealAmount - depositIls) < 0.05) {
      score += 45;
      reasons.push('exact_deposit');
    } else if (totalIls > 0 && Math.abs(dealAmount - totalIls) < 0.05) {
      score += 40;
      reasons.push('exact_total');
    } else if (dueIls > 0 && dealAmount < dueIls) {
      score += 25;
      reasons.push('partial_balance');
    } else if (dueIls > 0 && Math.abs(dealAmount - dueIls) / dueIls <= 0.1) {
      score += 20;
      reasons.push('close_balance');
    }

    // 2. Name match (0-35 pts)
    if (deal.cardOwnerName && guestName) {
      const sim = nameSimilarity(deal.cardOwnerName, guestName);
      if (sim >= 0.85) {
        score += 35;
        reasons.push('strong_name_match');
      } else if (sim >= 0.5) {
        score += 20;
        reasons.push('partial_name_match');
      }
    }

    // 3. Phone match (0-30 pts)
    if (deal.phone && b.guest_phone) {
      const p1 = normalizePhone(deal.phone);
      const p2 = normalizePhone(b.guest_phone);
      if (p1 && p2 && p1 === p2) {
        score += 30;
        reasons.push('phone_match');
      }
    }

    // 4. Date proximity (0-15 pts)
    if (cin && cout) {
      const inStay = cin <= todayStr && cout >= todayStr;
      const arrivesToday = cin === todayStr;
      const departsToday = cout === todayStr;

      if (inStay || arrivesToday) {
        score += 15;
        reasons.push('in_house_or_today');
      } else if (departsToday) {
        score += 12;
        reasons.push('departs_today');
      } else if (cin > todayStr) {
        const daysDiff = (new Date(cin).getTime() - new Date(todayStr).getTime()) / (24 * 3600 * 1000);
        if (daysDiff <= 3) {
          score += 10;
          reasons.push('arriving_soon');
        } else if (daysDiff <= 14) {
          score += 5;
          reasons.push('upcoming');
        }
      }
    }

    // 5. Explicit ReturnValue / ExternalId match (+100 pts)
    if (deal.returnValue && (deal.returnValue === b.id || deal.returnValue === b.checkout_token)) {
      score += 100;
      reasons.push('direct_return_value_match');
    }

    if (score >= 20) {
      candidates.push({
        bookingId: b.id,
        checkoutToken: b.checkout_token,
        guestName,
        guestPhone: b.guest_phone,
        guestEmail: b.guest_email,
        unitId: b.unit_id,
        unitName: b.unit_name || b.unit_id || 'יחידה',
        checkIn: cin,
        checkOut: cout,
        dueIls,
        totalIls,
        score,
        reasons
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 3);
}

/**
 * Formats WhatsApp message to Ran requesting approval to link terminal charge.
 */
export function formatRanApprovalPrompt(deal, candidate, alternativeCandidates = []) {
  const time = deal.dealTime
    ? new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }).format(new Date(deal.dealTime))
    : 'במהלך היום';

  const amountFormatted = Number(deal.amount).toLocaleString('he-IL');
  const dateFormatted = candidate.checkIn && candidate.checkOut
    ? `${candidate.checkIn.slice(5).replace('-', '/')}-${candidate.checkOut.slice(5).replace('-', '/')}`
    : '';

  const unitDesc = candidate.unitName || candidate.unitId || '';
  const guestDesc = candidate.guestName || 'אורח ללא שם';
  const isPartial = candidate.dueIls != null && candidate.dueIls > Number(deal.amount);
  const remIls = isPartial ? candidate.dueIls - Number(deal.amount) : 0;
  const partialNote = isPartial ? ` (תשלום חלקי, תישאר יתרה ₪${remIls.toLocaleString('he-IL')})` : '';
  const balanceStr = candidate.dueIls != null ? `יתרה ₪${candidate.dueIls.toLocaleString('he-IL')}${partialNote}` : '';

  let msg = `💳 *סליקה חדשה* ₪${amountFormatted}, 4 ספרות ${deal.last4 || '****'}, אישור ${deal.approval || 'אין'}, שעה ${time}.\n`;
  msg += `נראה שזה *${guestDesc}* – ${unitDesc}, ${dateFormatted}, ${balanceStr}.\n`;

  if (alternativeCandidates.length > 0) {
    msg += `(קיימות עוד ${alternativeCandidates.length} אפשרויות במערכת).\n`;
  }

  msg += `לשייך? השב *1* לאישור / *2* לאפשרות הבאה / *0* לא לשייך`;
  return msg;
}

/**
 * Resolves customer name, tax ID (ח.פ.), invoice description, and guest notification text
 * from a booking record.
 * Handles company bookings with custom line items (e.g. "סדנה", company name + ח.פ.)
 * and falls back to "אירוח" only when nothing else is defined.
 */
export function resolveBookingInvoiceDetails(booking = {}, unitName = '') {
  // 1. Company name & tax ID / ח.פ.
  const companyName = String(
    booking.company_name ||
    booking.invoice_company ||
    booking.business_name ||
    ''
  ).trim();

  const taxId = String(
    booking.tax_id ||
    booking.company_hp ||
    booking.hp ||
    booking.vat_id ||
    booking.business_id ||
    booking.company_id ||
    ''
  ).trim();

  let invoiceCustomerName = String(
    booking.invoice_name ||
    companyName ||
    booking.guest_name ||
    'אורח'
  ).trim();

  if (taxId) {
    if (!invoiceCustomerName.includes(taxId)) {
      invoiceCustomerName = `${invoiceCustomerName} ח.פ. ${taxId}`;
    }
  }

  // 2. Custom line / description (e.g. "סדנה")
  const customLine = String(
    booking.custom_invoice_line ||
    booking.invoice_line ||
    booking.custom_line ||
    booking.invoice_description ||
    booking.line_item ||
    booking.service_description ||
    ''
  ).trim();

  const unit = unitName || booking.unit_name || booking.unit_id || '';
  const isStay = Boolean(!customLine && unit);

  // Line item for Cardcom Invoice product description
  let invoiceLine = customLine;
  if (!invoiceLine) {
    invoiceLine = unit ? `אירוח ב-${unit}` : 'אירוח ונופש';
  }

  // Description phrase used in guest WhatsApp text:
  // "התשלום בסך ₪X עבור <תיאור> התקבל בהצלחה (אישור: NNNN)"
  // unit name only when it's a stay!
  let guestDescription = customLine;
  if (!guestDescription) {
    guestDescription = unit ? `האירוח ב-${unit}` : 'האירוח';
  }

  return {
    invoiceCustomerName,
    taxId,
    companyName,
    customLine,
    invoiceLine,
    guestDescription,
    isStay
  };
}

/**
 * Formats warm guest confirmation WhatsApp message asking if they'd like their invoice.
 * Uses booking description/custom line when defined (e.g. "סדנה"), and unit name only when it's a stay.
 * If an invoice was emailed to the guest, says it was sent to their email and asks if they also want it in WhatsApp;
 * if no email, asks if to send it in WhatsApp.
 */
export function formatGuestConfirmationMessage(deal, booking = {}, unitName = '', options = {}) {
  const guestName = (booking.guest_name || booking.invoice_name || 'שלום').trim().split(/\s+/)[0];
  const amountFormatted = Number(deal.amount).toLocaleString('he-IL');
  const approval = deal.approval ? ` (אישור: ${deal.approval})` : '';

  const { guestDescription } = resolveBookingInvoiceDetails(booking, unitName);

  const hasEmail = Boolean(
    options.hasGuestEmail ??
    ((booking && (booking.guest_email || booking.email || booking.invoice_email)) || options.guestEmail)
  );

  const invoicePart = hasEmail
    ? 'החשבונית נשלחה למייל שלך. לשלוח לך אותה גם לכאן בווטסאפ?'
    : 'לשלוח לך את החשבונית לכאן בווטסאפ?';

  return `שלום ${guestName}, התשלום בסך ₪${amountFormatted} עבור ${guestDescription} התקבל בהצלחה${approval}. ${invoicePart}`;
}

/**
 * Formats guest invoice delivery message with link.
 */
export function formatGuestInvoiceDeliveryMessage(invoiceUrl, invoiceNumber, unitName = '', customLine = '') {
  const docRef = invoiceNumber ? ` מס׳ ${invoiceNumber}` : '';
  const descRef = customLine ? ` עבור ${customLine}` : (unitName ? ` עבור השהייה שלך ב-${unitName}` : ' עבור השהייה שלך');
  return `בשמחה! הנה קישור לחשבונית המס קבלה${docRef}${descRef}:\n${invoiceUrl}\nנשמח לעמוד לרשותך לכל דבר נוסף ✨`;
}

/**
 * Creates Cardcom invoice for an existing approved transaction (No new card charge).
 * Emits invoice to company name + ח.פ. when available, with custom line item.
 * If the guest/company has no email in ResortOS, sends invoice to mialeesresort@mialees.com.
 */
export async function createCardcomInvoiceForDeal({
  dealId,
  amount,
  booking,
  name,
  email,
  phone,
  description,
  apiName,
  apiPassword,
  fetchImpl = fetch,
  timeoutMs = 15000
} = {}) {
  if (!dealId) throw new Error('MISSING_DEAL_ID');
  if (!apiName || !apiPassword) throw new Error('MISSING_CARDCOM_CREDENTIALS');

  const resolved = booking ? resolveBookingInvoiceDetails(booking, booking.unit_name) : null;

  const customerName = resolved?.invoiceCustomerName || String(name || '').trim() || 'אורח';
  const customerEmail = String((booking && (booking.guest_email || booking.email || booking.invoice_email)) || email || '').trim();
  const hasGuestEmail = Boolean(customerEmail && customerEmail.includes('@'));
  const invoiceEmail = hasGuestEmail ? customerEmail : FALLBACK_INVOICE_EMAIL;
  const customerPhone = String((booking && (booking.guest_phone || booking.phone)) || phone || '').trim();
  const invoiceDesc = resolved?.invoiceLine || String(description || 'אירוח ונופש').slice(0, 200);

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
          Description: invoiceDesc,
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
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(CARDCOM_CREATE_DOCUMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const data = await res.json().catch(() => null);
    const code = Number(data?.ResponseCode);
    const documentNumber = String(data?.DocumentNumber || data?.documentNumber || data?.DocNumber || '').trim();

    if (!res.ok || code !== 0 || !documentNumber) {
      const err = new Error(data?.Description || `Cardcom Document creation failed (code ${code})`);
      err.responseCode = code;
      err.data = data;
      throw err;
    }

    return {
      documentNumber,
      documentUrl: String(data?.DocumentUrl || data?.DocUrl || data?.Url || ''),
      description: String(data?.Description || ''),
      emailSentTo: invoiceEmail,
      hasGuestEmail
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Idempotently appends or updates payment record on booking.
 */
export function recordCardcomTerminalPayment(booking, deal, invoiceInfo = {}) {
  const existing = Array.isArray(booking?.clearing_payments) ? booking.clearing_payments.slice() : [];
  const dealStr = String(deal.dealId || deal.deal_id || '').trim();
  const invoiceNum = String(invoiceInfo.documentNumber || invoiceInfo.invoice || '').trim();
  const invoiceUrl = String(invoiceInfo.documentUrl || invoiceInfo.invoice_url || '').trim();
  const amountAgorot = deal.amountAgorot || Math.round(Number(deal.amount || 0) * 100);
  const amountIls = Number(deal.amount || (amountAgorot / 100));

  const existingIdx = existing.findIndex((row) => (
    (dealStr && (row.deal_number === dealStr || row.txn === dealStr))
    || (deal.approval && row.approval === deal.approval && Math.abs(Number(row.amount_agorot || (Number(row.amount_ils) * 100)) - amountAgorot) < 5)
  ));

  const entry = {
    gateway: 'cardcom',
    channel: 'terminal_manual',
    source: 'CARD',
    method: 'CARD',
    deal_number: dealStr,
    txn: dealStr,
    approval: String(deal.approval || ''),
    ref: String(deal.approval || ''),
    last4: String(deal.last4 || '').replace(/\D/g, '').slice(-4),
    amount_ils: amountIls,
    amount_agorot: amountAgorot,
    document_number: invoiceNum,
    invoice: invoiceNum,
    document_url: invoiceUrl,
    invoice_url: invoiceUrl,
    payer_name: String(deal.cardOwnerName || booking.guest_name || ''),
    at: deal.dealTime || new Date().toISOString(),
    date: (deal.dealTime || new Date().toISOString()).slice(0, 10),
    recorded_via: 'cardcom_terminal_autolink',
    recorded_at: new Date().toISOString()
  };

  let nextClearing;
  if (existingIdx >= 0) {
    // Update existing record with invoice details if newly available
    const prev = existing[existingIdx];
    existing[existingIdx] = {
      ...prev,
      document_number: invoiceNum || prev.document_number || prev.invoice || '',
      invoice: invoiceNum || prev.invoice || prev.document_number || '',
      document_url: invoiceUrl || prev.document_url || prev.invoice_url || '',
      invoice_url: invoiceUrl || prev.invoice_url || prev.document_url || '',
      approval: entry.approval || prev.approval || prev.ref || '',
      ref: entry.approval || prev.approval || prev.ref || '',
      last4: entry.last4 || prev.last4 || '',
      payer_name: entry.payer_name || prev.payer_name || ''
    };
    nextClearing = existing;
  } else {
    nextClearing = existing.concat(entry);
  }

  const paidAgorot = nextClearing.reduce((sum, r) => sum + (Number(r.amount_agorot) || 0), 0);
  const totalAgorot = Number(booking.total_price_agorot) || 0;

  const nextBooking = {
    ...booking,
    clearing_payments: nextClearing,
    payment_mode: booking.payment_mode || 'CARD'
  };

  if (totalAgorot > 0 && paidAgorot + 1 >= totalAgorot) {
    nextBooking.payment_status = 'PAID';
  } else if (paidAgorot > 0) {
    nextBooking.payment_status = booking.payment_status === 'PAID' ? 'PAID' : 'PARTIAL';
  }

  return {
    booking: nextBooking,
    paymentEntry: entry,
    isDuplicate: existingIdx >= 0
  };
}
