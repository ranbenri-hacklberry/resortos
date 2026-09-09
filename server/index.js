import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createStaff, deactivateAgent, deactivateStaff, getAttendanceSettings, getSharedTrackerDoc, getStaffMe, listAgents, listStaff, loginStaff, logoutStaff, requireManagerStaff, requireStaff, revealStaffPassword, saveSharedTrackerDoc, setAttendanceSettings, updateStaff, upsertAgent } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
    }
}

loadEnvFile();

const app = express();

function isPrivateOrigin(origin) {
    if (!origin) return true;
    try {
        const { hostname } = new URL(origin);
        if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
        if (hostname.endsWith('.ts.net') || hostname.endsWith('.local')) return true;
        if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return true;
        if (/^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
        return false;
    } catch {
        return false;
    }
}

app.use(cors({
    origin(origin, callback) {
        callback(null, isPrivateOrigin(origin));
    }
}));

app.post(
    '/api/webhooks/payfac',
    express.raw({ type: 'application/json' }),
    async (req, res, next) => {
        req.rawBody = req.body;
        try {
            const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '{}');
            req.body = JSON.parse(text || '{}');
        } catch {
            return res.status(400).json({ error: 'INVALID_JSON', message: 'Webhook body must be JSON.' });
        }
        const { handlePayFacWebhook } = await import('./payfacWebhook.js');
        return handlePayFacWebhook(req, res, next);
    }
);

app.use(express.json());

async function withCheckout(methodName, req, res, next) {
    const checkout = await import('./guestCheckout.js');
    return checkout[methodName](req, res, next);
}

app.options('/api/guest/checkout/:token', (req, res, next) => withCheckout('allowPublicCheckoutCors', req, res, next));
app.get('/api/guest/checkout/:token', (req, res, next) => withCheckout('allowPublicCheckoutCors', req, res, next), (req, res, next) => withCheckout('getGuestCheckout', req, res, next));
app.post('/api/guest/checkout/:token', (req, res, next) => withCheckout('allowPublicCheckoutCors', req, res, next), (req, res, next) => withCheckout('confirmGuestCheckout', req, res, next));
app.options('/api/checkout/:token', (req, res, next) => withCheckout('allowPublicCheckoutCors', req, res, next));
app.get('/api/checkout/:token', (req, res, next) => withCheckout('allowPublicCheckoutCors', req, res, next), (req, res, next) => withCheckout('getGuestCheckout', req, res, next));
app.post('/api/checkout/:token', (req, res, next) => withCheckout('allowPublicCheckoutCors', req, res, next), (req, res, next) => withCheckout('confirmGuestCheckout', req, res, next));
app.post('/api/guest/mailbox/publish', (req, res, next) => withCheckout('publishGuestMailbox', req, res, next));
app.post('/api/guest/mailbox/charge', async (req, res) => {
    try {
        const { startMailboxCardCharge } = await import('./checkoutMailbox.js');
        const charged = await startMailboxCardCharge(req.body);
        return res.json(charged);
    } catch (err) {
        return res.status(err.status || 502).json({ error: err.message || 'CHARGE_START_FAILED' });
    }
});
app.get('/api/guest-by-phone', async (req, res) => {
    const { getGuestByPhone } = await import('./guestContext.js');
    return getGuestByPhone(req, res);
});
app.post('/api/guest-context-push', async (req, res) => {
    const { pushGuestContextNow } = await import('./guestContext.js');
    return pushGuestContextNow(req, res);
});
app.get('/api/agent-locks', async (req, res) => {
    const { getAgentLocks } = await import('./agentLocks.js');
    return getAgentLocks(req, res);
});

app.post('/api/auth/login', loginStaff);
app.get('/api/auth/me', getStaffMe);
app.post('/api/auth/logout', logoutStaff);
app.get('/api/auth/staff', listStaff);
app.get('/api/auth/tracker', getSharedTrackerDoc);
app.put('/api/auth/tracker', saveSharedTrackerDoc);
app.get('/api/auth/staff/:id/password', revealStaffPassword);
app.get('/api/auth/attendance/settings', getAttendanceSettings);
app.put('/api/auth/attendance/settings', setAttendanceSettings);
app.get('/api/auth/agents', listAgents);
app.post('/api/auth/agents', upsertAgent);
app.post('/api/auth/agents/:id/deactivate', deactivateAgent);
app.post('/api/auth/staff', createStaff);
app.patch('/api/auth/staff/:id', updateStaff);
app.post('/api/auth/staff/:id/deactivate', deactivateStaff);

function sendFinanceError(res, err) {
  const status = Number(err.status) || 502;
  if (status >= 500) console.error('[open-finance]', err.message);
  res.status(status).json({ error: err.message || 'OPEN_FINANCE_FAILED' });
}

app.get('/api/finance/overview', requireManagerStaff, async (req, res) => {
  try {
    const { getFinanceOverview } = await import('./openFinance.js');
    res.json(await getFinanceOverview());
  } catch (err) {
    sendFinanceError(res, err);
  }
});

