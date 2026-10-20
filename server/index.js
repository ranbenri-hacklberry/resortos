import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createStaff, deactivateAgent, deactivateStaff, getAttendanceSettings, getSharedTrackerDoc, getStaffMe, listAgents, listStaff, listStaffDirectory, loginStaff, logoutStaff, requireManagerStaff, requireStaff, revealStaffPassword, saveSharedTrackerDoc, setAttendanceSettings, updateStaff, upsertAgent } from './auth.js';
import { tryHandleOps } from './opsGateway.js';
import { tryHandleClimate } from './climateGateway.js';
import { tryHandleNetwork } from './routerGateway.js';
import { tryHandleAssetBeacons } from './assetBeaconWatch.js';

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
app.use(async (req, res, next) => {
    try {
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

app.get('/api/guest-comms', requireStaff, async (req, res) => {
  const { handleListGuestComms } = await import('./guestComms.js');
  return handleListGuestComms(req, res);
});

app.post('/api/guest-comms/send', requireStaff, async (req, res) => {
  const { handleSendGuestComm } = await import('./guestComms.js');
  return handleSendGuestComm(req, res);
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
      checked_out_at: req.body?.checked_out_at
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
    import('./guestContext.js')
        .then((guest) => guest.startGuestContextSync())
        .catch((err) => console.warn('[guest-context]', err.message));
});
