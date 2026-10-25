import { createFileOauthStore, createOauthService } from './mcpAuth.js';
import { createOtpGate } from './mcpOtp.js';
import {
  canReadGuestPage,
  fetchedAt,
  financeSummary,
  isManager,
  pageOf,
  parseDate,
  projectBankAccount,
  projectBankTransaction,
  projectBooking,
  projectBookingMoney,
  projectCatalog,
  projectDocument,
  projectExpense,
  projectUnit
} from './mcpRead.js';
import { productionDeps } from './mcpData.js';
import { GUEST_PRINT_ABSENT, projectGuestPage, projectGuestPageSummary } from '../src/lib/guestPageRead.js';

const REFRESH_GAP_MS = 5 * 60 * 1000;
const PROTOCOL = '2025-03-26';

const TOOLS = [
  tool('resortos_profile', 'מי מחובר לחיבור הזה. רק בעלים או מנהל.', { type: 'object', additionalProperties: false }, true),
  tool('resortos_catalog', 'קטלוג היחידות. המחיר הבסיסי בשקלים מתוך אגורות, 100 אגורות = 1 ש״ח.', filters(), true),
  tool('resortos_units', 'סטטוס תפעולי של החדרים.', filters(), true),
  tool('resortos_bookings', 'הזמנות: שם, יחידה ותאריכים. בלי טלפון ובלי תשלום.', dateFilters(), true),
  tool('resortos_work_log', 'ניקיונות שנסגרו על ידי המנהל המחובר בלבד.', { type: 'object', additionalProperties: false }, true),
  tool('resortos_procedures', 'ספריית נהלי העבודה.', { type: 'object', additionalProperties: false }, true),
  tool('resortos_documents', 'ספריית המסמכים בפריוריטי. בלי id מוחזרת רשימה. עם id מוחזר טקסט המסמך.', {
    type: 'object',
    properties: { id: { type: 'string' } },
    additionalProperties: false
  }, true),
  tool('resortos_booking_money', 'שווי הזמנה, מקדמה נדרשת, תקבולים, החזרים ויתרה. שווי אינו כסף שהתקבל.', dateFilters(), true),
  tool('resortos_expenses', 'חשבוניות ספקים. הסכומים כבר בשקלים, כולל מע״מ כשנשמר.', dateFilters(), true),
  tool('resortos_finance_summary', 'סיכום הזמנות לחוד. לא מערבב הוצאות ולא מציג רווח.', {
    type: 'object',
    properties: {
      from: { type: 'string' },
      to: { type: 'string' },
      property_id: { type: 'string' }
    },
    additionalProperties: false
  }, true),
  tool('resortos_bank_accounts', 'חשבונות בנק, כרטיסים והלוואות כפי שנשמרו אצלנו דרך Open Finance. מספר חשבון ממוסך.', { type: 'object', additionalProperties: false }, true, true),
  tool('resortos_bank_transactions', 'תנועות בנק וכרטיסים מ-Open Finance. הסכום כבר ביחידת המטבע, לא באגורות.', {
    type: 'object',
    properties: {
      date_from: { type: 'string' },
      date_to: { type: 'string' },
      account_id: { type: 'string' },
      limit: { type: 'integer' },
      cursor: { type: 'string' }
    },
    additionalProperties: false
  }, true, true),
  tool('resortos_finance_refresh', 'מבקש מ-Open Finance למשוך שוב בנקים וכרטיסים אל ResortOS. לא מזיז כסף ולא שולח סיסמה.', { type: 'object', additionalProperties: false }, false, true),
  tool('resortos_guest_page', 'דף האורח כפי שהאורח רואה אותו, כולל קודים וקישור. בלי טלפון, בלי תשלום ובלי תעודת זהות. קריאה בלבד.', {
    type: 'object',
    properties: {
      booking_id: { type: 'string' },
      unit_id: { type: 'string' },
      date: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' }
    },
    additionalProperties: false
  }, true),
  tool('resortos_guest_page_print', 'גרסת ההדפסה של דף האורח, אם קיימת. קריאה בלבד.', {
    type: 'object',
    properties: {
      booking_id: { type: 'string' },
      unit_id: { type: 'string' },
      date: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' }
    },
    additionalProperties: false
  }, true)
];

function tool(name, description, inputSchema, readOnly, openWorld = false) {
  return {
    name,
    description,
    inputSchema,
    annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: openWorld }
  };
}

