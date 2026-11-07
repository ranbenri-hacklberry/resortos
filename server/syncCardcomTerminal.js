import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchCardcomTransactions,
  rankCandidateBookings,
  formatRanApprovalPrompt,
  DEFAULT_CARDCOM_TERMINAL,
  defaultRateLimiter,
  RAN_PRIVATE_PHONE_DIGITS
} from './lib/cardcomTerminalService.js';

// Load .env if present
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
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

export function isPollerEnabled() {
  return process.env.CARDCOM_TERMINAL_SYNC_ENABLED === 'true' || process.env.CARDCOM_TERMINAL_SYNC_ENABLED === '1';
}

const LOCAL_STORE_DIR = path.join(__dirname, '..', 'data');
const LOCAL_SEEN_FILE = path.join(LOCAL_STORE_DIR, 'cardcom-seen-deals.json');
const LOCAL_PENDING_FILE = path.join(LOCAL_STORE_DIR, 'cardcom-pending-matches.json');

function ensureDataDir() {
  if (!fs.existsSync(LOCAL_STORE_DIR)) {
    fs.mkdirSync(LOCAL_STORE_DIR, { recursive: true });
  }
}

function readJsonFile(filePath, fallback = []) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.warn(`[syncCardcomTerminal] Failed reading ${filePath}:`, err.message);
  }
  return fallback;
}

function writeJsonFile(filePath, data) {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[syncCardcomTerminal] Failed writing ${filePath}:`, err.message);
  }
}

/**
 * Loads bookings from Supabase PostgREST or fallback.
 */
async function loadActiveBookings(fetchImpl = fetch) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

      const url = `${supabaseUrl}/rest/v1/hotelos_bookings?deleted_at=is.null&check_in_date=lte.${to}&check_out_date=gte.${from}&select=*&limit=500`;
      const res = await fetchImpl(url, {
        headers: {
          apikey: supabaseKey,
          authorization: `Bearer ${supabaseKey}`
        }
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) return rows;
      }
    } catch (err) {
      console.warn('[syncCardcomTerminal] Supabase bookings fetch warning:', err.message);
    }
  }

  // Fallback to local bookings if available
  const localBookings = readJsonFile(path.join(LOCAL_STORE_DIR, 'local-bookings.json'), []);
  return localBookings;
}

/**
 * Sends a WhatsApp message via Chloe agent router.
 */
async function sendWhatsAppMessage({ jid, text, fetchImpl = fetch }) {
  const agentUrl = (process.env.CHLOE_AGENT_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
  const agentToken = process.env.CHLOE_AGENT_TOKEN || process.env.RESORTOS_AGENT_TOKEN;

  // Rate limiter check
  const check = defaultRateLimiter.canSend(jid);
  if (!check.allowed) {
    console.warn(`[syncCardcomTerminal] Outbound WhatsApp to ${jid} rate limited: ${check.reason}`);
    return false;
  }

  try {
    const res = await fetchImpl(`${agentUrl}/api/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(agentToken ? { authorization: `Bearer ${agentToken}` } : {})
      },
      body: JSON.stringify({
        channel_id: 'resortos',
        channel: 'resortos',
        jid,
        phone: jid,
        text
      })
    });

    if (res.ok) {
      defaultRateLimiter.recordOutbound(jid);
      return true;
    }
    console.warn(`[syncCardcomTerminal] Chloe send failed HTTP ${res.status}`);
  } catch (err) {
    console.warn('[syncCardcomTerminal] Chloe send error:', err.message);
  }
  return false;
}

/**
 * Polls Cardcom ListTransactions for terminal, matches against bookings, stores pending match,
 * and notifies Ran via WhatsApp.
 */
