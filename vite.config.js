import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
function loadTailwindPlugin() {
  try {
    return require('@tailwindcss/vite');
  } catch {
    return () => ({ name: 'tailwind-optional' });
  }
}
const tailwindcss = loadTailwindPlugin();
import fs from 'fs';
import path from 'path';
import { createHypPaymentPage } from './functions/lib/hypPay.js';
import { UNIT_DISPLAY_NAMES, UNIT_PROPERTY } from './functions/lib/unitNames.js';
import { readSharedTracker, writeSharedTracker } from './server/sharedTracker.js';

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => reject(new Error('BODY_TIMEOUT')), 5000);
    const finish = (fn) => (value) => {
      clearTimeout(timer);
      fn(value);
    };
    if (req.readableEnded) {
      finish(resolve)({});
      return;
    }
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        finish(resolve)({});
        return;
      }
      try {
        finish(resolve)(JSON.parse(raw));
      } catch (err) {
        finish(reject)(err);
      }
    });
    req.on('error', finish(reject));
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function sendStaffRpcError(res, payload) {
  const code = payload?.error;
  if (code === 'FORBIDDEN') return sendJson(res, 403, { error: 'FORBIDDEN' });
  if (code === 'USERNAME_TAKEN') return sendJson(res, 409, { error: 'USERNAME_TAKEN' });
  if (code === 'WEAK_PASSWORD') return sendJson(res, 400, { error: 'WEAK_PASSWORD' });
  if (code === 'NOT_FOUND') return sendJson(res, 404, { error: 'NOT_FOUND' });
  return sendJson(res, 400, { error: code || 'INVALID' });
}

function requestPath(req) {
  try {
    return new URL(req.url || '/', 'http://localhost').pathname;
  } catch {
    return String(req.url || '').split('?')[0];
  }
}