function filters() {
  return {
    type: 'object',
    properties: { property_id: { type: 'string' }, limit: { type: 'integer' }, cursor: { type: 'string' } },
    additionalProperties: false
  };
}

function dateFilters() {
  return {
    type: 'object',
    properties: {
      from: { type: 'string' },
      to: { type: 'string' },
      property_id: { type: 'string' },
      unit_id: { type: 'string' },
      limit: { type: 'integer' },
      cursor: { type: 'string' }
    },
    additionalProperties: false
  };
}

function originOf(req) {
  const configured = String(process.env.RESORTOS_MCP_ORIGIN || '').replace(/\/$/, '');
  if (configured) return configured;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  if (!res.getHeader?.('content-type') && !headers['Content-Type']) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  res.end(body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body)));
}

function pathOf(req) {
  return String(req.url || '').split('?')[0] || '/';
}

function queryOf(req) {
  const raw = String(req.url || '');
  return new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '');
}

function bearer(req) {
  const header = String(req.headers.authorization || req.headers.Authorization || '');
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : '';
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  const type = String(req.headers['content-type'] || '');
  if (!text) return {};
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text));
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('BAD_REQUEST');
    err.status = 400;
    throw err;
  }
}

function challenge(origin) {
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="resortos:owner"`;
}

export function createMcpHandler(deps) {
  const oauth = deps.oauth || createOauthService({
    store: deps.store || createFileOauthStore(),
    verifyStaff: (username, password) => deps.verifyStaff(username, password),
    loopback: deps.loopback === true
  });
  const otp = deps.otp || createOtpGate({
    findManager: deps.findManagerByPhone,
    sendSms: deps.sendManagerOtp,
    now: deps.now
  });
  const refreshedAt = new Map();

  async function callTool(user, name, args) {
    const guestTool = name === 'resortos_guest_page' || name === 'resortos_guest_page_print';
    if (!isManager(user) && !guestTool) {
      const denied = new Error('FORBIDDEN');
      denied.status = 403;
      denied.expose = true;
      throw denied;
    }
    const now = deps.now ? deps.now() : new Date();
    const stamp = fetchedAt(now);
    if (name === 'resortos_profile') {
      return { ...stamp, id: user.id, name: user.display_name || user.username, nickname: 'בעלים / מנהל' };
    }
    if (name === 'resortos_catalog') {
      const rows = (await deps.loadCatalog(user)).map(projectCatalog);
      return { ...stamp, ...pageOf(filterProperty(rows, args.property_id), args), currency_note: 'base_price_ils = base_price_agorot / 100' };
    }
    if (name === 'resortos_units') {
      const rows = (await deps.loadUnits(user)).map(projectUnit);
      return { ...stamp, ...pageOf(rows, args) };
    }
    if (name === 'resortos_bookings') {
      const loaded = await deps.loadBookings(user, bookingQuery(args));
      const rows = (await filterBookings(deps, user, loaded.rows, args)).map(projectBooking);
      return { ...stamp, ...pageOf(rows, args), source_complete: !loaded.truncated, scope: 'operational_fields' };
    }
    if (name === 'resortos_work_log') {
      const rows = await deps.loadWorkLog(user);
      return { ...stamp, ...pageOf(rows, { limit: 120 }), scope: 'completed_by_connected_manager' };
    }
    if (name === 'resortos_procedures') {
      const rows = await deps.loadProcedures(user);
      return { ...stamp, library: 'sop_templates', ...pageOf(rows.map(projectProcedure), { limit: 50 }) };
    }
    if (name === 'resortos_documents') {
      const docs = await deps.loadDocuments();
      if (args.id) {
        const doc = docs.find((row) => row.id === args.id);
        if (!doc) {
          const err = new Error('NOT_FOUND');
          err.status = 404;
          throw err;
        }
        return { ...stamp, ...projectDocument(doc, { includeText: true }) };
      }
      return { ...stamp, library: 'priority_docs', ...pageOf(docs.map((doc) => projectDocument(doc)), { limit: 40 }) };
    }
    if (name === 'resortos_booking_money') {
      const loaded = await deps.loadBookings(user, bookingQuery(args));
      const rows = (await filterBookings(deps, user, loaded.rows, args)).map(projectBookingMoney);
      return {
        ...stamp,
        ...pageOf(rows, args),
        source_complete: !loaded.truncated,
        note: 'booking_value_ils הוא שווי ההזמנה. receipts_ils הוא מה שנרשם כתקבול.'
      };
    }
    if (name === 'resortos_expenses') {
      const from = parseDate(args.from, 'from');
      const to = parseDate(args.to, 'to');
      const rows = (await deps.loadExpenses()).filter((row) => (!from || String(row.date || '') >= from) && (!to || String(row.date || '') <= to));
      return { ...stamp, ...pageOf(rows.map(projectExpense), args), currency: 'ILS', source_unit: 'shekel', vat: 'expense.vat when present' };
    }
    if (name === 'resortos_finance_summary') {
      const loaded = await deps.loadBookings(user, bookingQuery(args));
      const catalog = await deps.loadCatalog(user);
      const propertyOf = new Map(catalog.map((row) => [row.id, row.property_id || '']));
      const summary = financeSummary(loaded.rows, {
        from: parseDate(args.from, 'from'),
        to: parseDate(args.to, 'to'),
        propertyId: String(args.property_id || ''),
        unitProperty: (id) => propertyOf.get(id) || ''
      });
      return { ...stamp, ...summary, complete: !loaded.truncated };
    }
    if (name === 'resortos_bank_accounts') {
      const overview = await deps.loadBankOverview();
      return {
        ...stamp,
        source: 'open_finance',
        amount_unit: 'major_currency_unit',
        accounts_error: overview.accountsError || null,
        connections: (overview.connections || []).map((row) => ({
          id: row.id,
          provider_id: row.providerId,
          status: row.status,
          accounts: row.accounts,
          cards: row.cards,
          loans: row.loans,
          last_fetched_at: row.lastFetchedAt || null
        })),
        accounts: (overview.accounts || []).map(projectBankAccount)
      };
    }
    if (name === 'resortos_bank_transactions') {
      const data = await deps.loadBankTransactions({
        dateFrom: parseDate(args.date_from, 'date_from'),
        dateTo: parseDate(args.date_to, 'date_to'),
        accountId: args.account_id || '',
        limit: Math.min(100, Math.max(1, Number(args.limit) || 40)),
        nextPage: args.cursor || ''
      });
      const items = (data.items || []).map(projectBankTransaction);
      return {
        ...stamp,
        source: 'open_finance',
        amount_unit: 'major_currency_unit',
        items,
        count: items.length,
        complete: !data.nextPage,
        next_cursor: data.nextPage || null,
        accounts_error: data.accountsError || null,
        by_currency: totalsByCurrency(items)
      };
    }
    if (name === 'resortos_finance_refresh') {
      const last = refreshedAt.get(user.id) || 0;
      if (now.getTime() - last < REFRESH_GAP_MS) {
        const err = new Error('RATE_LIMIT');
        err.status = 429;
        throw err;
      }
      const overview = await deps.refreshBanks();
      refreshedAt.set(user.id, now.getTime());
      return {
        ...stamp,
        refreshed: true,
        source: 'open_finance',
        note: 'המשיכה בוצעה אל ResortOS. לא הועבר כסף ולא נשלחה סיסמת בנק.',
        connections: (overview.connections || []).map((row) => ({
          provider_id: row.providerId,
          status: row.status,
          last_fetched_at: row.lastFetchedAt || null
        }))
      };
    }
    if (name === 'resortos_guest_page' || name === 'resortos_guest_page_print') {
      if (!canReadGuestPage(user)) {
        const denied = new Error('FORBIDDEN');
        denied.status = 403;
        denied.expose = true;
        throw denied;
      }
      const loaded = await guestPageQuery(deps, user, args);
      const bookingId = loaded.mode === 'list' ? `list:${loaded.rows.length}` : (loaded.rows[0]?.id || '');
      console.log(`[mcp] tool=${name} user=${user.username || user.id} booking_id=${bookingId}`);
      if (loaded.mode === 'one' && !loaded.rows.length) {
        const missing = new Error('NOT_FOUND');
        missing.status = 404;
        missing.expose = true;
        throw missing;
      }
      if (name === 'resortos_guest_page_print') {
        return {
          ...stamp,
          ...GUEST_PRINT_ABSENT,
          ...(loaded.mode === 'list'
            ? { items: loaded.rows.map(projectGuestPageSummary) }
            : projectGuestPageSummary(loaded.rows[0]))
        };
      }
      if (loaded.mode === 'list') {
        return { ...stamp, items: loaded.rows.map(projectGuestPageSummary), print_url: null };
      }
      return { ...stamp, ...projectGuestPage(loaded.rows[0]) };
    }
    const err = new Error('UNKNOWN_TOOL');
    err.status = 404;
    throw err;
  }

  return async function tryHandleMcp(req, res) {
    const path = pathOf(req);
    const known = path === '/mcp'
      || path.startsWith('/.well-known/oauth-')
      || path.startsWith('/oauth/');
    if (!known) return false;
    try {
      const origin = originOf(req);
      if (path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp') {
        send(res, 200, {
          resource: `${origin}/mcp`,
          authorization_servers: [origin],
          scopes_supported: ['resortos:owner'],
          bearer_methods_supported: ['header']
        });
        return true;
      }
      if (path === '/.well-known/oauth-authorization-server') {
        send(res, 200, {
          issuer: origin,
          authorization_endpoint: `${origin}/oauth/authorize`,
          token_endpoint: `${origin}/oauth/token`,
          registration_endpoint: `${origin}/oauth/register`,
          revocation_endpoint: `${origin}/oauth/revoke`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
          scopes_supported: ['resortos:owner'],
          authorization_response_iss_parameter_supported: true,
          client_id_metadata_document_supported: false
        });
        return true;
      }
      if (req.method === 'POST' && path === '/oauth/register') {
        const body = await readBody(req);
        const client = oauth.register({ redirectUris: body.redirect_uris, name: body.client_name });
        send(res, 201, {
          client_id: client.id,
          client_name: client.name,
          redirect_uris: client.redirect_uris,
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code']
        });
        return true;
      }
      if (req.method === 'GET' && path === '/oauth/authorize') {
        send(res, 200, authorizePage(queryOf(req), ''), { 'Content-Type': 'text/html; charset=utf-8' });
        return true;
      }
      if (req.method === 'POST' && path === '/oauth/authorize') {
        const body = await readBody(req);
        const step = body.step === 'verify' ? 'verify' : 'send';
        try {
          if (step === 'send') {
            await otp.request(body.phone);
            send(res, 200, authorizePage(body, '', {
              step: 'verify',
              phone: body.phone,
              notice: 'אם המספר שייך למנהל פעיל, נשלח קוד ב-SMS.'
            }), { 'Content-Type': 'text/html; charset=utf-8' });
            return true;
          }
          const user = otp.verify(body.phone, body.otp);
          const code = oauth.issueForManager({
            clientId: body.client_id,
            redirectUri: body.redirect_uri,
            codeChallenge: body.code_challenge,
            method: body.code_challenge_method,
            state: body.state,
            resource: body.resource || `${origin}/mcp`,
            user
          });
          const back = new URL(body.redirect_uri);
          back.searchParams.set('code', code);
          back.searchParams.set('iss', origin);
          if (body.state) back.searchParams.set('state', body.state);
          res.statusCode = 302;
          res.setHeader('Location', back.toString());
          res.end();
        } catch (err) {
          const status = Number(err.status) || 401;
          const messages = {
            RATE_LIMIT: 'יותר מדי בקשות. נסו שוב בעוד כמה דקות.',
            SMS_SEND_FAILED: 'לא הצלחנו לשלוח את הקוד. נסו שוב.',
            OTP_INVALID: 'הקוד שגוי או שפג תוקפו.'
          };
          send(res, status, authorizePage(body, messages[err.message] || 'הכניסה נכשלה.', {
            step: err.message === 'OTP_INVALID' ? 'verify' : 'send',
            phone: body.phone
          }), { 'Content-Type': 'text/html; charset=utf-8' });
        }
        return true;
      }
      if (req.method === 'POST' && path === '/oauth/token') {
        const body = await readBody(req);
        const issued = body.grant_type === 'refresh_token'
          ? oauth.refresh({ refreshToken: body.refresh_token, resource: body.resource })
          : oauth.exchange({
            code: body.code,
            verifier: body.code_verifier,
            clientId: body.client_id,
            redirectUri: body.redirect_uri,
            resource: body.resource
          });
        send(res, 200, issued);
        return true;
      }
      if (req.method === 'POST' && path === '/oauth/revoke') {
        const body = await readBody(req);
        oauth.revoke(body.token || bearer(req));
        send(res, 200, { revoked: true });
        return true;
      }
      if (path !== '/mcp') {
        send(res, 404, { error: 'NOT_FOUND' });
        return true;
      }
      if (req.method === 'DELETE') {
        oauth.revoke(bearer(req));
        send(res, 204, null);
        return true;
      }
      if (req.method !== 'POST') {
        send(res, 405, { error: 'METHOD_NOT_ALLOWED' }, { Allow: 'POST, DELETE' });
        return true;
      }
      let user = oauth.authenticate(bearer(req), `${origin}/mcp`);
      const body = await readBody(req);
      if (user && deps.loadStaff) {
        const fresh = await deps.loadStaff(user.id);
        if (!canReadGuestPage(fresh)) {
          const denied = new Error('FORBIDDEN');
          denied.status = 403;
          denied.expose = true;
          throw denied;
        }
        user = { ...user, role: fresh.role || user.role, username: fresh.username || user.username };
        if (Array.isArray(fresh.allowed_units)) user = { ...user, allowed_units: fresh.allowed_units };
      }
      if (!user || !canReadGuestPage(user)) {
        send(res, 401, rpcError(body?.id ?? null, 32001, 'UNAUTHORIZED'), { 'WWW-Authenticate': challenge(origin) });
        return true;
      }
      if (body?.method === 'notifications/initialized') {
        send(res, 202, null);
        return true;
      }
      const result = await rpcResult(body, async () => {
        if (body.method === 'initialize') {
          return {
            protocolVersion: PROTOCOL,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'resortos', version: '1.0.0' },
            instructions: 'קריאה לבעלים ומנהלים. בנקים וכרטיסים נקראים אצל ResortOS דרך Open Finance. רענון רק ב-resortos_finance_refresh. 100 אגורות בהזמנה = 1 ש״ח. סכומי הבנק כבר בשקלים. שווי הזמנה אינו תקבול.'
          };
        }
        if (body.method === 'ping') return {};
        if (body.method === 'tools/list') {
          const tools = isManager(user) ? TOOLS : TOOLS.filter((item) => item.name.startsWith('resortos_guest_page'));
          return { tools: tools.map(publicTool) };
        }
        if (body.method === 'tools/call') {
          const name = String(body.params?.name || '');
          if (!TOOLS.some((item) => item.name === name)) {
            const err = new Error('UNKNOWN_TOOL');
            err.status = 404;
            throw err;
          }
          const args = body.params?.arguments && typeof body.params.arguments === 'object' ? body.params.arguments : {};
          const data = await callTool(user, name, args);
          return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false };
        }
        const err = new Error('METHOD_NOT_FOUND');
        err.status = 404;
        throw err;
      });
      send(res, 200, result);
      return true;
    } catch (err) {
      const status = Number(err.status) || 500;
      if (pathOf(req) === '/oauth/authorize' && req.method === 'POST') {
        send(res, status, authorizePage(queryOf(req), status === 403 ? 'החשבון אינו בעלים או מנהל.' : 'הכניסה נכשלה.'), {
          'Content-Type': 'text/html; charset=utf-8'
        });
        return true;
      }
      const code = status >= 500 ? 'MCP_FAILED' : err.message;
      send(res, status, { error: code });
      return true;
    }
  };
}

function publicTool(item) {
  const copy = {
    name: item.name,
    description: item.description,
    inputSchema: item.inputSchema,
    annotations: item.annotations
  };
  if (item.name === 'resortos_profile') {
    copy.outputSchema = {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string' },
        nickname: { type: 'string' }
      },
      required: ['id'],
      additionalProperties: true
    };
    copy._meta = { 'openai/profile': true };
  }
  return copy;
}

async function rpcResult(body, run) {
  if (!body || body.jsonrpc !== '2.0' || !body.method) {
    return rpcError(body?.id ?? null, -32600, 'INVALID_REQUEST');
  }
  try {
    return { jsonrpc: '2.0', id: body.id ?? null, result: await run() };
  } catch (err) {
    if (err.expose) throw err;
    return rpcError(body.id ?? null, -32000, Number(err.status) >= 500 ? 'MCP_FAILED' : (err.message || 'MCP_FAILED'));
  }
}

async function guestPageQuery(deps, user, args) {
  const bookingId = String(args.booking_id || '').trim();
  const unitId = String(args.unit_id || '').trim();
  const on = parseDate(args.date, 'date');
  const from = parseDate(args.from, 'from');
  const to = parseDate(args.to, 'to');
  if (!deps.loadGuestBookings) {
    const err = new Error('GUEST_PAGE_UNAVAILABLE');
    err.status = 503;
    throw err;
  }
  if (bookingId) return { mode: 'one', rows: await deps.loadGuestBookings(user, { booking_id: bookingId }) };
  if (unitId || on) {
    if (!unitId || !on) {
      const err = new Error('BAD_REQUEST');
      err.status = 400;
      err.expose = true;
      throw err;
    }
    return { mode: 'one', rows: await deps.loadGuestBookings(user, { unit_id: unitId, on }) };
  }
  if (from || to) return { mode: 'list', rows: await deps.loadGuestBookings(user, { from, to }) };
  const err = new Error('BAD_REQUEST');
  err.status = 400;
  err.expose = true;
  throw err;
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function filterProperty(rows, propertyId) {
  const id = String(propertyId || '');
  if (!id) return rows;
  return rows.filter((row) => row.property_id === id);
}

function bookingQuery(args = {}) {
  return {
    from: parseDate(args.from, 'from'),
    to: parseDate(args.to, 'to'),
    property_id: String(args.property_id || ''),
    unit_id: String(args.unit_id || '')
  };
}

async function filterBookings(deps, user, rows, args) {
  const from = parseDate(args.from, 'from');
  const to = parseDate(args.to, 'to');
  let allowed = null;
  if (args.property_id) {
    const catalog = await deps.loadCatalog(user);
    allowed = new Set(catalog.filter((row) => row.property_id === args.property_id).map((row) => row.id));
  }
  return rows.filter((row) => {
    if (allowed && !allowed.has(row.unit_id)) return false;
    if (args.unit_id && row.unit_id !== args.unit_id) return false;
    if (from && String(row.check_in_date) < from) return false;
    if (to && String(row.check_in_date) > to) return false;
    return true;
  });
}

function projectProcedure(row) {
  const steps = Array.isArray(row.steps) ? row.steps.slice(0, 30) : [];
  return {
    id: row.id,
    domain: row.domain || '',
    title: row.title || '',
    updated_at: row.updated_at || null,
    steps,
    library: 'sop_templates'
  };
}

function totalsByCurrency(items) {
  const totals = {};
  for (const item of items) {
    const currency = item.currency || 'UNKNOWN';
    totals[currency] = Math.round(((totals[currency] || 0) + (Number(item.amount) || 0)) * 100) / 100;
  }
  return totals;
}

function authorizePage(query, error, { step = 'send', phone = '', notice = '' } = {}) {
  const fields = ['client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'resource', 'scope'];
  const hidden = fields.map((name) => {
    const value = String(query.get?.(name) || query[name] || '');
    return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
  }).join('');
  const phoneValue = String(phone || query.phone || '');
  const verifying = step === 'verify';
  const phoneField = verifying
    ? `<input type="hidden" name="phone" value="${escapeHtml(phoneValue)}"><input type="hidden" name="step" value="verify"><label>קוד מה-SMS<input name="otp" inputmode="numeric" autocomplete="one-time-code" required style="width:100%;margin-top:4px"></label>`
    : `<input type="hidden" name="step" value="send"><label>טלפון של מנהל<input name="phone" type="tel" autocomplete="tel" required value="${escapeHtml(phoneValue)}" style="width:100%;margin-top:4px"></label>`;
  return `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>ResortOS</title>
<body style="font-family:sans-serif;background:#111;color:#f5f5f5;display:grid;place-items:center;min-height:100vh">
<form method="post" style="width:min(360px,92vw);display:grid;gap:12px;background:#1b1b1b;padding:24px;border-radius:12px">
<h1 style="font-size:20px;margin:0">חיבור סגור</h1>
<p style="margin:0;color:#bbb">החיבור נפתח רק אחרי שמנהל מזין טלפון רשום ומאשר את הקוד שנשלח ב-SMS.</p>
${notice ? `<p style="margin:0">${escapeHtml(notice)}</p>` : ''}
${error ? `<p style="color:#f87171">${escapeHtml(error)}</p>` : ''}
${phoneField}
${hidden}
<button type="submit">${verifying ? 'אישור' : 'שליחת קוד'}</button>
</form></body></html>`;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

let production;
export async function tryHandleMcp(req, res) {
  if (!production) {
    const { productionDeps } = await import('./mcpData.js');
    const deps = productionDeps();
    production = createMcpHandler({
      ...deps,
      oauth: createOauthService({
        store: createFileOauthStore(),
        verifyStaff: deps.verifyStaff
      }),
      otp: createOtpGate({
        findManager: deps.findManagerByPhone,
        sendSms: deps.sendManagerOtp
      })
    });
  }
  return production(req, res);
}

