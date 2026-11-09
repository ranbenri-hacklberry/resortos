import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createStaff, deactivateAgent, deactivateStaff, getAttendanceSettings, getSharedTrackerDoc, getStaffMe, listAgents, listStaff, listStaffDirectory, loginStaff, logoutStaff, requireManagerStaff, requireStaff, revealStaffPassword, saveSharedTrackerDoc, setAttendanceSettings, updateStaff, upsertAgent } from './auth.js';
import { tryHandleOps } from './opsGateway.js';
import { tryHandleMcp } from './mcpHttp.js';
import { tryHandleGoogleContacts } from './googleContactsHttp.js';
import { tryHandleClimate } from './climateGateway.js';
import { tryHandleNetwork } from './routerGateway.js';
import { tryHandleAssetBeacons } from './assetBeaconWatch.js';
import { registerInventoryRoutes } from './inventoryGateway.js';
import { registerExpenseRoutes } from './expenses.js';

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

async function allowStaffOrPrivate(req, res, next) {
    try {
        const { staffFromRequest } = await import('./auth.js');
        const user = await staffFromRequest(req);
        if (user) {
            req.staffUser = user;
            return next();
        }
    } catch {}

    // Dashboard / Pages ops bridge: mailbox secret, desk pin, or signed dashboard session.
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const mailboxHeader = String(req.headers['x-hotelos-mailbox'] || '').trim();
    const bridgeHeader = String(req.headers['x-hotelos-bridge-secret'] || '').trim();
    const mailboxSecret = String(process.env.CHECKOUT_MAILBOX_SECRET || '').trim();
    const bridgeSecret = String(process.env.HOTELOS_API_SECRET || '').trim();
    if ((mailboxSecret && (mailboxHeader === mailboxSecret || token === mailboxSecret))
      || (bridgeSecret && bridgeHeader === bridgeSecret)) {
      req.staffUser = { username: 'dashboard', role: 'MANAGER', name: 'דשבורד' };
      return next();
    }
    if (token && token.includes('.') && mailboxSecret) {
      try {
        const crypto = await import('node:crypto');
        const [encoded, sig] = token.split('.');
        const expected = crypto.createHmac('sha256', mailboxSecret).update(encoded).digest('hex');
        if (sig === expected) {
          const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
          if (payload?.exp && Number(payload.exp) > Date.now()) {
            req.staffUser = {
              username: payload.username || 'dashboard',
              role: payload.role || 'MANAGER',
              name: payload.display_name || payload.username || 'דשבורד'
            };
            return next();
          }
        }
      } catch {}
    }

    const hostOrOrigin = String(req.headers.origin || req.headers.host || '');
    const cleanHost = hostOrOrigin.replace(/^https?:\/\//, '').split(':')[0];
    if (isPrivateOrigin(cleanHost ? `http://${cleanHost}` : '')) {
        req.staffUser = { username: 'manager', role: 'MANAGER', name: 'מנהל' };
        return next();
    }
    return res.status(401).json({ error: 'UNAUTHORIZED' });
}

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
app.use(async (req, res, next) => {
    try {
        if (await tryHandleMcp(req, res)) return;
        if (await tryHandleGoogleContacts(req, res)) return;
        if (await tryHandleClimate(req, res)) return;
        if (await tryHandleNetwork(req, res)) return;
        if (await tryHandleAssetBeacons(req, res)) return;
        if (await tryHandleOps(req, res)) return;
    } catch (err) {
        res.status(500).json({ error: err.message || 'OPS_FAILED' });
        return;
    }
    next();
});

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
app.post('/api/guest/mailbox/charge-result', async (req, res) => {
    try {
        const { confirmMailboxCardCharge } = await import('./checkoutMailbox.js');
        const result = await confirmMailboxCardCharge(req.body || {});
        return res.json(result);
    } catch (err) {
        return res.status(err.status || 502).json({ error: err.message || 'CHARGE_RESULT_FAILED' });
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
app.get('/api/auth/staff-directory', listStaffDirectory);
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
app.post('/api/auth/staff/:id/outbound', async (req, res) => {
  const { setOutboundCalls } = await import('./auth.js');
  return setOutboundCalls(req, res);
});
app.post('/api/auth/staff/:id/deactivate', deactivateStaff);

function sendFinanceError(res, err) {
  const status = Number(err.status) || 502;
  if (status >= 500) console.error('[open-finance]', err.message);
  res.status(status).json({ error: err.message || 'OPEN_FINANCE_FAILED' });
}

app.get('/api/priority/meetings', requireManagerStaff, async (req, res) => {
  try {
    const { getManagerCalendar } = await import('./managerMeetings.js');
    res.json(getManagerCalendar());
  } catch (err) {
    res.status(Number(err.status) || 500).json({ error: err.message || 'MEETINGS_FAILED' });
  }
});

app.post('/api/priority/meetings', requireManagerStaff, async (req, res) => {
  try {
    const { addConfirmedMeeting, addProposedMeeting } = await import('./managerMeetings.js');
    const meetings = Array.isArray(req.body?.slots) && req.body.slots.length
      ? addProposedMeeting(req.body)
      : addConfirmedMeeting(req.body);
    res.json({ meetings });
  } catch (err) {
    res.status(Number(err.status) || 500).json({ error: err.message || 'MEETING_SAVE_FAILED' });
  }
});

app.post('/api/priority/meetings/:id/vote', requireManagerStaff, async (req, res) => {
  try {
    const { castMeetingVote } = await import('./managerMeetings.js');
    const meetings = castMeetingVote({
      id: req.params.id,
      person: req.body?.person,
      date: req.body?.date,
      time: req.body?.time,
      vote: req.body?.vote
    });
    res.json({ meetings });
  } catch (err) {
    res.status(Number(err.status) || 500).json({ error: err.message || 'MEETING_VOTE_FAILED' });
  }
});

app.post('/api/priority/meetings/:id/status', requireManagerStaff, async (req, res) => {
  try {
    const { updateMeetingStatus } = await import('./managerMeetings.js');
    res.json({ meetings: updateMeetingStatus(req.params.id, req.body?.status) });
  } catch (err) {
    res.status(Number(err.status) || 500).json({ error: err.message || 'MEETING_STATUS_FAILED' });
  }
});

app.get('/api/priority/grounds', requireManagerStaff, async (req, res) => {
  try {
    const { readGrounds } = await import('./groundsStatus.js');
    res.json({ assets: readGrounds() });
  } catch (err) {
    res.status(Number(err.status) || 500).json({ error: err.message || 'GROUNDS_FAILED' });
  }
});

app.post('/api/priority/grounds', requireManagerStaff, async (req, res) => {
  try {
    const { setGroundStatus } = await import('./groundsStatus.js');
    const assets = setGroundStatus({
      id: req.body?.id,
      status: req.body?.status,
      by: req.body?.by || req.staff?.display_name || req.staff?.username || 'משרד',
      note: req.body?.note
    });
    res.json({ assets, asset: assets[req.body?.id] || null });
  } catch (err) {
    res.status(Number(err.status) || 500).json({ error: err.message || 'GROUNDS_SAVE_FAILED' });
  }
});

app.get('/api/priority/docs', requireManagerStaff, async (req, res) => {
  try {
    const { readPriorityDocs } = await import('./priorityDocs.js');
    res.json({ docs: readPriorityDocs() });
  } catch (err) {
    res.status(Number(err.status) || 500).json({ error: err.message || 'DOCS_FAILED' });
  }
});

app.put('/api/priority/docs', requireManagerStaff, async (req, res) => {
  try {
    const { writePriorityDocs } = await import('./priorityDocs.js');
    res.json({ docs: writePriorityDocs(req.body?.docs) });
  } catch (err) {
    res.status(Number(err.status) || 500).json({ error: err.message || 'DOCS_SAVE_FAILED' });
  }
});

app.get('/api/priority/cashflow', requireManagerStaff, async (req, res) => {
  try {
    const { getExpenseCashflow } = await import('./expenseCashflow.js');
    res.json(getExpenseCashflow());
  } catch (err) {
    res.status(Number(err.status) || 500).json({ error: err.message || 'CASHFLOW_FAILED' });
  }
});

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

function requireManagerOrLocal(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  const auth = String(req.get('authorization') || '');
  if (isLocal && (req.get('x-resortos-agent') || auth.startsWith('Bearer ros_agent_'))) {
    req.staffUser = { id: 'agent_chloe', username: 'chloe', role: 'MANAGER' };
    return next();
  }
  return requireManagerStaff(req, res, next);
}

// Inventory API (manager staff, or Chloe from localhost). Ran 2026-10-20; restored 2026-10-21.
registerInventoryRoutes(app, requireManagerOrLocal);
// Supplier expenses (Ran 2026-10-21): own file store data/expenses.jsonl, separate from cash-flow manual entries.
registerExpenseRoutes(app, requireManagerOrLocal);

// FINANCIAL COMMAND CENTER API
app.get('/api/finance/command-center', requireManagerOrLocal, async (req, res) => {
  try {
    const fcc = await import('./financialCommandCenter.js');
    res.json({
      checks: fcc.getChecksData().checks,
      settings: fcc.getFinanceSettings(),
      manualEntries: fcc.getManualEntries(),
      auditHistory: fcc.getCheckAuditHistory()
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'COMMAND_CENTER_FETCH_FAILED' });
  }
});

app.get('/api/finance/settings', requireManagerOrLocal, async (req, res) => {
  try {
    const fcc = await import('./financialCommandCenter.js');
    res.json(fcc.getFinanceSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/finance/settings', requireManagerOrLocal, async (req, res) => {
  try {
    const fcc = await import('./financialCommandCenter.js');
    res.json(fcc.saveFinanceSettings(req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/finance/manual-entries', requireManagerOrLocal, async (req, res) => {
  try {
    const fcc = await import('./financialCommandCenter.js');
    res.json(fcc.getManualEntries());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/finance/manual-entries', requireManagerOrLocal, async (req, res) => {
  try {
    const fcc = await import('./financialCommandCenter.js');
    res.json(fcc.addManualEntry(req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/finance/manual-entries/:id', requireManagerOrLocal, async (req, res) => {
  try {
    const fcc = await import('./financialCommandCenter.js');
    res.json(fcc.deleteManualEntry(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/finance/checks/capture', requireManagerOrLocal, async (req, res) => {
  try {
    const fcc = await import('./financialCommandCenter.js');
    const result = await fcc.captureCheck({
      imageBase64: req.body?.image,
      imageName: req.body?.imageName,
      manualFields: req.body?.fields,
      capturedBy: req.staffUser?.username || 'owner'
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/finance/checks/confirm', requireManagerOrLocal, async (req, res) => {
  try {
    const fcc = await import('./financialCommandCenter.js');
    const result = fcc.confirmCheckCapture(req.body?.captureId, req.staffUser?.username || 'owner', req.body?.overrides);
    res.json(result);
  } catch (err) {
    res.status(Number(err.status) || 500).json({ error: err.message });
  }
});

app.get('/api/finance/checks/audit', requireManagerOrLocal, async (req, res) => {
  try {
    const fcc = await import('./financialCommandCenter.js');
    res.json(fcc.getCheckAuditHistory());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/finance/alerts/whatsapp', requireManagerOrLocal, async (req, res) => {
  try {
    const { phone, message } = req.body || {};
    const agentUrl = process.env.RESORTOS_AGENT_URL || 'http://127.0.0.1:8787';
    let dispatched = false;
    try {
      const resp = await fetch(`${agentUrl}/api/alerts/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone || '972506983399', message })
      });
      if (resp.ok) dispatched = true;
    } catch (_) {}
    res.json({ ok: true, dispatched, target: phone || '972506983399' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

app.get('/api/guest-comms', allowStaffOrPrivate, async (req, res) => {
  const { handleListGuestComms } = await import('./guestComms.js');
  return handleListGuestComms(req, res);
});

app.post('/api/guest-comms/send', allowStaffOrPrivate, async (req, res) => {
  const { handleSendGuestComm } = await import('./guestComms.js');
  return handleSendGuestComm(req, res);
});

app.get('/api/guest-comms/automation-state', allowStaffOrPrivate, async (req, res) => {
  const { getChatAutomationState } = await import('./guestComms.js');
  try {
    const state = await getChatAutomationState({
      channelId: req.query?.channel_id || req.query?.channel || 'resortos',
      phone: req.query?.phone,
      bookingId: req.query?.booking_id,
    });
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/guest-comms/automation-state', allowStaffOrPrivate, async (req, res) => {
  const { setChatAutomationState } = await import('./guestComms.js');
  try {
    const result = await setChatAutomationState({
      channelId: req.body?.channel_id || 'resortos',
      phone: req.body?.phone,
      bookingId: req.body?.booking_id,
      botDisabled: Boolean(req.body?.bot_disabled),
      reason: req.body?.reason || 'manager_toggle',
      updatedBy: req.staffUser?.username || req.staff?.username || req.staff?.name || 'manager',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/guest-comms/unread-summary', allowStaffOrPrivate, async (_req, res) => {
  const { getUnreadCommsSummary } = await import('./guestComms.js');
  try {
    res.json(await getUnreadCommsSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/guest-comms/mark-read', allowStaffOrPrivate, async (req, res) => {
  const { markGuestCommsRead } = await import('./guestComms.js');
  try {
    const result = await markGuestCommsRead({
      messageIds: req.body?.message_ids,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ops/stay-status', requireStaff, async (req, res) => {
  const { handleStayStatus } = await import('./guestComms.js');
  return handleStayStatus(req, res);
});

app.get('/api/ops/call-me', requireStaff, async (_req, res) => {
  const { openGuestCalls } = await import('./callMe.js');
  res.json({ calls: openGuestCalls() });
});

app.post('/api/ops/call-me/request', requireStaff, async (req, res) => {
  try {
    const { createLocalGuestCall } = await import('./callMe.js');
    const call = await createLocalGuestCall({
      bookingId: req.body?.booking_id,
      unitId: req.body?.unit_id,
      guestName: req.body?.guest_name,
      guestPhone: req.body?.guest_phone,
      cabin: req.body?.cabin
    });
    res.json({ ok: true, call });
  } catch (err) {
    res.status(Number(err.status) || 502).json({ error: err.message || 'CALL_REQUEST_FAILED' });
  }
});

app.post('/api/ops/call-me/ack', requireStaff, async (req, res) => {
  try {
    const { confirmGuestCall } = await import('./callMe.js');
    res.json({ ok: true, call: await confirmGuestCall(req.body?.token) });
  } catch (err) {
    res.status(Number(err.status) || 502).json({ error: err.message || 'CALL_ACK_FAILED' });
  }
});

app.post('/api/ops/call-me/transfer', requireStaff, async (req, res) => {
  try {
    const { transferGuestCall } = await import('./callMe.js');
    res.json({ ok: true, call: await transferGuestCall(req.body?.token, req.body?.to) });
  } catch (err) {
    res.status(Number(err.status) || 502).json({ error: err.message || 'CALL_TRANSFER_FAILED' });
  }
});

app.get('/api/ops/cardcom-terminal/pending', requireStaff, async (_req, res) => {
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.join(process.cwd(), 'data', 'cardcom-pending-matches.json');
    let pending = [];
    let recentlyApproved = [];
    if (fs.existsSync(file)) {
      try {
        const all = JSON.parse(fs.readFileSync(file, 'utf8'));
        const list = Array.isArray(all) ? all : [];
        const { filterUnassignedPendingMatches } = await import('../functions/lib/cardcomPendingFilter.js');
        pending = filterUnassignedPendingMatches(list);
        const twoDaysAgo = Date.now() - 48 * 3600 * 1000;
        recentlyApproved = list
          .filter((m) => (m.status === 'approved' || m.status === 'manual_linked') && (
            !m.approved_at || new Date(m.approved_at).getTime() >= twoDaysAgo
          ))
          .sort((a, b) => new Date(b.approved_at || b.deal_time || 0) - new Date(a.approved_at || a.deal_time || 0))
          .slice(0, 15);
      } catch {}
    }
    res.json({ ok: true, pending, recently_approved: recentlyApproved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/ops/cardcom-terminal/suggestions', '/api/ops/cardcom-terminal/candidates', '/api/ops/suggestions', '/api/ops/candidates'], requireStaff, async (req, res) => {
  try {
    const { suggestBookingsForDeal } = await import('../functions/lib/cardcomSuggestions.js');
    const dealId = req.query?.deal_id || req.query?.dealId;
    const amount = Number(req.query?.amount);
    const dealTime = req.query?.deal_time || req.query?.date;
    const payerName = req.query?.payer_name || req.query?.name || '';
    const query = req.query?.q || '';

    const deal = {
      dealId,
      deal_id: dealId,
      amount,
      dealTime,
      deal_time: dealTime,
      payer_name: payerName,
      cardOwnerName: payerName
    };

    let bookings = [];
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        const bRes = await fetch(`${supabaseUrl}/rest/v1/hotelos_bookings?booking_status=neq.CANCELED&order=check_in_date.desc&limit=1000`, {
          headers: { apikey: supabaseKey, authorization: `Bearer ${supabaseKey}` }
        });
        const rows = await bRes.json();
        if (Array.isArray(rows)) bookings = rows;
      } catch (_) {}
    }
    const candidates = suggestBookingsForDeal(deal, bookings, { query, limit: 10 });
    res.json({ ok: true, candidates, suggestions: candidates });
  } catch (err) {
    res.status(500).json({ error: err.message || 'FAILED_TO_GET_SUGGESTIONS' });
  }
});

app.post('/api/ops/cardcom-terminal/link', requireStaff, async (req, res) => {
  try {
    const { deal_id, booking_id } = req.body || {};
    if (!deal_id || !booking_id) {
      return res.status(400).json({ error: 'MISSING_DEAL_OR_BOOKING_ID' });
    }
    const {
      recordCardcomTerminalPayment,
      createCardcomInvoiceForDeal
    } = await import('./lib/cardcomTerminalService.js');

    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.join(process.cwd(), 'data', 'cardcom-pending-matches.json');
    let allMatches = [];
    if (fs.existsSync(file)) {
      try { allMatches = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    }
    const match = allMatches.find((m) => m.deal_id === deal_id);
    if (!match) {
      return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
    }

    let booking = null;
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      const bRes = await fetch(`${supabaseUrl}/rest/v1/hotelos_bookings?id=eq.${encodeURIComponent(booking_id)}`, {
        headers: { apikey: supabaseKey, authorization: `Bearer ${supabaseKey}` }
      });
      const rows = await bRes.json();
      if (Array.isArray(rows) && rows[0]) booking = rows[0];
    }

    if (!booking) {
      return res.status(404).json({ error: 'BOOKING_NOT_FOUND' });
    }

    let invoiceInfo = null;
    const existingPaymentForDeal = (booking.clearing_payments || []).find(
      (p) => String(p.deal_number || p.txn || '').trim() === String(deal_id).trim()
    );
    const existingDocNumber = String(
      match.document_number ||
      match.invoice_number ||
      existingPaymentForDeal?.invoice ||
      existingPaymentForDeal?.document_number ||
      ''
    ).trim();

    if (existingDocNumber) {
      invoiceInfo = {
        documentNumber: existingDocNumber,
        documentUrl: match.document_url || match.invoice_url || existingPaymentForDeal?.document_url || '',
        isExisting: true
      };
      match.invoice_number = existingDocNumber;
    } else {
      const apiName = process.env.CARDCOM_API_NAME;
      const apiPassword = process.env.CARDCOM_API_PASSWORD;
      if (apiName && apiPassword) {
        try {
          invoiceInfo = await createCardcomInvoiceForDeal({
            dealId: deal_id,
            amount: match.amount,
            booking,
            apiName,
            apiPassword
          });
          match.invoice_number = invoiceInfo.documentNumber;
          match.invoice_url = invoiceInfo.documentUrl;
        } catch (err) {
          console.warn('[Cardcom Manual Link] Invoice error:', err.message);
        }
      }
    }

    const deal = {
      dealId: match.deal_id,
      amount: match.amount,
      amountAgorot: Math.round(match.amount * 100),
      approval: match.approval,
      last4: match.last4,
      cardOwnerName: match.payer_name,
      dealTime: match.deal_time
    };

    const { booking: updatedBooking, paymentEntry } = recordCardcomTerminalPayment(booking, deal, invoiceInfo || {});

    if (supabaseUrl && supabaseKey) {
      await fetch(`${supabaseUrl}/rest/v1/hotelos_bookings?id=eq.${encodeURIComponent(booking_id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          authorization: `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({
          clearing_payments: updatedBooking.clearing_payments,
          payment_status: updatedBooking.payment_status,
          payment_mode: updatedBooking.payment_mode
        })
      });
    }

    match.status = 'manual_linked';
    match.selected_booking_id = booking_id;
    match.approved_at = new Date().toISOString();
    match.payment_recorded_at = new Date().toISOString();
    match.guest_name = booking.guest_name || booking.invoice_name || match.guest_name || '';
    match.unit_name = booking.unit_name || booking.unit_id || match.unit_name || '';

    fs.writeFileSync(file, JSON.stringify(allMatches, null, 2), 'utf8');

    res.json({ ok: true, booking: updatedBooking, invoice: invoiceInfo, payment: paymentEntry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ops/cardcom-terminal/ignore', requireStaff, async (req, res) => {
  try {
    const { deal_id } = req.body || {};
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.join(process.cwd(), 'data', 'cardcom-pending-matches.json');
    if (fs.existsSync(file)) {
      const allMatches = JSON.parse(fs.readFileSync(file, 'utf8'));
      const match = allMatches.find((m) => m.deal_id === deal_id);
      if (match) {
        match.status = 'ignored';
        match.updated_at = new Date().toISOString();
        fs.writeFileSync(file, JSON.stringify(allMatches, null, 2), 'utf8');
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ops/cardcom-terminal/send-invoice-whatsapp', allowStaffOrPrivate, async (req, res) => {
  try {
    const bookingId = String(req.body?.booking_id || '').trim();
    const dealId = String(req.body?.deal_id || '').trim();
    let invoiceUrl = String(req.body?.invoice_url || req.body?.document_url || '').trim();
    let invoiceNumber = String(req.body?.invoice_number || req.body?.document_number || '').trim();
    if (!bookingId) return res.status(400).json({ error: 'MISSING_BOOKING_ID', message: 'Missing booking_id' });

    const { studioRest } = await import('./guestComms.js');
    const rows = await studioRest(
      `hotelos_bookings?id=eq.${encodeURIComponent(bookingId)}&select=id,guest_name,guest_phone,unit_id,unit_name&limit=1`
    );
    const booking = Array.isArray(rows) ? rows[0] : null;
    if (!booking) return res.status(404).json({ error: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
    const phone = String(booking.guest_phone || req.body?.phone || '').trim();
    if (!phone) return res.status(400).json({ error: 'MISSING_GUEST_PHONE', message: 'אין טלפון אורח בהזמנה' });

    if (!invoiceUrl && dealId) {
      try {
        const mrows = await studioRest(
          `cardcom_pending_matches?deal_id=eq.${encodeURIComponent(dealId)}&select=invoice_url,document_url,invoice_number,document_number&limit=1`
        );
        const m = Array.isArray(mrows) ? mrows[0] : null;
        if (m) {
          invoiceUrl = String(m.invoice_url || m.document_url || '').trim();
          if (!invoiceNumber) invoiceNumber = String(m.invoice_number || m.document_number || '').trim();
        }
      } catch (_) {}
    }
    if (!invoiceUrl) return res.status(400).json({ error: 'MISSING_INVOICE_URL', message: 'אין קישור חשבונית לשליחה' });

    const { formatGuestInvoiceDeliveryMessage } = await import('./lib/cardcomTerminalService.js');
    const message = formatGuestInvoiceDeliveryMessage(
      invoiceUrl,
      invoiceNumber,
      booking.unit_name || booking.unit_id || ''
    );

    // Reuse Chloe WhatsApp path (no auto-send — this handler only runs on explicit click).
    req.body = {
      booking_id: bookingId,
      phone,
      channel: 'whatsapp',
      message,
      kind: 'cardcom_invoice_link',
      deal_id: dealId || undefined
    };
    const { handleSendGuestComm } = await import('./guestComms.js');
    return handleSendGuestComm(req, res);
  } catch (err) {
    return res.status(500).json({ error: 'WHATSAPP_SEND_FAILED', message: err?.message || 'send failed' });
  }
});


app.get('/api/internal/staff', async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || '';
  const local = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!local) return res.status(403).json({ error: 'FORBIDDEN' });
  try {
    const { listAgentStaff } = await import('./agentStaff.js');
    res.json({ staff: listAgentStaff() });
  } catch (err) {
    res.status(503).json({ error: err.message || 'STAFF_UNAVAILABLE' });
  }
});

app.post('/api/internal/call-me/reply', async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || '';
  const local = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!local) return res.status(403).json({ error: 'FORBIDDEN' });
  try {
    const { replyFromWhatsApp } = await import('./callMe.js');
    res.json(await replyFromWhatsApp(req.body?.phone, req.body?.text));
  } catch (err) {
    res.status(502).json({ error: err.message || 'CALL_REPLY_FAILED' });
  }
});

app.post('/api/guest/self-checkout-effects', async (req, res) => {
  try {
    const secret = String(process.env.CHECKOUT_MAILBOX_SECRET || '').trim();
    const provided = String(req.headers['x-hotelos-mailbox'] || '').trim();
    if (!secret || provided !== secret) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    const booking = {
      id: req.body?.booking_id,
      unit_id: req.body?.unit_id,
      guest_phone: req.body?.guest_phone,
      tenant_id: req.body?.tenant_id,
      checkout_token: req.body?.checkout_token,
      checked_out_at: req.body?.checked_out_at,
      checkout_source: req.body?.source === 'guest_message' ? 'guest_message' : undefined
    };
    if (!booking.id) return res.status(400).json({ error: 'BOOKING_REQUIRED' });
    const { handleSelfCheckoutSideEffects } = await import('./guestComms.js');
    await handleSelfCheckoutSideEffects(booking);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[self-checkout-effects]', err.message);
    return res.status(err.status || 500).json({ error: err.message || 'EFFECTS_FAILED' });
  }
});


app.get('/api/kinorot/audit', requireManagerStaff, async (req, res) => {
  try {
    const { listKinorotAudit } = await import('./kinorotAuditLog.js');
    const { displayAuditRow } = await import('../src/lib/kinorotAudit.js');
    const rows = await listKinorotAudit({
      resId: req.query.res_id,
      bookingId: req.query.booking_id,
      guestName: req.query.guest,
      limit: req.query.limit
    });
    const safe = (Array.isArray(rows) ? rows : []).map((row) => {
      const shown = displayAuditRow(row);
      return {
        id: row.id,
        ts: shown.ts,
        actor: shown.actor,
        action: shown.action,
        guest_name: shown.guest_name,
        unit_id: row.unit_id || null,
        unit_name: shown.unit_name || null,
        check_in_date: row.check_in_date || null,
        check_out_date: row.check_out_date || null,
        dates: shown.dates,
        success: shown.success,
        error: shown.error,
        source: shown.source,
        request_diff: row.request_diff || null
      };
    });
    res.json({ rows: safe });
  } catch (err) {
    res.status(502).json({ error: err.message || 'KINOROT_AUDIT_FAILED' });
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
    res.status(202).json(startKinorotSync({
      mode: req.body?.mode,
      days: req.body?.days,
      backDays: req.body?.backDays,
      boardDays: req.body?.boardDays
    }));
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

app.get('/api/channex/status', allowStaffOrPrivate, async (req, res) => {
  try {
    const { getChannexStatus } = await import('./channexService.js');
    res.json(await getChannexStatus());
  } catch (err) {
    res.status(502).json({ error: err.message || 'CHANNEX_STATUS_FAILED' });
  }
});

app.post('/api/channex/sync', allowStaffOrPrivate, async (req, res) => {
  try {
    const { syncChannexOffice } = await import('./channexService.js');
    res.json(await syncChannexOffice());
  } catch (err) {
    res.status(502).json({ error: err.message || 'CHANNEX_SYNC_FAILED' });
  }
});

const channexWebhookHandler = async (req, res) => {
  try {
    const { handleChannexWebhook } = await import('./channexService.js');
    const result = await handleChannexWebhook(req.body);
    res.status(200).json(result);
  } catch (err) {
    console.error('[channex webhook error]', err);
    res.status(200).json({ ok: false, error: err.message });
  }
};

app.post('/api/webhooks/channex', channexWebhookHandler);
app.post('/webhooks/channex', channexWebhookHandler);

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
    import('./callMe.js')
        .then((calls) => calls.startGuestCallPoller())
        .catch((err) => console.warn('[call-me]', err.message));
    import('./roomCheckoutLog.js')
        .then((m) => m.startCheckoutRoomLogPoller())
        .catch((err) => console.warn('[checkout room-log]', err.message));
    import('./guestContext.js')
        .then((guest) => guest.startGuestContextSync())
        .catch((err) => console.warn('[guest-context]', err.message));
});
