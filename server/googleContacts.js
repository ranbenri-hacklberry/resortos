import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { israelToday } from '../src/lib/cabinAccess.js';
import {
  AUTO_SYNC_FIRST_DELAY_MS,
  AUTO_SYNC_INTERVAL_MS,
  bookingsWindowQuery,
  contentRangeTotal,
  createSyncLock,
  googleContactsAutoSyncEnabled,
  isEligibleBooking,
  isScanComplete,
  nextBackoffMs,
  planContacts,
  toE164,
  writesFor
} from './googleContactsPlan.js';

const SCOPE = 'https://www.googleapis.com/auth/contacts https://www.googleapis.com/auth/userinfo.email';
const MARK = 'resortos';
const TOKEN_FILE = path.join(homedir(), '.config', 'resortos', 'google-contacts.seal');
const SEAL_FILE = path.join(homedir(), '.config', 'resortos', 'agent-seal.key');
const pendingStates = new Map();
const PINS_FILE = path.join(homedir(), '.config', 'resortos', 'google-contacts-pins.json');

function loadPins() {
  try {
    const data = JSON.parse(readFileSync(PINS_FILE, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
}

function dbKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || '';
}

async function rest(method, pathAndQuery, body, extraHeaders = {}) {
  const key = dbKey();
  const response = await fetch(`${supabaseUrl()}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || 'DB_FAILED');
    error.status = response.status;
    throw error;
  }
  return data;
}

function sealKey() {
  try {
    return Buffer.from(readFileSync(SEAL_FILE, 'utf8').trim(), 'base64url');
  } catch {
    const key = randomBytes(32);
    mkdirSync(path.dirname(SEAL_FILE), { recursive: true, mode: 0o700 });
    writeFileSync(SEAL_FILE, key.toString('base64url'), { mode: 0o600 });
    return key;
  }
}

function seal(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sealKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

function openSeal(payload) {
  const raw = Buffer.from(payload, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', sealKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CONTACTS_CLIENT_ID && process.env.GOOGLE_CONTACTS_CLIENT_SECRET);
}

export function readGoogleToken() {
  try {
    return openSeal(readFileSync(TOKEN_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeGoogleToken(value) {
  mkdirSync(path.dirname(TOKEN_FILE), { recursive: true, mode: 0o700 });
  writeFileSync(TOKEN_FILE, seal(value), { mode: 0o600 });
}

export function clearGoogleToken() {
  try { writeFileSync(TOKEN_FILE, '', { mode: 0o600 }); } catch { /* absent */ }
  try { writeFileSync(TOKEN_FILE, seal({}), { mode: 0o600 }); } catch { /* ignore */ }
}

function tenantOf(user) {
  const tenant = String(user?.tenant_id || user?.business_id || '').trim();
  if (!tenant) {
    const error = new Error('TENANT_UNKNOWN');
    error.status = 503;
    throw error;
  }
  return encodeURIComponent(tenant);
}

const BOOKINGS_PAGE = 500;
const BOOKINGS_MAX = 5000;

async function loadBookings(user) {
  const query = bookingsWindowQuery(tenantOf(user), israelToday());
  const key = dbKey();
  const rows = [];
  let total = null;
  for (let offset = 0; offset < BOOKINGS_MAX; offset += BOOKINGS_PAGE) {
    const response = await fetch(`${supabaseUrl()}/rest/v1/${query}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
        'Range-Unit': 'items',
        Range: `${offset}-${offset + BOOKINGS_PAGE - 1}`
      }
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(data?.message || data?.error || 'DB_FAILED');
      error.status = response.status;
      throw error;
    }
    const page = Array.isArray(data) ? data : [];
    const pageTotal = contentRangeTotal(response.headers.get('content-range'));
    if (pageTotal === null) { total = null; rows.push(...page); break; }
    total = pageTotal;
    rows.push(...page);
    if (!page.length || rows.length >= total) break;
  }
  // Removals are only allowed when the exact server total was received in full.
  return { rows, truncated: !isScanComplete(rows.length, total) };
}

