-- Attendance: remote flag on staff. Site/punches use existing public.locations + public.clock_events.

ALTER TABLE public.hotelos_staff
  ADD COLUMN IF NOT EXISTS allow_remote_attendance boolean NOT NULL DEFAULT false;


CREATE OR REPLACE FUNCTION public.hotelos_staff_public(staff public.hotelos_staff)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', staff.id,
    'tenant_id', staff.tenant_id,
    'username', staff.username,
    'display_name', staff.display_name,
    'role', staff.role,
    'is_active', staff.is_active,
    'allow_remote_attendance', staff.allow_remote_attendance
  );
$$;

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
    'user', public.hotelos_staff_public(staff)
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
  RETURN public.hotelos_staff_public(staff);
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
      SELECT jsonb_agg(public.hotelos_staff_public(s) ORDER BY s.is_active DESC, s.display_name)
      FROM public.hotelos_staff s
      WHERE s.tenant_id = staff.tenant_id
    ), '[]'::jsonb)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.hotelos_create_staff(text, text, text, text, text);
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
  actor public.hotelos_staff%ROWTYPE;
  created public.hotelos_staff%ROWTYPE;
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
    id, tenant_id, username, password_hash, display_name, role, allow_remote_attendance
  ) VALUES (
    new_id, actor.tenant_id, uname, crypt(p_password, gen_salt('bf')), dname, p_role,
    COALESCE(p_allow_remote_attendance, false)
  )
  RETURNING * INTO created;
  RETURN jsonb_build_object('user', public.hotelos_staff_public(created));
END;
$$;

DROP FUNCTION IF EXISTS public.hotelos_update_staff(text, text, text, text, text, text);
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
  actor public.hotelos_staff%ROWTYPE;
  target public.hotelos_staff%ROWTYPE;
  uname text;
  dname text;
  new_role text;
  new_remote boolean;
  password_changed boolean := false;
BEGIN
  actor := public._hotelos_staff_from_token(p_token);
  IF actor.id IS NULL THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  IF p_staff_id IS NULL OR (p_staff_id <> actor.id AND actor.role <> 'MANAGER') THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  SELECT * INTO target
  FROM public.hotelos_staff
  WHERE id = p_staff_id AND tenant_id = actor.tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;

  uname := lower(btrim(COALESCE(p_username, '')));
  dname := btrim(COALESCE(p_display_name, ''));
  IF uname = '' OR length(uname) < 2 OR dname = '' THEN
    RETURN jsonb_build_object('error', 'INVALID');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.hotelos_staff
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
    UPDATE public.hotelos_staff
    SET
      username = uname,
      display_name = dname,
      role = new_role,
      allow_remote_attendance = new_remote,
      password_hash = crypt(p_password, gen_salt('bf')),
      updated_at = now()
    WHERE id = target.id
    RETURNING * INTO target;
  ELSE
    UPDATE public.hotelos_staff
    SET
      username = uname,
      display_name = dname,
      role = new_role,
      allow_remote_attendance = new_remote,
      updated_at = now()
    WHERE id = target.id
    RETURNING * INTO target;
  END IF;

  IF password_changed AND target.id <> actor.id THEN
    DELETE FROM public.hotelos_sessions WHERE staff_id = target.id;
  END IF;

  RETURN jsonb_build_object('user', public.hotelos_staff_public(target));
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_get_attendance_settings(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor public.hotelos_staff%ROWTYPE;
  settings public.hotelos_attendance_settings%ROWTYPE;
BEGIN
  actor := public._hotelos_staff_from_token(p_token);
  IF actor.id IS NULL THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  SELECT * INTO settings
  FROM public.hotelos_attendance_settings
  WHERE tenant_id = actor.tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'settings', jsonb_build_object(
        'tenant_id', actor.tenant_id,
        'site_label', '',
        'latitude', NULL,
        'longitude', NULL,
        'radius_meters', 150
      )
    );
  END IF;
  RETURN jsonb_build_object(
    'settings', jsonb_build_object(
      'tenant_id', settings.tenant_id,
      'site_label', settings.site_label,
      'latitude', settings.latitude,
      'longitude', settings.longitude,
      'radius_meters', settings.radius_meters
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
  actor public.hotelos_staff%ROWTYPE;
  settings public.hotelos_attendance_settings%ROWTYPE;
  radius integer;
BEGIN
  actor := public._hotelos_staff_from_token(p_token);
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
  INSERT INTO public.hotelos_attendance_settings (
    tenant_id, site_label, latitude, longitude, radius_meters, updated_at, updated_by
  ) VALUES (
    actor.tenant_id, COALESCE(btrim(p_site_label), ''), p_latitude, p_longitude, radius, now(), actor.id
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    site_label = EXCLUDED.site_label,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    radius_meters = EXCLUDED.radius_meters,
    updated_at = now(),
    updated_by = actor.id
  RETURNING * INTO settings;
  RETURN jsonb_build_object(
    'settings', jsonb_build_object(
      'tenant_id', settings.tenant_id,
      'site_label', settings.site_label,
      'latitude', settings.latitude,
      'longitude', settings.longitude,
      'radius_meters', settings.radius_meters
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hotelos_staff_public(public.hotelos_staff) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotelos_create_staff(text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotelos_update_staff(text, text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotelos_get_attendance_settings(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotelos_set_attendance_settings(text, double precision, double precision, integer, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.hotelos_create_staff(text, text, text, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_update_staff(text, text, text, text, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_get_attendance_settings(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_set_attendance_settings(text, double precision, double precision, integer, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
