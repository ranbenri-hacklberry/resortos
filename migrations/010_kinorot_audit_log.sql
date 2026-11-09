-- Kinorot write + external-change audit log (service_role only).
-- Ship in repo; do NOT apply to prod from this PR alone.

CREATE TABLE IF NOT EXISTS public.kinorot_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  source TEXT,
  kinorot_res_id TEXT,
  booking_id TEXT,
  action TEXT NOT NULL,
  guest_name TEXT,
  unit_id TEXT,
  check_in_date DATE,
  check_out_date DATE,
  request_diff JSONB NOT NULL DEFAULT '{}'::jsonb,
  before_snapshot JSONB,
  after_snapshot JSONB,
  response_status INTEGER,
  response_location TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kinorot_audit_log_res_id ON public.kinorot_audit_log (kinorot_res_id);
CREATE INDEX IF NOT EXISTS idx_kinorot_audit_log_ts ON public.kinorot_audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_kinorot_audit_log_booking_id ON public.kinorot_audit_log (booking_id);
CREATE INDEX IF NOT EXISTS idx_kinorot_audit_log_actor_ts ON public.kinorot_audit_log (actor, ts DESC);

REVOKE ALL ON public.kinorot_audit_log FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.kinorot_audit_log TO service_role;

ALTER TABLE public.kinorot_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only kinorot_audit_log" ON public.kinorot_audit_log;
CREATE POLICY "Service role only kinorot_audit_log"
ON public.kinorot_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
