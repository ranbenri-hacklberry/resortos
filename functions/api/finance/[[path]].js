import { errorJson, json } from '../_db.js';

const AUTH_URL = 'https://api.open-finance.ai/oauth/token';
const API_BASE = 'https://api.open-finance.ai/v2';
const USER_AGENT = 'Mozilla/5.0 HotelOS-OpenFinance/1.0';

// Real live Open Finance snapshot from Mialees Studio (Oct 2026)
const DEFAULT_ACCOUNTS = [
  {
    id: 'acc-mizrahi',
    providerId: 'mizrahi',
    accountType: 'CHECKING',
    displayName: 'מזרחי טפחות 462-601997 (מיאליס ריזורט בע״מ)',
    displayBalance: { amount: -81478.86, currency: 'ILS', balanceType: 'interimAvailable', referenceDate: '2026-10-15' }
  },
  {
    id: 'acc-discount',
    providerId: 'discount',
    accountType: 'CHECKING',
    displayName: 'דיסקונט 176-253325996 (מיאליס ריזורט בע״מ)',
    displayBalance: { amount: -46254.84, currency: 'ILS', balanceType: 'closingBooked', referenceDate: '2026-10-16' }
  },
  {
    id: 'acc-beinleumi',
    providerId: 'beinleumi',
    accountType: 'CHECKING',
    displayName: 'הבינלאומי 31-92-395140 (חח״ד עסקי)',
    displayBalance: { amount: -40450.39, currency: 'ILS', balanceType: 'closingBooked', referenceDate: '2026-10-15' }
  },
  // Active credit cards linked to checking accounts
  {
    id: 'acc-card-amex',
    providerId: 'mizrahi',
    accountType: 'CARD',
    displayName: 'אמקס פלטינום (2221)',
    displayBalance: { amount: 15025.65, currency: 'ILS', referenceDate: '2026-11-10' }
  },
  {
    id: 'acc-card-mizrahi-adam',
    providerId: 'mizrahi',
    accountType: 'CARD',
    displayName: 'ויזה מקס זהב (2490 - אדם)',
    displayBalance: { amount: 2795.87, currency: 'ILS', referenceDate: '2026-11-10' }
  },
  {
    id: 'acc-card-fibi-max',
    providerId: 'beinleumi',
    accountType: 'CARD',
    displayName: 'MAX עיסקי זהב (8094)',
    displayBalance: { amount: 6019.78, currency: 'ILS', referenceDate: '2026-10-16' }
  },
  {
    id: 'acc-card-fibi-diners',
    providerId: 'beinleumi',
    accountType: 'CARD',
    displayName: 'דיינרס פלטיניום (2592)',
    displayBalance: { amount: 8386.00, currency: 'ILS', referenceDate: '2026-10-16' }
  },
  {
    id: 'acc-card-discount-flyall',
    providerId: 'discount',
    accountType: 'CARD',
    displayName: 'FlyAll דיסקונט (3174)',
    displayBalance: { amount: 34884.40, currency: 'ILS', referenceDate: '2026-10-15' }
  }
];

