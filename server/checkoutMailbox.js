const TOKEN_RE = /^tok_[A-Za-z0-9_-]+$/;

function mailboxUrl() {
  return (process.env.CHECKOUT_MAILBOX_URL || 'https://resortos.app').replace(/\/$/, '');
}

function mailboxSecret() {
  return process.env.CHECKOUT_MAILBOX_SECRET || '';
}

function mailboxHeaders(json = false) {
  const headers = { 'x-hotelos-mailbox': mailboxSecret() };
  if (json) headers['content-type'] = 'application/json';
  return headers;
}

export function isMailboxConfigured() {
  return Boolean(mailboxSecret());
}

async function mailboxFetch(path, options = {}) {
  if (!mailboxSecret()) {
    const err = new Error('CHECKOUT_MAILBOX_SECRET is not configured');
    err.status = 503;
    throw err;
  }
  const response = await fetch(`${mailboxUrl()}${path}`, {
    ...options,
    signal: options.signal || (typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(8000)
      : undefined)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const err = new Error((data && data.error) || response.statusText);
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}

function cardcomTestOn() {
  const flag = String(process.env.CARDCOM_TEST || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export async function startMailboxCardCharge(booking) {
  if (!booking?.checkout_token || !TOKEN_RE.test(booking.checkout_token)) {
    const err = new Error('INVALID_BOOKING');
    err.status = 400;
    throw err;
  }
  if (cardcomTestOn()) {
    const { createHypPaymentPage, hypReceiptUrl } = await import('../functions/lib/hypPay.js');
    const total = Number(booking.total_price_agorot) || 0;
    const deposit = Number(booking.deposit_agorot) || 0;
    const depositPaid = Boolean(
      booking.stay?.hyp_deposit?.paid
      || booking.payment_status === 'DEPOSIT_PAID'
      || booking.payment_status === 'PAID'
      || booking.payment_status === 'PARTIAL'
    );
    const explicitIls = Number(booking.charge_amount_ils);
    const amountAgorot = explicitIls > 0.5
      ? Math.round(explicitIls * 100)
      : (depositPaid
        ? Math.max(0, total - deposit)
        : (deposit > 0 ? deposit : Math.round(total * 0.2)));
    const amount = Math.round(amountAgorot) / 100;
    if (!(amount > 0.5)) {
      const err = new Error('אין סכום לחיוב');
      err.status = 422;
      throw err;
    }
    const requested = String(booking.hyp_terminal || booking.stay?.hyp_terminal || '').toUpperCase();
    const terminal = requested === 'A' || requested === 'B' ? requested : (depositPaid ? 'A' : 'B');
    const receiptUrl = hypReceiptUrl();
    const created = await createHypPaymentPage(process.env, {
      purpose: depositPaid ? 'balance' : 'deposit',
      terminal,
      lockTerminal: true,
      amount,
      order: booking.checkout_token,
      clientName: booking.guest_name || '',
      email: booking.guest_email || '',
      cell: booking.guest_phone || '',
      info: `טסט קארדקום · ${booking.unit_id || ''}`.slice(0, 80),
      tokenize: true,
      invoice: false,
      sendHesh: false,
      successUrl: receiptUrl,
      failUrl: receiptUrl,
      stayInFrame: true
    });
    const payUrl = created.payUrl || created.iframeUrl || '';
    if (!payUrl) {
      const err = new Error('לא נפתח דף סליקה במסוף הטסט');
      err.status = 422;
      throw err;
    }
    return {
      payUrl,
      lowProfileId: created.lowProfileId || '',
      payment: { pay_url: payUrl, iframe_url: payUrl, embed: true },
      terminal: created.terminal,
      masof: created.masof,
      cardcom_test: true
    };
  }
  await publishBookingToMailbox(booking);
  const depositPaid = Boolean(
    booking.stay?.hyp_deposit?.paid
    || booking.payment_status === 'DEPOSIT_PAID'
    || booking.payment_status === 'PAID'
    || booking.payment_status === 'PARTIAL'
  );
  const response = await fetch(`${mailboxUrl()}/api/checkout/${encodeURIComponent(booking.checkout_token)}/stay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: depositPaid ? 'guest_checkin' : 'guest_deposit',
      unit_id: booking.unit_id,
      guest_name: booking.guest_name,
      guest_email: booking.guest_email || '',
      pay: true,
      embed_receipt: true
    }),
    signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(15000)
      : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.message || data.error || 'CHARGE_START_FAILED');
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}

export async function confirmMailboxCardCharge({ lowProfileId, terminal } = {}) {
  const id = String(lowProfileId || '').trim();
  if (!id) {
    const err = new Error('MISSING_CHARGE');
    err.status = 400;
    throw err;
  }
  const { getHypLowProfileResult } = await import('../functions/lib/hypPay.js');
  const result = await getHypLowProfileResult(process.env, id, { terminal });
  return {
    paid: Boolean(result.paid),
    terminal: result.terminal || terminal || '',
    params: result.params || {},
    lowProfileId: id
  };
}

export async function publishBookingToMailbox(booking) {
  if (!booking?.checkout_token || !TOKEN_RE.test(booking.checkout_token)) return null;
  return mailboxFetch('/api/checkout/publish', {
    method: 'PUT',
    headers: mailboxHeaders(true),
    body: JSON.stringify(booking)
  });
}

export async function pullConfirmedFromMailbox() {
  const data = await mailboxFetch('/api/checkout/inbox', {
    method: 'GET',
    headers: mailboxHeaders()
  });
  return Array.isArray(data?.bookings) ? data.bookings : [];
}

export async function ackMailboxToken(token) {
  if (!TOKEN_RE.test(token)) return;
  await mailboxFetch('/api/checkout/ack', {
    method: 'POST',
    headers: mailboxHeaders(true),
    body: JSON.stringify({ token })
  });
}

export async function fetchMailboxBooking(token) {
  if (!TOKEN_RE.test(token)) return null;
  const response = await fetch(`${mailboxUrl()}/api/checkout/${encodeURIComponent(token)}`);
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) {
    const err = new Error('LOOKUP_FAILED');
    err.status = response.status;
    throw err;
  }
  return response.json();
}

export async function confirmMailboxBooking(token, payload) {
  const response = await fetch(`${mailboxUrl()}/api/checkout/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || 'CONFIRM_FAILED');
    err.status = response.status;
    throw err;
  }
  return data;
}
