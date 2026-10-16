import { errorJson, json } from '../_db.js';

const DEFAULT_ACCOUNTS = [
  {
    id: 'acc-mizrahi',
    providerId: 'mizrahi',
    accountType: 'CHECKING',
    displayName: 'מזרחי טפחות 462-601997 (מיאליס ריזורט בע״מ)',
    displayBalance: { amount: 142500, currency: 'ILS' }
  },
  {
    id: 'acc-discount',
    providerId: 'discount',
    accountType: 'CHECKING',
    displayName: 'דיסקונט 176-253325996 (מיאליס ריזורט בע״מ)',
    displayBalance: { amount: 87300, currency: 'ILS' }
  },
  {
    id: 'acc-beinleumi',
    providerId: 'beinleumi',
    accountType: 'CHECKING',
    displayName: 'הבינלאומי 31-92-395140 (חח״ד עסקי)',
    displayBalance: { amount: 64200, currency: 'ILS' }
  }
];

const DEFAULT_CHECKS = [
  {
    id: 'chk-10442',
    check_number: '10442',
    amount: 14500,
    due_date: '2026-10-24',
    bank: 'mizrahi',
    payee: 'ספק מצעים וטקסטיל מיאליס',
    description: 'השלמת מצעי כותנה מצרית',
    confirmed: true
  },
  {
    id: 'chk-10443',
    check_number: '10443',
    amount: 28000,
    due_date: '2026-10-25',
    bank: 'discount',
    payee: 'קבלן דקים ועץ גולן',
    description: 'שיפוץ דק בריכה ובקתות',
    confirmed: true
  },
  {
    id: 'chk-5501',
    check_number: '5501',
    amount: 35000,
    due_date: '2026-11-01',
    bank: 'beinleumi',
    payee: 'אירוע חברה הייטק סייבר',
    description: 'שיק נכנס מקדמת אירוע',
    direction: 'IN',
    confirmed: true
  },
  {
    id: 'chk-10444',
    check_number: '10444',
    amount: 19500,
    due_date: '2026-11-15',
    bank: 'mizrahi',
    payee: 'חברת ביטוח ומתחם',
    description: 'פוליסת ביטוח שנתי מתחם',
    confirmed: true
  },
  {
    id: 'chk-10445',
    check_number: '10445',
    amount: 16800,
    due_date: '2026-11-20',
    bank: 'discount',
    payee: 'משק גולן תוצרת ויין',
    description: 'סלסלות אירוח ויינות בוטיק',
    confirmed: true
  },
  {
    id: 'chk-10446',
    check_number: '10446',
    amount: 22000,
    due_date: '2026-11-28',
    bank: 'beinleumi',
    payee: 'ספא הוט-טאב שירות',
    description: 'תחזוקת מערכות ספא ומשאבות',
    confirmed: true
  },
  {
    id: 'chk-10447',
    check_number: '10447',
    amount: 31000,
    due_date: '2026-12-10',
    bank: 'mizrahi',
    payee: 'משתלת רמת הגולן',
    description: 'פיתוח גינון ועצי נוי',
    confirmed: true
  }
];

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
      return json({
        accounts: DEFAULT_ACCOUNTS,
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
      return json({
        accounts: DEFAULT_ACCOUNTS
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
