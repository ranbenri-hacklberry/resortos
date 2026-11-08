-- ============================================================================
-- ResortOS Cardcom Terminal (184288) Sync, Pending Matches & Deal Ledger
-- Migration: 009_cardcom_terminal_sync_and_ledger.sql
-- Enforces:
-- 1. Upgrades existing schema from server/migration_cardcom_terminal_matches.sql
--    (additive ALTER TABLE for seen_deals and pending_matches, converts pending_matches.id to text)
-- 2. Restrictive RLS & revoked permissions (service_role only, no anon/authenticated access)
-- 3. Atomic booking clearing_payment update RPC record_cardcom_deal_payment with FOR UPDATE locks
--    (ledger claimed and locked BEFORE checking global assignment)
-- ============================================================================

-- 1. Cardcom Deal Ledger (Atomic claim & exactly-one invoice per deal)
CREATE TABLE IF NOT EXISTS public.cardcom_deal_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal TEXT NOT NULL DEFAULT '184288',
  deal_id TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ILS',
  external_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claiming', -- 'claiming', 'invoiced', 'reconciliation_needed', 'failed'
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
  action TEXT NOT NULL,
  staff_id TEXT,
  staff_name TEXT,
  deal_id TEXT,
  booking_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- 6. Atomic Booking Clearing Payment Append Function
-- Avoids read-modify-write races when recording payments on hotelos_bookings
CREATE OR REPLACE FUNCTION public.record_cardcom_deal_payment(
  p_booking_id TEXT,
  p_payment_entry JSONB
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
  v_doc_number TEXT;
  v_doc_url TEXT;
  v_external_id TEXT;
  v_idx INT;
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

  v_deal_number := COALESCE(p_payment_entry->>'deal_number', p_payment_entry->>'txn');
  IF v_deal_number IS NULL OR trim(v_deal_number) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: deal_number is required';
  END IF;

  v_terminal := COALESCE(p_payment_entry->>'terminal', '184288');
  IF v_terminal IS NULL OR trim(v_terminal) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: terminal is required';
  END IF;

  v_amount_ils := (p_payment_entry->>'amount_ils')::NUMERIC;
  v_amount_agorot := (p_payment_entry->>'amount_agorot')::BIGINT;
  IF (v_amount_ils IS NULL OR v_amount_ils <= 0) AND (v_amount_agorot IS NULL OR v_amount_agorot <= 0) THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: amount must be greater than zero';
  END IF;

  IF v_amount_ils IS NULL THEN
    v_amount_ils := ROUND(v_amount_agorot::NUMERIC / 100.0, 2);
  END IF;
  IF v_amount_agorot IS NULL THEN
    v_amount_agorot := ROUND(v_amount_ils * 100)::BIGINT;
  END IF;

  v_doc_number := COALESCE(p_payment_entry->>'document_number', p_payment_entry->>'invoice');
  v_doc_url := COALESCE(p_payment_entry->>'document_url', p_payment_entry->>'invoice_url');
  v_external_id := COALESCE(p_payment_entry->>'external_id', 'deal-' || v_deal_number);

  -- 1. Lock the ledger row for the deal (claim) BEFORE checking global assignment
  SELECT * INTO v_ledger
  FROM public.cardcom_deal_ledger
  WHERE terminal = v_terminal AND deal_id = v_deal_number
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.cardcom_deal_ledger (
      terminal, deal_id, booking_id, amount, currency, external_id, status,
      document_number, document_url, claimed_at, invoiced_at, updated_at
    ) VALUES (
      v_terminal, v_deal_number, p_booking_id, v_amount_ils, 'ILS', v_external_id,
      CASE WHEN v_doc_number IS NOT NULL AND v_doc_number <> '' THEN 'invoiced' ELSE 'claiming' END,
      v_doc_number, v_doc_url, now(),
      CASE WHEN v_doc_number IS NOT NULL AND v_doc_number <> '' THEN now() ELSE NULL END,
      now()
    )
    RETURNING * INTO v_ledger;
  ELSE
    IF v_ledger.booking_id <> p_booking_id THEN
      RAISE EXCEPTION 'DEAL_ALREADY_ASSIGNED: Deal % is already claimed by booking %', v_deal_number, v_ledger.booking_id;
    END IF;

    UPDATE public.cardcom_deal_ledger
    SET document_number = COALESCE(v_doc_number, v_ledger.document_number),
        document_url = COALESCE(v_doc_url, v_ledger.document_url),
        status = CASE WHEN COALESCE(v_doc_number, v_ledger.document_number) IS NOT NULL THEN 'invoiced' ELSE v_ledger.status END,
        invoiced_at = CASE WHEN COALESCE(v_doc_number, v_ledger.document_number) IS NOT NULL AND v_ledger.invoiced_at IS NULL THEN now() ELSE v_ledger.invoiced_at END,
        updated_at = now()
    WHERE terminal = v_terminal AND deal_id = v_deal_number;
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

  -- Check if deal already exists in clearing_payments array
  FOR v_i IN 0 .. (jsonb_array_length(v_clearing) - 1) LOOP
    v_item := v_clearing->v_i;
    IF (v_item->>'deal_number' = v_deal_number OR v_item->>'txn' = v_deal_number) THEN
      v_updated_clearing := v_updated_clearing || jsonb_build_array(v_item || p_payment_entry);
      v_found := true;
    ELSE
      v_updated_clearing := v_updated_clearing || jsonb_build_array(v_item);
    END IF;
  END LOOP;

  IF NOT v_found THEN
    v_updated_clearing := v_updated_clearing || jsonb_build_array(p_payment_entry);
  END IF;

  -- Calculate total paid agorot
  FOR v_i IN 0 .. (jsonb_array_length(v_updated_clearing) - 1) LOOP
    v_item := v_updated_clearing->v_i;
    v_total_paid_agorot := v_total_paid_agorot + COALESCE((v_item->>'amount_agorot')::BIGINT, ROUND(COALESCE((v_item->>'amount_ils')::NUMERIC, 0) * 100)::BIGINT);
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
    'clearing_payments', v_updated_clearing
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_cardcom_deal_payment(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cardcom_deal_payment(TEXT, JSONB) TO service_role;

-- 7. Transactional Storage Persistence RPC (persist seen + pending together)
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

  -- Upsert pending matches (preserving already-resolved statuses)
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
