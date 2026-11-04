/**
 * Basalt (BSLT). Closed-loop stored value for the Mialis cart and Mialis Resort.
 * 1 BSLT = 1 ILS. amount_bslt counts minor units: 100 = 1.00 BSLT.
 * No transfer between customers. No cash-out to shekels.
 * Balance is the sum of the ledger. The private Ed25519 key stays in
 * BASALT_ED25519_PRIVATE_KEY and is never returned.
 */

import { json } from '../api/_db.js';
import { fetchPostgrest, getPostgrestConfig, isLocalPostgrestUrl } from '../api/_db.js';
import { createCardcomStore } from './cardcomTap.js';
import { formatAmount, isCardcomMock, moneyToAgorot } from './cardcomTapCore.js';
import { sha256Hex } from './edgeAgentCrypto.js';
import {
  assertKioskOrderId,
  completeKioskTap,
  createKioskLink,
  kioskOrderKey,
  kioskPublicOrigin,
  prepareKioskTap
} from './kioskCart.js';

export const BSLT_MINOR = 100;
export const SYMBOL = 'BSLT';
export const GENESIS = '0'.repeat(64);
export const PASS_TTL_SEC = 60;
export const DEFAULT_BONUS_TIERS = [
  { pay_bslt: 10000, credit_bslt: 10000 },
  { pay_bslt: 20000, credit_bslt: 22000 },
  { pay_bslt: 50000, credit_bslt: 57500 }
];

const CLOSED_LOOP_MESSAGE = 'בזלת היא יתרה סגורה. אין העברה בין לקוחות ואין פדיון לשקלים.';

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function depsOf(env, deps = {}) {
  return {
    basaltStore: deps.basaltStore || env?.BASALT_STORE,
    store: deps.store || env?.CARDCOM_STORE,
    keys: deps.keys || env?.BASALT_KEYS,
    pepper: deps.pepper || env?.BASALT_PIN_PEPPER || env?.CHECKOUT_MAILBOX_SECRET || '',
    fetchImpl: deps.fetchImpl || env?.fetchImpl,
    now: deps.now || env?.now
  };
}

function nowMs(deps) {
  return typeof deps.now === 'function' ? deps.now() : Date.now();
}

function utf8(text) {
  return new TextEncoder().encode(String(text));
}