function staffAuthPlugin(env) {
  for (const key of Object.keys(env)) {
    if (/^(SUPABASE_|AGENT_|CHECKOUT_MAILBOX)/.test(key) && env[key] && process.env[key] === undefined) {
      process.env[key] = env[key];
    }
  }
  const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  async function rpc(fn, args) {
    if (!anonKey) {
      const err = new Error('Supabase anon key is not configured');
      err.status = 503;
      throw err;
    }
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(8000)
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      const err = new Error((data && data.message) || response.statusText);
      err.status = response.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  function bearerToken(req) {
    const header = String(req.headers.authorization || '');
    const match = header.match(/^Bearer\s+(\S+)/i);
    return match ? match[1] : '';
  }

  return {
    name: 'hotelos-local-staff-auth',
    configureServer(server) {
      console.log('[hotelos-auth] middleware attached');

      // Ensure /resorts/* static images are always served reliably
      server.middlewares.use((req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : '';
        if (url.startsWith('/resorts/')) {
          const filename = path.basename(url);
          const filePath = path.join(process.cwd(), 'public/resorts', filename);
          if (fs.existsSync(filePath)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return fs.createReadStream(filePath).pipe(res);
          }
        }
        next();
      });

      // Live Mac Studio Availability API for calendar modal
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : '';
        if (url === '/api/availability') {
          try {
            const parsedUrl = new URL(req.url, 'http://127.0.0.1:3001');
            const unitId = parsedUrl.searchParams.get('unit_id');
            const from = parsedUrl.searchParams.get('from');
            const to = parsedUrl.searchParams.get('to');

            const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

            let query = `/rest/v1/hotelos_bookings?select=unit_id,check_in_date,check_out_date,booking_status&deleted_at=is.null&booking_status=not.in.(CANCELED,CHECKED_OUT)`;
            if (unitId) {
              query += `&unit_id=eq.${encodeURIComponent(unitId)}`;
            }
            if (from) {
              query += `&check_out_date=gt.${encodeURIComponent(from)}`;
            }
            if (to) {
              query += `&check_in_date=lt.${encodeURIComponent(to)}`;
            }

            const dbRes = await fetch(`http://127.0.0.1:54321${query}`, {
              method: 'GET',
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${anonKey}`,
                'Content-Type': 'application/json'
              }
            });

            if (!dbRes.ok) {
              return sendJson(res, 503, { ok: false, isOffline: true, message: 'יומן המק סטודיו אינו זמין כרגע' });
            }

            const rows = await dbRes.json();
            const blockedRanges = (rows || []).map((r) => ({
              unitId: r.unit_id,
              checkIn: r.check_in_date,
              checkOut: r.check_out_date,
              status: r.booking_status
            }));

            return sendJson(res, 200, { ok: true, isOffline: false, blockedRanges });
          } catch (err) {
            console.warn('[Local Availability Middleware Error]', err);
            return sendJson(res, 503, { ok: false, isOffline: true, message: err.message });
          }
        }
        next();
      });

      // Live Mac Studio Booking Creation API for dev server
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : '';
        if (url === '/api/bookings' && req.method === 'POST') {
          try {
            const body = await readJsonBody(req);
            const {
              unit_id,
              check_in_date,
              check_out_date,
              guest_name,
              guest_phone,
              guest_email,
              adults_count = 2,
              children_count = 0,
              babies_count = 0,
              total_price_agorot = 0,
              deposit_agorot = 0,
              special_requests = '',
              is_buyout = false,
              property_id = null
            } = body;

            if (!unit_id || !check_in_date || !check_out_date || !guest_name || !guest_phone || !guest_email) {
              return sendJson(res, 400, { error: 'MISSING_FIELDS', message: 'חסרים שדות חובה (כולל אימייל)' });
            }

            if (check_out_date <= check_in_date) {
              return sendJson(res, 400, { error: 'INVALID_DATES', message: 'תאריך יציאה חייב להיות אחרי תאריך כניסה' });
            }

            const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

            // 1. Check for overlapping active bookings in Postgres
            const overlapQuery = `/rest/v1/hotelos_bookings?unit_id=eq.${encodeURIComponent(unit_id)}&deleted_at=is.null&booking_status=not.in.(CANCELED,CHECKED_OUT)&check_out_date=gt.${encodeURIComponent(check_in_date)}&check_in_date=lt.${encodeURIComponent(check_out_date)}`;
            const checkRes = await fetch(`http://127.0.0.1:54321${overlapQuery}`, {
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${anonKey}`
              }
            });

            if (checkRes.ok) {
              const overlaps = await checkRes.json();
              if (overlaps && overlaps.length > 0) {
                return sendJson(res, 409, {
                  error: 'DATES_OVERLAP_CONFLICT',
                  message: 'התאריכים שנבחרו נתפסו זה עתה ע״י אורח אחר. אנא בחרו תאריכים חלופיים בלוח.'
                });
              }
            }

            // 2. Generate Booking ID & Token
            const bookingId = 'web_' + Date.now();
            const checkoutToken = 'tok_' + bookingId;
            const adultsNum = Number(adults_count) || 2;
            const childrenNum = Number(children_count) || 0;
            const babiesNum = Number(babies_count) || 0;
            const paxTag = `pax:${adultsNum}+${childrenNum}+${babiesNum}`;
            const formattedRequests = special_requests ? `${paxTag} | ${special_requests}` : paxTag;

            const checkoutEnd = new Date(`${check_out_date}T21:59:00.000Z`);
            checkoutEnd.setUTCDate(checkoutEnd.getUTCDate() + 2);
            const newBooking = {
              id: bookingId,
              tenant_id: '22222222-2222-2222-2222-222222222222',
              unit_id: String(unit_id).trim(),
              guest_name: String(guest_name).trim(),
              guest_phone: String(guest_phone).trim(),
              guest_email: String(guest_email).trim(),
              check_in_date,
              check_out_date,
              adults_count: adultsNum,
              children_count: childrenNum,
              total_price_agorot: Number(total_price_agorot) || 0,
              deposit_agorot: Number(deposit_agorot) || 0,
              booking_status: 'PENDING',
              payment_status: 'UNPAID',
              channel_source: 'WEBSITE',
              checkout_token: checkoutToken,
              special_requests: formattedRequests,
              expires_at: checkoutEnd.toISOString()
            };

            const insertRes = await fetch('http://127.0.0.1:54321/rest/v1/hotelos_bookings', {
              method: 'POST',
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${anonKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation'
              },
              body: JSON.stringify(newBooking)
            });

            if (!insertRes.ok) {
              const errBody = await insertRes.text();
              console.warn('[Create Booking DB Insert Error]', errBody);
              return sendJson(res, 503, { error: 'STUDIO_DB_UNAVAILABLE', message: 'שגיאה בשמירת ההזמנה ביומן' });
            }

            const insertedRows = await insertRes.json();
            const savedBooking = insertedRows[0] || newBooking;
            try {
              const bridge = (env.HOTELOS_BRIDGE_URL || 'http://127.0.0.1:4038').replace(/\/$/, '');
              await fetch(`${bridge}/api/guest/mailbox/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(savedBooking)
              });
            } catch (pubErr) {
              console.warn('[mailbox publish after web booking]', pubErr?.message || pubErr);
            }

            // 3. Generate Real Signed Hyp Deposit Payment Page (Terminal B)
            let payUrl = null;
            try {
              const depositShekels = Number(deposit_agorot) / 100;
              const hypEnv = {
                HYP_B_MASOF: process.env.HYP_B_MASOF || '4502315932',
                HYP_B_KEY: process.env.HYP_B_KEY || 'ccbe0111e5eb9cc42540d4f93e0e8fed61b230e0',
                HYP_B_PASSP: process.env.HYP_B_PASSP || '6Z70KAXVT2'
              };
              const hypResult = await createHypPaymentPage(hypEnv, {
                purpose: 'deposit',
                terminal: 'B',
                amount: depositShekels,
                clientName: String(guest_name).trim(),
                email: String(guest_email).trim(),
                cell: String(guest_phone).trim(),
                info: `מקדמת הזמנה - ${unit_id}`,
                order: bookingId,
                successUrl: 'https://resortos.app/api/payments/hyp/success',
                tokenize: true
              });
              payUrl = hypResult.payUrl;
            } catch (hypErr) {
              console.warn('[Hyp APISign Error in dev server]', hypErr.message || hypErr);
            }

            return sendJson(res, 201, {
              success: true,
              booking: {
                id: savedBooking.id,
                checkout_token: savedBooking.checkout_token,
                deposit_agorot: savedBooking.deposit_agorot,
                total_price_agorot: savedBooking.total_price_agorot
              },
              payment: payUrl ? { pay_url: payUrl } : null
            });
          } catch (err) {
            console.warn('[Local Booking API Middleware Error]', err);
            return sendJson(res, 503, { error: 'STUDIO_DB_UNAVAILABLE', message: err.message });
          }
        }

        // Live Checkout / Stay link middleware
        if (url.startsWith('/api/checkout/')) {
          try {
            const parts = url.split('/');
            const token = parts[3] || '';
            
            let bookingData = null;
            let payUrl = null;
            try {
              const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
              const bRes = await fetch(`http://127.0.0.1:54321/rest/v1/hotelos_bookings?checkout_token=eq.${encodeURIComponent(token)}&limit=1`, {
                headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
              });
              if (bRes.ok) {
                const bRows = await bRes.json();
                const booking = bRows[0];
                if (booking) {
                  const depositShekels = (Number(booking.deposit_agorot) || (Number(booking.total_price_agorot) * 0.2)) / 100;
                  const hypEnv = {
                    HYP_B_MASOF: process.env.HYP_B_MASOF || '4502315932',
                    HYP_B_KEY: process.env.HYP_B_KEY || 'ccbe0111e5eb9cc42540d4f93e0e8fed61b230e0',
                    HYP_B_PASSP: process.env.HYP_B_PASSP || '6Z70KAXVT2'
                  };
                  try {
                    const hypResult = await createHypPaymentPage(hypEnv, {
                      purpose: 'deposit',
                      terminal: 'B',
                      amount: Math.max(1, depositShekels),
                      clientName: booking.guest_name,
                      email: booking.guest_email,
                      cell: booking.guest_phone,
                      info: `מקדמת הזמנה - ${booking.unit_id}`,
                      order: booking.id,
                      successUrl: 'https://resortos.app/api/payments/hyp/success',
                      tokenize: true
                    });
                    payUrl = hypResult.payUrl;
                  } catch (hypErr) {
                    console.warn('[Checkout Token Hyp Error]', hypErr.message);
                  }

                  const unitDisplayName = UNIT_DISPLAY_NAMES[booking.unit_id] || booking.unit_id;
                  const propertyId = UNIT_PROPERTY[booking.unit_id] || 'mialees';

                  bookingData = {
                    id: booking.id,
                    tenant_id: booking.tenant_id,
                    unit_id: booking.unit_id,
                    unit: booking.unit_id,
                    unit_name: unitDisplayName,
                    property_id: propertyId,
                    guest_name: booking.guest_name,
                    guest_email: booking.guest_email,
                    guest_phone: booking.guest_phone,
                    check_in_date: booking.check_in_date,
                    check_out_date: booking.check_out_date,
                    adults_count: booking.adults_count,
                    children_count: booking.children_count,
                    total_price_agorot: booking.total_price_agorot,
                    deposit_agorot: booking.deposit_agorot,
                    booking_status: booking.booking_status,
                    payment_status: booking.payment_status,
                    channel_source: booking.channel_source,
                    checkout_token: booking.checkout_token,
                    special_requests: booking.special_requests,
                    payment: {
                      pay_url: payUrl,
                      quote: {
                        deposit_agorot: booking.deposit_agorot,
                        total_price_agorot: booking.total_price_agorot
                      }
                    },
                    stay: {
                      cabin_ready: false,
                      operational_status: 'DIRTY',
                      folio: []
                    }
                  };
                }
              }
            } catch (err) {
              console.warn('[Checkout Token Error]', err.message);
            }

            if (!bookingData) {
              return sendJson(res, 404, { error: 'NOT_FOUND', message: 'ההזמנה לא נמצאה' });
            }

            return sendJson(res, 200, bookingData);
          } catch (err) {
            return sendJson(res, 500, { error: 'CHECKOUT_FAILED', message: err.message });
          }
        }

        next();
      });

      server.middlewares.use(async (req, res, next) => {
        const path = requestPath(req);
        if (!path.startsWith('/api/auth')) {
          next();
          return;
        }
        console.log('[hotelos-auth]', req.method, path);
        try {
          if (req.method === 'GET' && path === '/api/auth/ping') {
            sendJson(res, 200, { ok: true });
            return;
          }
          if (req.method === 'POST' && path === '/api/auth/login') {
            const body = await readJsonBody(req);
            const username = String(body.username || '').trim();
            const password = String(body.password || '');
            if (!username || !password) return sendJson(res, 400, { error: 'INVALID' });
            const result = await rpc('hotelos_login', {
              p_username: username,
              p_password: password
            });
            if (!result || !result.token || !result.user) {
              return sendJson(res, 401, { error: 'INVALID_CREDENTIALS' });
            }
            return sendJson(res, 200, result);
          }
          if (req.method === 'GET' && path === '/api/auth/me') {
            const token = bearerToken(req);
            if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const user = await rpc('hotelos_me', { p_token: token });
            if (!user || !user.id) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            return sendJson(res, 200, { user });
          }
          if (req.method === 'POST' && path === '/api/auth/logout') {
            const token = bearerToken(req);
            if (token) await rpc('hotelos_logout', { p_token: token });
            return sendJson(res, 200, { ok: true });
          }
          if (req.method === 'GET' && path === '/api/auth/tracker') {
            const token = bearerToken(req);
            if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const user = await rpc('hotelos_me', { p_token: token });
            if (!user || !user.id) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            return sendJson(res, 200, readSharedTracker());
          }
          if (req.method === 'PUT' && path === '/api/auth/tracker') {
            const token = bearerToken(req);
            if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const user = await rpc('hotelos_me', { p_token: token });
            if (!user || !user.id) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const body = await readJsonBody(req);
            return sendJson(res, 200, writeSharedTracker(body));
          }
          if (req.method === 'GET' && path === '/api/auth/staff') {
            const token = bearerToken(req);
            if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const result = await rpc('hotelos_list_staff', { p_token: token });
            if (result?.error) return sendStaffRpcError(res, result);
            return sendJson(res, 200, { staff: Array.isArray(result?.staff) ? result.staff : [] });
          }
          const staffPassword = path.match(/^\/api\/auth\/staff\/([^/]+)\/password$/);
          if (req.method === 'GET' && staffPassword) {
            const token = bearerToken(req);
            if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const result = await rpc('hotelos_reveal_staff_password', {
              p_token: token,
              p_staff_id: decodeURIComponent(staffPassword[1])
            });
            if (result?.error) return sendStaffRpcError(res, result);
            return sendJson(res, 200, {
              stored: result?.stored === true,
              password: result?.password || null
            });
          }
          if (req.method === 'POST' && path === '/api/auth/staff') {
            const token = bearerToken(req);
            if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const body = await readJsonBody(req);
            const result = await rpc('hotelos_create_staff', {
              p_token: token,
              p_username: String(body?.username || ''),
              p_password: String(body?.password || ''),
              p_display_name: String(body?.display_name || ''),
              p_role: String(body?.role || ''),
              p_allow_remote_attendance: body?.allow_remote_attendance === true,
              p_allowed_units: Array.isArray(body?.allowed_units) ? body.allowed_units : []
            });
            if (result?.error) return sendStaffRpcError(res, result);
            if (!result?.user) return sendJson(res, 500, { error: 'AUTH_FAILED' });
            import('./server/guestContext.js').then((mod) => mod.scheduleGuestContextPush()).catch(() => {});
            return sendJson(res, 201, result);
          }
          const staffPatch = path.match(/^\/api\/auth\/staff\/([^/]+)$/);
          if (req.method === 'PATCH' && staffPatch) {
            const token = bearerToken(req);
            if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const body = await readJsonBody(req);
            const result = await rpc('hotelos_update_staff', {
              p_token: token,
              p_staff_id: decodeURIComponent(staffPatch[1]),
              p_username: String(body?.username || ''),
              p_password: String(body?.password || ''),
              p_display_name: String(body?.display_name || ''),
              p_role: String(body?.role || ''),
              p_allow_remote_attendance: body?.allow_remote_attendance === true
                ? true
                : (body?.allow_remote_attendance === false ? false : null),
              p_allowed_units: Array.isArray(body?.allowed_units) ? body.allowed_units : null
            });
            if (result?.error) return sendStaffRpcError(res, result);
            if (!result?.user) return sendJson(res, 500, { error: 'AUTH_FAILED' });
            import('./server/guestContext.js').then((mod) => mod.scheduleGuestContextPush()).catch(() => {});
            return sendJson(res, 200, result);
          }
          const staffOff = path.match(/^\/api\/auth\/staff\/([^/]+)\/deactivate$/);
          if (req.method === 'POST' && staffOff) {
            const token = bearerToken(req);
            if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const result = await rpc('hotelos_deactivate_staff', {
              p_token: token,
              p_staff_id: decodeURIComponent(staffOff[1])
            });
            if (result?.error) return sendStaffRpcError(res, result);
            return sendJson(res, 200, { ok: true });
          }
          if (req.method === 'GET' && path === '/api/auth/attendance/settings') {
            const token = bearerToken(req);
            if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const result = await rpc('hotelos_get_attendance_settings', { p_token: token });
            if (result?.error) return sendStaffRpcError(res, result);
            return sendJson(res, 200, result);
          }
          if (req.method === 'PUT' && path === '/api/auth/attendance/settings') {
            const token = bearerToken(req);
            if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const body = await readJsonBody(req);
            const result = await rpc('hotelos_set_attendance_settings', {
              p_token: token,
              p_latitude: Number(body?.latitude),
              p_longitude: Number(body?.longitude),
              p_radius_meters: Number(body?.radius_meters || 150),
              p_site_label: String(body?.site_label || '')
            });
            if (result?.error) return sendStaffRpcError(res, result);
            return sendJson(res, 200, result);
          }
          if (req.method === 'GET' && path === '/api/auth/agents') {
            const token = bearerToken(req);
            if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const user = await rpc('hotelos_me', { p_token: token });
            if (!user?.id) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            if (user.role !== 'MANAGER' && user.role !== 'OPS_MANAGER') return sendJson(res, 403, { error: 'FORBIDDEN' });
            try {
              const listed = await rpc('hotelos_list_agents', { p_token: token });
              if (listed?.error === 'FORBIDDEN') return sendJson(res, 403, { error: 'FORBIDDEN' });
              if (!listed?.error) {
                let rows = Array.isArray(listed?.agents) ? listed.agents : [];
                if (user.role !== 'MANAGER') rows = rows.filter((row) => row.staff_id === user.id);
                return sendJson(res, 200, { agents: rows });
              }
            } catch {
              /* fall through to REST */
            }
            try {
              const { loadAgents, publicAgent } = await import('./server/agentAccounts.js');
              let rows = (await loadAgents()).map(publicAgent).filter(Boolean);
              if (user.role !== 'MANAGER') rows = rows.filter((row) => row.staff_id === user.id);
              return sendJson(res, 200, { agents: rows });
            } catch {
              return sendJson(res, 200, { agents: [] });
            }
          }
          if (req.method === 'POST' && path === '/api/auth/agents') {
            const token = bearerToken(req);
            if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const user = await rpc('hotelos_me', { p_token: token });
            if (!user?.id) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            if (user.role !== 'MANAGER' && user.role !== 'OPS_MANAGER') return sendJson(res, 403, { error: 'FORBIDDEN' });
            const body = await readJsonBody(req);
            const { upsertResortAgent } = await import('./server/agentAccounts.js');
            let staffId = body?.staff_id ? String(body.staff_id) : '';
            if (user.role !== 'MANAGER') staffId = user.id;
            try {
              const agent = await upsertResortAgent({
                id: body?.id || '',
                name: body?.name || user.display_name,
                phone: body?.phone,
                pin: body?.pin,
                commissionRate: staffId ? 0 : body?.commission_rate,
                staffId,
                isActive: body?.is_active !== false
              });
              return sendJson(res, 200, { agent, pin: String(body?.pin || '').replace(/\D/g, '').slice(0, 4) || null });
            } catch (err) {
              if (err.message === 'PHONE_TAKEN') return sendJson(res, 409, { error: 'PHONE_TAKEN' });
              if (err.message === 'WEAK_PIN') return sendJson(res, 400, { error: 'WEAK_PIN' });
              if (err.message === 'INVALID') return sendJson(res, 400, { error: 'INVALID' });
              if (err.message === 'AGENT_PIN_MISSING') return sendJson(res, 503, { error: 'AGENT_PIN_MISSING' });
              throw err;
            }
          }
          const agentOff = path.match(/^\/api\/auth\/agents\/([^/]+)\/deactivate$/);
          if (req.method === 'POST' && agentOff) {
            const token = bearerToken(req);
            if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
            const user = await rpc('hotelos_me', { p_token: token });
            if (!user?.id || user.role !== 'MANAGER') return sendJson(res, 403, { error: 'FORBIDDEN' });
            const { deactivateResortAgent } = await import('./server/agentAccounts.js');
            await deactivateResortAgent(decodeURIComponent(agentOff[1]));
            return sendJson(res, 200, { ok: true });
          }
          return sendJson(res, 404, { error: 'NOT_FOUND' });
        } catch (err) {
          const status = Number(err.status) || 500;
          if (!res.headersSent) {
            sendJson(res, status, { error: status >= 500 ? 'AUTH_FAILED' : (err.message || 'AUTH_FAILED') });
          }
        }
      });
    }
  };
}

