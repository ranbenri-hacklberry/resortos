export const HYP_BASE = 'https://pay.hyp.co.il/p/';
export const HYP_TERMINAL_A = '4502210929';
export const HYP_TERMINAL_B = '4502315932';
export const HYP_RETURN_ORIGIN = 'https://resortos.app';

export function hypBrowserReturnUrl() {
  return `${HYP_RETURN_ORIGIN}/api/payments/hyp/success`;
}

export function hypCheckoutTokenFromParams(params = {}) {
  return String(
    params.Order
    || params.order
    || params.ReturnValue
    || params.returnValue
    || ''
  ).trim();
}

export function hypLowProfileIdFromParams(params = {}) {
  return String(params.LowProfileId || params.lowProfileId || params.LowProfileCode || '').trim();
}

export function hypParentBreakoutResponse(targetUrl) {
  let parsed;
  try {
    parsed = new URL(String(targetUrl || ''), HYP_RETURN_ORIGIN);
  } catch {
    parsed = new URL('/', HYP_RETURN_ORIGIN);
  }
  const allowed = new URL(HYP_RETURN_ORIGIN);
  if (parsed.origin !== allowed.origin) {
    parsed = new URL('/?hyp=missing', HYP_RETURN_ORIGIN);
  }
  const href = parsed.toString();
  const safeJs = JSON.stringify(href);
  const safeAttr = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '');
  return new Response(
    `<!doctype html><html lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ResortOS</title></head><body style="font-family:sans-serif;padding:24px;text-align:center"><p>מעביר חזרה…</p><script>(function(){var href=${safeJs};try{if(window.top&&window.top!==window){window.top.location.replace(href);return;}}catch(e){}try{if(window.parent&&window.parent!==window){window.parent.postMessage({type:'resortos-hyp',href:href},'*');}}catch(e2){}location.replace(href);})()</script><noscript><meta http-equiv="refresh" content="0;url=${safeAttr}"></noscript></body></html>`,
    {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer'
      }
    }
  );
}

export function hypTerminalForPurpose(purpose) {
  return String(purpose || '').toLowerCase() === 'deposit' ? 'B' : 'A';
}

export function hypMasofForTerminal(terminal) {
  return String(terminal || '').toUpperCase() === 'B' ? HYP_TERMINAL_B : HYP_TERMINAL_A;
}

export function resolveHypTerminal(terminal) {
  return String(terminal || 'A').toUpperCase() === 'B' ? 'B' : 'A';
}

function envTrim(env, key) {
  return String(env?.[key] || '').trim();
}

export function hypCreds(env, terminal = 'A') {
  const t = resolveHypTerminal(terminal);
  const masof = String(
    (t === 'B' ? envTrim(env, 'HYP_B_MASOF') : envTrim(env, 'HYP_A_MASOF'))
    || (t === 'A' ? envTrim(env, 'HYP_MASOF') : '')
    || hypMasofForTerminal(t)
  ).replace(/\D/g, '');
  const key = (t === 'B' ? envTrim(env, 'HYP_B_KEY') : envTrim(env, 'HYP_A_KEY'))
    || (t === 'A' ? envTrim(env, 'HYP_KEY') : '');
  const passp = (t === 'B' ? envTrim(env, 'HYP_B_PASSP') : envTrim(env, 'HYP_A_PASSP'))
    || (t === 'A' ? (envTrim(env, 'HYP_PASSP') || envTrim(env, 'HYP_PASS_P')) : '');
  if (!masof || masof.length < 8 || !key || !passp) {
    const err = new Error('HYP_MISSING_CREDS');
    err.code = 'HYP_MISSING_CREDS';
    err.terminal = t;
    throw err;
  }
  return { masof, key, passp, terminal: t };
}

export function hasHypCreds(env, terminal = 'A') {
  try {
    hypCreds(env, terminal);
    return true;
  } catch {
    return false;
  }
}

export function parseHypQuery(raw) {
  const text = String(raw || '').replace(/^\?/, '').trim();
  const params = {};
  if (!text) return params;
  for (const part of text.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = decodeURIComponent((eq < 0 ? part : part.slice(0, eq)).replace(/\+/g, ' '));
    const v = eq < 0 ? '' : decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
    if (k) params[k] = v;
  }
  return params;
}

export function hypCCode(params) {
  const code = Number(params?.CCode ?? params?.ccode);
  return Number.isFinite(code) ? code : null;
}

export function isHypPaid(params) {
  return hypCCode(params) === 0;
}

function hypError(code, message) {
  const err = new Error(message || `HYP_${code}`);
  err.code = `HYP_${code}`;
  err.hypCode = code;
  return err;
}

