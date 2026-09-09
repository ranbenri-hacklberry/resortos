import { kvSessionStore, quoteKinorotCheckin } from './kinorotCheckin.js';
import { kinorotResid } from './kinorotZcredit.js';
import {
  chargeHypToken,
  createHypPaymentPage,
  hypMasofForTerminal,
  hypPublicResult
} from './hypPay.js';

function recordedPaidAgorot(booking) {
  const stored = Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [];
  const clearing = stored.reduce((sum, row) => sum + (Number(row.amount_agorot) || 0), 0);
  if (booking?.payment_status === 'PAID' || booking?.stay?.hyp?.paid) {
    return Math.max(Number(booking?.total_price_agorot) || 0, clearing);
  }
  if (
    booking?.stay?.hyp_deposit?.paid
    || booking?.payment_status === 'DEPOSIT_PAID'
    || booking?.payment_status === 'PARTIAL'
  ) {
    return Math.max(Number(booking?.deposit_agorot) || 0, clearing);
  }
  return clearing;
}

function bookingDueIls(booking) {
  const total = Number(booking?.total_price_agorot || 0);
  const due = Math.max(0, total - recordedPaidAgorot(booking)) / 100;
  return Math.round(due * 100) / 100;
}

export function stayFullyPaid(booking) {
  if (booking?.payment_status === 'PAID' || booking?.stay?.hyp?.paid) return true;
  const total = Number(booking?.total_price_agorot) || 0;
  if (total <= 0) return false;
  return recordedPaidAgorot(booking) + 50 >= total;
}

export function resolveGuestTerminal(booking) {
  const raw = booking?.hyp_terminal || booking?.stay?.hyp_terminal || booking?.stay?.hyp_intent?.terminal;
  const t = String(raw || '').toUpperCase();
  if (t === 'A' || t === 'B') return t;
  return booking?.payment_mode === 'CREDIT_FULL' ? 'A' : 'B';
}

export function quoteGuestCharge(booking) {
  const mode = booking?.payment_mode || 'CREDIT_DEPOSIT';
  const total = Math.round((Number(booking?.total_price_agorot || 0) / 100) * 100) / 100;
  const deposit = Math.round((Number(booking?.deposit_agorot || 0) / 100) * 100) / 100;
  const terminal = resolveGuestTerminal(booking);
  if (mode === 'CREDIT_FULL') {
    return {
      amount: total,
      purpose: 'balance',
      terminal,
      needsCharge: total > 0.5,
      label: 'שהייה'
    };
  }
  return {
    amount: deposit,
    purpose: 'deposit',
    terminal,
    needsCharge: deposit > 0.5,
    label: 'מקדמה'
  };
}

export async function quoteCheckin(booking, env) {
  const card = booking?.stay?.hyp_card || {};
  const due = bookingDueIls(booking);
  const quote = {
    resid: kinorotResid(booking),
    amount: due,
    last4: String(card.last_4 || card.last4 || '').slice(-4),
    hasCard: Boolean(card.token || card.has_token),
    brand: String(card.card_brand || card.brand || ''),
    invoiceName: booking.guest_name || '',
    needsCharge: due > 0.5,
    available: true,
    source: 'booking',
    purpose: 'balance',
    terminal: 'A'
  };
  if (
    quote.resid
    && env.KINOROT_USER
    && env.KINOROT_PASSWORD
    && booking?.channel_source !== 'DEMO'
    && !booking?.stay?.demo
  ) {
    try {
      const kinorot = await quoteKinorotCheckin(booking, env, kvSessionStore(env));
      if (kinorot?.available && Number(kinorot.amount) > 0) {
        return {
          ...quote,
          ...kinorot,
          last4: quote.last4 || String(kinorot.last4 || ''),
          hasCard: quote.hasCard || Boolean(kinorot.last4),
          brand: quote.brand || String(kinorot.brand || ''),
          needsCharge: Number(kinorot.amount) > 0.5,
          source: 'kinorot',
          purpose: 'balance',
          terminal: 'A'
        };
      }
    } catch (_) {}
  }
  return quote;
}

function stayInfo(booking) {
  const nights = booking.check_in_date && booking.check_out_date
    ? `${booking.check_in_date}–${booking.check_out_date}`
    : '';
  return [booking.unit_id, booking.guest_name, nights].filter(Boolean).join(' · ');
}

