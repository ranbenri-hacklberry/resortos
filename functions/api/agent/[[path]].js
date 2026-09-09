import { errorJson, json } from '../_db.js';
import { createHypPaymentPage, HYP_RETURN_ORIGIN } from '../../lib/hypPay.js';
import {
  clearCookieHeader,
  cookieHeader,
  pinPepper,
  readAgentSession,
  sessionSecret,
  signAgentSession,
  tokenFromRequest
} from '../../lib/edgeAgentCrypto.js';
import {
  agentHypInvoice,
  agentMailboxRow,
  checkoutToken,
  createSoftLocks,
  ensureEdgeTables,
  findEdgeAgent,
  sanitizedCalendar,
  seedDemoAgent,
  unitName,
  writeAgentMailbox
} from '../../lib/edgeAgentStore.js';
import { cabinQuotesOrEqual, normalizePaySplit } from '../../lib/paySplit.js';

function cors(data, status = 200, headers = {}) {
  return json(data, status, headers);
}

async function requireAgent(env, request) {
  const secret = sessionSecret(env);
  const token = tokenFromRequest(request);
  const agent = await readAgentSession(token, secret);
  if (!agent?.id) {
    const err = new Error('UNAUTHORIZED');
    err.status = 401;
    throw err;
  }
  return agent;
}

function guestsLine(extras) {
  if (extras.guests) return String(extras.guests);
  const rows = Array.isArray(extras.cabin_parties) ? extras.cabin_parties : [];
  if (rows.length) {
    return rows.map((row) => {
      const bits = [`${row.name || row.cabin_id}: ${row.adults || 0} מבוגרים`];
      if (row.children) bits.push(`${row.children} ילדים`);
      if (row.crib) bits.push('מיטת תינוק');
      return bits.join(', ');
    }).join(' · ');
  }
  const crib = extras.baby_cot_required ? ' · מיטת תינוק' : '';
  return `${extras.adults || 2} מבוגרים, ${extras.children || 0} ילדים${crib}`;
}

function alertText(agent, lock, extras) {
  const cabin = extras.cabin_names || unitName(lock.cabin_id);
  const deposit = Math.round((Number(lock.deposit_agorot || extras.deposit_amount || extras.deposit_agorot || 0) / (Number(lock.deposit_agorot || extras.deposit_agorot) ? 100 : 1)));
  return `🔔 הזמנה חדשה מסוכן: ${agent.name} | בקתה: ${cabin} | תאריכים: ${lock.start_date} עד ${lock.end_date} | אורחים: ${guestsLine(extras)} | מקדמה: ${deposit} ₪ | נא לעדכן בכינורות`;
}

async function notifyOps(env, text) {
  const hook = String(env.AGENT_BOOKING_WEBHOOK || '').trim();
  if (!hook) return;
  try {
    await fetch(hook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(8000)
    });
  } catch (err) {
    console.warn('[agent webhook]', String(err?.message || err));
  }
}

async function startHyp(env, { token, depositAgorot, extras, agent, cabinId, startDate, endDate }) {
  const amount = Math.round((Number(depositAgorot || 0) / 100) * 100) / 100;
  if (!(amount > 0.5)) {
    const err = new Error('סכום מקדמה לא תקין');
    err.status = 400;
    throw err;
  }
  const invoice = agentHypInvoice({
    agent,
    extras,
    cabinIds: extras.cabin_ids || [cabinId],
    depositIls: amount,
    startDate: startDate || extras.start_date,
    endDate: endDate || extras.end_date
  });
  return createHypPaymentPage(env, {
    amount,
    purpose: 'deposit',
    terminal: 'B',
    order: token,
    clientName: String(extras.guest_name || 'אורח'),
    email: String(extras.guest_email || ''),
    cell: String(extras.guest_phone || ''),
    info: invoice.info,
    productName: invoice.productName,
    products: invoice.products,
    heshDesc: invoice.heshDesc,
    tokenize: true,
    successUrl: `${HYP_RETURN_ORIGIN}/api/payments/hyp/success`,
    failUrl: `${HYP_RETURN_ORIGIN}/api/payments/hyp/success`
  });
}

function guestPayLink(token) {
  return `${HYP_RETURN_ORIGIN}/checkout/${encodeURIComponent(token)}`;
}

