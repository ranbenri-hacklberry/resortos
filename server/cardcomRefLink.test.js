import assert from 'node:assert/strict';
import test from 'node:test';
import { CardcomStorage } from './lib/cardcomStorage.js';
import { fetchCardcomCancellations, normalizeCardcomDeal } from './lib/cardcomTerminalService.js';
import { pollCardcomTerminal } from './syncCardcomTerminal.js';

const TOKEN = 'tok_test0000000000000000000000000001';

// Shape of the real ₪1 guest-page deal from 9.11 (no card data), now with our custom fields.
function guestPageDeal(extra = {}) {
  return {
    ResponseCode: 0,
    Description: 'העסקה בוצעה בהצלחה',
    TranzactionId: 269463011,
    TerminalNumber: 184288,
    Amount: 1,
    CoinId: 1,
    CreateDate: '2026-11-09T16:54:43',
    Last4CardDigitsString: '0085',
    ApprovalNumber: '691642',
    CardOwnerName: 'רן בן ארי',
    DocumentNumber: 12,
    DocumentType: 'TaxInvoiceAndReceipt',
    DealType: 'Debit',
    IsRefund: false,
    CustomFields: [{ Id: 1, Value: TOKEN }, { Id: 2, Value: 'web_pilot-office_20261109_0001' }],
    ...extra
  };
}

function cardcomFetch(transactions, seen = []) {
  return async (url, init = {}) => {
    if (url.includes('ListTransactions')) {
      seen.push(JSON.parse(init.body || '{}'));
      return { ok: true, json: async () => ({ ResponseCode: 0, Transactions: transactions }) };
    }
    return { ok: true, json: async () => [] };
  };
}

async function memoryStore(fetchImpl) {
  const store = new CardcomStorage({ fetchImpl, enableDiskCache: false, supabaseUrl: '', supabaseKey: '' });
  await store.init();
  return store;
}

test('normalizeCardcomDeal reads the booking reference from CustomFields', () => {
  const deal = normalizeCardcomDeal(guestPageDeal());
  assert.equal(deal.customFields.token, TOKEN);
  assert.equal(deal.customFields.bookingId, 'web_pilot-office_20261109_0001');
  assert.equal(deal.documentNumber, '12');
});

test('poller links a ₪1 deal with an exact booking reference (no ≤₪5 ignore), once', async () => {
  const fetchImpl = cardcomFetch([guestPageDeal()]);
  const store = await memoryStore(fetchImpl);
  const recorded = [];
  const recordDeal = async (deal, ref) => {
    recorded.push({ dealId: deal.dealId, amount: deal.amount, approval: deal.approval, last4: deal.last4, doc: deal.documentNumber, ref });
    return { ok: true, recorded: true, bookingId: 'web_pilot-office_20261109_0001' };
  };
  const res = await pollCardcomTerminal({
    apiName: 'mock-user', apiPassword: 'mock-pass', force: true, fetchImpl, storage: store, bookings: [], recordDeal
  });
  assert.equal(res.ok, true);
  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0], {
    dealId: '269463011', amount: 1, approval: '691642', last4: '0085', doc: '12',
    ref: { token: TOKEN, bookingId: 'web_pilot-office_20261109_0001', test: false }
  });
  assert.equal(store.seenDeals.get('269463011').status, 'linked');
  assert.equal(store.seenDeals.get('269463011').linked_booking_id, 'web_pilot-office_20261109_0001');
  assert.equal(store.getActivePendingMatches().length, 0);
  assert.equal(res.newMatchesCount, 0);

  // Next poll: already linked, not recorded again.
  await pollCardcomTerminal({ apiName: 'mock-user', apiPassword: 'mock-pass', force: true, fetchImpl, storage: store, bookings: [], recordDeal });
  assert.equal(recorded.length, 1);
});

test('a referenced deal that cannot be recorded stays visible to staff', async () => {
  const fetchImpl = cardcomFetch([guestPageDeal({ DocumentNumber: '' })]);
  const store = await memoryStore(fetchImpl);
  const res = await pollCardcomTerminal({
    apiName: 'mock-user', apiPassword: 'mock-pass', force: true, fetchImpl, storage: store, bookings: [],
    recordDeal: async () => ({ ok: false, reason: 'BOOKING_NOT_FOUND' })
  });
  assert.equal(res.newMatchesCount, 1);
  const match = store.pendingMatches.get('269463011');
  assert.equal(match.status, 'pending');
  assert.equal(match.is_test, false, '₪1 alone is not a test');
});

test('poller skips the DB when the deal is already on a loaded booking', async () => {
  const fetchImpl = cardcomFetch([guestPageDeal()]);
  const store = await memoryStore(fetchImpl);
  let calls = 0;
  await pollCardcomTerminal({
    apiName: 'mock-user', apiPassword: 'mock-pass', force: true, fetchImpl, storage: store,
    bookings: [{ id: 'web_pilot-office_20261109_0001', clearing_payments: [{ txn: '269463011', amount_agorot: 100 }] }],
    recordDeal: async () => { calls += 1; return { ok: true, bookingId: 'x' }; }
  });
  assert.equal(calls, 0);
  assert.equal(store.seenDeals.get('269463011').status, 'linked');
});

test('cancellations request uses Cardcom Page_size (10–2000), not PageSize', async () => {
  const bodies = [];
  await fetchCardcomCancellations({
    from: '2026-11-06', to: '2026-11-09', apiName: 'u', apiPassword: 'p',
    fetchImpl: cardcomFetch([], bodies)
  });
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].Page_size, 50);
  assert.equal('PageSize' in bodies[0], false);
  const small = [];
  await fetchCardcomCancellations({ from: '2026-11-09', to: '2026-11-09', apiName: 'u', apiPassword: 'p', pageSize: 3, fetchImpl: cardcomFetch([], small) });
  assert.equal(small[0].Page_size, 10);
});
