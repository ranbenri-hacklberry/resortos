-- Operations manager: calendar + ops, no finances. Only MANAGER (owner) can assign this role.

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS hotelos_staff_role_chk;

CREATE OR REPLACE FUNCTION public.hotelos_create_staff(
  p_token text,
  p_username text,
  p_password text,
  p_display_name text,
  p_role text,
  p_allow_remote_attendance boolean DEFAULT false,
  p_allowed_units jsonb DEFAULT NULL
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
  units jsonb;
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
  IF p_role IS NULL OR p_role NOT IN ('MANAGER', 'OPS_MANAGER', 'HOUSEKEEPING', 'MAINTENANCE', 'GARDENING') THEN
    RETURN jsonb_build_object('error', 'INVALID');
  END IF;
  IF EXISTS (SELECT 1 FROM public.employees WHERE lower(username) = uname) THEN
    RETURN jsonb_build_object('error', 'USERNAME_TAKEN');
  END IF;
  units := CASE
    WHEN jsonb_typeof(p_allowed_units) = 'array' THEN p_allowed_units
    ELSE '[]'::jsonb
  END;
  INSERT INTO public.employees (
    name, business_id, username, password_hash, role, allow_remote_attendance,
    is_active, access_level, is_admin, visible_apps, allowed_units
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
    '["hotelos"]'::jsonb,
    units
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
  p_allow_remote_attendance boolean DEFAULT NULL,
  p_allowed_units jsonb DEFAULT NULL
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
  new_units jsonb;
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
  new_units := COALESCE(target.allowed_units, '[]'::jsonb);
  IF actor.role = 'MANAGER' THEN
    IF p_role IN ('MANAGER', 'OPS_MANAGER', 'HOUSEKEEPING', 'MAINTENANCE', 'GARDENING') THEN
      new_role := p_role;
    END IF;
    IF p_allow_remote_attendance IS NOT NULL THEN
      new_remote := p_allow_remote_attendance;
    END IF;
    IF jsonb_typeof(p_allowed_units) = 'array' THEN
      new_units := p_allowed_units;
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
      allowed_units = new_units,
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
      allowed_units = new_units,
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

GRANT EXECUTE ON FUNCTION public.hotelos_create_staff(text, text, text, text, text, boolean, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hotelos_update_staff(text, text, text, text, text, text, boolean, jsonb) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