async function loadMappings() {
  const rows = await rest('GET', 'hotelos_google_contacts?select=phone_e164,google_resource_name,content_hash,last_synced_at,last_error,conflict,conflict_name,managed,booking_id&limit=5000');
  return Array.isArray(rows) ? rows : [];
}

async function loadState() {
  const rows = await rest('GET', 'hotelos_google_contacts_state?id=eq.default&select=live_enabled,last_success_at,last_error,last_dry_run,managed_count,pending_count,failed_count');
  return (Array.isArray(rows) && rows[0]) || { live_enabled: false };
}

async function saveState(patch) {
  await rest('POST', 'hotelos_google_contacts_state', [{ id: 'default', ...patch, updated_at: new Date().toISOString() }], {
    Prefer: 'resolution=merge-duplicates,return=minimal'
  });
}

async function saveMapping(row) {
  await rest('POST', 'hotelos_google_contacts', [{ ...row, updated_at: new Date().toISOString() }], {
    Prefer: 'resolution=merge-duplicates,return=minimal'
  });
}

function publicAction(row) {
  return {
    action: row.action,
    phone_masked: row.phone_masked,
    display_name: row.display_name || '',
    existing_name: row.existing_name || '',
    booking_id: row.booking_id || ''
  };
}

function publicPlan(plan) {
  const visible = plan.actions.filter((row) => row.action !== 'unchanged').slice(0, 80).map(publicAction);
  return {
    counts: plan.counts,
    scan_complete: plan.scan_complete,
    google_read: plan.google_read,
    deletions_allowed: plan.deletions_allowed,
    actions: visible,
    blocked_removes: plan.blocked_removes.length
  };
}

async function googleFetch(url, options = {}, retries = 4) {
  const response = await fetch(url, options);
  if (response.status === 429 || response.status >= 500) {
    if (retries <= 0) {
      const error = new Error('GOOGLE_UNAVAILABLE');
      error.status = response.status;
      throw error;
    }
    const wait = Number(response.headers.get('retry-after') || 2) * 1000;
    await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 8000)));
    return googleFetch(url, options, retries - 1);
  }
  return response;
}

async function accessToken(token) {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CONTACTS_CLIENT_ID,
    client_secret: process.env.GOOGLE_CONTACTS_CLIENT_SECRET,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token'
  });
  const response = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const error = new Error('GOOGLE_RECONNECT');
    error.status = 401;
    throw error;
  }
  return data.access_token;
}

function personManaged(person) {
  return (person.clientData || []).some((row) => row.key === MARK);
}

function personPhone(person) {
  for (const phone of person.phoneNumbers || []) {
    const e164 = toE164(phone.canonicalForm || phone.value);
    if (e164) return e164;
  }
  return '';
}