function abortAfter(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function hypRequest(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    qs.set(key, String(value));
  }
  const url = `${HYP_BASE}?${qs.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'text/plain, application/x-www-form-urlencoded, */*' }
  });
  const text = (await response.text()).slice(0, 16000);
  if (/<\s*html/i.test(text)) {
    throw hypError('HTML', 'HYP_HTML_ERROR');
  }
  return { text: text.trim(), params: parseHypQuery(text) };
}

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return {
    first: parts[0] || 'Guest',
    last: parts.slice(1).join(' ') || parts[0] || 'Guest'
  };
}

function digitsPhone(raw) {
  return String(raw || '').replace(/[^\d]/g, '');
}

export function buildHypSignFields(creds, input) {
  const amount = Number(input.amount || 0);
  const name = splitName(input.clientName);
  const info = String(input.info || 'ResortOS').slice(0, 120);
  const heshDesc = String(input.heshDesc || `[0~${info}~1~${amount.toFixed(2)}]`);
  return {
    action: 'APISign',
    What: 'SIGN',
    Sign: 'True',
    KEY: creds.key,
    PassP: creds.passp,
    Masof: creds.masof,
    Amount: amount.toFixed(2),
    Coin: '1',
    Order: String(input.order || '').slice(0, 50),
    Info: info,
    UTF8: 'True',
    UTF8out: 'True',
    PageLang: 'HEB',
    MoreData: 'True',
    Tash: String(input.tash || 6),
    ClientName: name.first,
    ClientLName: name.last,
    email: input.email || '',
    cell: digitsPhone(input.cell),
    UserId: digitsPhone(input.userId) || '000000000',
    SendHesh: input.sendHesh === false || !input.email ? 'False' : 'True',
    sendemail: input.email ? 'True' : 'False',
    'EZ.lang': 'he',
    Pritim: 'True',
    heshDesc,
    url: input.successUrl || hypBrowserReturnUrl(),
    failurl: input.failUrl || input.successUrl || hypBrowserReturnUrl(),
    ...(input.tokenize === false ? {} : { Token: 'True' })
  };
}

function inquireLooksPaid(params) {
  if (!params || typeof params !== 'object') return false;
  const id = String(params.Id || params.TransId || params.TransactionId || '').trim();
  if (!id) return false;
  const code = hypCCode(params);
  return code === 0 || code == null;
}

export async function inquireHypByOrder(env, order, terminal = 'B') {
  const creds = hypCreds(env, terminal);
  const token = String(order || '').slice(0, 50);
  const attempts = [
    {
      action: 'APISign',
      What: 'SIGN',
      Sign: 'True',
      KEY: creds.key,
      PassP: creds.passp,
      Masof: creds.masof,
      ACTION: 'GetIdByOrder',
      Order: token,
      UTF8: 'True',
      UTF8out: 'True'
    },
    {
      action: 'APISign',
      What: 'INQUIRE',
      KEY: creds.key,
      PassP: creds.passp,
      Masof: creds.masof,
      Order: token,
      UTF8: 'True',
      UTF8out: 'True'
    },
    {
      action: 'getStatus',
      Masof: creds.masof,
      PassP: creds.passp,
      KEY: creds.key,
      Order: token,
      UTF8: 'True',
      UTF8out: 'True'
    }
  ];
  let last = { text: '', params: {}, terminal: creds.terminal };
  for (const fields of attempts) {
    try {
      const signed = await hypRequest(fields);
      last = { ...signed, terminal: creds.terminal };
      if (inquireLooksPaid(signed.params)) {
        const transId = String(signed.params.Id || signed.params.TransId || '').trim();
        if (transId && !signed.params.Amount) {
          try {
            const details = await hypRequest({
              action: 'APISign',
              What: 'SIGN',
              Sign: 'True',
              KEY: creds.key,
              PassP: creds.passp,
              Masof: creds.masof,
              ACTION: 'GetTransDetails',
              TransId: transId,
              UTF8: 'True',
              UTF8out: 'True'
            });
            if (details.params && Object.keys(details.params).length) {
              last = {
                text: details.text,
                params: { ...signed.params, ...details.params, Id: transId },
                terminal: creds.terminal
              };
            }
          } catch (_) {}
        }
        return last;
      }
    } catch (_) {}
  }
  return last;
}

export function hypExpiryYear(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(-2);
  return digits.padStart(2, '0').slice(-2);
}

export function buildHypTokenChargeFields(creds, input) {
  const amount = Number(input.amount || 0);
  const name = splitName(input.clientName);
  return {
    action: 'soft',
    Masof: creds.masof,
    PassP: creds.passp,
    KEY: creds.key,
    Amount: amount.toFixed(2),
    Coin: '1',
    Info: String(input.info || 'ResortOS').slice(0, 120),
    CC: String(input.token || ''),
    Token: 'True',
    Tmonth: String(input.exp_month || '').replace(/\D/g, '').padStart(2, '0').slice(-2),
    Tyear: hypExpiryYear(input.exp_year),
    Order: String(input.order || '').slice(0, 50),
    UTF8: 'True',
    UTF8out: 'True',
    MoreData: 'True',
    Tash: '1',
    ClientName: name.first,
    ClientLName: name.last,
    email: input.email || '',
    cell: digitsPhone(input.cell),
    UserId: digitsPhone(input.userId) || '000000000',
    SendHesh: input.sendHesh === false || !input.email ? 'False' : 'True'
  };
}

export async function chargeHypToken(env, input) {
  const amount = Number(input.amount || 0);
  if (!(amount > 0.5)) {
    const err = new Error('HYP_AMOUNT');
    err.code = 'HYP_AMOUNT';
    throw err;
  }
  if (!String(input.token || '').trim()) {
    const err = new Error('HYP_NO_TOKEN');
    err.code = 'HYP_NO_TOKEN';
    throw err;
  }
  const preferred = resolveHypTerminal(input.terminal || 'A');
  const order = preferred === 'A' ? ['A', 'B'] : ['B', 'A'];
  let lastErr = null;
  for (const terminal of order) {
    if (!hasHypCreds(env, terminal)) continue;
    const creds = hypCreds(env, terminal);
    const signed = await hypRequest(buildHypTokenChargeFields(creds, input));
    if (isHypPaid(signed.params)) {
      return {
        params: signed.params,
        terminal: creds.terminal,
        result: hypPublicResult(signed.params)
      };
    }
    lastErr = hypError(hypCCode(signed.params) || 'TOKEN', signed.text);
    lastErr.terminal = terminal;
  }
  throw lastErr || hypError('TOKEN', 'HYP_TOKEN_CHARGE_FAILED');
}

export function publicHypSignFields(fields) {
  const next = { ...(fields || {}) };
  delete next.KEY;
  delete next.PassP;
  delete next.zPass;
  return next;
}

export function buildHypLowProfileBody(user, input) {
  const amount = Math.round(Number(input.amount || 0) * 100) / 100;
  const name = splitName(input.clientName);
  const info = String(input.productName || input.info || 'ResortOS').slice(0, 80);
  const products = Array.isArray(input.products) && input.products.length
    ? input.products.map((row) => ({
      Description: String(row.Description || row.description || info).slice(0, 200),
      Quantity: Math.max(1, Number(row.Quantity || row.quantity) || 1),
      UnitCost: Math.round(Number(row.UnitCost ?? row.unitCost ?? 0) * 100) / 100
    }))
    : [{ Description: info, Quantity: 1, UnitCost: amount }];
  const successUrl = input.successUrl || hypBrowserReturnUrl();
  const failUrl = input.failUrl || successUrl;
  const maxPay = Math.max(1, Number(input.tash || 6) || 6);
  const fullName = `${name.first} ${name.last}`.trim();
  const body = {
    TerminalNumber: Number(String(user.masof || '').replace(/\D/g, '')) || user.masof,
    ApiName: user.apiName,
    ApiPassword: user.apiPassword,
    Operation: input.tokenize === false ? 'ChargeOnly' : 'ChargeAndCreateToken',
    Amount: amount,
    ReturnValue: String(input.order || '').slice(0, 250),
    SuccessRedirectUrl: successUrl,
    FailedRedirectUrl: failUrl,
    WebHookUrl: `${HYP_RETURN_ORIGIN}/api/payments/hyp/lp`,
    ProductName: info,
    Language: 'he',
    ISOCoinId: 1,
    UIDefinition: {
      CardOwnerNameValue: fullName,
      CardOwnerPhoneValue: digitsPhone(input.cell) || undefined,
      CardOwnerEmailValue: input.email || undefined
    },
    AdvancedDefinition: {
      MaxNumOfPayments: maxPay,
      MinNumOfPayments: 1,
      RedirectToParent: true
    }
  };
  if (input.invoice !== false && input.sendHesh !== false && (input.email || (input.products && input.products.length))) {
    body.Document = {
      Name: fullName,
      Email: input.email || undefined,
      Phone: digitsPhone(input.cell) || undefined,
      IsSendByEmail: Boolean(input.email),
      Products: products
    };
  }
  return body;
}

export function lpResultToHypParams(data, fallbackOrder = '') {
  const tx = data?.TransactionInfo || data?.TranzactionInfo || {};
  const tokenInfo = data?.TokenInfo || {};
  const ui = data?.UIValues || {};
  const doc = data?.DocumentInfo || {};
  return {
    Id: String(tx.TransactionId || data?.TransactionId || ''),
    CCode: String(tx.ResponseCode ?? data?.ResponseCode ?? ''),
    Amount: String(tx.Amount ?? data?.Amount ?? ''),
    ACode: String(tx.ApprovalNumber || tx.CouponNumber || ''),
    Order: String(data?.ReturnValue || fallbackOrder || ''),
    L4digit: String(tx.Last4CardDigitsString || tx.Last4CardDigits || ''),
    Brand: String(tx.Brand || tx.CardName || ''),
    Hesh: String(tx.DocumentNumber || doc.DocumentNumber || ''),
    HK: String(tx.Token || tokenInfo.Token || ''),
    Token: String(tx.Token || tokenInfo.Token || ''),
    Tmonth: String(tx.CardMonth || tokenInfo.CardMonth || ui.CardMonth || ''),
    Tyear: String(tx.CardYear || tokenInfo.CardYear || ui.CardYear || '')
  };
}

export function isHypLowProfilePaid(data) {
  if (!data) return false;
  const top = Number(data.ResponseCode);
  if (Number.isFinite(top) && top !== 0) return false;
  const tx = data.TransactionInfo || data.TranzactionInfo || {};
  const txCode = Number(tx.ResponseCode);
  if (Number.isFinite(txCode) && txCode !== 0 && txCode !== 700 && txCode !== 701) return false;
  return Boolean(tx.TransactionId || data.TransactionId);
}

function lowProfileAuthCombos(user) {
  const combos = uniqueAuthCombos(user);
  const rank = { 'terminal-api': 0, portal: 1, 'shared-api': 2, api: 3 };
  const preferred = combos.filter((auth) => auth.label in rank);
  return preferred.length ? preferred.sort((a, b) => rank[a.label] - rank[b.label]) : combos;
}

export async function createHypLowProfilePage(env, input) {
  const purpose = input.purpose || 'balance';
  const terminal = input.terminal || hypTerminalForPurpose(purpose);
  const user = hypApiUser(env, terminal);
  const amount = Number(input.amount || 0);
  if (!(amount > 0.5)) {
    const err = new Error('HYP_AMOUNT');
    err.code = 'HYP_AMOUNT';
    throw err;
  }
  let lastErr = null;
  const operations = input.tokenize === false
    ? ['ChargeOnly']
    : ['ChargeAndCreateToken', 'ChargeOnly'];
  for (const auth of lowProfileAuthCombos(user)) {
    for (const operation of operations) {
      const body = buildHypLowProfileBody({
        ...user,
        apiName: auth.apiName,
        apiPassword: auth.apiPassword
      }, { ...input, tokenize: operation !== 'ChargeOnly' });
      body.Operation = operation;
      const posted = await postJson(
        fetch,
        'https://secure.cardcom.solutions/api/v11/LowProfile/Create',
        body,
        Number(input.lpTimeoutMs) > 0 ? Number(input.lpTimeoutMs) : 20000
      );
      const code = Number(posted.data?.ResponseCode);
      const url = posted.data?.Url || posted.data?.url;
      const lpId = posted.data?.LowProfileId || posted.data?.LowProfileCode;
      if (url && (!Number.isFinite(code) || code === 0)) {
        return {
          url,
          lowProfileId: String(lpId || ''),
          terminal: user.terminal,
          purpose,
          masof: user.masof,
          auth: auth.label,
          raw: posted.data
        };
      }
      lastErr = hypError(code || posted.status || 'LP', posted.data?.Description || posted.text || 'HYP_LP_FAILED');
    }
  }
  throw lastErr || hypError('LP', 'HYP_LP_FAILED');
}

export async function getHypLowProfileResult(env, lowProfileId, opts = {}) {
  const id = String(lowProfileId || '').trim();
  if (!id) {
    const err = new Error('HYP_LP_ID');
    err.code = 'HYP_LP_ID';
    throw err;
  }
  const preferred = opts.terminal
    ? [resolveHypTerminal(opts.terminal)]
    : ['A', 'B'];
  let last = { ok: false, paid: false, params: {}, raw: null };
  for (const terminal of preferred) {
    if (!hasHypCreds(env, terminal)) continue;
    const user = hypApiUser(env, terminal);
    for (const auth of uniqueAuthCombos(user)) {
      const qs = new URLSearchParams({
        TerminalNumber: String(user.masof),
        ApiName: auth.apiName,
        LowProfileId: id
      });
      try {
        const response = await fetch(`https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult?${qs}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(30000)
        });
        const text = await response.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
        const params = lpResultToHypParams(data || {}, opts.order);
        const paid = isHypLowProfilePaid(data);
        last = { ok: paid, paid, params, raw: data, terminal, text };
        if (paid) return last;
      } catch (err) {
        last = { ok: false, paid: false, params: {}, raw: null, error: err.message };
      }
    }
  }
  return last;
}

