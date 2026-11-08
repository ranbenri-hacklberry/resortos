import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { onRequest } from '../functions/api/ops/[[path]].js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mig009Path = path.join(__dirname, '..', 'migrations', '009_cardcom_terminal_sync_and_ledger.sql');
const migLegacyPath = path.join(__dirname, 'migration_cardcom_terminal_matches.sql');

const DATABASE_URL = process.env.DATABASE_URL;

test('PostgreSQL Real Integration Tests for Cardcom Terminal Sync & Ledger', async (t) => {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required for PostgreSQL integration tests');
  }
  const { Client } = pg;
  const adminClient = new Client({ connectionString: DATABASE_URL });
  await adminClient.connect();

  const mig009Sql = fs.readFileSync(mig009Path, 'utf8');
  const migLegacySql = fs.readFileSync(migLegacyPath, 'utf8');

  // 1. Bootstrap anon/authenticated/service_role roles before grants
  await adminClient.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
    END $$;
  `);

  // Helper to create a fresh DB per test, running migrations strictly on public schema
  const createFreshDb = async (prefix) => {
    const dbName = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`.toLowerCase();
    await adminClient.query(`CREATE DATABASE ${dbName};`);
    const dbUrl = new URL(DATABASE_URL);
    dbUrl.pathname = `/${dbName}`;
    const testClient = new Client({ connectionString: dbUrl.toString() });
    await testClient.connect();
    return { dbName, dbUrl: dbUrl.toString(), client: testClient };
  };

  const dropDb = async (dbName, client) => {
    if (client) {
      await client.end().catch(() => {});
    }
    await adminClient.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`).catch(() => {});
  };

  try {
    // Test 1: Fresh schema migration on public
    await t.test('Test 1: Fresh schema migration on public in clean DB', async () => {
      const { dbName, client } = await createFreshDb('fresh_mig');
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.hotelos_bookings (
            id TEXT PRIMARY KEY,
            guest_name TEXT,
            total_price_agorot BIGINT DEFAULT 0,
            clearing_payments JSONB DEFAULT '[]'::jsonb,
            payment_status TEXT DEFAULT 'UNPAID',
            payment_mode TEXT,
            updated_at TIMESTAMPTZ DEFAULT now()
          );
        `);

        await client.query(mig009Sql);

        const tablesRes = await client.query(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
          ORDER BY table_name;
        `);
        const tableNames = tablesRes.rows.map((r) => r.table_name);
        assert.ok(tableNames.includes('cardcom_deal_ledger'), 'cardcom_deal_ledger table must exist');
        assert.ok(tableNames.includes('cardcom_seen_deals'), 'cardcom_seen_deals table must exist');
        assert.ok(tableNames.includes('cardcom_pending_matches'), 'cardcom_pending_matches table must exist');
        assert.ok(tableNames.includes('cardcom_terminal_audit_log'), 'cardcom_terminal_audit_log table must exist');

        const idxRes = await client.query(`
          SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'cardcom_deal_ledger';
        `);
        const idxNames = idxRes.rows.map((r) => r.indexname);
        assert.ok(idxNames.includes('uq_cardcom_deal_ledger'), 'uq_cardcom_deal_ledger must exist');
      } finally {
        await dropDb(dbName, client);
      }
    });

    // Test 2: Legacy schema upgrade on public
    await t.test('Test 2: Legacy upgrade from server/migration_cardcom_terminal_matches.sql on public', async () => {
      const { dbName, client } = await createFreshDb('legacy_mig');
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.hotelos_bookings (
            id TEXT PRIMARY KEY,
            guest_name TEXT,
            total_price_agorot BIGINT DEFAULT 0,
            clearing_payments JSONB DEFAULT '[]'::jsonb,
            payment_status TEXT DEFAULT 'UNPAID',
            payment_mode TEXT,
            updated_at TIMESTAMPTZ DEFAULT now()
          );
        `);

        await client.query(migLegacySql);

        const preCol = await client.query(`
          SELECT data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'cardcom_pending_matches' AND column_name = 'id';
        `);
        assert.equal(preCol.rows[0].data_type, 'uuid', 'Pre-upgrade pending_matches.id is uuid');

        await client.query(mig009Sql);

        const postCol = await client.query(`
          SELECT data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'cardcom_pending_matches' AND column_name = 'id';
        `);
        assert.equal(postCol.rows[0].data_type, 'text', 'Post-upgrade pending_matches.id must be text');

        const colsRes = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'cardcom_pending_matches';
        `);
        const colNames = colsRes.rows.map((r) => r.column_name);
        assert.ok(colNames.includes('document_number'), 'document_number column added');
        assert.ok(colNames.includes('document_url'), 'document_url column added');
        assert.ok(colNames.includes('is_test'), 'is_test column added');
        assert.ok(colNames.includes('guest_name'), 'guest_name column added');
        assert.ok(colNames.includes('unit_name'), 'unit_name column added');
      } finally {
        await dropDb(dbName, client);
      }
    });

    // Test 3: Running migration twice (idempotency check)
    await t.test('Test 3: Running migration 009 twice on public in fresh DB', async () => {
      const { dbName, client } = await createFreshDb('idempotent_mig');
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.hotelos_bookings (
            id TEXT PRIMARY KEY,
            guest_name TEXT,
            total_price_agorot BIGINT DEFAULT 0,
            clearing_payments JSONB DEFAULT '[]'::jsonb,
            payment_status TEXT DEFAULT 'UNPAID',
            payment_mode TEXT,
            updated_at TIMESTAMPTZ DEFAULT now()
          );
        `);
        await client.query(mig009Sql);
        await client.query(mig009Sql);
        assert.ok(true, 'Running migration 009 twice must succeed without error');
      } finally {
        await dropDb(dbName, client);
      }
    });

    // Test 4: Real concurrency with two separate connections and overlapping transactions
    await t.test('Test 4: Real concurrency with two separate pg client connections and overlapping transactions', async () => {
      const { dbName, dbUrl, client: client1 } = await createFreshDb('conc_mig');
      const client2 = new Client({ connectionString: dbUrl });
      await client2.connect();

      try {
        await client1.query(`
          CREATE TABLE IF NOT EXISTS public.hotelos_bookings (
            id TEXT PRIMARY KEY,
            guest_name TEXT,
            total_price_agorot BIGINT DEFAULT 0,
            clearing_payments JSONB DEFAULT '[]'::jsonb,
            payment_status TEXT DEFAULT 'UNPAID',
            payment_mode TEXT,
            updated_at TIMESTAMPTZ DEFAULT now()
          );
        `);
        await client1.query(mig009Sql);

        await client1.query(`
          INSERT INTO public.hotelos_bookings (id, guest_name, total_price_agorot, payment_status)
          VALUES
            ('b-conc-1', 'לקוח ראשון', 50000, 'UNPAID'),
            ('b-conc-2', 'לקוח שני', 50000, 'UNPAID');
        `);

        // Client 1 records initial receipt
        await client1.query(`
          SELECT record_cardcom_deal_receipt('b-conc-1', jsonb_build_object(
            'terminal', '184288',
            'deal_number', 'deal-overlap-999',
            'amount_ils', 500
          ));
        `);

        // Client 1 starts overlapping transaction and claims retry
        await client1.query('BEGIN;');
        const claim1 = await client1.query(`
          SELECT claim_cardcom_deal_retry('184288', 'deal-overlap-999', 'b-conc-1') as result;
        `);
        assert.equal(claim1.rows[0].result.status, 'claiming_retry');

        // Client 2 attempts to claim while Client 1 transaction is open
        const client2Promise = (async () => {
          const client2Inner = new Client({ connectionString: dbUrl });
          await client2Inner.connect();
          try {
            await client2Inner.query('SET statement_timeout = 400;');
            await client2Inner.query(`SELECT claim_cardcom_deal_retry('184288', 'deal-overlap-999', 'b-conc-1');`);
            return { ok: true };
          } catch (err) {
            return { error: err.message };
          } finally {
            await client2Inner.end().catch(() => {});
          }
        })();

        const client2Result = await client2Promise;
        assert.ok(
          client2Result.error && (client2Result.error.includes('timeout') || client2Result.error.includes('DEAL_CLAIM_IN_PROGRESS')),
          `Concurrent claim from client 2 must be rejected, got: ${JSON.stringify(client2Result)}`
        );

        // Commit Client 1 transaction
        await client1.query('COMMIT;');

        // Now Client 2 attempts claim on committed claiming_retry state
        await assert.rejects(
          client2.query(`SELECT claim_cardcom_deal_retry('184288', 'deal-overlap-999', 'b-conc-1');`),
          /DEAL_CLAIM_IN_PROGRESS/
        );

        // Replaying record_cardcom_deal_receipt must NOT reset claiming_retry back to pending_invoice
        await client1.query(`
          SELECT record_cardcom_deal_receipt('b-conc-1', jsonb_build_object(
            'terminal', '184288',
            'deal_number', 'deal-overlap-999',
            'amount_ils', 500
          ));
        `);

        const ledgerState = await client1.query(`
          SELECT status FROM public.cardcom_deal_ledger WHERE deal_id = 'deal-overlap-999';
        `);
        assert.equal(ledgerState.rows[0].status, 'claiming_retry', 'record_cardcom_deal_receipt must not reset active claiming_retry to pending_invoice');

        // Finalize invoice
        await client1.query(`
          SELECT finalize_cardcom_deal_invoice('b-conc-1', 'deal-overlap-999', '184288', 'INV-OVERLAP-1', 'https://cardcom/doc/1');
        `);

        // Replaying record_cardcom_deal_receipt must NOT overwrite finalized doc number / invoice_status
        await client1.query(`
          SELECT record_cardcom_deal_receipt('b-conc-1', jsonb_build_object(
            'terminal', '184288',
            'deal_number', 'deal-overlap-999',
            'amount_ils', 500,
            'invoice_status', 'pending_invoice'
          ));
        `);

        const bRow = await client1.query(`SELECT clearing_payments FROM public.hotelos_bookings WHERE id = 'b-conc-1';`);
        const item = bRow.rows[0].clearing_payments[0];
        assert.equal(item.invoice_status, 'invoiced', 'Replay must preserve invoice_status');
        assert.equal(item.document_number, 'INV-OVERLAP-1', 'Replay must preserve document_number');

        // Finalize invoice must verify booking_id and throw on mismatch
        await assert.rejects(
          client1.query(`SELECT finalize_cardcom_deal_invoice('b-conc-2', 'deal-overlap-999', '184288', 'INV-OVERLAP-2', '');`),
          /BOOKING_MISMATCH/
        );

        // Finalize invoice must throw on document identity mismatch
        await assert.rejects(
          client1.query(`SELECT finalize_cardcom_deal_invoice('b-conc-1', 'deal-overlap-999', '184288', 'INV-DIFFERENT-9', '');`),
          /DOCUMENT_MISMATCH/
        );
      } finally {
        await client2.end().catch(() => {});
        await dropDb(dbName, client1);
      }
    });

    // Test 5: DB failure prevents any Cardcom calls through the real HTTP handler
    await t.test('Test 5: DB failure means zero Cardcom calls through the real HTTP handler', async () => {
      let cardcomCreateDocCalls = 0;
      const originalFetch = globalThis.fetch;

      globalThis.fetch = async (url, options = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/v11/Documents/CreateDocument')) {
          cardcomCreateDocCalls += 1;
          return new Response(JSON.stringify({ ResponseCode: 0, DocumentNumber: 'INV-MOCK-999' }), { status: 200 });
        }

        // Mock PostgREST endpoints
        if (urlStr.includes('/cardcom_pending_matches?deal_id=eq.')) {
          return new Response(JSON.stringify([{
            deal_id: 'deal-zero-call-1',
            terminal_number: '184288',
            amount: 250,
            status: 'pending'
          }]), { status: 200 });
        }

        if (urlStr.includes('/hotelos_bookings?id=eq.')) {
          return new Response(JSON.stringify([{
            id: 'b-zero-call-1',
            guest_name: 'יוסי כהן',
            total_price_agorot: 25000,
            payment_status: 'UNPAID'
          }]), { status: 200 });
        }

        // Simulate DB write failure on record_cardcom_deal_receipt
        if (urlStr.includes('/rpc/record_cardcom_deal_receipt')) {
          return new Response(JSON.stringify({
            error: 'DEAL_ALREADY_ASSIGNED',
            message: 'Deal deal-zero-call-1 is already claimed by booking b-other'
          }), { status: 409 });
        }

        return originalFetch(url, options);
      };

      try {
        const mockRequest = new Request('https://resortos.internal/api/ops/cardcom-terminal/link', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hotelos-mailbox': 'test-secret'
          },
          body: JSON.stringify({
            deal_id: 'deal-zero-call-1',
            booking_id: 'b-zero-call-1',
            terminal: '184288'
          })
        });

        const mockEnv = {
          CHECKOUT_MAILBOX_SECRET: 'test-secret',
          SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
          SUPABASE_URL: 'https://mock.supabase.co',
          CARDCOM_TERMINAL: '184288',
          CARDCOM_API_NAME: 'test_api',
          CARDCOM_API_PASSWORD: 'test_pass'
        };

        const response = await onRequest({
          request: mockRequest,
          params: { path: ['cardcom-terminal', 'link'] },
          env: mockEnv
        });

        assert.equal(response.status, 409, 'Handler must return 409 on DB conflict');
        const body = await response.json();
        assert.equal(body.error, 'DEAL_ALREADY_ASSIGNED');
        assert.equal(cardcomCreateDocCalls, 0, 'Cardcom CreateDocument must be called exactly ZERO times when DB fails');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    // Test 6: Endpoint + Postgres test: rejected amount/deal validation cannot increase booking paid total or change payment status
    await t.test('Test 6: Rejected amount/deal validation cannot increase booking paid total or change payment status', async () => {
      const { dbName, client } = await createFreshDb('guard_balance');
      const originalFetch = globalThis.fetch;

      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.hotelos_bookings (
            id TEXT PRIMARY KEY,
            guest_name TEXT,
            total_price_agorot BIGINT DEFAULT 0,
            clearing_payments JSONB DEFAULT '[]'::jsonb,
            payment_status TEXT DEFAULT 'UNPAID',
            payment_mode TEXT,
            updated_at TIMESTAMPTZ DEFAULT now()
          );
        `);
        await client.query(mig009Sql);

        // Seed bookings
        await client.query(`
          INSERT INTO public.hotelos_bookings (id, guest_name, total_price_agorot, clearing_payments, payment_status)
          VALUES
            ('b-guard-amt', 'יוסי כהן', 50000, '[]'::jsonb, 'UNPAID'),
            ('b-guard-deal', 'שרה לוי', 30000, '[]'::jsonb, 'UNPAID'),
            ('b-guard-inv-fail', 'חיים אברהם', 20000, '[]'::jsonb, 'UNPAID');
        `);

        // Seed pending matches
        await client.query(`
          INSERT INTO public.cardcom_pending_matches (id, deal_id, terminal_number, amount, status)
          VALUES
            ('match-guard-amt', 'deal-guard-amt', '184288', 500, 'pending'),
            ('match-guard-deal', 'deal-guard-deal', '184288', 300, 'pending'),
            ('match-guard-inv-fail', 'deal-guard-inv-fail', '184288', 200, 'pending');
        `);

        // Bridge PostgREST calls to real PostgreSQL queries (DO NOT mock receipt persistence!)
        globalThis.fetch = async (url, options = {}) => {
          const urlStr = String(url);

          // Cardcom API calls
          if (urlStr.includes('/api/v11/Transactions/ListTransactions')) {
            const body = JSON.parse(options.body || '{}');
            const page = body.Page || 1;
            if (page > 1) {
              return new Response(JSON.stringify({ ResponseCode: 0, Tranzactions: [] }), { status: 200 });
            }

            // Return Cardcom transactions:
            // - deal-guard-amt: amount is 400 ILS (mismatches proposal 500 ILS)
            // - deal-guard-deal: not returned (deal missing in Cardcom)
            // - deal-guard-inv-fail: amount is 200 ILS (matches proposal 200 ILS)
            return new Response(JSON.stringify({
              ResponseCode: 0,
              Tranzactions: [
                {
                  TranzactionId: 'deal-guard-amt',
                  TerminalNumber: 184288,
                  Amount: 400,
                  CoinId: '1'
                },
                {
                  TranzactionId: 'deal-guard-inv-fail',
                  TerminalNumber: 184288,
                  Amount: 200,
                  CoinId: '1'
                }
              ]
            }), { status: 200 });
          }

          if (urlStr.includes('/api/v11/Documents/CreateDocument')) {
            // Simulate Cardcom CreateDocument 504 Gateway Timeout for deal-guard-inv-fail
            return new Response('Gateway Timeout', { status: 504 });
          }

          // Real PostgREST DB bridge executing against Postgres client
          if (urlStr.includes('/cardcom_pending_matches?deal_id=eq.')) {
            const dealId = decodeURIComponent(urlStr.split('deal_id=eq.')[1].split('&')[0]);
            if (options.method === 'PATCH') {
              const payload = JSON.parse(options.body || '{}');
              await client.query(
                `UPDATE public.cardcom_pending_matches SET status = COALESCE($1, status), updated_at = now() WHERE deal_id = $2;`,
                [payload.status, dealId]
              );
              return new Response(JSON.stringify([{ deal_id: dealId, status: payload.status }]), { status: 200 });
            } else {
              const res = await client.query(`SELECT * FROM public.cardcom_pending_matches WHERE deal_id = $1;`, [dealId]);
              return new Response(JSON.stringify(res.rows), { status: 200 });
            }
          }

          if (urlStr.includes('/hotelos_bookings?id=eq.')) {
            const bId = decodeURIComponent(urlStr.split('id=eq.')[1].split('&')[0]);
            const res = await client.query(`SELECT * FROM public.hotelos_bookings WHERE id = $1;`, [bId]);
            return new Response(JSON.stringify(res.rows), { status: 200 });
          }

          if (urlStr.includes('/rpc/record_cardcom_deal_receipt')) {
            // Execute REAL Postgres stored procedure
            const payload = JSON.parse(options.body || '{}');
            try {
              const rpcRes = await client.query(
                'SELECT record_cardcom_deal_receipt($1, $2::jsonb) AS result;',
                [payload.p_booking_id, JSON.stringify(payload.p_receipt_entry)]
              );
              return new Response(JSON.stringify(rpcRes.rows[0].result), { status: 200 });
            } catch (err) {
              return new Response(JSON.stringify({ error: err.message, message: err.message }), { status: 409 });
            }
          }

          if (urlStr.includes('/rpc/claim_cardcom_deal_retry')) {
            const payload = JSON.parse(options.body || '{}');
            try {
              const rpcRes = await client.query(
                'SELECT claim_cardcom_deal_retry($1, $2, $3) AS result;',
                [payload.p_terminal, payload.p_deal_id, payload.p_booking_id]
              );
              return new Response(JSON.stringify(rpcRes.rows[0].result), { status: 200 });
            } catch (err) {
              return new Response(JSON.stringify({ error: err.message, message: err.message }), { status: 409 });
            }
          }

          if (urlStr.includes('/rpc/mark_cardcom_deal_reconciliation_needed')) {
            const payload = JSON.parse(options.body || '{}');
            try {
              const rpcRes = await client.query(
                'SELECT mark_cardcom_deal_reconciliation_needed($1, $2, $3, $4, $5) AS result;',
                [payload.p_terminal, payload.p_deal_id, payload.p_error_message, payload.p_booking_id || null, payload.p_amount || null]
              );
              return new Response(JSON.stringify(rpcRes.rows[0].result), { status: 200 });
            } catch (err) {
              return new Response(JSON.stringify({ error: err.message, message: err.message }), { status: 409 });
            }
          }

          if (urlStr.includes('/rpc/finalize_cardcom_deal_invoice')) {
            const payload = JSON.parse(options.body || '{}');
            try {
              const rpcRes = await client.query(
                'SELECT finalize_cardcom_deal_invoice($1, $2, $3, $4, $5) AS result;',
                [payload.p_booking_id, payload.p_deal_number, payload.p_terminal, payload.p_document_number, payload.p_document_url]
              );
              return new Response(JSON.stringify(rpcRes.rows[0].result), { status: 200 });
            } catch (err) {
              return new Response(JSON.stringify({ error: err.message, message: err.message }), { status: 409 });
            }
          }

          if (urlStr.includes('/cardcom_terminal_audit_log')) {
            return new Response(JSON.stringify({ ok: true }), { status: 201 });
          }

          return originalFetch(url, options);
        };

        const mockEnv = {
          CHECKOUT_MAILBOX_SECRET: 'test-secret',
          SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
          SUPABASE_URL: 'https://mock.supabase.co',
          CARDCOM_TERMINAL: '184288',
          CARDCOM_API_NAME: 'test_api',
          CARDCOM_API_PASSWORD: 'test_pass'
        };

        // Case A: Amount mismatch (proposal 500 ILS, Cardcom 400 ILS)
        const reqAmt = new Request('https://resortos.internal/api/ops/cardcom-terminal/link', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hotelos-mailbox': 'test-secret'
          },
          body: JSON.stringify({
            deal_id: 'deal-guard-amt',
            booking_id: 'b-guard-amt',
            terminal: '184288'
          })
        });

        const resAmt = await onRequest({
          request: reqAmt,
          params: { path: ['cardcom-terminal', 'link'] },
          env: mockEnv
        });

        assert.equal(resAmt.status, 409, 'Must return 409 on amount mismatch');
        const bodyAmt = await resAmt.json();
        assert.equal(bodyAmt.error, 'RECONCILIATION_REQUIRED');
        assert.ok(bodyAmt.message.includes('Amount mismatch'), `Message should mention amount mismatch, got: ${bodyAmt.message}`);

        // Direct Postgres check: booking balance did NOT increase and status remains UNPAID
        const checkAmt = await client.query(`SELECT payment_status, clearing_payments FROM public.hotelos_bookings WHERE id = 'b-guard-amt';`);
        assert.equal(checkAmt.rows[0].payment_status, 'UNPAID', 'Payment status must remain UNPAID after amount mismatch');
        assert.deepEqual(checkAmt.rows[0].clearing_payments, [], 'Clearing payments must remain empty after amount mismatch');

        // Case B: Deal not found in Cardcom
        const reqDeal = new Request('https://resortos.internal/api/ops/cardcom-terminal/link', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hotelos-mailbox': 'test-secret'
          },
          body: JSON.stringify({
            deal_id: 'deal-guard-deal',
            booking_id: 'b-guard-deal',
            terminal: '184288'
          })
        });

        const resDeal = await onRequest({
          request: reqDeal,
          params: { path: ['cardcom-terminal', 'link'] },
          env: mockEnv
        });

        assert.equal(resDeal.status, 409, 'Must return 409 when deal is missing in Cardcom');
        const bodyDeal = await resDeal.json();
        assert.equal(bodyDeal.error, 'RECONCILIATION_REQUIRED');

        // Direct Postgres check: booking balance did NOT increase and status remains UNPAID
        const checkDeal = await client.query(`SELECT payment_status, clearing_payments FROM public.hotelos_bookings WHERE id = 'b-guard-deal';`);
        assert.equal(checkDeal.rows[0].payment_status, 'UNPAID', 'Payment status must remain UNPAID when deal is missing in Cardcom');
        assert.deepEqual(checkDeal.rows[0].clearing_payments, [], 'Clearing payments must remain empty when deal is missing');

        // Case C: Valid payment evidence verified, but invoice creation fails (CreateDocument 504)
        // Must preserve already-verified receipt in booking balance!
        const reqInvFail = new Request('https://resortos.internal/api/ops/cardcom-terminal/link', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-hotelos-mailbox': 'test-secret'
          },
          body: JSON.stringify({
            deal_id: 'deal-guard-inv-fail',
            booking_id: 'b-guard-inv-fail',
            terminal: '184288'
          })
        });

        const resInvFail = await onRequest({
          request: reqInvFail,
          params: { path: ['cardcom-terminal', 'link'] },
          env: mockEnv
        });

        assert.equal(resInvFail.status, 500, 'Must return 500 when Cardcom CreateDocument times out');
        const bodyInvFail = await resInvFail.json();
        assert.equal(bodyInvFail.error, 'INVOICE_GENERATION_FAILED');

        // Direct Postgres check: verified receipt WAS saved and counted toward booking balance
        const checkInvFail = await client.query(`SELECT payment_status, clearing_payments FROM public.hotelos_bookings WHERE id = 'b-guard-inv-fail';`);
        assert.equal(checkInvFail.rows[0].payment_status, 'PAID', 'Booking must be marked PAID because 200 ILS payment was verified');
        assert.equal(checkInvFail.rows[0].clearing_payments.length, 1, 'Verified receipt must be preserved in booking');
        assert.equal(checkInvFail.rows[0].clearing_payments[0].amount_ils, 200);
        assert.equal(checkInvFail.rows[0].clearing_payments[0].invoice_status, 'pending_invoice');

        // Ledger must be marked reconciliation_needed
        const ledgerInvFail = await client.query(`SELECT status, error_message FROM public.cardcom_deal_ledger WHERE deal_id = 'deal-guard-inv-fail';`);
        assert.equal(ledgerInvFail.rows[0].status, 'reconciliation_needed');
      } finally {
        globalThis.fetch = originalFetch;
        await dropDb(dbName, client);
      }
    });

  } finally {
    await adminClient.end();
  }
});