async function searchPhone(bearer, e164) {
  const query = encodeURIComponent(e164);
  const response = await googleFetch(
    `https://people.googleapis.com/v1/people:searchContacts?query=${query}&readMask=names,phoneNumbers,clientData&pageSize=10`,
    { headers: { Authorization: `Bearer ${bearer}` } }
  );
  if (!response.ok) {
    const error = new Error('GOOGLE_READ_FAILED');
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const matches = [];
  for (const row of data.results || []) {
    const person = row.person || {};
    if (personPhone(person) !== e164) continue;
    matches.push({
      phone_e164: e164,
      resource_name: person.resourceName || '',
      display_name: person.names?.[0]?.displayName || person.names?.[0]?.unstructuredName || '',
      managed: personManaged(person)
    });
  }
  return matches;
}

function contactBody(action) {
  return {
    names: [{ givenName: action.display_name, unstructuredName: action.display_name }],
    phoneNumbers: [{ value: action.phone_e164, type: 'mobile' }],
    biographies: [{ value: action.notes, contentType: 'TEXT_PLAIN' }],
    clientData: [{ key: MARK, value: action.phone_e164 }]
  };
}

async function applyWrite(bearer, action) {
  if (action.action === 'remove') {
    const response = await googleFetch(`https://people.googleapis.com/v1/${action.google_resource_name}:deleteContact`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bearer}` }
    });
    if (!response.ok && response.status !== 404) throw new Error('GOOGLE_DELETE_FAILED');
    await rest('DELETE', `hotelos_google_contacts?phone_e164=eq.${encodeURIComponent(action.phone_e164)}`);
    return;
  }
  const created = action.action === 'create';
  const url = created
    ? 'https://people.googleapis.com/v1/people:createContact'
    : `https://people.googleapis.com/v1/${action.google_resource_name}:updateContact?updatePersonFields=names,phoneNumbers,biographies,clientData`;
  const body = contactBody(action);
  if (!created) {
    // People API updateContact requires the current etag.
    const current = await googleFetch(`https://people.googleapis.com/v1/${action.google_resource_name}?personFields=metadata`, {
      headers: { Authorization: `Bearer ${bearer}` }
    });
    if (!current.ok) {
      const error = new Error('GOOGLE_READ_FAILED');
      error.status = current.status;
      throw error;
    }
    body.etag = (await current.json()).etag;
  }
  const response = await googleFetch(url, {
    method: created ? 'POST' : 'PATCH',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('GOOGLE_WRITE_FAILED');
    error.status = response.status;
    throw error;
  }
  await saveMapping({
    phone_e164: action.phone_e164,
    google_resource_name: data.resourceName || action.google_resource_name,
    content_hash: action.content_hash,
    last_synced_at: new Date().toISOString(),
    last_error: null,
    last_error_at: null,
    conflict: false,
    conflict_name: null,
    managed: true,
    booking_id: action.booking_id
  });
}

function oauthOrigin(requestOrigin) {
  const fixed = String(process.env.GOOGLE_CONTACTS_PUBLIC_ORIGIN || '').trim().replace(/\/$/, '');
  return fixed || requestOrigin;
}

export function beginConnect(origin) {
  if (!googleConfigured()) {
    const error = new Error('GOOGLE_NOT_CONFIGURED');
    error.status = 503;
    throw error;
  }
  const redirectOrigin = oauthOrigin(origin);
  const state = randomBytes(24).toString('base64url');
  pendingStates.set(state, { origin, redirectOrigin, expires: Date.now() + 10 * 60 * 1000 });
  const redirect = `${redirectOrigin}/api/google-contacts/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env.GOOGLE_CONTACTS_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function finishConnect(query) {
  const pending = pendingStates.get(query.state);
  pendingStates.delete(query.state);
  if (!pending || pending.expires < Date.now() || !query.code) {
    const error = new Error('OAUTH_STATE');
    error.status = 400;
    throw error;
  }
  const redirect = `${pending.redirectOrigin || pending.origin}/api/google-contacts/callback`;
  const response = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: query.code,
      client_id: process.env.GOOGLE_CONTACTS_CLIENT_ID,
      client_secret: process.env.GOOGLE_CONTACTS_CLIENT_SECRET,
      redirect_uri: redirect,
      grant_type: 'authorization_code'
    })
  });
  const data = await response.json();
  if (!response.ok || !data.refresh_token) {
    const error = new Error('GOOGLE_TOKEN');
    error.status = 502;
    throw error;
  }
  let email = '';
  const profile = await googleFetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${data.access_token}` }
  });
  if (profile.ok) email = (await profile.json()).email || '';
  writeGoogleToken({ refresh_token: data.refresh_token, email, connected_at: new Date().toISOString() });
  return pending.origin;
}

