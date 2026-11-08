import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mig009Path = path.join(__dirname, '..', 'migrations', '009_cardcom_terminal_sync_and_ledger.sql');
const migLegacyPath = path.join(__dirname, 'migration_cardcom_terminal_matches.sql');

const DATABASE_URL = process.env.DATABASE_URL;

test('PostgreSQL Real Integration Tests for Cardcom Terminal Sync & Ledger', { skip: !DATABASE_URL }, async (t) => {
  const { Client } = pg;
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const mig009Sql = fs.readFileSync(mig009Path, 'utf8');
  const migLegacySql = fs.readFileSync(migLegacyPath, 'utf8');

  // Helper to reset a schema
  const resetSchema = async (schemaName) => {
    await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`);
    await client.query(`CREATE SCHEMA ${schemaName};`);
    await client.query(`SET search_path = ${schemaName}, public, pg_temp;`);
  };

  try {
    // 1. Fresh schema migration
    await t.test('Test 1: Fresh schema migration on clean database', async () => {
      await resetSchema('test_fresh_mig');
      // Create hotelos_bookings prerequisite
      await client.query(`
        CREATE TABLE IF NOT EXISTS hotelos_bookings (
          id TEXT PRIMARY KEY,
          guest_name TEXT,
          total_price_agorot BIGINT DEFAULT 0,
          clearing_payments JSONB DEFAULT '[]'::jsonb,
          payment_status TEXT DEFAULT 'UNPAID',
          payment_mode TEXT,
          updated_at TIMESTAMPTZ DEFAULT now()
        );
      `);

      // Run 009 migration
      await client.query(mig009Sql);

      // Verify tables created
      const tablesRes = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = current_schema()
        ORDER BY table_name;
      `);
      const tableNames = tablesRes.rows.map((r) => r.table_name);
      assert.ok(tableNames.includes('cardcom_deal_ledger'), 'cardcom_deal_ledger table must exist');
      assert.ok(tableNames.includes('cardcom_seen_deals'), 'cardcom_seen_deals table must exist');
      assert.ok(tableNames.includes('cardcom_pending_matches'), 'cardcom_pending_matches table must exist');
      assert.ok(tableNames.includes('cardcom_terminal_audit_log'), 'cardcom_terminal_audit_log table must exist');

      // Verify unique index on cardcom_deal_ledger
      const idxRes = await client.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = current_schema() AND tablename = 'cardcom_deal_ledger';
      `);
      const idxNames = idxRes.rows.map((r) => r.indexname);
      assert.ok(idxNames.includes('uq_cardcom_deal_ledger'), 'uq_cardcom_deal_ledger must exist');
    });

    // 2. Legacy schema upgrade
    await t.test('Test 2: Legacy upgrade from server/migration_cardcom_terminal_matches.sql', async () => {
      await resetSchema('test_legacy_upgrade');
      // Create hotelos_bookings
      await client.query(`
        CREATE TABLE IF NOT EXISTS hotelos_bookings (
          id TEXT PRIMARY KEY,
          guest_name TEXT,
          total_price_agorot BIGINT DEFAULT 0,
          clearing_payments JSONB DEFAULT '[]'::jsonb,
          payment_status TEXT DEFAULT 'UNPAID',
          payment_mode TEXT,
          updated_at TIMESTAMPTZ DEFAULT now()
        );
      `);

      // Run legacy migration (which has uuid id on pending_matches and no updated_at on seen_deals)
      await client.query(migLegacySql);

      // Verify pre-conditions: pending_matches.id is uuid
      const preCol = await client.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'cardcom_pending_matches' AND column_name = 'id';
      `);
      assert.equal(preCol.rows[0].data_type, 'uuid', 'Pre-upgrade pending_matches.id is uuid');

      // Run 009 migration to upgrade schema
      await client.query(mig009Sql);

      // Verify post-conditions: pending_matches.id is text
      const postCol = await client.query(`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'cardcom_pending_matches' AND column_name = 'id';
      `);
      assert.equal(postCol.rows[0].data_type, 'text', 'Post-upgrade pending_matches.id must be text');

      // Verify columns added
      const colsRes = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'cardcom_pending_matches';
      `);
      const colNames = colsRes.rows.map((r) => r.column_name);
      assert.ok(colNames.includes('document_number'), 'document_number column added');
      assert.ok(colNames.includes('document_url'), 'document_url column added');
      assert.ok(colNames.includes('is_test'), 'is_test column added');
      assert.ok(colNames.includes('guest_name'), 'guest_name column added');
      assert.ok(colNames.includes('unit_name'), 'unit_name column added');
    });

    // 3. Running migration twice (idempotency check)
    await t.test('Test 3: Running migration 009 twice (idempotency)', async () => {
      await resetSchema('test_idempotency');
      await client.query(mig009Sql);
      // Run it again immediately
      await client.query(mig009Sql);
      assert.ok(true, 'Running migration 009 twice must succeed without error');
    });

    // 4. Concurrent link (atomic claim)
    await t.test('Test 4: Concurrent link requests (atomic claim in ledger)', async () => {
      await resetSchema('test_concurrency');
      await client.query(mig009Sql);

      // Create a test booking
      await client.query(`
        INSERT INTO hotelos_bookings (id, guest_name, total_price_agorot, payment_status)
        VALUES ('b-conc-pg-1', 'ישראל ישראלי', 50000, 'UNPAID');
      `);

      // Worker 1 records receipt (status = pending_invoice)
      const res1 = await client.query(`
        SELECT record_cardcom_deal_receipt('b-conc-pg-1', jsonb_build_object(
          'terminal', '184288',
          'deal_number', 'deal-conc-pg-999',
          'amount_ils', 500,
          'method', 'CARD'
        )) as result;
      `);
      assert.equal(res1.rows[0].result.booking_id, 'b-conc-pg-1');

      // Worker 1 claims retry for invoice generation
      const claim1 = await client.query(`
        SELECT claim_cardcom_deal_retry('184288', 'deal-conc-pg-999', 'b-conc-pg-1') as result;
      `);
      assert.equal(claim1.rows[0].result.status, 'claiming_retry');

      // Worker 2 attempts concurrent claim for same deal: must throw DEAL_CLAIM_IN_PROGRESS
      await assert.rejects(
        client.query(`SELECT claim_cardcom_deal_retry('184288', 'deal-conc-pg-999', 'b-conc-pg-1');`),
        /DEAL_CLAIM_IN_PROGRESS/
      );
    });

    // 5. Failed-state retries
    await t.test('Test 5: Failed-state retries and document reuse', async () => {
      await resetSchema('test_retry');
      await client.query(mig009Sql);

      await client.query(`
        INSERT INTO hotelos_bookings (id, guest_name, total_price_agorot, payment_status)
        VALUES ('b-ret-1', 'רבקה כהן', 30000, 'UNPAID');
      `);

      // Record receipt
      await client.query(`
        SELECT record_cardcom_deal_receipt('b-ret-1', jsonb_build_object(
          'terminal', '184288',
          'deal_number', 'deal-ret-111',
          'amount_ils', 300
        ));
      `);

      // Ambiguous error marks reconciliation_needed
      await client.query(`
        SELECT mark_cardcom_deal_reconciliation_needed('184288', 'deal-ret-111', 'Timeout calling Cardcom');
      `);

      // Retry worker claims it: transitions from reconciliation_needed to claiming_retry
      const retryClaim = await client.query(`
        SELECT claim_cardcom_deal_retry('184288', 'deal-ret-111', 'b-ret-1') as result;
      `);
      assert.equal(retryClaim.rows[0].result.status, 'claiming_retry');

      // Finalize invoice
      await client.query(`
        SELECT finalize_cardcom_deal_invoice('b-ret-1', 'deal-ret-111', '184288', 'INV-FINAL-111', 'https://cardcom/doc/111');
      `);

      // Subsequent retry claim returns existing document
      const secondClaim = await client.query(`
        SELECT claim_cardcom_deal_retry('184288', 'deal-ret-111', 'b-ret-1') as result;
      `);
      assert.equal(secondClaim.rows[0].result.status, 'invoiced');
      assert.equal(secondClaim.rows[0].result.document_number, 'INV-FINAL-111');
    });

    // 6. Concurrent staff and poller writes
    await t.test('Test 6: Concurrent staff and poller writes preserve staff status', async () => {
      await resetSchema('test_staff_preservation');
      await client.query(mig009Sql);

      // 1. Poller inserts initial pending proposal
      await client.query(`
        SELECT persist_cardcom_sync(
          '[]'::jsonb,
          jsonb_build_array(jsonb_build_object(
            'deal_id', 'deal-staff-1',
            'terminal_number', '184288',
            'amount', 450,
            'status', 'pending'
          ))
        );
      `);

      const initialRes = await client.query(`SELECT status FROM cardcom_pending_matches WHERE deal_id = 'deal-staff-1';`);
      assert.equal(initialRes.rows[0].status, 'pending');

      // 2. Staff marks match as 'manual_linked'
      await client.query(`
        UPDATE cardcom_pending_matches
        SET status = 'manual_linked', invoice_number = 'INV-STAFF-99'
        WHERE deal_id = 'deal-staff-1';
      `);

      // 3. Poller runs again 5 minutes later with 'pending' status
      await client.query(`
        SELECT persist_cardcom_sync(
          '[]'::jsonb,
          jsonb_build_array(jsonb_build_object(
            'deal_id', 'deal-staff-1',
            'terminal_number', '184288',
            'amount', 450,
            'status', 'pending'
          ))
        );
      `);

      // Staff status MUST BE PRESERVED (not reverted to pending)
      const afterPollerRes = await client.query(`SELECT status, invoice_number FROM cardcom_pending_matches WHERE deal_id = 'deal-staff-1';`);
      assert.equal(afterPollerRes.rows[0].status, 'manual_linked', 'persist_cardcom_sync must preserve staff status');
      assert.equal(afterPollerRes.rows[0].invoice_number, 'INV-STAFF-99');
    });

    // 7. DB failure meaning zero Cardcom calls
    await t.test('Test 7: DB failure prevents any Cardcom calls', async () => {
      await resetSchema('test_db_fail');
      await client.query(mig009Sql);

      // Attempting to record receipt for non-existent booking must fail inside DB
      await assert.rejects(
        client.query(`
          SELECT record_cardcom_deal_receipt('b-does-not-exist', jsonb_build_object(
            'deal_number', 'deal-fail-000',
            'amount_ils', 100
          ));
        `),
        /BOOKING_NOT_FOUND/
      );

      // Ledger row for deal was not left in invoiced state
      const ledgerCheck = await client.query(`
        SELECT * FROM cardcom_deal_ledger WHERE deal_id = 'deal-fail-000';
      `);
      assert.equal(ledgerCheck.rows.length, 0);
    });

  } finally {
    await client.end();
  }
});