function bytesToB64(bytes) {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function b64ToBytes(text) {
  const clean = String(text || '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(clean);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

function bytesToB64Url(bytes) {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64UrlToBytes(text) {
  const padded = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return b64ToBytes(padded + pad);
}

function timingSafeEqual(a, b) {
  const left = utf8(a);
  const right = utf8(b);
  const len = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < len; i += 1) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}

export function canonicalTx(tx) {
  return JSON.stringify({
    amount_bslt: Number(tx.amount_bslt),
    created_at: String(tx.created_at),
    id: String(tx.id),
    idempotency_key: tx.idempotency_key ? String(tx.idempotency_key) : '',
    mock: Boolean(tx.mock),
    prev_hash: String(tx.prev_hash),
    ref: String(tx.ref || ''),
    type: String(tx.type),
    wallet_id: String(tx.wallet_id)
  });
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    ...row,
    amount_bslt: Number(row.amount_bslt),
    idempotency_key: row.idempotency_key || '',
    mock: Boolean(row.mock),
    ref: row.ref || '',
    seq: Number(row.seq || 0)
  };
}

export function memoryBasaltStore() {
  const wallets = new Map();
  const ledger = [];
  let tiers = [];
  let tail = Promise.resolve();
  const locked = (fn) => {
    const run = tail.then(fn, fn);
    tail = run.then(() => {}, () => {});
    return run;
  };
  const immutable = () => fail('IMMUTABLE', 'ספר הבזלת הוא append-only');
  return {
    async insertWallet(row) {
      if (wallets.has(row.id) || [...wallets.values()].some((item) => item.phone === row.phone)) {
        throw fail('PHONE_EXISTS', 'כבר יש ארנק בזלת למספר הזה');
      }
      wallets.set(row.id, { ...row });
      return wallets.get(row.id);
    },
    async getWallet(id) {
      return wallets.get(String(id)) || null;
    },
    async findByPhone(phone) {
      return [...wallets.values()].find((item) => item.phone === phone) || null;
    },
    async findByNfc(uid) {
      return [...wallets.values()].find((item) => item.nfc_uid === uid) || null;
    },
    async updateWallet(id, patch) {
      const current = wallets.get(String(id));
      if (!current) throw fail('NOT_FOUND', 'הארנק לא נמצא');
      const next = { ...current, ...patch, id: current.id };
      wallets.set(current.id, next);
      return next;
    },
    async listTiers() {
      return tiers.map((row) => ({ ...row }));
    },
    async setTiers(rows) {
      tiers = rows.map((row) => ({ ...row }));
    },
    async append(row) {
      return locked(async () => {
        const key = row.idempotency_key || '';
        if (key) {
          const prev = ledger.find((item) => item.idempotency_key === key);
          if (prev) return { idempotent: true, row: { ...prev } };
        }
        const tip = ledger.length ? ledger[ledger.length - 1].hash : GENESIS;
        if (row.prev_hash !== tip) throw fail('FORK', 'השרשרת זזה');
        if (await sha256Hex(row.canonical) !== row.hash) throw fail('BAD_HASH', 'גיבוב לא תואם');
        if (['topup', 'bonus', 'refund'].includes(row.type) && row.amount_bslt <= 0) throw fail('SIGN', 'סימן הסכום לא תקין');
        if (row.type === 'purchase' && row.amount_bslt >= 0) throw fail('SIGN', 'סימן הסכום לא תקין');
        if (!row.amount_bslt) throw fail('SIGN', 'סימן הסכום לא תקין');
        if (row.amount_bslt < 0) {
          const bal = ledger.reduce((sum, item) => item.wallet_id === row.wallet_id ? sum + item.amount_bslt : sum, 0);
          if (bal + row.amount_bslt < 0) throw fail('INSUFFICIENT', 'אין מספיק בזלת');
        }
        const stored = Object.freeze({ ...row, seq: ledger.length + 1 });
        ledger.push(stored);
        return { idempotent: false, row: { ...stored } };
      });
    },
    async listLedger() {
      return ledger.map((row) => ({ ...row }));
    },
    async updateLedger() {
      throw immutable();
    },
    async deleteLedger() {
      throw immutable();
    }
  };
}

async function pg(env, path, options = {}) {
  const res = await fetchPostgrest(path, options, env);
  if (!res) throw fail('UNCONFIGURED', 'Postgres לבזלת לא מוגדר');
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: String(text || '').slice(0, 300) };
  }
  if (!res.ok) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data || {});
    if (msg.includes('INSUFFICIENT')) throw fail('INSUFFICIENT', 'אין מספיק בזלת');
    if (msg.includes('FORK') || msg.includes('23505') || msg.includes('GENESIS')) throw fail('FORK', 'השרשרת זזה');
    if (msg.includes('BAD_HASH')) throw fail('BAD_HASH', 'גיבוב לא תואם');
    if (msg.includes('append-only') || msg.includes('55000')) throw fail('IMMUTABLE', 'ספר הבזלת הוא append-only');
    throw fail('BASALT_DB', 'כתיבה לבזלת נכשלה');
  }
  return data;
}

function postgrestReady(env) {
  const cfg = getPostgrestConfig(env);
  return Boolean(cfg.apiKey) && !isLocalPostgrestUrl(cfg.baseUrl);
}

function postgrestStore(env) {
  return {
    async insertWallet(row) {
      const data = await pg(env, '/basalt_wallets', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(row)
      });
      return Array.isArray(data) ? data[0] : data;
    },
    async getWallet(id) {
      const data = await pg(env, `/basalt_wallets?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      return data?.[0] || null;
    },
    async findByPhone(phone) {
      const data = await pg(env, `/basalt_wallets?phone=eq.${encodeURIComponent(phone)}&select=*&limit=1`);
      return data?.[0] || null;
    },
    async findByNfc(uid) {
      const data = await pg(env, `/basalt_wallets?nfc_uid=eq.${encodeURIComponent(uid)}&select=*&limit=1`);
      return data?.[0] || null;
    },
    async updateWallet(id, patch) {
      const data = await pg(env, `/basalt_wallets?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch)
      });
      return Array.isArray(data) ? data[0] : data;
    },
    async listTiers() {
      const data = await pg(env, '/basalt_bonus_tiers?active=eq.true&select=pay_bslt,credit_bslt,active');
      return Array.isArray(data) ? data : [];
    },
    async append(row) {
      const data = await pg(env, '/rpc/basalt_append', {
        method: 'POST',
        body: JSON.stringify({
          p_id: row.id,
          p_wallet_id: row.wallet_id,
          p_type: row.type,
          p_amount_bslt: row.amount_bslt,
          p_prev_hash: row.prev_hash,
          p_hash: row.hash,
          p_server_signature: row.server_signature,
          p_created_at: row.created_at,
          p_ref: row.ref || '',
          p_idempotency_key: row.idempotency_key || null,
          p_canonical: row.canonical,
          p_mock: Boolean(row.mock)
        })
      });
      return { idempotent: Boolean(data?.idempotent), row: normalizeRow(data?.row || row) };
    },
    async listLedger() {
      const data = await pg(env, '/basalt_ledger?select=*&order=seq.asc');
      return (Array.isArray(data) ? data : []).map(normalizeRow);
    },
    async updateLedger() {
      throw fail('IMMUTABLE', 'ספר הבזלת הוא append-only');
    },
    async deleteLedger() {
      throw fail('IMMUTABLE', 'ספר הבזלת הוא append-only');
    }
  };
}

