#!/usr/bin/env node
/**
 * Cardcom Manual Terminal (184288) Deals Synchronizer & Matcher
 *
 * Pulls transactions from Cardcom API v11 (ListTransactions) for terminal 184288.
 * Evaluates candidate bookings for unpaid/partially paid reservations.
 *
 * Rules:
 * - Never prints secrets to logs.
 * - Managed storage replaces manual files (cardcom-seen-deals.json, cardcom-pending-matches.json).
 * - No auto-linking.
 * - Notifications do NOT go through Chloe WhatsApp (resolution happens in Desk & Mobile Priority modal).
 * - Supports --since YYYY-MM-DD backfill. Default is dry-run, --apply persists proposals.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchCardcomTransactions,
  rankCandidateBookings,
  isTestTransaction,
  DEFAULT_CARDCOM_TERMINAL
} from './lib/cardcomTerminalService.js';
import { CardcomStorage } from './lib/cardcomStorage.js';

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

/**
 * Loads bookings from Supabase PostgREST or local fallback.
 * The date window follows sinceDate when specified (not fixed 14 days back).
 */
export async function loadActiveBookings(fetchImpl = fetch, { fromDaysBack = 14, toDaysForward = 60, sinceDate = null } = {}) {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const from = sinceDate ? String(sinceDate).slice(0, 10) : new Date(Date.now() - fromDaysBack * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + toDaysForward * 24 * 3600 * 1000).toISOString().slice(0, 10);

      const url = `${supabaseUrl}/rest/v1/hotelos_bookings?deleted_at=is.null&check_in_date=lte.${to}&check_out_date=gte.${from}&select=*&limit=1000`;
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
      console.warn('[syncCardcomTerminal] Supabase bookings fetch warning:', err?.message || 'unknown');
    }
  }

  // Fallback to local bookings if available
  const localFile = path.join(__dirname, '..', 'data', 'local-bookings.json');
  if (fs.existsSync(localFile)) {
    try {
      const list = JSON.parse(fs.readFileSync(localFile, 'utf8'));
      if (Array.isArray(list)) return list;
    } catch (_) {}
  }
  return [];
}

/**
 * Polls Cardcom ListTransactions for terminal, matches against bookings,
 * and persists to managed storage.
 *
 * Rules:
 * - In dry-run mode, writes NOTHING (neither to Supabase nor local disk cache).
 * - Suspected test transactions remain in status 'pending' (with is_test=true and 'maybe test' badge)
 *   so they are never hidden from staff.
 * - --force allows running on demand or via launchd even if CARDCOM_TERMINAL_SYNC_ENABLED != 1.
 * - The launchd poller NEVER auto-links charges and NEVER issues invoices.
 */
