-- HotelOS operations tickets — shared across staff devices (LAN / Tailscale).
-- Text ids match Dexie (unit_1, u_t_...). No FK to units/tenants: those ids are not UUIDs.

CREATE TABLE IF NOT EXISTS public.unit_operations (
  id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  name text,
  operational_status text,
  operational_domain text,
  custom_reason text,
  assigned_staff text,
  is_escalated boolean NOT NULL DEFAULT false,
  cleaning_started_at timestamptz,
  quality_inspections jsonb NOT NULL DEFAULT '[]'::jsonb,
  rework_count integer NOT NULL DEFAULT 0,
  last_failed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  name_i18n jsonb,
  reason_i18n jsonb,
  text_source_lang text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unit_operations_tenant
  ON public.unit_operations (tenant_id, updated_at DESC);

ALTER TABLE public.unit_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lan_unit_operations_all" ON public.unit_operations;
CREATE POLICY "lan_unit_operations_all"
  ON public.unit_operations
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unit_operations TO anon, authenticated, service_role;

ALTER TABLE public.unit_operations REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.unit_operations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
