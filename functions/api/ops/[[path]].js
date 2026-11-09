import { json, errorJson, fetchPostgrest, getPostgrestConfig } from '../_db.js';
import { loadCalendarReplica } from '../../lib/calendarReplica.js';
import { suggestBookingsForDeal, getIsraelDateString } from '../../lib/cardcomSuggestions.js';
import { filterUnassignedPendingMatches, linkedDealIdsFromSeen } from '../../lib/cardcomPendingFilter.js';

const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';

const DEFAULT_UNITS = [
  { id: 'k826', name: 'קאסה נובה · Aura', sort_order: 0, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k827', name: 'קאסה נובה · Bloom', sort_order: 1, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' },
  { id: 'hill-1', name: 'צימר בגבעה 1', sort_order: 3, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'hill-2', name: 'צימר בגבעה 2', sort_order: 4, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'hill-3', name: 'צימר בגבעה 3', sort_order: 5, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'hill-4', name: 'צימר בגבעה 4', sort_order: 6, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'dome-blue', name: 'כיפת שמיים כחול', sort_order: 7, unit_type: 'dome', max_occupancy: 2, operational_status: 'READY' },
  { id: 'dome-red', name: 'כיפת שמיים אדום', sort_order: 8, unit_type: 'dome', max_occupancy: 2, operational_status: 'READY' },
  { id: 'dome-green', name: 'כיפת שמיים ירוק', sort_order: 9, unit_type: 'dome', max_occupancy: 2, operational_status: 'READY' },
  { id: 'mialis-villa', name: 'וילה מיאליס ריזורט', sort_order: 10, unit_type: 'villa', max_occupancy: 23, operational_status: 'READY' },
  { id: 'suite-1', name: 'סוויטה 1 (הירוקה)', sort_order: 11, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' },
  { id: 'suite-2', name: 'סוויטה 2 (הורודה)', sort_order: 12, unit_type: 'suite', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k671', name: 'Ⓖ23 בתי נורית 1', sort_order: 13, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k673', name: 'Ⓖ23 בתי נורית 2', sort_order: 14, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k674', name: 'Ⓖ23 בתי נורית 3', sort_order: 15, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k675', name: 'Ⓖ23 בתי נורית 4', sort_order: 16, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k676', name: 'Ⓖ23 בתי נורית 5', sort_order: 17, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k677', name: 'Ⓖ23 בתי נורית 6', sort_order: 18, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k808', name: "Ⓔ25 טאג' מאהל · בקתה 1", sort_order: 21, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k809', name: "Ⓔ25 טאג' מאהל · בקתה 2", sort_order: 22, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k810', name: "Ⓔ25 טאג' מאהל · בקתה 3", sort_order: 23, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k811', name: "Ⓔ25 טאג' מאהל · בקתה 4", sort_order: 24, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k680', name: 'Ⓐ29 מול הנוף · בקתה 1', sort_order: 25, unit_type: 'cabin', max_occupancy: 5, operational_status: 'READY' },
  { id: 'k681', name: 'Ⓐ29 מול הנוף · בקתה 2', sort_order: 26, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k685', name: 'Ⓑ28 נופים בלבן · בקתה 1', sort_order: 30, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k687', name: 'Ⓒ27 טוסקנה · 1', sort_order: 32, unit_type: 'cabin', max_occupancy: 4, operational_status: 'READY' },
  { id: 'k690', name: 'Ⓓ26 חצר מוסיקלית · בקתה 1', sort_order: 35, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k691', name: 'Ⓓ26 חצר מוסיקלית · בקתה 2', sort_order: 36, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' },
  { id: 'k693', name: 'Ⓕ24 בקתות מאיה · בקתה 1', sort_order: 38, unit_type: 'cabin', max_occupancy: 2, operational_status: 'READY' }
];

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret || 'dashboard_secret')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function formatCardcomDate(d) {
  if (!d) return '';
  const str = String(d).trim();
  if (/^\d{8}$/.test(str)) return str;
  const dateObj = new Date(str);
  if (!Number.isNaN(dateObj.getTime())) {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = String(dateObj.getFullYear());
    return `${day}${month}${year}`;
  }
  return str;
}

async function searchCardcomTransaction({
  terminal,
  dealIdStr,
  apiName,
  apiPassword,
  dealTime
}) {
  const fromDateStr = formatCardcomDate(dealTime || new Date(Date.now() - 30 * 86400000).toISOString());
  const toDateStr = formatCardcomDate(new Date(Date.now() + 86400000).toISOString());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let page = 1;
  const pageSize = 100;
  const maxPages = 20;

  try {
    while (page <= maxPages) {
      const listRes = await fetch('https://secure.cardcom.solutions/api/v11/Transactions/ListTransactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ApiName: apiName,
          ApiPassword: apiPassword,
          LimitForTerminal: Number(terminal),
          TerminalNumber: Number(terminal),
          FromDate: fromDateStr,
          ToDate: toDateStr,
          TranStatus: 'Success',
          Page: page,
          Page_size: pageSize
        }),
        signal: controller.signal
      });

      if (!listRes.ok) {
        throw new Error(`ListTransactions returned HTTP status ${listRes.status}`);
      }

      const lData = await listRes.json().catch((err) => {
        throw new Error(`ListTransactions invalid JSON response: ${err?.message || err}`);
      });

      if (!lData || typeof lData !== 'object' || (lData.ResponseCode !== 0 && lData.ResponseCode !== '0')) {
        throw new Error(`ListTransactions non-zero ResponseCode: ${lData?.ResponseCode} (${lData?.Description || 'malformed response'})`);
      }

      const list = lData.Tranzactions || lData.Transactions;
      if (!Array.isArray(list)) {
        throw new Error('ListTransactions response missing Tranzactions array (malformed response)');
      }

      const foundTxn = list.find((t) =>
        String(t.TranzactionId || t.DealNumber || t.TransactionId || t.dealNumber || '') === dealIdStr
      );

      if (foundTxn) {
        return { txn: foundTxn, error: null, hitPageCap: false };
      }

      if (list.length < pageSize) {
        break;
      }

      if (page === maxPages) {
        return { txn: null, error: null, hitPageCap: true };
      }
      page += 1;
    }
    return { txn: null, error: null, hitPageCap: false };
  } catch (err) {
    return { txn: null, error: err, hitPageCap: false };
  } finally {
    clearTimeout(timeout);
  }
}

