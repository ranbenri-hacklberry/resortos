const DOMAINS = [
  { id: 'rent', label: 'שכירות' },
  { id: 'kinorot', label: 'כינורות' },
  { id: 'utilities', label: 'ארנונה, מים וחשמל' },
  { id: 'salaries', label: 'משכורות' },
  { id: 'bituach', label: 'ביטוח לאומי' },
  { id: 'mas', label: 'מס הכנסה' },
  { id: 'vat', label: 'מע״מ' },
  { id: 'cars', label: 'רכבים' },
  { id: 'fuel', label: 'דלק' },
  { id: 'marketing', label: 'שיווק ויומנים' },
  { id: 'ops', label: 'תפעול וספקים' },
  { id: 'insurance', label: 'ביטוח' },
  { id: 'credit', label: 'הקצאת אשראי' },
  { id: 'other', label: 'אחר' }
];

const DOMAIN_ORDER = new Map(DOMAINS.map((domain, index) => [domain.id, index]));

export function domainIdFor(label, payee = '') {
  const text = `${label || ''} ${payee || ''}`;
  if (/ביטוח לאומי/.test(text)) return 'bituach';
  if (/מס הכנסה/.test(text)) return 'mas';
  if (/מע["״']?מ/.test(text)) return 'vat';
  if (/כינורות/.test(text)) return 'kinorot';
  if (/שכירות|שכר דירה/.test(text)) return 'rent';
  if (/ארנונה|מים|חשמל/.test(text)) return 'utilities';
  if (/משכורות/.test(text)) return 'salaries';
  if (/רכב/.test(text)) return 'cars';
  if (/דלק/.test(text)) return 'fuel';
  if (/פרסום|יומן|בוקינג/.test(text)) return 'marketing';
  if (/ניקיון|בריכה|בניין|בניה|גז|ספק/.test(text)) return 'ops';
  if (/הקצאת אשראי/.test(text)) return 'credit';
  if (/ביטוח/.test(text)) return 'insurance';
  if (/ביג/.test(text)) return 'ops';
  return 'other';
}

function roundedMonths(months, source) {
  const cells = {};
  let total = 0;
  for (const month of months) {
    const value = Math.round(Number(source[month]) || 0);
    cells[month] = value;
    total += value;
  }
  return { months: cells, total };
}

export function buildExpenseCashflow(checks, { from = '2026-10' } = {}) {
  const monthSet = new Set();
  const domainBuckets = Object.fromEntries(DOMAINS.map((domain) => [domain.id, {}]));
  const expenseMap = new Map();

  for (const check of checks || []) {
    const month = String(check?.due_date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month) || month < from) continue;
    monthSet.add(month);
    const lines = Array.isArray(check.lines) && check.lines.length
      ? check.lines
      : [{ label: check.description || check.payee || '', amount: check.amount }];
    let dominant = 'other';
    let dominantAmount = -1;
    for (const line of lines) {
      const amount = Number(line.amount) || 0;
      const domainId = domainIdFor(line.label, check.payee);
      domainBuckets[domainId][month] = (domainBuckets[domainId][month] || 0) + amount;
      if (amount > dominantAmount) {
        dominant = domainId;
        dominantAmount = amount;
      }
    }
    const key = check.series || `payee:${check.payee || check.id || ''}`;
    if (!expenseMap.has(key)) {
      expenseMap.set(key, {
        id: key,
        label: check.payee || check.description || key,
        domain: dominant,
        months: {}
      });
    }
    const row = expenseMap.get(key);
    row.months[month] = (row.months[month] || 0) + (Number(check.amount) || 0);
  }

  const months = [...monthSet].sort();
  const domains = DOMAINS
    .map((domain) => ({ id: domain.id, label: domain.label, ...roundedMonths(months, domainBuckets[domain.id]) }))
    .filter((row) => row.total > 0);
  const expenses = [...expenseMap.values()]
    .map((row) => ({
      id: row.id,
      label: row.label,
      domain: row.domain,
      ...roundedMonths(months, row.months)
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => (DOMAIN_ORDER.get(a.domain) - DOMAIN_ORDER.get(b.domain)) || (b.total - a.total) || a.label.localeCompare(b.label, 'he'));

  const totals = {};
  let grand = 0;
  for (const month of months) {
    totals[month] = expenses.reduce((sum, row) => sum + (row.months[month] || 0), 0);
    grand += totals[month];
  }

  return { from, months, domains, expenses, totals, grand };
}

export const CASHFLOW_DOMAINS = DOMAINS;