export async function createHypPaymentPage(env, input) {
  const purpose = input.purpose || 'balance';
  const preferred = input.terminal || hypTerminalForPurpose(purpose);
  const amount = Number(input.amount || 0);
  if (!(amount > 0.5)) {
    const err = new Error('HYP_AMOUNT');
    err.code = 'HYP_AMOUNT';
    throw err;
  }
  const terminals = input.lockTerminal
    ? [preferred]
    : (preferred === 'B' ? ['B', 'A'] : ['A', 'B']);
  let lastErr = null;
  for (const terminal of terminals) {
    if (!input.skipLowProfile) {
      try {
        const lp = await createHypLowProfilePage(env, { ...input, purpose, terminal });
        return {
          payUrl: lp.url,
          iframeUrl: lp.url,
          embed: true,
          lowProfileId: lp.lowProfileId,
          signed: { LowProfileId: lp.lowProfileId },
          raw: lp.raw,
          terminal: lp.terminal,
          purpose,
          masof: lp.masof
        };
      } catch (err) {
        lastErr = err;
      }
    }
    if (input.allowSign === false) continue;
    try {
      const creds = hypCreds(env, terminal);
      const signed = await hypRequest(buildHypSignFields(creds, input));
      const code = hypCCode(signed.params);
      if (code && code !== 0) throw hypError(code, signed.text);
      if (!signed.params.signature && !signed.params.Sign && !/action=pay/i.test(signed.text)) {
        throw hypError('SIGN', signed.text || 'HYP_SIGN_FAILED');
      }
      return {
        payUrl: `${HYP_BASE}?${signed.text}`,
        iframeUrl: `${HYP_BASE}?${signed.text}`,
        embed: true,
        lowProfileId: '',
        signed: signed.params,
        raw: signed.text,
        terminal: creds.terminal,
        purpose,
        masof: creds.masof
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || hypError('SIGN', 'HYP_SIGN_FAILED');
}

export async function verifyHypReturn(env, search, opts = {}) {
  const raw = String(search || '').replace(/^\?/, '').trim();
  const returned = parseHypQuery(raw);
  if (!raw) {
    return { ok: false, paid: false, params: returned, verify: {} };
  }
  const preferred = opts.terminal
    ? [resolveHypTerminal(opts.terminal)]
    : ['A', 'B'];
  let last = { ok: false, paid: false, params: returned, verify: {} };
  for (const terminal of preferred) {
    if (!hasHypCreds(env, terminal)) continue;
    const creds = hypCreds(env, terminal);
    const prefix = new URLSearchParams({
      action: 'APISign',
      What: 'VERIFY',
      Masof: creds.masof,
      KEY: creds.key,
      PassP: creds.passp
    }).toString();
    const response = await fetch(`${HYP_BASE}?${prefix}&${raw}`, {
      method: 'GET',
      headers: { Accept: 'text/plain, application/x-www-form-urlencoded, */*' }
    });
    const text = await response.text();
    const verify = parseHypQuery(text);
    const verifyCode = hypCCode(verify);
    const paid = isHypPaid(returned) && (verifyCode === 0 || verifyCode == null);
    last = {
      ok: verifyCode === 0 || (paid && verifyCode == null),
      paid,
      params: returned,
      verify,
      raw: text,
      terminal
    };
    if (last.ok || last.paid) return last;
  }
  return last;
}

export async function createHypInvoiceLink(env, input) {
  const creds = hypCreds(env, input.terminal || 'A');
  const transId = String(input.transId || input.Id || '').trim();
  if (!transId) {
    const err = new Error('HYP_TRANS_ID');
    err.code = 'HYP_TRANS_ID';
    throw err;
  }
  const signed = await hypRequest({
    action: 'APISign',
    What: 'SIGN',
    Sign: 'True',
    KEY: creds.key,
    PassP: creds.passp,
    Masof: creds.masof,
    ACTION: 'PrintHesh',
    type: 'EZCOUNT',
    TransId: transId
  });
  const code = hypCCode(signed.params);
  if (code && code !== 0) {
    throw hypError(code, signed.text);
  }
  return {
    url: `${HYP_BASE}?${signed.text}`,
    terminal: creds.terminal,
    transId
  };
}

export function hypPublicResult(params) {
  return {
    id: params.Id || params.TransId || '',
    ccode: hypCCode(params),
    amount: params.Amount || '',
    auth: params.ACode || '',
    last4: params.L4digit || '',
    brand: params.Brand || '',
    hesh: params.Hesh || '',
    order: params.Order || '',
    token: params.HK || params.Token || params.CCToken || '',
    exp_month: params.Tmonth || params.TMonth || '',
    exp_year: params.Tyear || params.TYear || ''
  };
}

export function hypApiUser(env, terminal = 'A') {
  const creds = hypCreds(env, terminal);
  const t = creds.terminal;
  const portalUser = envTrim(env, `HYP_${t}_PORTAL_USER`);
  const portalPass = envTrim(env, `HYP_${t}_PORTAL_PASS`);
  const sharedName = envTrim(env, 'HYP_API_NAME');
  const sharedPass = envTrim(env, 'HYP_API_PASSWORD');
  const terminalName = envTrim(env, `HYP_${t}_API_NAME`);
  const terminalPass = envTrim(env, `HYP_${t}_API_PASSWORD`);
  const apiName = terminalName || portalUser || sharedName || creds.key;
  const apiPassword = terminalPass || portalPass || sharedPass || creds.passp;
  return {
    ...creds,
    apiName,
    apiPassword,
    portalUser,
    portalPass,
    sharedName,
    sharedPass,
    terminalApiName: terminalName,
    terminalApiPass: terminalPass,
    zPass: envTrim(env, `HYP_${t}_ZPASS`) || envTrim(env, 'HYP_ZPASS')
  };
}

export function uniqueAuthCombos(user) {
  const combos = [];
  const seen = new Set();
  const add = (apiName, apiPassword, label) => {
    if (!apiName || !apiPassword) return;
    const key = `${apiName}\0${apiPassword}`;
    if (seen.has(key)) return;
    seen.add(key);
    combos.push({ apiName, apiPassword, label });
  };
  add(user.terminalApiName, user.terminalApiPass, 'terminal-api');
  add(user.portalUser, user.portalPass, 'portal');
  add(user.sharedName, user.sharedPass, 'shared-api');
  add(user.apiName, user.apiPassword, 'api');
  add(user.key, user.passp, 'key-passp');
  add(user.key, user.zPass, 'key-zpass');
  add(user.key, user.portalPass, 'key-portal');
  add(user.portalUser, user.key, 'portal-key');
  add(String(user.masof || ''), user.key, 'masof-key');
  add(String(user.masof || ''), user.passp, 'masof-passp');
  add(String(user.masof || ''), user.portalPass, 'masof-portal');
  add(String(user.masof || ''), user.zPass, 'masof-zpass');
  add(user.portalUser, user.passp, 'portal-passp');
  add(user.portalUser, user.zPass, 'portal-zpass');
  return combos;
}

export function formatHypListDate(value) {
  const iso = isoHypDate(value);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}${month}${year}`;
}

export function isoHypDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const compact = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compact) return `${compact[3]}-${compact[2]}-${compact[1]}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function xmlTagValues(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out = [];
  let match;
  while ((match = re.exec(String(xml || '')))) out.push(match[1].trim());
  return out;
}

function xmlObject(xml) {
  const obj = {};
  const re = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
  let match;
  while ((match = re.exec(String(xml || '')))) {
    obj[match[1]] = match[2].trim();
  }
  return obj;
}

export function isApprovedHypDeal(deal = {}) {
  const status = String(deal.Status || deal.TranStatus || deal.DealStatus || deal.CreditCompanyStatus || '');
  if (/נדח|דחה|נכשל|failed|declined|reject|cancel|בוטל/i.test(status)) return false;
  const amount = Number(deal.Amount ?? deal.Sum ?? deal.Sum36 ?? deal.amount) || 0;
  const txn = String(deal.TranzactionId || deal.InternalDealNumber || deal.TransactionId || deal.txn || '').trim();
  return Boolean(txn) && amount !== 0;
}

export function hypDealToRow(deal = {}, fallbackTerminal = '') {
  const terminalId = String(deal.TerminalNumber || deal.terminalId || fallbackTerminal || '').replace(/\D/g, '');
  const first = String(deal.CardOwnerFirstName || deal.FirstName || deal.first || '').trim();
  const last = String(deal.CardOwnerLastName || deal.LastName || deal.last || '').trim();
  const full = String(deal.CardOwnerName || deal.Name || '').trim() || `${first} ${last}`.trim();
  const amount = Number(deal.Amount ?? deal.Sum ?? deal.Sum36 ?? deal.amount) || 0;
  return {
    txn: String(deal.TranzactionId || deal.InternalDealNumber || deal.TransactionId || deal.txn || '').trim(),
    ref: String(deal.ApprovalNumber || deal.CouponNumber || deal.ACode || deal.ref || '').trim(),
    date: isoHypDate(deal.CreateDate || deal.DealDate || deal.date),
    first,
    last,
    name: full,
    desc: String(deal.Info || deal.Description || deal.DealDescription || deal.desc || full).trim(),
    amount,
    terminalId,
    invoice: String(deal.InvoiceNumber || deal.Hesh || deal.invoice || '').trim(),
    depositApproval: String(deal.DepositApproval || deal.depositApproval || '').trim(),
    last4: String(deal.Last4CardDigitsString || deal.Last4CardDigits || deal.CardNumber5 || deal.last4 || '').replace(/\D/g, '').slice(-4),
    brand: String(deal.CardName || deal.Brand || deal.brand || '').trim(),
    acquirer: String(deal.SapakMutav || deal.acquirer || 'MAX').trim() || 'MAX',
    order: String(deal.Order || deal.UniqueID || deal.UniqueId || deal.ReturnValue || deal.order || '').trim()
  };
}

export function hypDealMatchesCheckout(deal, token, booking = {}) {
  const tok = String(token || '').trim();
  if (!deal || !tok) return false;
  const blob = `${deal.order || ''} ${deal.desc || ''} ${deal.info || ''}`.toLowerCase();
  if (blob.includes(tok.toLowerCase())) return true;
  const expected = Number(booking?.stay?.hyp_intent?.amount || (Number(booking?.deposit_agorot) || 0) / 100);
  const name = String(booking?.guest_name || '').trim();
  if (!(expected > 0) || name.length < 2) return false;
  if (Math.abs(Number(deal.amount) - expected) > 0.051) return false;
  const who = `${deal.name || ''} ${deal.desc || ''}`;
  return who.includes(name);
}

export function hypDealToReturnParams(deal, token) {
  return {
    Id: String(deal?.txn || ''),
    CCode: '0',
    Amount: String(deal?.amount ?? ''),
    ACode: String(deal?.ref || ''),
    Order: String(token || deal?.order || ''),
    L4digit: String(deal?.last4 || ''),
    Brand: String(deal?.brand || ''),
    Hesh: String(deal?.invoice || ''),
    HK: '',
    Token: ''
  };
}

export async function findHypDealForCheckout(env, token, booking, { fetchImpl = fetch } = {}) {
  const preferred = String(booking?.stay?.hyp_intent?.terminal || booking?.hyp_terminal || 'B').toUpperCase() === 'A'
    ? 'A'
    : 'B';
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const fromDate = new Date(today.getTime() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const order = preferred === 'A' ? ['A', 'B'] : ['B', 'A'];
  for (const terminal of order) {
    if (!hasHypCreds(env, terminal)) continue;
    try {
      const listed = await listHypTerminalTransactions(env, terminal, { from: fromDate, to, fetchImpl });
      const hit = (listed.rows || []).find((deal) => hypDealMatchesCheckout(deal, token, booking));
      if (hit) return hit;
    } catch (_) {}
  }
  return null;
}

export function parseHypListPayload(payload, fallbackTerminal = '') {
  if (payload == null) return [];
  if (typeof payload === 'string') {
    const chunks = xmlTagValues(payload, 'Deal').concat(xmlTagValues(payload, 'transaction'));
    if (chunks.length) {
      return chunks
        .map((chunk) => hypDealToRow(xmlObject(chunk), fallbackTerminal))
        .filter((row) => isApprovedHypDeal({ TranzactionId: row.txn, Amount: row.amount }));
    }
    try {
      return parseHypListPayload(JSON.parse(payload), fallbackTerminal);
    } catch {
      return [];
    }
  }
  const list = payload.Tranzactions
    || payload.Transactions
    || payload.Deals
    || payload.deals
    || (Array.isArray(payload) ? payload : []);
  return list
    .map((deal) => hypDealToRow(deal, fallbackTerminal))
    .filter((row) => isApprovedHypDeal({ ...row, TranzactionId: row.txn, Amount: row.amount, Status: '' }));
}

function listEndpoints() {
  return [
    'https://secure.cardcom.solutions/api/v11/Transactions/ListTransactions'
  ];
}

function dealsEndpoints() {
  return [
    'https://secure.cardcom.solutions/interface/BillGoldGetDeals.aspx'
  ];
}

async function postJson(fetchImpl, url, body, timeoutMs = 30000) {
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abortAfter(timeoutMs)
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return { ok: response.ok, status: response.status, data, text };
  } catch (err) {
    return { ok: false, status: 0, data: null, text: err.message || 'FETCH_FAILED' };
  }
}

async function listViaRest(user, from, to, fetchImpl) {
  const fromDate = formatHypListDate(from);
  const toDate = formatHypListDate(to);
  let lastError = '';
  for (const auth of uniqueAuthCombos(user)) {
    for (const url of listEndpoints()) {
      const rows = [];
      let authFailed = false;
      for (let page = 1; page <= 40; page += 1) {
        const posted = await postJson(fetchImpl, url, {
          ApiName: auth.apiName,
          ApiPassword: auth.apiPassword,
          FromDate: fromDate,
          ToDate: toDate,
          Page: page,
          Page_size: 50
        });
        const code = Number(posted.data?.ResponseCode);
        if (!posted.ok && posted.status === 0) {
          lastError = posted.text || 'FETCH_FAILED';
          break;
        }
        if (posted.status === 401 || posted.status === 403 || (code && code !== 0)) {
          lastError = posted.data?.Description || posted.text || `HYP_${code || posted.status}`;
          authFailed = true;
          break;
        }
        const batch = parseHypListPayload(posted.data, user.masof);
        rows.push(...batch);
        if (batch.length < 50) {
          if (rows.length) return { rows, source: url, auth: auth.label };
          lastError = 'HYP_LIST_EMPTY';
          break;
        }
      }
      if (authFailed) break;
      if (rows.length) return { rows, source: url, auth: auth.label };
    }
  }
  const err = new Error(lastError || 'HYP_LIST_EMPTY');
  err.code = 'HYP_LIST_FAILED';
  throw err;
}

async function listViaDealsXml(user, from, to, fetchImpl) {
  let lastError = '';
  for (const auth of uniqueAuthCombos(user)) {
    const params = new URLSearchParams({
      terminalnumber: String(user.masof),
      username: auth.apiName,
      userpassword: auth.apiPassword,
      fromdate: isoHypDate(from),
      todate: isoHypDate(to)
    });
    for (const base of dealsEndpoints()) {
      try {
        const response = await fetchImpl(`${base}?${params.toString()}`, {
          method: 'GET',
          headers: { Accept: 'application/xml, text/xml, */*' },
          signal: AbortSignal.timeout(30000)
        });
        const text = await response.text();
        if (!response.ok || /<\s*html/i.test(text)) {
          lastError = `HTTP_${response.status}`;
          continue;
        }
        const rows = parseHypListPayload(text, user.masof);
        if (rows.length) return { rows, source: base, auth: auth.label };
        lastError = 'HYP_XML_EMPTY';
      } catch (err) {
        lastError = err.message || 'FETCH_FAILED';
      }
    }
  }
  const err = new Error(lastError || 'HYP_XML_FAILED');
  err.code = 'HYP_LIST_FAILED';
  throw err;
}

export async function listHypTerminalTransactions(env, terminal, { from, to, fetchImpl = fetch } = {}) {
  const user = hypApiUser(env, terminal);
  const start = from || new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const end = to || new Date().toISOString().slice(0, 10);
  try {
    const rest = await listViaRest(user, start, end, fetchImpl);
    const masof = String(user.masof || '').replace(/\D/g, '');
    const scoped = masof && rest.rows.some((row) => String(row.terminalId || '').replace(/\D/g, '') === masof)
      ? rest.rows.filter((row) => String(row.terminalId || '').replace(/\D/g, '') === masof)
      : rest.rows;
    return { terminal: user.terminal, masof: user.masof, ...rest, rows: scoped };
  } catch (restErr) {
    try {
      const xml = await listViaDealsXml(user, start, end, fetchImpl);
      return { terminal: user.terminal, masof: user.masof, ...xml };
    } catch (xmlErr) {
      const err = new Error(restErr.message || xmlErr.message || 'HYP_LIST_FAILED');
      err.code = restErr.code || xmlErr.code || 'HYP_LIST_FAILED';
      err.terminal = user.terminal;
      throw err;
    }
  }
}

export async function listHypTransactions(env, options = {}) {
  const terminals = ['A', 'B'].filter((terminal) => hasHypCreds(env, terminal));
  if (!terminals.length) {
    const err = new Error('HYP_MISSING_CREDS');
    err.code = 'HYP_MISSING_CREDS';
    err.status = 503;
    throw err;
  }
  const results = [];
  const rows = [];
  const errors = [];
  for (const terminal of terminals) {
    try {
      const listed = await listHypTerminalTransactions(env, terminal, options);
      results.push({
        terminal: listed.terminal,
        masof: listed.masof,
        source: listed.source,
        auth: listed.auth,
        count: listed.rows.length
      });
      rows.push(...listed.rows);
    } catch (err) {
      errors.push({ terminal, error: err.message || String(err) });
      results.push({
        terminal,
        masof: hypApiUser(env, terminal).masof,
        error: err.message || String(err),
        count: 0
      });
    }
  }
  if (!rows.length && errors.length) {
    const err = new Error(errors.map((item) => `${item.terminal}: ${item.error}`).join(' · '));
    err.code = 'HYP_LIST_FAILED';
    err.results = results;
    throw err;
  }
  return { rows, results, errors };
}

export function mergeHypPaymentRows(previousRows = [], liveRows = []) {
  const byKey = new Map();
  for (const row of previousRows) {
    const key = `${row.terminalId || ''}|${row.txn || ''}`;
    if (key !== '|') byKey.set(key, row);
  }
  for (const row of liveRows) {
    const key = `${row.terminalId || ''}|${row.txn || ''}`;
    if (key === '|') continue;
    const prev = byKey.get(key) || {};
    byKey.set(key, {
      ...prev,
      ...row,
      name: row.name || prev.name,
      desc: row.desc || prev.desc,
      invoice: row.invoice || prev.invoice,
      depositApproval: row.depositApproval || prev.depositApproval
    });
  }
  return [...byKey.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.txn).localeCompare(String(a.txn)));
}
