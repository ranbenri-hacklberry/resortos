-- Allow a staff member to edit themselves; managers can edit anyone in the tenant.

CREATE OR REPLACE FUNCTION public.hotelos_update_staff(
  p_token text,
  p_staff_id text,
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
  target public.hotelos_staff%ROWTYPE;
  uname text;
  dname text;
  new_role text;
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
  IF actor.role = 'MANAGER' AND p_role IN ('MANAGER', 'HOUSEKEEPING', 'MAINTENANCE', 'GARDENING') THEN
    new_role := p_role;
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
      password_hash = crypt(p_password, gen_salt('bf')),
      updated_at = now()
    WHERE id = target.id;
  ELSE
    UPDATE public.hotelos_staff
    SET
      username = uname,
      display_name = dname,
      role = new_role,
      updated_at = now()
    WHERE id = target.id;
  END IF;

  IF password_changed AND target.id <> actor.id THEN
    DELETE FROM public.hotelos_sessions WHERE staff_id = target.id;
  END IF;

  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'id', target.id,
      'tenant_id', target.tenant_id,
      'username', uname,
      'display_name', dname,
      'role', new_role,
      'is_active', target.is_active
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hotelos_update_staff(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hotelos_update_staff(text, text, text, text, text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