function queryOf(req) {
  try {
    return new URL(req.url || '/', 'http://localhost').searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function openFinancePlugin(env) {
  for (const key of Object.keys(env)) {
    if (/^(OPEN_FINANCE_|BANK_SCRAPER_|FIBI_|BEINLEUMI_|HYP_)/.test(key) && env[key] && process.env[key] === undefined) {
      process.env[key] = env[key];
    }
  }
  const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  async function staffUser(req) {
    const header = String(req.headers.authorization || '');
    const match = header.match(/^Bearer\s+(\S+)/i);
    const token = match ? match[1] : '';
    if (!token) {
      const err = new Error('UNAUTHORIZED');
      err.status = 401;
      throw err;
    }
    if (!anonKey) {
      const err = new Error('Supabase anon key is not configured');
      err.status = 503;
      throw err;
    }
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/hotelos_me`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_token: token }),
      signal: AbortSignal.timeout(8000)
    });
    const text = await response.text();
    let user = null;
    if (text) {
      try {
        user = JSON.parse(text);
      } catch {
        user = null;
      }
    }
    if (!response.ok || !user?.id) {
      const err = new Error('UNAUTHORIZED');
      err.status = 401;
      throw err;
    }
    if (user.role !== 'MANAGER') {
      const err = new Error('FORBIDDEN');
      err.status = 403;
      throw err;
    }
    return user;
  }

  return {
    name: 'hotelos-open-finance',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = requestPath(req);
        if (!path.startsWith('/api/finance')) {
          next();
          return;
        }
        try {
          await staffUser(req);
          const finance = await import('./server/openFinance.js');
          if (req.method === 'GET' && path === '/api/finance/overview') {
            return sendJson(res, 200, await finance.getFinanceOverview());
          }
          if (req.method === 'GET' && path === '/api/finance/transactions') {
            const query = queryOf(req);
            return sendJson(res, 200, await finance.getFinanceTransactions({
              dateFrom: query.get('dateFrom'),
              dateTo: query.get('dateTo'),
              accountId: query.get('accountId'),
              connectionId: query.get('connectionId'),
              providerId: query.get('providerId'),
              nextPage: query.get('nextPage'),
              limit: Number(query.get('limit') || 40)
            }));
          }
          if (req.method === 'POST' && path === '/api/finance/refresh') {
            return sendJson(res, 200, await finance.refreshFinanceConnections());
          }
          const scrapers = await import('./server/bankScrapers.js');
          if (req.method === 'GET' && path === '/api/finance/scrape/status') {
            return sendJson(res, 200, scrapers.bankScraperStatus());
          }
          if (req.method === 'POST' && path === '/api/finance/scrape/otp') {
            const body = await readJsonBody(req);
            return sendJson(res, 200, { ok: scrapers.submitBankScraperOtp(body.code) });
          }
          if (req.method === 'POST' && path === '/api/finance/scrape') {
            req.socket?.setTimeout?.(240000);
            const body = await readJsonBody(req);
            const startDate = body.startDate ? new Date(body.startDate) : undefined;
            return sendJson(res, 200, await scrapers.scrapeConfiguredBanks({ startDate }));
          }
          if (req.method === 'POST' && path === '/api/finance/hyp/sync') {
            const body = await readJsonBody(req);
            const hyp = await import('./server/hypSync.js');
            return sendJson(res, 200, await hyp.syncHypPayments({
              from: body.from,
              to: body.to
            }));
          }
          return sendJson(res, 404, { error: 'NOT_FOUND' });
        } catch (err) {
          const status = Number(err.status) || 502;
          if (!res.headersSent) {
            sendJson(res, status, { error: err.message || 'OPEN_FINANCE_FAILED' });
          }
        }
      });
    }
  };
}

function micropaySmsPlugin(env) {
  for (const key of Object.keys(env)) {
    if (/^MICROPAY_/.test(key) && env[key] && process.env[key] === undefined) {
      process.env[key] = env[key];
    }
  }
  const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  async function requireStaff(req) {
    const header = String(req.headers.authorization || '');
    const match = header.match(/^Bearer\s+(\S+)/i);
    const token = match ? match[1] : '';
    if (!token || !anonKey) {
      const err = new Error('UNAUTHORIZED');
      err.status = 401;
      throw err;
    }
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/hotelos_me`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_token: token }),
      signal: AbortSignal.timeout(8000)
    });
    const user = await response.json().catch(() => null);
    if (!response.ok || !user?.id) {
      const err = new Error('UNAUTHORIZED');
      err.status = 401;
      throw err;
    }
    return user;
  }

  return {
    name: 'hotelos-micropay-sms',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = requestPath(req);
        if (urlPath !== '/api/sms/send' && urlPath !== '/api/sms/credit') {
          next();
          return;
        }
        try {
          await requireStaff(req);
          const sms = await import('./server/micropaySms.js');
          if (urlPath === '/api/sms/credit' && req.method === 'GET') {
            return sendJson(res, 200, await sms.fetchMicropayCredit());
          }
          if (urlPath === '/api/sms/send' && req.method === 'POST') {
            const body = await readJsonBody(req);
            return sendJson(res, 200, await sms.sendMicropaySms({
              phone: body.phone,
              message: body.message
            }));
          }
          return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
        } catch (err) {
          const status = Number(err.status) || 502;
          if (!res.headersSent) {
            sendJson(res, status, { error: err.message || 'SMS_FAILED', description: err.description });
          }
        }
      });
    }
  };
}

