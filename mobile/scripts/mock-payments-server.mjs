/**
 * Local stand-in for /api/payments/cardcom while the Worker is not deployed.
 * CARDCOM_TAP_MOCK is forced. No Cardcom credentials. Bind is loopback only.
 *
 *   node mobile/scripts/mock-payments-server.mjs
 *   adb reverse tcp:8788 tcp:8788
 *
 * Charge screen login: max / demo
 */
import http from 'node:http';
import { handleCardcomRequest, signDashboardToken } from '../../functions/lib/cardcomTap.js';

const PORT = Number(process.env.PORT || 8788);

function memoryKv() {
  const data = new Map();
  return {
    async get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async put(key, value) {
      data.set(key, value);
    }
  };
}

const env = {
  CHECKOUT_MAILBOX_SECRET: 'local-mock-secret',
  CARDCOM_TAP_MOCK: '1',
  CHECKOUT_KV: memoryKv()
};

let booking = {
  id: 'book-today-002',
  guest_name: 'שירה לוי',
  unit_id: 'k827',
  checkout_token: 'tok_testbooking01',
  total_price_agorot: 180000,
  deposit_agorot: 0,
  payment_status: 'UNPAID',
  clearing_payments: []
};

const deps = {
  async loadBooking(_env, id) {
    if (!booking || (booking.id !== id && booking.checkout_token !== id)) return null;
    return { booking, token: booking.checkout_token };
  },
  async saveBooking(_env, next) {
    booking = next;
    return { ok: true, booking: next };
  }
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'Content-Type, Authorization',
        'access-control-allow-methods': 'GET, POST, OPTIONS'
      });
      res.end();
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/dashboard/login') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      if (body.username !== 'max' || body.password !== 'demo') {
        res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: 'שם או סיסמה לא נכונים' }));
        return;
      }
      const user = {
        username: 'max',
        display_name: 'מקס (רני)',
        role: 'MANAGER',
        phone: '0506102416'
      };
      const token = await signDashboardToken(env, user);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, token, user }));
      return;
    }

    if (url.pathname.startsWith('/api/payments/cardcom')) {
      const path = url.pathname.replace(/^\/api\/payments\/cardcom\/?/, '');
      const raw = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value == null) continue;
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const request = new Request(new URL(`${url.pathname}${url.search}`, 'https://resortos.app'), {
        method: req.method,
        headers,
        body: raw && raw.length ? raw : undefined
      });
      const result = await handleCardcomRequest(request, env, { ...deps, path });
      const text = await result.text();
      res.writeHead(result.status, { 'content-type': result.headers.get('content-type') || 'application/json; charset=utf-8' });
      res.end(text);
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, code: 'NOT_FOUND' }));
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, code: 'INTERNAL', message: String(err?.message || err) }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock payments http://127.0.0.1:${PORT}`);
  console.log('charge login: max / demo');
  console.log('booking: book-today-002 (שירה לוי, due 1800 ILS)');
});
