import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { onRequest } from '../api/payments/kiosk/[[path]].js';
import {
  canonicalTx,
  createBasaltWallet,
  creditApprovedTopup,
  generateBasaltKeys,
  keysFromEnv,
  memoryBasaltStore,
  openBasaltTopup,
  readBasaltPass,
  refundBasalt,
  spendBasalt,
  verifyBasaltChain
} from './basalt.js';
import { confirmKioskLink } from './kioskCart.js';
import { memoryStore } from './cardcomTap.js';

const TOKEN = 'kiosk-token-0123456789';
const PEPPER = 'basalt-test-pepper';

const FACTS = [
  'הסלע הנפוץ ביותר על פני כדור הארץ – רוב קרקעית האוקיינוסים בנויה מבזלת.',
  'גם על הירח ועל מאדים – הכתמים הכהים בירח הם מישורי בזלת עצומים.',
  'רוב שכבות הבזלת בגולן נוצרו בשני מיליון השנים האחרונות, מהתפרצויות של הרי געש בצפון הגולן כמו הר בנטל והר אביטל.',
  'בריכת המשושים נוצרה כשלבה התקררה והתכווצה לאט ונסדקה לעמודים משושים – כמו מסלול הענקים באירלנד.',
  'בזלת צפופה פי שלושה בערך ממים, ולכן מבני הבזלת העתיקים בגולן שרדו אלפי שנים.',
  'בתי כנסת עתיקים כמו באום אל-קנאטיר ובכורזים נבנו מבזלת, ובכורזים יש גם "כיסא משה" מבזלת.',
  'בזלת מתבלה לאדמה עשירה במינרלים – אחת הסיבות שהכרמים והמטעים בגולן כל כך טובים.',
  'מתיכים בזלת ומושכים ממנה סיבים חזקים ועמידים לאש, שמחליפים סיבי זכוכית בבנייה וברכב.',
  'באיסלנד מזריקים CO₂ לבזלת והוא הופך לאבן תוך כשנתיים – פתרון מבטיח לאגירת פחמן.',
  'אבני בזלת שומרות חום זמן רב, ולכן משתמשים בהן לעיסוי באבנים חמות ולצלייה.',
  'הצד המזרחי של הכנרת מוקף בזלת, ורמות יושבת על זרמי לבה עתיקים שהשתפכו לכיוון האגם.'
];

function harness(extra = {}) {
  const keysPromise = generateBasaltKeys();
  return keysPromise.then((keys) => {
    const basaltStore = memoryBasaltStore();
    const env = {
      CARDCOM_API_NAME: 'api-name',
      CARDCOM_API_PASSWORD: 'secret-password',
      CARDCOM_TERMINAL: '1000',
      CARDCOM_KIOSK_TOKEN: TOKEN,
      CARDCOM_STORE: memoryStore(),
      BASALT_STORE: basaltStore,
      BASALT_KEYS: keys,
      BASALT_PIN_PEPPER: PEPPER,
      BASALT_ED25519_PRIVATE_KEY: keys.pkcs8B64,
      BASALT_ED25519_PUBLIC_KEY: keys.publicKeyB64,
      ...extra
    };
    return { env, keys, basaltStore, deps: { basaltStore, store: env.CARDCOM_STORE, keys, pepper: PEPPER } };
  });
}

test('basalt hash chain and signature find the first broken link', async () => {
  const { env, keys, basaltStore, deps } = await harness();
  const wallet = await createBasaltWallet(env, { phone: '0501111111', displayName: 'דנה', consent: true }, deps);
  await creditApprovedTopup(env, {
    status: 'approved',
    orderId: 'bslt-top-1',
    dealNumber: 'D-1',
    mock: false,
    basaltTopup: { walletId: wallet.walletId, payBslt: 20000, creditBslt: 22000 }
  }, deps);
  const rows = await basaltStore.listLedger();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].type, 'topup');
  assert.equal(rows[0].amount_bslt, 20000);
  assert.equal(rows[1].type, 'bonus');
  assert.equal(rows[1].amount_bslt, 2000);
  assert.deepEqual(await verifyBasaltChain(rows, keys.publicKey), { ok: true, length: 2, symbol: 'BSLT' });

  const canonicalBreak = rows.map((row, index) => index === 0 ? { ...row, amount_bslt: 1 } : row);
  const canonical = await verifyBasaltChain(canonicalBreak, keys.publicKey);
  assert.equal(canonical.ok, false);
  assert.equal(canonical.index, 0);
  assert.equal(canonical.reason, 'CANONICAL');

  const signedBreak = rows.map((row, index) => index === 1 ? { ...row, server_signature: rows[0].server_signature } : row);
  const signature = await verifyBasaltChain(signedBreak, keys.publicKey);
  assert.equal(signature.ok, false);
  assert.equal(signature.index, 1);
  assert.equal(signature.reason, 'SIGNATURE');

  const prevBreak = rows.map((row, index) => index === 1 ? { ...row, prev_hash: 'ab'.repeat(32) } : row);
  const prev = await verifyBasaltChain(prevBreak, keys.publicKey);
  assert.equal(prev.reason, 'PREV');
  assert.equal(prev.index, 1);
  assert.equal(canonicalTx(rows[0]).includes('"amount_bslt":20000'), true);
});

