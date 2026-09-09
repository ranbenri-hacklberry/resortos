-- Guest profile: property defaults + unit overrides.
-- content = public (website / arrival / jacuzzi / TV).
-- access  = private (lockbox / gate / Wi-Fi). Never expose via resort_public_catalog.

CREATE TABLE IF NOT EXISTS public.resort_properties (
  tenant_id uuid NOT NULL,
  id text NOT NULL,
  name text NOT NULL,
  village text,
  cluster text,
  sort_order integer NOT NULL DEFAULT 0,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  access jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_resort_properties_tenant_sort
  ON public.resort_properties (tenant_id, sort_order, id);

ALTER TABLE public.resort_units
  ADD COLUMN IF NOT EXISTS property_id text,
  ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS access jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  ALTER TABLE public.resort_units
    ADD CONSTRAINT resort_units_property_fk
    FOREIGN KEY (tenant_id, property_id)
    REFERENCES public.resort_properties (tenant_id, id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_resort_units_property
  ON public.resort_units (tenant_id, property_id);

COMMENT ON COLUMN public.resort_properties.access IS 'Private guest codes. Do not expose on public APIs.';
COMMENT ON COLUMN public.resort_units.access IS 'Private unit overrides (lockbox / wifi). Do not expose on public APIs.';
COMMENT ON COLUMN public.resort_properties.content IS 'Public property copy: nav, hours, default guides.';
COMMENT ON COLUMN public.resort_units.content IS 'Public unit overrides: arrival, jacuzzi/TV guides.';

ALTER TABLE public.resort_properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lan_resort_properties_all" ON public.resort_properties;
CREATE POLICY "lan_resort_properties_all"
  ON public.resort_properties
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resort_properties TO anon, authenticated, service_role;

ALTER TABLE public.resort_properties REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_properties;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Public website catalog: merged content, never access.
CREATE OR REPLACE VIEW public.resort_public_catalog AS
SELECT
  u.tenant_id,
  u.id AS unit_id,
  u.name,
  u.unit_type,
  u.max_occupancy,
  u.sort_order,
  u.is_active,
  p.id AS property_id,
  p.name AS property_name,
  p.village,
  p.cluster,
  COALESCE(p.content, '{}'::jsonb) || COALESCE(u.content, '{}'::jsonb) AS content
FROM public.resort_units u
LEFT JOIN public.resort_properties p
  ON p.tenant_id = u.tenant_id AND p.id = u.property_id;

GRANT SELECT ON public.resort_public_catalog TO anon, authenticated, service_role;

-- Staff/service merge. Shallow JSONB || — nested wifi/guides are merged in the app.
CREATE OR REPLACE FUNCTION public.unit_merged_guest(p_tenant uuid, p_unit text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'content', COALESCE(p.content, '{}'::jsonb) || COALESCE(u.content, '{}'::jsonb),
    'access', COALESCE(p.access, '{}'::jsonb) || COALESCE(u.access, '{}'::jsonb)
  )
  FROM public.resort_units u
  LEFT JOIN public.resort_properties p
    ON p.tenant_id = u.tenant_id AND p.id = u.property_id
  WHERE u.tenant_id = p_tenant AND u.id = p_unit
$$;

GRANT EXECUTE ON FUNCTION public.unit_merged_guest(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.unit_merged_guest(uuid, text) FROM PUBLIC, anon;

-- Guest access only with a live checkout token (mailbox stays the public path).
CREATE OR REPLACE FUNCTION public.guest_stay_access(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking public.hotelos_bookings%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token !~ '^tok_[A-Za-z0-9_-]+$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO booking
  FROM public.hotelos_bookings
  WHERE checkout_token = p_token
    AND deleted_at IS NULL
    AND booking_status IS DISTINCT FROM 'CANCELED'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF booking.booking_status = 'CANCELED' THEN
    RETURN NULL;
  END IF;

  RETURN public.unit_merged_guest(booking.tenant_id, booking.unit_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.guest_stay_access(text) TO anon, authenticated, service_role;
