-- Event bump so Express can push the D1 calendar replica without exposing Postgres.

CREATE TABLE IF NOT EXISTS public.hotelos_calendar_dirty (
  id integer PRIMARY KEY DEFAULT 1,
  bumped_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.hotelos_calendar_dirty (id, bumped_at)
VALUES (1, now())
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bump_hotelos_calendar_dirty()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.hotelos_calendar_dirty (id, bumped_at)
  VALUES (1, now())
  ON CONFLICT (id) DO UPDATE SET bumped_at = now();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS hotelos_bookings_calendar_dirty ON public.hotelos_bookings;
CREATE TRIGGER hotelos_bookings_calendar_dirty
AFTER INSERT OR UPDATE OR DELETE ON public.hotelos_bookings
FOR EACH STATEMENT
EXECUTE FUNCTION public.bump_hotelos_calendar_dirty();

ALTER TABLE public.resort_agents
  ADD COLUMN IF NOT EXISTS pin_edge_hash text;

GRANT SELECT ON public.hotelos_calendar_dirty TO anon, authenticated, service_role;
ALTER TABLE public.hotelos_calendar_dirty ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hotelos_calendar_dirty_read ON public.hotelos_calendar_dirty;
CREATE POLICY hotelos_calendar_dirty_read ON public.hotelos_calendar_dirty
  FOR SELECT TO anon, authenticated, service_role
  USING (true);