function storeOf(env, deps) {
  if (deps.basaltStore) return deps.basaltStore;
  if (postgrestReady(env)) return postgrestStore(env);
  throw fail('UNCONFIGURED', 'ספר הבזלת לא מוגדר');
}

export async function importPublicKey(b64) {
  return crypto.subtle.importKey('raw', b64ToBytes(b64), { name: 'Ed25519' }, true, ['verify']);
}

export async function keysFromEnv(env) {
  const priv = String(env?.BASALT_ED25519_PRIVATE_KEY || '').trim();
  const pub = String(env?.BASALT_ED25519_PUBLIC_KEY || '').trim();
  if (!priv || !pub) throw fail('UNCONFIGURED', 'מפתח בזלת לא הוגדר');
  const privateKey = await crypto.subtle.importKey('pkcs8', b64ToBytes(priv), { name: 'Ed25519' }, false, ['sign']);
  const publicKey = await importPublicKey(pub);
  const probe = utf8('basalt');
  const sig = await crypto.subtle.sign('Ed25519', privateKey, probe);
  const ok = await crypto.subtle.verify('Ed25519', publicKey, sig, probe);
  if (!ok) throw fail('BAD_KEY', 'המפתח הציבורי לא תואם למפתח הפרטי');
  return { privateKey, publicKey, publicKeyB64: pub.replace(/\s+/g, '') };
}

async function keysOf(env, deps) {
  if (deps.keys?.privateKey && deps.keys?.publicKey) return deps.keys;
  return keysFromEnv(env);
}

async function signBytes(privateKey, bytes) {
  const sig = await crypto.subtle.sign('Ed25519', privateKey, bytes);
  return new Uint8Array(sig);
}

export async function generateBasaltKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    publicKeyB64: bytesToB64(pub),
    pkcs8B64: bytesToB64(pkcs8)
  };
}

export async function verifyBasaltChain(rows, publicKey) {
  let prev = GENESIS;
  const ordered = [...rows].sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  for (let i = 0; i < ordered.length; i += 1) {
    const row = normalizeRow(ordered[i]);
    if (row.prev_hash !== prev) return { ok: false, index: i, id: row.id, seq: row.seq, reason: 'PREV', symbol: SYMBOL };
    const canonical = canonicalTx(row);
    if (canonical !== row.canonical) return { ok: false, index: i, id: row.id, seq: row.seq, reason: 'CANONICAL', symbol: SYMBOL };
    const hash = await sha256Hex(canonical);
    if (hash !== row.hash) return { ok: false, index: i, id: row.id, seq: row.seq, reason: 'HASH', symbol: SYMBOL };
    const ok = await crypto.subtle.verify('Ed25519', publicKey, b64ToBytes(row.server_signature), utf8(canonical));
    if (!ok) return { ok: false, index: i, id: row.id, seq: row.seq, reason: 'SIGNATURE', symbol: SYMBOL };
    prev = row.hash;
  }
  return { ok: true, length: ordered.length, symbol: SYMBOL };
}

function balanceOf(rows, walletId) {
  return rows.reduce((sum, row) => row.wallet_id === walletId ? sum + Number(row.amount_bslt) : sum, 0);
}

function publicWallet(wallet, balance) {
  return {
    ok: true,
    symbol: SYMBOL,
    walletId: wallet.id,
    customerId: wallet.customer_id,
    phone: wallet.phone,
    displayName: wallet.display_name,
    status: wallet.status,
    nfc: Boolean(wallet.nfc_uid),
    pin: Boolean(wallet.pin_hash),
    balance: formatAmount(balance / BSLT_MINOR),
    balance_bslt: balance
  };
}

function phoneOf(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^\d{9,15}$/.test(digits)) throw fail('BAD_PHONE', 'מספר טלפון לא תקין');
  return digits;
}

function nameOf(value) {
  const name = String(value || '').replace(/[\r\n\t]/g, ' ').trim();
  if (!name || name.length > 80) throw fail('BAD_NAME', 'חסר שם');
  return name;
}

function nfcOf(value, { required = false } = {}) {
  const uid = String(value || '').trim().toUpperCase();
  if (!uid && !required) return '';
  if (!/^[0-9A-F]{8,20}$/.test(uid)) throw fail('BAD_NFC', 'מזהה תג לא תקין');
  return uid;
}

