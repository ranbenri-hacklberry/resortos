-- Migration: Atomic public booking RPC with advisory lock
-- Prevents race conditions and guarantees transactional consistency for direct website bookings.

CREATE OR REPLACE FUNCTION public.create_public_booking(
  p_tenant_id uuid,
  p_unit_id text,
  p_guest_name text,
  p_guest_phone text,
  p_guest_email text,
  p_check_in date,
  p_check_out date,
  p_adults integer DEFAULT 2,
  p_children integer DEFAULT 0,
  p_total_price_agorot bigint DEFAULT 0,
  p_deposit_agorot bigint DEFAULT 0,
  p_special_requests text DEFAULT NULL,
  p_is_buyout boolean DEFAULT false,
  p_property_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id text;
  v_token text;
  v_unit text;
  v_existing RECORD;
BEGIN
  -- Basic input validation
  IF p_tenant_id IS NULL OR p_unit_id IS NULL OR p_check_in IS NULL OR p_check_out IS NULL THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_FIELDS';
  END IF;

  IF p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE';
  END IF;

  -- 1. Atomic Transaction Lock on unit
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':' || p_unit_id));

  -- 2. If Full Buyout: Lock and check every unit in property
  IF p_is_buyout AND p_property_id IS NOT NULL THEN
    FOR v_unit IN
      SELECT id FROM public.resort_units
      WHERE tenant_id = p_tenant_id AND property_id = p_property_id AND is_active IS DISTINCT FROM false
    LOOP
      PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':' || v_unit));

      IF EXISTS (
        SELECT 1 FROM public.hotelos_bookings
        WHERE tenant_id = p_tenant_id
          AND unit_id = v_unit
          AND deleted_at IS NULL
          AND booking_status NOT IN ('CANCELED', 'CHECKED_OUT')
          AND check_in_date < p_check_out
          AND check_out_date > p_check_in
      ) THEN
        RAISE EXCEPTION 'BUYOUT_UNIT_OCCUPIED_%', v_unit;
      END IF;
    END LOOP;
  ELSE
    -- 3. Check Overlap for single unit
    IF EXISTS (
      SELECT 1 FROM public.hotelos_bookings
      WHERE tenant_id = p_tenant_id
        AND unit_id = p_unit_id
        AND deleted_at IS NULL
        AND booking_status NOT IN ('CANCELED', 'CHECKED_OUT')
        AND check_in_date < p_check_out
        AND check_out_date > p_check_in
    ) THEN
      RAISE EXCEPTION 'DATES_OVERLAP_CONFLICT';
    END IF;
  END IF;

  -- 4. Generate unique IDs
  v_booking_id := 'web_' || p_unit_id || '_' || to_char(p_check_in, 'YYYYMMDD') || '_' || substr(md5(random()::text), 1, 4);
  v_token := 'tok_' || replace(gen_random_uuid()::text, '-', '');

  -- 5. Insert Booking
  INSERT INTO public.hotelos_bookings (
    id,
    tenant_id,
    unit_id,
    guest_name,
    guest_phone,
    guest_email,
    check_in_date,
    check_out_date,
    adults_count,
    children_count,
    total_price_agorot,
    deposit_agorot,
    booking_status,
    payment_status,
    channel_source,
    checkout_token,
    special_requests,
    created_at,
    updated_at
  ) VALUES (
    v_booking_id,
    p_tenant_id,
    p_unit_id,
    COALESCE(p_guest_name, 'אורח אתר'),
    COALESCE(p_guest_phone, ''),
    p_guest_email,
    p_check_in,
    p_check_out,
    COALESCE(p_adults, 2),
    COALESCE(p_children, 0),
    COALESCE(p_total_price_agorot, 0),
    COALESCE(p_deposit_agorot, 0),
    'PENDING',
    'UNPAID',
    'WEBSITE',
    v_token,
    p_special_requests,
    now(),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_booking_id,
    'checkout_token', v_token,
    'unit_id', p_unit_id,
    'check_in_date', p_check_in,
    'check_out_date', p_check_out,
    'total_price_agorot', p_total_price_agorot,
    'deposit_agorot', p_deposit_agorot,
    'booking_status', 'PENDING'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_public_booking(uuid, text, text, text, text, date, date, integer, integer, bigint, bigint, text, boolean, text) TO anon, authenticated, service_role;
