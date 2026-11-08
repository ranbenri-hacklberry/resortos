-- ============================================================================
-- ResortOS Cardcom Terminal (184288) Sync, Pending Matches & Deal Ledger
-- Migration: 009_cardcom_terminal_sync_and_ledger.sql
-- Enforces:
-- 1. UNIQUE(terminal, deal_id) to guarantee exactly-one deal assignment globally
-- 2. Restrictive RLS (service role only) for terminal data
-- 3. Atomic booking clearing_payment update function to prevent read-modify-write races
-- ============================================================================

-- 1. Cardcom Deal Ledger (Atomic claim & exactly-one invoice per deal)
CREATE TABLE IF NOT EXISTS cardcom_deal_ledger (
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cardcom_deal_ledger UNIQUE (terminal, deal_id)
);

CREATE INDEX IF NOT EXISTS idx_cardcom_deal_ledger_booking ON cardcom_deal_ledger (booking_id);
CREATE INDEX IF NOT EXISTS idx_cardcom_deal_ledger_status ON cardcom_deal_ledger (status);

-- Restrictive RLS: Service role only
ALTER TABLE cardcom_deal_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only cardcom_deal_ledger" ON cardcom_deal_ledger;
CREATE POLICY "Service role only cardcom_deal_ledger"
ON cardcom_deal_ledger
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. Cardcom Seen Deals (Managed storage for synced terminal transactions)
CREATE TABLE IF NOT EXISTS cardcom_seen_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_number TEXT NOT NULL DEFAULT '184288',
  deal_id TEXT NOT NULL,
  amount NUMERIC(10, 2),
  approval_number TEXT,
  last4 TEXT,
  card_owner_name TEXT,
  entry_mode TEXT,
  deal_time TIMESTAMPTZ,
  linked_booking_id TEXT,
  status TEXT DEFAULT 'seen',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cardcom_seen_deals UNIQUE (terminal_number, deal_id)
);

CREATE INDEX IF NOT EXISTS idx_cardcom_seen_deals_deal ON cardcom_seen_deals (deal_id);

ALTER TABLE cardcom_seen_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only cardcom_seen_deals" ON cardcom_seen_deals;
CREATE POLICY "Service role only cardcom_seen_deals"
ON cardcom_seen_deals
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. Cardcom Pending Matches (Proposals for staff to link in PriorityDesk)
CREATE TABLE IF NOT EXISTS cardcom_pending_matches (
  id TEXT PRIMARY KEY,
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
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'manual_linked', 'test', 'ignored'
  selected_booking_id TEXT,
  guest_name TEXT,
  unit_name TEXT,
  invoice_number TEXT,
  invoice_url TEXT,
  approved_at TIMESTAMPTZ,
  payment_recorded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cardcom_pending_matches UNIQUE (terminal_number, deal_id)
);

CREATE INDEX IF NOT EXISTS idx_cardcom_pending_matches_status ON cardcom_pending_matches (status);
CREATE INDEX IF NOT EXISTS idx_cardcom_pending_matches_deal ON cardcom_pending_matches (deal_id);

ALTER TABLE cardcom_pending_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only cardcom_pending_matches" ON cardcom_pending_matches;
CREATE POLICY "Service role only cardcom_pending_matches"
ON cardcom_pending_matches
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Audit Log for Emergency Escapes & Terminal Actions
CREATE TABLE IF NOT EXISTS cardcom_terminal_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  staff_id TEXT,
  staff_name TEXT,
  deal_id TEXT,
  booking_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cardcom_terminal_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only cardcom_terminal_audit_log" ON cardcom_terminal_audit_log;
CREATE POLICY "Service role only cardcom_terminal_audit_log"
ON cardcom_terminal_audit_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. Atomic Booking Clearing Payment Append Function
-- Avoids read-modify-write races when recording payments on hotelos_bookings
CREATE OR REPLACE FUNCTION record_cardcom_deal_payment(
  p_booking_id TEXT,
  p_payment_entry JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking RECORD;
  v_clearing JSONB;
  v_deal_number TEXT;
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
  v_deal_number := p_payment_entry->>'deal_number';

  -- Check global assignment: Is this deal already recorded on a different booking?
  IF v_deal_number IS NOT NULL AND v_deal_number <> '' THEN
    SELECT id INTO v_existing_booking_id
    FROM hotelos_bookings
    WHERE id <> p_booking_id
      AND clearing_payments @> jsonb_build_array(jsonb_build_object('deal_number', v_deal_number))
    LIMIT 1;

    IF v_existing_booking_id IS NOT NULL THEN
      RAISE EXCEPTION 'DEAL_ALREADY_ASSIGNED: Deal % is already assigned to booking %', v_deal_number, v_existing_booking_id;
    END IF;
  END IF;

  -- Select and lock booking row
  SELECT * INTO v_booking
  FROM hotelos_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id;
  END IF;

  v_clearing := COALESCE(v_booking.clearing_payments, '[]'::jsonb);
  IF jsonb_typeof(v_clearing) <> 'array' THEN
    v_clearing := '[]'::jsonb;
  END IF;

  -- Check if deal already exists in array
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

  UPDATE hotelos_bookings
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