function kinorotSyncPlugin(env) {
  const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  async function requireStaff(req) {
    const header = String(req.headers.authorization || '');
    const match = header.match(/^Bearer\s+(\S+)/i);
    const token = match ? match[1] : '';
    if (!token || !anonKey) {
      const err = new Error('UNAUTHORIZED');
      err.status = 401;
      throw err;
    }
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/hotelos_me`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_token: token }),
      signal: AbortSignal.timeout(8000)
    });
    const user = await response.json().catch(() => null);
    if (!response.ok || !user?.id) {
      const err = new Error('UNAUTHORIZED');
      err.status = 401;
      throw err;
    }
    return user;
  }

  return {
    name: 'hotelos-kinorot-sync',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = requestPath(req);
        if (urlPath !== '/api/kinorot/sync') {
          next();
          return;
        }
        try {
          await requireStaff(req);
          const control = await import('./server/kinorotSyncControl.js');
          if (req.method === 'GET') {
            return sendJson(res, 200, control.readKinorotSyncStatus());
          }
          if (req.method === 'POST') {
            return sendJson(res, 202, control.startKinorotSync());
          }
          return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
        } catch (err) {
          const status = Number(err.status) || 502;
          if (!res.headersSent) sendJson(res, status, { error: err.message || 'KINOROT_SYNC_FAILED' });
        }
      });
    }
  };
}

function agentLocksPlugin(env) {
  for (const key of Object.keys(env)) {
    if (/^(CHECKOUT_MAILBOX)/.test(key) && env[key] && process.env[key] === undefined) {
      process.env[key] = env[key];
    }
  }
  return {
    name: 'hotelos-agent-locks',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = requestPath(req);
        if (path !== '/api/agent-locks') {
          next();
          return;
        }
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
        try {
          const { pullAgentLocksFromCloud } = await import('./server/agentLocks.js');
          const locks = await pullAgentLocksFromCloud();
          return sendJson(res, 200, { locks });
        } catch (err) {
          const status = Number(err.status) || 502;
          return sendJson(res, status, { error: err.message || 'LOCKS_FAILED', locks: [] });
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = requestPath(req);
        if (path !== '/api/agent-locks') {
          next();
          return;
        }
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
        try {
          const { pullAgentLocksFromCloud } = await import('./server/agentLocks.js');
          const locks = await pullAgentLocksFromCloud();
          return sendJson(res, 200, { locks });
        } catch (err) {
          const status = Number(err.status) || 502;
          return sendJson(res, status, { error: err.message || 'LOCKS_FAILED', locks: [] });
        }
      });
    }
  };
}

function mailboxPublishPlugin(env) {
  for (const key of Object.keys(env)) {
    if (/^(CHECKOUT_MAILBOX)/.test(key) && env[key] && process.env[key] === undefined) {
      process.env[key] = env[key];
    }
  }
  const handle = async (req, res, next) => {
    const pathName = requestPath(req);
    if (pathName !== '/api/guest/mailbox/publish' && pathName !== '/api/guest/mailbox/charge') {
      next();
      return;
    }
    if (req.method !== 'POST' && req.method !== 'PUT') return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    try {
      const booking = await readJsonBody(req);
      const mailbox = await import('./server/checkoutMailbox.js');
      if (pathName === '/api/guest/mailbox/charge') {
        const charged = await mailbox.startMailboxCardCharge(booking);
        return sendJson(res, 200, charged);
      }
      const saved = await mailbox.publishBookingToMailbox(booking);
      return sendJson(res, 200, saved || { ok: true });
    } catch (err) {
      const status = Number(err.status) || 502;
      return sendJson(res, status, { error: err.message || 'PUBLISH_FAILED' });
    }
  };
  return {
    name: 'hotelos-mailbox-publish',
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss(), staffAuthPlugin(env), agentLocksPlugin(env), mailboxPublishPlugin(env), openFinancePlugin(env), kinorotSyncPlugin(env), micropaySmsPlugin(env)],
    optimizeDeps: {
      entries: ['index.html', 'src/main.jsx'],
      include: [
        'react',
        'react-dom',
        'react-i18next',
        'i18next',
        'lucide-react',
        'dexie',
        'dexie-react-hooks',
        '@supabase/supabase-js',
        'framer-motion'
      ]
    },
    server: {
      port: 3001,
      host: true,
      warmup: {
        clientFiles: [
          './src/main.jsx',
          './src/App.jsx',
          './src/i18n.js',
          './src/components/ResortOSCalendar.jsx',
          './src/lib/cloudDb.js'
        ]
      },
      allowedHosts: env.VITE_ALLOWED_HOSTS
        ? env.VITE_ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
        : true,
      watch: {
        ignored: [
          '**/dist/**',
          '**/dist-landing/**',
          '**/dist-reviews/**',
          '**/android/**',
          '**/.wrangler/**',
          '**/.env',
          '**/server/**',
          '**/scratch/**',
          '**/functions/**',
          '**/public/**'
        ]
      },
      proxy: {
        '/pg': {
          target: env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/pg/, '')
        },
        '/api/guest': {
          target: env.HOTELOS_BRIDGE_URL || 'http://127.0.0.1:4038',
          changeOrigin: true
        },
        '/api/checkout': {
          target: env.HOTELOS_BRIDGE_URL || 'http://127.0.0.1:4038',
          changeOrigin: true
        },
        '/api/guest-context-push': {
          target: env.HOTELOS_BRIDGE_URL || 'http://127.0.0.1:4038',
          changeOrigin: true
        },
        '/api/agent-locks': {
          target: env.HOTELOS_BRIDGE_URL || 'http://127.0.0.1:4038',
          changeOrigin: true
        }
      }
    },
    preview: {
      port: 3001,
      host: true,
      allowedHosts: env.VITE_ALLOWED_HOSTS
        ? env.VITE_ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
        : true,
      proxy: {
        '/pg': {
          target: env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/pg/, '')
        },
        '/api/guest': {
          target: env.HOTELOS_BRIDGE_URL || 'http://127.0.0.1:4038',
          changeOrigin: true
        },
        '/api/checkout': {
          target: env.HOTELOS_BRIDGE_URL || 'http://127.0.0.1:4038',
          changeOrigin: true
        },
        '/api/guest-context-push': {
          target: env.HOTELOS_BRIDGE_URL || 'http://127.0.0.1:4038',
          changeOrigin: true
        },
        '/api/agent-locks': {
          target: env.HOTELOS_BRIDGE_URL || 'http://127.0.0.1:4038',
          changeOrigin: true
        }
      }
    },
    build: {
      target: 'es2020',
      minify: 'esbuild',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-i18next', 'i18next'],
            'vendor-motion': ['framer-motion'],
            'vendor-icons': ['lucide-react'],
            'vendor-db': ['dexie', 'dexie-react-hooks', '@supabase/supabase-js']
          }
        }
      }
    }
  };
});
