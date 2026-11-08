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

  } finally {
    await adminClient.end();
  }
});
