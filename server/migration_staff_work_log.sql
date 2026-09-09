ALTER TABLE public.resort_operations
  ADD COLUMN IF NOT EXISTS completed_by text,
  ADD COLUMN IF NOT EXISTS completed_by_name text;

CREATE INDEX IF NOT EXISTS idx_resort_operations_completed_by
  ON public.resort_operations (tenant_id, completed_by, completed_at DESC)
  WHERE completed_at IS NOT NULL;
