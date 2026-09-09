import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteGuestCharge, resolveGuestTerminal } from './checkinCharge.js';
import {
  buildHypLowProfileBody,
  buildHypSignFields,
  buildHypTokenChargeFields,
  formatHypListDate,
  hasHypCreds,
  hypCCode,
  hypCheckoutTokenFromParams,
  hypCreds,
  hypLowProfileIdFromParams,
  hypParentBreakoutResponse,
  hypDealMatchesCheckout,
  hypDealToReturnParams,
  hypDealToRow,
  hypMasofForTerminal,
  hypTerminalForPurpose,
  isApprovedHypDeal,
  isHypLowProfilePaid,
  isHypPaid,
  lpResultToHypParams,
  mergeHypPaymentRows,
  parseHypListPayload,
  parseHypQuery,
  publicHypSignFields,
  HYP_TERMINAL_A,
  HYP_TERMINAL_B
} from './hypPay.js';

test('guest charge uses the terminal locked on the booking', () => {
  assert.equal(resolveGuestTerminal({ hyp_terminal: 'A', payment_mode: 'CREDIT_DEPOSIT' }), 'A');
  assert.equal(resolveGuestTerminal({ stay: { hyp_terminal: 'B' } }), 'B');
  assert.equal(resolveGuestTerminal({ payment_mode: 'CREDIT_DEPOSIT' }), 'B');
  assert.equal(resolveGuestTerminal({ payment_mode: 'CREDIT_FULL' }), 'A');
  const quoted = quoteGuestCharge({
    payment_mode: 'CREDIT_DEPOSIT',
    hyp_terminal: 'A',
    deposit_agorot: 25000,
    total_price_agorot: 100000
  });
  assert.equal(quoted.terminal, 'A');
  assert.equal(quoted.purpose, 'deposit');
  assert.equal(quoted.amount, 250);
});

test('purpose maps deposit to terminal B and balance/extra to A', () => {
  assert.equal(hypTerminalForPurpose('deposit'), 'B');
  assert.equal(hypTerminalForPurpose('balance'), 'A');
  assert.equal(hypTerminalForPurpose('extra'), 'A');
  assert.equal(hypMasofForTerminal('B'), HYP_TERMINAL_B);
  assert.equal(hypMasofForTerminal('A'), HYP_TERMINAL_A);
});

test('hypCreds reads HYP_A_* / HYP_B_* and falls back to legacy A vars', () => {
  const a = hypCreds({
    HYP_A_MASOF: '4502210929',
    HYP_A_KEY: 'key-a',
    HYP_A_PASSP: 'pass-a'
  }, 'A');
  assert.equal(a.masof, HYP_TERMINAL_A);
  assert.equal(a.terminal, 'A');
  assert.equal(a.key, 'key-a');

  const legacy = hypCreds({
    HYP_MASOF: '4502210929',
    HYP_KEY: 'legacy-key',
    HYP_PASSP: 'legacy-pass'
  });
  assert.equal(legacy.key, 'legacy-key');
  assert.equal(legacy.terminal, 'A');

  const b = hypCreds({
    HYP_B_MASOF: '4502315932',
    HYP_B_KEY: 'key-b',
    HYP_B_PASSP: 'pass-b'
  }, 'B');
  assert.equal(b.masof, HYP_TERMINAL_B);
  assert.equal(b.terminal, 'B');

  assert.equal(hasHypCreds({}, 'A'), false);
  assert.throws(() => hypCreds({}, 'B'), { code: 'HYP_MISSING_CREDS' });

  const apiKeyIsNotSignKey = hypCreds({
    HYP_A_MASOF: '4502210929',
    HYP_A_KEY: 'real-sign-key',
    HYP_A_PASSP: 'real-pass',
    HYP_API_KEY: 'cardcom-api-key'
  }, 'A');
  assert.equal(apiKeyIsNotSignKey.key, 'real-sign-key');
});

