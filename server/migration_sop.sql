-- Fixed SOP templates (manager-defined) + per-unit checklist progress.
-- Local Studio only. Does not touch cafe employees / clock tables.

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

ALTER TABLE public.unit_operations
  ADD COLUMN IF NOT EXISTS sop_progress jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.sop_templates (
  tenant_id uuid NOT NULL,
  id text NOT NULL,
  domain text NOT NULL,
  title jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_sop_templates_tenant
  ON public.sop_templates (tenant_id, domain);

ALTER TABLE public.sop_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lan_sop_templates_all" ON public.sop_templates;
CREATE POLICY "lan_sop_templates_all"
  ON public.sop_templates
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "lan_unit_operations_all" ON public.unit_operations;
CREATE POLICY "lan_unit_operations_all"
  ON public.unit_operations
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sop_templates TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unit_operations TO anon, authenticated, service_role;

ALTER TABLE public.sop_templates REPLICA IDENTITY FULL;
ALTER TABLE public.unit_operations REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sop_templates;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.unit_operations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
