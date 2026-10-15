-- External agent connections. Credentials are stored only as hashes.
-- A sealed copy exists until the initiating client polls once.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.hotelos_agent_connections (
  id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  client_kind text NOT NULL,
  label text NOT NULL DEFAULT '',
  requested_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  granted_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  match_code text NOT NULL,
  poll_secret_hash text NOT NULL,
  credential_hash text,
  credential_sealed text,
  status text NOT NULL,
  approved_by_staff_id text,
  approved_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  credential_delivered_at timestamptz,
  CONSTRAINT hotelos_agent_connections_status_chk CHECK (
    status IN ('pending', 'approved', 'rejected', 'expired', 'revoked')
  )
);

CREATE INDEX IF NOT EXISTS hotelos_agent_connections_tenant_idx
  ON public.hotelos_agent_connections (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hotelos_agent_connections_credential_idx
  ON public.hotelos_agent_connections (credential_hash)
  WHERE credential_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.hotelos_agent_audit (
  id text PRIMARY KEY,
  connection_id text NOT NULL,
  tenant_id uuid NOT NULL,
  staff_id text,
  staff_name text,
  action text NOT NULL,
  unit_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hotelos_agent_audit_connection_idx
  ON public.hotelos_agent_audit (connection_id, created_at DESC);

ALTER TABLE public.resort_operations
  ADD COLUMN IF NOT EXISTS agent_connection_id text,
  ADD COLUMN IF NOT EXISTS actor_staff_id text,
  ADD COLUMN IF NOT EXISTS actor_staff_name text;

ALTER TABLE public.hotelos_agent_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotelos_agent_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_hotelos_agent_connections" ON public.hotelos_agent_connections;
CREATE POLICY "deny_anon_hotelos_agent_connections"
  ON public.hotelos_agent_connections
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_anon_hotelos_agent_audit" ON public.hotelos_agent_audit;
CREATE POLICY "deny_anon_hotelos_agent_audit"
  ON public.hotelos_agent_audit
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.hotelos_agent_connections FROM anon, authenticated;
REVOKE ALL ON public.hotelos_agent_audit FROM anon, authenticated;
GRANT ALL ON public.hotelos_agent_connections TO service_role;
GRANT ALL ON public.hotelos_agent_audit TO service_role;

NOTIFY pgrst, 'reload schema';