test('buildHypSignFields uses HEB, SendHesh, and the requested masof', () => {
  const fields = buildHypSignFields(
    { masof: HYP_TERMINAL_B, key: 'secret-key', passp: 'secret-pass', terminal: 'B' },
    {
      amount: 250,
      order: 'tok_demo_abc',
      clientName: 'ישראל ישראלי',
      email: 'guest@example.com',
      cell: '050-123-4567',
      info: 'מקדמה · hill-4',
      successUrl: 'https://resortos.app/api/payments/hyp/success'
    }
  );
  assert.equal(fields.Masof, HYP_TERMINAL_B);
  assert.equal(fields.Amount, '250.00');
  assert.equal(fields.PageLang, 'HEB');
  assert.equal(fields.SendHesh, 'True');
  assert.equal(fields.sendemail, 'True');
  assert.equal(fields['EZ.lang'], 'he');
  assert.equal(fields.Order, 'tok_demo_abc');
  assert.equal(fields.ClientName, 'ישראל');
  assert.equal(fields.ClientLName, 'ישראלי');
  assert.equal(fields.url, 'https://resortos.app/api/payments/hyp/success');
  assert.equal(fields.failurl, 'https://resortos.app/api/payments/hyp/success');
  const pub = publicHypSignFields(fields);
  assert.equal(pub.KEY, undefined);
  assert.equal(pub.PassP, undefined);
  assert.equal(fields.KEY, 'secret-key');
  assert.equal(fields.Token, 'True');
});

test('token charge fields send CC as token on action=soft', () => {
  const fields = buildHypTokenChargeFields(
    { masof: HYP_TERMINAL_A, key: 'secret-key', passp: 'secret-pass', terminal: 'A' },
    {
      amount: 4,
      token: 'tokencard',
      exp_month: '12',
      exp_year: '29',
      order: 'tok_stay',
      clientName: 'דניאל שוקרון',
      info: 'יתרה'
    }
  );
  assert.equal(fields.action, 'soft');
  assert.equal(fields.CC, 'tokencard');
  assert.equal(fields.Token, 'True');
  assert.equal(fields.Tmonth, '12');
  assert.equal(fields.Tyear, '29');
  assert.equal(fields.Amount, '4.00');
  assert.equal(fields.Masof, HYP_TERMINAL_A);
});

test('deposit sign request asks Hyp to tokenize the card', () => {
  const fields = buildHypSignFields(
    { masof: HYP_TERMINAL_B, key: 'secret-key', passp: 'secret-pass', terminal: 'B' },
    { amount: 1, order: 'tok_test', clientName: 'Test Guest', tokenize: true }
  );
  assert.equal(fields.Token, 'True');
  assert.equal(fields.Amount, '1.00');
});

test('every charge page tokenizes the card unless opted out', () => {
  const fields = buildHypSignFields(
    { masof: HYP_TERMINAL_A, key: 'secret-key', passp: 'secret-pass', terminal: 'A' },
    { amount: 480, order: 'full_pay', clientName: 'Test Guest' }
  );
  assert.equal(fields.Token, 'True');

  const lp = buildHypLowProfileBody(
    { masof: HYP_TERMINAL_A, apiName: 'api-user', apiPassword: 'api-pass' },
    { amount: 480, order: 'full_pay', clientName: 'Test Guest', info: 'יתרה' }
  );
  assert.equal(lp.Operation, 'ChargeAndCreateToken');

  const optOut = buildHypLowProfileBody(
    { masof: HYP_TERMINAL_A, apiName: 'api-user', apiPassword: 'api-pass' },
    { amount: 10, order: 'no_tok', clientName: 'Test Guest', tokenize: false }
  );
  assert.equal(optOut.Operation, 'ChargeOnly');
});

