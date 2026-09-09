import { isoHypDate } from './hypPay.js';

export function parseCsvRecords(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => String(cell || '').trim()));
}

export function parseHypPortalCsv(text, terminalId = '') {
  const records = parseCsvRecords(text);
  if (records.length < 2) return [];
  const header = records[0].map((cell) => cell.trim());
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));
  const get = (row, name) => String(row[idx[name]] || '').trim();
  return records.slice(1).flatMap((row) => {
    const status = get(row, 'תשובת חברת אשראי');
    if (status !== 'אושרה') return [];
    const amount = Number(String(get(row, 'סכום') || '0').replace(/[^\d.-]/g, ''));
    const first = get(row, 'שם פרטי');
    const last = get(row, 'שם משפחה');
    const txn = get(row, 'מספר עסקה');
    if (!txn || !amount) return [];
    return [{
      txn,
      ref: get(row, 'מספר אישור'),
      date: isoHypDate(get(row, 'תאריך')),
      first,
      last,
      name: `${first} ${last}`.trim(),
      desc: get(row, 'תיאור עסקה') || `${first} ${last}`.trim(),
      amount,
      terminalId: String(terminalId || '').replace(/\D/g, ''),
      invoice: get(row, "מס' חשבונית") || get(row, 'מס חשבונית'),
      depositApproval: get(row, 'אישור הפקדה'),
      last4: get(row, '4 ספרות אחרונות').replace(/\D/g, '').slice(-4),
      brand: get(row, 'מותג'),
      acquirer: get(row, 'סולק') || 'MAX'
    }];
  });
}
