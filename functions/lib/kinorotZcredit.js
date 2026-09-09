import { parseKinorotNotePayments, receivedKinorotNotePayments } from '../../src/lib/kinorotNotePayments.js';

const BASE = 'https://app.kinorotgo.co.il';

export function kinorotResid(booking) {
  const fromReq = String(booking?.special_requests || '').match(/kinorot:(\d+)/);
  if (fromReq) return fromReq[1];
  const fromId = String(booking?.id || '').match(/^kin_\d+_(\d+)$/);
  return fromId ? fromId[1] : '';
}

function ilsFromRaw(raw) {
  const cleaned = String(raw || '').replace(/,/g, '');
  const amount = Number(cleaned.replace(/[^\d.]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function inputValue(html, id) {
  const src = String(html || '');
  const re1 = new RegExp(`id="${id}"[^>]*value="([^"]*)"`, 'i');
  const re2 = new RegExp(`value="([^"]*)"[^>]*id="${id}"`, 'i');
  return (src.match(re1) || src.match(re2) || [])[1] || '';
}

function stripResviewText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
}

function paymentEventsIls(text) {
  const amounts = [];
  const re = /(?:שולם|חויב)(?:\s+מקדמה)?(?:\s+באשראי|\s+במזומן)?\s+([\d,]{2,})|([\d,]{3,})\s+(?:באשראי|מזומן|העברה)/g;
  let match;
  while ((match = re.exec(String(text || '')))) {
    const amount = ilsFromRaw(match[1] || match[2]);
    if (amount >= 50 && amount <= 50000) amounts.push(amount);
  }
  return amounts;
}

export function parseResviewPayment(html) {
  const src = String(html || '');
  const text = stripResviewText(src);
  const payAmount = ilsFromRaw(inputValue(src, 'payAmount'));
  const invoiceName = inputValue(src, 'invoiceName');
  const last4 = (src.match(/\*{2,}\s*(\d{4})/) || [])[1] || '';
  const header = text.match(/סה["״']?כ\s*₪?\s*([\d.,]+)\s*מקדמה\s*₪?\s*([\d.,]+)/);
  let total = header ? ilsFromRaw(header[1]) : 0;
  const deposit = header ? ilsFromRaw(header[2]) : 0;
  if (total <= 0) {
    const unitPrice = text.match(/מחיר יחידה[\s\S]{0,120}₪\s*([\d.,]+)/);
    total = ilsFromRaw(unitPrice?.[1]) || deposit || payAmount;
  }
  const notePayments = parseKinorotNotePayments(text);
  const collected = receivedKinorotNotePayments(notePayments);
  const events = collected.length
    ? collected.map((row) => row.amount)
    : [];
  const paid = events.reduce((sum, amount) => sum + amount, 0);
  const dueHeader = text.match(/יתרת\s*תשלום\s*₪?\s*([\d.,]+)/);
  const dueFromHeader = dueHeader ? ilsFromRaw(dueHeader[1]) : null;
  const due = total > 0
    ? Math.max(0, Math.round((total - paid) * 100) / 100)
    : (dueFromHeader != null ? dueFromHeader : payAmount);
  return {
    amount: payAmount || due,
    due,
    total,
    paid,
    deposit,
    payments: events,
    notePayments,
    invoiceName: String(invoiceName || '').trim(),
    last4,
    hasCard: Boolean(last4),
    voucherRedeemed: /שובר\s*נפדה|כמות\s+שובר|שובר\s*שגרירים|הערות:?\s*שובר/.test(text),
    complimentary: /ללא\s*תשלום/.test(text)
  };
}

function parseCookie(setCookie) {
  const jar = new Map();
  for (const raw of setCookie || []) {
    const part = String(raw).split(';')[0];
    const i = part.indexOf('=');
    if (i < 1) continue;
    jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return jar;
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function mergeCookies(jar, setCookie) {
  for (const [k, v] of parseCookie(setCookie)) jar.set(k, v);
}

function isLoginPage(html) {
  return /name="pass"|הכניסו את פרטי ההתחברות/.test(String(html || '').slice(0, 8000));
}

export async function kinorotRequest(url, jar, options = {}) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 ResortOSGuestCheckin',
    ...(options.headers || {})
  };
  const cookie = cookieHeader(jar);
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(url, {
    redirect: 'manual',
    ...options,
    headers
  });
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  const single = response.headers.get('set-cookie');
  mergeCookies(jar, setCookies.length ? setCookies : (single ? [single] : []));
  const loc = response.headers.get('location');
  if (response.status >= 300 && response.status < 400 && loc) {
    const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
    return kinorotRequest(next, jar, { method: 'GET' });
  }
  const text = await response.text();
  return { status: response.status, url: response.url, text };
}

export async function kinorotLogin(jar, user, pass) {
  if (!user || !pass) throw new Error('KINOROT_MISSING_CREDS');
  await kinorotRequest(`${BASE}/logcrm.php`, jar);
  const body = new URLSearchParams({ user, pass, v: 'yes' });
  const result = await kinorotRequest(`${BASE}/crm_login.php`, jar, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${BASE}/logcrm.php`,
      Origin: BASE
    },
    body
  });
  const bounce = result.text.match(/window\.location\s*=\s*['"]([^'"]+)['"]/);
  const next = bounce
    ? (bounce[1].startsWith('http') ? bounce[1] : new URL(bounce[1], `${BASE}/`).href)
    : `${BASE}/homepage.php`;
  const home = await kinorotRequest(next, jar);
  if (isLoginPage(home.text) && !jar.has('PHPSESSID')) {
    throw new Error('KINOROT_LOGIN_FAILED');
  }
  return home;
}

export async function withKinorotSession(env, store, fn) {
  const user = env.KINOROT_USER || '';
  const pass = env.KINOROT_PASSWORD || '';
  let jar = await store.loadJar();
  const run = async () => fn(jar);
  let result;
  try {
    result = await run();
  } catch (err) {
    jar = new Map();
    await kinorotLogin(jar, user, pass);
    await store.saveJar(jar);
    result = await run();
  }
  if (result?.login) {
    jar = new Map();
    await kinorotLogin(jar, user, pass);
    await store.saveJar(jar);
    result = await run();
  }
  await store.saveJar(jar);
  return result;
}

export async function fetchResview(jar, resid) {
  const page = await kinorotRequest(`${BASE}/resview.php?res=${encodeURIComponent(resid)}`, jar);
  return { ...page, login: isLoginPage(page.text) };
}

export async function createZcreditSession(jar, { resid, amount, invoiceName, email }) {
  const params = new URLSearchParams({
    res: String(resid),
    amount: String(amount),
    invoice_name: String(invoiceName || ''),
    payer_email: String(email || '')
  });
  const page = await kinorotRequest(`${BASE}/pay_zcredit_create.php`, jar, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: `${BASE}/resview.php?res=${encodeURIComponent(resid)}`,
      Origin: BASE
    },
    body: params
  });
  if (isLoginPage(page.text)) return { login: true };
  let data = null;
  try {
    data = JSON.parse(page.text);
  } catch {
    data = null;
  }
  if (!data?.ok || !data.iframe_url) {
    const err = new Error(data?.msg || 'ZCREDIT_CREATE_FAILED');
    err.payload = data;
    throw err;
  }
  const iframeUrl = String(data.iframe_url).startsWith('http')
    ? data.iframe_url
    : new URL(data.iframe_url, BASE).href;
  return { iframeUrl, raw: data };
}

export function quoteFromPayment(payment, booking) {
  return {
    resid: kinorotResid(booking),
    amount: payment.amount || 0,
    last4: payment.last4 || '',
    hasCard: Boolean(payment.hasCard),
    invoiceName: payment.invoiceName || booking.guest_name || '',
    needsCharge: (payment.amount || 0) > 0.5
  };
}
