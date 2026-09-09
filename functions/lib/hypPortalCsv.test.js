import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHypPortalCsv } from './hypPortalCsv.js';

test('portal CSV keeps approved Hyp deals and drops declined ones', () => {
  const csv = [
    'מספר עסקה,תשובת חברת אשראי,תאריך,שם פרטי,שם משפחה,תיאור עסקה,4 ספרות אחרונות,סכום,מספר אישור,סולק,אישור הפקדה,מס\' חשבונית,מותג',
    '111,אושרה,2026-08-18,רמי,כהן,רמי כהן,1234,"1,300",0589648,MAX,42914234,2437,Visa',
    '222,העסקה לא אושרה (4),2026-08-18,x,y,z,0000,4600,0000000,MAX,,,Visa'
  ].join('\n');
  const rows = parseHypPortalCsv(csv, '4502210929');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].txn, '111');
  assert.equal(rows[0].amount, 1300);
  assert.equal(rows[0].date, '2026-08-18');
  assert.equal(rows[0].terminalId, '4502210929');
  assert.equal(rows[0].invoice, '2437');
});