function validateCardcomTransactionMatch({ txn, terminal, dealIdStr, expectedAmount, expectedDocNumber = null }) {
  if (!txn) {
    return { valid: false, reason: `Cardcom transaction not found for deal ${dealIdStr} on terminal ${terminal}` };
  }

  // 1. Verify terminal: explicitly present with no defaults (check TerminalNumber and terminalNumber)
  const rawTerminal = (txn.TerminalNumber !== undefined && txn.TerminalNumber !== null && String(txn.TerminalNumber).trim() !== '')
    ? txn.TerminalNumber
    : ((txn.terminalNumber !== undefined && txn.terminalNumber !== null && String(txn.terminalNumber).trim() !== '')
        ? txn.terminalNumber
        : null);

  if (rawTerminal === null) {
    return { valid: false, reason: `Missing terminal in Cardcom transaction for deal ${dealIdStr}` };
  }

  const txnTerminal = String(rawTerminal).trim();
  if (txnTerminal !== String(terminal).trim()) {
    return { valid: false, reason: `Terminal mismatch for deal ${dealIdStr}: expected ${terminal}, got ${txnTerminal}` };
  }

  // 2. Verify deal (TranzactionId / DealNumber)
  const rawDeal = txn.TranzactionId ?? txn.DealNumber ?? txn.TransactionId ?? txn.dealNumber;
  if (rawDeal === undefined || rawDeal === null || String(rawDeal).trim() === '') {
    return { valid: false, reason: `Missing deal id in Cardcom transaction for deal ${dealIdStr}` };
  }
  const txnDealId = String(rawDeal).trim();
  if (txnDealId !== dealIdStr) {
    return { valid: false, reason: `Deal mismatch for deal ${dealIdStr}: expected ${dealIdStr}, got ${txnDealId}` };
  }

  // 3. Verify amount: must be finite and positive; compare in integer agorot
  const rawAmount = txn.Amount !== undefined && txn.Amount !== null && txn.Amount !== ''
    ? txn.Amount
    : (txn.Sum !== undefined && txn.Sum !== null && txn.Sum !== ''
        ? txn.Sum
        : (txn.amount !== undefined && txn.amount !== null && txn.amount !== ''
            ? txn.amount
            : null));

  if (rawAmount === null) {
    return { valid: false, reason: `Missing amount in Cardcom transaction for deal ${dealIdStr}` };
  }

  const txnAmount = Number(rawAmount);
  if (!Number.isFinite(txnAmount) || txnAmount <= 0) {
    return { valid: false, reason: `Non-numeric or non-positive amount in Cardcom transaction for deal ${dealIdStr}: got ${rawAmount}` };
  }

  const expectedNum = Number(expectedAmount);
  if (!Number.isFinite(expectedNum) || expectedNum <= 0) {
    return { valid: false, reason: `Invalid expected amount for deal ${dealIdStr}: got ${expectedAmount}` };
  }

  const txnAgorot = Math.round(txnAmount * 100);
  const expectedAgorot = Math.round(expectedNum * 100);
  if (txnAgorot !== expectedAgorot) {
    return { valid: false, reason: `Amount mismatch for deal ${dealIdStr}: expected ${expectedNum}, got ${txnAmount}` };
  }

  // 4. Verify currency: explicitly present with no defaults (CoinId = 1 or ILS)
  const rawCoin = (txn.CoinId !== undefined && txn.CoinId !== null && String(txn.CoinId).trim() !== '')
    ? txn.CoinId
    : ((txn.coinId !== undefined && txn.coinId !== null && String(txn.coinId).trim() !== '')
        ? txn.coinId
        : ((txn.ISOCoinID !== undefined && txn.ISOCoinID !== null && String(txn.ISOCoinID).trim() !== '')
            ? txn.ISOCoinID
            : ((txn.Currency !== undefined && txn.Currency !== null && String(txn.Currency).trim() !== '')
                ? txn.Currency
                : ((txn.currency !== undefined && txn.currency !== null && String(txn.currency).trim() !== '')
                    ? txn.currency
                    : null))));

  if (rawCoin === null) {
    return { valid: false, reason: `Missing currency in Cardcom transaction for deal ${dealIdStr}` };
  }

  const txnCoin = String(rawCoin).trim();
  if (txnCoin !== '1' && txnCoin !== 'ILS') {
    return { valid: false, reason: `Currency mismatch for deal ${dealIdStr}: expected ILS (1), got ${txnCoin}` };
  }

  // 5. If verifying against a known document_number
  const txnDocNumber = String(
    txn.DocumentNumber
    || txn.DocNumber
    || txn.InvoiceNumber
    || txn.documentNumber
    || txn.docNumber
    || txn.invoiceNumber
    || ''
  ).trim();

  if (expectedDocNumber) {
    if (!txnDocNumber) {
      return { valid: false, reason: `Document missing in Cardcom for deal ${dealIdStr}: expected document ${expectedDocNumber}, got none` };
    }
    if (txnDocNumber !== String(expectedDocNumber).trim()) {
      return { valid: false, reason: `Document mismatch for deal ${dealIdStr}: expected document ${expectedDocNumber}, got ${txnDocNumber}` };
    }
  }

  const txnDocUrl = String(txn.DocumentUrl || txn.DocUrl || txn.Url || txn.url || '').trim();
  return { valid: true, docNumber: txnDocNumber, docUrl: txnDocUrl };
}