test('parseHypQuery + CCode: success is 0, anything else is not paid', () => {
  const paid = parseHypQuery('Id=99&CCode=0&Amount=250.00&ACode=1234567&Order=tok_demo');
  assert.equal(hypCCode(paid), 0);
  assert.equal(isHypPaid(paid), true);

  const declined = parseHypQuery('CCode=600&Order=tok_demo');
  assert.equal(hypCCode(declined), 600);
  assert.equal(isHypPaid(declined), false);

  const plus = parseHypQuery('ClientName=Israel+Israeli&CCode=0');
  assert.equal(plus.ClientName, 'Israel Israeli');
  assert.equal(isHypPaid(plus), true);

  const withToken = parseHypQuery('CCode=0&HK=abcToken&L4digit=1234&Brand=Isracard&Tmonth=12&Tyear=29');
  assert.equal(withToken.HK, 'abcToken');
  assert.equal(withToken.L4digit, '1234');

  assert.equal(hypCCode({}), null);
  assert.equal(isHypPaid({}), false);
});

test('maps Hyp list deals from both terminals into finance rows', () => {
  assert.equal(formatHypListDate('2026-08-01'), '01082026');
  const row = hypDealToRow({
    TranzactionId: 469516731,
    ApprovalNumber: '0589648',
    CreateDate: '2026-08-18T10:00:00',
    Amount: 1300,
    TerminalNumber: 4502210929,
    CardOwnerFirstName: 'רמי',
    CardOwnerLastName: 'רוזנברג',
    Last4CardDigits: 3274,
    InvoiceNumber: '2437'
  }, HYP_TERMINAL_A);
  assert.equal(row.txn, '469516731');
  assert.equal(row.terminalId, HYP_TERMINAL_A);
  assert.equal(row.date, '2026-08-18');
  assert.equal(row.amount, 1300);
  assert.equal(row.last4, '3274');
  assert.equal(isApprovedHypDeal({ TranzactionId: row.txn, Amount: row.amount, Status: 'אושרה' }), true);
  assert.equal(isApprovedHypDeal({ TranzactionId: '1', Amount: 10, Status: 'נדחתה' }), false);

  const parsed = parseHypListPayload({
    ResponseCode: 0,
    Tranzactions: [{
      TranzactionId: '111',
      Amount: 250,
      CreateDate: '01/08/2026',
      ApprovalNumber: 'ABC',
      TerminalNumber: HYP_TERMINAL_B
    }]
  }, HYP_TERMINAL_B);
  assert.equal(parsed[0].terminalId, HYP_TERMINAL_B);
  assert.equal(parsed[0].date, '2026-08-01');

  const merged = mergeHypPaymentRows(
    [{ txn: '111', terminalId: HYP_TERMINAL_B, amount: 250, invoice: '9', date: '2026-08-01' }],
    parsed
  );
  assert.equal(merged[0].invoice, '9');
  assert.equal(merged[0].ref, 'ABC');
});

test('checkout recover matches Hyp deal by Order or name+deposit amount', () => {
  const booking = {
    guest_name: 'קוסטה',
    deposit_agorot: 100,
    stay: { hyp_intent: { amount: 1, terminal: 'B' } }
  };
  const byOrder = hypDealToRow({
    TranzactionId: 99,
    Amount: 1,
    Order: 'tok_mt9prw22_tupggn9fax',
    Info: 'מקדמה'
  });
  assert.equal(hypDealMatchesCheckout(byOrder, 'tok_mt9prw22_tupggn9fax', booking), true);
  const byName = { txn: '1', amount: 1, name: 'קוסטה', desc: 'מקדמה · hill-1 · קוסטה', order: '' };
  assert.equal(hypDealMatchesCheckout(byName, 'tok_mt9prw22_tupggn9fax', booking), true);
  const other = { txn: '2', amount: 1, name: 'אחר', desc: 'מקדמה', order: '' };
  assert.equal(hypDealMatchesCheckout(other, 'tok_mt9prw22_tupggn9fax', booking), false);
  const params = hypDealToReturnParams(byOrder, 'tok_mt9prw22_tupggn9fax');
  assert.equal(params.CCode, '0');
  assert.equal(params.Order, 'tok_mt9prw22_tupggn9fax');
  assert.equal(params.Id, '99');
});

