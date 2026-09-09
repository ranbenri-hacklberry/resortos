-- Staff accounts for one hotel (shared tenant). Passwords never leave Postgres.
-- Frontend talks to Express /api/auth; Express calls these SECURITY DEFINER RPCs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.hotelos_staff (
  id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  username text NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotelos_staff_role_chk CHECK (
    role IN ('MANAGER', 'HOUSEKEEPING', 'MAINTENANCE', 'GARDENING')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS hotelos_staff_username_uidx
  ON public.hotelos_staff (lower(username));

CREATE INDEX IF NOT EXISTS hotelos_staff_tenant_idx
  ON public.hotelos_staff (tenant_id, is_active);

CREATE TABLE IF NOT EXISTS public.hotelos_sessions (
  token_hash text PRIMARY KEY,
  staff_id text NOT NULL REFERENCES public.hotelos_staff (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hotelos_sessions_staff_idx
  ON public.hotelos_sessions (staff_id);

CREATE INDEX IF NOT EXISTS hotelos_sessions_expires_idx
  ON public.hotelos_sessions (expires_at);

ALTER TABLE public.hotelos_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotelos_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_hotelos_staff" ON public.hotelos_staff;
CREATE POLICY "deny_anon_hotelos_staff"
  ON public.hotelos_staff
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_anon_hotelos_sessions" ON public.hotelos_sessions;
CREATE POLICY "deny_anon_hotelos_sessions"
  ON public.hotelos_sessions
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.hotelos_staff FROM anon, authenticated;
REVOKE ALL ON public.hotelos_sessions FROM anon, authenticated;
GRANT ALL ON public.hotelos_staff TO service_role;
GRANT ALL ON public.hotelos_sessions TO service_role;

CREATE OR REPLACE FUNCTION public._hotelos_staff_from_token(p_token text)
RETURNS public.hotelos_staff
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff public.hotelos_staff%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN staff;
  END IF;
  SELECT s.* INTO staff
  FROM public.hotelos_sessions sess
  JOIN public.hotelos_staff s ON s.id = sess.staff_id
  WHERE sess.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    AND sess.expires_at > now()
    AND s.is_active;
  RETURN staff;
END;
$$;

REVOKE ALL ON FUNCTION public._hotelos_staff_from_token(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.hotelos_login(p_username text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff public.hotelos_staff%ROWTYPE;
  raw_token text;
BEGIN
  IF p_username IS NULL OR p_password IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO staff
  FROM public.hotelos_staff
  WHERE lower(username) = lower(btrim(p_username))
    AND is_active
    AND password_hash = crypt(p_password, password_hash);
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  raw_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.hotelos_sessions (token_hash, staff_id, expires_at)
  VALUES (encode(digest(raw_token, 'sha256'), 'hex'), staff.id, now() + interval '14 days');
  RETURN jsonb_build_object(
    'token', raw_token,
    'user', jsonb_build_object(
      'id', staff.id,
      'tenant_id', staff.tenant_id,
      'username', staff.username,
      'display_name', staff.display_name,
      'role', staff.role
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_me(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff public.hotelos_staff%ROWTYPE;
BEGIN
  staff := public._hotelos_staff_from_token(p_token);
  IF staff.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', staff.id,
    'tenant_id', staff.tenant_id,
    'username', staff.username,
    'display_name', staff.display_name,
    'role', staff.role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_logout(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN jsonb_build_object('ok', true);
  END IF;
  DELETE FROM public.hotelos_sessions
  WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex');
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_list_staff(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  staff public.hotelos_staff%ROWTYPE;
BEGIN
  staff := public._hotelos_staff_from_token(p_token);
  IF staff.id IS NULL OR staff.role <> 'MANAGER' THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  RETURN jsonb_build_object(
    'staff', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'username', s.username,
          'display_name', s.display_name,
          'role', s.role,
          'is_active', s.is_active
        )
        ORDER BY s.is_active DESC, s.display_name
      )
      FROM public.hotelos_staff s
      WHERE s.tenant_id = staff.tenant_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_create_staff(
  p_token text,
  p_username text,
  p_password text,
  p_display_name text,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor public.hotelos_staff%ROWTYPE;
  new_id text;
  uname text;
  dname text;
BEGIN
  actor := public._hotelos_staff_from_token(p_token);
  IF actor.id IS NULL OR actor.role <> 'MANAGER' THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  uname := lower(btrim(COALESCE(p_username, '')));
  dname := btrim(COALESCE(p_display_name, ''));
  IF uname = '' OR length(uname) < 2 OR dname = '' THEN
    RETURN jsonb_build_object('error', 'INVALID');
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RETURN jsonb_build_object('error', 'WEAK_PASSWORD');
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('MANAGER', 'HOUSEKEEPING', 'MAINTENANCE', 'GARDENING') THEN
    RETURN jsonb_build_object('error', 'INVALID');
  END IF;
  IF EXISTS (SELECT 1 FROM public.hotelos_staff WHERE lower(username) = uname) THEN
    RETURN jsonb_build_object('error', 'USERNAME_TAKEN');
  END IF;
  new_id := 'staff_' || encode(gen_random_bytes(8), 'hex');
  INSERT INTO public.hotelos_staff (
    id, tenant_id, username, password_hash, display_name, role
  ) VALUES (
    new_id, actor.tenant_id, uname, crypt(p_password, gen_salt('bf')), dname, p_role
  );
  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'id', new_id,
      'username', uname,
      'display_name', dname,
      'role', p_role,
      'is_active', true
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_deactivate_staff(p_token text, p_staff_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor public.hotelos_staff%ROWTYPE;
BEGIN
  actor := public._hotelos_staff_from_token(p_token);
  IF actor.id IS NULL OR actor.role <> 'MANAGER' THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  IF p_staff_id IS NULL OR p_staff_id = actor.id THEN
    RETURN jsonb_build_object('error', 'INVALID');
  END IF;
  UPDATE public.hotelos_staff
  SET is_active = false, updated_at = now()
  WHERE id = p_staff_id AND tenant_id = actor.tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;
  DELETE FROM public.hotelos_sessions WHERE staff_id = p_staff_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.hotelos_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotelos_me(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotelos_logout(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotelos_list_staff(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotelos_create_staff(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotelos_deactivate_staff(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.hotelos_login(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_me(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_logout(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_list_staff(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_create_staff(text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_deactivate_staff(text, text) TO anon, authenticated, service_role;

INSERT INTO public.hotelos_staff (id, tenant_id, username, password_hash, display_name, role)
SELECT
  'staff_manager',
  '22222222-2222-2222-2222-222222222222'::uuid,
  'rani',
  crypt('hotelos', gen_salt('bf')),
  'רני',
  'MANAGER'
WHERE NOT EXISTS (
  SELECT 1 FROM public.hotelos_staff WHERE lower(username) = 'rani'
);

INSERT INTO public.hotelos_staff (id, tenant_id, username, password_hash, display_name, role)
SELECT
  'staff_housekeeping',
  '22222222-2222-2222-2222-222222222222'::uuid,
  'maya',
  crypt('hotelos', gen_salt('bf')),
  'מאיה',
  'HOUSEKEEPING'
WHERE NOT EXISTS (
  SELECT 1 FROM public.hotelos_staff WHERE lower(username) = 'maya'
);

NOTIFY pgrst, 'reload schema';
