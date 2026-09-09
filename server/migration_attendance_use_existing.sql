-- Use existing locations + employees + clock_events. Drop the extra HotelOS attendance tables.

ALTER TABLE public.hotelos_staff
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees (id);

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS radius_meters integer;

CREATE OR REPLACE FUNCTION public._hotelos_ensure_employee(p_staff public.hotelos_staff)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  emp_id uuid;
BEGIN
  IF p_staff.employee_id IS NOT NULL THEN
    UPDATE public.employees
    SET
      name = p_staff.display_name,
      is_admin = (p_staff.role = 'MANAGER'),
      access_level = CASE WHEN p_staff.role = 'MANAGER' THEN 'owner' ELSE 'staff' END
    WHERE id = p_staff.employee_id;
    RETURN p_staff.employee_id;
  END IF;

  INSERT INTO public.employees (name, business_id, access_level, is_admin, visible_apps)
  VALUES (
    p_staff.display_name,
    p_staff.tenant_id,
    CASE WHEN p_staff.role = 'MANAGER' THEN 'owner' ELSE 'staff' END,
    p_staff.role = 'MANAGER',
    '["hotelos"]'::jsonb
  )
  RETURNING id INTO emp_id;

  UPDATE public.hotelos_staff
  SET employee_id = emp_id, updated_at = now()
  WHERE id = p_staff.id;

  RETURN emp_id;
END;
$$;

REVOKE ALL ON FUNCTION public._hotelos_ensure_employee(public.hotelos_staff) FROM PUBLIC;

DO $$
DECLARE
  staff_row public.hotelos_staff%ROWTYPE;
BEGIN
  FOR staff_row IN SELECT * FROM public.hotelos_staff WHERE employee_id IS NULL LOOP
    PERFORM public._hotelos_ensure_employee(staff_row);
  END LOOP;
END $$;

INSERT INTO public.locations (name, type, coordinates, radius_meters, polygon)
SELECT
  COALESCE(NULLIF(btrim(s.site_label), ''), 'צימר'),
  'hotelos_site',
  point(s.longitude, s.latitude),
  s.radius_meters,
  ST_Buffer(ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326)::geography, s.radius_meters)::geometry
FROM public.hotelos_attendance_settings s
WHERE s.latitude IS NOT NULL
  AND s.longitude IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.locations WHERE type = 'hotelos_site');

DROP FUNCTION IF EXISTS public.hotelos_get_attendance_settings(text);
DROP FUNCTION IF EXISTS public.hotelos_set_attendance_settings(text, double precision, double precision, integer, text);

DROP TABLE IF EXISTS public.hotelos_attendance_punches;
DROP TABLE IF EXISTS public.hotelos_attendance_settings;

CREATE OR REPLACE FUNCTION public.hotelos_get_attendance_settings(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor public.hotelos_staff%ROWTYPE;
  loc public.locations%ROWTYPE;
BEGIN
  actor := public._hotelos_staff_from_token(p_token);
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
      'tenant_id', actor.tenant_id,
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
  actor public.hotelos_staff%ROWTYPE;
  loc public.locations%ROWTYPE;
  radius integer;
  label text;
  geom geometry;
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
      'tenant_id', actor.tenant_id,
      'site_label', loc.name,
      'latitude', loc.coordinates[1],
      'longitude', loc.coordinates[0],
      'radius_meters', COALESCE(loc.radius_meters, radius)
    )
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
  PERFORM public._hotelos_ensure_employee(created);
  SELECT * INTO created FROM public.hotelos_staff WHERE id = created.id;
  RETURN jsonb_build_object('user', public.hotelos_staff_public(created));
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

  PERFORM public._hotelos_ensure_employee(target);
  SELECT * INTO target FROM public.hotelos_staff WHERE id = target.id;
  RETURN jsonb_build_object('user', public.hotelos_staff_public(target));
END;
$$;

GRANT EXECUTE ON FUNCTION public.hotelos_get_attendance_settings(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_set_attendance_settings(text, double precision, double precision, integer, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