async function pinHash(walletId, pin, pepper) {
  const digits = String(pin || '').replace(/\D/g, '');
  if (!/^\d{4}$/.test(digits)) throw fail('BAD_PIN', 'הקוד הוא 4 ספרות');
  if (!pepper) throw fail('UNCONFIGURED', 'חסר pepper לקוד');
  return sha256Hex(`${pepper}:${walletId}:${digits}`);
}

async function pinMatches(wallet, pin, pepper) {
  if (!wallet.pin_hash) return true;
  try {
    const hash = await pinHash(wallet.id, pin, pepper);
    return timingSafeEqual(hash, wallet.pin_hash);
  } catch {
    return false;
  }
}

async function tiersOf(store) {
  const rows = await store.listTiers();
  const active = (rows || []).filter((row) => row.active !== false && Number(row.pay_bslt) > 0 && Number(row.credit_bslt) >= Number(row.pay_bslt));
  return active.length ? active : DEFAULT_BONUS_TIERS;
}

function quotePay(tiers, payMinor) {
  if (!(payMinor > 0)) throw fail('BAD_AMOUNT', 'סכום הטעינה חייב להיות גדול מאפס');
  const hit = tiers.find((row) => Number(row.pay_bslt) === payMinor);
  const credit = hit ? Number(hit.credit_bslt) : payMinor;
  if (credit < payMinor) throw fail('BAD_AMOUNT', 'מדרגת הבונוס לא תקינה');
  return { pay: payMinor, credit, bonus: credit - payMinor };
}

async function appendTx(env, deps, spec) {
  const d = depsOf(env, deps);
  const keys = await keysOf(env, d);
  const store = storeOf(env, d);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rows = await store.listLedger();
    const key = spec.idempotency_key || '';
    if (key) {
      const prev = rows.find((row) => row.idempotency_key === key);
      if (prev) {
        if (prev.amount_bslt !== spec.amount_bslt || prev.wallet_id !== spec.wallet_id || prev.type !== spec.type) {
          throw fail('IDEMPOTENCY_MISMATCH', 'מפתח החיוב כבר שימש לסכום אחר');
        }
        return { row: prev, rows, idempotent: true };
      }
    }
    const tx = {
      id: crypto.randomUUID(),
      wallet_id: spec.wallet_id,
      type: spec.type,
      amount_bslt: spec.amount_bslt,
      prev_hash: rows.length ? rows[rows.length - 1].hash : GENESIS,
      created_at: new Date(nowMs(d)).toISOString(),
      ref: spec.ref || '',
      idempotency_key: key,
      mock: Boolean(spec.mock)
    };
    tx.canonical = canonicalTx(tx);
    tx.hash = await sha256Hex(tx.canonical);
    tx.server_signature = bytesToB64(await signBytes(keys.privateKey, utf8(tx.canonical)));
    try {
      const saved = await store.append(tx);
      if (saved.idempotent) {
        const prev = saved.row;
        if (prev.amount_bslt !== spec.amount_bslt || prev.wallet_id !== spec.wallet_id || prev.type !== spec.type) {
          throw fail('IDEMPOTENCY_MISMATCH', 'מפתח החיוב כבר שימש לסכום אחר');
        }
      }
      const all = await store.listLedger();
      return { row: saved.row, rows: all, idempotent: Boolean(saved.idempotent) };
    } catch (err) {
      if (err?.code === 'FORK') continue;
      throw err;
    }
  }
  throw fail('FORK', 'השרשרת עמוסה');
}

function purchaseMock(env, rows, walletId) {
  if (isCardcomMock(env)) return true;
  const credits = rows.filter((row) => row.wallet_id === walletId && (row.type === 'topup' || row.type === 'bonus') && row.amount_bslt > 0);
  if (!credits.length || credits.some((row) => row.mock)) return true;
  return false;
}

async function approvalFor(row, rows, keys) {
  const balance = balanceOf(rows, row.wallet_id);
  const payload = JSON.stringify({
    amount: formatAmount(Math.abs(row.amount_bslt) / BSLT_MINOR),
    amount_bslt: Math.abs(row.amount_bslt),
    balance_after: balance,
    hash: row.hash,
    ledger_id: row.id,
    mock: Boolean(row.mock),
    ok: true,
    orderId: row.ref,
    settled: true,
    status: 'approved',
    symbol: SYMBOL,
    wallet_id: row.wallet_id
  });
  const signature = bytesToB64(await signBytes(keys.privateKey, utf8(payload)));
  return {
    ok: true,
    status: 'approved',
    settled: true,
    mock: Boolean(row.mock),
    symbol: SYMBOL,
    orderId: row.ref,
    amount: formatAmount(Math.abs(row.amount_bslt) / BSLT_MINOR),
    balance: formatAmount(balance / BSLT_MINOR),
    balance_bslt: balance,
    ledgerId: row.id,
    hash: row.hash,
    walletId: row.wallet_id,
    payloadB64: bytesToB64(utf8(payload)),
    signature,
    message: 'בזלת אושרה'
  };
}