export async function googleContactsStatus(user) {
  const token = readGoogleToken();
  let state = { live_enabled: false, managed_count: 0, pending_count: 0, failed_count: 0 };
  try { state = await loadState(); } catch { /* table may be new */ }
  return {
    configured: googleConfigured(),
    connected: Boolean(token?.refresh_token),
    account: token?.email || '',
    live_enabled: Boolean(state.live_enabled),
    last_success_at: state.last_success_at || null,
    last_error: state.last_error || '',
    managed_count: state.managed_count || 0,
    pending_count: state.pending_count || 0,
    failed_count: state.failed_count || 0,
    last_dry_run: state.last_dry_run || null,
    tenant_ready: Boolean(user?.tenant_id || user?.business_id)
  };
}

async function readGooglePhones(bearer, phones) {
  const found = [];
  for (const e164 of phones) {
    const matches = await searchPhone(bearer, e164);
    const foreign = matches.find((row) => !row.managed);
    found.push(foreign || matches[0] || { phone_e164: e164, resource_name: '', managed: false, missing: true });
  }
  return found.filter((row) => !row.missing);
}

function recordRun({ created = 0, updated = 0, skipped = 0, failed = 0 } = {}) {
  const at = new Date().toISOString();
  console.log(`[google-contacts] ${at} created=${created} updated=${updated} skipped=${skipped} failed=${failed}`);
  return { at, created, updated, skipped, failed };
}

export const googleContactsSyncLock = createSyncLock();

export async function runGoogleContactsSync(user, { live = false } = {}) {
  const state = await loadState();
  let loaded;
  try {
    loaded = await loadBookings(user);
  } catch {
    const lastRun = recordRun({ failed: 1 });
    await saveState({
      last_error: 'BOOKINGS_UNAVAILABLE',
      last_dry_run: { ...(state.last_dry_run || {}), last_run: lastRun }
    }).catch(() => {});
    return { ok: false, error: 'BOOKINGS_UNAVAILABLE', deletions_allowed: false, dry_run: true, last_run: lastRun };
  }
  const mappings = await loadMappings();
  const token = readGoogleToken();
  const connected = Boolean(token?.refresh_token);
  const today = israelToday();
  let googleContacts = [];
  let googleRead = false;
  if (connected && googleConfigured()) {
    try {
      const phones = new Set();
      for (const booking of loaded.rows) {
        if (!isEligibleBooking(booking, today)) continue;
        const e164 = toE164(booking.guest_phone);
        if (e164) phones.add(e164);
      }
      const list = [...phones];
      if (list.length <= 300) {
        const bearer = await accessToken(token);
        googleContacts = await readGooglePhones(bearer, list);
        googleRead = true;
      }
    } catch {
      googleRead = false;
    }
  }
  const plan = planContacts({
    bookings: loaded.rows,
    mappings,
    googleContacts,
    today,
    scanComplete: !loaded.truncated,
    googleRead,
    pins: loadPins()
  });
  for (const row of plan.actions) {
    if (row.action !== 'conflict') continue;
    await saveMapping({
      phone_e164: row.phone_e164,
      conflict: true,
      conflict_name: row.existing_name || '',
      managed: false,
      content_hash: row.content_hash,
      booking_id: row.booking_id,
      last_error: 'FOREIGN_CONTACT',
      last_error_at: new Date().toISOString()
    });
  }
  const summary = publicPlan(plan);
  const skipped = plan.counts.unchanged + plan.counts.skip;
  const basePatch = {
    last_error: connected && !googleRead ? 'GOOGLE_READ_FAILED' : null,
    pending_count: plan.counts.create + plan.counts.update,
    failed_count: plan.counts.conflict,
    managed_count: mappings.filter((row) => row.managed).length
  };
  const liveEnabled = Boolean(state.live_enabled);
  const writes = live && liveEnabled ? writesFor(plan, { liveEnabled, connected }) : [];
  if (!writes.length) {
    const lastRun = recordRun({ created: 0, updated: 0, skipped, failed: plan.counts.conflict });
    await saveState({ ...basePatch, last_dry_run: { ...summary, last_run: lastRun } });
    return {
      ok: true,
      dry_run: !live || !liveEnabled,
      written: 0,
      live_enabled: liveEnabled,
      last_run: lastRun,
      ...summary
    };
  }
  const bearer = await accessToken(token);
  let created = 0;
  let updated = 0;
  let failed = 0;
  let retryStatus = 0;
  for (const action of writes) {
    try {
      await applyWrite(bearer, action);
      if (action.action === 'create') created += 1;
      else if (action.action === 'update') updated += 1;
    } catch (err) {
      failed += 1;
      if (err.status === 429 || Number(err.status) >= 500) retryStatus = err.status;
      if (action.phone_e164) {
        await saveMapping({
          phone_e164: action.phone_e164,
          last_error: 'GOOGLE_WRITE_FAILED',
          last_error_at: new Date().toISOString(),
          managed: action.action !== 'create',
          google_resource_name: action.google_resource_name || null,
          booking_id: action.booking_id || null
        }).catch(() => {});
      }
    }
  }
  const lastRun = recordRun({ created, updated, skipped, failed: plan.counts.conflict + failed });
  await saveState({
    ...basePatch,
    last_dry_run: { ...summary, last_run: lastRun },
    last_success_at: failed ? undefined : new Date().toISOString(),
    last_error: failed ? 'GOOGLE_WRITE_FAILED' : null,
    failed_count: plan.counts.conflict + failed
  });
  return { ok: failed === 0, dry_run: false, written: created + updated, created, updated, failed, retryStatus, live_enabled: true, last_run: lastRun, ...summary };
}