test('Low Profile body and result map back to a checkout token', () => {
  const body = buildHypLowProfileBody(
    { masof: HYP_TERMINAL_B, apiName: 'api-user', apiPassword: 'api-pass' },
    {
      amount: 250,
      order: 'tok_demo_abc',
      clientName: 'ישראל ישראלי',
      email: 'guest@example.com',
      cell: '050-123-4567',
      info: 'מקדמה · hill-4',
      tokenize: true,
      successUrl: 'https://resortos.app/api/payments/hyp/success'
    }
  );
  assert.equal(body.TerminalNumber, Number(HYP_TERMINAL_B));
  assert.equal(body.Operation, 'ChargeAndCreateToken');
  assert.equal(body.ReturnValue, 'tok_demo_abc');
  assert.equal(body.Language, 'he');
  assert.equal(body.Amount, 250);
  assert.equal(body.ProductName, 'מקדמה · hill-4');
  assert.equal(body.Document.Products[0].Description, 'מקדמה · hill-4');
  assert.match(body.WebHookUrl, /\/api\/payments\/hyp\/lp$/);

  const mapped = lpResultToHypParams({
    ResponseCode: 0,
    ReturnValue: 'tok_demo_abc',
    TransactionInfo: {
      ResponseCode: 0,
      TransactionId: 8811,
      Amount: 250,
      ApprovalNumber: 'A9',
      Last4CardDigitsString: '4242',
      Brand: 'Visa',
      Token: 'card-token'
    }
  });
  assert.equal(isHypLowProfilePaid({
    ResponseCode: 0,
    TransactionInfo: { ResponseCode: 0, TransactionId: 8811 }
  }), true);
  assert.equal(mapped.Order, 'tok_demo_abc');
  assert.equal(mapped.Id, '8811');
  assert.equal(mapped.HK, 'card-token');
  assert.equal(hypCheckoutTokenFromParams({ ReturnValue: 'tok_demo_abc' }), 'tok_demo_abc');
  assert.equal(hypLowProfileIdFromParams({ LowProfileId: 'lp-1' }), 'lp-1');
});

test('Low Profile invoice lists every cabin as its own product', () => {
  const body = buildHypLowProfileBody(
    { masof: HYP_TERMINAL_B, apiName: 'api-user', apiPassword: 'api-pass' },
    {
      amount: 680,
      order: 'tok_two_cabins',
      clientName: 'אורח',
      info: 'סוכן דמו · צימר בגבעה 1 · צימר בגבעה 2 · מקדמה',
      productName: 'צימר בגבעה 1 · צימר בגבעה 2 · מקדמה',
      products: [
        { Description: 'צימר בגבעה 1 · 2 מבוגרים · 2 ילדים · מקדמה', Quantity: 1, UnitCost: 340 },
        { Description: 'צימר בגבעה 2 · 2 מבוגרים · 2 ילדים · מיטת תינוק · מקדמה', Quantity: 1, UnitCost: 340 }
      ]
    }
  );
  assert.equal(body.ProductName, 'צימר בגבעה 1 · צימר בגבעה 2 · מקדמה');
  assert.equal(body.Document.Products.length, 2);
  assert.match(body.Document.Products[1].Description, /צימר בגבעה 2/);
  assert.equal(body.Document.Products[0].UnitCost + body.Document.Products[1].UnitCost, 680);
});

test('payment return breakout stays on resortos.app', async () => {
  const ok = hypParentBreakoutResponse('https://resortos.app/stay/tok_demo?hyp=ok');
  const html = await ok.text();
  assert.match(html, /window\.top\.location\.replace/);
  assert.match(html, /tok_demo/);
  const blocked = hypParentBreakoutResponse('https://evil.example/phish');
  const blockedHtml = await blocked.text();
  assert.match(blockedHtml, /hyp=missing/);
  assert.doesNotMatch(blockedHtml, /evil\.example/);
});
