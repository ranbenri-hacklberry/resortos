-- Basalt (BSLT). Closed-loop stored value for the Mialis cart and Mialis Resort.
-- 1 BSLT = 1 ILS. amount_bslt is an integer count of minor units: 100 = 1.00 BSLT.
-- Not a tradable token. No customer-to-customer transfer. No cash-out to shekels.
-- The ledger is append-only. Balance is the sum of amount_bslt, never a mutable column.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.basalt_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  phone text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  consent_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  pin_hash text,
  nfc_uid text,
  page_key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS basalt_wallets_phone_idx ON public.basalt_wallets (phone);
CREATE UNIQUE INDEX IF NOT EXISTS basalt_wallets_nfc_idx ON public.basalt_wallets (nfc_uid) WHERE nfc_uid IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.basalt_ledger (
  seq bigserial PRIMARY KEY,
  id text NOT NULL UNIQUE,
  wallet_id uuid NOT NULL REFERENCES public.basalt_wallets (id),
  type text NOT NULL CHECK (type IN ('topup', 'bonus', 'purchase', 'refund', 'adjustment')),
  amount_bslt integer NOT NULL CHECK (amount_bslt <> 0),
  prev_hash text NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  hash text NOT NULL UNIQUE CHECK (hash ~ '^[0-9a-f]{64}$'),
  server_signature text NOT NULL,
  created_at text NOT NULL,
  ref text NOT NULL DEFAULT '',
  idempotency_key text,
  canonical text NOT NULL,
  mock boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS basalt_ledger_prev_idx ON public.basalt_ledger (prev_hash);
CREATE UNIQUE INDEX IF NOT EXISTS basalt_ledger_idem_idx ON public.basalt_ledger (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS basalt_ledger_wallet_idx ON public.basalt_ledger (wallet_id);

CREATE TABLE IF NOT EXISTS public.basalt_bonus_tiers (
  id serial PRIMARY KEY,
  pay_bslt integer NOT NULL CHECK (pay_bslt > 0),
  credit_bslt integer NOT NULL CHECK (credit_bslt >= pay_bslt),
  active boolean NOT NULL DEFAULT true
);

INSERT INTO public.basalt_bonus_tiers (pay_bslt, credit_bslt)
SELECT pay, credit
FROM (VALUES (10000, 10000), (20000, 22000), (50000, 57500)) AS v(pay, credit)
WHERE NOT EXISTS (SELECT 1 FROM public.basalt_bonus_tiers);

COMMENT ON TABLE public.basalt_ledger IS
  'Append-only Basalt (BSLT) ledger. 100 amount_bslt = 1 BSLT = 1 ILS. No transfer, no cash-out.';
COMMENT ON COLUMN public.basalt_ledger.amount_bslt IS
  'Signed minor units. 100 = 1.00 BSLT = 1.00 ILS. Purchases are negative.';
COMMENT ON COLUMN public.basalt_ledger.server_signature IS
  'Ed25519 over the canonical JSON. The private key lives in BASALT_ED25519_PRIVATE_KEY, never in this table.';

CREATE OR REPLACE FUNCTION public.basalt_ledger_deny_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'basalt_ledger is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS basalt_ledger_no_update ON public.basalt_ledger;
CREATE TRIGGER basalt_ledger_no_update
  BEFORE UPDATE OR DELETE ON public.basalt_ledger
  FOR EACH ROW
  EXECUTE PROCEDURE public.basalt_ledger_deny_mutation();

CREATE OR REPLACE FUNCTION public.basalt_ledger_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tip text;
  bal integer;
BEGIN
  IF encode(digest(convert_to(NEW.canonical, 'UTF8'), 'sha256'), 'hex') IS DISTINCT FROM NEW.hash THEN
    RAISE EXCEPTION 'BAD_HASH';
  END IF;
  IF NEW.type IN ('topup', 'bonus', 'refund') AND NEW.amount_bslt <= 0 THEN
    RAISE EXCEPTION 'SIGN';
  END IF;
  IF NEW.type = 'purchase' AND NEW.amount_bslt >= 0 THEN
    RAISE EXCEPTION 'SIGN';
  END IF;
  IF NEW.amount_bslt = 0 THEN
    RAISE EXCEPTION 'SIGN';
  END IF;
  SELECT hash INTO tip FROM public.basalt_ledger ORDER BY seq DESC LIMIT 1;
  IF tip IS NULL THEN
    IF NEW.prev_hash IS DISTINCT FROM repeat('0', 64) THEN
      RAISE EXCEPTION 'GENESIS';
    END IF;
  ELSIF tip IS DISTINCT FROM NEW.prev_hash THEN
    RAISE EXCEPTION 'FORK';
  END IF;
  IF NEW.amount_bslt < 0 THEN
    SELECT coalesce(sum(amount_bslt), 0) INTO bal
    FROM public.basalt_ledger
    WHERE wallet_id = NEW.wallet_id;
    IF bal + NEW.amount_bslt < 0 THEN
      RAISE EXCEPTION 'INSUFFICIENT';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS basalt_ledger_check_insert ON public.basalt_ledger;
CREATE TRIGGER basalt_ledger_check_insert
  BEFORE INSERT ON public.basalt_ledger
  FOR EACH ROW
  EXECUTE PROCEDURE public.basalt_ledger_before_insert();

CREATE OR REPLACE FUNCTION public.basalt_append(
  p_id text,
  p_wallet_id uuid,
  p_type text,
  p_amount_bslt integer,
  p_prev_hash text,
  p_hash text,
  p_server_signature text,
  p_created_at text,
  p_ref text,
  p_idempotency_key text,
  p_canonical text,
  p_mock boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(4815162342);
  IF p_idempotency_key IS NOT NULL AND length(p_idempotency_key) > 0 THEN
    SELECT to_jsonb(l.*) INTO existing
    FROM public.basalt_ledger l
    WHERE l.idempotency_key = p_idempotency_key;
    IF existing IS NOT NULL THEN
      RETURN jsonb_build_object('idempotent', true, 'row', existing);
    END IF;
  END IF;

  INSERT INTO public.basalt_ledger (
    id, wallet_id, type, amount_bslt, prev_hash, hash, server_signature,
    created_at, ref, idempotency_key, canonical, mock
  ) VALUES (
    p_id, p_wallet_id, p_type, p_amount_bslt, p_prev_hash, p_hash, p_server_signature,
    p_created_at, coalesce(p_ref, ''), NULLIF(p_idempotency_key, ''), p_canonical, coalesce(p_mock, false)
  );

  SELECT to_jsonb(l.*) INTO existing FROM public.basalt_ledger l WHERE l.id = p_id;
  RETURN jsonb_build_object('idempotent', false, 'row', existing);
END;
$$;

REVOKE ALL ON FUNCTION public.basalt_append(text, uuid, text, integer, text, text, text, text, text, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.basalt_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.basalt_wallets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.basalt_bonus_tiers FROM PUBLIC, anon, authenticated;

ALTER TABLE public.basalt_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.basalt_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.basalt_bonus_tiers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.basalt_wallets TO service_role;
    GRANT SELECT, INSERT ON TABLE public.basalt_ledger TO service_role;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.basalt_bonus_tiers TO service_role;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
    GRANT EXECUTE ON FUNCTION public.basalt_append(text, uuid, text, integer, text, text, text, text, text, text, text, boolean) TO service_role;
  END IF;
END $$;