export async function startCardCheckin(booking, env, { successUrl, failUrl } = {}) {
  const quote = await quoteCheckin(booking, env);
  if (!quote.needsCharge) {
    return { quote, payUrl: null, skipped: true, purpose: 'balance', terminal: 'A' };
  }
  const info = stayInfo(booking);
  const created = await createHypPaymentPage(env, {
    purpose: 'balance',
    terminal: 'A',
    amount: quote.amount,
    order: String(booking.checkout_token || booking.id || '').slice(0, 50),
    clientName: quote.invoiceName || booking.guest_name || '',
    email: booking.guest_email || '',
    cell: booking.guest_phone || '',
    info,
    heshDesc: `[0~${info || 'שהייה'}~1~${Number(quote.amount).toFixed(2)}]`,
    successUrl,
    failUrl
  });
  return {
    quote,
    payUrl: created.payUrl,
    iframeUrl: created.iframeUrl || created.payUrl,
    embed: Boolean(created.embed),
    lowProfileId: created.lowProfileId || '',
    skipped: false,
    purpose: 'balance',
    terminal: created.terminal
  };
}

export function hypClientPayment(started, extra = {}) {
  return {
    quote: started.quote,
    pay_url: started.payUrl || null,
    iframe_url: started.iframeUrl || started.payUrl || null,
    embed: Boolean(started.embed),
    purpose: started.purpose,
    ...extra
  };
}

export async function chargeSavedCardCheckin(booking, env) {
  const quote = await quoteCheckin(booking, env);
  const card = booking?.stay?.hyp_card || {};
  const token = String(card.token || '').trim();
  if (!quote.needsCharge) {
    return { quote, charged: false, skipped: true, params: {}, terminal: 'A' };
  }
  if (!token) {
    const err = new Error('NO_SAVED_CARD');
    err.code = 'NO_SAVED_CARD';
    throw err;
  }
  const info = stayInfo(booking);
  const charged = await chargeHypToken(env, {
    terminal: 'A',
    amount: quote.amount,
    token,
    exp_month: card.exp_month,
    exp_year: card.exp_year,
    order: String(booking.checkout_token || booking.id || '').slice(0, 50),
    clientName: quote.invoiceName || booking.guest_name || '',
    email: booking.guest_email || '',
    cell: booking.guest_phone || '',
    info: `יתרה · ${info}`
  });
  return {
    quote,
    charged: true,
    skipped: false,
    params: charged.params,
    terminal: charged.terminal,
    result: charged.result
  };
}

export async function startGuestPayment(booking, env, { successUrl, failUrl } = {}) {
  const quote = quoteGuestCharge(booking);
  if (!quote.needsCharge) {
    return { quote, payUrl: null, skipped: true, purpose: quote.purpose, terminal: quote.terminal };
  }
  const token = String(booking.checkout_token || booking.id || '').slice(0, 50);
  const info = [token, quote.label, stayInfo(booking)].filter(Boolean).join(' · ');
  const created = await createHypPaymentPage(env, {
    purpose: quote.purpose,
    terminal: quote.terminal,
    amount: quote.amount,
    order: token,
    clientName: booking.guest_name || '',
    email: booking.guest_email || '',
    cell: booking.guest_phone || '',
    info,
    heshDesc: `[0~${info || quote.label}~1~${Number(quote.amount).toFixed(2)}]`,
    successUrl,
    failUrl,
    tokenize: true
  });
  return {
    quote,
    payUrl: created.payUrl,
    iframeUrl: created.iframeUrl || created.payUrl,
    embed: Boolean(created.embed),
    lowProfileId: created.lowProfileId || '',
    skipped: false,
    purpose: created.purpose,
    terminal: created.terminal
  };
}

export function hypAlreadyPaid(row) {
  return Boolean(row?.stay?.hyp?.paid) || row?.payment_status === 'PAID';
}

export function hypDepositPaid(row) {
  return Boolean(row?.stay?.hyp_deposit?.paid)
    || row?.payment_status === 'DEPOSIT_PAID'
    || row?.payment_status === 'PAID';
}

function appendClearingPayment(row, result, terminal) {
  const masof = hypMasofForTerminal(terminal);
  const payment = {
    source: 'HYP',
    accountKey: `HYP_${masof}`,
    accountLabel: 'מקס 1086759',
    accountDetail: `Hyp מסוף ${masof}`,
    merchantId: '1086759',
    terminalId: masof,
    acquirer: 'MAX',
    ref: String(result.auth || ''),
    txn: String(result.id || ''),
    invoice: String(result.hesh || ''),
    amount_agorot: Math.round(Number(result.amount || 0) * 100),
    date: new Date().toISOString().slice(0, 10),
    at: new Date().toISOString(),
    last4: String(result.last4 || ''),
    brand: String(result.brand || '')
  };
  const existing = Array.isArray(row.clearing_payments) ? row.clearing_payments : [];
  const key = payment.txn || payment.ref;
  row.clearing_payments = key && existing.some((item) => (item.txn || item.ref) === key)
    ? existing
    : existing.concat(payment);
  return payment;
}