test('basalt spend is idempotent, rejects a short balance, and verifies the approval', async () => {
  const { env, keys, basaltStore, deps } = await harness();
  const wallet = await createBasaltWallet(env, { phone: '0502222222', displayName: 'עמית', consent: true, pin: '1234' }, deps);
  await creditApprovedTopup(env, {
    status: 'approved',
    orderId: 'bslt-top-2',
    dealNumber: 'D-2',
    mock: false,
    basaltTopup: { walletId: wallet.walletId, payBslt: 20000, creditBslt: 22000 }
  }, deps);
  const pass = await (async () => {
    const { issueBasaltPass } = await import('./basalt.js');
    return issueBasaltPass(env, { walletId: wallet.walletId, pin: '1234' }, deps);
  })();
  const first = await spendBasalt(env, { orderId: 'cart-1001', amount: '18.50', pass: pass.token, idempotencyKey: 'cart-1001' }, deps);
  const second = await spendBasalt(env, { orderId: 'cart-1001', amount: '18.50', pass: pass.token, idempotencyKey: 'cart-1001' }, deps);
  assert.equal(first.ledgerId, second.ledgerId);
  assert.equal(first.mock, false);
  assert.equal(first.symbol, 'BSLT');
  const purchases = (await basaltStore.listLedger()).filter((row) => row.type === 'purchase');
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].amount_bslt, -1850);
  const payload = Buffer.from(first.payloadB64, 'base64').toString('utf8');
  const sig = Buffer.from(first.signature, 'base64');
  const ok = await crypto.subtle.verify('Ed25519', keys.publicKey, sig, new TextEncoder().encode(payload));
  assert.equal(ok, true);
  assert.equal(payload.includes('"status":"approved"'), true);
  assert.equal(payload.includes('"mock":false'), true);
  assert.equal(payload.includes('"settled":true'), true);
  await assert.rejects(
    () => spendBasalt(env, { orderId: 'cart-1001', amount: '19.00', pass: pass.token, idempotencyKey: 'cart-1001' }, deps),
    (err) => err.code === 'IDEMPOTENCY_MISMATCH'
  );
  const before = (await basaltStore.listLedger()).length;
  await assert.rejects(
    () => spendBasalt(env, { orderId: 'cart-9999', amount: '300.00', pass: pass.token }, deps),
    (err) => err.code === 'INSUFFICIENT'
  );
  assert.equal((await basaltStore.listLedger()).length, before);
  const parallel = await Promise.all([
    spendBasalt(env, { orderId: 'cart-1002', amount: '1.00', pass: pass.token, idempotencyKey: 'cart-1002' }, deps),
    spendBasalt(env, { orderId: 'cart-1002', amount: '1.00', pass: pass.token, idempotencyKey: 'cart-1002' }, deps)
  ]);
  assert.equal(parallel[0].ledgerId, parallel[1].ledgerId);
  assert.equal((await basaltStore.listLedger()).filter((row) => row.ref === 'cart-1002').length, 1);
});

test('basalt ledger rejects update and delete, and the migration does too', async () => {
  const { basaltStore } = await harness();
  await assert.rejects(() => basaltStore.updateLedger('x'), (err) => err.code === 'IMMUTABLE');
  await assert.rejects(() => basaltStore.deleteLedger('x'), (err) => err.code === 'IMMUTABLE');
  const sql = await readFile(new URL('../../migrations/009_basalt.sql', import.meta.url), 'utf8');
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.basalt_ledger/);
  assert.match(sql, /basalt_ledger is append-only/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.basalt_ledger/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.equal(sql.includes('Mialis Coin'), false);
});