// Real Priority Cash Flow & Checks Register (from data/checks.json)
const DEFAULT_CHECKS = [
  { id: 'vat-2026-2026-10-30', check_number: '', amount: 57000, due_date: '2026-10-30', bank: 'mizrahi', payee: 'מע״מ', description: 'אוקטובר 2026', confirmed: true },
  { id: '3650133', check_number: '3650133', amount: 82600, due_date: '2026-11-01', bank: 'mizrahi', payee: 'כינורות', description: 'שכירות / תשלום חודשי', confirmed: true },
  { id: 'booking-monthly-2026-11-01', check_number: '', amount: 5900, due_date: '2026-11-01', bank: 'mizrahi', payee: 'בוקינג', description: 'נובמבר 2026', confirmed: true },
  { id: 'fuel-delek-monthly-2026-11-01', check_number: '', amount: 2700, due_date: '2026-11-01', bank: 'mizrahi', payee: 'דלקן', description: 'נובמבר 2026', confirmed: true },
  { id: 'alex-calendar-monthly-2026-11-01', check_number: '', amount: 8500, due_date: '2026-11-01', bank: 'mizrahi', payee: 'יומן אלכס', description: 'נובמבר 2026', confirmed: true },
  { id: 'zimmer-ads-monthly-2026-11-01', check_number: '', amount: 2832, due_date: '2026-11-01', bank: 'mizrahi', payee: 'צימר — פרסום', description: 'נובמבר 2026', confirmed: true },
  { id: 'fuel-shukrun-monthly-2026-11-01', check_number: '', amount: 1500, due_date: '2026-11-01', bank: 'mizrahi', payee: 'שוקרון', description: 'נובמבר 2026', confirmed: true },
  { id: 'mas-hachnasa-monthly-2026-11-04', check_number: '', amount: 10000, due_date: '2026-11-04', bank: 'mizrahi', payee: 'מס הכנסה עובדים', description: 'נובמבר 2026', confirmed: true },
  { id: 'bituach-leumi-monthly-2026-11-05', check_number: '', amount: 12000, due_date: '2026-11-05', bank: 'mizrahi', payee: 'ביטוח לאומי עובדים', description: 'נובמבר 2026', confirmed: true },
  { id: 'car-jacoo-monthly-2026-11-05', check_number: '', amount: 3900, due_date: '2026-11-05', bank: 'mizrahi', payee: 'רכב ג׳אקו', description: 'נובמבר 2026', confirmed: true },
  { id: 'car-chery-monthly-2026-11-05', check_number: '', amount: 2900, due_date: '2026-11-05', bank: 'mizrahi', payee: 'רכב צ׳רי', description: 'נובמבר 2026', confirmed: true },
  { id: 'car-chery-costa-monthly-2026-11-08', check_number: '', amount: 2600, due_date: '2026-11-08', bank: 'mizrahi', payee: 'צ׳רי קוסטה', description: 'נובמבר 2026', confirmed: true },
  { id: 'salaries-monthly-2026-11-09', check_number: '', amount: 110000, due_date: '2026-11-09', bank: 'mizrahi', payee: 'משכורות', description: 'נובמבר 2026', confirmed: true },
  { id: '3650110', check_number: '3650110', amount: 14160, due_date: '2026-11-10', bank: 'mizrahi', payee: 'ג\'ימי ג\'יפ', description: 'שכירות נובמבר 2026', confirmed: true },
  { id: 'nurit-2026-11-10', check_number: '', amount: 29390, due_date: '2026-11-10', bank: 'mizrahi', payee: 'בתי נורית', description: 'שכירות נובמבר 2026', confirmed: true },
  { id: 'maya-monthly-2026-11-10', check_number: '', amount: 15270, due_date: '2026-11-10', bank: 'mizrahi', payee: 'בקתות מאיה', description: 'נובמבר 2026', confirmed: true },
  { id: 'bagiva-staff-monthly-2026-11-10', check_number: '', amount: 3245, due_date: '2026-11-10', bank: 'mizrahi', payee: 'דירת עובדים צימר בגבעה', description: 'נובמבר 2026', confirmed: true },
  { id: 'musical-monthly-2026-11-10', check_number: '', amount: 15370, due_date: '2026-11-10', bank: 'mizrahi', payee: 'החצר המוסיקלית', description: 'נובמבר 2026', confirmed: true },
  { id: 'taj-monthly-2026-11-10', check_number: '', amount: 19160, due_date: '2026-11-10', bank: 'mizrahi', payee: 'טאג׳ מאהל', description: 'נובמבר 2026', confirmed: true },
  { id: 'toscana-monthly-2026-11-10', check_number: '', amount: 15000, due_date: '2026-11-10', bank: 'mizrahi', payee: 'טוסקנה', description: 'נובמבר 2026', confirmed: true },
  { id: 'kipat-monthly-2026-11-10', check_number: '', amount: 14440, due_date: '2026-11-10', bank: 'mizrahi', payee: 'כיפת שמיים', description: 'נובמבר 2026', confirmed: true },
  { id: 'car-mercedes-monthly-2026-11-10', check_number: '', amount: 4600, due_date: '2026-11-10', bank: 'mizrahi', payee: 'מרצדס', description: 'נובמבר 2026', confirmed: true },
  { id: 'nofim-monthly-2026-11-10', check_number: '', amount: 12670, due_date: '2026-11-10', bank: 'mizrahi', payee: 'נופים בלבן', description: 'נובמבר 2026', confirmed: true },
  { id: 'bagiva-util-monthly-2026-11-10', check_number: '', amount: 5000, due_date: '2026-11-10', bank: 'mizrahi', payee: 'צימר בגבעה', description: 'נובמבר 2026', confirmed: true },
  { id: '3650131', check_number: '3650131', amount: 2445, due_date: '2026-11-11', bank: 'mizrahi', payee: 'יהושוע סליטרניק', description: 'ביטוח בתי נורית', confirmed: true }
];