function attachHypCard(stay, result, terminal) {
  const token = String(result?.token || '').trim();
  if (!token) return;
  stay.hyp_card = {
    gateway: 'hyp',
    token,
    last_4: String(result.last4 || '').slice(-4),
    card_brand: String(result.brand || ''),
    exp_month: String(result.exp_month || '').slice(-2),
    exp_year: String(result.exp_year || '').slice(-2),
    terminal: String(terminal || stay.hyp_card?.terminal || '').toUpperCase() || null,
    saved_at: new Date().toISOString()
  };
}

export function withoutCardToken(result) {
  if (!result || typeof result !== 'object') return result;
  const { token, ...rest } = result;
  return rest;
}

export function applyHypPaid(row, stay, params, opts = {}) {
  const purpose = opts.purpose || stay.hyp_intent?.purpose || 'balance';
  const stage = opts.stage || stay.hyp_intent?.stage || (purpose === 'deposit' ? 'confirm' : 'checkin');
  const terminal = opts.terminal || stay.hyp_intent?.terminal || (purpose === 'deposit' ? 'B' : 'A');
  const result = hypPublicResult(params || {});
  stay.hyp_intent = {
    ...(stay.hyp_intent || {}),
    purpose,
    terminal,
    stage,
    status: 'paid'
  };
  appendClearingPayment(row, {
    ...result,
    amount: Number(result.amount || stay.hyp_intent?.amount || 0)
  }, terminal);
  attachHypCard(stay, result, terminal);
  const safeResult = withoutCardToken(result);
  const paidAgorot = (Array.isArray(row.clearing_payments) ? row.clearing_payments : [])
    .reduce((sum, item) => sum + (Number(item.amount_agorot) || 0), 0);
  const totalAgorot = Number(row.total_price_agorot) || 0;
  const covered = totalAgorot > 0 && paidAgorot + 50 >= totalAgorot;

  if (!covered) {
    stay.hyp = {
      paid: false,
      partial: true,
      at: new Date().toISOString(),
      terminal,
      ...safeResult
    };
    if (purpose === 'deposit') {
      stay.hyp_deposit = {
        paid: true,
        at: new Date().toISOString(),
        terminal,
        ...safeResult
      };
    }
    if (row.booking_status !== 'CHECKED_IN' && row.booking_status !== 'CHECKED_OUT') {
      row.booking_status = 'CONFIRMED';
    }
    row.payment_status = purpose === 'deposit' ? 'DEPOSIT_PAID' : 'PARTIAL';
    row.payment_mode = purpose === 'deposit' ? (row.payment_mode || 'CREDIT_DEPOSIT') : 'CARD';
    row.balance_paid = false;
    stay.balance_paid = false;
    return result;
  }

  const splitCabin = stay.pay_split === 'per_cabin'
    ? String(opts.cabinId || stay.hyp_intent?.cabin_id || stay.booker_cabin_id || row.unit_id || '')
    : '';
  if (splitCabin) {
    stay.cabin_paid = {
      ...(stay.cabin_paid || {}),
      [splitCabin]: { paid: true, at: new Date().toISOString(), purpose: 'balance' }
    };
    attachHypCard(stay, result, terminal);
    const ids = [].concat(stay.cabin_ids || row.unit_id).map((id) => String(id || '').trim()).filter(Boolean);
    const allPaid = ids.length > 0 && ids.every((id) => stay.cabin_paid?.[id]?.paid);
    if (allPaid) {
      stay.hyp = {
        paid: true,
        at: new Date().toISOString(),
        terminal,
        ...safeResult
      };
      row.payment_status = 'PAID';
      row.balance_paid = true;
      row.balance_paid_at = new Date().toISOString();
      row.balance_payment_method = 'CREDIT_CARD';
      stay.balance_paid = true;
    }
    if (stage === 'checkin') {
      stay.guest_checked_in_at = stay.guest_checked_in_at || new Date().toISOString();
      stay.payment_choice = 'CARD';
      row.booking_status = 'CHECKED_IN';
      row.payment_mode = 'CARD';
    } else if (row.booking_status !== 'CHECKED_IN' && row.booking_status !== 'CHECKED_OUT') {
      row.booking_status = 'CONFIRMED';
    }
    return result;
  }

  stay.hyp = {
    paid: true,
    at: new Date().toISOString(),
    terminal,
    ...safeResult
  };
  row.payment_status = 'PAID';
  if (stage === 'checkin') {
    stay.guest_checked_in_at = stay.guest_checked_in_at || new Date().toISOString();
    stay.payment_choice = 'CARD';
    row.booking_status = 'CHECKED_IN';
    row.payment_mode = 'CARD';
  } else if (row.booking_status !== 'CHECKED_IN' && row.booking_status !== 'CHECKED_OUT') {
    row.booking_status = 'CONFIRMED';
    row.payment_mode = row.payment_mode || 'CREDIT_FULL';
  }
  row.balance_paid = true;
  row.balance_paid_at = new Date().toISOString();
  row.balance_payment_method = 'CREDIT_CARD';
  stay.balance_paid = true;
  return result;
}
