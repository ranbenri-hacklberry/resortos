-- Inventory units (source of truth) + per-job operation history.
-- unit_operations stays the live board snapshot. resort_operations is the audit log.

CREATE TABLE IF NOT EXISTS public.resort_units (
  tenant_id uuid NOT NULL,
  id text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  unit_type text NOT NULL DEFAULT 'cabin',
  max_occupancy integer NOT NULL DEFAULT 4,
  base_price_agorot bigint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_resort_units_tenant_sort
  ON public.resort_units (tenant_id, sort_order, id);

CREATE TABLE IF NOT EXISTS public.resort_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  unit_id text NOT NULL,
  booking_id text,
  domain text,
  status text NOT NULL DEFAULT 'OPEN',
  reason text,
  assigned_staff text,
  started_at timestamptz,
  completed_at timestamptz,
  sop_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_inspections jsonb NOT NULL DEFAULT '[]'::jsonb,
  rework_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resort_operations_unit
  ON public.resort_operations (tenant_id, unit_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resort_operations_open
  ON public.resort_operations (tenant_id, unit_id, status)
  WHERE completed_at IS NULL;

ALTER TABLE public.unit_operations
  ADD COLUMN IF NOT EXISTS current_operation_id uuid;

ALTER TABLE public.resort_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resort_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lan_resort_units_all" ON public.resort_units;
CREATE POLICY "lan_resort_units_all"
  ON public.resort_units
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "lan_resort_operations_all" ON public.resort_operations;
CREATE POLICY "lan_resort_operations_all"
  ON public.resort_operations
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resort_units TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resort_operations TO anon, authenticated, service_role;

ALTER TABLE public.resort_units REPLICA IDENTITY FULL;
ALTER TABLE public.resort_operations REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_units;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_operations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO public.resort_units (
  tenant_id, id, name, sort_order, unit_type, max_occupancy, base_price_agorot
) VALUES
  ('22222222-2222-2222-2222-222222222222', 'hill-1', 'צימר בגבעה 1', 1, 'cabin', 4, 85000),
  ('22222222-2222-2222-2222-222222222222', 'hill-2', 'צימר בגבעה 2', 2, 'cabin', 4, 85000),
  ('22222222-2222-2222-2222-222222222222', 'hill-3', 'צימר בגבעה 3', 3, 'cabin', 4, 85000),
  ('22222222-2222-2222-2222-222222222222', 'hill-4', 'צימר בגבעה 4', 4, 'cabin', 4, 85000),
  ('22222222-2222-2222-2222-222222222222', 'dome-blue', 'כיפת שמיים כחול', 5, 'dome', 4, 120000),
  ('22222222-2222-2222-2222-222222222222', 'dome-red', 'כיפת שמיים אדום', 6, 'dome', 4, 120000),
  ('22222222-2222-2222-2222-222222222222', 'dome-green', 'כיפת שמיים ירוק', 7, 'dome', 4, 120000),
  ('22222222-2222-2222-2222-222222222222', 'mialis-villa', 'מיאליס וילה', 8, 'villa', 6, 250000),
  ('22222222-2222-2222-2222-222222222222', 'suite-1', 'סוויטה 1', 9, 'suite', 4, 150000),
  ('22222222-2222-2222-2222-222222222222', 'suite-2', 'סוויטה 2', 10, 'suite', 4, 150000)
ON CONFLICT (tenant_id, id) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  unit_type = EXCLUDED.unit_type,
  max_occupancy = EXCLUDED.max_occupancy,
  base_price_agorot = EXCLUDED.base_price_agorot,
  is_active = true,
  updated_at = now();
