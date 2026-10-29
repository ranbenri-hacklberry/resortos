-- Mapping of ResortOS phones to Google contacts. Not a second guest record.
CREATE TABLE IF NOT EXISTS public.hotelos_google_contacts (
  phone_e164 text PRIMARY KEY,
  google_resource_name text,
  content_hash text,
  last_synced_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  conflict boolean NOT NULL DEFAULT false,
  conflict_name text,
  managed boolean NOT NULL DEFAULT false,
  booking_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hotelos_google_contacts_state (
  id text PRIMARY KEY,
  live_enabled boolean NOT NULL DEFAULT false,
  last_success_at timestamptz,
  last_error text,
  last_dry_run jsonb,
  managed_count integer NOT NULL DEFAULT 0,
  pending_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.hotelos_google_contacts_state (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;