async function verifySessionToken(env, token) {
  if (!token || !token.includes('.')) return null;
  const secret = String(env?.CHECKOUT_MAILBOX_SECRET || env?.HOTELOS_API_SECRET || '').trim();
  if (!secret) return null;
  const [encoded, sig] = token.split('.');
  const expected = await hmacHex(secret, encoded);
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    if (typeof payload?.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function isAuthorizedOps(request, env) {
  const mailboxHeader = request.headers.get('x-hotelos-mailbox') || '';
  const bridgeHeader = request.headers.get('x-hotelos-bridge-secret') || '';
  const mailboxSecret = String(env?.CHECKOUT_MAILBOX_SECRET || '').trim();
  const bridgeSecret = String(env?.HOTELOS_API_SECRET || '').trim();
  const deskPin = String(env?.HOTELOS_DESK_PIN || '').trim();

  if (mailboxSecret && mailboxHeader === mailboxSecret) return true;
  if (bridgeSecret && bridgeHeader === bridgeSecret) return true;

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token) {
    if (token === 'dev-local-token' && env?.ENVIRONMENT === 'development') return true;
    if (deskPin && token === deskPin) return true;
    if (mailboxSecret && token === mailboxSecret) return true;
    const session = await verifySessionToken(env, token);
    if (session) return true;
  }

  // Fail closed: Never allow unauthorized access if secrets are not configured
  return false;
}

async function handleCardcomSuggestions(request, env) {
  try {
    const url = new URL(request.url);
    const dealId = url.searchParams.get('deal_id') || url.searchParams.get('dealId');
    let amount = Number(url.searchParams.get('amount'));
    let dealTime = url.searchParams.get('deal_time') || url.searchParams.get('date');
    let payerName = url.searchParams.get('payer_name') || url.searchParams.get('name') || '';
    const query = url.searchParams.get('q') || '';

    if (dealId && (!Number.isFinite(amount) || amount <= 0 || !dealTime)) {
      try {
        const mRes = await fetchPostgrest(`/cardcom_pending_matches?deal_id=eq.${encodeURIComponent(dealId)}`, { method: 'GET' }, env, { requireServiceRole: true });
        if (mRes && mRes.ok) {
          const mRows = await mRes.json();
          if (Array.isArray(mRows) && mRows[0]) {
            if (!Number.isFinite(amount) || amount <= 0) amount = Number(mRows[0].amount);
            if (!dealTime) dealTime = mRows[0].deal_time;
            if (!payerName) payerName = mRows[0].payer_name || '';
          }
        }
      } catch (_) {}
    }

    let bookings = [];
    try {
      const bRes = await fetchPostgrest(
        '/hotelos_bookings?booking_status=neq.CANCELED&order=check_in_date.desc&limit=1000',
        { method: 'GET' },
        env,
        { requireServiceRole: true }
      );
      if (bRes && bRes.ok) {
        const bRows = await bRes.json();
        if (Array.isArray(bRows)) bookings = bRows;
      }
    } catch (_) {}

    const deal = {
      dealId,
      deal_id: dealId,
      amount,
      dealTime,
      deal_time: dealTime,
      payer_name: payerName,
      cardOwnerName: payerName
    };

    const candidates = suggestBookingsForDeal(deal, bookings, { query, limit: 10 });
    // Older unpaid debts (checked out up to 14 days before D) are returned separately, never mixed into the default list.
    const olderDebts = query
      ? []
      : suggestBookingsForDeal(deal, bookings, { limit: 10, includeOlderDebts: true })
        .filter((c) => !candidates.some((x) => x.bookingId === c.bookingId));
    return json({ ok: true, candidates, suggestions: candidates, older_debts: olderDebts, deal_date: getIsraelDateString(dealTime) });
  } catch (err) {
    return errorJson(err?.message || 'FAILED_TO_GET_SUGGESTIONS', 500, 'SUGGESTIONS_ERROR');
  }
}

export async function onRequest(context) {
  const { request, params, env } = context;
  const pathParts = params?.path || [];
  const head = pathParts[0] || '';
  const sub = pathParts[1] || '';
  const { tenantId } = getPostgrestConfig(env);

  if (request.method === 'OPTIONS') {
    return json({ ok: true });
  }

  // 1. GET /api/ops/units
  if (head === 'units' && request.method === 'GET' && !sub) {
    if (!(await isAuthorizedOps(request, env))) {
      return errorJson('לא מורשה', 401, 'UNAUTHORIZED');
    }

    try {
      const res = await fetchPostgrest('/unit_operations?select=*', { method: 'GET' }, env);
      if (res && res.ok) {
        const liveUnits = await res.json();
        if (Array.isArray(liveUnits) && liveUnits.length > 0) {
          return json({ ok: true, units: liveUnits, tenant_id: tenantId || DEMO_TENANT_ID });
        }
      }
    } catch (_) {}

    // Authoritative replica fallback from D1 guest_context
    const replica = await loadCalendarReplica(env);
    if (Array.isArray(replica?.unitOps) && replica.unitOps.length > 0) {
      return json({ ok: true, units: replica.unitOps, tenant_id: tenantId || DEMO_TENANT_ID });
    }

    const catalog = Array.isArray(replica?.units) && replica.units.length > 0 ? replica.units : DEFAULT_UNITS;
    const cleanUnits = catalog.map((u, idx) => ({
      id: u.id || u.cabin_id,
      name: u.name || u.cabin_name,
      sort_order: u.sort_order ?? idx,
      tenant_id: tenantId || DEMO_TENANT_ID,
      operational_status: 'READY',
      operational_domain: 'HOUSEKEEPING',
      staff_occupancy: 'VACANT',
      custom_reason: '',
      assigned_staff: '',
      is_escalated: false,
      is_active: true,
      updated_at: new Date().toISOString()
    }));
    return json({ ok: true, units: cleanUnits, tenant_id: tenantId || DEMO_TENANT_ID });
  }

  // 2. PUT /api/ops/units/:id
  if (head === 'units' && request.method === 'PUT' && sub) {
    if (!(await isAuthorizedOps(request, env))) {
      return errorJson('לא מורשה', 401, 'UNAUTHORIZED');
    }

    let body = {};
    try { body = await request.json(); } catch {}
    const now = new Date().toISOString();
    const patch = { ...body, id: sub, updated_at: now };

    // 1. If PostgREST reachable, update Supabase
    try {
      await fetchPostgrest(`/unit_operations?id=eq.${encodeURIComponent(sub)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      }, env);
    } catch (_) {}

    // 2. Persist to D1 calendar replica so status change survives and reflects on edge
    if (env?.STAY_DB) {
      try {
        const existing = await env.STAY_DB.prepare('SELECT payload FROM guest_context WHERE id = ?1').bind('all').first();
        if (existing?.payload) {
          const payload = JSON.parse(existing.payload);
          let unitOps = Array.isArray(payload.unitOps) ? [...payload.unitOps] : [];
          const idx = unitOps.findIndex((u) => u.id === sub);
          if (idx >= 0) {
            unitOps[idx] = { ...unitOps[idx], ...patch };
          } else {
            unitOps.push(patch);
          }
          payload.unitOps = unitOps;
          await env.STAY_DB.prepare(
            'INSERT OR REPLACE INTO guest_context (id, payload, synced_at) VALUES (?1, ?2, ?3)'
          ).bind('all', JSON.stringify(payload), now).run();
        }
      } catch (err) {
        console.warn('[D1 Unit Update Error]', err);
      }
    }

    return json({ ok: true, unit: patch });
  }

  // 3. GET /api/ops/catalog
  if (head === 'catalog' && request.method === 'GET') {
    if (!(await isAuthorizedOps(request, env))) {
      return errorJson('לא מורשה', 401, 'UNAUTHORIZED');
    }

    try {
      const res = await fetchPostgrest('/resort_units?select=*&order=sort_order.asc', { method: 'GET' }, env);
      if (res && res.ok) {
        const liveCatalog = await res.json();
        if (Array.isArray(liveCatalog) && liveCatalog.length > 0) {
          return json({ ok: true, units: liveCatalog, tenant_id: tenantId || DEMO_TENANT_ID });
        }
      }
    } catch (_) {}

    const replica = await loadCalendarReplica(env);
    if (Array.isArray(replica?.units) && replica.units.length > 0) {
      const mapped = replica.units.map((u, idx) => ({
        id: u.id || u.cabin_id,
        name: u.name || u.cabin_name,
        sort_order: u.sort_order ?? idx,
        unit_type: 'cabin',
        max_occupancy: 4,
        operational_status: 'READY'
      }));
      return json({ ok: true, units: mapped, tenant_id: tenantId || DEMO_TENANT_ID });
    }

    return json({ ok: true, units: DEFAULT_UNITS, tenant_id: tenantId || DEMO_TENANT_ID });
  }

  // 4. GET /api/ops/bookings
  if (head === 'bookings' && request.method === 'GET') {
    if (!(await isAuthorizedOps(request, env))) {
      return errorJson('לא מורשה', 401, 'UNAUTHORIZED');
    }

    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    try {
      let query = '/hotelos_bookings?select=*';
      if (from && to) {
        query += `&check_in_date=lt.${encodeURIComponent(to)}&check_out_date=gte.${encodeURIComponent(from)}&order=id.asc`;
      } else {
        query += '&order=check_in_date.asc';
      }
      const liveBookings = [];
      const pageSize = 1000;
      const maxPages = from && to ? 20 : 1;
      let pulled = false;
      for (let page = 0; page < maxPages; page += 1) {
        const res = await fetchPostgrest(`${query}&limit=${pageSize}&offset=${page * pageSize}`, { method: 'GET' }, env);
        if (!res || !res.ok) break;
        const batch = await res.json();
        if (!Array.isArray(batch)) break;
        pulled = true;
        liveBookings.push(...batch);
        if (batch.length < pageSize) break;
      }
      if (pulled && liveBookings.length > 0) {
        return json({ ok: true, bookings: liveBookings, tenant_id: tenantId || DEMO_TENANT_ID });
      }
    } catch (_) {}

    // Authoritative replica fallback from D1 guest_context
    const replica = await loadCalendarReplica(env);
    const stays = (Array.isArray(replica?.stays) ? replica.stays : []).map((b) => ({
      ...b,
      tenant_id: b.tenant_id || tenantId || DEMO_TENANT_ID
    }));
    let bookings = stays;
    if (from && to) {
      bookings = stays.filter((b) => {
        const inDate = b.check_in_date || '';
        const outDate = b.check_out_date || '';
        return inDate < to && outDate >= from;
      });
    }

    return json({ ok: true, bookings, tenant_id: tenantId || DEMO_TENANT_ID });
  }

  // 5. GET /api/ops/sop-templates
  if (head === 'sop-templates') {
    return json({ ok: true, templates: [], tenant_id: tenantId || DEMO_TENANT_ID });
  }

  // 5b. GET /api/ops/suggestions or /api/ops/candidates
  if ((head === 'suggestions' || head === 'candidates') && request.method === 'GET') {
    if (!(await isAuthorizedOps(request, env))) {
      return errorJson('לא מורשה', 401, 'UNAUTHORIZED');
    }
    return handleCardcomSuggestions(request, env);
  }

  // 6. /api/ops/cardcom-terminal/*
  if (head === 'cardcom-terminal') {
    if (!(await isAuthorizedOps(request, env))) {
      return errorJson('לא מורשה', 401, 'UNAUTHORIZED');
    }

    if (!env?.SUPABASE_SERVICE_ROLE_KEY) {
      return errorJson('SUPABASE_SERVICE_ROLE_KEY is required for Cardcom terminal operations', 500, 'SERVICE_ROLE_KEY_REQUIRED');
    }

    // GET /api/ops/cardcom-terminal/pending
    if (sub === 'pending' && request.method === 'GET') {
      try {
        let pending = [];
        let recentlyApproved = [];
        let linkedDealIds = new Set();
        try {
          const [pendingRes, approvedRes, seenRes] = await Promise.all([
            fetchPostgrest('/cardcom_pending_matches?status=eq.pending&order=created_at.desc', { method: 'GET' }, env, { requireServiceRole: true }),
            fetchPostgrest('/cardcom_pending_matches?status=in.(approved,manual_linked)&order=approved_at.desc&limit=15', { method: 'GET' }, env, { requireServiceRole: true }),
            fetchPostgrest('/cardcom_seen_deals?or=(status.eq.linked,linked_booking_id.not.is.null)&select=deal_id,status,linked_booking_id', { method: 'GET' }, env, { requireServiceRole: true })
          ]);
          if (seenRes && seenRes.ok) {
            const rows = await seenRes.json();
            if (Array.isArray(rows)) linkedDealIds = linkedDealIdsFromSeen(rows);
          }
          if (pendingRes && pendingRes.ok) {
            const rows = await pendingRes.json();
            if (Array.isArray(rows)) pending = rows;
          }
          if (approvedRes && approvedRes.ok) {
            const rows = await approvedRes.json();
            if (Array.isArray(rows)) recentlyApproved = rows;
          }
        } catch (_) {}

        if (pending.length === 0 && recentlyApproved.length === 0) {
          try {
            const setRes = await fetchPostgrest('/hotelos_runtime_settings?key=eq.cardcom_pending_matches', { method: 'GET' }, env, { requireServiceRole: true });
            if (setRes && setRes.ok) {
              const rows = await setRes.json();
              if (Array.isArray(rows) && rows[0]?.value) {
                const list = JSON.parse(rows[0].value);
                if (Array.isArray(list)) {
                  pending = list.filter((m) => m.status === 'pending');
                  recentlyApproved = list.filter((m) => m.status === 'approved' || m.status === 'manual_linked').slice(0, 15);
                }
              }
            }
          } catch (_) {}
        }

        // Unassigned = no booking AND no Cardcom document; already linked/invoiced deals never show.
        pending = filterUnassignedPendingMatches(pending, { linkedDealIds });
        return json({ ok: true, pending, recently_approved: recentlyApproved });
      } catch (_) {}
      return json({ ok: true, pending: [], recently_approved: [] });
    }

    // GET /api/ops/cardcom-terminal/suggestions or /candidates
    if ((sub === 'suggestions' || sub === 'candidates') && request.method === 'GET') {
      return handleCardcomSuggestions(request, env);
    }

    // POST /api/ops/cardcom-terminal/link
    if (sub === 'link' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}
      const { deal_id, booking_id } = body;
      if (!deal_id || !booking_id) {
        return errorJson('Missing deal_id or booking_id', 400, 'MISSING_DEAL_OR_BOOKING_ID');
      }

      const dealIdStr = String(deal_id);
      const externalId = dealIdStr.startsWith('deal-') ? dealIdStr : `deal-${dealIdStr}`;
      const terminal = '184288';
      const apiName = env.CARDCOM_API_NAME;
      const apiPassword = env.CARDCOM_API_PASSWORD;

      if (!apiName || !apiPassword) {
        return errorJson('Cardcom API credentials not configured', 500, 'MISSING_CARDCOM_CREDENTIALS');
      }

      // Fetch match
      let match = null;
      let allRuntimeMatches = [];
      try {
        const mRes = await fetchPostgrest(`/cardcom_pending_matches?deal_id=eq.${encodeURIComponent(deal_id)}`, { method: 'GET' }, env, { requireServiceRole: true });
        if (mRes && mRes.ok) {
          const mRows = await mRes.json();
          if (Array.isArray(mRows) && mRows[0]) match = mRows[0];
        }
      } catch (_) {}

      if (!match) {
        try {
          const setRes = await fetchPostgrest('/hotelos_runtime_settings?key=eq.cardcom_pending_matches', { method: 'GET' }, env, { requireServiceRole: true });
          if (setRes && setRes.ok) {
            const rows = await setRes.json();
            if (Array.isArray(rows) && rows[0]?.value) {
              allRuntimeMatches = JSON.parse(rows[0].value);
              if (Array.isArray(allRuntimeMatches)) {
                match = allRuntimeMatches.find((m) => String(m.deal_id) === String(deal_id));
              }
            }
          }
        } catch (_) {}
      }

      if (!match) {
        return errorJson('Match proposal not found for deal', 404, 'MATCH_NOT_FOUND');
      }

      const proposalTerminal = String(match?.terminal_number ?? match?.terminal ?? '184288').trim();
      if (proposalTerminal !== '184288' ||
          (match?.terminal && String(match.terminal).trim() !== '184288') ||
          (match?.terminal_number && String(match.terminal_number).trim() !== '184288') ||
          (body?.terminal && String(body.terminal).trim() !== '184288')) {
        return errorJson('Proposal terminal mismatch (must be 184288)', 400, 'INVALID_TERMINAL');
      }

      // Fetch booking
      let booking = null;
      try {
        const bRes = await fetchPostgrest(`/hotelos_bookings?id=eq.${encodeURIComponent(booking_id)}`, { method: 'GET' }, env, { requireServiceRole: true });
        if (bRes && bRes.ok) {
          const bRows = await bRes.json();
          if (Array.isArray(bRows) && bRows[0]) booking = bRows[0];
        }
      } catch (_) {}

      if (!booking) {
        return errorJson('Booking not found', 404, 'BOOKING_NOT_FOUND');
      }

      const amount = Number(match?.amount || 0);
      if (!amount || amount <= 0) {
        return errorJson('Invalid deal amount', 400, 'INVALID_AMOUNT');
      }

      // 1. Authoritative transaction evidence validation (Read-only Cardcom lookup BEFORE committing receipt)
      // Must validate payment evidence before committing an authoritative receipt to avoid inflating booking balances.
      const { txn, error: txnLookupError, hitPageCap } = await searchCardcomTransaction({
        terminal,
        dealIdStr,
        apiName,
        apiPassword,
        dealTime: match?.deal_time
      });

      if (txnLookupError || hitPageCap) {
        const reason = txnLookupError
          ? `Cardcom lookup error: ${txnLookupError.message}`
          : `Cardcom lookup reached page cap (20 pages) without resolving deal ${dealIdStr}`;

        await fetchPostgrest('/rpc/mark_cardcom_deal_reconciliation_needed', {
          method: 'POST',
          body: JSON.stringify({
            p_terminal: terminal,
            p_deal_id: dealIdStr,
            p_error_message: reason,
            p_booking_id: booking_id,
            p_amount: amount
          })
        }, env, { requireServiceRole: true });

        console.error('[STAFF ALERT] Cardcom deal reconciliation required:', {
          terminal,
          dealId: dealIdStr,
          bookingId: booking_id,
          reason
        });

        return errorJson(
          `Deal ${dealIdStr} requires staff reconciliation (${reason}).`,
          409,
          'RECONCILIATION_REQUIRED'
        );
      }

      const matchCheck = validateCardcomTransactionMatch({
        txn,
        terminal,
        dealIdStr,
        expectedAmount: amount
      });

      if (!matchCheck.valid) {
        await fetchPostgrest('/rpc/mark_cardcom_deal_reconciliation_needed', {
          method: 'POST',
          body: JSON.stringify({
            p_terminal: terminal,
            p_deal_id: dealIdStr,
            p_error_message: matchCheck.reason,
            p_booking_id: booking_id,
            p_amount: amount
          })
        }, env, { requireServiceRole: true });

        console.error('[STAFF ALERT] Cardcom deal reconciliation required:', {
          terminal,
          dealId: dealIdStr,
          bookingId: booking_id,
          reason: matchCheck.reason
        });

        return errorJson(
          `Deal ${dealIdStr} transaction validation failed (${matchCheck.reason}).`,
          409,
          'RECONCILIATION_REQUIRED'
        );
      }

      // 2. Transaction is verified! Persist authoritative receipt in booking BEFORE CreateDocument
      const initialReceiptEntry = {
        method: 'CARD',
        amount_ils: amount,
        amount_agorot: Math.round(amount * 100),
        deal_number: dealIdStr,
        txn: dealIdStr,
        approval: match?.approval || txn?.ApprovalNumber || txn?.approvalNumber || undefined,
        last4: match?.last4 || txn?.CardLastDigits || txn?.last4 || undefined,
        payer_name: match?.payer_name || txn?.CardOwnerName || txn?.payer_name || undefined,
        terminal,
        external_id: externalId,
        invoice_status: 'pending_invoice',
        recorded_at: new Date().toISOString()
      };

      const receiptRpcRes = await fetchPostgrest('/rpc/record_cardcom_deal_receipt', {
        method: 'POST',
        body: JSON.stringify({
          p_booking_id: booking_id,
          p_receipt_entry: initialReceiptEntry
        })
      }, env, { requireServiceRole: true });

      if (!receiptRpcRes || !receiptRpcRes.ok) {
        let errBody = null;
        try { errBody = await receiptRpcRes.json(); } catch (_) {}
        const combinedErr = `${errBody?.error || ''} ${errBody?.message || ''} ${errBody?.details || ''}`;
        if (combinedErr.includes('DEAL_ALREADY_ASSIGNED')) {
          return errorJson(errBody?.message || 'DEAL_ALREADY_ASSIGNED', 409, 'DEAL_ALREADY_ASSIGNED');
        }
        if (combinedErr.includes('BOOKING_NOT_FOUND')) {
          return errorJson(errBody?.message || 'BOOKING_NOT_FOUND', 404, 'BOOKING_NOT_FOUND');
        }
        return errorJson(errBody?.message || errBody?.error || 'Database receipt recording failed', 500, 'DB_WRITE_FAILED');
      }

      const receiptData = await receiptRpcRes.json().catch(() => ({}));
      let invoiceInfo = null;

      // 3. Invoice verification & reuse:
      const knownDocNumber = String(
        receiptData?.document_number ||
        match?.document_number ||
        match?.invoice_number ||
        match?.invoice ||
        ''
      ).trim();

      const knownDocUrl = String(
        receiptData?.document_url ||
        match?.document_url ||
        match?.invoice_url ||
        ''
      ).trim();

      if (knownDocNumber) {
        if (!matchCheck.docNumber) {
          const reason = `Document missing in Cardcom for deal ${dealIdStr}: expected document ${knownDocNumber}, got none`;
          await fetchPostgrest('/rpc/mark_cardcom_deal_reconciliation_needed', {
            method: 'POST',
            body: JSON.stringify({
              p_terminal: terminal,
              p_deal_id: dealIdStr,
              p_error_message: reason,
              p_booking_id: booking_id,
              p_amount: amount
            })
          }, env, { requireServiceRole: true });

          console.error('[STAFF ALERT] Cardcom deal reconciliation required:', {
            terminal,
            dealId: dealIdStr,
            bookingId: booking_id,
            reason
          });

          // Preserve already-verified receipt in booking; return 409 for invoice reconciliation
          return errorJson(
            `Deal ${dealIdStr} document reuse verification failed (${reason}).`,
            409,
            'RECONCILIATION_REQUIRED'
          );
        }

        if (matchCheck.docNumber !== knownDocNumber) {
          const reason = `Document mismatch for deal ${dealIdStr}: expected document ${knownDocNumber}, got ${matchCheck.docNumber}`;
          await fetchPostgrest('/rpc/mark_cardcom_deal_reconciliation_needed', {
            method: 'POST',
            body: JSON.stringify({
              p_terminal: terminal,
              p_deal_id: dealIdStr,
              p_error_message: reason,
              p_booking_id: booking_id,
              p_amount: amount
            })
          }, env, { requireServiceRole: true });

          console.error('[STAFF ALERT] Cardcom deal reconciliation required:', {
            terminal,
            dealId: dealIdStr,
            bookingId: booking_id,
            reason
          });

          return errorJson(
            `Deal ${dealIdStr} document reuse verification failed (${reason}).`,
            409,
            'RECONCILIATION_REQUIRED'
          );
        }

        invoiceInfo = {
          documentNumber: knownDocNumber,
          documentUrl: matchCheck.docUrl || knownDocUrl,
          dealId: dealIdStr,
          reused: true
        };
      } else if (matchCheck.docNumber) {
        // Document already confirmed in Cardcom transaction
        invoiceInfo = {
          documentNumber: matchCheck.docNumber,
          documentUrl: matchCheck.docUrl || '',
          dealId: dealIdStr,
          reused: true
        };
      }

      // If document was found/verified, finalize it now
      if (invoiceInfo?.documentNumber) {
        const finalizeRes = await fetchPostgrest('/rpc/finalize_cardcom_deal_invoice', {
          method: 'POST',
          body: JSON.stringify({
            p_booking_id: booking_id,
            p_deal_number: dealIdStr,
            p_terminal: terminal,
            p_document_number: String(invoiceInfo.documentNumber),
            p_document_url: String(invoiceInfo.documentUrl || '')
          })
        }, env, { requireServiceRole: true });

        if (!finalizeRes || !finalizeRes.ok) {
          let fErr = null;
          try { fErr = await finalizeRes.json(); } catch (_) {}
          console.error('[STAFF ALERT] finalize_cardcom_deal_invoice failed on verified reuse:', fErr);
          return errorJson('Failed to finalize verified invoice in booking', 500, 'FINALIZE_FAILED');
        }

        return json({
          ok: true,
          booking_id,
          deal_id: dealIdStr,
          payment: {
            status: receiptData?.payment_status || 'PARTIAL',
            amount,
            currency: 'ILS',
            terminal
          },
          invoice: invoiceInfo
        });
      }

      // 4. If not already invoiced, acquire atomic retry claim before calling Cardcom CreateDocument
      const wasAmbiguous = Boolean(
        receiptData?.ledger_status === 'reconciliation_needed' ||
        receiptData?.status === 'reconciliation_needed'
      );

      if (wasAmbiguous) {
        const reason = `Reconciliation completed without finding confirmed document after ambiguous outcome for deal ${dealIdStr}`;
        await fetchPostgrest('/rpc/mark_cardcom_deal_reconciliation_needed', {
          method: 'POST',
          body: JSON.stringify({
            p_terminal: terminal,
            p_deal_id: dealIdStr,
            p_error_message: reason,
            p_booking_id: booking_id,
            p_amount: amount
          })
        }, env, { requireServiceRole: true });

        console.error('[STAFF ALERT] Cardcom deal reconciliation required:', {
          terminal,
          dealId: dealIdStr,
          bookingId: booking_id,
          reason
        });

        return errorJson(
          `Deal ${dealIdStr} is in an ambiguous state and requires staff reconciliation (${reason}).`,
          409,
          'RECONCILIATION_REQUIRED'
        );
      }

      const claimRes = await fetchPostgrest('/rpc/claim_cardcom_deal_retry', {
        method: 'POST',
        body: JSON.stringify({
          p_terminal: terminal,
          p_deal_id: dealIdStr,
          p_booking_id: booking_id
        })
      }, env, { requireServiceRole: true });

      if (!claimRes || !claimRes.ok) {
        let cErr = null;
        try { cErr = await claimRes.json(); } catch (_) {}
        const cErrCombined = `${cErr?.error || ''} ${cErr?.message || ''} ${cErr?.details || ''}`;
        if (cErrCombined.includes('DEAL_ALREADY_ASSIGNED')) {
          return errorJson(cErr?.message || 'DEAL_ALREADY_ASSIGNED', 409, 'DEAL_ALREADY_ASSIGNED');
        }
        if (cErrCombined.includes('DEAL_CLAIM_IN_PROGRESS')) {
          return errorJson(cErr?.message || 'DEAL_CLAIM_IN_PROGRESS', 409, 'DEAL_CLAIM_IN_PROGRESS');
        }
        if (cErrCombined.includes('RECONCILIATION_REQUIRED')) {
          return errorJson(cErr?.message || 'Deal is in reconciliation_needed state and requires staff resolution', 409, 'RECONCILIATION_REQUIRED');
        }
        return errorJson(cErr?.message || cErr?.error || 'Failed to claim deal for invoice generation', 500, 'CLAIM_FAILED');
      }

      const claimData = await claimRes.json().catch(() => null);
      if (!claimData || typeof claimData !== 'object' || claimData.ok !== true) {
        return errorJson('Malformed or invalid response from claim RPC', 500, 'CLAIM_FAILED');
      }

      // Check if the claim returned an existing document (Scenario 1: another worker created/finalized it in the meantime)
      const claimedDocNumber = String(claimData.document_number || '').trim();
      const isAlreadyInvoiced = claimData.status === 'invoiced' || claimData.outcome === 'already_invoiced' || Boolean(claimedDocNumber);

      if (isAlreadyInvoiced) {
        if (!claimedDocNumber) {
          return errorJson(`Deal ${dealIdStr} is marked invoiced but document number is missing`, 409, 'RECONCILIATION_REQUIRED');
        }

        // Re-verify the existing document against Cardcom (KB 499 lookup)
        const recheck = await searchCardcomTransaction({
          terminal,
          dealIdStr,
          apiName,
          apiPassword,
          dealTime: match?.deal_time
        });

        if (recheck.error || recheck.hitPageCap || !recheck.txn) {
          const reason = recheck.error
            ? `Cardcom lookup error during document reuse verification: ${recheck.error.message}`
            : (recheck.hitPageCap
                ? `Cardcom lookup reached page cap during document reuse verification`
                : `Cardcom transaction not found during document reuse verification`);

          await fetchPostgrest('/rpc/mark_cardcom_deal_reconciliation_needed', {
            method: 'POST',
            body: JSON.stringify({
              p_terminal: terminal,
              p_deal_id: dealIdStr,
              p_error_message: reason,
              p_booking_id: booking_id,
              p_amount: amount
            })
          }, env, { requireServiceRole: true });

          console.error('[STAFF ALERT] Cardcom deal reconciliation required:', {
            terminal,
            dealId: dealIdStr,
            bookingId: booking_id,
            reason
          });

          return errorJson(`Deal ${dealIdStr} document reuse verification failed (${reason}).`, 409, 'RECONCILIATION_REQUIRED');
        }

        const recheckMatch = validateCardcomTransactionMatch({
          txn: recheck.txn,
          terminal,
          dealIdStr,
          expectedAmount: amount,
          expectedDocNumber: claimedDocNumber
        });

        if (!recheckMatch.valid) {
          await fetchPostgrest('/rpc/mark_cardcom_deal_reconciliation_needed', {
            method: 'POST',
            body: JSON.stringify({
              p_terminal: terminal,
              p_deal_id: dealIdStr,
              p_error_message: recheckMatch.reason,
              p_booking_id: booking_id,
              p_amount: amount
            })
          }, env, { requireServiceRole: true });

          console.error('[STAFF ALERT] Cardcom deal reconciliation required:', {
            terminal,
            dealId: dealIdStr,
            bookingId: booking_id,
            reason: recheckMatch.reason
          });

          return errorJson(`Deal ${dealIdStr} document reuse verification failed (${recheckMatch.reason}).`, 409, 'RECONCILIATION_REQUIRED');
        }

        // Authoritatively verified! Reuse the document, finalize it in the booking, and NEVER create
        invoiceInfo = {
          documentNumber: claimedDocNumber,
          documentUrl: recheckMatch.docUrl || String(claimData.document_url || ''),
          dealId: dealIdStr,
          reused: true
        };

        const finalizeRes = await fetchPostgrest('/rpc/finalize_cardcom_deal_invoice', {
          method: 'POST',
          body: JSON.stringify({
            p_booking_id: booking_id,
            p_deal_number: dealIdStr,
            p_terminal: terminal,
            p_document_number: String(invoiceInfo.documentNumber),
            p_document_url: String(invoiceInfo.documentUrl || '')
          })
        }, env, { requireServiceRole: true });

        if (!finalizeRes || !finalizeRes.ok) {
          let fErr = null;
          try { fErr = await finalizeRes.json(); } catch (_) {}
          console.error('[STAFF ALERT] finalize_cardcom_deal_invoice failed on verified reuse:', fErr);
          return errorJson('Failed to finalize verified invoice in booking', 500, 'FINALIZE_FAILED');
        }

        return json({
          ok: true,
          booking_id,
          deal_id: dealIdStr,
          payment: {
            status: receiptData?.payment_status || 'PARTIAL',
            amount,
            currency: 'ILS',
            terminal
          },
          invoice: invoiceInfo
        });
      }

      // Check for explicit safe-to-create claim acquisition (Requirement 1)
      const isClaimAcquired = (
        (claimData.outcome === 'claim_acquired' || claimData.status === 'claiming_retry') &&
        !claimData.document_number
      );

      if (!isClaimAcquired) {
        return errorJson(
          `Unexpected claim outcome for deal ${dealIdStr}. Only a successfully acquired claim authorizes invoice creation.`,
          409,
          'INVALID_CLAIM_OUTCOME'
        );
      }

      // 4. Create document in Cardcom if still not found
      if (!invoiceInfo) {
        const companyName = String(booking.company_name || booking.invoice_company || booking.business_name || '').trim();
        const taxId = String(booking.tax_id || booking.company_hp || booking.hp || booking.vat_id || booking.business_id || '').trim();
        let customerName = String(booking.invoice_name || companyName || booking.guest_name || 'אורח').trim();
        if (taxId && !customerName.includes(taxId)) {
          customerName = `${customerName} ח.פ. ${taxId}`;
        }
        const customLine = String(booking.custom_invoice_line || booking.invoice_line || booking.custom_line || booking.invoice_description || '').trim();
        const unit = booking.unit_name || booking.unit_id || '';
        const invoiceDesc = customLine || (unit ? `אירוח ב-${unit}` : 'אירוח');

        const docBody = {
          ApiName: apiName,
          ApiPassword: apiPassword,
          IsSendSMS: false,
          Document: {
            DocumentTypeToCreate: 'TaxInvoiceAndReceipt',
            ExternalId: externalId,
            Name: customerName,
            Email: booking.guest_email || 'mialeesresort@mialees.com',
            Phone: booking.guest_phone || undefined,
            IsSendByEmail: true,
            Products: [
              {
                Description: invoiceDesc,
                UnitCost: Math.round(amount * 100) / 100,
                Quantity: 1,
                IsVatFree: false
              }
            ],
            ISOCoinID: '1'
          },
          DealNumbers: [{ DealNumber: dealIdStr }]
        };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);

        try {
          const cardcomRes = await fetch('https://secure.cardcom.solutions/api/v11/Documents/CreateDocument', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(docBody),
            signal: controller.signal
          });
          const cData = await cardcomRes.json().catch(() => null);

          // Every ambiguous outcome / failure becomes reconciliation_needed (never failed)
          if (!cardcomRes.ok || (cData?.ResponseCode !== undefined && cData?.ResponseCode !== 0 && cData?.ResponseCode !== '0')) {
            const errMsg = cData?.Description || `Cardcom document creation failed with code ${cData?.ResponseCode}`;
            await fetchPostgrest('/rpc/mark_cardcom_deal_reconciliation_needed', {
              method: 'POST',
              body: JSON.stringify({
                p_terminal: terminal,
                p_deal_id: dealIdStr,
                p_error_message: errMsg
              })
            }, env, { requireServiceRole: true });
            return errorJson(errMsg, 400, 'CARDCOM_CREATE_DOCUMENT_FAILED');
          }

          const docNumber = String(cData?.DocumentNumber || cData?.DocNumber || '').trim();
          if (!docNumber) {
            await fetchPostgrest('/rpc/mark_cardcom_deal_reconciliation_needed', {
              method: 'POST',
              body: JSON.stringify({
                p_terminal: terminal,
                p_deal_id: dealIdStr,
                p_error_message: 'Cardcom returned empty document number'
              })
            }, env, { requireServiceRole: true });
            return errorJson('Cardcom returned empty document number', 502, 'CARDCOM_INVALID_RESPONSE');
          }

          invoiceInfo = {
            documentNumber: docNumber,
            documentUrl: String(cData?.DocumentUrl || cData?.DocUrl || cData?.Url || '').trim(),
            dealId: dealIdStr
          };
        } catch (fetchErr) {
          const isTimeout = fetchErr.name === 'AbortError';
          const errMsg = isTimeout ? 'Cardcom timeout' : (fetchErr?.message || 'Network error');
          await fetchPostgrest('/rpc/mark_cardcom_deal_reconciliation_needed', {
            method: 'POST',
            body: JSON.stringify({
              p_terminal: terminal,
              p_deal_id: dealIdStr,
              p_error_message: errMsg
            })
          }, env, { requireServiceRole: true });

          if (isTimeout) {
            return errorJson('Cardcom invoice request timed out. Reconciliation required.', 504, 'CARDCOM_TIMEOUT');
          }
          return errorJson(`Cardcom network error: ${errMsg}`, 502, 'CARDCOM_NETWORK_ERROR');
        } finally {
          clearTimeout(timer);
        }
      }

      if (!invoiceInfo || !invoiceInfo.documentNumber) {
        return errorJson('No invoice generated or found for deal', 500, 'INVOICE_REQUIRED');
      }

      // 5. Finalize invoice: update ledger, booking clearing_payments, and cardcom_pending_matches in DB
      const finalizeRes = await fetchPostgrest('/rpc/finalize_cardcom_deal_invoice', {
        method: 'POST',
        body: JSON.stringify({
          p_booking_id: booking_id,
          p_deal_number: dealIdStr,
          p_terminal: terminal,
          p_document_number: invoiceInfo.documentNumber,
          p_document_url: invoiceInfo.documentUrl || ''
        })
      }, env, { requireServiceRole: true });

      if (!finalizeRes || !finalizeRes.ok) {
        return errorJson('Failed to finalize invoice in database', 500, 'FINALIZE_INVOICE_FAILED');
      }

      // Update runtime settings fallback if present
      if (allRuntimeMatches.length > 0 && match) {
        match.status = 'manual_linked';
        match.selected_booking_id = booking_id;
        match.guest_name = booking.guest_name || booking.invoice_name || null;
        match.unit_name = booking.unit_name || booking.unit_id || null;
        match.invoice_number = invoiceInfo.documentNumber;
        match.invoice_url = invoiceInfo.documentUrl || null;
        match.document_number = invoiceInfo.documentNumber;
        match.document_url = invoiceInfo.documentUrl || null;
        match.approved_at = new Date().toISOString();
        match.payment_recorded_at = new Date().toISOString();
        try {
          await fetchPostgrest('/hotelos_runtime_settings?key=eq.cardcom_pending_matches', {
            method: 'PATCH',
            body: JSON.stringify({
              value: JSON.stringify(allRuntimeMatches),
              updated_at: new Date().toISOString()
            })
          }, env, { requireServiceRole: true });
        } catch (_) {}
      }

      const finalPayment = {
        ...initialReceiptEntry,
        invoice: invoiceInfo.documentNumber,
        invoice_url: invoiceInfo.documentUrl || undefined,
        document_number: invoiceInfo.documentNumber,
        document_url: invoiceInfo.documentUrl || undefined,
        invoice_status: 'invoiced'
      };

      return json({ ok: true, booking_id, invoice: invoiceInfo, payment: finalPayment });
    }

    // POST /api/ops/cardcom-terminal/audit-escape
    if (sub === 'audit-escape' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}
      const staffName = body.staff_name || 'צוות';
      const reason = body.reason || 'חירום: עקיפת מודל חוסם להמשך עבודה בדסק';
      const eventId = body.event_id || body.id || null;
      const originalTs = body.timestamp || new Date().toISOString();
      let auditRes = null;
      try {
        const auditRow = {
          action: 'EMERGENCY_ESCAPE',
          staff_name: staffName,
          details: { reason, timestamp: originalTs, event_id: eventId },
          created_at: originalTs
        };
        if (eventId) {
          auditRow.event_id = eventId;
        }
        auditRes = await fetchPostgrest('/cardcom_terminal_audit_log', {
          method: 'POST',
          body: JSON.stringify(auditRow)
        }, env, { requireServiceRole: true });
      } catch (err) {
        console.error('[Cardcom Audit] Escape insert error:', err?.message || 'unknown');
        return errorJson('Failed to record emergency escape audit log', 500, 'AUDIT_INSERT_FAILED');
      }

      if (!auditRes || !auditRes.ok) {
        if (auditRes?.status === 409) {
          return json({ ok: true, escaped_at: originalTs, deduplicated: true });
        }
        return errorJson('Failed to record emergency escape audit log in database', 500, 'AUDIT_INSERT_FAILED');
      }
      return json({ ok: true, escaped_at: originalTs });
    }

    // POST /api/ops/cardcom-terminal/ignore
    if (sub === 'ignore' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}
      const { deal_id, reason, status } = body;
      const targetStatus = status || (reason === 'test' ? 'test' : 'ignored');
      if (deal_id) {
        const patchRes = await fetchPostgrest(`/cardcom_pending_matches?deal_id=eq.${encodeURIComponent(deal_id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: targetStatus,
            updated_at: new Date().toISOString()
          })
        }, env, { requireServiceRole: true });

        if (!patchRes || !patchRes.ok) {
          return errorJson('Failed to update deal status', 500, 'STATUS_UPDATE_FAILED');
        }

        try {
          const setRes = await fetchPostgrest('/hotelos_runtime_settings?key=eq.cardcom_pending_matches', { method: 'GET' }, env, { requireServiceRole: true });
          if (setRes && setRes.ok) {
            const rows = await setRes.json();
            if (Array.isArray(rows) && rows[0]?.value) {
              const allRuntime = JSON.parse(rows[0].value);
              if (Array.isArray(allRuntime)) {
                const target = allRuntime.find((m) => String(m.deal_id) === String(deal_id));
                if (target) {
                  target.status = targetStatus;
                  target.updated_at = new Date().toISOString();
                  await fetchPostgrest('/hotelos_runtime_settings?key=eq.cardcom_pending_matches', {
                    method: 'PATCH',
                    body: JSON.stringify({
                      value: JSON.stringify(allRuntime),
                      updated_at: new Date().toISOString()
                    })
                  }, env, { requireServiceRole: true });
                }
              }
            }
          }
        } catch (_) {}
      }
      return json({ ok: true, status: targetStatus });
    }
  }

  return errorJson('נתיב לא קיים', 404, 'NOT_FOUND');
}
