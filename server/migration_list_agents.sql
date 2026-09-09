-- List sales/staff agents via the same token RPC path as hotelos_list_staff.
-- Avoids PostgREST table grants (resort_agents is service_role-only).

CREATE OR REPLACE FUNCTION public.hotelos_list_agents(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor public.employees%ROWTYPE;
BEGIN
  actor := public._hotelos_employee_from_token(p_token);
  IF actor.id IS NULL OR actor.role IS NULL OR actor.role NOT IN ('MANAGER', 'OPS_MANAGER') THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  RETURN jsonb_build_object(
    'agents', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'name', a.name,
          'phone', a.phone,
          'commission_rate', COALESCE(a.commission_rate, 0),
          'is_active', a.is_active IS DISTINCT FROM false,
          'staff_id', CASE
            WHEN a.email LIKE 'staff:%' THEN substr(a.email, 7)
            ELSE NULL
          END,
          'kind', CASE
            WHEN a.email LIKE 'staff:%' THEN 'staff'
            ELSE 'sales'
          END
        )
        ORDER BY a.name
      )
      FROM public.resort_agents a
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hotelos_list_agents(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hotelos_list_agents(text) TO anon, authenticated, service_role;