async function walletById(store, id) {
  const wallet = await store.getWallet(id);
  if (!wallet) throw fail('NOT_FOUND', 'הארנק לא נמצא');
  return wallet;
}

export async function createBasaltWallet(env, body, deps = {}) {
  const d = depsOf(env, deps);
  const store = storeOf(env, d);
  if (body?.consent !== true) throw fail('NO_CONSENT', 'צריך הסכמה ליתרת בזלת סגורה');
  const phone = phoneOf(body?.phone);
  const displayName = nameOf(body?.displayName || body?.display_name);
  const existing = await store.findByPhone(phone);
  if (existing) {
    const rows = await store.listLedger();
    return { ...publicWallet(existing, balanceOf(rows, existing.id)), existed: true };
  }
  const id = crypto.randomUUID();
  const pageKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const pageKey = bytesToB64Url(pageKeyBytes);
  let hash = null;
  if (body?.pin) hash = await pinHash(id, body.pin, String(d.pepper || '').trim());
  const nfc = nfcOf(body?.nfcUid || body?.nfc_uid);
  const wallet = {
    id,
    customer_id: String(body?.customerId || `cust-${id}`).slice(0, 80),
    phone,
    display_name: displayName,
    consent_at: new Date(nowMs(d)).toISOString(),
    status: 'active',
    pin_hash: hash,
    nfc_uid: nfc || null,
    page_key_hash: await sha256Hex(pageKey),
    created_at: new Date(nowMs(d)).toISOString()
  };
  await store.insertWallet(wallet);
  const origin = kioskPublicOrigin(env);
  return {
    ...publicWallet(wallet, 0),
    existed: false,
    pageKey,
    pageUrl: `${origin}/api/payments/kiosk/basalt/page?w=${encodeURIComponent(id)}&k=${encodeURIComponent(pageKey)}`
  };
}

export async function rotateBasaltPageKey(env, body, deps = {}) {
  const d = depsOf(env, deps);
  const store = storeOf(env, d);
  const wallet = body?.walletId ? await walletById(store, body.walletId) : await store.findByPhone(phoneOf(body?.phone));
  if (!wallet) throw fail('NOT_FOUND', 'הארנק לא נמצא');
  const pageKey = bytesToB64Url(crypto.getRandomValues(new Uint8Array(32)));
  await store.updateWallet(wallet.id, { page_key_hash: await sha256Hex(pageKey) });
  const origin = kioskPublicOrigin(env);
  return {
    ok: true,
    walletId: wallet.id,
    pageKey,
    pageUrl: `${origin}/api/payments/kiosk/basalt/page?w=${encodeURIComponent(wallet.id)}&k=${encodeURIComponent(pageKey)}`
  };
}

export async function bindBasaltNfc(env, body, deps = {}) {
  const d = depsOf(env, deps);
  const store = storeOf(env, d);
  const wallet = body?.walletId ? await walletById(store, body.walletId) : await store.findByPhone(phoneOf(body?.phone));
  if (!wallet) throw fail('NOT_FOUND', 'הארנק לא נמצא');
  const uid = nfcOf(body?.nfcUid || body?.nfc_uid, { required: true });
  const taken = await store.findByNfc(uid);
  if (taken && taken.id !== wallet.id) throw fail('NFC_TAKEN', 'התג כבר משויך לארנק אחר');
  await store.updateWallet(wallet.id, { nfc_uid: uid });
  return { ok: true, walletId: wallet.id, nfc: true, symbol: SYMBOL };
}

export async function readBasaltBalance(env, body, deps = {}) {
  const d = depsOf(env, deps);
  const store = storeOf(env, d);
  const wallet = body?.walletId
    ? await walletById(store, body.walletId)
    : await store.findByPhone(phoneOf(body?.phone));
  if (!wallet) throw fail('NOT_FOUND', 'הארנק לא נמצא');
  const rows = await store.listLedger();
  return publicWallet(wallet, balanceOf(rows, wallet.id));
}

export async function mintBasaltPass(keys, wallet, now) {
  const exp = Math.floor(now / 1000) + PASS_TTL_SEC;
  const payload = JSON.stringify({ aud: 'basalt-pass', exp, wallet_id: wallet.id });
  const sig = await signBytes(keys.privateKey, utf8(payload));
  return { token: `${bytesToB64Url(utf8(payload))}.${bytesToB64Url(sig)}`, exp };
}