export async function pollCardcomTerminal({
  apiName = process.env.CARDCOM_API_NAME,
  apiPassword = process.env.CARDCOM_API_PASSWORD,
  terminal = process.env.CARDCOM_TERMINAL || DEFAULT_CARDCOM_TERMINAL,
  fetchImpl = fetch,
  notifyRan = true,
  force = false
} = {}) {
  if (!isPollerEnabled() && !force) {
    console.log('[syncCardcomTerminal] Poller is disabled by default (CARDCOM_TERMINAL_SYNC_ENABLED != 1). Skipping run.');
    return { ok: false, disabled: true, reason: 'DISABLED_BY_DEFAULT', newMatches: [] };
  }

  if (!apiName || !apiPassword) {
    console.log('[syncCardcomTerminal] Cardcom API credentials not configured; skipping poll.');
    return { ok: false, reason: 'NOT_CONFIGURED', newMatches: [] };
  }

  const today = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  let deals = [];
  try {
    deals = await fetchCardcomTransactions({
      from: fromDate,
      to: today,
      terminal,
      apiName,
      apiPassword,
      fetchImpl
    });
  } catch (err) {
    console.error('[syncCardcomTerminal] Error fetching Cardcom transactions:', err.message);
    return { ok: false, error: err.message };
  }

  const seenDeals = readJsonFile(LOCAL_SEEN_FILE, []);
  const seenIds = new Set(seenDeals.map((d) => String(d.deal_id || d.dealId)));

  const pendingMatches = readJsonFile(LOCAL_PENDING_FILE, []);
  const pendingDealIds = new Set(pendingMatches.map((m) => String(m.deal_id || m.dealId)));

  const bookings = await loadActiveBookings(fetchImpl);
  const newMatches = [];

  for (const deal of deals) {
    if (seenIds.has(deal.dealId) || pendingDealIds.has(deal.dealId)) {
      continue;
    }

    // Check if deal is already recorded in any booking
    const alreadyLinkedBooking = bookings.find((b) => (
      (Array.isArray(b.clearing_payments) ? b.clearing_payments : []).some((row) => (
        String(row.deal_number || row.txn || '').trim() === deal.dealId
      ))
    ));

    if (alreadyLinkedBooking) {
      seenDeals.push({
        deal_id: deal.dealId,
        terminal_number: deal.terminal,
        amount: deal.amount,
        approval_number: deal.approval,
        last4: deal.last4,
        card_owner_name: deal.cardOwnerName,
        linked_booking_id: alreadyLinkedBooking.id,
        status: 'linked',
        created_at: new Date().toISOString()
      });
      seenIds.add(deal.dealId);
      continue;
    }

    // Mark as seen
    seenDeals.push({
      deal_id: deal.dealId,
      terminal_number: deal.terminal,
      amount: deal.amount,
      approval_number: deal.approval,
      last4: deal.last4,
      card_owner_name: deal.cardOwnerName,
      entry_mode: deal.entryMode,
      deal_time: deal.dealTime,
      status: 'seen',
      created_at: new Date().toISOString()
    });
    seenIds.add(deal.dealId);

    // Rank candidates
    const candidates = rankCandidateBookings(deal, bookings, today);

    const matchRecord = {
      id: `match_${deal.dealId}_${Date.now()}`,
      deal_id: deal.dealId,
      terminal_number: deal.terminal,
      amount: deal.amount,
      last4: deal.last4,
      approval: deal.approval,
      document_number: deal.documentNumber || null,
      document_url: deal.documentUrl || null,
      deal_time: deal.dealTime,
      payer_name: deal.cardOwnerName,
      candidates,
      current_candidate_index: 0,
      status: 'pending',
      ran_prompted_at: null,
      ran_prompt_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (candidates.length > 0 && notifyRan) {
      const topCandidate = candidates[0];
      const alternatives = candidates.slice(1);
      const promptText = formatRanApprovalPrompt(deal, topCandidate, alternatives);

      // Send to Ran's WhatsApp
      const ranJid = `${RAN_PRIVATE_PHONE_DIGITS}@s.whatsapp.net`;
      const sent = await sendWhatsAppMessage({ jid: ranJid, text: promptText, fetchImpl });
      if (sent) {
        matchRecord.ran_prompted_at = new Date().toISOString();
        matchRecord.ran_prompt_message = promptText;
        console.log(`[syncCardcomTerminal] Prompted Ran for deal ${deal.dealId} (suggested ${topCandidate.guestName})`);
      }
    }

    pendingMatches.push(matchRecord);
    pendingDealIds.add(deal.dealId);
    newMatches.push(matchRecord);
  }

async function syncToSupabaseSettings(pendingMatches) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/hotelos_runtime_settings`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        key: 'cardcom_pending_matches',
        value: JSON.stringify(pendingMatches),
        updated_at: new Date().toISOString()
      })
    });
  } catch (err) {
    console.warn('[syncCardcomTerminal] Supabase runtime settings sync warning:', err.message);
  }
}

  writeJsonFile(LOCAL_SEEN_FILE, seenDeals);
  writeJsonFile(LOCAL_PENDING_FILE, pendingMatches);
  await syncToSupabaseSettings(pendingMatches);

  return {
    ok: true,
    totalPolled: deals.length,
    newMatchesCount: newMatches.length,
    newMatches
  };
}

// If executed directly from command line
if (process.argv[1] && process.argv[1].endsWith('syncCardcomTerminal.js')) {
  const force = process.argv.includes('--force');
  const isDaemon = process.argv.includes('--daemon') || process.env.CARDCOM_TERMINAL_SYNC_DAEMON === '1';

  if (!isPollerEnabled() && !force && !isDaemon) {
    console.log('[syncCardcomTerminal] Poller is disabled by default (CARDCOM_TERMINAL_SYNC_ENABLED != 1).');
    console.log('To run once manually: CARDCOM_TERMINAL_SYNC_ENABLED=1 node server/syncCardcomTerminal.js (or pass --force).');
    process.exit(0);
  }

  if (isDaemon) {
    console.log('[syncCardcomTerminal] Starting terminal poller daemon (every 2 minutes)...');
    const run = async () => {
      try {
        const res = await pollCardcomTerminal({ force: true });
        console.log(`[syncCardcomTerminal] [${new Date().toLocaleTimeString('he-IL')}] Polled: ${res.totalPolled || 0} deals, ${res.newMatchesCount || 0} new matches.`);
      } catch (err) {
        console.error('[syncCardcomTerminal] Daemon poll error:', err.message);
      }
    };
    run();
    setInterval(run, 120000);
  } else {
    console.log('[syncCardcomTerminal] Starting terminal poller...');
    pollCardcomTerminal({ force: true })
      .then((res) => {
        console.log('[syncCardcomTerminal] Result:', JSON.stringify(res, null, 2));
        process.exit(0);
      })
      .catch((err) => {
        console.error('[syncCardcomTerminal] Error:', err);
        process.exit(1);
      });
  }
}