app.get('/api/finance/transactions', requireManagerStaff, async (req, res) => {
  try {
    const { getFinanceTransactions } = await import('./openFinance.js');
    res.json(await getFinanceTransactions({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      accountId: req.query.accountId,
      connectionId: req.query.connectionId,
      providerId: req.query.providerId,
      nextPage: req.query.nextPage,
      limit: Number(req.query.limit || 40)
    }));
  } catch (err) {
    sendFinanceError(res, err);
  }
});

app.post('/api/finance/refresh', requireManagerStaff, async (req, res) => {
  try {
    const { refreshFinanceConnections } = await import('./openFinance.js');
    res.json(await refreshFinanceConnections());
  } catch (err) {
    sendFinanceError(res, err);
  }
});

app.get('/api/finance/scrape/status', requireManagerStaff, async (req, res) => {
  const { bankScraperStatus } = await import('./bankScrapers.js');
  res.json(bankScraperStatus());
});

app.post('/api/finance/scrape/otp', requireManagerStaff, async (req, res) => {
  const { submitBankScraperOtp } = await import('./bankScrapers.js');
  const accepted = submitBankScraperOtp(req.body?.code);
  res.json({ ok: accepted });
});

app.post('/api/finance/scrape', requireManagerStaff, async (req, res) => {
  req.setTimeout(240000);
  res.setTimeout(240000);
  try {
    const { scrapeConfiguredBanks } = await import('./bankScrapers.js');
    const startDate = req.body?.startDate ? new Date(req.body.startDate) : undefined;
    res.json(await scrapeConfiguredBanks({ startDate }));
  } catch (err) {
    const status = Number(err.status) || 502;
    res.status(status).json({ error: err.message || 'SCRAPE_FAILED', results: err.body?.results || null });
  }
});

app.get('/api/sms/credit', requireStaff, async (req, res) => {
  try {
    const { fetchMicropayCredit } = await import('./micropaySms.js');
    res.json(await fetchMicropayCredit());
  } catch (err) {
    res.status(Number(err.status) || 502).json({ error: err.message || 'SMS_CREDIT_FAILED', description: err.description });
  }
});

app.post('/api/sms/send', requireStaff, async (req, res) => {
  try {
    const { sendMicropaySms } = await import('./micropaySms.js');
    res.json(await sendMicropaySms({
      phone: req.body?.phone,
      message: req.body?.message
    }));
  } catch (err) {
    res.status(Number(err.status) || 502).json({ error: err.message || 'SMS_SEND_FAILED', description: err.description });
  }
});

app.get('/api/kinorot/sync', requireManagerStaff, async (req, res) => {
  try {
    const { readKinorotSyncStatus } = await import('./kinorotSyncControl.js');
    res.json(readKinorotSyncStatus());
  } catch (err) {
    res.status(502).json({ error: err.message || 'KINOROT_STATUS_FAILED' });
  }
});

app.post('/api/kinorot/sync', requireManagerStaff, async (req, res) => {
  try {
    const { startKinorotSync } = await import('./kinorotSyncControl.js');
    res.status(202).json(startKinorotSync());
  } catch (err) {
    res.status(502).json({ error: err.message || 'KINOROT_SYNC_FAILED' });
  }
});

app.post('/api/finance/hyp/sync', requireManagerStaff, async (req, res) => {
  try {
    const { syncHypPayments } = await import('./hypSync.js');
    res.json(await syncHypPayments({
      from: req.body?.from,
      to: req.body?.to
    }));
  } catch (err) {
    const status = err.status || (err.code === 'HYP_MISSING_CREDS' ? 503 : 502);
    res.status(status).json({ error: err.code || err.message || 'HYP_SYNC_FAILED' });
  }
});

function requireAttendanceKey(req, res, next) {
    const expected = process.env.ATTENDANCE_API_KEY;
    if (!expected) {
        return res.status(503).json({ error: 'Attendance bridge is not configured' });
    }
    const provided = req.get('x-hotelos-key') || String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!provided || provided !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

app.post('/api/attendance/toggle', requireAttendanceKey, async (req, res) => {
    const { action } = req.body;
    if (action !== 'in' && action !== 'out') {
        return res.status(400).json({ error: 'action must be in or out' });
    }
    console.log(`Received attendance toggle instruction: ${action}`);

    try {
        const { toggleClock } = await import('./attendance.js');
        const result = await toggleClock(action);
        if (result.success) {
            res.json(result);
        } else {
            console.error(`Failed to clock ${action}: ${result.error}`);
            res.status(500).json({ error: 'Attendance clock failed', ...result });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Attendance clock failed' });
    }
});

const PORT = Number(process.env.HOTELOS_BIND_PORT) || 4038;
const BIND_HOST = process.env.HOTELOS_BIND_HOST || '127.0.0.1';
app.listen(PORT, BIND_HOST, () => {
    console.log(`ResortOS bridge listening on ${BIND_HOST}:${PORT}`);
    import('./guestCheckout.js')
        .then((checkout) => checkout.startCheckoutMailboxPoller())
        .catch((err) => console.warn('[checkout mailbox]', err.message));
    import('./guestContext.js')
        .then((guest) => guest.startGuestContextSync())
        .catch((err) => console.warn('[guest-context]', err.message));
});