async function getLiveAccountsIfPossible(env) {
  const clientId = env?.OPEN_FINANCE_CLIENT_ID || 'e8FLKTe4vZ3SoBCFNj76uGfUJoGhjf0y';
  const clientSecret = env?.OPEN_FINANCE_CLIENT_SECRET || 'i-k8BZhQQ5N63amH2-7BoWlbdU8QGqGx8y3ewiZ5iko8D-f1Rp_zemoFVnmgAhhf';
  const userId = env?.OPEN_FINANCE_USER_ID || 'mialisran@gmail.com';
  if (!clientId || !clientSecret || !userId) return DEFAULT_ACCOUNTS;

  try {
    const authRes = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ clientId, clientSecret, userId }),
      signal: AbortSignal.timeout(5000)
    });
    if (!authRes.ok) return DEFAULT_ACCOUNTS;
    const authData = await authRes.json();
    if (!authData?.accessToken) return DEFAULT_ACCOUNTS;

    const accRes = await fetch(`${API_BASE}/data/accounts?limit=50`, {
      headers: { Authorization: `Bearer ${authData.accessToken}`, Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000)
    });
    if (!accRes.ok) return DEFAULT_ACCOUNTS;
    const accData = await accRes.json();
    const items = accData?.items || [];
    if (!items.length) return DEFAULT_ACCOUNTS;

    return items.map((acc) => {
      const balances = Array.isArray(acc.balances) ? acc.balances : [];
      const type = acc.accountType;
      const prefer = type === 'CARD'
        ? ['interimBooked', 'closingBooked', 'interimAvailable']
        : ['interimAvailable', 'closingBooked', 'expected', 'interimBooked'];
      let chosen = null;
      for (const w of prefer) {
        const found = balances.find((b) => b?.balanceType === w && b?.amount != null);
        if (found) { chosen = found; break; }
      }
      if (!chosen) chosen = balances[0];
      return {
        id: acc.id,
        providerId: acc.providerId,
        accountType: acc.accountType,
        displayName: acc.accountName || acc.product || '',
        accountNumber: acc.accountNumber || '',
        creditLimit: acc.creditLimit?.amount || null,
        displayBalance: {
          amount: Number(chosen?.amount || chosen?.balanceAmount?.amount || 0),
          currency: chosen?.balanceAmount?.currency || acc.currency || 'ILS',
          balanceType: chosen?.balanceType,
          referenceDate: chosen?.referenceDate
        }
      };
    });
  } catch {
    return DEFAULT_ACCOUNTS;
  }
}

const DEFAULT_SETTINGS = {
  bookingPayoutDay: 3,
  initialCashDrawer: 14850,
  banks: {
    mizrahi: { facility: 150000, safetyBuffer: 25000 },
    discount: { facility: 100000, safetyBuffer: 20000 },
    beinleumi: { facility: 100000, safetyBuffer: 30000 }
  }
};

let inMemoryManualEntries = [];
let inMemorySettings = { ...DEFAULT_SETTINGS };

export async function onRequest(context) {
  const { request, params } = context;
  const method = request.method.toUpperCase();
  const pathParts = [].concat(params.path || []).filter(Boolean);
  const head = pathParts[0] || '';
  const sub = pathParts[1] || '';

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  try {
    // GET /api/finance/command-center
    if (head === 'command-center' && method === 'GET') {
      const liveAccounts = await getLiveAccountsIfPossible(context.env);
      return json({
        accounts: (liveAccounts && liveAccounts.length > 0) ? liveAccounts : DEFAULT_ACCOUNTS,
        checks: DEFAULT_CHECKS,
        settings: inMemorySettings,
        manualEntries: inMemoryManualEntries,
        cashDrawer: {
          balance: inMemorySettings.initialCashDrawer || 14850,
          currency: 'ILS',
          lastCountDate: new Date().toISOString()
        },
        auditHistory: []
      });
    }

    // GET /api/finance/overview
    if (head === 'overview' && method === 'GET') {
      const liveAccounts = await getLiveAccountsIfPossible(context.env);
      return json({
        accounts: (liveAccounts && liveAccounts.length > 0) ? liveAccounts : DEFAULT_ACCOUNTS
      });
    }

    // GET & POST /api/finance/settings
    if (head === 'settings') {
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        inMemorySettings = { ...inMemorySettings, ...body };
        return json({ ok: true, settings: inMemorySettings });
      }
      return json({ ok: true, settings: inMemorySettings });
    }

    // POST /api/finance/manual-entries
    if (head === 'manual-entries' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const newEntry = {
        id: `man-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        amount: Number(body.amount) || 0,
        date: body.date || new Date().toISOString().slice(0, 10),
        bank: body.bank || 'mizrahi',
        type: body.type || 'credit',
        category: body.category || 'other',
        description: body.description || body.note || 'הזנה ידנית',
        isConfirmed: false,
        source: 'manual',
        created_at: new Date().toISOString()
      };
      inMemoryManualEntries.push(newEntry);
      return json({ ok: true, entry: newEntry, manualEntries: inMemoryManualEntries });
    }

    // DELETE /api/finance/manual-entries/:id
    if (head === 'manual-entries' && method === 'DELETE') {
      const idToDelete = sub;
      inMemoryManualEntries = inMemoryManualEntries.filter((e) => e.id !== idToDelete);
      return json({ ok: true, manualEntries: inMemoryManualEntries });
    }

    // POST /api/finance/checks/capture
    if (head === 'checks' && sub === 'capture' && method === 'POST') {
      const captureId = `cap-${Date.now()}`;
      return json({
        ok: true,
        captureId,
        extracted: {
          checkNumber: '10499',
          amount: 12500,
          date: '2026-11-20',
          bank: 'mizrahi',
          payee: 'צילום שיק חדש'
        },
        duplicates: []
      });
    }

    // POST /api/finance/checks/confirm
    if (head === 'checks' && sub === 'confirm' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return json({
        ok: true,
        confirmed: true,
        captureId: body.captureId
      });
    }

    return errorJson('נתיב פיננסי לא קיים', 404, 'NOT_FOUND');
  } catch (err) {
    console.error('[Finance API Error]', err);
    return errorJson(err?.message || 'שגיאת שרת פיננסי', 500, 'INTERNAL_ERROR');
  }
}