export async function readBasaltPass(keys, token, now) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw fail('BAD_PASS', 'הקוד לא תקין');
  let payloadBytes;
  let sig;
  try {
    payloadBytes = b64UrlToBytes(parts[0]);
    sig = b64UrlToBytes(parts[1]);
  } catch {
    throw fail('BAD_PASS', 'הקוד לא תקין');
  }
  const ok = await crypto.subtle.verify('Ed25519', keys.publicKey, sig, payloadBytes);
  if (!ok) throw fail('BAD_PASS', 'הקוד לא תקין');
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    throw fail('BAD_PASS', 'הקוד לא תקין');
  }
  if (payload?.aud !== 'basalt-pass' || !payload.wallet_id) throw fail('BAD_PASS', 'הקוד לא תקין');
  if (Number(payload.exp) * 1000 < now) throw fail('PASS_EXPIRED', 'הקוד פג. רעננו את הדף');
  return String(payload.wallet_id);
}

export async function issueBasaltPass(env, body, deps = {}) {
  const d = depsOf(env, deps);
  const store = storeOf(env, d);
  const keys = await keysOf(env, d);
  const wallet = await walletById(store, body?.walletId);
  if (wallet.status !== 'active') throw fail('FROZEN', 'הארנק לא פעיל');
  if (wallet.pin_hash && !(await pinMatches(wallet, body?.pin, String(d.pepper || '').trim()))) {
    throw fail('BAD_PIN', 'קוד שגוי');
  }
  const pass = await mintBasaltPass(keys, wallet, nowMs(d));
  return { ok: true, symbol: SYMBOL, walletId: wallet.id, ...pass };
}

async function identify(env, body, deps) {
  const d = depsOf(env, deps);
  const store = storeOf(env, d);
  const keys = await keysOf(env, d);
  const pass = String(body?.pass || '').trim();
  const nfc = nfcOf(body?.nfcUid || body?.nfc_uid);
  let wallet = null;
  if (pass) {
    const id = await readBasaltPass(keys, pass, nowMs(d));
    wallet = await walletById(store, id);
    if (nfc && wallet.nfc_uid && nfc !== wallet.nfc_uid) throw fail('MISMATCH', 'התג לא תואם לבזלת');
  } else if (nfc) {
    wallet = await store.findByNfc(nfc);
    if (!wallet) throw fail('NOT_FOUND', 'התג לא משויך לבזלת');
    if (wallet.pin_hash && !(await pinMatches(wallet, body?.pin, String(d.pepper || '').trim()))) {
      throw fail('BAD_PIN', 'קוד שגוי');
    }
  } else {
    throw fail('NEED_ID', 'צריך קוד QR או תג');
  }
  if (wallet.status !== 'active') throw fail('FROZEN', 'הארנק לא פעיל');
  return wallet;
}

function idemOf(body, fallback) {
  const raw = String(body?.idempotencyKey || fallback || '').trim();
  if (!/^[A-Za-z0-9_:-]{1,80}$/.test(raw)) throw fail('BAD_IDEMPOTENCY', 'מפתח כפול לא תקין');
  return raw;
}

export async function spendBasalt(env, body, deps = {}) {
  const d = depsOf(env, deps);
  const wallet = await identify(env, body, d);
  const amount = moneyToAgorot(body?.amount);
  if (!(amount > 0)) throw fail('BAD_AMOUNT', 'סכום הבזלת חייב להיות גדול מאפס');
  const orderId = assertKioskOrderId(body?.orderId);
  const rows = await storeOf(env, d).listLedger();
  const saved = await appendTx(env, d, {
    wallet_id: wallet.id,
    type: 'purchase',
    amount_bslt: -amount,
    ref: orderId,
    idempotency_key: idemOf(body, orderId),
    mock: purchaseMock(env, rows, wallet.id)
  });
  return approvalFor(saved.row, saved.rows, await keysOf(env, d));
}

export async function refundBasalt(env, body, deps = {}) {
  const d = depsOf(env, deps);
  const orderId = assertKioskOrderId(body?.orderId);
  const store = storeOf(env, d);
  const rows = await store.listLedger();
  const purchase = [...rows].reverse().find((row) => row.type === 'purchase' && row.ref === orderId);
  if (!purchase) throw fail('NOT_FOUND', 'אין חיוב בזלת להחזר');
  const already = rows
    .filter((row) => row.type === 'refund' && row.ref === orderId)
    .reduce((sum, row) => sum + row.amount_bslt, 0);
  const remaining = Math.abs(purchase.amount_bslt) - already;
  if (remaining <= 0) {
    const prior = rows.find((row) => row.idempotency_key === `refund:${orderId}`);
    if (prior) return approvalFor(prior, rows, await keysOf(env, d));
    throw fail('ALREADY_REFUNDED', 'הבזלת כבר הוחזרה לארנק');
  }
  const saved = await appendTx(env, d, {
    wallet_id: purchase.wallet_id,
    type: 'refund',
    amount_bslt: remaining,
    ref: orderId,
    idempotency_key: `refund:${orderId}`,
    mock: Boolean(purchase.mock)
  });
  return { ...(await approvalFor(saved.row, saved.rows, await keysOf(env, d))), message: 'הבזלת הוחזרה לארנק. לא הוחזר שקל.' };
}

