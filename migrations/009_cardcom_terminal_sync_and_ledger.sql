-- ============================================================================
-- ResortOS Cardcom Terminal (184288) Sync, Pending Matches & Deal Ledger
-- Migration: 009_cardcom_terminal_sync_and_ledger.sql
-- Enforces:
-- 1. Receipt before invoice (hard rule): persist receipt first in booking (status pending_invoice),
--    then call Cardcom CreateDocument, then finalize with document number.
-- 2. Retry/duplicates: ambiguous outcomes become reconciliation_needed (never failed).
--    Retries require an atomic ownership claim (UPDATE ... WHERE status IN (...) RETURNING).
-- 3. Idempotent migration that upgrades existing schema from server/migration_cardcom_terminal_matches.sql
-- 4. Restrictive RLS & revoked permissions (service_role only, no anon/authenticated access)
-- ============================================================================

-- Prerequisites for standalone / testing environments
CREATE TABLE IF NOT EXISTS public.hotelos_bookings (
  id TEXT PRIMARY KEY,
  guest_name TEXT,
  total_price_agorot BIGINT DEFAULT 0,
  clearing_payments JSONB DEFAULT '[]'::jsonb,
  payment_status TEXT DEFAULT 'UNPAID',
  payment_mode TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1. Cardcom Deal Ledger (Atomic claim & exactly-one invoice per deal)
CREATE TABLE IF NOT EXISTS public.cardcom_deal_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal TEXT NOT NULL DEFAULT '184288',
  deal_id TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ILS',
  external_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_invoice', -- 'pending_invoice', 'claiming_retry', 'invoiced', 'reconciliation_needed'
  document_number TEXT,
  document_url TEXT,
  error_message TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invoiced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cardcom_deal_ledger ON public.cardcom_deal_ledger (terminal, deal_id);
CREATE INDEX IF NOT EXISTS idx_cardcom_deal_ledger_booking ON public.cardcom_deal_ledger (booking_id);
CREATE INDEX IF NOT EXISTS idx_cardcom_deal_ledger_status ON public.cardcom_deal_ledger (status);

-- 2. Cardcom Seen Deals (Managed storage for synced terminal transactions)
CREATE TABLE IF NOT EXISTS public.cardcom_seen_deals (
  deal_id TEXT PRIMARY KEY,
  terminal_number TEXT NOT NULL DEFAULT '184288',
  amount NUMERIC(10, 2),
  approval_number TEXT,
  last4 TEXT,
  card_owner_name TEXT,
  entry_mode TEXT DEFAULT 'Phone',
  deal_time TIMESTAMPTZ,
  linked_booking_id TEXT,
  status TEXT DEFAULT 'seen',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additive upgrade for existing cardcom_seen_deals schema
ALTER TABLE public.cardcom_seen_deals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS uq_cardcom_seen_deals ON public.cardcom_seen_deals (terminal_number, deal_id);
CREATE INDEX IF NOT EXISTS idx_cardcom_seen_deals_deal ON public.cardcom_seen_deals (deal_id);

-- 3. Cardcom Pending Matches (Proposals for staff to link in PriorityDesk)
CREATE TABLE IF NOT EXISTS public.cardcom_pending_matches (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  terminal_number TEXT NOT NULL DEFAULT '184288',
  deal_id TEXT NOT NULL,
  amount NUMERIC(10, 2),
  last4 TEXT,
  approval TEXT,
  document_number TEXT,
  document_url TEXT,
  deal_time TIMESTAMPTZ,
  payer_name TEXT,
  is_test BOOLEAN DEFAULT false,
  candidates JSONB DEFAULT '[]'::jsonb,
  current_candidate_index INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'manual_linked', 'test', 'ignored', 'approved'
  selected_booking_id TEXT,
  guest_name TEXT,
  unit_name TEXT,
  invoice_number TEXT,
  invoice_url TEXT,
  approved_at TIMESTAMPTZ,
  payment_recorded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additive upgrade for existing cardcom_pending_matches schema
-- Fix ID mismatch: Alter id column to TEXT so both UUIDs and poller match_<deal>_<ts> strings work
ALTER TABLE public.cardcom_pending_matches ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.cardcom_pending_matches ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE public.cardcom_pending_matches ADD COLUMN IF NOT EXISTS document_number TEXT;
ALTER TABLE public.cardcom_pending_matches ADD COLUMN IF NOT EXISTS document_url TEXT;
ALTER TABLE public.cardcom_pending_matches ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;
ALTER TABLE public.cardcom_pending_matches ADD COLUMN IF NOT EXISTS guest_name TEXT;
ALTER TABLE public.cardcom_pending_matches ADD COLUMN IF NOT EXISTS unit_name TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cardcom_pending_matches ON public.cardcom_pending_matches (terminal_number, deal_id);
CREATE INDEX IF NOT EXISTS idx_cardcom_pending_matches_status ON public.cardcom_pending_matches (status);
CREATE INDEX IF NOT EXISTS idx_cardcom_pending_matches_deal ON public.cardcom_pending_matches (deal_id);

-- 4. Audit Log for Emergency Escapes & Terminal Actions
CREATE TABLE IF NOT EXISTS public.cardcom_terminal_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT,
  action TEXT NOT NULL,
  staff_id TEXT,
  staff_name TEXT,
  deal_id TEXT,
  booking_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cardcom_terminal_audit_log ADD COLUMN IF NOT EXISTS event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cardcom_terminal_audit_log_event_id ON public.cardcom_terminal_audit_log (event_id) WHERE event_id IS NOT NULL;

-- 5. Revoke permissive access & enforce strict service_role-only security
DROP POLICY IF EXISTS "lan_cardcom_seen_deals_all" ON public.cardcom_seen_deals;
DROP POLICY IF EXISTS "lan_cardcom_pending_matches_all" ON public.cardcom_pending_matches;

REVOKE ALL ON public.cardcom_seen_deals FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.cardcom_pending_matches FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.cardcom_deal_ledger FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.cardcom_terminal_audit_log FROM anon, authenticated, PUBLIC;

GRANT ALL ON public.cardcom_seen_deals TO service_role;
GRANT ALL ON public.cardcom_pending_matches TO service_role;
GRANT ALL ON public.cardcom_deal_ledger TO service_role;
GRANT ALL ON public.cardcom_terminal_audit_log TO service_role;

ALTER TABLE public.cardcom_seen_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardcom_pending_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardcom_deal_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardcom_terminal_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only cardcom_seen_deals" ON public.cardcom_seen_deals;
CREATE POLICY "Service role only cardcom_seen_deals"
ON public.cardcom_seen_deals FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role only cardcom_pending_matches" ON public.cardcom_pending_matches;
CREATE POLICY "Service role only cardcom_pending_matches"
ON public.cardcom_pending_matches FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role only cardcom_deal_ledger" ON public.cardcom_deal_ledger;
CREATE POLICY "Service role only cardcom_deal_ledger"
ON public.cardcom_deal_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role only cardcom_terminal_audit_log" ON public.cardcom_terminal_audit_log;
CREATE POLICY "Service role only cardcom_terminal_audit_log"
ON public.cardcom_terminal_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Receipt Before Invoice (Hard Rule) RPC
-- Persists the receipt in the booking and claims the deal in the ledger with status 'pending_invoice'
-- BEFORE any Cardcom CreateDocument API call is made.
CREATE OR REPLACE FUNCTION public.record_cardcom_deal_receipt(
  p_booking_id TEXT,
  p_receipt_entry JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking RECORD;
  v_ledger RECORD;
  v_clearing JSONB;
  v_deal_number TEXT;
  v_terminal TEXT;
  v_amount_ils NUMERIC;
  v_amount_agorot BIGINT;
  v_external_id TEXT;
  v_i INT;
  v_updated_clearing JSONB := '[]'::jsonb;
  v_found BOOLEAN := false;
  v_total_price_agorot BIGINT;
  v_total_paid_agorot BIGINT := 0;
  v_item JSONB;
  v_status TEXT;
  v_existing_booking_id TEXT;
BEGIN
  -- Input Validation
  IF p_booking_id IS NULL OR trim(p_booking_id) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: booking_id is required';
  END IF;

  v_deal_number := COALESCE(p_receipt_entry->>'deal_number', p_receipt_entry->>'txn');
  IF v_deal_number IS NULL OR trim(v_deal_number) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: deal_number is required';
  END IF;

  v_terminal := COALESCE(p_receipt_entry->>'terminal', '184288');
  IF v_terminal IS NULL OR trim(v_terminal) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: terminal is required';
  END IF;

  v_amount_ils := (p_receipt_entry->>'amount_ils')::NUMERIC;
  v_amount_agorot := (p_receipt_entry->>'amount_agorot')::BIGINT;
  IF (v_amount_ils IS NULL OR v_amount_ils <= 0) AND (v_amount_agorot IS NULL OR v_amount_agorot <= 0) THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: amount must be greater than zero';
  END IF;

  IF v_amount_ils IS NULL THEN
    v_amount_ils := ROUND(v_amount_agorot::NUMERIC / 100.0, 2);
  END IF;
  IF v_amount_agorot IS NULL THEN
    v_amount_agorot := ROUND(v_amount_ils * 100)::BIGINT;
  END IF;

  v_external_id := COALESCE(p_receipt_entry->>'external_id', 'deal-' || v_deal_number);

  -- 1. Lock the ledger row for the deal (claim) BEFORE checking global assignment
  SELECT * INTO v_ledger
  FROM public.cardcom_deal_ledger
  WHERE terminal = v_terminal AND deal_id = v_deal_number
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.cardcom_deal_ledger (
      terminal, deal_id, booking_id, amount, currency, external_id, status,
      claimed_at, updated_at
    ) VALUES (
      v_terminal, v_deal_number, p_booking_id, v_amount_ils, 'ILS', v_external_id,
      'pending_invoice', now(), now()
    )
    RETURNING * INTO v_ledger;
  ELSE
    IF v_ledger.booking_id <> p_booking_id THEN
      RAISE EXCEPTION 'DEAL_ALREADY_ASSIGNED: Deal % is already claimed by booking %', v_deal_number, v_ledger.booking_id;
    END IF;

    -- If deal was already invoiced, keep it invoiced (for document reuse)
    IF v_ledger.status = 'invoiced' AND v_ledger.document_number IS NOT NULL THEN
      -- Keep as invoiced
    ELSIF v_ledger.status IN ('claiming_retry', 'reconciliation_needed') THEN
      -- Do NOT reset active retry or reconciliation_needed back to pending_invoice: preserve state & ownership
    ELSIF v_ledger.status = 'pending_invoice' THEN
      UPDATE public.cardcom_deal_ledger
      SET status = 'pending_invoice', updated_at = now()
      WHERE terminal = v_terminal AND deal_id = v_deal_number;
    END IF;
  END IF;

  -- 2. Check global assignment in hotelos_bookings
  SELECT id INTO v_existing_booking_id
  FROM public.hotelos_bookings
  WHERE id <> p_booking_id
    AND clearing_payments @> jsonb_build_array(jsonb_build_object('deal_number', v_deal_number))
  LIMIT 1;

  IF v_existing_booking_id IS NOT NULL THEN
    RAISE EXCEPTION 'DEAL_ALREADY_ASSIGNED: Deal % is already assigned to booking %', v_deal_number, v_existing_booking_id;
  END IF;

  -- 3. Select and lock target booking row
  SELECT * INTO v_booking
  FROM public.hotelos_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id;
  END IF;

  v_clearing := COALESCE(v_booking.clearing_payments, '[]'::jsonb);
  IF jsonb_typeof(v_clearing) <> 'array' THEN
    v_clearing := '[]'::jsonb;
  END IF;

  -- Merge receipt entry into clearing_payments while preserving finalized fields on replay
  FOR v_i IN 0 .. (jsonb_array_length(v_clearing) - 1) LOOP
    v_item := v_clearing->v_i;
    IF (v_item->>'deal_number' = v_deal_number OR v_item->>'txn' = v_deal_number) THEN
      DECLARE
        v_merged JSONB := v_item || p_receipt_entry;
      BEGIN
        IF (v_item->>'invoice_status' = 'invoiced' OR v_item->>'document_number' IS NOT NULL OR v_item->>'invoice' IS NOT NULL) THEN
          v_merged := v_merged || jsonb_build_object(
            'invoice_status', COALESCE(NULLIF(v_item->>'invoice_status', ''), 'invoiced'),
            'document_number', COALESCE(v_item->>'document_number', v_item->>'invoice', v_merged->>'document_number'),
            'invoice', COALESCE(v_item->>'invoice', v_item->>'document_number', v_merged->>'invoice'),
            'document_url', COALESCE(v_item->>'document_url', v_item->>'invoice_url', v_merged->>'document_url'),
            'invoice_url', COALESCE(v_item->>'invoice_url', v_item->>'document_url', v_merged->>'invoice_url')
          );
        ELSIF (v_ledger.status = 'invoiced' AND v_ledger.document_number IS NOT NULL) THEN
          v_merged := v_merged || jsonb_build_object(
            'invoice_status', 'invoiced',
            'document_number', v_ledger.document_number,
            'invoice', v_ledger.document_number,
            'document_url', COALESCE(v_ledger.document_url, v_merged->>'document_url'),
            'invoice_url', COALESCE(v_ledger.document_url, v_merged->>'invoice_url')
          );
        END IF;
        v_updated_clearing := v_updated_clearing || jsonb_build_array(v_merged);
        v_found := true;
      END;
    ELSE
      v_updated_clearing := v_updated_clearing || jsonb_build_array(v_item);
    END IF;
  END LOOP;

  IF NOT v_found THEN
    v_updated_clearing := v_updated_clearing || jsonb_build_array(p_receipt_entry);
  END IF;

  -- Calculate total paid agorot (excluding unverified, failed, or rejected items)
  FOR v_i IN 0 .. (jsonb_array_length(v_updated_clearing) - 1) LOOP
    v_item := v_updated_clearing->v_i;
    IF COALESCE(v_item->>'status', '') NOT IN ('unverified', 'failed', 'rejected')
       AND COALESCE(v_item->>'verification_status', '') NOT IN ('unverified', 'failed', 'rejected') THEN
      v_total_paid_agorot := v_total_paid_agorot + COALESCE((v_item->>'amount_agorot')::BIGINT, ROUND(COALESCE((v_item->>'amount_ils')::NUMERIC, 0) * 100)::BIGINT);
    END IF;
  END LOOP;

  v_total_price_agorot := COALESCE(v_booking.total_price_agorot, 0);
  IF v_total_price_agorot > 0 THEN
    IF v_total_paid_agorot >= v_total_price_agorot THEN
      v_status := 'PAID';
    ELSIF v_total_paid_agorot > 0 THEN
      v_status := 'PARTIAL';
    ELSE
      v_status := COALESCE(v_booking.payment_status, 'UNPAID');
    END IF;
  ELSE
    IF v_total_paid_agorot > 0 THEN
      v_status := 'PAID';
    ELSE
      v_status := COALESCE(v_booking.payment_status, 'UNPAID');
    END IF;
  END IF;

  UPDATE public.hotelos_bookings
  SET clearing_payments = v_updated_clearing,
      payment_status = v_status,
      payment_mode = 'CARD',
      updated_at = now()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'payment_status', v_status,
    'total_paid_agorot', v_total_paid_agorot,
    'clearing_payments', v_updated_clearing,
    'ledger_status', v_ledger.status,
    'document_number', v_ledger.document_number,
    'document_url', v_ledger.document_url
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_cardcom_deal_receipt(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cardcom_deal_receipt(TEXT, JSONB) TO service_role;

-- Backward compatible alias for record_cardcom_deal_payment
CREATE OR REPLACE FUNCTION public.record_cardcom_deal_payment(
  p_booking_id TEXT,
  p_payment_entry JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.record_cardcom_deal_receipt(p_booking_id, p_payment_entry);
END;
$$;

REVOKE ALL ON FUNCTION public.record_cardcom_deal_payment(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cardcom_deal_payment(TEXT, JSONB) TO service_role;

-- 7. Atomic Retry Claim
-- Any retry needs an atomic ownership claim in the DB before CreateDocument
CREATE OR REPLACE FUNCTION public.claim_cardcom_deal_retry(
  p_terminal TEXT,
  p_deal_id TEXT,
  p_booking_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ledger RECORD;
BEGIN
  UPDATE public.cardcom_deal_ledger
  SET status = 'claiming_retry', updated_at = now()
  WHERE terminal = p_terminal
    AND deal_id = p_deal_id
    AND status IN ('pending_invoice', 'reconciliation_needed')
    AND booking_id = p_booking_id
  RETURNING * INTO v_ledger;

  IF NOT FOUND THEN
    -- Check if it exists with other status or other booking
    SELECT * INTO v_ledger
    FROM public.cardcom_deal_ledger
    WHERE terminal = p_terminal AND deal_id = p_deal_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'LEDGER_ENTRY_NOT_FOUND: Deal % not found in ledger', p_deal_id;
    END IF;

    IF v_ledger.booking_id <> p_booking_id THEN
      RAISE EXCEPTION 'DEAL_ALREADY_ASSIGNED: Deal % belongs to booking %', p_deal_id, v_ledger.booking_id;
    END IF;

    IF v_ledger.status = 'invoiced' THEN
      RETURN jsonb_build_object('ok', true, 'status', 'invoiced', 'document_number', v_ledger.document_number, 'document_url', v_ledger.document_url);
    END IF;

    IF v_ledger.status = 'claiming_retry' THEN
      RAISE EXCEPTION 'DEAL_CLAIM_IN_PROGRESS: Deal % is currently being retried by another worker', p_deal_id;
    END IF;

    RAISE EXCEPTION 'INVALID_CLAIM_STATE: Deal % is in status %', p_deal_id, v_ledger.status;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_ledger.status,
    'terminal', v_ledger.terminal,
    'deal_id', v_ledger.deal_id,
    'booking_id', v_ledger.booking_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_cardcom_deal_retry(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cardcom_deal_retry(TEXT, TEXT, TEXT) TO service_role;

-- 8. Finalize Invoice Document RPC
-- Saves the document number and document url on the ledger, booking clearing_payments, and pending matches
CREATE OR REPLACE FUNCTION public.finalize_cardcom_deal_invoice(
  p_booking_id TEXT,
  p_deal_number TEXT,
  p_terminal TEXT,
  p_document_number TEXT,
  p_document_url TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ledger RECORD;
  v_booking RECORD;
  v_clearing JSONB;
  v_i INT;
  v_item JSONB;
  v_found_receipt BOOLEAN := false;
  v_updated_clearing JSONB := '[]'::jsonb;
BEGIN
  -- 0. Validate input parameters
  IF p_booking_id IS NULL OR TRIM(p_booking_id) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS: p_booking_id is required';
  END IF;
  IF p_deal_number IS NULL OR TRIM(p_deal_number) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS: p_deal_number is required';
  END IF;
  IF p_terminal IS NULL OR TRIM(p_terminal) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS: p_terminal is required';
  END IF;
  IF p_document_number IS NULL OR TRIM(p_document_number) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS: p_document_number is required';
  END IF;

  -- 1. Lock ledger row and verify booking_id & document identity atomically
  SELECT * INTO v_ledger
  FROM public.cardcom_deal_ledger
  WHERE terminal = p_terminal AND deal_id = p_deal_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEDGER_ENTRY_NOT_FOUND: Terminal %, Deal % not found in ledger', p_terminal, p_deal_number;
  END IF;

  IF v_ledger.booking_id <> p_booking_id THEN
    RAISE EXCEPTION 'BOOKING_MISMATCH: Deal % is assigned to booking %, not %', p_deal_number, v_ledger.booking_id, p_booking_id;
  END IF;

  IF v_ledger.document_number IS NOT NULL AND v_ledger.document_number <> p_document_number THEN
    RAISE EXCEPTION 'DOCUMENT_MISMATCH: Deal % already finalized with doc %, cannot overwrite with %',
      p_deal_number, v_ledger.document_number, p_document_number;
  END IF;

  UPDATE public.cardcom_deal_ledger
  SET status = 'invoiced',
      document_number = p_document_number,
      document_url = COALESCE(p_document_url, document_url),
      invoiced_at = COALESCE(invoiced_at, now()),
      updated_at = now()
  WHERE terminal = p_terminal AND deal_id = p_deal_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEDGER_UPDATE_FAILED: Failed to update ledger for terminal %, deal %', p_terminal, p_deal_number;
  END IF;

  -- 2. Select and lock target booking row, verify matching receipt exists
  SELECT * INTO v_booking
  FROM public.hotelos_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: Booking % not found', p_booking_id;
  END IF;

  v_clearing := COALESCE(v_booking.clearing_payments, '[]'::jsonb);
  IF jsonb_typeof(v_clearing) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_CLEARING_PAYMENTS: Booking % clearing_payments is not an array', p_booking_id;
  END IF;

  FOR v_i IN 0 .. (jsonb_array_length(v_clearing) - 1) LOOP
    v_item := v_clearing->v_i;
    IF (v_item->>'deal_number' = p_deal_number OR v_item->>'txn' = p_deal_number) THEN
      IF (v_item->>'document_number' IS NOT NULL AND v_item->>'document_number' <> p_document_number)
         OR (v_item->>'invoice' IS NOT NULL AND v_item->>'invoice' <> p_document_number) THEN
        RAISE EXCEPTION 'DOCUMENT_MISMATCH: Receipt in booking % already has doc %, cannot overwrite with %',
          p_booking_id, COALESCE(v_item->>'document_number', v_item->>'invoice'), p_document_number;
      END IF;

      v_updated_clearing := v_updated_clearing || jsonb_build_array(v_item || jsonb_build_object(
        'invoice', p_document_number,
        'invoice_url', COALESCE(p_document_url, v_item->>'invoice_url'),
        'document_number', p_document_number,
        'document_url', COALESCE(p_document_url, v_item->>'document_url'),
        'invoice_status', 'invoiced'
      ));
      v_found_receipt := true;
    ELSE
      v_updated_clearing := v_updated_clearing || jsonb_build_array(v_item);
    END IF;
  END LOOP;

  IF NOT v_found_receipt THEN
    RAISE EXCEPTION 'RECEIPT_NOT_FOUND: Deal % receipt not found in booking % clearing_payments', p_deal_number, p_booking_id;
  END IF;

  UPDATE public.hotelos_bookings
  SET clearing_payments = v_updated_clearing,
      updated_at = now()
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_UPDATE_FAILED: Failed to update booking % clearing_payments', p_booking_id;
  END IF;

  -- 3. Update pending matches
  UPDATE public.cardcom_pending_matches
  SET status = 'manual_linked',
      selected_booking_id = p_booking_id,
      invoice_number = p_document_number,
      invoice_url = COALESCE(p_document_url, invoice_url),
      document_number = p_document_number,
      document_url = COALESCE(p_document_url, document_url),
      approved_at = COALESCE(approved_at, now()),
      payment_recorded_at = COALESCE(payment_recorded_at, now()),
      updated_at = now()
  WHERE terminal_number = p_terminal AND deal_id = p_deal_number;

  RETURN jsonb_build_object('ok', true, 'status', 'invoiced', 'document_number', p_document_number);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_cardcom_deal_invoice(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_cardcom_deal_invoice(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 9. Mark Reconciliation Needed RPC
-- Ambiguous outcomes (timeout, network error, missing doc number) become reconciliation_needed (never failed)
DROP FUNCTION IF EXISTS public.mark_cardcom_deal_reconciliation_needed(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.mark_cardcom_deal_reconciliation_needed(
  p_terminal TEXT,
  p_deal_id TEXT,
  p_error_message TEXT,
  p_booking_id TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.cardcom_deal_ledger
  SET status = 'reconciliation_needed',
      error_message = p_error_message,
      updated_at = now()
  WHERE terminal = p_terminal AND deal_id = p_deal_id;

  IF NOT FOUND AND p_booking_id IS NOT NULL AND p_amount IS NOT NULL THEN
    INSERT INTO public.cardcom_deal_ledger (
      terminal, deal_id, booking_id, amount, currency, external_id, status, error_message, updated_at
    ) VALUES (
      p_terminal, p_deal_id, p_booking_id, p_amount, 'ILS', 'deal-' || p_deal_id, 'reconciliation_needed', p_error_message, now()
    )
    ON CONFLICT (terminal, deal_id) DO UPDATE
    SET status = 'reconciliation_needed',
        error_message = p_error_message,
        updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'reconciliation_needed');
END;
$$;

REVOKE ALL ON FUNCTION public.mark_cardcom_deal_reconciliation_needed(TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_cardcom_deal_reconciliation_needed(TEXT, TEXT, TEXT, TEXT, NUMERIC) TO service_role;

-- 10. Transactional Storage Persistence RPC (persist seen + pending together)
-- Preserves staff statuses (manual_linked, test, ignored, approved)
CREATE OR REPLACE FUNCTION public.persist_cardcom_sync(
  p_seen JSONB,
  p_pending JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item JSONB;
  v_seen_count INT := 0;
  v_pending_count INT := 0;
BEGIN
  -- Upsert seen deals
  IF p_seen IS NOT NULL AND jsonb_typeof(p_seen) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_seen) LOOP
      INSERT INTO public.cardcom_seen_deals (
        terminal_number, deal_id, amount, approval_number, last4,
        card_owner_name, entry_mode, deal_time, linked_booking_id, status, updated_at
      ) VALUES (
        COALESCE(v_item->>'terminal_number', '184288'),
        v_item->>'deal_id',
        (v_item->>'amount')::NUMERIC,
        v_item->>'approval_number',
        v_item->>'last4',
        v_item->>'card_owner_name',
        COALESCE(v_item->>'entry_mode', 'Phone'),
        (v_item->>'deal_time')::TIMESTAMPTZ,
        v_item->>'linked_booking_id',
        COALESCE(v_item->>'status', 'seen'),
        now()
      )
      ON CONFLICT (terminal_number, deal_id) DO UPDATE SET
        amount = COALESCE(EXCLUDED.amount, cardcom_seen_deals.amount),
        approval_number = COALESCE(EXCLUDED.approval_number, cardcom_seen_deals.approval_number),
        last4 = COALESCE(EXCLUDED.last4, cardcom_seen_deals.last4),
        card_owner_name = COALESCE(EXCLUDED.card_owner_name, cardcom_seen_deals.card_owner_name),
        entry_mode = COALESCE(EXCLUDED.entry_mode, cardcom_seen_deals.entry_mode),
        deal_time = COALESCE(EXCLUDED.deal_time, cardcom_seen_deals.deal_time),
        linked_booking_id = COALESCE(EXCLUDED.linked_booking_id, cardcom_seen_deals.linked_booking_id),
        status = CASE
          WHEN cardcom_seen_deals.status IN ('linked', 'test', 'ignored') THEN cardcom_seen_deals.status
          ELSE EXCLUDED.status
        END,
        updated_at = now();
      v_seen_count := v_seen_count + 1;
    END LOOP;
  END IF;

  -- Upsert pending matches (strictly preserving staff-assigned statuses)
  IF p_pending IS NOT NULL AND jsonb_typeof(p_pending) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_pending) LOOP
      INSERT INTO public.cardcom_pending_matches (
        id, terminal_number, deal_id, amount, last4, approval,
        document_number, document_url, deal_time, payer_name, is_test,
        candidates, current_candidate_index, status, selected_booking_id,
        guest_name, unit_name, invoice_number, invoice_url, approved_at, payment_recorded_at, updated_at
      ) VALUES (
        COALESCE(v_item->>'id', 'match_' || (v_item->>'deal_id') || '_' || extract(epoch from now())::bigint),
        COALESCE(v_item->>'terminal_number', '184288'),
        v_item->>'deal_id',
        (v_item->>'amount')::NUMERIC,
        v_item->>'last4',
        v_item->>'approval',
        v_item->>'document_number',
        v_item->>'document_url',
        (v_item->>'deal_time')::TIMESTAMPTZ,
        v_item->>'payer_name',
        COALESCE((v_item->>'is_test')::BOOLEAN, false),
        COALESCE(v_item->'candidates', '[]'::jsonb),
        COALESCE((v_item->>'current_candidate_index')::INT, 0),
        COALESCE(v_item->>'status', 'pending'),
        v_item->>'selected_booking_id',
        v_item->>'guest_name',
        v_item->>'unit_name',
        v_item->>'invoice_number',
        v_item->>'invoice_url',
        (v_item->>'approved_at')::TIMESTAMPTZ,
        (v_item->>'payment_recorded_at')::TIMESTAMPTZ,
        now()
      )
      ON CONFLICT (terminal_number, deal_id) DO UPDATE SET
        amount = COALESCE(EXCLUDED.amount, cardcom_pending_matches.amount),
        last4 = COALESCE(EXCLUDED.last4, cardcom_pending_matches.last4),
        approval = COALESCE(EXCLUDED.approval, cardcom_pending_matches.approval),
        document_number = COALESCE(EXCLUDED.document_number, cardcom_pending_matches.document_number),
        document_url = COALESCE(EXCLUDED.document_url, cardcom_pending_matches.document_url),
        payer_name = COALESCE(EXCLUDED.payer_name, cardcom_pending_matches.payer_name),
        candidates = CASE
          WHEN cardcom_pending_matches.status IN ('manual_linked', 'test', 'ignored', 'approved') THEN cardcom_pending_matches.candidates
          ELSE COALESCE(EXCLUDED.candidates, cardcom_pending_matches.candidates)
        END,
        status = CASE
          WHEN cardcom_pending_matches.status IN ('manual_linked', 'test', 'ignored', 'approved') THEN cardcom_pending_matches.status
          ELSE EXCLUDED.status
        END,
        selected_booking_id = COALESCE(cardcom_pending_matches.selected_booking_id, EXCLUDED.selected_booking_id),
        guest_name = COALESCE(cardcom_pending_matches.guest_name, EXCLUDED.guest_name),
        unit_name = COALESCE(cardcom_pending_matches.unit_name, EXCLUDED.unit_name),
        invoice_number = COALESCE(cardcom_pending_matches.invoice_number, EXCLUDED.invoice_number),
        invoice_url = COALESCE(cardcom_pending_matches.invoice_url, EXCLUDED.invoice_url),
        approved_at = COALESCE(cardcom_pending_matches.approved_at, EXCLUDED.approved_at),
        payment_recorded_at = COALESCE(cardcom_pending_matches.payment_recorded_at, EXCLUDED.payment_recorded_at),
        updated_at = now();
      v_pending_count := v_pending_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'seen_count', v_seen_count, 'pending_count', v_pending_count);
END;
$$;

REVOKE ALL ON FUNCTION public.persist_cardcom_sync(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_cardcom_sync(JSONB, JSONB) TO service_role;
