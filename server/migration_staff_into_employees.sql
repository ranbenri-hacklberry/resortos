-- Fold HotelOS login into public.employees. Drop hotelos_staff.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS allow_remote_attendance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS employees_username_uidx
  ON public.employees (lower(username))
  WHERE username IS NOT NULL;

UPDATE public.employees e
SET
  username = s.username,
  password_hash = s.password_hash,
  role = s.role,
  allow_remote_attendance = s.allow_remote_attendance,
  is_active = s.is_active,
  name = s.display_name,
  visible_apps = CASE
    WHEN COALESCE(e.visible_apps, '[]'::jsonb) @> '["hotelos"]'::jsonb THEN e.visible_apps
    ELSE COALESCE(e.visible_apps, '[]'::jsonb) || '["hotelos"]'::jsonb
  END
FROM public.hotelos_staff s
WHERE s.employee_id = e.id;

ALTER TABLE public.hotelos_sessions
  ADD COLUMN IF NOT EXISTS employee_id uuid;

UPDATE public.hotelos_sessions sess
SET employee_id = s.employee_id
FROM public.hotelos_staff s
WHERE s.id = sess.staff_id
  AND sess.employee_id IS NULL;

DELETE FROM public.hotelos_sessions WHERE employee_id IS NULL;

DROP FUNCTION IF EXISTS public._hotelos_staff_from_token(text);
DROP FUNCTION IF EXISTS public.hotelos_staff_public(public.hotelos_staff);
DROP FUNCTION IF EXISTS public._hotelos_ensure_employee(public.hotelos_staff);
DROP FUNCTION IF EXISTS public.hotelos_login(text, text);
DROP FUNCTION IF EXISTS public.hotelos_me(text);
DROP FUNCTION IF EXISTS public.hotelos_logout(text);
DROP FUNCTION IF EXISTS public.hotelos_list_staff(text);
DROP FUNCTION IF EXISTS public.hotelos_create_staff(text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.hotelos_create_staff(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.hotelos_update_staff(text, text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.hotelos_update_staff(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.hotelos_deactivate_staff(text, text);
DROP FUNCTION IF EXISTS public.hotelos_get_attendance_settings(text);
DROP FUNCTION IF EXISTS public.hotelos_set_attendance_settings(text, double precision, double precision, integer, text);

ALTER TABLE public.hotelos_sessions DROP CONSTRAINT IF EXISTS hotelos_sessions_staff_id_fkey;
ALTER TABLE public.hotelos_sessions DROP COLUMN IF EXISTS staff_id;
ALTER TABLE public.hotelos_sessions ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE public.hotelos_sessions DROP CONSTRAINT IF EXISTS hotelos_sessions_employee_id_fkey;
ALTER TABLE public.hotelos_sessions
  ADD CONSTRAINT hotelos_sessions_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.employees (id) ON DELETE CASCADE;

DROP INDEX IF EXISTS hotelos_sessions_staff_idx;
CREATE INDEX IF NOT EXISTS hotelos_sessions_employee_idx
  ON public.hotelos_sessions (employee_id);

DROP TABLE IF EXISTS public.hotelos_staff;

CREATE OR REPLACE FUNCTION public.hotelos_employee_public(emp public.employees)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', emp.id,
    'tenant_id', emp.business_id,
    'username', emp.username,
    'display_name', emp.name,
    'role', emp.role,
    'is_active', COALESCE(emp.is_active, true),
    'allow_remote_attendance', COALESCE(emp.allow_remote_attendance, false)
  );
$$;

CREATE OR REPLACE FUNCTION public._hotelos_employee_from_token(p_token text)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  emp public.employees%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN emp;
  END IF;
  SELECT e.* INTO emp
  FROM public.hotelos_sessions sess
  JOIN public.employees e ON e.id = sess.employee_id
  WHERE sess.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    AND sess.expires_at > now()
    AND COALESCE(e.is_active, true)
    AND e.username IS NOT NULL;
  RETURN emp;
END;
$$;

REVOKE ALL ON FUNCTION public._hotelos_employee_from_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotelos_employee_public(public.employees) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.hotelos_login(p_username text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  emp public.employees%ROWTYPE;
  raw_token text;
BEGIN
  IF p_username IS NULL OR p_password IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO emp
  FROM public.employees
  WHERE lower(username) = lower(btrim(p_username))
    AND COALESCE(is_active, true)
    AND password_hash IS NOT NULL
    AND password_hash = crypt(p_password, password_hash);
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  raw_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.hotelos_sessions (token_hash, employee_id, expires_at)
  VALUES (encode(digest(raw_token, 'sha256'), 'hex'), emp.id, now() + interval '14 days');
  RETURN jsonb_build_object(
    'token', raw_token,
    'user', public.hotelos_employee_public(emp)
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
  emp public.employees%ROWTYPE;
BEGIN
  emp := public._hotelos_employee_from_token(p_token);
  IF emp.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public.hotelos_employee_public(emp);
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
  actor public.employees%ROWTYPE;
BEGIN
  actor := public._hotelos_employee_from_token(p_token);
  IF actor.id IS NULL OR actor.role <> 'MANAGER' THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  RETURN jsonb_build_object(
    'staff', COALESCE((
      SELECT jsonb_agg(public.hotelos_employee_public(e) ORDER BY COALESCE(e.is_active, true) DESC, e.name)
      FROM public.employees e
      WHERE e.business_id = actor.business_id
        AND e.username IS NOT NULL
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_create_staff(
  p_token text,
  p_username text,
  p_password text,
  p_display_name text,
  p_role text,
  p_allow_remote_attendance boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor public.employees%ROWTYPE;
  created public.employees%ROWTYPE;
  uname text;
  dname text;
BEGIN
  actor := public._hotelos_employee_from_token(p_token);
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
  IF EXISTS (SELECT 1 FROM public.employees WHERE lower(username) = uname) THEN
    RETURN jsonb_build_object('error', 'USERNAME_TAKEN');
  END IF;
  INSERT INTO public.employees (
    name, business_id, username, password_hash, role, allow_remote_attendance,
    is_active, access_level, is_admin, visible_apps
  ) VALUES (
    dname,
    actor.business_id,
    uname,
    crypt(p_password, gen_salt('bf')),
    p_role,
    COALESCE(p_allow_remote_attendance, false),
    true,
    CASE WHEN p_role = 'MANAGER' THEN 'owner' ELSE 'staff' END,
    p_role = 'MANAGER',
    '["hotelos"]'::jsonb
  )
  RETURNING * INTO created;
  RETURN jsonb_build_object('user', public.hotelos_employee_public(created));
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_update_staff(
  p_token text,
  p_staff_id text,
  p_username text,
  p_password text,
  p_display_name text,
  p_role text,
  p_allow_remote_attendance boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor public.employees%ROWTYPE;
  target public.employees%ROWTYPE;
  target_id uuid;
  uname text;
  dname text;
  new_role text;
  new_remote boolean;
  password_changed boolean := false;
BEGIN
  actor := public._hotelos_employee_from_token(p_token);
  IF actor.id IS NULL THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  BEGIN
    target_id := p_staff_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('error', 'INVALID');
  END;
  IF target_id <> actor.id AND actor.role <> 'MANAGER' THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  SELECT * INTO target
  FROM public.employees
  WHERE id = target_id AND business_id = actor.business_id AND username IS NOT NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  uname := lower(btrim(COALESCE(p_username, '')));
  dname := btrim(COALESCE(p_display_name, ''));
  IF uname = '' OR length(uname) < 2 OR dname = '' THEN
    RETURN jsonb_build_object('error', 'INVALID');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.employees
    WHERE lower(username) = uname AND id <> target.id
  ) THEN
    RETURN jsonb_build_object('error', 'USERNAME_TAKEN');
  END IF;

  new_role := target.role;
  new_remote := target.allow_remote_attendance;
  IF actor.role = 'MANAGER' THEN
    IF p_role IN ('MANAGER', 'HOUSEKEEPING', 'MAINTENANCE', 'GARDENING') THEN
      new_role := p_role;
    END IF;
    IF p_allow_remote_attendance IS NOT NULL THEN
      new_remote := p_allow_remote_attendance;
    END IF;
  END IF;

  IF p_password IS NOT NULL AND length(p_password) > 0 THEN
    IF length(p_password) < 6 THEN
      RETURN jsonb_build_object('error', 'WEAK_PASSWORD');
    END IF;
    password_changed := true;
    UPDATE public.employees
    SET
      username = uname,
      name = dname,
      role = new_role,
      allow_remote_attendance = new_remote,
      password_hash = crypt(p_password, gen_salt('bf')),
      access_level = CASE WHEN new_role = 'MANAGER' THEN 'owner' ELSE 'staff' END,
      is_admin = (new_role = 'MANAGER')
    WHERE id = target.id
    RETURNING * INTO target;
  ELSE
    UPDATE public.employees
    SET
      username = uname,
      name = dname,
      role = new_role,
      allow_remote_attendance = new_remote,
      access_level = CASE WHEN new_role = 'MANAGER' THEN 'owner' ELSE 'staff' END,
      is_admin = (new_role = 'MANAGER')
    WHERE id = target.id
    RETURNING * INTO target;
  END IF;

  IF password_changed AND target.id <> actor.id THEN
    DELETE FROM public.hotelos_sessions WHERE employee_id = target.id;
  END IF;

  RETURN jsonb_build_object('user', public.hotelos_employee_public(target));
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_deactivate_staff(p_token text, p_staff_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor public.employees%ROWTYPE;
  target_id uuid;
BEGIN
  actor := public._hotelos_employee_from_token(p_token);
  IF actor.id IS NULL OR actor.role <> 'MANAGER' THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  BEGIN
    target_id := p_staff_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('error', 'INVALID');
  END;
  IF target_id = actor.id THEN
    RETURN jsonb_build_object('error', 'INVALID');
  END IF;
  UPDATE public.employees
  SET is_active = false
  WHERE id = target_id AND business_id = actor.business_id AND username IS NOT NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;
  DELETE FROM public.hotelos_sessions WHERE employee_id = target_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_get_attendance_settings(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor public.employees%ROWTYPE;
  loc public.locations%ROWTYPE;
BEGIN
  actor := public._hotelos_employee_from_token(p_token);
  IF actor.id IS NULL THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  SELECT * INTO loc
  FROM public.locations
  WHERE type = 'hotelos_site'
  ORDER BY created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'settings', jsonb_build_object(
        'tenant_id', actor.business_id,
        'site_label', '',
        'latitude', NULL,
        'longitude', NULL,
        'radius_meters', 150
      )
    );
  END IF;
  RETURN jsonb_build_object(
    'settings', jsonb_build_object(
      'tenant_id', actor.business_id,
      'site_label', loc.name,
      'latitude', loc.coordinates[1],
      'longitude', loc.coordinates[0],
      'radius_meters', COALESCE(loc.radius_meters, 150)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_set_attendance_settings(
  p_token text,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer,
  p_site_label text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor public.employees%ROWTYPE;
  loc public.locations%ROWTYPE;
  radius integer;
  label text;
  geom geometry;
BEGIN
  actor := public._hotelos_employee_from_token(p_token);
  IF actor.id IS NULL OR actor.role <> 'MANAGER' THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude < -90 OR p_latitude > 90
     OR p_longitude < -180 OR p_longitude > 180 THEN
    RETURN jsonb_build_object('error', 'INVALID');
  END IF;
  radius := COALESCE(p_radius_meters, 150);
  IF radius < 30 OR radius > 2000 THEN
    RETURN jsonb_build_object('error', 'INVALID');
  END IF;
  label := COALESCE(NULLIF(btrim(p_site_label), ''), 'צימר');
  geom := ST_Buffer(ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography, radius)::geometry;

  SELECT * INTO loc FROM public.locations WHERE type = 'hotelos_site' ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    UPDATE public.locations
    SET
      name = label,
      coordinates = point(p_longitude, p_latitude),
      radius_meters = radius,
      polygon = geom
    WHERE id = loc.id
    RETURNING * INTO loc;
  ELSE
    INSERT INTO public.locations (name, type, coordinates, radius_meters, polygon)
    VALUES (label, 'hotelos_site', point(p_longitude, p_latitude), radius, geom)
    RETURNING * INTO loc;
  END IF;

  RETURN jsonb_build_object(
    'settings', jsonb_build_object(
      'tenant_id', actor.business_id,
      'site_label', loc.name,
      'latitude', loc.coordinates[1],
      'longitude', loc.coordinates[0],
      'radius_meters', COALESCE(loc.radius_meters, radius)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hotelos_login(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_me(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_logout(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_list_staff(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_create_staff(text, text, text, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_update_staff(text, text, text, text, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_deactivate_staff(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_get_attendance_settings(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_set_attendance_settings(text, double precision, double precision, integer, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
