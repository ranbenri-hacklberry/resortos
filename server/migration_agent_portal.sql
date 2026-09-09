-- External sales-agent portal: isolated auth, sanitized availability, 15-minute soft lock.
-- Aligns with hotelos_bookings (text ids, agorot). Agents never SELECT guest PII.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.resort_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  commission_rate numeric NOT NULL DEFAULT 0.10
    CHECK (commission_rate >= 0 AND commission_rate <= 1),
  is_active boolean NOT NULL DEFAULT true,
  pin_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS resort_agents_phone_uidx
  ON public.resort_agents (regexp_replace(phone, '\D', '', 'g'))
  WHERE is_active IS DISTINCT FROM false;

CREATE UNIQUE INDEX IF NOT EXISTS resort_agents_email_uidx
  ON public.resort_agents (lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE TABLE IF NOT EXISTS public.resort_agent_sessions (
  token_hash text PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES public.resort_agents(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resort_agent_sessions_agent_idx
  ON public.resort_agent_sessions (agent_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.resort_agents(id) ON DELETE CASCADE,
  booking_id text NOT NULL REFERENCES public.hotelos_bookings(id) ON DELETE CASCADE,
  commission_amount_agorot bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING_PAYOUT'
    CHECK (status IN ('PENDING_PAYOUT', 'PAID')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_commissions_booking_uidx
  ON public.agent_commissions (booking_id);

ALTER TABLE public.hotelos_bookings
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.resort_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS hyp_deal_id text;

CREATE OR REPLACE FUNCTION public.agent_normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.release_expired_agent_locks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.hotelos_bookings
  SET
    booking_status = 'CANCELED',
    deleted_at = COALESCE(deleted_at, now()),
    cancellation_reason = COALESCE(NULLIF(cancellation_reason, ''), 'agent_lock_expired'),
    updated_at = now()
  WHERE channel_source = 'AGENT'
    AND booking_status = 'PENDING'
    AND payment_status = 'UNPAID'
    AND deleted_at IS NULL
    AND locked_until IS NOT NULL
    AND locked_until < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sanitized_availability(p_start_date date, p_end_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := COALESCE(p_start_date, CURRENT_DATE);
  v_to date := COALESCE(p_end_date, CURRENT_DATE + 60);
BEGIN
  PERFORM public.release_expired_agent_locks();
  IF v_to <= v_from THEN
    v_to := v_from + 1;
  END IF;
  RETURN jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'units', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'cabin_id', u.id,
        'cabin_name', u.name,
        'base_price', ROUND(COALESCE(u.base_price_agorot, 85000) / 100.0, 2),
        'base_price_agorot', COALESCE(u.base_price_agorot, 85000),
        'property_id', u.property_id,
        'sort_order', u.sort_order
      ) ORDER BY u.sort_order, u.name)
      FROM public.resort_units u
      WHERE u.is_active IS DISTINCT FROM false
    ), '[]'::jsonb),
    'blocked', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'cabin_id', b.unit_id,
        'start_date', b.check_in_date,
        'end_date', b.check_out_date
      ))
      FROM public.hotelos_bookings b
      WHERE b.deleted_at IS NULL
        AND b.booking_status NOT IN ('CANCELED', 'CHECKED_OUT')
        AND b.check_in_date < v_to
        AND b.check_out_date > v_from
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_agent_soft_lock(
  p_agent_id uuid,
  p_cabin_id text,
  p_start_date date,
  p_end_date date,
  p_guest_name text,
  p_guest_phone text,
  p_price bigint,
  p_deposit bigint,
  p_notes text DEFAULT NULL,
  p_adults integer DEFAULT 2,
  p_children integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent public.resort_agents%ROWTYPE;
  v_booking_id text;
  v_token text;
  v_tenant uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  PERFORM public.release_expired_agent_locks();

  SELECT * INTO v_agent
  FROM public.resort_agents
  WHERE id = p_agent_id AND is_active IS DISTINCT FROM false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENT_INACTIVE';
  END IF;

  IF p_cabin_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_FIELDS';
  END IF;
  IF p_end_date <= p_start_date THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE';
  END IF;
  IF length(trim(COALESCE(p_guest_name, ''))) < 2 THEN
    RAISE EXCEPTION 'MISSING_GUEST_NAME';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_tenant::text || ':' || p_cabin_id));

  IF EXISTS (
    SELECT 1 FROM public.hotelos_bookings
    WHERE tenant_id = v_tenant
      AND unit_id = p_cabin_id
      AND deleted_at IS NULL
      AND booking_status NOT IN ('CANCELED', 'CHECKED_OUT')
      AND check_in_date < p_end_date
      AND check_out_date > p_start_date
  ) THEN
    RAISE EXCEPTION 'DATES_OVERLAP_CONFLICT';
  END IF;

  v_booking_id := 'agt_' || p_cabin_id || '_' || to_char(p_start_date, 'YYYYMMDD') || '_' || substr(md5(random()::text), 1, 4);
  v_token := 'tok_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.hotelos_bookings (
    id, tenant_id, unit_id, guest_name, guest_phone,
    check_in_date, check_out_date, adults_count, children_count,
    total_price_agorot, deposit_agorot, booking_status, payment_status,
    payment_mode, channel_source, checkout_token, special_requests,
    agent_id, locked_until, created_at, updated_at
  ) VALUES (
    v_booking_id, v_tenant, p_cabin_id, trim(p_guest_name),
    public.agent_normalize_phone(p_guest_phone),
    p_start_date, p_end_date,
    COALESCE(p_adults, 2), COALESCE(p_children, 0),
    COALESCE(p_price, 0), COALESCE(p_deposit, 0),
    'PENDING', 'UNPAID', 'CREDIT_DEPOSIT', 'AGENT', v_token,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    p_agent_id, now() + interval '15 minutes', now(), now()
  );

  RETURN jsonb_build_object(
    'booking_id', v_booking_id,
    'checkout_token', v_token,
    'locked_until', now() + interval '15 minutes',
    'cabin_id', p_cabin_id,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'total_price_agorot', COALESCE(p_price, 0),
    'deposit_agorot', COALESCE(p_deposit, 0),
    'commission_agorot', ROUND(COALESCE(p_price, 0) * v_agent.commission_rate),
    'commission_rate', v_agent.commission_rate
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_agent_booking_paid(
  p_booking_id text,
  p_hyp_deal_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.hotelos_bookings%ROWTYPE;
  v_rate numeric;
  v_amount bigint;
BEGIN
  SELECT * INTO b FROM public.hotelos_bookings WHERE id = p_booking_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  UPDATE public.hotelos_bookings
  SET
    booking_status = 'CONFIRMED',
    payment_status = 'DEPOSIT_PAID',
    locked_until = NULL,
    hyp_deal_id = COALESCE(NULLIF(p_hyp_deal_id, ''), hyp_deal_id),
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO b;

  IF b.agent_id IS NOT NULL THEN
    SELECT commission_rate INTO v_rate FROM public.resort_agents WHERE id = b.agent_id;
    v_amount := ROUND(COALESCE(b.total_price_agorot, 0) * COALESCE(v_rate, 0.10));
    INSERT INTO public.agent_commissions (agent_id, booking_id, commission_amount_agorot, status)
    VALUES (b.agent_id, b.id, v_amount, 'PENDING_PAYOUT')
    ON CONFLICT (booking_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'booking_id', b.id,
    'status', b.booking_status,
    'payment_status', b.payment_status,
    'hyp_deal_id', b.hyp_deal_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_login(p_phone text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_agent public.resort_agents%ROWTYPE;
  v_digits text;
  v_phone text;
  v_token text;
BEGIN
  v_phone := public.agent_normalize_phone(p_phone);
  v_digits := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  IF length(v_digits) <> 4 OR length(v_phone) < 9 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_agent
  FROM public.resort_agents
  WHERE is_active IS DISTINCT FROM false
    AND pin_hash IS NOT NULL
    AND public.agent_normalize_phone(phone) = v_phone
    AND pin_hash = crypt(v_digits, pin_hash)
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.resort_agent_sessions (token_hash, agent_id, expires_at)
  VALUES (encode(digest(v_token, 'sha256'), 'hex'), v_agent.id, now() + interval '14 days');
  RETURN jsonb_build_object(
    'token', v_token,
    'agent', jsonb_build_object(
      'id', v_agent.id,
      'name', v_agent.name,
      'phone', v_agent.phone,
      'commission_rate', v_agent.commission_rate
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_from_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_agent public.resort_agents%ROWTYPE;
BEGIN
  IF COALESCE(p_token, '') = '' THEN
    RETURN NULL;
  END IF;
  SELECT a.* INTO v_agent
  FROM public.resort_agent_sessions s
  JOIN public.resort_agents a ON a.id = s.agent_id
  WHERE s.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    AND s.expires_at > now()
    AND a.is_active IS DISTINCT FROM false
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', v_agent.id,
    'name', v_agent.name,
    'phone', v_agent.phone,
    'commission_rate', v_agent.commission_rate
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_set_pin(p_agent_id uuid, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_digits text;
BEGIN
  v_digits := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  IF length(v_digits) <> 4 THEN
    RETURN false;
  END IF;
  UPDATE public.resort_agents
  SET pin_hash = crypt(v_digits, gen_salt('bf')), updated_at = now()
  WHERE id = p_agent_id;
  RETURN FOUND;
END;
$$;

INSERT INTO public.resort_agents (name, phone, email, commission_rate, is_active)
SELECT 'סוכן דמו', '0500000001', 'agent@resortos.app', 0.10, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.resort_agents WHERE public.agent_normalize_phone(phone) = '0500000001'
);

SELECT public.agent_set_pin(id, '2468')
FROM public.resort_agents
WHERE public.agent_normalize_phone(phone) = '0500000001'
  AND pin_hash IS NULL;

ALTER TABLE public.resort_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_commissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.resort_agents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.resort_agent_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.agent_commissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resort_agents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resort_agent_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_commissions TO service_role;

REVOKE ALL ON FUNCTION public.get_sanitized_availability(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_agent_soft_lock(uuid, text, date, date, text, text, bigint, bigint, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_agent_booking_paid(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_from_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_expired_agent_locks() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_set_pin(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_sanitized_availability(date, date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_agent_soft_lock(uuid, text, date, date, text, text, bigint, bigint, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_agent_booking_paid(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_login(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agent_from_token(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_agent_locks() TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_set_pin(uuid, text) TO service_role;
