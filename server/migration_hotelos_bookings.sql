-- HotelOS calendar bookings — shared across staff + guest checkout.
-- Text ids match Dexie (b_…, unit_1). No FK to public.bookings/units (those are UUIDs).

CREATE TABLE IF NOT EXISTS public.hotelos_bookings (
  id text PRIMARY KEY,
  tenant_id uuid,
  unit_id text NOT NULL,
  guest_name text,
  guest_email text,
  guest_phone text,
  check_in_date date NOT NULL,
  check_out_date date NOT NULL,
  adults_count integer NOT NULL DEFAULT 2,
  children_count integer NOT NULL DEFAULT 0,
  total_price_agorot bigint NOT NULL DEFAULT 0,
  deposit_agorot bigint NOT NULL DEFAULT 0,
  booking_status text NOT NULL DEFAULT 'PENDING',
  payment_status text NOT NULL DEFAULT 'UNPAID',
  payment_mode text,
  channel_source text,
  checkout_token text,
  special_requests text,
  expires_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS hotelos_bookings_checkout_token_uidx
  ON public.hotelos_bookings (checkout_token)
  WHERE checkout_token IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS hotelos_bookings_unit_dates_idx
  ON public.hotelos_bookings (unit_id, check_in_date, check_out_date)
  WHERE deleted_at IS NULL AND booking_status <> 'CANCELED';

CREATE INDEX IF NOT EXISTS hotelos_bookings_tenant_idx
  ON public.hotelos_bookings (tenant_id, updated_at DESC);

ALTER TABLE public.hotelos_bookings
  ADD COLUMN IF NOT EXISTS clearing_payments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.hotelos_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lan_hotelos_bookings_all" ON public.hotelos_bookings;
CREATE POLICY "lan_hotelos_bookings_all"
  ON public.hotelos_bookings
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotelos_bookings TO anon, authenticated, service_role;

ALTER TABLE public.hotelos_bookings REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.hotelos_bookings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