export async function adjustBasalt(env, body, deps = {}) {
  const d = depsOf(env, deps);
  const store = storeOf(env, d);
  const wallet = body?.walletId ? await walletById(store, body.walletId) : await store.findByPhone(phoneOf(body?.phone));
  if (!wallet) throw fail('NOT_FOUND', 'הארנק לא נמצא');
  const amount = Number(body?.amount_bslt);
  if (!Number.isInteger(amount) || amount === 0) throw fail('BAD_AMOUNT', 'תיקון הבזלת חייב להיות מספר שלם שונה מאפס');
  const reason = String(body?.reason || '').replace(/[\r\n\t]/g, ' ').trim();
  if (!reason || reason.length > 80) throw fail('BAD_REASON', 'חסרה סיבת תיקון');
  const saved = await appendTx(env, d, {
    wallet_id: wallet.id,
    type: 'adjustment',
    amount_bslt: amount,
    ref: reason,
    idempotency_key: body?.idempotencyKey ? idemOf(body, '') : '',
    mock: false
  });
  const balance = balanceOf(saved.rows, wallet.id);
  return { ok: true, symbol: SYMBOL, walletId: wallet.id, ledgerId: saved.row.id, balance: formatAmount(balance / BSLT_MINOR), balance_bslt: balance };
}

async function tagTopup(env, deps, orderId, walletId, quote) {
  const payStore = deps.store || createCardcomStore(env);
  const saved = await payStore.get(kioskOrderKey(orderId));
  if (!saved) throw fail('NOT_FOUND', 'ההזמנה לא נשמרה');
  await payStore.put(kioskOrderKey(orderId), {
    ...saved,
    basaltTopup: { walletId, payBslt: quote.pay, creditBslt: quote.credit }
  });
}

async function walletForTopup(env, body, deps) {
  const store = storeOf(env, deps);
  if (body?.walletId) return walletById(store, body.walletId);
  const found = await store.findByPhone(phoneOf(body?.phone));
  if (!found) throw fail('NOT_FOUND', 'הארנק לא נמצא');
  return found;
}

export async function openBasaltTopup(env, body, deps = {}) {
  const d = depsOf(env, deps);
  const wallet = await walletForTopup(env, body, d);
  if (wallet.status !== 'active') throw fail('FROZEN', 'הארנק לא פעיל');
  const quote = quotePay(await tiersOf(storeOf(env, d)), moneyToAgorot(body?.amount));
  const orderId = assertKioskOrderId(body?.orderId || `bslt-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`);
  const link = await createKioskLink(env, {
    orderId,
    amount: formatAmount(quote.pay / BSLT_MINOR),
    payments: 1,
    description: 'טעינת בזלת'
  }, d);
  await tagTopup(env, d, orderId, wallet.id, quote);
  return {
    ...link,
    symbol: SYMBOL,
    walletId: wallet.id,
    payBslt: quote.pay,
    creditBslt: quote.credit,
    bonusBslt: quote.bonus
  };
}

export async function prepareBasaltTap(env, body, deps = {}) {
  const d = depsOf(env, deps);
  const wallet = await walletForTopup(env, body, d);
  if (wallet.status !== 'active') throw fail('FROZEN', 'הארנק לא פעיל');
  const quote = quotePay(await tiersOf(storeOf(env, d)), moneyToAgorot(body?.amount));
  const orderId = assertKioskOrderId(body?.orderId || `bslt-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`);
  const prepared = await prepareKioskTap(env, {
    ...body,
    orderId,
    amount: formatAmount(quote.pay / BSLT_MINOR),
    payments: 1
  }, d);
  await tagTopup(env, d, orderId, wallet.id, quote);
  return { ...prepared, symbol: SYMBOL, walletId: wallet.id, payBslt: quote.pay, creditBslt: quote.credit, bonusBslt: quote.bonus };
}

export async function creditApprovedTopup(env, order, deps = {}) {
  if (!order?.basaltTopup || order.status !== 'approved') return null;
  const d = depsOf(env, deps);
  const pay = Number(order.basaltTopup.payBslt);
  const credit = Number(order.basaltTopup.creditBslt);
  if (!(pay > 0) || credit < pay) throw fail('BAD_AMOUNT', 'סכום הטעינה לא תקין');
  const mock = Boolean(order.mock) || isCardcomMock(env);
  const ref = String(order.dealNumber || order.orderId || '');
  await appendTx(env, d, {
    wallet_id: order.basaltTopup.walletId,
    type: 'topup',
    amount_bslt: pay,
    ref,
    idempotency_key: `${order.orderId}:topup`,
    mock
  });
  if (credit > pay) {
    await appendTx(env, d, {
      wallet_id: order.basaltTopup.walletId,
      type: 'bonus',
      amount_bslt: credit - pay,
      ref,
      idempotency_key: `${order.orderId}:bonus`,
      mock
    });
  }
  return readBasaltBalance(env, { walletId: order.basaltTopup.walletId }, d);
}