test('basalt top-up of 200 ILS credits 220 BSLT once, and a mock spend cannot pour', async () => {
  const { env, deps, basaltStore } = await harness({ CARDCOM_MOCK: '1' });
  const wallet = await createBasaltWallet(env, { phone: '0503333333', displayName: 'נועה', consent: true }, deps);
  const opened = await openBasaltTopup(env, { walletId: wallet.walletId, amount: '200.00' }, deps);
  assert.equal(opened.payBslt, 20000);
  assert.equal(opened.creditBslt, 22000);
  assert.equal(opened.bonusBslt, 2000);
  await confirmKioskLink(env, { orderId: opened.orderId, lowProfileId: opened.lowProfileId }, deps);
  await confirmKioskLink(env, { orderId: opened.orderId, lowProfileId: opened.lowProfileId }, deps);
  const rows = await basaltStore.listLedger();
  assert.equal(rows.length, 2);
  assert.equal(rows.every((row) => row.mock === true), true);
  const pass = await (await import('./basalt.js')).issueBasaltPass(env, { walletId: wallet.walletId }, deps);
  const spent = await spendBasalt(env, { orderId: 'cart-mock', amount: '5.00', pass: pass.token }, deps);
  assert.equal(spent.mock, true);
  const payload = Buffer.from(spent.payloadB64, 'base64').toString('utf8');
  assert.equal(payload.includes('"mock":true'), true);
});

test('basalt pass expiry, NFC pin, refund, and closed-loop routes', async () => {
  let clock = Date.parse('2026-11-04T12:00:00Z');
  const { env, keys, basaltStore, deps } = await harness();
  deps.now = () => clock;
  env.now = () => clock;
  const wallet = await createBasaltWallet(env, {
    phone: '0504444444',
    displayName: 'יואב',
    consent: true,
    pin: '9876',
    nfcUid: '04A1B2C3'
  }, deps);
  await creditApprovedTopup(env, {
    status: 'approved',
    orderId: 'bslt-top-3',
    dealNumber: 'D-3',
    mock: false,
    basaltTopup: { walletId: wallet.walletId, payBslt: 10000, creditBslt: 10000 }
  }, deps);
  const { issueBasaltPass, bindBasaltNfc } = await import('./basalt.js');
  const pass = await issueBasaltPass(env, { walletId: wallet.walletId, pin: '9876' }, deps);
  clock += 61_000;
  await assert.rejects(() => readBasaltPass(keys, pass.token, clock), (err) => err.code === 'PASS_EXPIRED');
  clock -= 61_000;
  await assert.rejects(
    () => spendBasalt(env, { orderId: 'cart-nfc', amount: '1.00', nfcUid: '04A1B2C3', pin: '0000' }, deps),
    (err) => err.code === 'BAD_PIN'
  );
  assert.equal((await basaltStore.listLedger()).some((row) => row.type === 'purchase'), false);
  const spent = await spendBasalt(env, { orderId: 'cart-nfc', amount: '4.00', nfcUid: '04A1B2C3', pin: '9876' }, deps);
  assert.equal(spent.ok, true);
  const refunded = await refundBasalt(env, { orderId: 'cart-nfc' }, deps);
  const again = await refundBasalt(env, { orderId: 'cart-nfc' }, deps);
  assert.equal(refunded.ledgerId, again.ledgerId);
  const rows = await basaltStore.listLedger();
  const balance = rows.filter((row) => row.wallet_id === wallet.walletId).reduce((sum, row) => sum + row.amount_bslt, 0);
  assert.equal(balance, 10000);
  await bindBasaltNfc(env, { walletId: wallet.walletId, nfcUid: 'DEADBEEF' }, deps);

  const request = (path) => onRequest({
    request: new Request(`https://resortos.app/api/payments/kiosk/basalt/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: '{}'
    }),
    env,
    params: { path: ['basalt', path] }
  });
  const transfer = await request('transfer');
  const cashout = await request('cashout');
  assert.equal(transfer.status, 403);
  assert.equal(cashout.status, 403);
  assert.equal((await transfer.json()).error, 'CLOSED_LOOP');
  const page = await onRequest({
    request: new Request(wallet.pageUrl),
    env,
    params: { path: ['basalt', 'page'] }
  });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /בזלת/);
  assert.equal(html.includes(keys.pkcs8B64), false);
  assert.equal(html.includes(wallet.pageKey), false);
  const loaded = await keysFromEnv(env);
  assert.equal(loaded.publicKeyB64, keys.publicKeyB64);
});

test('readme keeps the Basalt facts verbatim', async () => {
  const readme = await readFile(new URL('../../mobile/kiosk/README.md', import.meta.url), 'utf8');
  for (const line of FACTS) assert.ok(readme.includes(line), line);
  assert.equal(readme.includes('Mialis Coin'), false);
});