export async function setGoogleContactsLive(enabled) {
  await saveState({ live_enabled: Boolean(enabled) });
  return { live_enabled: Boolean(enabled) };
}

export { writesFor };

/** Apply the planned create/update for ONE phone only (manual fix). Never removes, never touches other contacts. */
export async function syncSinglePhone(user, e164) {
  const loaded = await loadBookings(user);
  const mappings = await loadMappings();
  const token = readGoogleToken();
  if (!token?.refresh_token || !googleConfigured()) throw new Error('GOOGLE_NOT_CONNECTED');
  const bearer = await accessToken(token);
  const googleContacts = await readGooglePhones(bearer, [e164]);
  const plan = planContacts({
    bookings: loaded.rows.filter((row) => toE164(row.guest_phone) === e164),
    mappings: mappings.filter((row) => row.phone_e164 === e164),
    googleContacts,
    today: israelToday(),
    scanComplete: false,
    googleRead: true,
    pins: loadPins()
  });
  const action = plan.actions.find((row) => row.phone_e164 === e164);
  if (!action) return { action: 'none' };
  if (action.action === 'update' || action.action === 'create') await applyWrite(bearer, action);
  return { action: action.action, display_name: action.display_name, booking_id: action.booking_id };
}

export async function readContactByResource(resourceName) {
  const bearer = await accessToken(readGoogleToken());
  const r = await googleFetch(`https://people.googleapis.com/v1/${resourceName}?personFields=names,biographies,clientData`, { headers: { Authorization: `Bearer ${bearer}` } });
  if (!r.ok) return { status: r.status };
  const d = await r.json();
  return { display_name: d.names?.[0]?.displayName || d.names?.[0]?.givenName || '', notes: d.biographies?.[0]?.value || '', managed: personManaged(d) };
}

export async function readContactName(e164) {
  const token = readGoogleToken();
  const bearer = await accessToken(token);
  return (await readGooglePhones(bearer, [e164])).map((row) => ({ display_name: row.display_name, managed: row.managed }));
}

async function googleContactsAutoReady() {
  if (!googleConfigured() || !readGoogleToken()?.refresh_token) return false;
  try {
    return Boolean((await loadState()).live_enabled);
  } catch {
    return false;
  }
}