export async function pollCardcomTerminal({
  apiName = process.env.CARDCOM_API_NAME,
  apiPassword = process.env.CARDCOM_API_PASSWORD,
  terminal = process.env.CARDCOM_TERMINAL || DEFAULT_CARDCOM_TERMINAL,
  sinceDate = null,
  isDryRun = false,
  force = false,
  fetchImpl = fetch,
  storage = null,
  bookings: initialBookings = null
} = {}) {
  if (!isPollerEnabled() && !force && !sinceDate) {
    console.log('[syncCardcomTerminal] Poller is disabled by default (CARDCOM_TERMINAL_SYNC_ENABLED != 1). Skipping run.');
    return { ok: false, disabled: true, reason: 'DISABLED_BY_DEFAULT', newMatches: [] };
  }

  if (!apiName || !apiPassword) {
    console.log('[syncCardcomTerminal] Cardcom API credentials not configured; skipping poll.');
    return { ok: false, reason: 'NOT_CONFIGURED', newMatches: [] };
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const fromDate = sinceDate || new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const toDate = todayIso;

  console.log(`[syncCardcomTerminal] Fetching terminal ${terminal} deals from ${fromDate} to ${toDate}${isDryRun ? ' [DRY-RUN]' : ''}...`);

  let deals = [];
  try {
    deals = await fetchCardcomTransactions({
      from: fromDate,
      to: toDate,
      terminal,
      apiName,
      apiPassword,
      fetchImpl
    });
  } catch (err) {
    console.error('[syncCardcomTerminal] Error fetching Cardcom transactions:', err?.message || 'unknown');
    return { ok: false, error: err?.message || 'unknown' };
  }

  const store = storage || new CardcomStorage({ fetchImpl, dryRun: isDryRun });
  await store.init();

  const bookings = Array.isArray(initialBookings)
    ? initialBookings
    : await loadActiveBookings(fetchImpl, { sinceDate: fromDate });

  const newMatches = [];
  const dryRunResults = [];

  for (const deal of deals) {
    const dealId = String(deal.dealId);

    // Check if deal is already recorded in any booking
    const alreadyLinkedBooking = bookings.find((b) => (
      (Array.isArray(b.clearing_payments) ? b.clearing_payments : []).some((row) => (
        String(row.deal_number || row.txn || '').trim() === dealId
        || (deal.approval && String(row.approval || row.ref || '').trim() === deal.approval)
      ))
    ));

    if (alreadyLinkedBooking) {
      if (!isDryRun) {
        store.addSeenDeal({
          deal_id: dealId,
          terminal_number: deal.terminal,
          amount: deal.amount,
          approval_number: deal.approval,
          last4: deal.last4,
          card_owner_name: deal.cardOwnerName,
          linked_booking_id: alreadyLinkedBooking.id,
          status: 'linked'
        });
      }
      continue;
    }

    // If deal has already been seen and processed
    if (store.hasSeenDeal(dealId)) {
      continue;
    }

    const isTest = isTestTransaction(deal);
    const candidates = rankCandidateBookings(deal, bookings, todayIso);

    // Suspected tests remain in pending status with is_test=true so staff can inspect & confirm
    const matchRecord = {
      id: `match_${dealId}_${Date.now()}`,
      deal_id: dealId,
      terminal_number: deal.terminal,
      amount: deal.amount,
      last4: deal.last4,
      approval: deal.approval,
      document_number: deal.documentNumber || null,
      document_url: deal.documentUrl || null,
      deal_time: deal.dealTime,
      payer_name: deal.cardOwnerName,
      is_test: isTest,
      candidates,
      current_candidate_index: 0,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (isDryRun) {
      dryRunResults.push({
        dealId,
        date: deal.dealTime?.slice(0, 10) || fromDate,
        amount: deal.amount,
        payer: deal.cardOwnerName,
        last4: deal.last4,
        approval: deal.approval,
        isTest,
        topCandidate: candidates[0] ? {
          bookingId: candidates[0].bookingId,
          guestName: candidates[0].guestName,
          unitName: candidates[0].unitName,
          score: candidates[0].score,
          dueIls: candidates[0].dueIls,
          reasons: candidates[0].reasons
        } : null,
        totalCandidates: candidates.length
      });
    } else {
      store.addSeenDeal({
        deal_id: dealId,
        terminal_number: deal.terminal,
        amount: deal.amount,
        approval_number: deal.approval,
        last4: deal.last4,
        card_owner_name: deal.cardOwnerName,
        entry_mode: deal.entryMode,
        deal_time: deal.dealTime,
        status: isTest ? 'suspected_test' : 'seen'
      });

      store.addPendingMatch(matchRecord);
      newMatches.push(matchRecord);
    }
  }

  if (!isDryRun) {
    await store.persist();
  }

  return {
    ok: true,
    totalPolled: deals.length,
    newMatchesCount: isDryRun ? dryRunResults.length : newMatches.length,
    newMatches,
    dryRunResults,
    isDryRun
  };
}

// CLI execution
if (process.argv[1] && process.argv[1].endsWith('syncCardcomTerminal.js')) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const isDaemon = args.includes('--daemon') || process.env.CARDCOM_TERMINAL_SYNC_DAEMON === '1';

  // Check for --since YYYY-MM-DD
  const sinceIdx = args.findIndex((a) => a === '--since' || a.startsWith('--since='));
  let sinceDate = null;
  if (sinceIdx >= 0) {
    if (args[sinceIdx].startsWith('--since=')) {
      sinceDate = args[sinceIdx].split('=')[1].trim();
    } else if (args[sinceIdx + 1] && !args[sinceIdx + 1].startsWith('--')) {
      sinceDate = args[sinceIdx + 1].trim();
    }
  }

  const hasApply = args.includes('--apply');
  const isDryRun = Boolean(sinceDate) && !hasApply;

  if (sinceDate) {
    console.log(`[syncCardcomTerminal] Replay run --since ${sinceDate} (${isDryRun ? 'DRY-RUN (default)' : 'APPLY (persisting proposals)'})`);
    pollCardcomTerminal({
      sinceDate,
      isDryRun,
      force: true
    }).then((res) => {
      console.log('--------------------------------------------------');
      console.log(`Found ${res.totalPolled || 0} total transactions.`);
      console.log(`Unlinked match proposals: ${res.newMatchesCount || 0}`);
      console.log('--------------------------------------------------');
      if (res.isDryRun && res.dryRunResults) {
        for (const item of res.dryRunResults) {
          const testTag = item.isTest ? ' [בדיקה / TEST]' : '';
          console.log(`💳 Deal ${item.dealId} | ₪${item.amount} | ${item.payer || 'ללא שם'} | 4 ספרות: ${item.last4} | תאריך: ${item.date}${testTag}`);
          if (item.topCandidate) {
            console.log(`   👉 שידוך מומלץ: [${item.topCandidate.bookingId}] ${item.topCandidate.guestName} (${item.topCandidate.unitName}) - ציון ${item.topCandidate.score}`);
            console.log(`      סיבות: ${item.topCandidate.reasons.join(', ')} | יתרה: ₪${item.topCandidate.dueIls}`);
          } else {
            console.log(`   ❌ אין הזמנה מתאימה במערכת`);
          }
          console.log('');
        }
        console.log('[DRY-RUN] No changes were written. To save these proposals, re-run with --apply:');
        console.log(`  node server/syncCardcomTerminal.js --since ${sinceDate} --apply`);
      } else {
        console.log(`Successfully saved ${res.newMatchesCount || 0} match proposals into managed storage.`);
      }
      process.exit(0);
    }).catch((err) => {
      console.error('[syncCardcomTerminal] Error in backfill run:', err);
      process.exit(1);
    });
  } else if (isDaemon) {
    console.log('[syncCardcomTerminal] Starting terminal poller daemon (every 5 minutes)...');
    const run = async () => {
      try {
        const res = await pollCardcomTerminal({ force: true });
        console.log(`[syncCardcomTerminal] [${new Date().toLocaleTimeString('he-IL')}] Polled: ${res.totalPolled || 0} deals, ${res.newMatchesCount || 0} new matches.`);
      } catch (err) {
        console.error('[syncCardcomTerminal] Daemon poll error:', err.message);
      }
    };
    run();
    setInterval(run, 300000); // 5 minutes
  } else {
    pollCardcomTerminal({ force })
      .then((res) => {
        if (!res.ok && res.disabled) {
          console.log('[syncCardcomTerminal] Poller is disabled by default (CARDCOM_TERMINAL_SYNC_ENABLED != 1).');
          console.log('To run once manually: CARDCOM_TERMINAL_SYNC_ENABLED=1 node server/syncCardcomTerminal.js (or pass --force).');
        } else {
          console.log('[syncCardcomTerminal] Result:', JSON.stringify({ ok: res.ok, polled: res.totalPolled, newMatches: res.newMatchesCount }, null, 2));
        }
        process.exit(0);
      })
      .catch((err) => {
        console.error('[syncCardcomTerminal] Error:', err);
        process.exit(1);
      });
  }
}
