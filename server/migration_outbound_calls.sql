ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS outbound_calls boolean NOT NULL DEFAULT false;

UPDATE public.employees
SET outbound_calls = true
WHERE username IN ('rani', 'zuki', 'barak');

CREATE OR REPLACE FUNCTION public.hotelos_employee_public(emp public.employees)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN jsonb_build_object(
    'id', emp.id,
    'tenant_id', emp.business_id,
    'username', emp.username,
    'display_name', emp.name,
    'role', emp.role,
    'is_active', COALESCE(emp.is_active, true),
    'allow_remote_attendance', COALESCE(emp.allow_remote_attendance, false),
    'outbound_calls', COALESCE(emp.outbound_calls, false),
    'allowed_units', COALESCE(emp.allowed_units, '[]'::jsonb),
    'has_login_secret', (emp.login_secret IS NOT NULL AND length(emp.login_secret) > 0),
    'phone', COALESCE(emp.phone, ''),
    'whatsapp_phone', COALESCE(emp.whatsapp_phone, '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_staff_directory(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor public.employees%ROWTYPE;
BEGIN
  actor := public._hotelos_employee_from_token(p_token);
  IF actor.id IS NULL THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  RETURN jsonb_build_object(
    'staff', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'display_name', e.name,
          'username', e.username,
          'role', e.role,
          'phone', COALESCE(e.phone, ''),
          'whatsapp_phone', COALESCE(e.whatsapp_phone, ''),
          'outbound_calls', COALESCE(e.outbound_calls, false)
        )
        ORDER BY e.name
      )
      FROM public.employees e
      WHERE e.business_id = actor.business_id
        AND e.username IS NOT NULL
        AND COALESCE(e.is_active, true)
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_set_outbound_calls(p_token text, p_staff_id text, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor public.employees%ROWTYPE;
  target public.employees%ROWTYPE;
BEGIN
  actor := public._hotelos_employee_from_token(p_token);
  IF actor.id IS NULL OR actor.role IS DISTINCT FROM 'MANAGER' THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  UPDATE public.employees
  SET outbound_calls = COALESCE(p_enabled, false)
  WHERE id = p_staff_id
    AND business_id = actor.business_id
  RETURNING * INTO target;
  IF target.id IS NULL THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;
  RETURN jsonb_build_object('user', public.hotelos_employee_public(target));
END;
$$;

GRANT EXECUTE ON FUNCTION public.hotelos_set_outbound_calls(text, text, boolean) TO anon, authenticated, service_role;