async function loadSyncUser() {
  const rows = await rest(
    'GET',
    'employees?select=id,username,role,is_active,business_id&role=eq.MANAGER&is_active=eq.true&order=username.asc&limit=20'
  );
  const list = Array.isArray(rows) ? rows : [];
  const owner = list.find((row) => String(row.username || '').toLowerCase() === 'rani') || list[0];
  const tenant = String(owner?.business_id || '').trim();
  if (!tenant) return null;
  return {
    id: owner.id,
    username: owner.username,
    role: 'MANAGER',
    is_active: true,
    tenant_id: tenant,
    business_id: tenant
  };
}

function googleBackoff(status) {
  const code = Number(status) || 0;
  return code === 429 || code >= 500;
}

export function startGoogleContactsAutoSync({
  enabled = () => googleContactsAutoSyncEnabled(),
  ready = googleContactsAutoReady,
  loadUser = loadSyncUser,
  run = (user) => runGoogleContactsSync(user, { live: true }),
  lock = googleContactsSyncLock,
  schedule = setTimeout,
  every = setInterval,
  clearLater = (id) => {
    clearTimeout(id);
    clearInterval(id);
  },
  intervalMs = AUTO_SYNC_INTERVAL_MS,
  firstDelayMs = AUTO_SYNC_FIRST_DELAY_MS,
  now = () => Date.now(),
  log = console.warn
} = {}) {
  if (!enabled()) return { stop() {}, tick: async () => 'disabled' };
  let stopped = false;
  let backoffUntil = 0;
  let backoffMs = 0;
  let intervalId = null;
  async function tick() {
    if (stopped || now() < backoffUntil) return 'wait';
    if (!lock.tryEnter()) return 'busy';
    try {
      if (!(await ready())) return 'idle';
      const user = await loadUser();
      if (!user) return 'idle';
      const result = await run(user);
      if (googleBackoff(result?.retryStatus)) {
        backoffMs = nextBackoffMs(backoffMs, result.retryStatus);
        backoffUntil = now() + backoffMs;
        return 'backoff';
      }
      backoffMs = 0;
      backoffUntil = 0;
      return 'ran';
    } catch (err) {
      if (googleBackoff(err.status)) {
        backoffMs = nextBackoffMs(backoffMs, err.status);
        backoffUntil = now() + backoffMs;
      }
      log('[google-contacts]', err.status || '', err.message || 'AUTO_SYNC_FAILED');
      return 'error';
    } finally {
      lock.leave();
    }
  }
  const starter = schedule(() => {
    tick();
    intervalId = every(tick, intervalMs);
  }, firstDelayMs);
  return {
    tick,
    stop() {
      stopped = true;
      clearLater(starter);
      if (intervalId != null) clearLater(intervalId);
    }
  };
}

export function createPhoneScheduler({
  delayMs = 30 * 1000,
  sync = syncSinglePhone,
  lock = googleContactsSyncLock,
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  const timers = new Map();
  return {
    schedule(user, rawPhone) {
      const e164 = toE164(rawPhone);
      if (!e164 || !user) return { scheduled: false };
      const existing = timers.get(e164);
      if (existing) clearTimer(existing);
      const timer = setTimer(async () => {
        timers.delete(e164);
        if (!lock.tryEnter()) return;
        try {
          await sync(user, e164);
        } catch (err) {
          console.warn('[google-contacts]', err.status || '', err.message || 'PHONE_SYNC_FAILED');
        } finally {
          lock.leave();
        }
      }, delayMs);
      timers.set(e164, timer);
      return { scheduled: true, delayMs };
    },
    pending() {
      return timers.size;
    }
  };
}

export const phoneScheduler = createPhoneScheduler();

export function schedulePhoneSync(user, rawPhone) {
  return phoneScheduler.schedule(user, rawPhone);
}