export async function renderBasaltPage(env, query, deps = {}) {
  const d = depsOf(env, deps);
  const store = storeOf(env, d);
  const keys = await keysOf(env, d);
  const wallet = await store.getWallet(String(query?.walletId || ''));
  const pageKey = String(query?.pageKey || '');
  const expected = wallet ? await sha256Hex(pageKey) : await sha256Hex('missing');
  if (!wallet || !timingSafeEqual(expected, wallet.page_key_hash || '')) {
    throw fail('NOT_FOUND', 'הדף לא נמצא');
  }
  const rows = await store.listLedger();
  const balance = balanceOf(rows, wallet.id);
  const pass = await mintBasaltPass(keys, wallet, nowMs(d));
  let svg = '';
  try {
    const QRCode = (await import('qrcode')).default;
    svg = await QRCode.toString(pass.token, { type: 'svg', margin: 1, width: 280 });
  } catch {
    svg = '';
  }
  const name = String(wallet.display_name || '').replace(/[&<>"]/g, '');
  const shown = formatAmount(balance / BSLT_MINOR);
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="45"><title>בזלת</title></head><body style="margin:0;font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc"><main style="max-width:420px;margin:0 auto;padding:28px 18px;text-align:center"><p style="letter-spacing:.2em;font-size:13px">BSLT</p><h1 style="margin:8px 0;font-size:36px">בזלת</h1><p style="font-size:28px;font-weight:800">${shown}</p><p>${name}</p><div>${svg || `<code style="word-break:break-all">${pass.token}</code>`}</div><p>הקוד תקף דקה. הדף מתרענן לבד.</p><p>יתרה סגורה. אין העברה ואין פדיון לשקלים. לשימוש במיאליס בלבד.</p></main></body></html>`;
}

export async function basaltPageResponse(env, request, deps = {}) {
  const url = new URL(request.url);
  const html = await renderBasaltPage(env, {
    walletId: url.searchParams.get('w'),
    pageKey: url.searchParams.get('k')
  }, depsOf(env, deps));
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export async function basaltPublicKey(env, deps = {}) {
  const keys = await keysOf(env, depsOf(env, deps));
  return { ok: true, symbol: SYMBOL, alg: 'Ed25519', publicKey: keys.publicKeyB64 };
}

export async function verifyBasaltStore(env, deps = {}) {
  const d = depsOf(env, deps);
  const keys = await keysOf(env, d);
  const rows = await storeOf(env, d).listLedger();
  return verifyBasaltChain(rows, keys.publicKey);
}

export function closedLoopRefusal(action) {
  if (['transfer', 'cashout', 'cash-out', 'redeem'].includes(String(action || ''))) {
    return { code: 'CLOSED_LOOP', message: CLOSED_LOOP_MESSAGE };
  }
  return null;
}

export async function handleBasaltRequest(env, pathParts, method, body) {
  const action = pathParts[1] || '';
  const sub = pathParts[2] || '';
  const refused = closedLoopRefusal(action);
  if (refused) {
    return json({ ok: false, status: 'error', error: refused.code, settled: true, message: refused.message }, 403);
  }
  if (method === 'GET' && action === 'balance') return json(await readBasaltBalance(env, body));
  if (method === 'GET' && action === 'verify') return json(await verifyBasaltStore(env));
  if (method === 'GET' && action === 'pubkey') return json(await basaltPublicKey(env));
  if (method !== 'POST') throw fail('NOT_FOUND', 'נתיב לא קיים');
  if (action === 'wallets') return json(await createBasaltWallet(env, body));
  if (action === 'topup') return json(await openBasaltTopup(env, body));
  if (action === 'tap' && sub === 'prepare') return json(await prepareBasaltTap(env, body));
  if (action === 'tap' && sub === 'complete') return json(await completeKioskTap(env, body));
  if (action === 'spend') return json(await spendBasalt(env, body));
  if (action === 'refund') return json(await refundBasalt(env, body));
  if (action === 'adjust') return json(await adjustBasalt(env, body));
  if (action === 'nfc') return json(await bindBasaltNfc(env, body));
  if (action === 'pass') return json(await issueBasaltPass(env, body));
  if (action === 'page-key') return json(await rotateBasaltPageKey(env, body));
  throw fail('NOT_FOUND', 'נתיב לא קיים');
}
