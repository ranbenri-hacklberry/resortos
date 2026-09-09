-- Booking restrictions / holiday rules.
-- property_id is text (resort_properties.id), not UUID. NULL = every complex.

CREATE TABLE IF NOT EXISTS public.resort_booking_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  property_id text,
  name varchar(100) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  min_nights integer NOT NULL DEFAULT 2,
  closed_to_arrival boolean NOT NULL DEFAULT false,
  closed_to_departure boolean NOT NULL DEFAULT false,
  price_multiplier numeric(4, 2) NOT NULL DEFAULT 1.00,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT resort_booking_restrictions_dates_chk CHECK (end_date >= start_date),
  CONSTRAINT resort_booking_restrictions_nights_chk CHECK (min_nights >= 1),
  CONSTRAINT resort_booking_restrictions_mult_chk CHECK (price_multiplier > 0)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'resort_properties'
  ) THEN
    ALTER TABLE public.resort_booking_restrictions
      ADD CONSTRAINT resort_booking_restrictions_property_fk
      FOREIGN KEY (tenant_id, property_id)
      REFERENCES public.resort_properties (tenant_id, id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_restrictions_tenant_dates
  ON public.resort_booking_restrictions (tenant_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_restrictions_property
  ON public.resort_booking_restrictions (tenant_id, property_id);

COMMENT ON TABLE public.resort_booking_restrictions IS 'Min-nights, CTA/CTD and holiday price rules. NULL property_id applies to all complexes.';
COMMENT ON COLUMN public.resort_booking_restrictions.closed_to_arrival IS 'Block check-in on any date inside [start_date, end_date].';
COMMENT ON COLUMN public.resort_booking_restrictions.closed_to_departure IS 'Block check-out on any date inside [start_date, end_date].';

ALTER TABLE public.resort_booking_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lan_resort_booking_restrictions_all" ON public.resort_booking_restrictions;
CREATE POLICY "lan_resort_booking_restrictions_all"
  ON public.resort_booking_restrictions
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resort_booking_restrictions TO anon, authenticated, service_role;

ALTER TABLE public.resort_booking_restrictions REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_booking_restrictions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