function stayLinksForParties(token, parties) {
  const base = `${HYP_RETURN_ORIGIN}/stay/${encodeURIComponent(token)}`;
  return (Array.isArray(parties) ? parties : []).map((row) => ({
    cabin_id: row.cabin_id,
    name: row.name || row.cabin_id,
    occupant_name: row.occupant_name || '',
    occupant_phone: String(row.occupant_phone || '').replace(/\D/g, ''),
    url: `${base}?unit=${encodeURIComponent(row.cabin_id)}`
  }));
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const action = [].concat(params.path || []).filter(Boolean)[0] || '';
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') return cors({ ok: true });

  try {
    if (!env?.STAY_DB) return errorJson('תיבת ההזמנות לא זמינה', 503, 'D1_MISSING');
    await ensureEdgeTables(env);
    await seedDemoAgent(env);

    if (action === 'login' && method === 'POST') {
      if (!pinPepper(env) || !sessionSecret(env)) {
        return errorJson('חסר סוד סשן בשרת', 503, 'AGENT_SECRET_MISSING');
      }
      const body = await request.json().catch(() => ({}));
      const agent = await findEdgeAgent(env, body.phone, body.pin);
      if (!agent) return errorJson('טלפון או קוד שגויים', 401, 'BAD_CREDENTIALS');
      const token = await signAgentSession(agent, sessionSecret(env));
      return cors({ token, agent }, 200, { 'Set-Cookie': cookieHeader(token) });
    }

    if (action === 'logout' && method === 'POST') {
      return cors({ ok: true }, 200, { 'Set-Cookie': clearCookieHeader() });
    }

    if (action === 'me' && method === 'GET') {
      const agent = await requireAgent(env, request);
      return cors({ agent });
    }

    if ((action === 'calendar' || action === 'availability') && method === 'GET') {
      await requireAgent(env, request);
      const url = new URL(request.url);
      const from = url.searchParams.get('from') || new Date().toISOString().slice(0, 10);
      const to = url.searchParams.get('to') || from;
      const data = await sanitizedCalendar(env, from, to);
      return cors(data);
    }

    if ((action === 'reserve' || action === 'soft-lock') && method === 'POST') {
      const agent = await requireAgent(env, request);
      const body = await request.json().catch(() => ({}));
      const cabinIds = [...new Set([].concat(body.cabin_ids || body.cabin_id || body.unit_id || []).map((id) => String(id || '').trim()).filter(Boolean))];
      const cabinId = cabinIds[0] || '';
      const startDate = String(body.start_date || body.check_in_date || '');
      const endDate = String(body.end_date || body.check_out_date || '');
      if (!cabinIds.length || !startDate || !endDate || endDate <= startDate) {
        return errorJson('תאריכים או בקתה חסרים', 400, 'BAD_DATES');
      }
      const locks = await createSoftLocks(env, { agent, cabinIds, startDate, endDate });
      const lock = locks[0];
      const token = checkoutToken();
      const bookingId = `agt_${token.slice(4, 16)}`;
      const totalAgorot = Number(body.total_price_agorot || Math.round(Number(body.total_price || 0) * 100));
      const depositAgorot = Number(body.deposit_agorot || Math.round(Number(body.deposit_amount || 0) * 100));
      const paySplit = normalizePaySplit(body.pay_split, cabinIds.length);
      if (cabinIds.length > 1 && !paySplit) {
        return errorJson('יש לבחור איך משלמים כשמזמינים יותר מבקתה אחת', 400, 'PAY_SPLIT_REQUIRED');
      }
      const extras = {
        guest_name: String(body.guest_name || ''),
        guest_phone: String(body.guest_phone || ''),
        guest_email: String(body.guest_email || ''),
        notes: String(body.notes || ''),
        adults: body.adults,
        children: body.children,
        baby_cot_required: Boolean(body.baby_cot_required),
        cabin_parties: body.cabin_parties,
        cabin_ids: cabinIds,
        cabin_names: cabinIds.map(unitName).join(' · '),
        start_date: startDate,
        end_date: endDate,
        pay_split: paySplit || 'together',
        booker_cabin_id: String(body.booker_cabin_id || cabinId),
        cabin_quotes: cabinQuotesOrEqual(cabinIds, totalAgorot, body.cabin_quotes)
      };
      const row = agentMailboxRow({
        lock,
        agent,
        extras,
        token,
        bookingId,
        totalAgorot,
        depositAgorot
      });
      await writeAgentMailbox(env, token, row);

      let hyp = null;
      if (action === 'reserve' || body.start_hyp !== false) {
        try {
          hyp = await startHyp(env, { token, depositAgorot, extras, agent, cabinId, startDate, endDate });
        } catch (err) {
          if (action === 'reserve') throw err;
        }
      }

      const expiresAt = new Date(lock.expires_at * 1000).toISOString();
      return cors({
        token,
        hypPaymentUrl: hyp?.iframeUrl || hyp?.payUrl || '',
        pay_url: hyp?.payUrl || '',
        iframe_url: hyp?.iframeUrl || hyp?.payUrl || '',
        expiresAt,
        lock: {
          ...lock,
          cabin_ids: cabinIds,
          booking_id: bookingId,
          checkout_token: token,
          total_price_agorot: totalAgorot,
          deposit_agorot: depositAgorot
        },
        booking: { id: bookingId, checkout_token: token },
        guest_pay_url: guestPayLink(token)
      }, 201);
    }

    if (action === 'create-hyp-session' && method === 'POST') {
      const agent = await requireAgent(env, request);
      const body = await request.json().catch(() => ({}));
      const token = String(body.checkout_token || body.token || '');
      if (!/^tok_[A-Za-z0-9_-]+$/.test(token)) return errorJson('MISSING_TOKEN', 400, 'MISSING_TOKEN');
      const hyp = await startHyp(env, {
        token,
        depositAgorot: Number(body.deposit_agorot || 0),
        extras: body,
        agent,
        cabinId: body.cabin_id
      });
      return cors({
        pay_url: hyp.payUrl,
        iframe_url: hyp.iframeUrl || hyp.payUrl,
        hypPaymentUrl: hyp.iframeUrl || hyp.payUrl,
        embed: true,
        lowProfileId: hyp.lowProfileId || '',
        terminal: hyp.terminal
      });
    }

    if (action === 'verify-payment' && method === 'POST') {
      const agent = await requireAgent(env, request);
      const body = await request.json().catch(() => ({}));
      const token = String(body.checkout_token || body.token || '');
      let paid = Boolean(body.paid);
      if (/^tok_[A-Za-z0-9_-]+$/.test(token)) {
        const lookup = await fetch(`${new URL(request.url).origin}/api/checkout/${encodeURIComponent(token)}`, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(12000)
        }).catch(() => null);
        if (lookup?.ok) {
          const row = await lookup.json();
          paid = paid
            || row.booking_status === 'CONFIRMED'
            || row.payment_status === 'DEPOSIT_PAID'
            || row.payment_status === 'PAID'
            || Boolean(row.stay?.hyp_deposit?.paid);
        }
      }
      if (!paid) return cors({ paid: false }, 202);
      const lock = {
        cabin_id: body.cabin_id,
        start_date: body.start_date,
        end_date: body.end_date,
        deposit_agorot: body.deposit_agorot
      };
      const text = alertText(agent, lock, body);
      await notifyOps(env, text);
      const opsPhone = String(env.AGENT_ALERT_PHONE || env.HOTELOS_HOST_PHONE || '0548076123').replace(/\D/g, '');
      return cors({
        paid: true,
        voucher: {
          agent: agent.name,
          cabin: body.cabin_names || unitName(body.cabin_id),
          dates: `${body.start_date}–${body.end_date}`,
          guest: body.guest_name,
          guests: guestsLine(body),
          deposit_ils: Math.round((Number(body.deposit_agorot) || 0) / 100),
          pay_split: body.pay_split || 'together'
        },
        stay_links: stayLinksForParties(token, body.cabin_parties),
        ops_whatsapp: opsPhone
          ? `https://wa.me/972${opsPhone.replace(/^0/, '')}?text=${encodeURIComponent(text)}`
          : '',
        guest_whatsapp: token
          ? `https://wa.me/?text=${encodeURIComponent(`לינק לתשלום מקדמה: ${guestPayLink(token)}`)}`
          : '',
        alert: text
      });
    }

    return errorJson('NOT_FOUND', 404, 'NOT_FOUND');
  } catch (err) {
    const status = Number(err.status) || 500;
    if (status === 401) return errorJson('יש להתחבר מחדש', 401, 'UNAUTHORIZED');
    if (err.message === 'DATES_OVERLAP') return errorJson('התאריכים כבר תפוסים', 409, 'DATES_OVERLAP_CONFLICT');
    return errorJson(String(err.message || err), status, 'AGENT_API_FAILED');
  }
}
