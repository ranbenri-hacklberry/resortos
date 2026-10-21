ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS crew_lead_id uuid REFERENCES public.employees(id);

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_role_check CHECK (
  role IS NULL OR role = ANY (ARRAY[
    'MANAGER', 'OPS_MANAGER', 'RECEPTION', 'HOUSEKEEPING', 'MAINTENANCE', 'GARDENING', 'PRIORITY', 'WORK_LEAD'
  ]::text[])
);

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
    'whatsapp_phone', COALESCE(emp.whatsapp_phone, ''),
    'crew_lead_id', emp.crew_lead_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hotelos_set_crew_lead(p_token text, p_staff_id text, p_lead_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor public.employees%ROWTYPE;
  target public.employees%ROWTYPE;
  target_id uuid;
  lead_id uuid;
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
  IF btrim(COALESCE(p_lead_id, '')) = '' THEN
    lead_id := NULL;
  ELSE
    BEGIN
      lead_id := p_lead_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('error', 'INVALID');
    END;
    IF lead_id = target_id OR NOT EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = lead_id AND business_id = actor.business_id AND role = 'WORK_LEAD' AND COALESCE(is_active, true)
    ) THEN
      RETURN jsonb_build_object('error', 'INVALID');
    END IF;
  END IF;
  UPDATE public.employees
  SET crew_lead_id = lead_id
  WHERE id = target_id AND business_id = actor.business_id
  RETURNING * INTO target;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND');
  END IF;
  RETURN jsonb_build_object('user', public.hotelos_employee_public(target));
END;
$$;

GRANT EXECUTE ON FUNCTION public.hotelos_set_crew_lead(text, text, text) TO anon, authenticated, service_role;

DO $$
DECLARE
  src text;
  name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['hotelos_create_staff', 'hotelos_update_staff']
  LOOP
    src := pg_get_functiondef(name::regproc);
    src := replace(src, '''PRIORITY''', '''PRIORITY'', ''WORK_LEAD''');
    EXECUTE src;
  END LOOP;
END $$;
